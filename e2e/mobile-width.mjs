/**
 * Phone-width check: walks every screen at 360px wide (a common small
 * Android width) and fails if anything makes the page scroll sideways.
 * Wide tables that scroll inside their own box are fine.
 *
 * Prereqs: same as smoke.mjs. Optional SHOTS=dir saves a screenshot per screen.
 * Signs in with MB_EMAIL / MB_PASSWORD, like smoke.mjs. With FAKE_META=1 (server
 * pointed at e2e/fakeMeta.mjs, see e2e/meta.mjs) it also connects Facebook and
 * checks every Facebook & Instagram tab and dialog.
 * Usage: MB_EMAIL=… MB_PASSWORD=… node e2e/mobile-width.mjs [chromium-executable-path]
 */
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:8787";
const SHOTS = process.env.SHOTS;
const executablePath = process.argv[2] || process.env.CHROMIUM_PATH || undefined;
const WIDTH = Number(process.env.WIDTH ?? 360);

const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: WIDTH, height: 780 }, isMobile: true, hasTouch: true });
const problems = [];

async function check(name) {
  await page.waitForTimeout(400);
  const result = await page.evaluate((width) => {
    const doc = document.documentElement;
    const offenders = [];
    const describe = (el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`;
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // Content inside a box that scrolls or clips on its own is fine.
      let clipped = false;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (getComputedStyle(p).overflowX !== "visible") { clipped = true; break; }
      }
      if (clipped) continue;
      if (r.right > width + 1) {
        offenders.push(`${describe(el)} → right edge ${Math.round(r.right)}px`);
        continue;
      }
      // Also catch things that poke out of their container's right padding
      // into the page gutter (they fit the screen but look cut off).
      const parent = el.parentElement;
      if (!parent || getComputedStyle(el).position === "fixed" || getComputedStyle(el).position === "absolute") continue;
      const pr = parent.getBoundingClientRect();
      const padRight = parseFloat(getComputedStyle(parent).paddingRight) || 0;
      if (r.right > pr.right - padRight + 2) {
        offenders.push(`${describe(el)} → sticks out of its container by ${Math.round(r.right - (pr.right - padRight))}px`);
      }
    }
    // Stat tiles side by side must show their numbers on one line.
    const rows = new Map();
    for (const tile of document.querySelectorAll("[data-stat-tile]")) {
      const r = tile.getBoundingClientRect();
      if (r.width === 0) continue;
      const value = tile.querySelector("[data-stat-value]").getBoundingClientRect();
      const key = Math.round(r.top);
      rows.set(key, [...(rows.get(key) ?? []), { value: Math.round(value.top), text: tile.textContent }]);
    }
    for (const tiles of rows.values()) {
      const tops = tiles.map((t) => t.value);
      if (Math.max(...tops) - Math.min(...tops) > 1) {
        offenders.push(`stat values not level: ${tiles.map((t) => `"${t.text}" at ${t.value}px`).join(", ")}`);
      }
    }
    return { scrollWidth: doc.scrollWidth, offenders: offenders.slice(0, 5) };
  }, WIDTH);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  if (result.scrollWidth > WIDTH || result.offenders.length) {
    problems.push(`${name}: page is ${result.scrollWidth}px wide\n    ${result.offenders.join("\n    ")}`);
    console.log("WIDE:", name);
  } else {
    console.log("OK:", name);
  }
}

const vis = (sel) => page.locator(sel).locator("visible=true").first();
const menu = async (label) => {
  await page.click("button[aria-label='Open menu']");
  await vis(`aside >> text=${label}`).click();
};

await page.goto(BASE);
await page.waitForSelector("#login-email");
await check("sign-in");
await page.click("text=Create an account");
await page.waitForSelector("#signup-workspace");
await check("sign-up");
await page.click("button:has-text('Sign in') >> nth=-1");
await page.fill("#login-email", process.env.MB_EMAIL ?? "");
await page.fill("#login-password", process.env.MB_PASSWORD ?? "");
await page.click("button:has-text('Sign in')");
await page.waitForSelector("text=What do you want to achieve?");
await check("planning-objective");

await page.click("text=Launch Ad Campaign With Influencers");
await page.click("text=Plan Workflow");
await page.waitForSelector("text=A few details before we plan", { timeout: 10000 });
await check("planning-context");
await page.click("text=Generate Marketing Plans");
await page.waitForSelector("text=Recommended Marketing Strategy", { timeout: 20000 });
await check("planning-plans");
await page.locator("button:has-text('Select Plan')").first().click();
await page.waitForSelector("button:has-text('Execute Plan')");
await check("planning-plan-detail");
await page.click("button:has-text('Execute Plan')");
await page.waitForSelector("text=Campaign execution in progress", { timeout: 10000 });
await page.waitForSelector("text=Review purchase orders", { timeout: 30000 });
await check("planning-execution");

await menu("Dashboard");
await page.waitForTimeout(500);
await check("dashboard");

await menu("Influencer Marketplace");
await vis("text=Ananya Rao").waitFor({ timeout: 10000 });
await check("marketplace-list");
await vis("button:has-text('Invest')").click();
await page.waitForSelector("#trade-amount");
await check("marketplace-trade-modal");
await page.keyboard.press("Escape");
await page.locator("#trade-amount").waitFor({ state: "detached", timeout: 3000 }).catch(async () => {
  await vis("button:has-text('Cancel')").click();
});

await vis("text=Sana Kapoor").click();
await vis("text=Your investment").waitFor({ timeout: 10000 });
await check("marketplace-detail");
for (const tab of ["Payments", "Alerts", "Posts"]) {
  const t = vis(`button:has-text('${tab}')`);
  if (await t.count()) {
    await t.click();
    await check(`marketplace-detail-${tab.toLowerCase()}`);
  }
}

// Compare view (ticks the first three influencers).
await page.locator("main button:has-text('Marketplace')").first().click();
await vis("text=Ananya Rao").waitFor({ timeout: 10000 });
const ticks = page.locator("input[type=checkbox]").locator("visible=true");
for (let i = 0; i < 3; i++) await ticks.nth(i).check();
await vis("button:has-text('Compare (3)')").click();
await vis("text=Attributed sales").waitFor({ timeout: 10000 });
await check("marketplace-compare");

await menu("Finance");
await check("finance");
await menu("Settings");
await check("settings");
await menu("Team");
await page.waitForSelector("text=Invite a teammate");
await page.fill("#invite-email", `width-${Date.now()}@example.com`);
await page.click("button:has-text('Create invite link')");
await page.waitForSelector("#invite-link");
await check("team");
await menu("Account");
await check("account");

await menu("Facebook & Instagram");
await vis("h1:has-text('Facebook & Instagram')").waitFor();
await page.waitForSelector("text=Loading your Facebook connection", { state: "detached" });
await check("meta");
if (process.env.FAKE_META) {
  if (await page.locator("button:has-text('Connect Facebook')").count()) {
    await page.click("button:has-text('Connect Facebook')");
  }
  await page.waitForSelector("[data-meta-account]", { timeout: 15000 });
  await check("meta-connected");
  await page.click("[role=tab]:has-text('Instagram')");
  await page.waitForSelector("text=Recent posts");
  await check("meta-instagram");
  await page.click("[data-ig-media=m1]");
  await page.waitForSelector("[role=dialog] >> text=Love this!");
  await check("meta-instagram-post");
  await page.click("[role=dialog] button[aria-label=Close]");
  await page.click("button:has-text('New post')");
  await check("meta-instagram-new-post");
  await page.click("[role=dialog] button[aria-label=Close]");
  await page.click("[role=tab]:has-text('Facebook Pages')");
  await page.waitForSelector("text=Write a post");
  await page.check("text=Schedule for later");
  await check("meta-pages");
  await page.click("[role=tab]:has-text('Ads')");
  await page.waitForSelector("[data-campaign]");
  await check("meta-ads");
  await page.click("button:has-text('New campaign')");
  await check("meta-ads-new-campaign");
  await page.click("[role=dialog] button[aria-label=Close]");
  await page.click("[role=tab]:has-text('Find influencers')");
  await page.fill("#ig-lookup", "glowwithmeera");
  await page.click("button:has-text('Look up')");
  await page.waitForSelector("text=Engagement rate");
  await check("meta-lookup");
}

await browser.close();
if (problems.length) {
  console.error(`\n${problems.length} screen(s) have content that does not fit or line up at ${WIDTH}px:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`\nAll screens fit a ${WIDTH}px-wide phone.`);
