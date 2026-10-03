/**
 * Facebook & Instagram end-to-end, against the fake Meta in e2e/fakeMeta.mjs:
 * connect, Instagram stats / comments / publishing, Page posts, ads,
 * influencer lookup, the security checks, disconnect, and Meta's
 * deauthorize and data deletion callbacks.
 *
 * Prereqs: `npm run build`, then in two terminals
 *   node e2e/fakeMeta.mjs 8790
 *   META_APP_ID=test-app META_APP_SECRET=test-secret META_GRAPH_URL=http://localhost:8790 \
 *     META_DIALOG_URL=http://localhost:8790 DB_FILE=./data/meta-test.db npm start
 * Usage: node e2e/meta.mjs [chromium-executable-path]
 */
import crypto from "node:crypto";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:8787";
const FAKE = process.env.FAKE_META_URL ?? "http://localhost:8790";
const SECRET = process.env.FAKE_META_SECRET ?? "test-secret";
const executablePath = process.argv[2] || process.env.CHROMIUM_PATH || undefined;
const ok = (name) => console.log("OK:", name);
const fail = (msg) => {
  throw new Error(msg);
};
const actions = async () => (await fetch(`${FAKE}/__actions`)).json();
const lastAction = async (key) => (await actions()).filter((a) => key in a).at(-1)?.[key];

const browser = await chromium.launch({ executablePath });
const errors = [];
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.grantPermissions(["clipboard-read", "clipboard-write"]);
const page = await context.newPage();
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
const vis = (sel) => page.locator(sel).locator("visible=true").first();
const dialog = () => page.locator("[role=dialog]");

