import crypto from "node:crypto";
import { ApiError } from "../../shared/services";

/**
 * Minimal client for Meta's Graph API (Facebook Pages, Instagram, Ads).
 *
 * Every call signs its access token with appsecret_proof, so a token that
 * leaks is useless without the app secret. Meta's errors are turned into
 * messages a non-developer can act on. Never answers 401: that status
 * means "your Marketbing session ended" to the web app.
 */

export interface MetaConfig {
  appId: string;
  appSecret: string;
  /** e.g. https://graph.facebook.com (tests point this at a fake server). */
  graphUrl: string;
  /** e.g. https://www.facebook.com (where the "Allow access" dialog lives). */
  dialogUrl: string;
  /** e.g. v24.0 */
  version: string;
  /** Permissions asked for (ignored when loginConfigId is set). */
  scopes: string[];
  /** Facebook Login for Business configuration, which then decides the permissions. */
  loginConfigId?: string;
}

export const DEFAULT_SCOPES = [
  "business_management",
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "read_insights",
  "instagram_basic",
  "instagram_manage_insights",
  "instagram_manage_comments",
  "instagram_content_publish",
  "ads_read",
  "ads_management",
];

/** Reads META_* settings; null when the app isn't set up (no app id or secret). */
export function metaConfigFromEnv(env: NodeJS.ProcessEnv): MetaConfig | null {
  const appId = env.META_APP_ID?.trim();
  const appSecret = env.META_APP_SECRET?.trim();
  if (!appId || !appSecret) return null;
  const scopes = env.META_SCOPES?.trim();
  return {
    appId,
    appSecret,
    graphUrl: (env.META_GRAPH_URL?.trim() || "https://graph.facebook.com").replace(/\/+$/, ""),
    dialogUrl: (env.META_DIALOG_URL?.trim() || "https://www.facebook.com").replace(/\/+$/, ""),
    version: env.META_GRAPH_VERSION?.trim() || "v24.0",
    scopes: scopes ? scopes.split(/[\s,]+/).filter(Boolean) : DEFAULT_SCOPES,
    loginConfigId: env.META_LOGIN_CONFIG_ID?.trim() || undefined,
  };
}

/* ------------------------------- secrets -------------------------------- */

/** Keys derived from the app secret, one per purpose. */
function deriveKey(appSecret: string, purpose: string): Buffer {
  return Buffer.from(crypto.hkdfSync("sha256", appSecret, "marketbing", purpose, 32));
}

/** Encrypts tokens for storage (AES-256-GCM). Rotating META_APP_SECRET means reconnecting. */
export class TokenBox {
  private key: Buffer;
  constructor(appSecret: string) {
    this.key = deriveKey(appSecret, "meta-token-encryption");
  }

  seal(token: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.key, iv);
    const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
    return "v1:" + Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
  }

  open(sealed: string): string {
    const raw = Buffer.from(sealed.replace(/^v1:/, ""), "base64");
    try {
      const decipher = crypto.createDecipheriv("aes-256-gcm", this.key, raw.subarray(0, 12));
      decipher.setAuthTag(raw.subarray(12, 28));
      return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    } catch {
      throw new ApiError(409, "The saved Facebook connection can't be read (the Meta app secret changed). Reconnect Facebook.");
    }
  }
}

/** Signs and checks the OAuth "state", which ties Meta's reply to the person who clicked Connect. */
export class StateSigner {
  private key: Buffer;
  constructor(appSecret: string) {
    this.key = deriveKey(appSecret, "meta-oauth-state");
  }

