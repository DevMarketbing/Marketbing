import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Android app wrapper (Capacitor). The app is the same React client, built
 * by `npm run build:android` into dist-android/ with the hosted server's
 * address baked in, then copied into the android/ project.
 */
const config: CapacitorConfig = {
  // The app's permanent identity on Google Play — it cannot change after
  // the first upload. Change it now if you own a domain (reverse it, e.g.
  // com.yourcompany.marketbing).
  appId: "com.marketbing.app",
  appName: "Marketbing",
  webDir: "dist-android",
  android: {
    // The app only talks to the https server; never allow plain http.
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
