/**
 * End-to-end smoke test.
 *
 * Prereqs: `npm run build` and the API server running on :8787
 * (`npm start`), which also serves the built client.
 *
 * Signs in with MB_EMAIL / MB_PASSWORD (the server's OWNER_EMAIL / OWNER_PASSWORD).
 *
 * Usage: MB_EMAIL=… MB_PASSWORD=… node e2e/smoke.mjs [chromium-executable-path]
 */
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:8787";
const executablePath = process.argv[2] || process.env.CHROMIUM_PATH || undefined;

const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  // Resource-load failures (e.g. blocked font CDNs in sandboxes) aren't app bugs.
  if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) {
    errors.push("console: " + m.text());
  }
});
const ok = (name) => console.log("OK:", name);
const vis = (sel) => page.locator(sel).locator("visible=true").first();

/* ---------------- Sign-in ---------------- */
if (!process.env.MB_EMAIL || !process.env.MB_PASSWORD) {
  console.error("Set MB_EMAIL and MB_PASSWORD to the server's OWNER_EMAIL / OWNER_PASSWORD.");
  process.exit(1);
}
await page.goto(BASE);
await page.fill("#login-email", process.env.MB_EMAIL);
await page.fill("#login-password", "wrong-password");
await page.click("button:has-text('Sign in')");
await page.waitForSelector("text=Wrong email or password");
ok("wrong password rejected");
await page.fill("#login-password", process.env.MB_PASSWORD);
await page.click("button:has-text('Sign in')");
await page.waitForSelector("text=What do you want to achieve?");
await page.reload();
await page.waitForSelector("text=What do you want to achieve?");
ok("signed in, session survives reload");

/* ---------------- Module 1: plan & execute ---------------- */
await page.waitForSelector("text=What do you want to achieve?");
ok("landing loads");

await page.click("text=Launch Ad Campaign With Influencers");
await page.click("text=Plan Workflow");
await page.waitForSelector("text=A few details before we plan", { timeout: 10000 });
const fieldCount = await page.locator("label").count();
console.log("   influencer context fields:", fieldCount);
ok("conditional context form");

await page.click("text=Generate Marketing Plans");
await page.waitForSelector("text=Recommended Marketing Strategy", { timeout: 20000 });
ok("plans generated via API");

await page.locator("button:has-text('Select Plan')").first().click();
await page.waitForSelector("button:has-text('Execute Plan')");
await page.click("button:has-text('Execute Plan')");
await page.waitForSelector("text=Campaign execution in progress", { timeout: 10000 });
ok("run created, execution live");

await page.waitForSelector("text=Review purchase orders", { timeout: 30000 });
ok("PO approval gate reached");
await page.click("button:has-text('Reject')");
await page.waitForSelector("text=Execution halted");
await page.click("button:has-text('Review again')");
await page.waitForSelector("button:has-text('Approve')");
await page.click("button:has-text('Approve')");
ok("reject/reopen/approve round-trip");

await page.waitForSelector("text=Confirm campaign go-live", { timeout: 40000 });
await page.click("button:has-text('Approve')");
await page.waitForSelector("text=Execution completed", { timeout: 40000 });
ok("run completed");

/* ---------------- Module 2: marketplace ---------------- */
await vis("text=Influencer Marketplace").click();
await page.waitForSelector("text=Your influencer portfolio", { timeout: 10000 });
await page.waitForSelector("text=Ananya Rao");
ok("marketplace list loads");

// Invest flow with validation
const walletBefore = await vis("text=Wallet balance").locator("xpath=..").textContent();
await page.locator("button:has-text('Invest')").first().click();
await page.waitForSelector("#trade-amount");
await page.fill("#trade-amount", "2");
await page.click("button:has-text('Invest ₹2L')");
await page.waitForSelector("#trade-amount", { state: "detached", timeout: 10000 });
ok("invest ₹2L executed (wallet before: " + (walletBefore ?? "?").trim() + ")");

// Detail view + product scoping + tabs
await vis("text=Sana Kapoor").click();
await page.waitForSelector("text=Your investment", { timeout: 10000 });
await page.waitForSelector("text=ROI trend — last 12 weeks");
await page.selectOption("#detail-product", "glow-serum");
await page.waitForSelector("text=Scoped to one product campaign", { timeout: 10000 });
ok("detail view + product dropdown");

await page.click("button:has-text('Payments')");
await page.waitForSelector("text=Payment schedule");
await page.click("button:has-text('Posts')");
await vis("text=Likes").waitFor({ timeout: 10000 });
await page.click("button:has-text('Alerts')");
ok("tasks/payments/alerts/posts tabs render");

const resolveBtn = page.locator("button:has-text('Mark answered'), button:has-text('Resolve')").first();
if (await resolveBtn.count()) {
  await resolveBtn.click();
  await page.waitForSelector("text=Resolved", { timeout: 10000 });
  ok("alert resolved via API");
}

// Compare
await page.locator("main button:has-text('Marketplace')").first().click();
await page.waitForSelector("text=Your influencer portfolio");
const checks = page.locator("input[type=checkbox]");
await checks.nth(0).check();
await checks.nth(1).check();
await checks.nth(2).check();
await page.click("button:has-text('Compare (3)')");
await page.waitForSelector("text=Compare influencers", { timeout: 10000 });
await vis("text=Attributed sales").waitFor({ timeout: 10000 });
ok("compare view with 3 influencers");

/* ---------------- Sign-out ---------------- */
await vis("aside >> text=Account").click();
await page.click("button:has-text('Sign out')");
await page.waitForSelector("#login-email");
await page.reload();
await page.waitForSelector("#login-email");
ok("signed out, stays signed out after reload");

if (errors.length) {
  console.log("BROWSER ERRORS:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("ALL PASSED");
await browser.close();
