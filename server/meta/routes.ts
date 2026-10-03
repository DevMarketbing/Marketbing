import crypto from "node:crypto";
import express from "express";
import { ApiError } from "../../shared/services";
import type { User } from "../auth";
import type {
  AdCampaign,
  AdMetrics,
  AdsOverview,
  FbPageOverview,
  IgComment,
  IgLookup,
  IgMedia,
  IgMediaDetail,
  IgOverview,
  IgProfile,
  MetaStatus,
} from "../../shared/metaTypes";
import { CAMPAIGN_OBJECTIVES } from "../../shared/metaTypes";
import { Graph, parseSignedRequest, StateSigner, TokenBox, type MetaConfig } from "./graph";
import type { MetaAdAccount, MetaConnection, MetaPage, MetaStore } from "./store";

/**
 * Meta (Facebook & Instagram) for a workspace.
 *
 * The workspace owner connects a Facebook account once ("Allow Marketbing
 * to…"); after that everyone in the workspace can see Instagram and Page
 * stats, publish, answer comments, look up influencers and manage ads.
 *
 * publicRouter holds what Meta itself calls (the sign-in return address and
 * the deauthorize / data deletion callbacks); router needs a Marketbing
 * session and sits behind requireAuth.
 */

const STATE_MINUTES = 10;
const NONCE_COOKIE = "mb_meta_oauth";
// Currencies Meta counts in whole units; all others are in hundredths.
const WHOLE_UNIT_CURRENCIES = new Set(["CLP", "COP", "CRC", "HUF", "ISK", "IDR", "JPY", "KRW", "PYG", "TWD", "VND"]);
// Meta renames and retires insight metrics now and then, and one unknown
// metric fails the whole request, so each list falls back to a core set.
const IG_ACCOUNT_METRICS = [
  ["reach", "views", "accounts_engaged", "total_interactions", "likes", "comments", "shares", "saves", "profile_views"],
  ["reach", "accounts_engaged", "total_interactions"],
];
const IG_MEDIA_METRICS = [
  ["reach", "views", "likes", "comments", "shares", "saved", "total_interactions"],
  ["reach", "likes", "comments", "saved"],
];
const IG_MEDIA_FIELDS =
  "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count";

interface OAuthState {
  workspaceId: string;
  userId: string;
  redirectUri: string;
  nonceHash: string;
  expiresAt: number;
}

export interface MetaOptions {
  store: MetaStore;
  /** null when META_APP_ID / META_APP_SECRET aren't set. */
  config: MetaConfig | null;
  /** The site's public address (PUBLIC_URL); otherwise taken from each request. */
  publicUrl?: string;
}

const num = (v: unknown): number | null => (v === undefined || v === null || v === "" ? null : Number(v));
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const userOf = (res: express.Response) => res.locals.user as User;

function readCookie(req: express.Request, name: string): string | null {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

function toMedia(m: Record<string, unknown>): IgMedia {
  return {
    id: String(m.id),
    caption: m.caption as string | undefined,
    mediaType: String(m.media_type ?? ""),
    productType: m.media_product_type as string | undefined,
    mediaUrl: m.media_url as string | undefined,
    thumbnailUrl: m.thumbnail_url as string | undefined,
    permalink: m.permalink as string | undefined,
    timestamp: String(m.timestamp ?? ""),
    likes: num(m.like_count),
    comments: num(m.comments_count),
  };
}

function toProfile(p: Record<string, unknown>): IgProfile {
  return {
    id: String(p.id ?? ""),
    username: String(p.username ?? ""),
    name: p.name as string | undefined,
    biography: p.biography as string | undefined,
    website: p.website as string | undefined,
    pictureUrl: p.profile_picture_url as string | undefined,
    followers: num(p.followers_count),
    following: num(p.follows_count),
    posts: num(p.media_count),
  };
}

/** Insight rows ({ name, total_value: { value } } or { name, values: [{ value }] }) as name → total. */
function insightTotals(rows: { name: string; total_value?: { value?: number }; values?: { value?: number }[] }[]) {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const v = r.total_value?.value ?? r.values?.reduce((sum, x) => sum + (Number(x.value) || 0), 0);
    if (typeof v === "number" && Number.isFinite(v)) out[r.name] = v;
  }
  return out;
}

