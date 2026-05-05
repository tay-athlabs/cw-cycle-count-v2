# CW Cycle Count — Database Schema Notes

**Companion to:** `db/schema-part1.sql`, `db/schema-part2.sql`, `db/schema-patch-001-site-types.sql`
**Audience:** project stakeholders (Rhys, Lionel, Mitchell, Dan), future engineers picking up the project, future Claude Code sessions reading this as context.
**Last updated:** May 2026

---

## Why this document exists

The schema is ~1,200 lines of SQL. SQL is precise but it doesn't explain *why* a decision was made — it only shows what was decided. This document is the prose record of the design choices, the trade-offs, and the rationale that auditors (Mitchell), operations (Rhys, Lionel), and engineers will want to understand without having to reverse-engineer it from `CREATE TABLE` statements.

Read it once before reading the schema. It will save time.

---

## What the schema is for

A cycle count tool for CoreWeave data center inventory operations. The tool sits in front of NetSuite as the operational layer for ICS (Inventory Control Specialist) technicians. NetSuite stays the system of record for inventory balances and financial reporting; the tool handles counting workflows, variance detection, recount lifecycles, and the export of variance adjustments back to NetSuite.

The schema models four things:

1. **Reference data from NetSuite** — sites, bins, items, subsidiaries. We keep extension tables that point at the data lake's NetSuite IDs rather than duplicating master data.
2. **Operational data the tool generates** — count sessions, sections, lines, serial captures, flags, recounts, escalations.
3. **Sync state** — every interaction with the data lake or NetSuite, plus the snapshot a count was based on, plus the lifecycle of a variance pushback.
4. **Audit trail** — every meaningful user action, append-only, denormalized so it survives data deletions.

---

## The big architectural choices

### 1. Reference tables, not master data tables

The earlier (April 15) design treated sites, bins, items, and subsidiaries as master data we owned. That made sense before we had access to the data lake. After confirming UNION's `staging_netsuite` schema gives us readable, refreshed mirrors of all of those entities, the right architecture is to *reference* the data lake rather than duplicate it.

In practice this means:

- `sites` carries the canonical site code (`NO-OVO01`), tool-specific columns (region grouping, custom classifications, ICM/ICS assignments), and a `last_synced_at` timestamp.
- `ns_subsidiaries` and `site_subsidiary_mappings` carry the legal-entity consolidation logic — the thing that solves the "55 NS count records for 20 sites" problem. The actual subsidiary master data is in `staging_netsuite.subsidiary` in the data lake; we hold the IDs and our own UUIDs.
- `bins` is a small controlled vocabulary (Stored, In Process, Spares, RMA_Pending, Quarantine, Scrap, Receiving). The mapping from raw NetSuite bin names to canonical bins lives in `bin_netsuite_mappings` as data, not as JavaScript code.
- `items` carries CWPN (the business key) and tool-specific fields. NS internal IDs live in `item_netsuite_mappings`, designed as a join table even though SKUs are global today, so per-subsidiary IDs cost nothing to add later.

**Why this matters for SOX:** every reference to NetSuite is traceable to a row, not buried in code. Mitchell can ask "how does NO-OVO01.Stored map back to NetSuite?" and we can show him `site_subsidiary_mappings.netsuite_location_internal_id` joined to `bin_netsuite_mappings.netsuite_bin_internal_id`. No code reading required.

### 2. Inventory snapshots as first-class entities

A count is taken against a specific view of NetSuite balances at a specific moment in time. Without that pinning, you can't tell the difference between "we counted wrong" and "the balance moved while we were counting."

The naive flow that breaks:

1. ICS tech starts a count at 9am based on yesterday's data.
2. Someone unrelated adjusts NetSuite at 10am.
3. Count is approved at 11am.
4. We push the variance against a balance that's already moved.
5. The push fails or, worse, succeeds and creates a phantom discrepancy.

