import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "static-app-shell.spec.ts",
  timeout: 30_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    headless: true,
    launchOptions: {
      executablePath: process.env.AUXILIUMOS_BROWSER_EXECUTABLE || undefined,
    },
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
      },
    },
  ],
});
