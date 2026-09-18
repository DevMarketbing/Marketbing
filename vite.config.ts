import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Relative asset paths so the build also runs when hosted from a subpath
  // (e.g. a static preview or artifact host).
  base: "./",
  plugins: [react(), tailwindcss()],
});
