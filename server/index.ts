import { ROOT, authFallbackFile, jsonFallbackFile } from "./env";
import express from "express";
import path from "node:path";
import fs from "node:fs";
import { SqliteStores } from "./sqliteStore";
import { PgStores } from "./pgStore";
import { JsonStores } from "./jsonStore";
import { createPool, describeTarget, explainDbError, migrate } from "./db/postgres";
import type { DataStore, WorkspaceStores } from "../shared/store";
import { loadSeedOverrides } from "./config";
import {
  createAuth,
  DEFAULT_WORKSPACE,
  ensureOwner,
  JsonAuthStore,
  PgAuthStore,
  SqliteAuthStore,
  type AuthStore,
  type User,
} from "./auth";
import { generateSeed } from "../shared/seed";
import { analyzeObjective, generatePlans } from "../shared/planner";
import {
  ApiError,
  compareInfluencers,
  createRun,
  decideApproval,
  getInfluencerDetail,
  getMarketplaceOverview,
  getRunState,
  resolveAlert,
  trade,
} from "../shared/services";

const PORT = Number(process.env.PORT ?? 8787);
const DB_FILE = process.env.DB_FILE ?? path.join(ROOT, "data", "marketbing.db");
const CONFIG_DIR = process.env.CONFIG_DIR ?? path.join(ROOT, "config");
const DATABASE_URL = process.env.DATABASE_URL?.trim();
const OWNER_EMAIL = process.env.OWNER_EMAIL?.trim();
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const RESET_OWNER_PASSWORD = /^(1|yes|true)$/i.test(process.env.RESET_OWNER_PASSWORD?.trim() ?? "");
// Anyone may create an account (and a workspace) unless ALLOW_SIGNUP=false.
const ALLOW_SIGNUP = !/^(0|no|false)$/i.test(process.env.ALLOW_SIGNUP?.trim() ?? "");

// Editable workspace data (products, influencers, wallet) comes from config/.
let overrides;
try {
  overrides = loadSeedOverrides(CONFIG_DIR);
} catch (e) {
  console.error(`\n${(e as Error).message}\n`);
  process.exit(1);
}

// Every new workspace starts from this data.
const seed = generateSeed(undefined, overrides);
let stores: WorkspaceStores;
let authStore: AuthStore;
let dbLabel: string;

if (DATABASE_URL) {
  dbLabel = `Postgres ${describeTarget(DATABASE_URL)}`;
  try {
    const pool = createPool(DATABASE_URL, process.env.DATABASE_CA_CERT?.trim() || undefined);
    const applied = await migrate(pool);
    if (applied.length) console.log(`Database schema updated: ${applied.join(", ")}`);
    stores = new PgStores(pool);
    authStore = new PgAuthStore(pool);
  } catch (e) {
    console.error(`\nCould not connect to the database (${dbLabel}):\n  ${explainDbError(e)}\n`);
    process.exit(1);
  }
} else {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  try {
    stores = new SqliteStores(DB_FILE);
    authStore = new SqliteAuthStore(DB_FILE);
    dbLabel = `SQLite ${DB_FILE}`;
  } catch (e) {
    // Runtimes that cannot load native addons (e.g. StackBlitz WebContainers)
    // can't run better-sqlite3; keep working with JSON-file-backed stores.
    const jsonFile = jsonFallbackFile(DB_FILE);
    console.warn(`\nSQLite is unavailable here (${(e as Error).message.split("\n")[0]}).`);
    console.warn(`Falling back to a JSON file store: ${jsonFile}\n`);
    stores = new JsonStores(jsonFile, seed);
    authStore = new JsonAuthStore(authFallbackFile(DB_FILE));
    dbLabel = `JSON ${jsonFile}`;
  }
}
console.log(
  (await stores.seedWorkspace(DEFAULT_WORKSPACE, seed))
    ? "Fresh database seeded from the config/ folder."
    : "Using the existing database — edits to the config/ folder apply to new workspaces, or after `npm run db:reset`.",
);
let ownerConfigured = false;
if (OWNER_EMAIL || OWNER_PASSWORD) {
  try {
    console.log(
      await ensureOwner(authStore, OWNER_EMAIL ?? "", OWNER_PASSWORD, { resetPassword: RESET_OWNER_PASSWORD }),
    );
    ownerConfigured = true;
  } catch (e) {
    console.error(`\nCannot set up sign-in: ${(e as Error).message}\nFix OWNER_EMAIL / OWNER_PASSWORD in .env and start the server again.\n`);
    process.exit(1);
  }
} else {
  console.warn(
    "\nOWNER_EMAIL / OWNER_PASSWORD are not set, so nobody can sign in to the default workspace\n" +
      "(the data from before sign-up existed). See .env.example.\n",
  );
}
const auth = createAuth(authStore, {
  allowSignup: ALLOW_SIGNUP,
  ownerConfigured,
  seedWorkspace: async (workspaceId) => {
    await stores.seedWorkspace(workspaceId, seed);
  },
});