function adMetrics(row: Record<string, string> | undefined): AdMetrics | null {
  if (!row) return null;
  return {
    spend: Number(row.spend ?? 0),
    impressions: Number(row.impressions ?? 0),
    reach: Number(row.reach ?? 0),
    clicks: Number(row.clicks ?? 0),
    ctr: Number(row.ctr ?? 0),
    cpc: num(row.cpc),
  };
}

const AD_METRIC_FIELDS = "spend,impressions,reach,clicks,ctr,cpc";

function httpsUrl(value: unknown, what: string): string {
  const s = String(value ?? "").trim();
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    throw new ApiError(400, `Enter the ${what} as a full web address starting with https://`);
  }
  if (url.protocol !== "https:") throw new ApiError(400, `The ${what} must start with https://`);
  return url.toString();
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createMeta(options: MetaOptions) {
  const { store, config } = options;
  const graph = config ? new Graph(config) : null;
  const tokens = config ? new TokenBox(config.appSecret) : null;
  const states = config ? new StateSigner(config.appSecret) : null;

  const baseUrl = (req: express.Request) => (options.publicUrl ?? `${req.protocol}://${req.get("host")}`).replace(/\/+$/, "");
  const setupUrls = (req: express.Request) => {
    const base = baseUrl(req);
    return {
      redirectUri: `${base}/api/meta/callback`,
      deauthorizeUrl: `${base}/api/meta/deauthorize`,
      dataDeletionUrl: `${base}/api/meta/data-deletion`,
    };
  };

  const ready = () => {
    if (!graph || !tokens || !states || !config) {
      throw new ApiError(503, "Facebook & Instagram aren't set up on this server yet (META_APP_ID and META_APP_SECRET).");
    }
    return { graph, tokens, states, config };
  };

  /** Insight totals, trying each metric list in turn; an error message if none works. */
  async function insights(
    path: string,
    token: string,
    metricLists: string[][],
    params: Record<string, string | number> = {},
  ): Promise<{ totals: Record<string, number> } | { error: string }> {
    let error = "";
    for (const metrics of metricLists) {
      try {
        const r = await graph!.get<{ data: Parameters<typeof insightTotals>[0] }>(path, token, { ...params, metric: metrics.join(",") });
        return { totals: insightTotals(r.data) };
      } catch (e) {
        error = (e as Error).message;
        // Expired connection, missing permission or rate limit: a smaller list won't help.
        if (e instanceof ApiError && [403, 409, 429].includes(e.status)) break;
      }
    }
    return { error };
  }

  /** Fetches who the token belongs to and everything it can manage. */
  async function loadAccount(userToken: string) {
    const { graph, tokens, config } = ready();
    const me = await graph.get<{ id: string; name: string }>("me", userToken, { fields: "id,name" });
    const perms = await graph.get<{ data: { permission: string; status: string }[] }>("me/permissions", userToken);
    const granted = perms.data.filter((p) => p.status === "granted").map((p) => p.permission);
    const declined = perms.data.filter((p) => p.status !== "granted").map((p) => p.permission);

    const rawPages = await graph.all<Record<string, any>>("me/accounts", userToken, {
      fields:
        "id,name,category,access_token,instagram_business_account{id,username,name,profile_picture_url,followers_count}",
      limit: 100,
    });
    const pages: MetaPage[] = rawPages.map((p) => {
      const ig = p.instagram_business_account;
      return {
        id: String(p.id),
        name: String(p.name),
        category: p.category,
        token: tokens.seal(String(p.access_token)),
        instagram: ig
          ? {
              id: String(ig.id),
              username: String(ig.username ?? ""),
              name: ig.name,
              pictureUrl: ig.profile_picture_url,
              followers: num(ig.followers_count) ?? undefined,
            }
          : undefined,
      };
    });

    let adAccounts: MetaAdAccount[] = [];
    if (granted.includes("ads_read") || granted.includes("ads_management") || config.loginConfigId) {
      const raw = await graph
        .all<Record<string, any>>("me/adaccounts", userToken, { fields: "id,name,currency,account_status", limit: 100 })
        .catch(() => []);
      adAccounts = raw.map((a) => ({
        id: String(a.id),
        name: String(a.name ?? a.id),
        currency: String(a.currency ?? "USD"),
        status: Number(a.account_status ?? 1),
      }));
    }
    return { me, granted, declined, pages, adAccounts };
  }

  async function connectionOf(res: express.Response): Promise<MetaConnection> {
    ready();
    const c = await store.get(userOf(res).workspaceId);
    if (!c) throw new ApiError(409, "Facebook isn't connected for this workspace yet.");
    return c;
  }

  function pageOf(c: MetaConnection, pageId: string): MetaPage {
    const page = c.pages.find((p) => p.id === pageId);
    if (!page) throw new ApiError(404, "That Facebook Page isn't part of this workspace's connection. Try Refresh.");
    return page;
  }

  /** The Instagram account and the token for it (its Page's token). */
  function igOf(c: MetaConnection, igId: string): { page: MetaPage; token: string } {
    const page = c.pages.find((p) => p.instagram?.id === igId);
    if (!page) throw new ApiError(404, "That Instagram account isn't part of this workspace's connection. Try Refresh.");
    return { page, token: tokens!.open(page.token) };
  }

  function adAccountOf(c: MetaConnection, accountId: string): MetaAdAccount {
    const account = c.adAccounts.find((a) => a.id === accountId);
    if (!account) throw new ApiError(404, "That ad account isn't part of this workspace's connection. Try Refresh.");
    return account;
  }

  const toMajor = (minor: unknown, currency: string) => {
    const n = num(minor);
    return n === null ? null : WHOLE_UNIT_CURRENCIES.has(currency) ? n : n / 100;
  };
  const toMinor = (major: number, currency: string) => Math.round(WHOLE_UNIT_CURRENCIES.has(currency) ? major : major * 100);

  /* ================================ public ================================ */

  const publicRouter = express.Router();
  const form = express.urlencoded({ extended: false, limit: "16kb" });

  // Meta sends people back here after "Allow" (or "Cancel"). This is a page
  // load, not an API call, so it always ends by redirecting into the app.
  publicRouter.get("/meta/callback", async (req, res) => {
    const back = (outcome: string) => {
      res.clearCookie(NONCE_COOKIE, { path: "/api/meta" });
      res.redirect(303, `${baseUrl(req)}/#meta=${outcome}`);
    };
    const fail = (message: string) => back(`error:${encodeURIComponent(message.slice(0, 300))}`);
    try {
      const { graph, tokens, states } = ready();
      if (req.query.error) {
        back("cancelled");
        return;
      }
      const state = states.verify<OAuthState>(String(req.query.state ?? ""));
      const nonce = readCookie(req, NONCE_COOKIE);
      if (!state || !nonce || sha256(nonce) !== state.nonceHash) {
        fail("This sign-in link didn't come from your browser. Start again from Marketbing.");
        return;
      }
      if (state.expiresAt < Date.now()) {
        fail(`The Facebook sign-in took longer than ${STATE_MINUTES} minutes. Click Connect again.`);
        return;
      }
      const code = String(req.query.code ?? "");
      if (!code) {
        fail("Meta didn't send a sign-in code back. Try connecting again.");
        return;
      }
      const { token, expiresAt } = await graph.exchangeCode(code, state.redirectUri);
      const account = await loadAccount(token);
      const now = Date.now();
      await store.save({
        workspaceId: state.workspaceId,
        metaUserId: account.me.id,
        metaUserName: account.me.name,
        userToken: tokens.seal(token),
        tokenExpiresAt: expiresAt,
        grantedScopes: account.granted,
        declinedScopes: account.declined,
        connectedBy: state.userId,
        connectedAt: now,
        refreshedAt: now,
        pages: account.pages,
        adAccounts: account.adAccounts,
      });
      console.log(`Meta connected for workspace ${state.workspaceId} (${account.pages.length} pages, ${account.adAccounts.length} ad accounts)`);
      back("connected");
    } catch (e) {
      fail(e instanceof ApiError ? e.message : "Something went wrong while connecting Facebook. Try again.");
      if (!(e instanceof ApiError)) console.error(e);
    }
  });

  // Meta calls this when someone removes Marketbing from their Facebook settings.
  publicRouter.post("/meta/deauthorize", form, async (req, res) => {
    const { config } = ready();
    const data = parseSignedRequest(String(req.body?.signed_request ?? ""), config.appSecret);
    if (!data?.user_id) throw new ApiError(400, "Invalid signed_request");
    const removed = await store.deleteByMetaUser(String(data.user_id));
    console.log(`Meta deauthorized by a Facebook user: ${removed} connection(s) removed`);
    res.json({ ok: true });
  });

  // Meta calls this when someone asks Facebook to delete what Marketbing holds about them.
  publicRouter.post("/meta/data-deletion", form, async (req, res) => {
    const { config } = ready();
    const data = parseSignedRequest(String(req.body?.signed_request ?? ""), config.appSecret);
    if (!data?.user_id) throw new ApiError(400, "Invalid signed_request");
    await store.deleteByMetaUser(String(data.user_id));
    const code = crypto.randomBytes(12).toString("hex");
    await store.saveDeletionRequest(code, Date.now());
    res.json({ url: `${baseUrl(req)}/api/meta/data-deletion/status?code=${code}`, confirmation_code: code });
  });

  // The page Meta links people to, to check their deletion request.
  publicRouter.get("/meta/data-deletion/status", async (req, res) => {
    const code = String(req.query.code ?? "");
    const request = /^[a-f0-9]{24}$/.test(code) ? await store.getDeletionRequest(code) : null;
    const message = request
      ? `Done. Every Facebook and Instagram connection and access token Marketbing held for you was deleted on ${new Date(
          request.completedAt,
        ).toUTCString()}.`
      : "We have no deletion request with this code. Check the link you were given.";
    res
      .type("html")
      .send(
        `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
          `<title>Data deletion – Marketbing</title><body style="font-family:system-ui,sans-serif;max-width:36rem;margin:3rem auto;padding:0 1rem;color:#0f172a">` +
          `<h1 style="font-size:1.25rem">Data deletion request</h1><p>Confirmation code: <code>${request ? code : "unknown"}</code></p><p>${message}</p></body>`,
      );
  });

  /* ============================== signed in =============================== */

  const router = express.Router();

  const requireOwner: express.RequestHandler = (_req, res, next) => {
    if (userOf(res).role !== "owner") throw new ApiError(403, "Only the workspace owner can connect or disconnect Facebook.");
    next();
  };

  router.get("/meta/status", async (req, res) => {
    const user = userOf(res);
    const c = config ? await store.get(user.workspaceId) : null;
    const wanted = config?.loginConfigId ? [] : (config?.scopes ?? []);
    const status: MetaStatus = {
      configured: config !== null,
      connected: c !== null,
      canManage: user.role === "owner",
      setup: user.role === "owner" ? setupUrls(req) : undefined,
      account: c
        ? {
            name: c.metaUserName,
            connectedAt: c.connectedAt,
            refreshedAt: c.refreshedAt,
            tokenExpiresAt: c.tokenExpiresAt,
            missingScopes: wanted.filter((s) => !c.grantedScopes.includes(s)),
          }
        : undefined,
      pages: (c?.pages ?? []).map(({ token: _token, ...page }) => page),
      adAccounts: c?.adAccounts ?? [],
    };
    res.json(status);
  });

  // Starts "Connect Facebook": returns the address of Meta's "Allow access" dialog.
  router.post("/meta/connect", requireOwner, (req, res) => {
    const { graph, states } = ready();
    const user = userOf(res);
    const nonce = crypto.randomBytes(24).toString("base64url");
    const redirectUri = setupUrls(req).redirectUri;
    const state = states.sign({
      workspaceId: user.workspaceId,
      userId: user.id,
      redirectUri,
      nonceHash: sha256(nonce),
      expiresAt: Date.now() + STATE_MINUTES * 60_000,
    } satisfies OAuthState);
    // The cookie proves the person returning from Facebook is the one who clicked Connect.
    res.cookie(NONCE_COOKIE, nonce, {
      httpOnly: true,
      sameSite: "lax",
      secure: redirectUri.startsWith("https:"),
      maxAge: STATE_MINUTES * 60_000,
      path: "/api/meta",
    });
    res.json({ url: graph.dialogUrl(redirectUri, state) });
  });

  // Re-reads the Pages, Instagram accounts and ad accounts the connection can reach.
  router.post("/meta/refresh", async (_req, res) => {
    const c = await connectionOf(res);
    const account = await loadAccount(tokens!.open(c.userToken));
    await store.save({
      ...c,
      metaUserName: account.me.name,
      grantedScopes: account.granted,
      declinedScopes: account.declined,
      pages: account.pages,
      adAccounts: account.adAccounts,
      refreshedAt: Date.now(),
    });
    res.json({ ok: true });
  });

  router.delete("/meta/connection", requireOwner, async (_req, res) => {
    const c = await connectionOf(res);
    // Also withdraw Marketbing's access on Facebook's side; forget it here either way.
    await graph!.call("DELETE", "me/permissions", tokens!.open(c.userToken)).catch(() => {});
    await store.delete(c.workspaceId);
    res.json({ ok: true });
  });

  /* ------------------------------ Instagram ------------------------------- */

  router.get("/meta/instagram/:igId", async (req, res) => {
    const c = await connectionOf(res);
    const { token } = igOf(c, req.params.igId);
    const igId = req.params.igId;
    const until = Math.floor(Date.now() / 1000);
    const [profile, media, stats] = await Promise.all([
      graph!.get<Record<string, unknown>>(igId, token, {
        fields: "id,username,name,biography,website,profile_picture_url,followers_count,follows_count,media_count",
      }),
      graph!.get<{ data: Record<string, unknown>[] }>(`${igId}/media`, token, { fields: IG_MEDIA_FIELDS, limit: 24 }),
      insights(`${igId}/insights`, token, IG_ACCOUNT_METRICS, {
        period: "day",
        metric_type: "total_value",
        since: until - 28 * 24 * 3600,
        until,
      }),
    ]);
    const overview: IgOverview = {
      profile: toProfile(profile),
      insights: "totals" in stats ? stats.totals : null,
      insightsError: "error" in stats ? stats.error : undefined,
      media: media.data.map(toMedia),
    };
    res.json(overview);
  });

  /** Checks the post belongs to this Instagram account before touching it. */
  async function assertOwnMedia(token: string, igId: string, mediaId: string) {
    const m = await graph!.get<{ owner?: { id?: string } }>(mediaId, token, { fields: "owner" });
    if (m.owner?.id !== igId) throw new ApiError(404, "That post isn't on this Instagram account.");
  }

  router.get("/meta/instagram/:igId/media/:mediaId", async (req, res) => {
    const c = await connectionOf(res);
    const { igId, mediaId } = req.params;
    const { token } = igOf(c, igId);
    await assertOwnMedia(token, igId, mediaId);
    const [stats, comments] = await Promise.all([
      insights(`${mediaId}/insights`, token, IG_MEDIA_METRICS),
      graph!.all<Record<string, any>>(
        `${mediaId}/comments`,
        token,
        { fields: "id,text,username,timestamp,hidden,like_count,replies{id,text,username,timestamp}", limit: 50 },
        200,
      ),
    ]);
    const detail: IgMediaDetail = {
      insights: "totals" in stats ? stats.totals : null,
      insightsError: "error" in stats ? stats.error : undefined,
      comments: comments.map(
        (x): IgComment => ({
          id: String(x.id),
          text: String(x.text ?? ""),
          username: x.username,
          timestamp: String(x.timestamp ?? ""),
          hidden: x.hidden,
          likes: num(x.like_count) ?? undefined,
          replies: ((x.replies?.data ?? []) as Record<string, unknown>[]).map((r) => ({
            id: String(r.id),
            text: String(r.text ?? ""),
            username: r.username as string | undefined,
            timestamp: String(r.timestamp ?? ""),
          })),
        }),
      ),
    };
    res.json(detail);
  });

  /** Checks the comment is on a post of this Instagram account. */
  async function assertOwnComment(token: string, igId: string, mediaId: string, commentId: string) {
    await assertOwnMedia(token, igId, mediaId);
    const comment = await graph!.get<{ media?: { id?: string } }>(commentId, token, { fields: "media" });
    if (comment.media?.id !== mediaId) throw new ApiError(404, "That comment isn't on this post.");
  }

  router.post("/meta/instagram/:igId/media/:mediaId/comments/:commentId/reply", async (req, res) => {
    const c = await connectionOf(res);
    const { igId, mediaId, commentId } = req.params;
    const { token } = igOf(c, igId);
    const message = String(req.body?.message ?? "").trim();
    if (!message) throw new ApiError(400, "Write a reply first");
    if (message.length > 2200) throw new ApiError(400, "Replies can be at most 2,200 characters");
    await assertOwnComment(token, igId, mediaId, commentId);
    res.json(await graph!.post<{ id: string }>(`${commentId}/replies`, token, { message }));
  });

  router.post("/meta/instagram/:igId/media/:mediaId/comments/:commentId/hide", async (req, res) => {
    const c = await connectionOf(res);
    const { igId, mediaId, commentId } = req.params;
    const { token } = igOf(c, igId);
    await assertOwnComment(token, igId, mediaId, commentId);
    await graph!.post(commentId, token, { hide: req.body?.hide !== false });
    res.json({ ok: true });
  });

  // Publishes a photo or a reel. Meta downloads the file from the address given.
  router.post("/meta/instagram/:igId/publish", async (req, res) => {
    const c = await connectionOf(res);
    const igId = req.params.igId;
    const { token } = igOf(c, igId);
    const kind = req.body?.kind === "reel" ? "reel" : "image";
    const caption = String(req.body?.caption ?? "");
    if (caption.length > 2200) throw new ApiError(400, "Instagram captions can be at most 2,200 characters");
    const mediaUrl = httpsUrl(req.body?.mediaUrl, kind === "reel" ? "video address" : "image address");

    const container = await graph!.post<{ id: string }>(`${igId}/media`, token, {
      caption,
      ...(kind === "reel" ? { media_type: "REELS", video_url: mediaUrl } : { image_url: mediaUrl }),
    });
    // Meta processes the upload first; a video can take a minute or two.
    const deadline = Date.now() + (kind === "reel" ? 5 * 60_000 : 60_000);
    for (;;) {
      const s = await graph!.get<{ status_code?: string; status?: string }>(container.id, token, { fields: "status_code,status" });
      if (s.status_code === "FINISHED" || s.status_code === undefined) break;
      if (s.status_code === "ERROR" || s.status_code === "EXPIRED") {
        throw new ApiError(400, `Instagram couldn't use that file: ${s.status ?? s.status_code}. Check the format and size.`);
      }
      if (Date.now() > deadline) throw new ApiError(504, "Instagram is still processing the file. Try publishing again in a few minutes.");
      await wait(2000);
    }
    const published = await graph!.post<{ id: string }>(`${igId}/media_publish`, token, { creation_id: container.id });
    const post = await graph!.get<{ permalink?: string }>(published.id, token, { fields: "permalink" }).catch(() => ({}));
    console.log(`Instagram post published for workspace ${c.workspaceId}`);
    res.status(201).json({ id: published.id, permalink: (post as { permalink?: string }).permalink });
  });

  // Public stats of any Instagram business or creator account, for vetting influencers.
  router.get("/meta/instagram/:igId/lookup", async (req, res) => {
    const c = await connectionOf(res);
    const { token } = igOf(c, req.params.igId);
    const username = String(req.query.username ?? "").trim().replace(/^@/, "");
    if (!/^[A-Za-z0-9._]{1,30}$/.test(username)) throw new ApiError(400, "Enter an Instagram username, like natgeo");
    const r = await graph!
      .get<{ business_discovery?: Record<string, any> }>(req.params.igId, token, {
        fields:
          `business_discovery.username(${username}){id,username,name,biography,website,profile_picture_url,` +
          `followers_count,follows_count,media_count,media.limit(12){${IG_MEDIA_FIELDS}}}`,
      })
      .catch((e: ApiError) => {
        if (e.status === 400 || e.status === 502) {
          throw new ApiError(404, `Couldn't look up @${username}. Only public Instagram business and creator accounts can be looked up.`);
        }
        throw e;
      });
    const d = r.business_discovery;
    if (!d) throw new ApiError(404, `Couldn't look up @${username}.`);
    const recent = ((d.media?.data ?? []) as Record<string, unknown>[]).map(toMedia);
    const avg = (vals: (number | null)[]) => {
      const known = vals.filter((v): v is number => v !== null);
      return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
    };
    const avgLikes = avg(recent.map((m) => m.likes));
    const avgComments = avg(recent.map((m) => m.comments));
    const profile = toProfile(d);
    const lookup: IgLookup = {
      profile,
      avgLikes,
      avgComments,
      engagementRate:
        profile.followers && (avgLikes !== null || avgComments !== null)
          ? ((avgLikes ?? 0) + (avgComments ?? 0)) / profile.followers
          : null,
      recent,
    };
    res.json(lookup);
  });

  /* ---------------------------- Facebook Pages ---------------------------- */

  router.get("/meta/pages/:pageId", async (req, res) => {
    const c = await connectionOf(res);
    const page = pageOf(c, req.params.pageId);
    const token = tokens!.open(page.token);
    const [info, posts, scheduled] = await Promise.all([
      graph!.get<Record<string, any>>(page.id, token, { fields: "id,name,category,link,fan_count,followers_count,picture{url}" }),
      graph!.get<{ data: Record<string, any>[] }>(`${page.id}/posts`, token, {
        fields:
          "id,message,created_time,permalink_url,full_picture,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)",
        limit: 20,
      }),
      graph!
        .get<{ data: Record<string, any>[] }>(`${page.id}/scheduled_posts`, token, { fields: "id,message,scheduled_publish_time" })
        .catch(() => ({ data: [] })),
    ]);
    const overview: FbPageOverview = {
      page: {
        id: String(info.id),
        name: String(info.name),
        category: info.category,
        link: info.link,
        fans: num(info.fan_count),
        followers: num(info.followers_count),
        pictureUrl: info.picture?.data?.url,
      },
      posts: posts.data.map((p) => ({
        id: String(p.id),
        message: p.message,
        createdAt: String(p.created_time ?? ""),
        permalink: p.permalink_url,
        picture: p.full_picture,
        reactions: num(p.reactions?.summary?.total_count),
        comments: num(p.comments?.summary?.total_count),
        shares: num(p.shares?.count) ?? 0,
      })),
      scheduled: scheduled.data.map((s) => ({
        id: String(s.id),
        message: s.message,
        scheduledAt: Number(s.scheduled_publish_time) * 1000,
      })),
    };
    res.json(overview);
  });

  // Posts to a Page now, or schedules it (10 minutes to 30 days ahead).
  router.post("/meta/pages/:pageId/posts", async (req, res) => {
    const c = await connectionOf(res);
    const page = pageOf(c, req.params.pageId);
    const token = tokens!.open(page.token);
    const message = String(req.body?.message ?? "").trim();
    const link = req.body?.link ? httpsUrl(req.body.link, "link") : undefined;
    const imageUrl = req.body?.imageUrl ? httpsUrl(req.body.imageUrl, "image address") : undefined;
    if (!message && !imageUrl && !link) throw new ApiError(400, "Write something to post");
    if (imageUrl && link) throw new ApiError(400, "A post can have a picture or a link, not both");

    let schedule: Record<string, string | number | boolean> = {};
    if (req.body?.scheduledAt) {
      const at = Number(req.body.scheduledAt);
      const ahead = at - Date.now();
      if (!Number.isFinite(at) || ahead < 10 * 60_000 || ahead > 30 * 24 * 3600_000) {
        throw new ApiError(400, "Scheduled posts must be between 10 minutes and 30 days from now");
      }
      schedule = { published: false, scheduled_publish_time: Math.floor(at / 1000) };
    }
    const result = imageUrl
      ? await graph!.post<{ id: string; post_id?: string }>(`${page.id}/photos`, token, { url: imageUrl, caption: message, ...schedule })
      : await graph!.post<{ id: string }>(`${page.id}/feed`, token, { message, link, ...schedule });
    console.log(`Facebook Page post ${schedule.published === false ? "scheduled" : "published"} for workspace ${c.workspaceId}`);
    res.status(201).json({ id: "post_id" in result && result.post_id ? result.post_id : result.id });
  });

  /* --------------------------------- Ads ---------------------------------- */

  router.get("/meta/ads/:accountId", async (req, res) => {
    const c = await connectionOf(res);
    const account = adAccountOf(c, req.params.accountId);
    const token = tokens!.open(c.userToken);
    const [summary, campaigns] = await Promise.all([
      graph!.get<{ data: Record<string, string>[] }>(`${account.id}/insights`, token, {
        date_preset: "last_30d",
        fields: AD_METRIC_FIELDS,
      }),
      graph!.all<Record<string, any>>(
        `${account.id}/campaigns`,
        token,
        {
          fields: `id,name,status,effective_status,objective,daily_budget,lifetime_budget,insights.date_preset(last_30d){${AD_METRIC_FIELDS}}`,
          limit: 50,
        },
        200,
      ),
    ]);
    const overview: AdsOverview = {
      account,
      summary: adMetrics(summary.data[0]),
      campaigns: campaigns.map(
        (x): AdCampaign => ({
          id: String(x.id),
          name: String(x.name),
          status: String(x.status ?? ""),
          effectiveStatus: String(x.effective_status ?? x.status ?? ""),
          objective: String(x.objective ?? ""),
          dailyBudget: toMajor(x.daily_budget, account.currency),
          lifetimeBudget: toMajor(x.lifetime_budget, account.currency),
          metrics: adMetrics(x.insights?.data?.[0]),
        }),
      ),
    };
    res.json(overview);
  });

  // Pauses or restarts a campaign. Restarting spends real money.
  router.post("/meta/ads/:accountId/campaigns/:campaignId/status", async (req, res) => {
    const c = await connectionOf(res);
    const account = adAccountOf(c, req.params.accountId);
    const token = tokens!.open(c.userToken);
    const status = req.body?.status;
    if (status !== "ACTIVE" && status !== "PAUSED") throw new ApiError(400, "Status must be ACTIVE or PAUSED");
    const campaign = await graph!.get<{ account_id?: string }>(req.params.campaignId, token, { fields: "account_id" });
    if (`act_${campaign.account_id}` !== account.id) throw new ApiError(404, "That campaign isn't in this ad account.");
    await graph!.post(req.params.campaignId, token, { status });
    console.log(`Meta campaign set to ${status} in workspace ${c.workspaceId}`);
    res.json({ ok: true });
  });

  // Creates a campaign, always paused: finish its ad sets and ads in Ads Manager, then start it.
  router.post("/meta/ads/:accountId/campaigns", async (req, res) => {
    const c = await connectionOf(res);
    const account = adAccountOf(c, req.params.accountId);
    const token = tokens!.open(c.userToken);
    const name = String(req.body?.name ?? "").trim();
    const objective = String(req.body?.objective ?? "");
    if (!name) throw new ApiError(400, "Give the campaign a name");
    if (name.length > 200) throw new ApiError(400, "Campaign names can be at most 200 characters");
    if (!CAMPAIGN_OBJECTIVES.some((o) => o.id === objective)) throw new ApiError(400, "Pick a campaign objective");
    const daily = req.body?.dailyBudget === undefined || req.body?.dailyBudget === "" ? null : Number(req.body.dailyBudget);
    if (daily !== null && !(daily > 0)) throw new ApiError(400, "The daily budget must be more than 0");

    const created = await graph!.post<{ id: string }>(`${account.id}/campaigns`, token, {
      name,
      objective,
      status: "PAUSED",
      special_ad_categories: [],
      ...(daily !== null
        ? { daily_budget: toMinor(daily, account.currency), bid_strategy: "LOWEST_COST_WITHOUT_CAP" }
        : { is_adset_budget_sharing_enabled: false }),
    });
    console.log(`Meta campaign created (paused) in workspace ${c.workspaceId}`);
    res.status(201).json({ id: created.id });
  });

  return { publicRouter, router };
}
