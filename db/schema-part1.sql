-- =============================================================================
-- CW CYCLE COUNT — DATABASE SCHEMA
-- =============================================================================
-- Target: PostgreSQL 14+ (Canvas nextjs-express-pgsql template)
-- Companion doc: schema-notes.md (design decisions, SOX rationale, sync model)
--
-- This file is split into two parts during drafting:
--   PART 1 (this file): extensions, enums, master-data extension tables,
--                       NetSuite mapping tables, users.
--   PART 2 (next file): operational tables — sessions, sections, lines,
--                       serial captures, sync events, audit log.
--
-- Final delivery will concatenate both into a single schema.sql.
-- =============================================================================


-- =============================================================================
-- 1. EXTENSIONS
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;        -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;          -- case-insensitive text (emails)
CREATE EXTENSION IF NOT EXISTS pg_trgm;         -- fuzzy search on names/SKUs


-- =============================================================================
-- 2. ENUM TYPES
-- =============================================================================
-- Using PostgreSQL native enums rather than CHECK constraints because:
--   (a) they're indexable,
--   (b) ALTER TYPE ... ADD VALUE is straightforward when statuses evolve,
--   (c) the application-layer constants in src/constants/index.js map 1:1.
--
-- If a value needs to be removed later, that requires a migration — but in
-- practice we only ever add states, we don't remove them.
-- =============================================================================

-- User roles (mirrors src/constants/index.js ROLES + authService.js)
CREATE TYPE user_role AS ENUM (
  'ics',          -- inventory control specialist
  'manager',      -- can approve sessions
  'admin',        -- can manage users and config
  'superuser'     -- full access; for emergencies and platform operations
);

-- Session lifecycle (mirrors SESSION_STATUS in src/constants/index.js)
CREATE TYPE session_status AS ENUM (
  'scheduled',        -- created with a future scheduledDate
  'open',             -- ready to be claimed/counted
  'in_progress',      -- at least one section has been claimed
  'pending_review',   -- submitted by counter(s), awaiting manager approval
  'approved',         -- approved by manager; variances ready for export
  'rejected'          -- manager sent it back for re-count
);

-- Section lifecycle (mirrors SECTION_STATUS)
CREATE TYPE section_status AS ENUM (
  'open',
  'in_progress',
  'completed',
  'approved'
);

-- Item lifecycle (mirrors ITEM_STATUS) — line-level state during a count
CREATE TYPE item_status AS ENUM (
  'pending',                  -- not yet counted
  'matched',                  -- counted and matches expected
  'variance',                 -- counted, doesn't match expected
  'quarantine',               -- flagged with reason code, pending investigation
  'recount_pending',          -- recount requested, awaiting counter
  'recount_in_progress',      -- recount being performed
  'escalated'                 -- max recounts reached, manager intervention needed
);

-- Count modes (mirrors COUNT_MODE)
CREATE TYPE count_mode AS ENUM (
  'visible',      -- counter sees expected quantities
  'blind'         -- counter does not see expected; manager sees live variance
);

-- Count types (mirrors COUNT_TYPE)
CREATE TYPE count_type AS ENUM (
  'quick',          -- Stored only
  'standard',       -- Stored + In Process + Spares
  'full',           -- All bins including RMA and Scrap
  'custom',         -- User-selected bins
  'wall_to_wall'    -- All bins, blind enforced, mandatory recount on variance
);

-- Variance flag reason codes (the 7 codes in FlagModal)
CREATE TYPE flag_reason AS ENUM (
  'recount_confirmed',     -- variance reproduced after recount
  'damaged_defective',     -- physical condition issue
  'missing',               -- expected, not found
  'found_extra',           -- present, not expected
  'wrong_location',        -- found in different bin/site
  'pending_transaction',   -- in-flight NS transaction explains variance
  'pending_investigation'  -- needs follow-up, no other code applies
);