const app = express();
// Behind a hosting proxy (e.g. Render), TRUST_PROXY=1 makes req.ip the
// visitor's address, so failed sign-ins are limited per visitor.
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);

app.use(express.json({ limit: "256kb" }));

/* Minimal request log. */
app.use((req, _res, next) => {
  if (req.path.startsWith("/api") && req.method !== "GET") {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  }
  next();
});

const api = express.Router();

api.get("/health", (_req, res) => {
  res.json({ ok: true, service: "marketbing-api" });
});

/* Sign-in routes are public; everything registered after this needs a session. */
api.use(auth.router);
api.use(auth.requireAuth);
// Each request only sees the signed-in user's workspace.
api.use((_req, res, next) => {
  res.locals.store = stores.forWorkspace((res.locals.user as User).workspaceId);
  next();
});
const storeOf = (res: express.Response) => res.locals.store as DataStore;

/* ---------------------------- Module 1 ---------------------------- */

api.post("/planner/analyze", (req, res) => {
  const objective = String(req.body?.objective ?? "");
  if (objective.trim().length < 10) throw new ApiError(400, "Objective must be at least 10 characters");
  res.json(analyzeObjective(objective));
});

api.post("/planner/plans", (req, res) => {
  const kind = req.body?.kind;
  if (!["holistic", "influencer", "email"].includes(kind)) throw new ApiError(400, "Invalid objective kind");
  res.json(generatePlans(kind));
});

api.post("/runs", async (req, res) => {
  const { objective, kind, planId, context } = req.body ?? {};
  if (!["holistic", "influencer", "email"].includes(kind)) throw new ApiError(400, "Invalid objective kind");
  res.status(201).json(await createRun(storeOf(res), { objective, kind, planId, context }, Date.now()));
});

api.get("/runs/:id", async (req, res) => {
  res.json(await getRunState(storeOf(res), req.params.id, Date.now()));
});

api.post("/runs/:id/approval", async (req, res) => {
  const { stepId, action } = req.body ?? {};
  if (!["approve", "reject", "reopen"].includes(action)) throw new ApiError(400, "Invalid approval action");
  if (typeof stepId !== "string") throw new ApiError(400, "stepId is required");
  res.json(await decideApproval(storeOf(res), req.params.id, stepId, action, Date.now()));
});

/* ---------------------------- Module 2 ---------------------------- */

api.get("/marketplace/overview", async (_req, res) => {
  res.json(await getMarketplaceOverview(storeOf(res)));
});

api.get("/marketplace/influencers/:id", async (req, res) => {
  const productId = typeof req.query.product === "string" ? req.query.product : "overall";
  res.json(await getInfluencerDetail(storeOf(res), req.params.id, productId));
});

api.post("/marketplace/influencers/:id/invest", async (req, res) => {
  res.json(await trade(storeOf(res), req.params.id, "invest", Number(req.body?.amountLakh), Date.now()));
});

api.post("/marketplace/influencers/:id/divest", async (req, res) => {
  res.json(await trade(storeOf(res), req.params.id, "divest", Number(req.body?.amountLakh), Date.now()));
});

api.get("/marketplace/compare", async (req, res) => {
  const ids = String(req.query.ids ?? "").split(",").filter(Boolean);
  res.json(await compareInfluencers(storeOf(res), ids));
});

api.post("/marketplace/alerts/:id/resolve", async (req, res) => {
  await resolveAlert(storeOf(res), req.params.id);
  res.json({ ok: true });
});

app.use("/api", api);

/* API error handler. */
app.use("/api", ((err, _req, res, _next) => {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}) as express.ErrorRequestHandler);

/* Serve the built web client (SPA fallback to index.html). */
const dist = path.join(ROOT, "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(dist, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Marketbing API listening on http://localhost:${PORT} (db: ${dbLabel})`);
});
