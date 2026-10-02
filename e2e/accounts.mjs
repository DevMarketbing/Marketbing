/**
 * Accounts end-to-end: a new business signs up and gets its own data,
 * invites a teammate by link, the teammate joins, and the owner removes
 * them again.
 *
 * Prereqs: same as smoke.mjs, with sign-up allowed on the server.
 * Usage: node e2e/accounts.mjs [chromium-executable-path]
 */
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:8787";
const executablePath = process.argv[2] || process.env.CHROMIUM_PATH || undefined;
const ok = (name) => console.log("OK:", name);

const browser = await chromium.launch({ executablePath });
const errors = [];
const newPage = async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  return page;
};
const vis = (page, sel) => page.locator(sel).locator("visible=true").first();

const stamp = Date.now();
const ownerEmail = `owner-${stamp}@example.com`;
const staffEmail = `staff-${stamp}@example.com`;
const business = `Test Business ${stamp}`;

/* ---- sign up ---- */
const owner = await newPage();
await owner.goto(BASE);
await owner.click("text=Create an account");
await owner.fill("#signup-workspace", business);
await owner.fill("#login-email", ownerEmail);
await owner.fill("#login-password", "short");
await owner.click("button:has-text('Create account')");
// The browser's own minLength check stops it; the field is invalid.
if (await owner.locator("#login-password:invalid").count() !== 1) throw new Error("short password accepted");
await owner.fill("#login-password", "owner-password-1");
await owner.click("button:has-text('Create account')");
await owner.waitForSelector("text=What do you want to achieve?", { timeout: 10000 });
ok("new business signed up");

await vis(owner, "aside >> text=Influencer Marketplace").click();
await vis(owner, "text=Ananya Rao").waitFor({ timeout: 10000 });
await owner.locator("button:has-text('Invest')").first().click();
await owner.fill("#trade-amount", "4");
await owner.click("button:has-text('Invest ₹4L')");
await owner.waitForSelector("#trade-amount", { state: "detached", timeout: 10000 });
ok("trade in the new workspace");

/* ---- invite ---- */
await vis(owner, "aside >> text=Team").click();
await owner.waitForSelector(`text=${ownerEmail}`);
await owner.fill("#invite-email", staffEmail);
await owner.click("button:has-text('Create invite link')");
const link = await owner.inputValue("#invite-link");
if (!link.includes("#invite=")) throw new Error("unexpected invite link: " + link);
await owner.waitForSelector("text=Cancel invite");
ok("invite link created");

/* ---- teammate joins ---- */
const staff = await newPage();
await staff.goto(link);
await staff.waitForSelector(`text=Join ${business}`, { timeout: 10000 });
if (staff.url().includes("invite=")) throw new Error("invite token left in the address bar");
await staff.fill("#invite-password", "staff-password-1");
await staff.click("button:has-text('Join workspace')");
await staff.waitForSelector("text=What do you want to achieve?", { timeout: 10000 });
await vis(staff, "aside >> text=Influencer Marketplace").click();
const wallet = await vis(staff, "[data-stat-tile]:has-text('Wallet balance')").textContent();
if (!wallet?.includes("₹6L")) throw new Error("teammate sees a different wallet: " + wallet);
ok("teammate joined and shares the workspace wallet (₹6L)");

await vis(staff, "aside >> text=Team").click();
await staff.waitForSelector(`text=${ownerEmail}`);
if (await staff.locator("#invite-email").count()) throw new Error("team member can invite");
ok("team member cannot invite");

/* ---- used link no longer works ---- */
const again = await newPage();
await again.goto(link);
await again.waitForSelector("text=Invite not valid", { timeout: 10000 });
ok("invite link works only once");

/* ---- owner removes teammate ---- */
await owner.reload();
await vis(owner, "aside >> text=Team").click();
await owner.waitForSelector(`text=${staffEmail}`);
owner.once("dialog", (d) => d.accept());
await owner.locator("button:has-text('Remove')").first().click();
await owner.waitForSelector(`text=${staffEmail}`, { state: "detached", timeout: 10000 });
await staff.reload();
await staff.waitForSelector("#login-email", { timeout: 10000 });
ok("removed teammate is signed out");

/* ---- change password ---- */
await vis(owner, "aside >> text=Account").click();
await owner.fill("#current-password", "owner-password-1");
await owner.fill("#new-password", "owner-password-2");
await owner.click("button:has-text('Change password')");
await owner.waitForSelector("text=Password changed.");
await owner.click("button:has-text('Sign out')");
await owner.fill("#login-email", ownerEmail);
await owner.fill("#login-password", "owner-password-2");
await owner.click("button:has-text('Sign in')");
await owner.waitForSelector("text=What do you want to achieve?", { timeout: 10000 });
ok("password changed and used to sign in");

await browser.close();
if (errors.length) {
  console.log("BROWSER ERRORS:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("ALL PASSED");
