import type { ApiClient } from "./index";
import { MemoryStore, type MutableState } from "../../shared/store";
import { generateSeed } from "../../shared/seed";
import { analyzeObjective, generatePlans } from "../../shared/planner";
import {
  compareInfluencers,
  createRun,
  decideApproval,
  getInfluencerDetail,
  getMarketplaceOverview,
  getRunState,
  resolveAlert,
  trade,
} from "../../shared/services";

/**
 * Embedded runtime: the same shared service layer the API server uses,
 * running in the browser against a MemoryStore persisted to localStorage.
 * Used for the hosted demo build (VITE_EMBEDDED=1) where no server exists.
 */

const STORAGE_KEY = "marketbing-state-v2";

function loadState(): MutableState | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as MutableState) : undefined;
  } catch {
    return undefined;
  }
}

function persistState(state: MutableState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* private mode / storage blocked — demo continues in memory */
  }
}

/** Small latency so the demo behaves like a network-backed client. */
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createEmbeddedClient(): ApiClient {
  const store = new MemoryStore(generateSeed(), loadState(), persistState);

  return {
    async analyzeObjective(objective) {
      await delay(350);
      return analyzeObjective(objective);
    },
    async getPlans(kind) {
      await delay(400);
      return generatePlans(kind);
    },
    async createRun(input) {
      await delay(200);
      return createRun(store, input, Date.now());
    },
    async getRun(runId) {
      return getRunState(store, runId, Date.now());
    },
    async decideApproval(runId, stepId, action) {
      return decideApproval(store, runId, stepId, action, Date.now());
    },
    async getMarketplaceOverview() {
      await delay(150);
      return getMarketplaceOverview(store);
    },
    async getInfluencerDetail(id, productId) {
      await delay(120);
      return getInfluencerDetail(store, id, productId);
    },
    async trade(id, type, amountLakh) {
      await delay(200);
      return trade(store, id, type, amountLakh, Date.now());
    },
    async compare(ids) {
      await delay(150);
      return compareInfluencers(store, ids);
    },
    async resolveAlert(alertId) {
      await delay(120);
      await resolveAlert(store, alertId);
    },
  };
}
