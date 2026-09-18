import type {
  AnalyzeResponse,
  CompareEntry,
  InfluencerDetail,
  MarketplaceOverview,
  ObjectiveKind,
  PlansResponse,
  RunState,
  TradeResult,
} from "../../shared/types";

/**
 * Client-side API boundary. The default implementation talks HTTP to the
 * Marketbing API server; the embedded implementation (VITE_EMBEDDED=1
 * builds, used for the hosted demo) runs the same shared service layer
 * in-browser with localStorage persistence.
 */
export interface ApiClient {
  analyzeObjective(objective: string): Promise<AnalyzeResponse>;
  getPlans(kind: ObjectiveKind): Promise<PlansResponse>;
  createRun(input: {
    objective: string;
    kind: ObjectiveKind;
    planId: string;
    context: Record<string, string>;
  }): Promise<RunState>;
  getRun(runId: string): Promise<RunState>;
  decideApproval(runId: string, stepId: string, action: "approve" | "reject" | "reopen"): Promise<RunState>;

  getMarketplaceOverview(): Promise<MarketplaceOverview>;
  getInfluencerDetail(id: string, productId: string | "overall"): Promise<InfluencerDetail>;
  trade(id: string, type: "invest" | "divest", amountLakh: number): Promise<TradeResult>;
  compare(ids: string[]): Promise<CompareEntry[]>;
  resolveAlert(alertId: string): Promise<void>;
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new HttpError(res.status, message);
  }
  return (await res.json()) as T;
}

function createHttpClient(): ApiClient {
  return {
    analyzeObjective: (objective) =>
      request("/planner/analyze", { method: "POST", body: JSON.stringify({ objective }) }),
    getPlans: (kind) => request("/planner/plans", { method: "POST", body: JSON.stringify({ kind }) }),
    createRun: (input) => request("/runs", { method: "POST", body: JSON.stringify(input) }),
    getRun: (runId) => request(`/runs/${encodeURIComponent(runId)}`),
    decideApproval: (runId, stepId, action) =>
      request(`/runs/${encodeURIComponent(runId)}/approval`, {
        method: "POST",
        body: JSON.stringify({ stepId, action }),
      }),
    getMarketplaceOverview: () => request("/marketplace/overview"),
    getInfluencerDetail: (id, productId) =>
      request(`/marketplace/influencers/${encodeURIComponent(id)}?product=${encodeURIComponent(productId)}`),
    trade: (id, type, amountLakh) =>
      request(`/marketplace/influencers/${encodeURIComponent(id)}/${type}`, {
        method: "POST",
        body: JSON.stringify({ amountLakh }),
      }),
    compare: (ids) => request(`/marketplace/compare?ids=${ids.map(encodeURIComponent).join(",")}`),
    resolveAlert: async (alertId) => {
      await request(`/marketplace/alerts/${encodeURIComponent(alertId)}/resolve`, { method: "POST" });
    },
  };
}

export const api: ApiClient = import.meta.env.VITE_EMBEDDED === "1"
  ? (await import("./embedded")).createEmbeddedClient()
  : createHttpClient();
