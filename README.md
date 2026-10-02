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

Before the first start, copy `.env.example` to `.env` and set `OWNER_EMAIL`
and `OWNER_PASSWORD`: that account owns the default workspace. Anyone else
creates their own account from the sign-in screen.

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
- **Accounts and workspaces** — anyone can sign up (turn it off with
  `ALLOW_SIGNUP=false`); each new business gets its own private workspace,
  starting from the `config/` data, and is its owner. Owners invite their
  team from the **Team** page: it makes a one-time link (valid 7 days) to
  send by WhatsApp or email, since the app doesn't send email yet. Each
  account belongs to one workspace; members can use everything except
  managing the team. Passwords are changed on the **Account** page.
- **The default workspace** holds the data from before sign-up existed. Its
  owner is created from `OWNER_EMAIL` / `OWNER_PASSWORD` on first start;
  `RESET_OWNER_PASSWORD=yes` restores that password if it is lost.
- **Limits** — ten failed sign-ins from one address lock it out for 15
  minutes; five sign-ups per address per hour. There is no "forgot
  password" email yet: an owner can remove and re-invite a team member.
  The embedded demo build has no server and no sign-in.
- **Database** — Supabase (hosted Postgres) when `DATABASE_URL` is set in
  `.env`; otherwise a local SQLite file in `data/`. Either way it is created
  and seeded from `config/` on first boot. `npm run db:reset` clears it
  (for Supabase it asks you to type `RESET` first).

## Connecting Supabase

1. Create a project at supabase.com. Pick the **South Asia (Mumbai)**
   region and save the database password it asks you for.
2. In the project, click **Connect** → **Session pooler** and copy the URI.
3. In `.env`, paste it after `DATABASE_URL=` and replace `[YOUR-PASSWORD]`
   (brackets included) with your password.
4. Recommended: **Project Settings → Database → SSL Configuration →
   Download certificate**, save it in the project folder as
   `supabase-ca.crt`, set `DATABASE_CA_CERT=./supabase-ca.crt`, and turn on
   **Enforce SSL** on the same page.
5. `npm start`. The server creates its tables and loads your `config/`
   data automatically; if it can't connect it says why and how to fix it.

The tables live in a schema called `marketbing` (pick it from the schema
menu in Supabase's Table Editor). It is deliberately not the `public`
schema, which Supabase publishes through its public REST API.

End-to-end tests (need a built client and the server running; they sign
in with the server's owner account):

```bash
export MB_EMAIL=you@example.com MB_PASSWORD=your-owner-password
node e2e/smoke.mjs [path-to-chromium]         # every flow, desktop size
node e2e/accounts.mjs [path-to-chromium]      # sign-up, invite, join, remove, password
node e2e/mobile-width.mjs [path-to-chromium]  # every screen fits a phone (WIDTH=360 by default)
npx tsx e2e/backButton.test.ts                # Android back button order
```

## Android app

The app opens the live site (`https://marketbing.onrender.com`, or
`ANDROID_SITE_URL`). The site and the app are one product: every deploy to
Render reaches the app the next time it opens, whether it adds a screen or
an API integration, with no new app build and no reinstall. The app adds
what a phone needs on top: its own icon and splash screen, the back button
stepping back through screens (`src/backButton.ts`), and an offline page
with a retry button.

**Getting the APK.** GitHub builds it (`.github/workflows/android.yml`)
whenever the app shell changes (`android/`, `capacitor.config.ts`), or on
demand: GitHub → **Actions** → **Android app** → **Run workflow**. Builds
of the default branch are published as the **android-latest** release:
open it on your phone, tap `marketbing.apk` and allow the install. Newer
builds install over older ones. Ordinary site changes don't need a new APK.

**Google Play.** Change `appId` in `capacitor.config.ts` first (it can't
change after the first upload). Create an upload key once:

```bash
keytool -genkeypair -keystore upload.keystore -alias upload -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 upload.keystore   # copy the output
```

and add GitHub secrets (Settings → Secrets and variables → Actions):
`ANDROID_KEYSTORE_BASE64` (that output), `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS` (`upload`) and `ANDROID_KEY_PASSWORD`. The next build
also produces a signed `.aab` to upload to the Play Console. Keep the
keystore file safe and out of the repository; losing it means you can't
update the app.

Working on the shell locally (needs Android Studio): `npm run build:android`
then `npm run android`. `node scripts/android-images.mjs` regenerates the
icon and splash images from the logo.

## Adding integrations (Meta, Claude, email, payments)

Integrations belong on the server, never in the browser or the app:

1. Put the key in `.env` (locally) and in Render's Environment page; the
   slots are already in `.env.example`. Keys never go in `src/`, where
   anyone could read them from the site or the app.
2. Call the service from the server: replace the stand-in it is meant for
   (`shared/planner.ts` for Claude, `shared/seed.ts` for social and sales
   metrics, the wallet trades for payments) and expose results through
   `server/index.ts` routes, which are already per-workspace and signed in.
3. Show it in `src/`. Deploy, and the site and the app both have it.

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
  store.ts       Async DataStore interface + MemoryStore
  seed.ts        Deterministic seed generator for a fresh workspace

server/          Express API
  index.ts       REST routes: /api/auth/*, /api/team/*, /api/planner/*, /api/runs/*,
                 /api/marketplace/* — each request scoped to the user's workspace
  auth.ts        Accounts, workspaces, invites: scrypt password hashes, hashed
                 session and invite tokens (Bearer header), attempt limits
  pgStore.ts / sqliteStore.ts / jsonStore.ts
                 Storage for every workspace; every query filters by workspace
  db/            Connection (SSL, friendly errors), versioned SQL
                 migrations applied on boot, and the reset command

src/             React 18 + TypeScript + Tailwind 4 web client
  api/           ApiClient interface; HTTP implementation + embedded
                 implementation (same shared services in-browser with
                 localStorage, used for the hosted demo: VITE_EMBEDDED=1)
  modules/planning/     Module 1 UI (objective → context → plans → run)
  modules/marketplace/  Module 2 UI (list, detail, compare, trade modal)
  auth/          Sign-in screen and session gate
  backButton.ts  Android back button: closes the top dialog/page/section

android/         Capacitor Android app shell (see "Android app")
```

Design decisions worth knowing:

- **One service layer, two runtimes.** Every business rule lives in
  `shared/services.ts` against the `DataStore` interface, so the API server
  (SQLite) and the hosted demo (in-browser memory + localStorage) run
  byte-identical logic.
- **Transactional money movement.** Trades and approvals run in a database
  transaction that locks the wallet (or run) row, so simultaneous clicks
  can never overspend the wallet.
- **Time-derived execution.** A run's step statuses are computed from
  timestamps, durations, dependencies and recorded approval decisions —
  the server holds no timers and survives restarts mid-run.
- **Integration seams.** The planner, the campaign/social metrics feeds and
  the payment rails are deliberately isolated: `planner.ts` stands in for an
  LLM service, `seed.ts` stands in for social/commerce integrations, and
  wallet trades stand in for real financial operations. Replacing any of
  them does not touch UI or service code.

## Current limits (v1)

- Two roles only (owner, member); one workspace per account; no password
  reset by email.
- Influencer/campaign metrics come from the deterministic seed generator,
  not live social APIs; money movement is ledger-only.
- The executor simulates step completion by duration; real integrations
  would report completion events into the same engine.
