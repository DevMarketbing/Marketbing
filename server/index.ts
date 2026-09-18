import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { SqliteStore } from "./sqliteStore";
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// Secrets and server settings live in .env (see .env.example) — never in code.
const envFile = path.join(ROOT, ".env");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const PORT = Number(process.env.PORT ?? 8787);
const DB_FILE = process.env.DB_FILE ?? path.join(ROOT, "data", "marketbing.db");
const CONFIG_DIR = process.env.CONFIG_DIR ?? path.join(ROOT, "config");

// Editable workspace data (products, influencers, wallet) comes from config/.
let overrides;
try {
  overrides = loadSeedOverrides(CONFIG_DIR);
} catch (e) {
  console.error(`\n${(e as Error).message}\n`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const store = new SqliteStore(DB_FILE, generateSeed(undefined, overrides));
if (store.wasAlreadySeeded) {
  console.log(
    "Using the existing database — edits to the config/ folder apply after `npm run db:reset`.",
  );
} else {
  console.log("Fresh database seeded from the config/ folder.");
}

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

api.post("/runs", (req, res) => {
  const { objective, kind, planId, context } = req.body ?? {};
  if (!["holistic", "influencer", "email"].includes(kind)) throw new ApiError(400, "Invalid objective kind");
  res.status(201).json(createRun(store, { objective, kind, planId, context }, Date.now()));
});

api.get("/runs/:id", (req, res) => {
  res.json(getRunState(store, req.params.id, Date.now()));
});

api.post("/runs/:id/approval", (req, res) => {
  const { stepId, action } = req.body ?? {};
  if (!["approve", "reject", "reopen"].includes(action)) throw new ApiError(400, "Invalid approval action");
  if (typeof stepId !== "string") throw new ApiError(400, "stepId is required");
  res.json(decideApproval(store, req.params.id, stepId, action, Date.now()));
});

/* ---------------------------- Module 2 ---------------------------- */

api.get("/marketplace/overview", (_req, res) => {
  res.json(getMarketplaceOverview(store));
});

api.get("/marketplace/influencers/:id", (req, res) => {
  const productId = typeof req.query.product === "string" ? req.query.product : "overall";
  res.json(getInfluencerDetail(store, req.params.id, productId));
});

api.post("/marketplace/influencers/:id/invest", (req, res) => {
  res.json(trade(store, req.params.id, "invest", Number(req.body?.amountLakh), Date.now()));
});

api.post("/marketplace/influencers/:id/divest", (req, res) => {
  res.json(trade(store, req.params.id, "divest", Number(req.body?.amountLakh), Date.now()));
});

api.get("/marketplace/compare", (req, res) => {
  const ids = String(req.query.ids ?? "").split(",").filter(Boolean);
  res.json(compareInfluencers(store, ids));
});

api.post("/marketplace/alerts/:id/resolve", (req, res) => {
  resolveAlert(store, req.params.id);
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
const dist = path.join(__dirname, "..", "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(dist, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Marketbing API listening on http://localhost:${PORT} (db: ${DB_FILE})`);
});
