import { defineConfig } from '@playwright/test';

// These checks exercise browser behavior against synthetic HTTP fixtures.
// They do not certify Supabase Auth, RLS or deployed API behavior.
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['auth-onboarding.spec.ts', 'directory.spec.ts', 'intake.spec.ts', 'private-files.spec.ts', 'document-versions.spec.ts', 'document-content.spec.ts'],
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4179',
    headless: true,
    launchOptions: {
      executablePath: process.env.AUXILIUMOS_BROWSER_EXECUTABLE || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 4179',
    url: 'http://127.0.0.1:4179',
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: 'https://txofqxictwecgcnvezlb.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic_browser_fixture',
    },
  },
});
