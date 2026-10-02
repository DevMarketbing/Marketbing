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
    // The site and the Android app are both served by the API server, so
    // calls go to the same address the page came from.
    res = await fetch(`/api${path}`, {
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

export interface SessionUser {
  email: string;
  role: "owner" | "member";
  workspaceName: string;
}

export interface TeamMember {
  id: string;
  email: string;
  role: "owner" | "member";
}

export interface PendingInvite {
  id: string;
  email: string;
  expiresAt: number;
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

/** Accounts and sign-in against the API server. Not used by the embedded demo, which has no server. */
export const auth = {
  required: !EMBEDDED,
  hasSession: () => token !== null,
  /** Whether this server lets new businesses sign up. */
  async signupAllowed(): Promise<boolean> {
    return (await request<{ signup: boolean }>("/auth/options")).signup;
  },
  async signIn(email: string, password: string): Promise<void> {
    setToken((await post<{ token: string }>("/auth/login", { email, password })).token);
  },
  async signUp(email: string, password: string, workspaceName: string): Promise<void> {
    setToken((await post<{ token: string }>("/auth/signup", { email, password, workspaceName })).token);
  },
  /** Who an invite link is for, or an error if it is invalid or expired. */
  async lookupInvite(inviteToken: string): Promise<{ email: string; workspaceName: string }> {
    return post("/auth/invite", { token: inviteToken });
  },
  async acceptInvite(inviteToken: string, password: string): Promise<void> {
    setToken((await post<{ token: string }>("/auth/invite/accept", { token: inviteToken, password })).token);
  },
  currentUser: () => request<SessionUser>("/auth/me"),
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await post("/auth/password", { currentPassword, newPassword });
  },
  async signOut(): Promise<void> {
    try {
      await post("/auth/logout");
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

/** The workspace's team; inviting and removing people is for the owner only. */
export const team = {
  list: () => request<{ members: TeamMember[]; invites: PendingInvite[] }>("/team"),
  /** Creates an invite and returns the link to send to the invitee. */
  async invite(email: string): Promise<PendingInvite & { link: string }> {
    const res = await post<PendingInvite & { token: string }>("/team/invites", { email });
    // After "#", the token is never sent to any server or written to its logs.
    const link = `${window.location.origin}/#invite=${res.token}`;
    return { id: res.id, email: res.email, expiresAt: res.expiresAt, link };
  },
  async revokeInvite(id: string): Promise<void> {
    await request(`/team/invites/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  async removeMember(id: string): Promise<void> {
    await request(`/team/members/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
};

export const api: ApiClient = EMBEDDED
  ? (await import("./embedded")).createEmbeddedClient()
  : createHttpClient();
