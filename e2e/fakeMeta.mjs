/**
 * A stand-in for Meta's Graph API and sign-in dialog, for testing the
 * Facebook & Instagram section without a real Meta app.
 *
 * It "approves" every sign-in straight away, checks appsecret_proof on
 * every call like Meta does, and records the changes it was asked to make.
 * Point the server at it with META_GRAPH_URL and META_DIALOG_URL.
 *
 * Usage: node e2e/fakeMeta.mjs [port]   (app secret: FAKE_META_SECRET or "test-secret")
 */
import crypto from "node:crypto";
import http from "node:http";

const PORT = Number(process.argv[2] ?? process.env.FAKE_META_PORT ?? 8790);
const SECRET = process.env.FAKE_META_SECRET ?? "test-secret";
const V = "/v24.0";

const USER_TOKEN = "LONG_USER_TOKEN";
const PAGE_TOKEN = "PAGE_TOKEN_1";
const tokens = new Set([USER_TOKEN, PAGE_TOKEN, "PAGE_TOKEN_2"]);

const pages = [
  {
    id: "p1",
    name: "NovaSkin",
    category: "Beauty",
    access_token: PAGE_TOKEN,
    instagram_business_account: { id: "ig1", username: "novaskin", name: "NovaSkin", followers_count: 85200 },
  },
  { id: "p2", name: "NovaSkin Outlet", category: "Shopping", access_token: "PAGE_TOKEN_2" },
];
const media = [
  { id: "m1", caption: "Glow serum launch ✨", media_type: "IMAGE", media_product_type: "FEED", media_url: "https://example.com/m1.jpg", permalink: "https://instagram.com/p/m1", timestamp: "2026-09-30T10:00:00+0000", like_count: 1520, comments_count: 2, owner: { id: "ig1" } },
  { id: "m2", caption: "Behind the scenes", media_type: "VIDEO", media_product_type: "REELS", thumbnail_url: "https://example.com/m2.jpg", permalink: "https://instagram.com/reel/m2", timestamp: "2026-09-28T10:00:00+0000", like_count: 3100, comments_count: 0, owner: { id: "ig1" } },
  { id: "mX", caption: "Someone else's post", media_type: "IMAGE", timestamp: "2026-09-01T00:00:00+0000", owner: { id: "other" } },
];
const comments = [
  { id: "c1", text: "Love this!", username: "fan_1", timestamp: "2026-09-30T11:00:00+0000", hidden: false, like_count: 3, media: { id: "m1" }, replies: { data: [] } },
  { id: "c2", text: "Spam spam", username: "spammer", timestamp: "2026-09-30T12:00:00+0000", hidden: false, media: { id: "m1" }, replies: { data: [] } },
];
const campaigns = [
  { id: "cmp1", account_id: "100", name: "Diwali Sale", status: "ACTIVE", effective_status: "ACTIVE", objective: "OUTCOME_SALES", daily_budget: "500000", insights: { data: [{ spend: "41250.5", impressions: "820000", reach: "390000", clicks: "12500", ctr: "1.52", cpc: "3.3" }] } },
  { id: "cmp2", account_id: "100", name: "Serum Awareness", status: "PAUSED", effective_status: "PAUSED", objective: "OUTCOME_AWARENESS", lifetime_budget: "2000000" },
];
const pagePosts = [{ id: "p1_1", message: "Our new serum is here", created_time: "2026-09-29T09:00:00+0000", permalink_url: "https://facebook.com/p1_1", shares: { count: 12 }, reactions: { summary: { total_count: 240 } }, comments: { summary: { total_count: 31 } } }];
const scheduled = [];
const containers = new Map();
let nextId = 1;

/** Everything the app asked Meta to change, for the test to check. */
const actions = [];

const send = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};
const oauthError = (res, message, code = 190) => send(res, 400, { error: { message, type: "OAuthException", code } });

