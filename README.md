# Marketbing — AI Marketing Operations Platform

An AI-powered end-to-end marketing management platform. The core idea:

> The business owner manages the **objective** and the **approvals** —
> the system manages the marketing **operations**.

Two modules are live; the third appears in navigation as Coming Soon:

1. **Automatic Planning & Execution** — describe an objective, provide only
   the context relevant to it, compare three AI-generated execution plans,
   and watch the platform run the workflow autonomously, pausing at human
   approval checkpoints (POs, go-live, sends).
2. **Influencer Marketplace** — a stock-screener view of your influencer
   roster: amount invested, campaign stats, ROI with a 12-week trend,
   overall rating, and Invest/Divest actions backed by a wallet and
   transaction ledger. Drill into any influencer, scope the analysis to a
   product (or Overall), and work through Tasks, Payments, Alerts and
   Posts tabs — or compare up to three influencers side by side.
3. **Finance, Sales & Products** — Coming Soon (wallet operations, credit
   limits, sales tracking, product insights).

## Running it

```bash
npm install
npm run dev        # API server (:8787, tsx watch) + Vite dev server together
# or separately: npm run dev:api / npm run dev:web

npm run build      # type-check client + server, build the web client
npm start          # serve API + built client on http://localhost:8787
```

## Configuration (no coding needed)

- **`config/` folder** — the workspace's editable data: `products.json`,
  `influencers.json` and `workspace.json`, documented field by field in
  [`config/README.md`](config/README.md). Edit → `npm run db:reset` →
  restart, and the app rebuilds from your files. Mistakes don't crash
  cryptically: the server refuses to start and prints the file name and
  entry number of every problem.
- **`.env` file** — API keys and server settings. Copy `.env.example` to
  `.env` and fill in values; `.env` is gitignored so secrets never reach
  the repository. Integration keys (Claude API, Meta/Instagram, email,
  payments) already have labelled slots for when those integrations land.
- **`data/` folder** — the SQLite database (`marketbing.db`), created and
  seeded from `config/` on first boot. `npm run db:reset` clears it.

End-to-end smoke test (needs a built client and the server running):

```bash
node e2e/smoke.mjs [path-to-chromium]
```

## Architecture

```
shared/          Domain layer — shared by server and browser
  types.ts       All entities (plans, workflow steps, runs, influencers,
                 campaigns, positions, wallet, alerts, …)
  planner.ts     Deterministic planning service — the seam where an
                 LLM-backed planner plugs in
  engine.ts      Execution engine: run state is a pure function of
                 (run record, approvals, now) — no schedulers, restart-safe
  services.ts    All business rules (marketplace maths, ratings, trades
                 with validation, run lifecycle) over the DataStore interface
  store.ts       DataStore interface + MemoryStore
  seed.ts        Deterministic seed generator for a fresh workspace

server/          Express API
  index.ts       REST routes: /api/planner/*, /api/runs/*, /api/marketplace/*
  sqliteStore.ts SQLite (better-sqlite3) DataStore; JSON-doc tables for
                 catalog data, columns for hot scalars; seeds on first boot

src/             React 18 + TypeScript + Tailwind 4 web client
  api/           ApiClient interface; HTTP implementation + embedded
                 implementation (same shared services in-browser with
                 localStorage, used for the hosted demo: VITE_EMBEDDED=1)
  modules/planning/     Module 1 UI (objective → context → plans → run)
  modules/marketplace/  Module 2 UI (list, detail, compare, trade modal)
```

Design decisions worth knowing:

- **One service layer, two runtimes.** Every business rule lives in
  `shared/services.ts` against the `DataStore` interface, so the API server
  (SQLite) and the hosted demo (in-browser memory + localStorage) run
  byte-identical logic.
- **Time-derived execution.** A run's step statuses are computed from
  timestamps, durations, dependencies and recorded approval decisions —
  the server holds no timers and survives restarts mid-run.
- **Integration seams.** The planner, the campaign/social metrics feeds and
  the payment rails are deliberately isolated: `planner.ts` stands in for an
  LLM service, `seed.ts` stands in for social/commerce integrations, and
  wallet trades stand in for real financial operations. Replacing any of
  them does not touch UI or service code.

## Current limits (v1)

- Single-tenant, no authentication — add auth before exposing publicly.
- Influencer/campaign metrics come from the deterministic seed generator,
  not live social APIs; money movement is ledger-only.
- The executor simulates step completion by duration; real integrations
  would report completion events into the same engine.