-- Push lifecycle for variances flowing back to NetSuite.
-- For v1 (manual CSV push), most variances will move:
--   approved -> queued_for_export -> exported
-- For v2 (API push), the full lifecycle becomes meaningful:
--   approved -> queued_for_push -> pushing -> pushed -> confirmed
-- We design for v2 from day one; v1 only uses a subset of these states.
CREATE TYPE push_status AS ENUM (
  'not_required',          -- matched item, no push needed
  'queued_for_export',     -- ready for manual CSV export (v1 default)
  'exported',              -- included in a generated NS adjustment file
  'queued_for_push',       -- queued for automated API push (v2)
  'pushing',               -- API call in flight (v2)
  'pushed',                -- accepted by NS, transaction ID recorded (v2)
  'confirmed',             -- next pull verified the balance change applied
  'failed',                -- push rejected by NS or errored
  'rejected'               -- manager rejected the push after review
);

-- Direction of a sync event with the data lake / NetSuite
CREATE TYPE sync_direction AS ENUM (
  'pull',          -- read from data lake (StarRocks)
  'push_export',   -- generate adjustment file for manual NS import
  'push_api'       -- direct API call to NS (v2)
);

-- Outcome of a sync event
CREATE TYPE sync_status AS ENUM (
  'started',
  'success',
  'partial',       -- some records succeeded, some failed
  'failed'
);

-- Audit log action codes — kept as an enum for index-friendliness.
-- Add values via ALTER TYPE when new actions are introduced.
CREATE TYPE audit_action AS ENUM (
  'session_created',
  'session_claimed',
  'section_claimed',
  'section_unclaimed',
  'item_counted',
  'variance_detected',
  'item_flagged',
  'recount_requested',
  'recount_submitted',
  'item_escalated',
  'escalation_resolved',
  'session_submitted',
  'session_approved',
  'session_rejected',
  'session_completed',
  'snapshot_pulled',
  'variance_exported',
  'variance_pushed',
  'role_changed',
  'sessions_cleared',
  'store_reset',
  'imported_sites_cleared',
  'import_started',
  'import_completed',
  'login',
  'logout'
);


-- =============================================================================
-- 3. USERS
-- =============================================================================
-- One row per @coreweave.com user that has interacted with the tool.
-- UNION/Canvas handles authentication; this table holds tool-specific state
-- (role, last seen, deactivation flag).
-- =============================================================================

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           CITEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  role            user_role NOT NULL DEFAULT 'ics',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  -- UNION/Canvas-provided identity hints (populated from request headers)
  union_subject   TEXT,         -- stable user ID from UNION
  picture_url     TEXT,
  -- Lifecycle
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT users_email_domain_chk
    CHECK (email LIKE '%@coreweave.com')
);

CREATE INDEX users_role_idx ON users(role) WHERE is_active;
CREATE INDEX users_last_seen_idx ON users(last_seen_at DESC);

COMMENT ON TABLE users IS
  'Tool-specific user state. Identity is delegated to UNION; this table holds role and activity. Email is citext (case-insensitive).';
COMMENT ON COLUMN users.union_subject IS
  'Stable user identifier from UNION auth headers. May be null for legacy rows imported from the demo mock-user list.';


-- =============================================================================
-- 4. NETSUITE REFERENCE LAYER
-- =============================================================================
-- These tables are *extension* tables, not master data. The master data
-- (subsidiaries, locations, bins, items, inventory balances) lives in the
-- StarRocks data lake under the staging_netsuite schema.
--
-- These tables hold:
--   (a) the NetSuite internal ID we use to JOIN back to the data lake,
--   (b) tool-specific columns the data lake doesn't carry
--       (canonical site code, region grouping, custom classifications),
--   (c) our internal UUIDs that the operational tables foreign-key to.
--
-- Why not just reference NS internal IDs directly from operational tables?
-- Two reasons:
--   - The data lake's IDs are bigints; using them as PKs in our schema
--     makes joins tighter but ties our schema to NS's ID space forever.
--   - We need stable references for tool-only entities (e.g. a custom
--     bin classification) that don't exist in NS.
-- So we use our own UUIDs, with NS internal IDs as indexed foreign-key-style
-- references into the data lake.
-- =============================================================================

