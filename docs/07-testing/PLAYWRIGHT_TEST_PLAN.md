# Playwright test plan
Playwright is already declared in package.json, configured in playwright.config.ts, and used by tests/e2e/static-app-shell.spec.ts. Three existing tests inspect the static shell; they do not test real auth, persistence or workflows. Do not reinstall or rebuild this harness merely because an older plan said it was absent.

Run `npm ci`, then `npx playwright install chromium`, then `npm run test:e2e` when verifying affected browser behavior. CI installs required Linux browser dependencies. No browser execution is claimed in the continuation package unless a saved result explicitly says so.

As the runtime is implemented, replace/extend shell-only checks with a small set of authentic simple client, enterprise client, internal and vendor journeys. Use isolated synthetic fixtures and real backend permissions. Test keyboard/focus, phone/desktop, loading/empty/denied/stale/retry states. Put exhaustive permission and state combinations at database/API layers, not in redundant browser loops. Browser success never substitutes for direct backend denial tests.