function checkToken(params, res) {
  const token = params.get("access_token");
  if (!token || !tokens.has(token)) {
    oauthError(res, "Invalid OAuth access token.");
    return null;
  }
  const proof = crypto.createHmac("sha256", SECRET).update(token).digest("hex");
  if (params.get("appsecret_proof") !== proof) {
    oauthError(res, "Invalid appsecret_proof provided in the API argument", 100);
    return null;
  }
  return token;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let params = url.searchParams;
  if (req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    params = new URLSearchParams(body);
  }
  const path = url.pathname.startsWith(V) ? url.pathname.slice(V.length) : url.pathname;
  const fields = params.get("fields") ?? "";

  if (path === "/__actions") return send(res, 200, actions);
  if (path === "/__expire") {
    tokens.delete(USER_TOKEN);
    tokens.delete(PAGE_TOKEN);
    return send(res, 200, { ok: true });
  }

  // The sign-in dialog: approve at once and go back to the app.
  if (path === "/dialog/oauth") {
    const back = new URL(params.get("redirect_uri"));
    back.searchParams.set("code", "CODE123");
    back.searchParams.set("state", params.get("state"));
    actions.push({ dialog: { scope: params.get("scope"), client_id: params.get("client_id") } });
    res.writeHead(302, { location: back.toString() });
    return res.end();
  }
  if (path === "/oauth/access_token") {
    if (params.get("client_secret") !== SECRET) return oauthError(res, "Error validating client secret.", 1);
    if (params.get("code")) {
      return params.get("code") === "CODE123" ? send(res, 200, { access_token: "SHORT_TOKEN", token_type: "bearer" }) : oauthError(res, "Invalid verification code", 100);
    }
    if (params.get("fb_exchange_token") === "SHORT_TOKEN") return send(res, 200, { access_token: USER_TOKEN, token_type: "bearer", expires_in: 5184000 });
    return oauthError(res, "Invalid token exchange", 100);
  }

  const token = checkToken(params, res);
  if (!token) return;
  const seg = path.split("/").filter(Boolean);

  if (path === "/me") return send(res, 200, { id: "fbuser1", name: "Priya Sharma" });
  if (path === "/me/permissions") {
    if (req.method === "DELETE") {
      actions.push({ revoked: true });
      return send(res, 200, { success: true });
    }
    const granted = ["business_management", "pages_show_list", "pages_read_engagement", "pages_manage_posts", "read_insights", "instagram_basic", "instagram_manage_insights", "instagram_manage_comments", "instagram_content_publish", "ads_read", "ads_management"];
    return send(res, 200, { data: granted.map((permission) => ({ permission, status: "granted" })) });
  }
  if (path === "/me/accounts") return send(res, 200, { data: pages });
  if (path === "/me/adaccounts") return send(res, 200, { data: [{ id: "act_100", name: "NovaSkin Ads", currency: "INR", account_status: 1 }] });

  // Instagram account
  if (seg[0] === "ig1" && seg.length === 1) {
    if (fields.startsWith("business_discovery")) {
      const username = /business_discovery\.username\(([^)]+)\)/.exec(fields)?.[1];
      if (username !== "glowwithmeera") return send(res, 400, { error: { message: "Invalid user id", code: 110, error_subcode: 2207013 } });
      return send(res, 200, {
        business_discovery: {
          id: "ig9", username, name: "Meera", followers_count: 120000, follows_count: 300, media_count: 410,
          media: { data: [{ id: "d1", like_count: 4000, comments_count: 100, timestamp: "2026-09-01T00:00:00+0000", media_type: "IMAGE", permalink: "https://instagram.com/p/d1" }, { id: "d2", like_count: 2000, comments_count: 60, timestamp: "2026-09-02T00:00:00+0000", media_type: "IMAGE", permalink: "https://instagram.com/p/d2" }] },
        },
      });
    }
    return send(res, 200, { id: "ig1", username: "novaskin", name: "NovaSkin", biography: "Clean skincare", followers_count: 85200, follows_count: 120, media_count: 342 });
  }
  if (path === "/ig1/media" && req.method === "GET") return send(res, 200, { data: media.filter((m) => m.owner.id === "ig1") });
  if (path === "/ig1/insights") {
    // Like Meta after retiring a metric: one unknown name fails the whole request.
    if (params.get("metric").split(",").includes("saves")) {
      return send(res, 400, { error: { message: "(#100) metric[7] must be one of the following values: reach, accounts_engaged, total_interactions", code: 100 } });
    }
    return send(res, 200, { data: params.get("metric").split(",").map((name, i) => ({ name, period: "day", total_value: { value: 1000 * (i + 1) } })) });
  }
  if (path === "/ig1/media" && req.method === "POST") {
    const id = `cont${nextId++}`;
    containers.set(id, { polls: 0, params: Object.fromEntries(params) });
    return send(res, 200, { id });
  }
  if (containers.has(seg[0]) && seg.length === 1) {
    const c = containers.get(seg[0]);
    c.polls++;
    return send(res, 200, { status_code: c.polls > 1 ? "FINISHED" : "IN_PROGRESS", id: seg[0] });
  }
  if (path === "/ig1/media_publish") {
    const c = containers.get(params.get("creation_id"));
    if (!c) return send(res, 400, { error: { message: "Invalid creation id", code: 100 } });
    const id = `pub${nextId++}`;
    actions.push({ igPublished: { caption: c.params.caption, image_url: c.params.image_url, video_url: c.params.video_url } });
    media.unshift({ id, caption: c.params.caption, media_type: "IMAGE", timestamp: new Date().toISOString(), like_count: 0, comments_count: 0, permalink: `https://instagram.com/p/${id}`, owner: { id: "ig1" } });
    return send(res, 200, { id });
  }
  const m = media.find((x) => x.id === seg[0]);
  if (m && seg.length === 1) {
    return send(res, 200, fields === "owner" ? { owner: m.owner, id: m.id } : { id: m.id, permalink: m.permalink });
  }
  if (m && seg[1] === "insights") return send(res, 200, { data: [{ name: "reach", values: [{ value: 9100 }] }, { name: "likes", values: [{ value: m.like_count }] }] });
  if (m && seg[1] === "comments") return send(res, 200, { data: comments.filter((c) => c.media.id === m.id) });
  const comment = comments.find((c) => c.id === seg[0]);
  if (comment && seg.length === 1 && req.method === "GET") return send(res, 200, { id: comment.id, media: comment.media });
  if (comment && seg.length === 1 && req.method === "POST") {
    comment.hidden = params.get("hide") === "true";
    actions.push({ hidden: comment.id, hide: comment.hidden });
    return send(res, 200, { success: true });
  }
  if (comment && seg[1] === "replies") {
    const reply = { id: `r${nextId++}`, text: params.get("message"), username: "novaskin", timestamp: new Date().toISOString() };
    comment.replies.data.push(reply);
    actions.push({ replied: comment.id, message: reply.text });
    return send(res, 200, { id: reply.id });
  }

  // Facebook Pages
  if (seg[0] === "p1" || seg[0] === "p2") {
    if (token !== (seg[0] === "p1" ? PAGE_TOKEN : "PAGE_TOKEN_2")) return oauthError(res, "Page token required", 210);
    if (seg.length === 1) return send(res, 200, { id: seg[0], name: pages.find((p) => p.id === seg[0]).name, category: "Beauty", link: `https://facebook.com/${seg[0]}`, fan_count: 18000, followers_count: 21000 });
    if (seg[1] === "posts") return send(res, 200, { data: seg[0] === "p1" ? pagePosts : [] });
    if (seg[1] === "scheduled_posts") return send(res, 200, { data: scheduled });
    if (seg[1] === "feed" || seg[1] === "photos") {
      const id = `${seg[0]}_${nextId++}`;
      const entry = Object.fromEntries(params);
      delete entry.access_token;
      delete entry.appsecret_proof;
      actions.push({ pagePost: { page: seg[0], edge: seg[1], ...entry } });
      if (params.get("published") === "false") {
        scheduled.push({ id, message: params.get("message") ?? params.get("caption"), scheduled_publish_time: Number(params.get("scheduled_publish_time")) });
      } else {
        pagePosts.unshift({ id, message: params.get("message") ?? params.get("caption"), created_time: new Date().toISOString(), reactions: { summary: { total_count: 0 } }, comments: { summary: { total_count: 0 } } });
      }
      return send(res, 200, seg[1] === "photos" ? { id: `photo${nextId}`, post_id: id } : { id });
    }
  }

  // Ads
  if (path === "/act_100/insights") return send(res, 200, { data: [{ spend: "52000.75", impressions: "1000000", reach: "480000", clicks: "15100", ctr: "1.51", cpc: "3.44" }] });
  if (path === "/act_100/campaigns" && req.method === "GET") return send(res, 200, { data: campaigns });
  if (path === "/act_100/campaigns" && req.method === "POST") {
    const id = `cmp${nextId++}`;
    const entry = Object.fromEntries(params);
    actions.push({ campaignCreated: { name: entry.name, objective: entry.objective, status: entry.status, daily_budget: entry.daily_budget, special_ad_categories: entry.special_ad_categories } });
    campaigns.push({ id, account_id: "100", name: entry.name, status: "PAUSED", effective_status: "PAUSED", objective: entry.objective, daily_budget: entry.daily_budget });
    return send(res, 200, { id });
  }
  const campaign = campaigns.find((c) => c.id === seg[0]);
  if (campaign && req.method === "GET") return send(res, 200, { id: campaign.id, account_id: campaign.account_id });
  if (campaign && req.method === "POST") {
    campaign.status = campaign.effective_status = params.get("status");
    actions.push({ campaignStatus: { id: campaign.id, status: campaign.status } });
    return send(res, 200, { success: true });
  }
  if (seg[0] === "cmpOther") return send(res, 200, { id: "cmpOther", account_id: "999" });

  send(res, 400, { error: { message: `Unsupported request: ${req.method} ${path}`, code: 100 } });
});

server.listen(PORT, () => console.log(`Fake Meta on http://localhost:${PORT}`));
