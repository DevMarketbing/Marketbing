import { ROOT } from "./env";
import express from "express";
import path from "node:path";
import fs from "node:fs";
import { SqliteStore } from "./sqliteStore";
import { PgStore } from "./pgStore";
import { createPool, describeTarget, explainDbError, migrate } from "./db/postgres";
import type { DataStore } from "../shared/store";
import { loadSeedOverrides } from "./config";
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

// Editable workspace data (products, influencers, wallet) comes from config/.
let overrides;
try {
  overrides = loadSeedOverrides(CONFIG_DIR);
} catch (e) {
  console.error(`\n${(e as Error).message}\n`);
  process.exit(1);
}

const seed = generateSeed(undefined, overrides);
let store: DataStore;
let dbLabel: string;
let seeded: boolean;

if (DATABASE_URL) {
  dbLabel = `Postgres ${describeTarget(DATABASE_URL)}`;
  try {
    const pool = createPool(DATABASE_URL, process.env.DATABASE_CA_CERT?.trim() || undefined);
    const applied = await migrate(pool);
    if (applied.length) console.log(`Database schema updated: ${applied.join(", ")}`);
    ({ store, seeded } = await PgStore.open(pool, seed));
  } catch (e) {
    console.error(`\nCould not connect to the database (${dbLabel}):\n  ${explainDbError(e)}\n`);
    process.exit(1);
  }
} else {
  dbLabel = `SQLite ${DB_FILE}`;
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const sqlite = new SqliteStore(DB_FILE, seed);
  store = sqlite;
  seeded = !sqlite.wasAlreadySeeded;
}
console.log(
  seeded
    ? "Fresh database seeded from the config/ folder."
    : "Using the existing database — edits to the config/ folder apply after `npm run db:reset`.",
);

const app = express();
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
  res.status(201).json(await createRun(store, { objective, kind, planId, context }, Date.now()));
});

api.get("/runs/:id", async (req, res) => {
  res.json(await getRunState(store, req.params.id, Date.now()));
});

api.post("/runs/:id/approval", async (req, res) => {
  const { stepId, action } = req.body ?? {};
  if (!["approve", "reject", "reopen"].includes(action)) throw new ApiError(400, "Invalid approval action");
  if (typeof stepId !== "string") throw new ApiError(400, "stepId is required");
  res.json(await decideApproval(store, req.params.id, stepId, action, Date.now()));
});

/* ---------------------------- Module 2 ---------------------------- */

api.get("/marketplace/overview", async (_req, res) => {
  res.json(await getMarketplaceOverview(store));
});

api.get("/marketplace/influencers/:id", async (req, res) => {
  const productId = typeof req.query.product === "string" ? req.query.product : "overall";
  res.json(await getInfluencerDetail(store, req.params.id, productId));
});

api.post("/marketplace/influencers/:id/invest", async (req, res) => {
  res.json(await trade(store, req.params.id, "invest", Number(req.body?.amountLakh), Date.now()));
});

api.post("/marketplace/influencers/:id/divest", async (req, res) => {
  res.json(await trade(store, req.params.id, "divest", Number(req.body?.amountLakh), Date.now()));
});

api.get("/marketplace/compare", async (req, res) => {
  const ids = String(req.query.ids ?? "").split(",").filter(Boolean);
  res.json(await compareInfluencers(store, ids));
});

api.post("/marketplace/alerts/:id/resolve", async (req, res) => {
  await resolveAlert(store, req.params.id);
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
