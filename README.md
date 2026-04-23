# CW Cycle Count

Internal inventory cycle count tool for CoreWeave data center operations (EMEA + US).

Built as a proof of concept to demonstrate operational gaps in NetSuite's cycle count module and prototype what a purpose-built ICS counting tool should look like.

## Current Status

**POC v2.0** — Frontend complete, deployed to GitHub Pages, localStorage backend. Ready for stakeholder demo.

### What the tool proves

- NetSuite requires **55 separate count records** for 20 EU sites because of the legal entity/subsidiary structure. This tool: 1 session per physical site, entity mapping handled in the background.
- NetSuite is single-user per count and desktop-only. This tool supports **collaborative sessions** where multiple technicians claim and count sections simultaneously.
- **Blind count mode** hides expected quantities from the counter, with the manager seeing live variance data. Discrepancies get caught while people are still on the floor.
- NetSuite has no concept of physical sublocations within a site, no operational metrics (count duration, accuracy trends, variance patterns), and no mobile-optimized UX for technicians on the floor.
- The tool does **not replace NetSuite** as the system of record. It exports variance data formatted for NetSuite adjustment import. Approval workflows, inventory balance updates, and audit trails remain in NS.

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5173/cw-cycle-count-v2/`

## Deploy

Push to `main` — the GitHub Action in `.github/workflows/deploy.yml` builds and deploys automatically to GitHub Pages.

## Project Structure

```
src/
├── assets/              # CoreWeave logo
├── components/          # NavBar, Badge, StatCard, Toast, ProtectedRoute,
│                        # ScanBar, SectionNav, CountTable, FlagModal,
│                        # ReportModal, ImportModal, ErrorBoundary
├── constants/           # All app-wide constants (statuses, bins, roles, thresholds)
├── context/             # AuthContext, AppContext
├── data/                # sites.json, skus.json, sessions/example.json
├── hooks/               # useSession, useInventory, useAnalytics, useCountItems
├── pages/               # Home, Overview, SiteDetail, SessionStart, CountSession,
│                        # Analytics, History, SKUMaster, Profile, Login
├── services/            # dataService (localStorage), authService (Google OAuth),
│                        # reportService (xlsx generation), importService (CSV parsing)
└── styles/              # index.css (full design system)
```

## Architecture

### Data Layer

All data access goes through `dataService.js`. This is the single abstraction layer — to migrate to a real backend (CWDB PostgreSQL, Supabase, etc.), replace the functions in this file. No component changes needed. The exported interface stays the same.

Currently uses `localStorage` with seed data from `src/data/`. The seed data includes 14 sites (EMEA + US), 9 SKU types, and 1 example approved session.

### Auth

Google OAuth via `@react-oauth/google`. Currently in bypass mode (`BYPASS_AUTH = true` in `authService.js`). Three mock users available for demo:

- **J. Bakker** (Manager) — can approve sessions, see all data
- **A. Smith** (ICS) — inventory control specialist, counts and flags
- **M. Jones** (ICS) — second technician for recount-by-different-person flow

To enable real auth: set `VITE_GOOGLE_CLIENT_ID` in `.env` or GitHub Secrets, then set `BYPASS_AUTH = false`. Only `@coreweave.com` accounts are allowed.

### Count Session Lifecycle

```
Session created (open/scheduled)
  → Technician claims section
    → Counts items (scan or manual entry, Enter to confirm)
      → Variances detected automatically
        → Flag discrepancies (reason code + JIRA ticket + notes)
  → Submit for review (pending_review)
    → Manager reviews flags and variance details
      → Approve → session accuracy calculated, inventory reconciled
