-- =============================================================================
-- CW CYCLE COUNT — SCHEMA PATCH 001
-- =============================================================================
-- Adds site_type and site_category columns to sites table, plus a count_plans
-- placeholder table commented out for future use.
--
-- Background: the Q2 W2W planning spreadsheet revealed that:
--   (a) sites are not all the same kind — DC, 1PL, 3PL, HUB, VMI, TPOP, Spares
--       are distinct types with different operational characteristics,
--   (b) sites have lifecycle categories — Active Build, Stable Site, Warehouse,
--       TPOP, Not Started — that drive whether they're counted, how often, and
--       by whom.
--
-- Apply this AFTER part 1 of the schema. It will fail if sites doesn't exist.
-- =============================================================================

-- ── New ENUM types ───────────────────────────────────────────────────────────

-- Site type — what kind of facility this is
CREATE TYPE site_type AS ENUM (
  'dc',            -- data center / data hall
  'fsl_1pl',       -- first-party logistics warehouse (CW-operated)
  'fsl_3pl',       -- third-party logistics warehouse (vendor-operated)
  'hub_3pl',       -- hub 3PL (e.g. Arvato Denton, Venlo)
  'vmi_3pl',       -- vendor-managed inventory (e.g. Myriad Newcastle)
  'tpop',          -- third-party points of presence (Equinix, Digital Realty)
  'spares'         -- spares-only warehouse (regional pool)
);

-- Site category — operational lifecycle stage
CREATE TYPE site_category AS ENUM (
  'active_build',  -- DC under construction / ramping inventory
  'stable_site',   -- DC in steady-state operation
  'warehouse',     -- 1PL, 3PL, HUB, VMI
  'tpop',          -- third-party point of presence
  'not_started',   -- planned but no inventory yet
  'spares'         -- spares warehouse
);

-- ── Apply to sites ───────────────────────────────────────────────────────────

ALTER TABLE sites
  ADD COLUMN site_type        site_type     NOT NULL DEFAULT 'dc',
  ADD COLUMN site_category    site_category NOT NULL DEFAULT 'stable_site',
  -- Operational responsibility — denormalized for fast reads in dashboards.
  -- Source of truth is the count plan (when we add it), but the "current
  -- ICM/ICS Lead" reference is useful at the site level.
  ADD COLUMN regional_icm_id  UUID          REFERENCES users(id),
  ADD COLUMN ics_lead_id      UUID          REFERENCES users(id);

-- The default 'dc'/'stable_site' is wrong for warehouse and TPOP sites; the
-- application layer must set these correctly when sites are seeded from the
-- data lake. Rationale: NOT NULL forces the value to be considered, the
-- defaults just keep the migration non-destructive.

CREATE INDEX sites_type_idx ON sites(site_type, site_category) WHERE is_active;
CREATE INDEX sites_icm_idx ON sites(regional_icm_id) WHERE is_active AND regional_icm_id IS NOT NULL;

COMMENT ON COLUMN sites.site_type IS
  'What kind of facility this is. Drives whether it appears in DC dashboards, warehouse views, or TPOP lists. From W2W planning sheet column "Site Type".';
COMMENT ON COLUMN sites.site_category IS
  'Operational lifecycle. Active builds need more frequent counts; stable sites are quarterly; warehouses follow their own cadence. From W2W planning sheet column "Site Category".';
COMMENT ON COLUMN sites.regional_icm_id IS
  'Current Regional ICM. May change over time; for historical assignments use audit_log or future count_plans table.';

-- The is_spares_only column from part 1 becomes redundant once site_type is
-- in place. We keep it for one transition cycle to avoid breaking existing
-- queries; mark it deprecated in the comment.
COMMENT ON COLUMN sites.is_spares_only IS
  'DEPRECATED — use site_type = ''spares''. Kept for backwards compatibility with the existing dataService.js code.';

-- =============================================================================
-- FUTURE TABLE: count_plans
-- =============================================================================
-- Not enabled yet. Documented here so the design intent is captured.
--
-- The W2W planning sheet shows a clear pre-count artifact: a plan that says
-- "we're going to count site X, in window Y to Z, with N people, expecting
-- M items, and these are the dependencies and risks." Today it lives in a
-- spreadsheet. A future addition would model it like this:
--
-- CREATE TABLE count_plans (
--   id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   site_id                     TEXT NOT NULL REFERENCES sites(id),
--   quarter                     TEXT NOT NULL,                  -- 'Q2-2026'
--   window_start                DATE,
--   window_end                  DATE,
--   plan_status                 TEXT NOT NULL DEFAULT 'planned', -- planned/confirmed/completed
--   accounting_rep              TEXT,
--   pwc_resource                TEXT,
--   priority_value_usd_millions NUMERIC(10,2),
--   accounting_disposition      TEXT,
--   regional_icm_id             UUID REFERENCES users(id),
--   ics_lead_id                 UUID REFERENCES users(id),
--   in_scope_products           TEXT[],
--   requires_full_shutdown      BOOLEAN,
--   shutdown_days               INT,
--   pl_3pl_support_required     BOOLEAN,
--   external_3pl_name           TEXT,
--   hc_ics                      INT,
--   hc_ops_support              INT,
--   hc_temp_labor               INT,
--   hc_finance_audit            INT,
--   hours_per_person            NUMERIC(6,2),
--   est_gpu_count               INT,
--   est_transceiver_count       INT,
--   est_switch_count            INT,
--   key_risks                   TEXT,
--   dependencies                TEXT[],
--   notes                       TEXT,
--   created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
--   created_by                  UUID REFERENCES users(id),
--   updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );
--
-- Once that exists, count_sessions gains a nullable plan_id so a session can
-- be linked to its plan. This closes the loop: plan -> session -> variance
-- export -> closeout, all in one tool.
-- =============================================================================
