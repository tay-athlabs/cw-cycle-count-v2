-- =============================================================================
-- CW CYCLE COUNT — DATABASE SCHEMA (PART 2)
-- =============================================================================
-- Operational layer. Builds on part 1 (extensions, enums, master data).
-- Final delivery concatenates part 1 + part 2 into a single schema.sql.
-- =============================================================================


-- =============================================================================
-- 6. COUNT SESSIONS
-- =============================================================================
-- A session is one cycle count event at one site. It has a lifecycle
-- (scheduled -> open -> in_progress -> pending_review -> approved/rejected).
-- It references the inventory snapshot it's based on, which is what gives
-- count_lines their expected_qty.
-- =============================================================================

CREATE TABLE count_sessions (
  -- Use TEXT primary key with the human-readable ID format the app already
  -- uses: CC-{site}-{yyyymmdd}-{seq}. Example: CC-NO-OVO01-20260504-001.
  -- Pre-existing format in src/services/dataService.js generateSessionId().
  id                  TEXT PRIMARY KEY,
  site_id             TEXT NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  snapshot_id         UUID NOT NULL REFERENCES inventory_snapshots(id) ON DELETE RESTRICT,
  -- Configuration
  type                count_type NOT NULL,
  mode                count_mode NOT NULL,
  collaborative       BOOLEAN NOT NULL DEFAULT FALSE,
  -- For collaborative sessions, a 6-char join code other techs use to join.
  -- Generated at session creation; null for solo sessions.
  join_code           TEXT,
  -- Lifecycle
  status              session_status NOT NULL DEFAULT 'open',
  -- Scheduling
  scheduled_date      TIMESTAMPTZ,
  -- Authorship
  created_by          UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Execution
  started_at          TIMESTAMPTZ,                        -- first section claim
  completed_at        TIMESTAMPTZ,                        -- submitted for review
  approved_at         TIMESTAMPTZ,
  approved_by         UUID REFERENCES users(id),
  rejected_at         TIMESTAMPTZ,
  rejected_by         UUID REFERENCES users(id),
  rejection_reason    TEXT,
  -- Computed metrics (denormalized for fast reads in dashboards)
  -- These are kept in sync by application logic, not triggers — explicit
  -- writes are easier to reason about than implicit ones for SOX-relevant data.
  duration_minutes    INT,                                -- started_at -> completed_at
  accuracy_pct        NUMERIC(5,2),                       -- matched / total counted
  total_items         INT NOT NULL DEFAULT 0,
  total_matched       INT NOT NULL DEFAULT 0,
  total_variances     INT NOT NULL DEFAULT 0,
  total_flagged       INT NOT NULL DEFAULT 0,
  total_escalated     INT NOT NULL DEFAULT 0,
  -- Free-text
  notes               TEXT,
  -- Bookkeeping
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Wall-to-wall enforces blind mode and mandatory recount on variance.
  CONSTRAINT cs_w2w_blind_chk
    CHECK (type <> 'wall_to_wall' OR mode = 'blind'),
  -- Approved sessions need an approver and timestamp.
  CONSTRAINT cs_approval_chk
    CHECK (status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  -- Same separation-of-duties rule for rejection.
  CONSTRAINT cs_rejection_chk
    CHECK (status <> 'rejected' OR (rejected_by IS NOT NULL AND rejected_at IS NOT NULL))
);

CREATE INDEX cs_site_idx ON count_sessions(site_id, created_at DESC);
CREATE INDEX cs_status_idx ON count_sessions(status) WHERE status NOT IN ('approved', 'rejected');
CREATE INDEX cs_created_by_idx ON count_sessions(created_by);
CREATE INDEX cs_scheduled_idx ON count_sessions(scheduled_date) WHERE status = 'scheduled';
CREATE INDEX cs_join_code_idx ON count_sessions(join_code) WHERE join_code IS NOT NULL;

COMMENT ON TABLE count_sessions IS
  'One cycle count at one site. Session ID format: CC-{site}-{yyyymmdd}-{seq}. References the snapshot that provides expected quantities.';
COMMENT ON COLUMN count_sessions.snapshot_id IS
  'The inventory snapshot this session is counting against. Required at session creation. The variance comparison happens against this snapshot, not against the live data lake state.';
COMMENT ON COLUMN count_sessions.duration_minutes IS
  'Duration from first section claim to submission. Updated by app logic at completed_at write time. Denormalized for dashboard reads.';

-- ── 6.1 SESSION PARTICIPANTS ─────────────────────────────────────────────────
-- For collaborative sessions, all techs who claimed at least one section.
-- For solo sessions, just the one tech.
-- This is also where we enforce the blind-count separation-of-duties rule:
-- a participant in a blind session cannot view inventory balances for that
-- site while the session is active.
CREATE TABLE session_participants (
  session_id          TEXT NOT NULL REFERENCES count_sessions(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  joined_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- For blind sessions: while this participant is active in this session,
  -- the app blocks them from viewing balance pages for this site. This
  -- column is what the app reads to enforce that rule.
  balance_view_locked BOOLEAN NOT NULL DEFAULT FALSE,

  PRIMARY KEY (session_id, user_id)
);

CREATE INDEX sp_user_active_idx ON session_participants(user_id) WHERE balance_view_locked;

COMMENT ON TABLE session_participants IS
  'Tracks which users participate in each session. Also enforces the blind-count separation of duties: balance_view_locked tells the app to hide balance pages for this user while the session is live.';


-- =============================================================================
-- 7. COUNT SECTIONS
-- =============================================================================
-- A section is one bin within a session. The collaborative model is
-- "claim a section to count it" — once claimed, only the claiming tech (or
-- a recount tech) can edit it.
-- =============================================================================

CREATE TABLE count_sections (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          TEXT NOT NULL REFERENCES count_sessions(id) ON DELETE CASCADE,
  bin_id              TEXT NOT NULL REFERENCES bins(id) ON DELETE RESTRICT,
  status              section_status NOT NULL DEFAULT 'open',
  -- Claiming
  claimed_by          UUID REFERENCES users(id),
  claimed_at          TIMESTAMPTZ,
  -- Completion
  completed_at        TIMESTAMPTZ,
  -- A section can be approved independently of the session as a whole, which
  -- supports partial approval workflows in the future. For v1, sections are
  -- approved when the parent session is approved.
  approved_at         TIMESTAMPTZ,
  approved_by         UUID REFERENCES users(id),
  -- Bookkeeping
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(session_id, bin_id)
);

CREATE INDEX cs2_session_idx ON count_sections(session_id);
CREATE INDEX cs2_claimed_by_idx ON count_sections(claimed_by) WHERE status IN ('open', 'in_progress');

COMMENT ON TABLE count_sections IS
  'One bin per session. Sections support the collaborative-claim model: multiple techs work the same session by each claiming different sections.';


-- =============================================================================
-- 8. COUNT LINES
-- =============================================================================
-- The actual counting happens here. One row per item-in-bin within a section.
-- expected_qty is denormalized from the snapshot at session start, NOT pulled
-- live during counting — this is what makes the count reproducible and what
-- protects against the "balance moved during count" race condition.
-- =============================================================================

CREATE TABLE count_lines (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id          UUID NOT NULL REFERENCES count_sections(id) ON DELETE CASCADE,
  item_id             UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  -- Quantities
  expected_qty        INT NOT NULL,                       -- from inventory_snapshot_lines
  counted_qty         INT,                                -- null until first count
  variance            INT GENERATED ALWAYS AS (
                         COALESCE(counted_qty, 0) - expected_qty
                      ) STORED,
  -- Status (mirrors item_status enum)
  status              item_status NOT NULL DEFAULT 'pending',
  -- Counting metadata
  counted_by          UUID REFERENCES users(id),
  counted_at          TIMESTAMPTZ,
  -- Recount tracking. Round 1 is the initial count. Round 2 is a same-tech
  -- recount. Round 3+ is a different-tech recount. The recount_rounds table
  -- holds the full history; this column is the current round.
  current_round       INT NOT NULL DEFAULT 1,
  -- For serialized items, counted_qty must equal the count of serial_captures
  -- rows for this line. Enforced at app layer because the constraint
  -- requires a subquery which CHECK doesn't support.
  -- Bookkeeping
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(section_id, item_id)
);

CREATE INDEX cl_section_idx ON count_lines(section_id);
CREATE INDEX cl_item_idx ON count_lines(item_id);
CREATE INDEX cl_status_idx ON count_lines(status) WHERE status <> 'matched';
CREATE INDEX cl_variance_idx ON count_lines(section_id, status) WHERE status = 'variance';

COMMENT ON TABLE count_lines IS
  'One line per item-in-bin per section. variance is a generated column — it''s computed from counted_qty - expected_qty automatically. expected_qty is denormalized from the snapshot at session start; this protects against balance changes during counting.';
COMMENT ON COLUMN count_lines.variance IS
  'Generated column: counted_qty - expected_qty. Always in sync with the actual quantities. NULL counted_qty becomes 0 for variance calculation, but the line stays in pending status until a real count.';


-- =============================================================================
-- 9. SERIAL CAPTURES
-- =============================================================================
-- For serialized items (is_serialized = true on items), the count happens
-- by scanning each serial number individually. This table stores those
-- scans.
-- =============================================================================

CREATE TABLE serial_captures (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  count_line_id       UUID NOT NULL REFERENCES count_lines(id) ON DELETE CASCADE,
  serial_number       TEXT NOT NULL,
  -- Was this serial expected at this bin per the snapshot?
  was_expected        BOOLEAN NOT NULL,
  -- Captured during this count. For "matched" serials this is the only record.
  -- For "discovered during count" serials (was_expected = false), this row
  -- is also the discovery record.
  captured_by         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  captured_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- For recount workflows: which round of the count produced this capture.
  count_round         INT NOT NULL DEFAULT 1,

  UNIQUE(count_line_id, serial_number)
);

CREATE INDEX sc_line_idx ON serial_captures(count_line_id);
CREATE INDEX sc_serial_idx ON serial_captures(serial_number);

COMMENT ON TABLE serial_captures IS
  'Scanned serial numbers during a count. For serialized items, a count_line is "complete" when serial_captures rows match the expected serial set from the snapshot.';


-- =============================================================================
-- 10. FLAG RECORDS
-- =============================================================================
-- When a counter or manager flags a variance with a reason code, JIRA ticket
-- reference, and notes — that's a flag record. Multiple flags are possible
-- per line if a flag is updated/superseded, though the app currently allows
-- only one active flag per line. We model it as a separate table for full
-- audit history.
-- =============================================================================

CREATE TABLE flag_records (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  count_line_id       UUID NOT NULL REFERENCES count_lines(id) ON DELETE CASCADE,
  reason              flag_reason NOT NULL,
  jira_ticket         TEXT,                               -- e.g. 'ICS-1234'
  notes               TEXT,
  flagged_by          UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  flagged_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Whether this flag is the currently-active one. Only one active per line.
  -- Enforced at the app layer with a "deactivate previous" pattern when a new
  -- flag is added. The full history stays in this table.
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  superseded_at       TIMESTAMPTZ,
  superseded_by_id    UUID REFERENCES flag_records(id)
);

CREATE INDEX fr_line_active_idx ON flag_records(count_line_id) WHERE is_active;
CREATE INDEX fr_jira_idx ON flag_records(jira_ticket) WHERE jira_ticket IS NOT NULL;

COMMENT ON TABLE flag_records IS
  'Variance flags with reason code, JIRA ref, and notes. is_active is the current flag; superseded flags stay for audit.';


-- =============================================================================
-- 11. RECOUNT ROUNDS
-- =============================================================================
-- Each time a recount is requested for a line, a row is added here.
-- Round 1 is the initial count (recorded for symmetry, even though it's
-- "not really a recount"). Round 2 is typically same-tech. Round 3+ is
-- different-tech. Lionel's specific request was 3-round support with the
-- last round done by a different person.
-- =============================================================================

CREATE TABLE recount_rounds (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  count_line_id       UUID NOT NULL REFERENCES count_lines(id) ON DELETE CASCADE,
  round_number        INT NOT NULL,
  counted_qty         INT NOT NULL,
  counted_by          UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  counted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- For round 3+, the rule is "different tech than previous round."
  -- Enforcement is at app layer because it requires looking at the previous
  -- round's counter, which CHECK can't do directly.
  notes               TEXT,

  UNIQUE(count_line_id, round_number)
);

CREATE INDEX rr_line_idx ON recount_rounds(count_line_id, round_number);

COMMENT ON TABLE recount_rounds IS
  'Per-round count history for a line. Round 1 = initial. Round 2 = first recount (typically same tech). Round 3+ = independent recount by a different tech.';


-- =============================================================================
-- 12. ESCALATIONS
-- =============================================================================
-- When a line still has a variance after the maximum recount rounds, it gets
-- escalated to a manager for resolution. The resolution might be: accept the
-- variance with a flag, push back to NS as-is, void the count and start over,
-- or quarantine pending investigation.
-- =============================================================================

CREATE TABLE escalations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  count_line_id       UUID NOT NULL REFERENCES count_lines(id) ON DELETE CASCADE,
  escalated_by        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  escalated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  escalation_reason   TEXT NOT NULL,
  -- Resolution
  resolved_by         UUID REFERENCES users(id),
  resolved_at         TIMESTAMPTZ,
  resolution          TEXT,                               -- free-text resolution description
  resolution_action   TEXT,                               -- 'accept_variance' | 'void_count' | 'quarantine' | 'investigate'

  CONSTRAINT esc_resolution_chk
    CHECK (
      (resolved_at IS NULL AND resolved_by IS NULL AND resolution IS NULL)
      OR
      (resolved_at IS NOT NULL AND resolved_by IS NOT NULL AND resolution IS NOT NULL)
    )
);

CREATE INDEX esc_line_idx ON escalations(count_line_id);
CREATE INDEX esc_unresolved_idx ON escalations(escalated_at DESC) WHERE resolved_at IS NULL;

COMMENT ON TABLE escalations IS
  'Lines that exceeded max recount rounds without converging. Manager intervention required.';


-- =============================================================================
-- 13. VARIANCE PUSH TRACKING
-- =============================================================================
-- The lifecycle of a variance flowing back to NetSuite. For v1 (manual CSV
-- adjustment import), this tracks: which export file the variance was
-- included in, when it was generated, and when the manager confirmed the
-- import landed in NS. For v2 (API push), it tracks the full request/response
-- cycle.
-- =============================================================================

CREATE TABLE variance_pushes (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  count_line_id                   UUID NOT NULL REFERENCES count_lines(id) ON DELETE RESTRICT,
  status                          push_status NOT NULL DEFAULT 'queued_for_export',
  -- Target NS coordinates (denormalized from the snapshot for traceability)
  target_subsidiary_id            UUID REFERENCES ns_subsidiaries(id),
  target_netsuite_location_id     BIGINT,
  -- Variance amounts at push time (snapshotted from count_lines.variance)
  variance_amount                 INT NOT NULL,
  -- v1: export file tracking
  export_filename                 TEXT,
  export_generated_at             TIMESTAMPTZ,
  export_generated_by             UUID REFERENCES users(id),
  export_confirmed_in_ns_at       TIMESTAMPTZ,
  export_confirmed_by             UUID REFERENCES users(id),
  -- v2: API push tracking (unused in v1)
  netsuite_transaction_id         TEXT,
  pushed_at                       TIMESTAMPTZ,
  pushed_by                       UUID REFERENCES users(id),
  netsuite_response               JSONB,
  -- Confirmation that the next pull saw the balance change
  confirmation_pulled_at          TIMESTAMPTZ,
  confirmation_snapshot_id        UUID REFERENCES inventory_snapshots(id),
  -- Failure / rejection
  failure_reason                  TEXT,
  failed_at                       TIMESTAMPTZ,
  -- Bookkeeping
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX vp_line_idx ON variance_pushes(count_line_id);
CREATE INDEX vp_status_idx ON variance_pushes(status) WHERE status NOT IN ('confirmed', 'rejected');
CREATE INDEX vp_export_file_idx ON variance_pushes(export_filename) WHERE export_filename IS NOT NULL;

COMMENT ON TABLE variance_pushes IS
  'Tracks each variance through the pushback lifecycle to NetSuite. v1 uses the export_* columns (manual CSV); v2 uses the netsuite_* columns (API push). Both share the confirmation_* columns for closing the loop.';


-- =============================================================================
-- 14. NETSUITE SYNC EVENTS
-- =============================================================================
-- A log of every interaction with the data lake or NetSuite — pulls, pushes,
-- exports. Required for SOX audit and operational debugging.
-- =============================================================================

CREATE TABLE netsuite_sync_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direction           sync_direction NOT NULL,
  status              sync_status NOT NULL DEFAULT 'started',
  -- What was the scope?
  entity_type         TEXT NOT NULL,                      -- 'inventory_balance' | 'items' | 'sites' | 'variances' | etc.
  site_id             TEXT REFERENCES sites(id),          -- nullable: bulk pulls span sites
  -- Cardinality
  record_count        INT,                                -- rows pulled or pushed
  success_count       INT,                                -- rows that succeeded (for partial)
  failure_count       INT,                                -- rows that failed (for partial)
  -- Linkage
  snapshot_id         UUID REFERENCES inventory_snapshots(id),  -- for pulls that produced a snapshot
  variance_push_ids   UUID[],                             -- for pushes that included specific variances
  -- Source/target detail
  source_query        TEXT,                               -- the SQL run for pulls
  target_endpoint     TEXT,                               -- the NS endpoint or file path for pushes
  -- Lifecycle
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ,
  duration_ms         INT,                                -- denormalized for quick stats
  triggered_by        UUID REFERENCES users(id),
  triggered_by_kind   TEXT NOT NULL DEFAULT 'manual',     -- 'manual' | 'scheduled' | 'session_start'
  -- Error detail
  error_message       TEXT,
  error_payload       JSONB
);

CREATE INDEX nse_started_idx ON netsuite_sync_events(started_at DESC);
CREATE INDEX nse_direction_status_idx ON netsuite_sync_events(direction, status);
CREATE INDEX nse_failed_idx ON netsuite_sync_events(started_at DESC) WHERE status = 'failed';
CREATE INDEX nse_site_idx ON netsuite_sync_events(site_id, started_at DESC) WHERE site_id IS NOT NULL;

COMMENT ON TABLE netsuite_sync_events IS
  'Every interaction with the data lake or NetSuite. Required for SOX audit. Records what was attempted, what succeeded, and what failed.';


-- =============================================================================
-- 15. AUDIT LOG
-- =============================================================================
-- Application-level audit trail. Every meaningful action a user takes that
-- affects state lands here. The current dataService.js logAudit() function
-- maps directly to inserts here.
--
-- For SOX, this table needs to be append-only. There's no UPDATE or DELETE
-- pattern in the application; we'd revoke those privileges at the database
-- role level in the production deployment.
-- =============================================================================

CREATE TABLE audit_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action              audit_action NOT NULL,
  -- Who did it
  user_id             UUID REFERENCES users(id),
  user_email          CITEXT,                             -- denormalized: survives user deletion
  user_name           TEXT,                               -- denormalized: survives user rename
  -- What it touched (all nullable; most actions only fill some)
  session_id          TEXT REFERENCES count_sessions(id) ON DELETE SET NULL,
  section_id          UUID REFERENCES count_sections(id) ON DELETE SET NULL,
  count_line_id       UUID REFERENCES count_lines(id) ON DELETE SET NULL,
  item_id             UUID REFERENCES items(id) ON DELETE SET NULL,
  cwpn                TEXT,                               -- denormalized for fast filtering
  site_id             TEXT REFERENCES sites(id) ON DELETE SET NULL,
  -- Free-form action detail. JSONB so we can index into it for specific actions
  -- (e.g. variance amounts, recount rounds, role changes).
  details             JSONB,
  -- When
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Optional: which sync event or push did this action belong to?
  sync_event_id       UUID REFERENCES netsuite_sync_events(id) ON DELETE SET NULL,
  push_id             UUID REFERENCES variance_pushes(id) ON DELETE SET NULL
);