The schema fixes this by making `inventory_snapshots` a real table. Every session's `count_lines.expected_qty` comes from the snapshot, not from a live data lake query. At push time, we re-pull and compare against the original snapshot — if the balance moved, the manager sees it explicitly instead of pushing blind.

The cost of this design is one snapshot row plus N snapshot-line rows per session. The benefit is that every count is reproducible and every variance is traceable to a specific NS state.

### 3. Sync state designed for v1 *and* v2

Two integration shapes are realistic:

- **v1: read-only pull from the StarRocks data lake, manual CSV push back to NetSuite.** The data lake is read-only by design. Variances flow back via NS's standard adjustment-import file format — a manager generates the file, imports it manually into NS, and confirms in the tool that the import landed.
- **v2: read-only pull from StarRocks, automated push via NetSuite REST API or SuiteScript RESTlet.** Same read path; the push side becomes API-based with retries, transaction IDs, and confirmation pulls.

The schema supports both with a single `variance_pushes` table. The `push_status` enum has nine values that span both lifecycles. v1 only uses a subset (`queued_for_export`, `exported`, `confirmed`, `failed`, `not_required`); v2 fills in the rest (`queued_for_push`, `pushing`, `pushed`, `rejected`).

This matters because it means we can ship v1, prove the loop works, and add v2 later without a schema migration. The columns sit unused in v1 and become meaningful when API access is sorted with whoever owns NetSuite at CoreWeave (Jubin).

### 4. Append-only audit log

The `audit_log` table records every meaningful user action with a reference to the affected entity (session, section, line, item) plus a JSONB `details` blob for action-specific context. Three deliberate choices:

- **User identity is denormalized** (`user_email`, `user_name` are columns alongside `user_id`). If a user is deleted later, the audit trail survives — you still see who did what, even if the foreign key goes null.
- **The action column is an enum** rather than free-text. This means you can list all action types directly from the type definition, indexes are fast, and typos at write time are impossible.
- **The table is meant to be append-only.** No UPDATE, no DELETE. In production we'll revoke those permissions at the database role level so the application physically cannot tamper with audit history.

For SOX, this gives us: who did what, when, against which entity, with what context — for the full retention period. Combined with `netsuite_sync_events` (for system actions), we have the full traceability story.

### 5. The blind-count separation-of-duties control

Blind counting only works if the counter genuinely doesn't see the expected quantity. The UI hides it during the count, but there was a gap: what if a tech navigates to a different page and looks up the inventory balance for the same site they're about to count?

The fix is in `session_participants.balance_view_locked`. When a tech joins a blind session, this column is set to `true`. The API checks it on every inventory-balance read and hides expected quantities for any site where the user is currently locked. The lock clears when the session is submitted.

This is a real separation-of-duties control. It's simple, it's auditable, it's defensible to SOX, and it removes the "role permission bandaid" we considered earlier (where we'd just block the import button by role — which doesn't actually solve the problem because inventory balance views are everywhere in the app).

---

## How the data flows

### Creating a count session

1. User picks a site and count type in the UI.
2. App generates a snapshot: queries StarRocks for the relevant `staging_netsuite` tables (item, location, bin, inventoryitemlocation, etc.), filtered by the site's NS subsidiary/location IDs from `site_subsidiary_mappings`. This produces an `inventory_snapshots` row plus N `inventory_snapshot_lines`.
3. App creates a `count_sessions` row referencing the snapshot, with status `open`.
4. App creates `count_sections` rows, one per bin in the count type's bin set.
5. App creates `count_lines` rows by copying from `inventory_snapshot_lines`, denormalizing `expected_qty` onto each line.

### Counting

