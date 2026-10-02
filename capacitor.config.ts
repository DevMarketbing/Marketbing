import fs from "node:fs";
import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Android app (Capacitor). The app opens the live Marketbing site, so the
 * website and the app are always the same version: every deploy to the
 * server — a new screen, a new API integration — reaches the app at once,
 * with no new app build. API keys stay on the server; none are in the app.
 *
 * The site address comes from ANDROID_SITE_URL (in .env, or set by the
 * GitHub build); `npm run build:android` applies it to android/.
 */

if (fs.existsSync(".env")) process.loadEnvFile(".env");
const siteUrl = (process.env.ANDROID_SITE_URL?.trim() || "https://marketbing.onrender.com").replace(/\/+$/, "");

const config: CapacitorConfig = {
  // The app's permanent identity on Google Play — it cannot change after
  // the first upload. Change it now if you own a domain (reverse it, e.g.
  // com.yourcompany.marketbing).
  appId: "com.marketbing.app",
  appName: "Marketbing",
  // Only the offline page lives in the app (see scripts/build-android.mjs).
  webDir: "dist-android",
  server: {
    url: siteUrl,
    // Shown when the site can't be reached (no internet, server down).
    errorPath: "offline.html",
  },
  android: {
    // The app only talks to the https site; never allow plain http.
    allowMixedContent: false,
  },
  plugins: {
    SystemBars: {
      // Keep the page between the status bar and navigation bar, so no
      // content hides underneath them.
      insetsHandling: "native",
    },
  },
};

export default config;
