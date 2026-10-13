import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  testDir: '.', testMatch: 'browser.spec.ts', workers: 1, timeout: 90_000,
  globalSetup: './server.ts', outputDir: './generated/browser-results', reporter: [['line'], ['json', { outputFile: fileURLToPath(new URL('./generated/BROWSER_RESULTS.json', import.meta.url)) }]],
  use: {
    baseURL: 'http://127.0.0.1:4176', viewport: { width: 1440, height: 1000 }, screenshot: 'only-on-failure',
    launchOptions: { executablePath: process.env.SPATIAL_BROWSER_EXECUTABLE ?? fileURLToPath(new URL('../ui/.browser-runtime/chromium', import.meta.url)), args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] },
  },
});
