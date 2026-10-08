import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { validateRuntimeConfig } from "./src/lib/config";

export default defineConfig(({ command, mode, isPreview }) => {
  const root = fileURLToPath(new URL(".", import.meta.url));
  const env = loadEnv(mode, root, "VITE_");
  // Runs before dev transforms or production emission. No rejected value is logged.
  // Missing configuration can still build the safe setup screen.
  validateRuntimeConfig({ ...env, DEV: command === "serve" && !isPreview });
  return {
  root,
  envDir: root,
  plugins: [react()],
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true },
  };
});
