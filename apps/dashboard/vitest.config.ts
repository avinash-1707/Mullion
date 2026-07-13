import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// jsdom globally, not per-file: the pre-existing pure-logic tests
// (lib/*, nav-items) don't touch the DOM and run identically under it,
// so one environment keeps the config free of match-glob routing.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