CREATE INDEX al_action_idx ON audit_log(action, created_at DESC);
CREATE INDEX al_user_idx ON audit_log(user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX al_session_idx ON audit_log(session_id, created_at DESC) WHERE session_id IS NOT NULL;
CREATE INDEX al_cwpn_idx ON audit_log(cwpn, created_at DESC) WHERE cwpn IS NOT NULL;
CREATE INDEX al_created_idx ON audit_log(created_at DESC);
-- GIN index on JSONB lets us query into the details column efficiently
CREATE INDEX al_details_gin_idx ON audit_log USING gin(details);

COMMENT ON TABLE audit_log IS
  'Append-only audit trail. Every state-changing action a user takes is recorded. User identity is denormalized so the trail survives user deletions and renames. Required for SOX audit.';


-- =============================================================================
-- 16. VIEWS
-- =============================================================================
-- Convenience views that hide common joins. These are what the API layer
-- queries for the UI. Keeping the joins in views means the application code
-- doesn't have to repeat them in every endpoint.
-- =============================================================================

-- Active sessions with site name and creator name resolved
CREATE OR REPLACE VIEW v_active_sessions AS
SELECT
  cs.*,
  s.name AS site_name,
  s.region AS site_region,
  s.country AS site_country,
  u.name AS created_by_name,
  u.email AS created_by_email
FROM count_sessions cs
JOIN sites s ON s.id = cs.site_id
JOIN users u ON u.id = cs.created_by
WHERE cs.status NOT IN ('approved', 'rejected');

-- Count line detail with item, bin, and section context
CREATE OR REPLACE VIEW v_count_line_detail AS
SELECT
  cl.*,
  cs.session_id,
  cs.bin_id,
  i.cwpn,
  i.netsuite_name AS item_name,
  i.is_serialized,
  -- Currently active flag, if any
  fr.id AS active_flag_id,
  fr.reason AS active_flag_reason,
  fr.jira_ticket AS active_flag_jira,
  fr.notes AS active_flag_notes
FROM count_lines cl
JOIN count_sections cs ON cs.id = cl.section_id
JOIN items i ON i.id = cl.item_id
LEFT JOIN LATERAL (
  SELECT id, reason, jira_ticket, notes
  FROM flag_records
  WHERE count_line_id = cl.id AND is_active
  LIMIT 1
) fr ON TRUE;

-- Variances queued for export (the v1 push view)
CREATE OR REPLACE VIEW v_variances_for_export AS
SELECT
  vp.*,
  cl.expected_qty,
  cl.counted_qty,
  cl.variance,
  cs.session_id,
  cs.bin_id,
  i.cwpn,
  i.netsuite_name AS item_name,
  s.id AS site_id,
  s.name AS site_name
FROM variance_pushes vp
JOIN count_lines cl ON cl.id = vp.count_line_id
JOIN count_sections cs ON cs.id = cl.section_id
JOIN count_sessions sess ON sess.id = cs.session_id
JOIN sites s ON s.id = sess.site_id
JOIN items i ON i.id = cl.item_id
WHERE vp.status = 'queued_for_export';


-- =============================================================================
-- 17. HELPER FUNCTIONS
-- =============================================================================

-- Auto-touch updated_at on row updates. Apply to tables where it matters.
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_touch_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER sites_touch_updated_at
  BEFORE UPDATE ON sites
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER ns_subsidiaries_touch_updated_at
  BEFORE UPDATE ON ns_subsidiaries
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER items_touch_updated_at
  BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER count_sessions_touch_updated_at
  BEFORE UPDATE ON count_sessions
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER count_sections_touch_updated_at
  BEFORE UPDATE ON count_sections
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER count_lines_touch_updated_at
  BEFORE UPDATE ON count_lines
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER variance_pushes_touch_updated_at
  BEFORE UPDATE ON variance_pushes
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();


-- =============================================================================
-- 18. SEED — REQUIRED REFERENCE DATA
-- =============================================================================
-- Bin types are referenced by every session, so we seed them here. Other
-- reference data (sites, subsidiaries, items) is loaded from the data lake
-- via sync events.
-- =============================================================================

INSERT INTO bins (id, label, description, is_countable, is_default, is_status_bin, sort_order) VALUES
  ('Stored',         'Stored',          'Primary stocked inventory at the site',           TRUE,  TRUE,  FALSE, 10),
  ('In Process',     'In Process',      'Items currently being deployed or staged',        TRUE,  TRUE,  FALSE, 20),
  ('Spares',         'Spares',          'Critical spares held for emergency use',          TRUE,  TRUE,  FALSE, 30),
  ('RMA_Pending',    'RMA Pending',     'Items awaiting return-to-vendor processing',      TRUE,  FALSE, TRUE,  40),
  ('Quarantine',     'Quarantine',      'Items pending investigation or hold',             TRUE,  FALSE, TRUE,  50),
  ('Scrap',          'Scrap',           'Items marked for disposal',                       TRUE,  FALSE, TRUE,  60),
  ('Receiving',      'Receiving',       'Inbound inventory not yet put away',              TRUE,  FALSE, FALSE, 5)
ON CONFLICT (id) DO NOTHING;


-- =============================================================================
-- END OF SCHEMA
-- =============================================================================
