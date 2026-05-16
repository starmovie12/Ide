/**
 * Vite config — v6 Phase 5
 * Bug #B1: COEP + COOP headers required for WebContainers API.
 * Without these, window.crossOriginIsolated = false and WebContainers won't boot.
 * Sandbox router falls back to cloud-mode when these headers are absent.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    host: "0.0.0.0",
    /**
     * Bug #B1 — COEP + COOP headers for WebContainers (local dev).
     * Production: set in vercel.json and public/_headers (already in repo).
     */
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
  preview: {
    port: 4173,
    host: "0.0.0.0",
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
  /**
   * Optimise deps — pre-bundle heavy packages to avoid cold-start lag.
   * @webcontainer/api is excluded (dynamic import only).
   */
  optimizeDeps: {
    exclude: ["@webcontainer/api"],
    include: [
      "react",
      "react-dom",
      "dexie",
      "@octokit/rest",
    ],
  },
});
