// Builds the web client for the Android app and copies it into android/.
// The app has no server of its own: it talks to your hosted Marketbing
// server, whose address comes from ANDROID_API_URL in .env.
import { execSync } from "node:child_process";
import fs from "node:fs";

if (fs.existsSync(".env")) process.loadEnvFile(".env");

const fail = (message) => {
  console.error(`\n${message}\n`);
  process.exit(1);
};

const raw = process.env.ANDROID_API_URL?.trim() ?? "";
if (!raw) {
  fail(
    "ANDROID_API_URL is not set. Put your hosted server's address in .env, e.g.\n" +
      "  ANDROID_API_URL=https://marketbing.onrender.com",
  );
}
let url;
try {
  url = new URL(raw);
} catch {
  fail(`ANDROID_API_URL "${raw}" is not a web address. It should look like https://marketbing.onrender.com`);
}
if (url.protocol !== "https:") {
  fail(`ANDROID_API_URL must start with https:// (got "${raw}"). Android blocks unencrypted connections.`);
}
const apiUrl = url.origin + url.pathname.replace(/\/+$/, "");

// A warning, not an error: the server may be asleep (Render's free plan) or
// not deployed yet, and the app can still be built.
try {
  const res = await fetch(`${apiUrl}/api/health`, { signal: AbortSignal.timeout(20_000) });
  const body = await res.json();
  if (!body.ok) throw new Error(`unexpected reply from ${apiUrl}/api/health`);
  console.log(`Server reachable: ${apiUrl}`);
} catch (e) {
  console.warn(`Warning: could not reach ${apiUrl}/api/health (${e.message}). Building anyway.`);
}

const run = (cmd, env = {}) => {
  try {
    execSync(cmd, { stdio: "inherit", env: { ...process.env, ...env } });
  } catch {
    fail(`Android build stopped: \`${cmd}\` failed (see its output above).`);
  }
};
run("npx tsc -b");
run("npx vite build --outDir dist-android --emptyOutDir", { VITE_API_URL: apiUrl, VITE_EMBEDDED: "" });
// android/ is committed; it is only generated here on a checkout without it.
run(fs.existsSync("android") ? "npx cap sync android" : "npx cap add android");
console.log("\nAndroid project updated. Next: `npx cap open android` and use Build → Build APK(s) in Android Studio.");