  sign(payload: object): string {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${body}.${crypto.createHmac("sha256", this.key).update(body).digest("base64url")}`;
  }

  verify<T>(state: string): T | null {
    const [body, sig] = state.split(".");
    if (!body || !sig) return null;
    const expected = crypto.createHmac("sha256", this.key).update(body).digest();
    const given = Buffer.from(sig, "base64url");
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
    try {
      return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
    } catch {
      return null;
    }
  }
}

/** Decodes a signed_request Meta posts to the deauthorize and data deletion URLs. */
export function parseSignedRequest(signedRequest: string, appSecret: string): { user_id?: string } | null {
  const [sig, payload] = signedRequest.split(".");
  if (!sig || !payload) return null;
  const expected = crypto.createHmac("sha256", appSecret).update(payload).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      algorithm?: string;
      user_id?: string;
    };
    return data.algorithm?.toUpperCase() === "HMAC-SHA256" ? data : null;
  } catch {
    return null;
  }
}

/* --------------------------------- calls --------------------------------- */

type Params = Record<string, string | number | boolean | object | undefined>;

interface GraphErrorBody {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
    error_user_title?: string;
    error_user_msg?: string;
  };
}

/** Turns a Graph API error into something the person using Marketbing can act on. */
function explain(body: GraphErrorBody, httpStatus: number): ApiError {
  const e = body.error ?? {};
  const detail = e.error_user_msg || e.message || `Meta returned an error (${httpStatus})`;
  const code = e.code ?? 0;
  if (code === 190 || code === 102 || (code === 2500 && /token/i.test(e.message ?? ""))) {
    return new ApiError(409, "The Facebook connection has expired or was removed. Click Reconnect to connect again.");
  }
  if (code === 10 || (code >= 200 && code < 300)) {
    return new ApiError(
      403,
      `Meta didn't allow this: ${detail} Reconnect and allow every permission. If it still fails, ` +
        "this permission needs Meta's App Review before it works for this account.",
    );
  }
  if ([4, 17, 32, 613, 80001, 80002, 80004].includes(code)) {
    return new ApiError(429, "Meta's request limit was reached. Wait a few minutes and try again.");
  }
  return new ApiError(httpStatus >= 500 ? 502 : 400, `Meta: ${detail}`);
}

export class Graph {
  constructor(readonly config: MetaConfig) {}

  private proof(token: string) {
    return crypto.createHmac("sha256", this.config.appSecret).update(token).digest("hex");
  }

  /** Calls the Graph API. Objects and arrays in params are sent as JSON. */
  async call<T>(method: "GET" | "POST" | "DELETE", path: string, token: string | null, params: Params = {}): Promise<T> {
    const url = new URL(`${this.config.graphUrl}/${this.config.version}/${path.replace(/^\/+/, "")}`);
    const all: Params = { ...params };
    if (token) Object.assign(all, { access_token: token, appsecret_proof: this.proof(token) });
    const form = new URLSearchParams();
    for (const [k, v] of Object.entries(all)) {
      if (v === undefined) continue;
      form.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    }
    let res: Response;
    try {
      res =
        method === "POST"
          ? await fetch(url, { method, body: form, signal: AbortSignal.timeout(30_000) })
          : await fetch(`${url}?${form}`, { method, signal: AbortSignal.timeout(30_000) });
    } catch {
      throw new ApiError(502, "Couldn't reach Meta. Try again in a moment.");
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new ApiError(502, `Meta sent an unreadable reply (${res.status}). Try again in a moment.`);
    }
    if (!res.ok || (body as GraphErrorBody).error) throw explain(body as GraphErrorBody, res.status);
    return body as T;
  }

  get<T>(path: string, token: string, params?: Params) {
    return this.call<T>("GET", path, token, params);
  }

  post<T>(path: string, token: string, params?: Params) {
    return this.call<T>("POST", path, token, params);
  }

  /** Follows "next" pages of a list, up to maxItems. */
  async all<T>(path: string, token: string, params: Params = {}, maxItems = 500): Promise<T[]> {
    const items: T[] = [];
    let after: string | undefined;
    do {
      const page = await this.get<{ data: T[]; paging?: { next?: string; cursors?: { after?: string } } }>(path, token, {
        ...params,
        after,
      });
      items.push(...page.data);
      after = page.paging?.next ? page.paging.cursors?.after : undefined;
    } while (after && items.length < maxItems);
    return items.slice(0, maxItems);
  }

  /** The "Allow Marketbing to…" dialog address. */
  dialogUrl(redirectUri: string, state: string): string {
    const url = new URL(`${this.config.dialogUrl}/${this.config.version}/dialog/oauth`);
    url.searchParams.set("client_id", this.config.appId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("response_type", "code");
    if (this.config.loginConfigId) url.searchParams.set("config_id", this.config.loginConfigId);
    else url.searchParams.set("scope", this.config.scopes.join(","));
    return url.toString();
  }

  /** Swaps the code Meta sent back for a long-lived (about 60 days) user token. */
  async exchangeCode(code: string, redirectUri: string): Promise<{ token: string; expiresAt: number | null }> {
    const { appId, appSecret } = this.config;
    const short = await this.call<{ access_token: string }>("GET", "oauth/access_token", null, {
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    });
    const long = await this.call<{ access_token: string; expires_in?: number }>("GET", "oauth/access_token", null, {
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: short.access_token,
    });
    return {
      token: long.access_token,
      expiresAt: long.expires_in ? Date.now() + long.expires_in * 1000 : null,
    };
  }
}
