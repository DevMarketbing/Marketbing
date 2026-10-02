// Prepares the android/ project. The app opens the live site (see
// capacitor.config.ts), so the only web files inside it are the pages
// shown before the site has loaded or when it can't be reached.
import { execSync } from "node:child_process";
import fs from "node:fs";

if (fs.existsSync(".env")) process.loadEnvFile(".env");

const fail = (message) => {
  console.error(`\n${message}\n`);
  process.exit(1);
};

const raw = process.env.ANDROID_SITE_URL?.trim() || "https://marketbing.onrender.com";
let url;
try {
  url = new URL(raw);
} catch {
  fail(`ANDROID_SITE_URL "${raw}" is not a web address. It should look like https://marketbing.onrender.com`);
}
if (url.protocol !== "https:") {
  fail(`ANDROID_SITE_URL must start with https:// (got "${raw}"). Android blocks unencrypted connections.`);
}
const siteUrl = url.origin + url.pathname.replace(/\/+$/, "");
console.log(`The app will open ${siteUrl}`);

// A warning, not an error: the server may be asleep (Render's free plan) or
// not deployed yet, and the app can still be built.
try {
  const res = await fetch(`${siteUrl}/api/health`, { signal: AbortSignal.timeout(20_000) });
  const body = await res.json();
  if (!body.ok) throw new Error(`unexpected reply from ${siteUrl}/api/health`);
  console.log("Site reachable.");
} catch (e) {
  console.warn(`Warning: could not reach ${siteUrl}/api/health (${e.message}). Building anyway.`);
}

// The offline page. It can't use the site's code (it shows exactly when the
// site is unreachable), so it is plain HTML in the app's colours.
const page = (body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Marketbing</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
         background: #f8fafc; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #0f172a; }
  main { max-width: 320px; padding: 24px; text-align: center; }
  .logo { width: 56px; height: 56px; border-radius: 16px; margin: 0 auto 20px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6); display: flex; align-items: center; justify-content: center; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  p { font-size: 15px; line-height: 1.5; color: #64748b; margin: 0 0 24px; }
  a { display: inline-block; background: #4f46e5; color: #fff; text-decoration: none; font-weight: 600;
      font-size: 15px; padding: 12px 28px; border-radius: 10px; }
</style>
</head>
<body><main>
  <div class="logo"><svg width="28" height="28" viewBox="0 0 24 24" fill="#fff"><path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4L12 2z"/><path d="M19 15l1 2.7 2.7 1-2.7 1-1 2.7-1-2.7-2.7-1 2.7-1 1-2.7z" opacity=".7"/></svg></div>
  ${body}
</main></body>
</html>
`;
fs.rmSync("dist-android", { recursive: true, force: true });
fs.mkdirSync("dist-android");
fs.writeFileSync(
  "dist-android/offline.html",
  page(`<h1>Can't reach Marketbing</h1>
  <p>Check your internet connection and try again. If the server was asleep, it can take up to a minute to wake up.</p>
  <a href="${siteUrl}/">Try again</a>`),
);
// Capacitor requires an index.html; the app opens the site instead of it.
fs.writeFileSync("dist-android/index.html", page(`<p>Opening Marketbing…</p><a href="${siteUrl}/">Open</a>`));

try {
  // android/ is committed; it is only generated here on a checkout without it.
  execSync(fs.existsSync("android") ? "npx cap sync android" : "npx cap add android", {
    stdio: "inherit",
    env: { ...process.env, ANDROID_SITE_URL: siteUrl },
  });
} catch {
  fail("Android build stopped: Capacitor failed (see its output above).");
}
console.log("\nAndroid project updated. Build the APK with `cd android && ./gradlew assembleDebug`,");
console.log("or let GitHub build it (see README → Android app).");
