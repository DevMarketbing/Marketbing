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

export const EMBEDDED = import.meta.env.VITE_EMBEDDED === "1";

/**
 * Address of the API server. Empty for the web app, which is served by the
 * API server itself; the Android build sets VITE_API_URL to the hosted
 * server (see scripts/build-android.mjs).
 */
const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/* The sign-in token. localStorage persists in the browser and in the Android app's WebView. */
const TOKEN_KEY = "marketbing-session";
let token: string | null = (() => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
})();
const signedOutListeners = new Set<() => void>();

function setToken(value: string | null) {
  token = value;
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage blocked — the session lasts until the page closes */
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...init,
    });
  } catch {
    throw new HttpError(0, "Can't reach the Marketbing server. Check your internet connection and try again.");
  }
  if (res.status === 401 && token) {
    // Session expired or was ended elsewhere: back to the sign-in screen.
    setToken(null);
    signedOutListeners.forEach((fn) => fn());
  }
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

/** Sign-in against the API server. Not used by the embedded demo, which has no server. */
export const auth = {
  required: !EMBEDDED,
  hasSession: () => token !== null,
  async signIn(email: string, password: string): Promise<string> {
    const res = await request<{ token: string; email: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setToken(res.token);
    return res.email;
  },
  async currentUser(): Promise<string> {
    return (await request<{ email: string }>("/auth/me")).email;
  },
  async signOut(): Promise<void> {
    try {
      await request("/auth/logout", { method: "POST" });
    } catch {
      /* already signed out on the server, or offline — forget the token either way */
    }
    setToken(null);
  },
  /** Calls fn when the server rejects the session. Returns an unsubscribe function. */
  onSignedOut(fn: () => void): () => void {
    signedOutListeners.add(fn);
    return () => signedOutListeners.delete(fn);
  },
};

export const api: ApiClient = EMBEDDED
  ? (await import("./embedded")).createEmbeddedClient()
  : createHttpClient();