```

### Count Types

| Type | Bins included | Use case |
|------|--------------|----------|
| Quick | Stored only | Fast daily check |
| Standard | Stored + In Process + Spares | Weekly cadence |
| Full | All bins (incl. RMA, Scrap) | Monthly audit, wall-to-wall |
| Custom | User-selected bins | Ad-hoc targeted counts |

### Count Modes

- **Visible** — expected quantities shown during count. Faster, good for routine checks.
- **Blind** — expected quantities hidden. Counter enters quantities independently. Recommended for audits and W2W.

### NetSuite Integration

The tool parses NetSuite inventory balance CSV exports via the Import wizard. The import service handles:

- Location-to-site mapping (entity consolidation across subsidiaries)
- Bin normalization (NetSuite's inconsistent bin naming → canonical bins)
- Spares location decomposition (spares locations with site codes as bins)
- 3PL/warehouse location classification
- Auto-detection of import type (balance vs. serial number registry)

## Version History

### v2.0 (current — April 2026)

Full rebuild from scratch with proper React architecture.

- CoreWeave branding throughout (CW Blue #3D5AFE design system)
- Home/landing page separate from site overview
- Region-based site grouping (EMEA / US with sub-regions)
- 4 count types (Quick, Standard, Full, Custom) with bin picker
- Blind + Visible count modes
- Collaborative sessions with section claiming and locking
- Session scheduling with due dates on site overview
- Duration tracking (start → completion in minutes)
- Scan bar (CWPN barcode or NetSuite ID lookup)
- Auto-save with debounce (2s delay)
- Variance flagging (7 reason codes, JIRA ticket reference, notes)
- Enter-to-confirm counting flow (type freely, Enter to lock, Recount to unlock)
- Excel report generation (session report, variance report, site performance report)
- NetSuite CSV import wizard with location/bin normalization
- Serial number import (auto-detected from CSV headers)
- Analytics (accuracy trends, site comparison, variance frequency, type distribution)
- 3 mock users for role-based demo
- ErrorBoundary, Toast notifications
- GitHub Actions CI/CD to GitHub Pages
- localStorage persistence (dataService abstraction for future backend swap)

### v1.0 (early April 2026)

Initial React + Vite app. Basic session flow with static data. Used GitHub API for persistence (had 404 errors). Single-user, no collaborative features, no bin-based counting.

### v0 (pre-project)

Single-page HTML mockup/demo. Proof of concept layout only.

## Key Stakeholders

| Person | Role | Involvement |
|--------|------|-------------|
| Mitchell Marvin | SOX Compliance | Reviewing controls, audit trail, separation of duties |
| Lionel Hochart | Global Logistics Manager | POC demo target, keen to trial |
| Rhys | ICS Manager (EMEA) | Project champion, daily alignment |
| Dan Goudey | Process Lead | Wall-to-wall count process rewrite alignment |

## Backend Migration Path

The planned production backend is **CWDB PostgreSQL** (CoreWeave's internal managed database service). Migration steps:

1. Request a small CWDB PostgreSQL cluster from `#data-platforms` Slack channel (Sandbox environment)
2. Create the database schema (18-table design already documented)
3. Replace function implementations in `dataService.js` with PostgreSQL queries
4. No component, hook, or page changes needed — the abstraction layer handles everything

### Why CWDB over alternatives

- CoreWeave's own infrastructure (no external vendor dependency)
- PostgreSQL handles concurrent writes from multiple technicians cleanly
- Supports the relational data model (sessions, items, sites linked together)
- Single-instance sufficient for internal tool, three-replica available for production resilience

## SOX Compliance Notes

The tool maintains NetSuite as the system of record. Key compliance points:

- **Separation of duties**: Counter cannot see expected quantities in blind mode, cannot approve their own counts. Manager approval required.
- **Audit trail**: Every count entry, edit, flag, and approval timestamped with user ID. Full history preserved.
- **Inventory balance updates**: The tool exports variance data for NetSuite adjustment import. Actual balance changes happen in NS, not in the tool.
- **Data retention**: All session data persisted with full history. 7-year retention achievable with CWDB backend.

## SOP Gap Analysis

This tool addresses gaps identified across three SOPs:

**Cycle Count SOP**: Legal entity fragmentation (55 counts for 20 sites), no mobile UX, no collaborative counting, no operational metrics, no sublocation tracking.

**Common theme**: ICS technicians are the human integration layer between systems that don't talk to each other. The architecture decisions (originally designed by PwC) prioritize financial reporting over operational efficiency.