/** Calls the Marketbing API as the signed-in browser user. */
const api = async (path, init = {}, token) => {
  const t = token ?? (await page.evaluate(() => localStorage.getItem("marketbing-session")));
  const res = await fetch(`${BASE}/api${path}`, {
    ...init,
    redirect: "manual",
    headers: { "content-type": "application/json", authorization: `Bearer ${t}`, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body, location: res.headers.get("location") };
};

/* ---- sign up and open the section ---- */
const stamp = Date.now();
await page.goto(BASE);
await page.click("text=Create an account");
await page.fill("#signup-workspace", `Meta Test ${stamp}`);
await page.fill("#login-email", `meta-${stamp}@example.com`);
await page.fill("#login-password", "owner-password-1");
await page.click("button:has-text('Create account')");
await page.waitForSelector("text=What do you want to achieve?", { timeout: 10000 });
await vis("aside >> text=Facebook & Instagram").click();
await page.waitForSelector("text=Connect Facebook");
const redirectField = await page.locator("dd input").first().inputValue();
if (!redirectField.endsWith("/api/meta/callback")) fail("unexpected redirect URI shown: " + redirectField);
ok("setup addresses shown to the owner");

/* ---- connect ---- */
await page.click("button:has-text('Connect Facebook')");
await page.waitForSelector("text=Facebook is connected.", { timeout: 15000 });
await page.waitForSelector("[data-meta-account]:has-text('Priya Sharma')");
if (page.url().includes("#meta")) fail("#meta left in the address bar");
const dialogCall = await lastAction("dialog");
if (dialogCall.client_id !== "test-app" || !dialogCall.scope.includes("instagram_content_publish")) fail("dialog asked for: " + JSON.stringify(dialogCall));
ok("connected through Meta's sign-in and back");

/* ---- Instagram ---- */
await page.waitForSelector("text=@novaskin");
const followers = await vis("[data-stat-tile]:has-text('Followers')").textContent();
if (!followers.includes("85.2k")) fail("followers tile: " + followers);
await vis("[data-stat-tile]:has-text('Reach')").waitFor();
ok("Instagram profile and 28-day stats");

await page.click("[data-ig-media=m1]");
await dialog().locator("text=Love this!").waitFor();
await dialog().locator("[data-ig-comment=c1] >> text=Reply").click();
await dialog().locator("input[aria-label=Reply]").fill("Thank you! 💛");
await dialog().locator("button:has-text('Send')").click();
await dialog().locator("text=Thank you! 💛").waitFor();
if ((await actions()).find((a) => a.replied === "c1")?.message !== "Thank you! 💛") fail("reply not sent to Meta");
await dialog().locator("[data-ig-comment=c2] >> button:has-text('Hide')").click();
await dialog().locator("[data-ig-comment=c2] >> text=Hidden").waitFor();
ok("replied to and hid comments");
await dialog().locator("button[aria-label=Close]").click();

await page.click("button:has-text('New post')");
await page.fill("#ig-media-url", "https://cdn.example.com/serum.jpg");
await page.fill("#ig-caption", "New drop 🌿 #skincare");
await page.click("button:has-text('Publish now')");
await page.waitForSelector("text=is live on Instagram", { timeout: 15000 });
const published = await lastAction("igPublished");
if (published.image_url !== "https://cdn.example.com/serum.jpg" || published.caption !== "New drop 🌿 #skincare") fail("published: " + JSON.stringify(published));
await page.click("button:has-text('Done')");
ok("published an Instagram photo");

/* ---- Facebook Pages ---- */
await page.click("[role=tab]:has-text('Facebook Pages')");
await page.waitForSelector("text=Our new serum is here");
await page.fill("#fb-message", "Weekend sale: 20% off");
await page.click("button:has-text('Post now')");
await page.waitForSelector("text=Posted to your Page.");
await vis("[data-fb-post] >> text=Weekend sale: 20% off").waitFor();
await page.fill("#fb-message", "Coming soon");
await page.check("text=Schedule for later");
await page.click("button:has-text('Schedule post')");
await page.waitForSelector("text=Scheduled for");
const sched = await lastAction("pagePost");
if (sched.published !== "false" || !(Number(sched.scheduled_publish_time) > Date.now() / 1000 + 600)) fail("schedule: " + JSON.stringify(sched));
await page.selectOption("#fb-page", "p2");
await page.waitForSelector("text=No posts yet.");
ok("posted and scheduled on Facebook Pages, switched Page");

/* ---- Ads ---- */
await page.click("[role=tab]:has-text('Ads')");
await page.waitForSelector("text=Diwali Sale");
const spent = await vis("[data-stat-tile]:has-text('Spent')").textContent();
if (!/52,000\.75/.test(spent)) fail("spent tile: " + spent);
const budget = await page.locator("[data-campaign=cmp1]").textContent();
if (!/5,000/.test(budget)) fail("daily budget not converted from paise: " + budget);
await page.click("[data-campaign=cmp1] >> button:has-text('Pause')");
await page.waitForSelector("[data-campaign=cmp1] >> button:has-text('Start')");
await page.click("[data-campaign=cmp2] >> button:has-text('Start')");
await dialog().locator("text=spending money").waitFor();
await dialog().locator("button:has-text('Start campaign')").click();
await page.waitForSelector("[data-campaign=cmp2] >> button:has-text('Pause')");
const statuses = (await actions()).filter((a) => a.campaignStatus).map((a) => a.campaignStatus);
if (JSON.stringify(statuses) !== JSON.stringify([{ id: "cmp1", status: "PAUSED" }, { id: "cmp2", status: "ACTIVE" }])) fail("statuses: " + JSON.stringify(statuses));
await page.click("button:has-text('New campaign')");
await page.fill("#campaign-name", "Winter launch");
await page.fill("#campaign-budget", "1000");
await page.click("button:has-text('Create paused campaign')");
await page.waitForSelector("text=Winter launch");
const created = await lastAction("campaignCreated");
if (created.status !== "PAUSED" || created.daily_budget !== "100000" || created.special_ad_categories !== "[]") fail("created: " + JSON.stringify(created));
ok("ads: stats, pause, start (with confirmation), new paused campaign");

/* ---- influencer lookup ---- */
await page.click("[role=tab]:has-text('Find influencers')");
await page.fill("#ig-lookup", "@glowwithmeera");
await page.click("button:has-text('Look up')");
await page.waitForSelector("text=@glowwithmeera");
const rate = await vis("[data-stat-tile]:has-text('Engagement rate')").textContent();
if (!rate.includes("2.57%")) fail("engagement rate: " + rate);
await page.fill("#ig-lookup", "nobody_here");
await page.click("button:has-text('Look up')");
await page.waitForSelector("text=Couldn't look up @nobody_here");
ok("influencer lookup with engagement rate, and a friendly miss");

/* ---- phone width ---- */
await page.setViewportSize({ width: 390, height: 844 });
for (const tab of ["Instagram", "Facebook Pages", "Ads", "Find influencers"]) {
  await page.click(`[role=tab]:has-text('${tab}')`);
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) fail(`${tab} is ${overflow}px wider than a phone screen`);
}
await page.setViewportSize({ width: 1280, height: 900 });
ok("fits a phone screen");

/* ---- security checks ---- */
if ((await api("/meta/pages/p999")).status !== 404) fail("unknown page not refused");
if ((await api("/meta/instagram/ig1/media/mX")).status !== 404) fail("someone else's post not refused");
const otherCampaign = await api("/meta/ads/act_100/campaigns/cmpOther/status", { method: "POST", body: JSON.stringify({ status: "ACTIVE" }) });
if (otherCampaign.status !== 404) fail("campaign from another ad account not refused: " + otherCampaign.status);
if ((await api("/meta/ads/act_100/campaigns", { method: "POST", body: JSON.stringify({ name: "x", objective: "OUTCOME_SALES", dailyBudget: -5 }) })).status !== 400) fail("negative budget accepted");
if ((await api("/meta/instagram/ig1/publish", { method: "POST", body: JSON.stringify({ mediaUrl: "http://insecure.example.com/a.jpg" }) })).status !== 400) fail("http media accepted");
const statusJson = await api("/meta/status");
if (JSON.stringify(statusJson.body).includes("v1:")) fail("encrypted tokens leaked in /meta/status");
if (JSON.stringify(statusJson.body).includes("PAGE_TOKEN")) fail("page token leaked in /meta/status");
ok("refuses other accounts' pages, posts and campaigns; validates input; no tokens in replies");

const forged = await api("/meta/callback?code=CODE123&state=forged.state");
if (forged.status !== 303 || !forged.location.includes("#meta=error:")) fail("forged state: " + JSON.stringify(forged));
// A real state, but returned without the browser's cookie (someone else's link).
const started = await api("/meta/connect", { method: "POST" });
const state = new URL(started.body.url).searchParams.get("state");
const noCookie = await api(`/meta/callback?code=CODE123&state=${encodeURIComponent(state)}`);
if (!decodeURIComponent(noCookie.location ?? "").includes("didn't come from your browser")) fail("callback without the cookie: " + noCookie.location);
ok("rejects forged and replayed-elsewhere sign-in returns");

/* ---- team members use it but can't connect ---- */
const invite = await api("/team/invites", { method: "POST", body: JSON.stringify({ email: `member-${stamp}@example.com` }) });
const joined = await fetch(`${BASE}/api/auth/invite/accept`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ token: invite.body.token, password: "member-password-1" }),
}).then((r) => r.json());
const memberStatus = await api("/meta/status", {}, joined.token);
if (!memberStatus.body.connected || memberStatus.body.canManage || memberStatus.body.setup) fail("member status: " + JSON.stringify(memberStatus.body));
if ((await api("/meta/connect", { method: "POST" }, joined.token)).status !== 403) fail("member could connect");
if ((await api("/meta/connection", { method: "DELETE" }, joined.token)).status !== 403) fail("member could disconnect");
if ((await api("/meta/instagram/ig1", {}, joined.token)).status !== 200) fail("member can't see Instagram");
ok("team members share the connection but can't connect or disconnect");