1. Tech claims a section: `count_sections.claimed_by` is set, status moves to `in_progress`.
2. For each line, tech enters a counted quantity. The `variance` column auto-computes (it's a `GENERATED ALWAYS AS (counted_qty - expected_qty) STORED` column).
3. If the line is for a serialized item, scans go into `serial_captures`; the line's `counted_qty` must equal the count of captures.
4. Variances are flagged if the tech wants to record context: `flag_records` row with reason code, optional JIRA ticket, free-text notes.
5. Recounts create rows in `recount_rounds`. The 3-round protocol Lionel asked for is enforced at the application layer (round 3+ requires a different `counted_by` than the previous round).

### Submitting and approving

1. Tech submits the section (or, in solo mode, the whole session). Status moves to `pending_review`.
2. Manager reviews the session, sees flags, sees variances, sees the audit trail.
3. Manager approves: `count_sessions.status` becomes `approved`, `approved_by` and `approved_at` are filled, and `total_*` denormalized counts are computed.
4. Each `count_lines` row with a non-zero variance gets a `variance_pushes` row in `queued_for_export` status.

### Pushing variances back to NetSuite

For v1 (manual CSV):

1. Manager opens "Variances ready to export" view.
2. App generates a NetSuite-formatted adjustment CSV file with all `queued_for_export` variances.
3. `variance_pushes.export_filename`, `export_generated_at`, `export_generated_by` are filled. Status moves to `exported`.
4. Manager imports the CSV into NetSuite manually.
5. Manager confirms the import landed in the tool. Status moves to `confirmed`. `export_confirmed_in_ns_at` and `export_confirmed_by` are filled.
6. Optionally, the next data lake pull confirms the balance change is reflected in NS — `confirmation_pulled_at` and `confirmation_snapshot_id` are filled.

For v2 (API push), the same table tracks the API request/response cycle through `pushing` → `pushed` → `confirmed`. Same data shape, different path.

---

## What's deliberately not in the schema (yet)

Three things came up in the design conversation that I chose not to model in v1, with reasons.

### Count plans (the W2W planning layer)

The Q2 W2W planning spreadsheet shows a clear pre-count artifact: who's responsible, when's the window, how many people, what's the priority value, what are the dependencies. Today this lives in a spreadsheet maintained by hand.

This is a known future addition. `db/schema-patch-001-site-types.sql` includes a commented-out `count_plans` table sketch. When we add it (probably v1.1 or v1.2), it attaches via a nullable `plan_id` column on `count_sessions`. Adding it later is mechanical.

The reason it's not in v1: scope discipline. We're shipping a cycle count tool, not an inventory operations management platform. Counting is the immediate pain. Planning can come once counting works.

### Sublocations

The schema includes a `sublocations` table because the earlier design had it and the cost of leaving it in is zero. But the application layer currently doesn't use it, and there's no UI for sublocation management. v1 ships without sublocation features. The table is there for when someone builds them.

### Real-time NetSuite sync

`netsuite_sync_events` and `inventory_snapshots` are designed for both scheduled-pull and on-demand-pull modes. v1 will run on-demand: when you create a session, we pull right then. Scheduled refreshes (e.g. nightly snapshots of all active sites) can be added without schema changes — they just generate more snapshot rows.

Worth noting: the data lake itself has its own refresh cadence (likely nightly via Fivetran). Our pull is a query against an already-refreshed mirror, not a live NetSuite call. So even our "fresh" data is at most as fresh as the data lake.

---

## SOX compliance summary

For Mitchell, here's the controls map:

| SOX concern | How the schema addresses it |
|---|---|
| **Separation of duties — counter cannot self-approve** | `count_sessions.approved_by` must be different from `count_sessions.created_by`. Enforced at app layer (CHECK constraints can't reference other rows). |
| **Separation of duties — counter cannot see expected quantities in blind mode** | `session_participants.balance_view_locked = true` blocks balance views for the participant's locked sites for the duration of the session. |
| **Separation of duties — round 3 recount must be different tech** | Enforced at app layer against `recount_rounds.counted_by` history. |
| **Audit trail — who did what** | `audit_log` with denormalized user identity. Append-only by design. |
| **Audit trail — system actions** | `netsuite_sync_events` for every pull, push, and export. |
| **Data retention** | All tables retain history. No cascade deletes for audit-relevant data (sessions, lines, flags, recounts, escalations). 7-year retention achievable on Canvas-managed Postgres. |
| **System of record** | NetSuite remains the inventory balance system of record. The tool exports variance adjustments via NS's standard import format. Actual balance updates happen in NS, not in the tool. |
| **Reproducibility** | Every count references the snapshot it was based on. Every variance push records the snapshot it was generated against and (eventually) the snapshot that confirmed the balance change. |
| **Reviewability** | Every NS reference (subsidiary, location, bin, item) is a row in a mapping table, not code. Auditors can point at the data. |

---

## Migration path from the current `dataService.js`

The current code uses `localStorage` with a flat structure: `sessions[]` with nested `sections{}` containing `items[]`. The migration is mechanical — we don't change the function signatures, only the implementations.

Mapping is roughly:

| `dataService.js` function | Schema operation |
|---|---|
| `getStore() / saveStore()` | Direct Postgres queries via the API layer; no monolithic store. |
| `generateSessionId(siteId)` | Stays in app code; becomes the `count_sessions.id` value. |
| `getSessions()` | `SELECT * FROM v_active_sessions ORDER BY created_at DESC` (plus history view for completed). |
| `getSessionById(id)` | `SELECT` from `count_sessions` joined with sections, lines, flags, recounts. Returns the same nested structure the UI expects. |
| `createSession()` | INSERT snapshot, then session, then sections, then lines copied from snapshot. Wrapped in a transaction. |
| `claimSection()` | UPDATE `count_sections` setting `claimed_by`, `claimed_at`, status. |
| `updateSectionItems()` | UPSERT `count_lines` for the section. |
| `requestRecount()` | Insert into `recount_rounds`. |
| `flagItem()` | Insert into `flag_records`; deactivate any prior active flag for the same line. |
| `submitForReview() / approveSession() / rejectSession()` | UPDATE `count_sessions.status` plus the appropriate user/timestamp columns. |
| `getSerialRegistry()` | Query joining `serial_captures` to `count_lines` and aggregating. |
| `importSerialRegistry()` | INSERT into a future `serial_master` table (not in v1; for v1, serials are captured per count). |
| `getAuditLog()` | `SELECT FROM audit_log` with the existing filters. |
| `logAudit()` | INSERT into `audit_log`. |
| `applyImport()` | Generates a snapshot from a CSV file (source = 'csv_import'); rows go into `inventory_snapshot_lines`. |

The existing function signatures stay. Components don't change. This is exactly what the abstraction layer was designed to make possible.

---

## Open questions that affect the schema

These are things we can't decide on our own; flagging for stakeholder confirmation.

1. **Variance threshold for mandatory recount.** Today the app has a default threshold. Does Mitchell or Lionel want this configurable per site? Per count type? If yes, it becomes a row in a config table.
2. **Maximum recount rounds.** Default is 3 (matching Lionel's request). Should W2W differ from monthly?
3. **Whether sessions can be re-opened after approval.** Currently no; once approved, immutable. Mitchell's input.
4. **How long after a session is created can it be cancelled.** Currently no time limit; the app supports cancellation as a status. Mitchell's input on whether cancelled sessions need a reason code or sign-off.
5. **What happens to unflagged variances at session approval.** Currently they're approved as-is and pushed back. Some teams require all variances to be flagged before approval. Lionel's call.

None of these block the schema. They affect default values and validation logic.

---

## Schema files

- `db/schema-part1.sql` — extensions, enums, master-data extension tables, NetSuite mapping tables, users, inventory snapshots.
- `db/schema-part2.sql` — operational tables, sync events, audit log, views, helper functions, seeded bin types.
- `db/schema-patch-001-site-types.sql` — adds `site_type` and `site_category` columns to sites; documents the future `count_plans` table.
- `db/schema-notes.md` — this document.

Final delivery for the Canvas migration will concatenate part 1 + part 2 + patch 001 into a single `schema.sql` applied as the initial migration.