-- ── 4.1 SUBSIDIARIES ─────────────────────────────────────────────────────────
-- One row per NetSuite subsidiary (legal entity).
-- Source: staging_netsuite.subsidiary
CREATE TABLE ns_subsidiaries (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  netsuite_internal_id     BIGINT NOT NULL UNIQUE,        -- subsidiary.id in data lake
  netsuite_external_id     TEXT,                          -- subsidiary.externalid
  name                     TEXT NOT NULL,
  country                  TEXT,                          -- ISO-2 country code
  is_active                BOOLEAN NOT NULL DEFAULT TRUE,
  -- Sync metadata
  last_synced_at           TIMESTAMPTZ,
  -- Bookkeeping
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ns_subsidiaries_country_idx ON ns_subsidiaries(country) WHERE is_active;

COMMENT ON TABLE ns_subsidiaries IS
  'Mirror of NetSuite subsidiaries. The legal-entity fragmentation problem (55 NS records for 20 sites) is consolidated via site_subsidiary_mappings.';

-- ── 4.2 SITES ────────────────────────────────────────────────────────────────
-- A *physical* data center site. This is the canonical entity from the user's
-- perspective. Each site maps to one or more NS subsidiary+location pairs
-- via site_subsidiary_mappings.
CREATE TABLE sites (
  id              TEXT PRIMARY KEY,                       -- e.g. 'NO-OVO01' (canonical site code)
  name            TEXT NOT NULL,                          -- e.g. 'Oslo Site 1'
  city            TEXT,
  country         TEXT NOT NULL,                          -- ISO-2
  region          TEXT NOT NULL,                          -- 'EMEA' | 'US' | other
  sub_region      TEXT,                                   -- 'Nordics' | 'UK' | etc.
  timezone        TEXT,                                   -- IANA tz, e.g. 'Europe/Oslo'
  is_spares_only  BOOLEAN NOT NULL DEFAULT FALSE,         -- 3PL/spares warehouse, not a DC
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  -- Sync metadata
  last_synced_at  TIMESTAMPTZ,
  -- Bookkeeping
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX sites_region_idx ON sites(region, sub_region) WHERE is_active;

COMMENT ON TABLE sites IS
  'Canonical physical sites. Site IDs (e.g. NO-OVO01) are stable, human-readable, and used in URLs. The mapping to NS legal entities lives in site_subsidiary_mappings.';
COMMENT ON COLUMN sites.id IS
  'Canonical site code. Example: NO-OVO01 = Norway, Oslo, site 1. Used as PK because it appears in URLs, session IDs, and is human-meaningful.';

-- ── 4.3 SITE-SUBSIDIARY MAPPINGS ─────────────────────────────────────────────
-- Resolves the legal-entity fragmentation problem.
-- A single site can appear under multiple subsidiaries in NetSuite, with
-- different NS location IDs per subsidiary. This table stores all of those
-- relationships so a "site count" can transparently aggregate across them.
CREATE TABLE site_subsidiary_mappings (
  id                                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id                           TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  subsidiary_id                     UUID NOT NULL REFERENCES ns_subsidiaries(id) ON DELETE RESTRICT,
  netsuite_location_internal_id     BIGINT NOT NULL,       -- location.id in data lake
  netsuite_location_name            TEXT,                  -- denormalized for debugging
  is_primary                        BOOLEAN NOT NULL DEFAULT FALSE,
  notes                             TEXT,
  created_at                        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(site_id, subsidiary_id, netsuite_location_internal_id)
);

CREATE INDEX site_sub_map_site_idx ON site_subsidiary_mappings(site_id);
CREATE INDEX site_sub_map_ns_loc_idx ON site_subsidiary_mappings(netsuite_location_internal_id);

COMMENT ON TABLE site_subsidiary_mappings IS
  'Many-to-many mapping between physical sites and NS subsidiary/location pairs. Solves the "55 count records for 20 sites" problem by letting one session aggregate across all NS locations for a site.';
COMMENT ON COLUMN site_subsidiary_mappings.is_primary IS
  'Marks the canonical NS location for variance pushback when a single target is needed. Exactly one mapping per site should be primary; enforced at app layer because partial unique indexes on booleans are awkward.';

-- ── 4.4 BINS ─────────────────────────────────────────────────────────────────
-- The canonical bin types we recognize. Bin names in NetSuite are inconsistent
-- across locations; this table is the normalized form. The mapping from raw
-- NS bin names to canonical bin codes lives in bin_netsuite_mappings.
CREATE TABLE bins (
  id              TEXT PRIMARY KEY,                       -- e.g. 'Stored', 'In Process', 'Spares'
  label           TEXT NOT NULL,                          -- display label
  description     TEXT,
  is_countable    BOOLEAN NOT NULL DEFAULT TRUE,          -- false for status-only bins (e.g. Quarantine)
  is_default      BOOLEAN NOT NULL DEFAULT FALSE,         -- include in 'standard' counts
  sort_order      INT NOT NULL DEFAULT 100,
  -- Operational classification
  is_status_bin   BOOLEAN NOT NULL DEFAULT FALSE,         -- bin represents asset status (RMA, Scrap)
                                                          -- vs physical location (Stored, Spares)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE bins IS
  'Canonical bin types. NetSuite bin names are normalized into these. The is_status_bin column flags the bins-as-status-conflation issue identified in the SOP analyses.';

-- ── 4.5 SITE-BIN ASSOCIATIONS ────────────────────────────────────────────────
-- Which bins exist at which sites. Not every site has every bin.
CREATE TABLE site_bins (
  site_id         TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  bin_id          TEXT NOT NULL REFERENCES bins(id) ON DELETE RESTRICT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (site_id, bin_id)
);

CREATE INDEX site_bins_bin_idx ON site_bins(bin_id) WHERE is_active;

-- ── 4.6 BIN NETSUITE MAPPINGS ────────────────────────────────────────────────
-- Per-location-and-subsidiary mapping from raw NS bin names to canonical bins.
-- This is the data form of the bin normalization rules currently in
-- src/services/importService.js. Stored as data so:
--   (a) auditors can point at a row instead of code,
--   (b) new mappings don't require a code deploy,
--   (c) the app can be defensive when a new bin appears in NS.
CREATE TABLE bin_netsuite_mappings (
  id                                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bin_id                            TEXT NOT NULL REFERENCES bins(id) ON DELETE RESTRICT,
  netsuite_bin_internal_id          BIGINT,                -- bin.id in data lake (preferred)
  netsuite_bin_name                 TEXT NOT NULL,         -- raw NS bin name (fallback match)
  netsuite_location_internal_id     BIGINT,                -- scope: which NS location
  notes                             TEXT,
  created_at                        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Either the internal ID or the name+location combo must uniquely identify
  -- the source bin. We allow both because data lake refresh patterns can
  -- create rows with names but not yet IDs.
  CONSTRAINT bin_ns_map_identifier_chk
    CHECK (netsuite_bin_internal_id IS NOT NULL OR netsuite_bin_name IS NOT NULL)
);

CREATE INDEX bin_ns_map_ns_id_idx
  ON bin_netsuite_mappings(netsuite_bin_internal_id)
  WHERE netsuite_bin_internal_id IS NOT NULL;
CREATE INDEX bin_ns_map_ns_name_idx
  ON bin_netsuite_mappings(netsuite_bin_name, netsuite_location_internal_id);

-- ── 4.7 SUBLOCATIONS ─────────────────────────────────────────────────────────
-- Physical sub-areas within a site (Row A, Cage 2, Mezzanine, etc.).
-- NS has no concept of these; this is a tool-only addition.
-- Editable per site.
CREATE TABLE sublocations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  sort_order      INT NOT NULL DEFAULT 100,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID REFERENCES users(id),

  UNIQUE(site_id, name)
);

CREATE INDEX sublocations_site_idx ON sublocations(site_id) WHERE is_active;

COMMENT ON TABLE sublocations IS
  'Physical navigation aids within a site. Tool-only, not in NetSuite. ICS technicians can tag where they found items, building location intelligence over time.';

-- ── 4.8 ITEMS (SKUs) ─────────────────────────────────────────────────────────
-- Tool-side item registry. Master data lives in staging_netsuite.item.
-- We store our own UUID and a CWPN (CoreWeave Part Number) as the stable
-- business key. NetSuite internal IDs go in item_netsuite_mappings — designed
-- as a join table even though SKUs are global today, so per-subsidiary IDs
-- (if they ever exist) cost zero migration.
CREATE TABLE items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cwpn              TEXT NOT NULL UNIQUE,                 -- CoreWeave Part Number (business key)
  netsuite_name     TEXT,                                 -- denormalized for display
  description       TEXT,
  category          TEXT,                                 -- e.g. 'Cable', 'GPU', 'Network'
  is_serialized     BOOLEAN NOT NULL DEFAULT FALSE,
  unit_of_measure   TEXT DEFAULT 'EA',
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  -- Sync metadata
  last_synced_at    TIMESTAMPTZ,
  -- Bookkeeping
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX items_category_idx ON items(category) WHERE is_active;
CREATE INDEX items_cwpn_trgm_idx ON items USING gin (cwpn gin_trgm_ops);
CREATE INDEX items_serialized_idx ON items(is_serialized) WHERE is_active AND is_serialized;

COMMENT ON TABLE items IS
  'Tool-side SKU registry keyed on CWPN. NS internal IDs live in item_netsuite_mappings (join table by design — costs nothing for v1, supports per-subsidiary IDs later if needed).';

-- ── 4.9 ITEM NETSUITE MAPPINGS ───────────────────────────────────────────────
-- Designed as a join table even though SKUs are currently global at CoreWeave.
-- If a SKU ever varies by subsidiary in NS, this table absorbs it without
-- schema changes.
CREATE TABLE item_netsuite_mappings (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id                         UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  netsuite_item_internal_id       BIGINT NOT NULL,
  subsidiary_id                   UUID REFERENCES ns_subsidiaries(id) ON DELETE RESTRICT,
                                                          -- NULL = global mapping (the v1 default)
  is_primary                      BOOLEAN NOT NULL DEFAULT FALSE,
  notes                           TEXT,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(netsuite_item_internal_id, subsidiary_id)
);

CREATE INDEX item_ns_map_item_idx ON item_netsuite_mappings(item_id);
CREATE INDEX item_ns_map_ns_id_idx ON item_netsuite_mappings(netsuite_item_internal_id);

COMMENT ON TABLE item_netsuite_mappings IS
  'NS internal ID(s) for an item. subsidiary_id is nullable — NULL means a global mapping that applies to any subsidiary, which is the v1 default at CoreWeave.';


-- =============================================================================
-- 5. INVENTORY SNAPSHOTS
-- =============================================================================
-- Every count session is based on a specific view of NS inventory balance at
-- a specific point in time. Without a snapshot reference, you can't tell the
-- difference between "the balance changed in NS while we were counting" and
-- "we miscounted." This is critical for the variance-pushback path:
--
-- The naive flow:
--   1. Tech starts count at 9am based on yesterday's pull.
--   2. Someone adjusts NS at 10am (unrelated transaction).
--   3. Count is approved at 11am.
--   4. We push variance against a balance that already moved.
--   5. Push results in a discrepancy nobody can reconcile.
--
-- The correct flow:
--   1. Session creation captures the snapshot it's based on.
--   2. The expected_qty in count_lines comes from that snapshot.
--   3. At push time, we re-pull and compare. If the balance moved, we surface
--      it for manager review instead of blindly pushing.
--
-- Snapshots are lightweight: they record what was queried and when, not the
-- full data. The actual quantities at count_line.expected_qty are denormalized
-- from the snapshot at session creation time. This trades a small amount of
-- storage for query simplicity and historical fidelity.
-- =============================================================================

CREATE TABLE inventory_snapshots (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id             TEXT NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  -- Snapshot scope
  bin_ids             TEXT[] NOT NULL,                    -- which bins were queried
  -- Source metadata
  source              TEXT NOT NULL DEFAULT 'starrocks',  -- 'starrocks' | 'csv_import' | 'manual'
  source_query        TEXT,                               -- the SQL run, for traceability
  source_lake_table   TEXT,                               -- e.g. 'staging_netsuite.inventoryitemlocation'
  source_csv_filename TEXT,                               -- for csv_import source
  -- Counts (denormalized for fast UI reads)
  total_items         INT NOT NULL DEFAULT 0,
  total_quantity      BIGINT NOT NULL DEFAULT 0,
  -- Lifecycle
  pulled_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- when the snapshot was captured
  pulled_by           UUID REFERENCES users(id),
  -- The data lake's own update timestamp at the time of the pull, if known.
  -- Helps answer "was the lake itself stale when we pulled?"
  lake_freshness_at   TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX inv_snap_site_idx ON inventory_snapshots(site_id, pulled_at DESC);
CREATE INDEX inv_snap_pulled_idx ON inventory_snapshots(pulled_at DESC);

COMMENT ON TABLE inventory_snapshots IS
  'A point-in-time view of NS inventory balance for a site. Every count session references the snapshot it was based on. For v1 (CSV imports), one snapshot per import. For v2 (StarRocks), one snapshot per session creation.';

-- ── 5.1 SNAPSHOT LINE ITEMS ──────────────────────────────────────────────────
-- The actual rows captured at snapshot time, keyed by item+bin within the
-- site. This is what populates the count_lines.expected_qty when a session
-- starts.
CREATE TABLE inventory_snapshot_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id     UUID NOT NULL REFERENCES inventory_snapshots(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  bin_id          TEXT NOT NULL REFERENCES bins(id) ON DELETE RESTRICT,
  -- The NS subsidiary/location combo this row came from. Critical for pushback:
  -- variances are pushed back to the same NS location they were pulled from.
  subsidiary_id   UUID REFERENCES ns_subsidiaries(id),
  netsuite_location_internal_id   BIGINT,
  expected_qty    INT NOT NULL,
  -- For serialized items, the count of distinct serials at snapshot time.
  -- Always equals expected_qty for non-serialized items.
  serial_count    INT,

  UNIQUE(snapshot_id, item_id, bin_id, subsidiary_id, netsuite_location_internal_id)
);

CREATE INDEX inv_snap_lines_snap_idx ON inventory_snapshot_lines(snapshot_id);
CREATE INDEX inv_snap_lines_item_idx ON inventory_snapshot_lines(item_id);

COMMENT ON TABLE inventory_snapshot_lines IS
  'The line-level data captured in a snapshot. One row per item+bin+NS-location combination. Multiple rows per item+bin are expected when a site spans multiple NS subsidiaries.';


-- =============================================================================
-- END OF PART 1
-- =============================================================================
-- Next part covers:
--   - count_sessions
--   - count_sections
--   - count_lines
--   - serial_captures
--   - flag_records
--   - recount_rounds
--   - escalations
--   - netsuite_sync_events
--   - audit_log
--   - views and helper functions
-- =============================================================================