/* ---- disconnect and reconnect ---- */
await vis("aside >> text=Facebook & Instagram").click();
await page.click("button:has-text('Disconnect')");
await dialog().locator("button:has-text('Disconnect')").click();
await page.waitForSelector("button:has-text('Connect Facebook')");
if (!(await lastAction("revoked"))) fail("access not withdrawn on Meta's side");
await page.click("button:has-text('Connect Facebook')");
await page.waitForSelector("[data-meta-account]:has-text('Priya Sharma')", { timeout: 15000 });
ok("disconnect (withdrawing access on Meta) and reconnect");

/* ---- expired token: a clear message, and still signed in to Marketbing ---- */
await fetch(`${FAKE}/__expire`);
const expired = await api("/meta/instagram/ig1");
if (expired.status !== 409 || !/expired/.test(expired.body.error)) fail("expired token: " + JSON.stringify(expired));
await page.click("[role=tab]:has-text('Instagram')");
await page.click("button:has-text('Reload')");
await page.waitForSelector("text=The Facebook connection has expired or was removed");
await vis("aside >> text=Team").click();
await page.waitForSelector(`text=meta-${stamp}@example.com`);
ok("expired Facebook token explained, Marketbing session kept");

/* ---- Meta's deauthorize and data deletion callbacks ---- */
const signed = (data, secret = SECRET) => {
  const payload = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", issued_at: Math.floor(Date.now() / 1000), ...data })).toString("base64url");
  return `${crypto.createHmac("sha256", secret).update(payload).digest("base64url")}.${payload}`;
};
const formPost = (path, signedRequest) =>
  fetch(`${BASE}/api${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ signed_request: signedRequest }),
  });
if ((await formPost("/meta/deauthorize", signed({ user_id: "fbuser1" }, "wrong-secret"))).status !== 400) fail("forged deauthorize accepted");
if (!(await api("/meta/status")).body.connected) fail("forged deauthorize removed the connection");
if ((await formPost("/meta/deauthorize", signed({ user_id: "fbuser1" }))).status !== 200) fail("deauthorize refused");
if ((await api("/meta/status")).body.connected) fail("deauthorize kept the connection");
const deletion = await (await formPost("/meta/data-deletion", signed({ user_id: "fbuser1" }))).json();
if (!deletion.confirmation_code || !deletion.url.includes("/api/meta/data-deletion/status?code=")) fail("deletion: " + JSON.stringify(deletion));
const statusPage = await (await fetch(deletion.url)).text();
if (!statusPage.includes("Done.")) fail("deletion status page: " + statusPage);
ok("Meta's deauthorize and data deletion callbacks (signed, forged rejected)");

if (errors.length) fail("page errors:\n" + errors.join("\n"));
await browser.close();
console.log("\nAll Facebook & Instagram checks passed.");
