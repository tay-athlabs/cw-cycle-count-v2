# CW Cycle Count

Internal inventory cycle count tool for CoreWeave DC operations (EMEA + US).

## What's New (v2.0)

- **CoreWeave branding** — official logo throughout, CW Blue (`#3D5AFE`) accent color
- **Home / Landing page** — separate from overview, shows quick stats and recent sessions
- **Region-based overview** — sites grouped by EMEA / US, then by sub-region
- **Custom count types** — choose specific bins, categories, or SKUs to count
- **Session scheduling** — set a start date; scheduled counts show with due dates on site overview
- **Duration tracking** — every session records start time → completion time in minutes
- **Local data layer** — no more GitHub API calls; data persisted to localStorage (no 404 errors)
- **Bin-based sections** — replaced legacy daily/excess/critical with actual NetSuite bins (Stored, In Process, Spares, RMA_Pending, etc.)
- **Google Auth ready** — flip `BYPASS_AUTH = false` in `src/services/authService.js` when your `VITE_GOOGLE_CLIENT_ID` is set

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5173/cw-cycle-count/`

## Deploy to GitHub Pages

Push to `main` — the GitHub Action in `.github/workflows/deploy.yml` builds and deploys automatically.

## Project Structure

```
src/
├── assets/          # CoreWeave logo
├── components/      # NavBar, Badge, StatCard, Toast, ProtectedRoute
├── context/         # AuthContext, AppContext
├── data/            # sites.json, skus.json, sessions/
├── hooks/           # useSession, useInventory, useAnalytics
├── pages/           # Home, Overview, SiteDetail, SessionStart, CountSession, Analytics, History, SKUMaster
├── services/        # dataService (local JSON), authService (Google OAuth)
└── styles/          # index.css
```

## Auth

Set `VITE_GOOGLE_CLIENT_ID` in `.env` or GitHub Secrets, then set `BYPASS_AUTH = false` in `src/services/authService.js`. Only `@coreweave.com` accounts are allowed.

## Backend Migration Path

`dataService.js` is the single abstraction layer. To migrate to CWDB/Supabase, replace the functions in that file — keep the same exported interface. No component changes needed.

## Key Stakeholders

- **Mitchell Marvin** — SOX compliance review
- **Lionel Hochart** — Global Logistics Manager (POC demo target)
- **Rhys + Dan** — wall-to-wall process alignment
