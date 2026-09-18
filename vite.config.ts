import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Relative asset paths so the build also runs when hosted from a subpath
  // (e.g. a static preview or artifact host).
  base: "./",
  // es2022 for top-level await (used to select the embedded API client).
  build: { target: "es2022" },
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Web dev server forwards API calls to the local API server.
      "/api": "http://localhost:8787",
    },
  },
});
