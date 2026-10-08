import { expect, test, type Page, type Route } from '@playwright/test';

// HTTP fixtures exercise the real React/SDK browser path. They do not issue
// authentic tokens, execute RLS, certify tenancy, or contact a cloud backend.
const ORIGIN = 'https://txofqxictwecgcnvezlb.supabase.co';
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const accountA = { id: uuid(100), display_name: 'Synthetic East account', is_demo: true };
const accountB = { id: uuid(200), display_name: 'Synthetic West account', is_demo: true };
const facilityA = { id: uuid(1001), account_id: accountA.id, display_name: 'Synthetic East facility', is_demo: true };
const facilityB = { id: uuid(2001), account_id: accountB.id, display_name: 'Synthetic West facility', is_demo: true };
type Account = typeof accountA;
type Facility = typeof facilityA;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function mockBackend(page: Page) {
  const user = {
    id: uuid(1), aud: 'authenticated', role: 'authenticated',
    email: 'browser-fixture@example.invalid', email_confirmed_at: '2026-10-08T00:00:00Z',
    phone: '', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
    identities: [], created_at: '2026-10-08T00:00:00Z', is_anonymous: false,
  };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, role: 'authenticated', is_anonymous: false, exp: Math.floor(Date.now() / 1000) + 3600 })}.synthetic-signature`;
  const state = {
    accounts: [accountA, accountB] as Account[], facilities: [facilityA, facilityB] as Facility[],
    profileAvailable: true, sessionValid: true, failAccounts: false,
    failRefresh: false, rejectSignIn: false, redirectSignIn: false,
    redirectedCredentialRequests: 0,
    facilityGate: null as null | { accountId: string; arrived: ReturnType<typeof deferred>; release: ReturnType<typeof deferred> },
    unexpected: [] as string[], requests: [] as URL[],
  };
  const json = (route: Route, value: unknown, status = 200) => route.fulfill({
    status, contentType: 'application/json', body: JSON.stringify(value),
  });
  await page.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    state.requests.push(url);
    if (url.pathname === '/auth/v1/token' && route.request().method() === 'POST') {
      if (url.searchParams.get('grant_type') === 'refresh_token' && state.failRefresh) {
        return json(route, { message: 'Synthetic refresh connection unavailable' }, 503);
      }
      if (url.searchParams.get('grant_type') === 'password') {
        if (state.rejectSignIn) return json(route, { code: 'invalid_credentials', msg: 'Synthetic rejected login' }, 400);
        if (state.redirectSignIn) return route.fulfill({ status: 307, headers: { location: 'http://127.0.0.1:4179/credential-capture' } });
      }
      return json(route, { access_token: token, refresh_token: 'synthetic-refresh-token', token_type: 'bearer', expires_in: 3600, user });
    }
    if (url.pathname === '/auth/v1/user') {
      return state.sessionValid ? json(route, user) : json(route, { code: 'bad_jwt', msg: 'Fixture session expired' }, 401);
    }
    if (url.pathname === '/auth/v1/logout') return json(route, {});
    if (url.pathname === '/rest/v1/user_profiles') {
      expect(url.searchParams.get('select')).toBe('id,display_name,identity_status,is_demo');
      return json(route, state.profileAvailable ? [{ id: uuid(2), display_name: 'Synthetic operator', identity_status: 'active', is_demo: true }] : []);
    }
    if (url.pathname === '/rest/v1/client_accounts') {
      expect(url.searchParams.get('select')).toBe('id,display_name,is_demo');
      expect(url.searchParams.get('order')).toBe('id.asc');
      expect(url.searchParams.get('limit')).toBe('51');
      if (state.failAccounts) return json(route, { message: 'Do not expose provider internals' }, 503);
      const after = url.searchParams.get('id')?.replace(/^gt\./, '');
      return json(route, state.accounts.filter((row) => !after || row.id > after).slice(0, 51));
    }
    if (url.pathname === '/rest/v1/facilities') {
      expect(url.searchParams.get('select')).toBe('id,account_id,display_name,is_demo');
      expect(url.searchParams.get('order')).toBe('id.asc');
      expect(url.searchParams.get('limit')).toBe('51');
      const filter = url.searchParams.get('account_id');
      expect(filter).toMatch(/^eq\.[0-9a-f-]{36}$/);
      const accountId = filter!.slice(3);
      const after = url.searchParams.get('id')?.replace(/^gt\./, '');
      const rows = state.facilities.filter((row) => row.account_id === accountId && (!after || row.id > after)).slice(0, 51);
      if (state.facilityGate?.accountId === accountId) {
        state.facilityGate.arrived.resolve();
        await state.facilityGate.release.promise;
      }
      return json(route, rows);
    }
    state.unexpected.push(`${route.request().method()} ${url.pathname}`);
    await route.abort('blockedbyclient');
  });
  // No request from this fixture suite may fall through to the actual cloud.
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    const origin = url.origin;
    if (origin === 'http://127.0.0.1:4179' && url.pathname === '/credential-capture') {
      state.redirectedCredentialRequests += 1;
      return json(route, {});
    }
    if (origin === ORIGIN) return route.fallback();
    if (origin === 'http://127.0.0.1:4179') return route.continue();
    state.unexpected.push(`external ${origin}`);
    return route.abort('blockedbyclient');
  });
  return state;
}

async function signIn(page: Page) {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('browser-fixture@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('synthetic-browser-password');
  await page.getByLabel('Password', { exact: true }).press('Tab');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Accounts', exact: true })).toBeVisible();
}

test('fixture browser: keyboard login, account selection, directory and sign-out', async ({ page }, testInfo) => {
  const backend = await mockBackend(page);
  await signIn(page);
  await expect(page.getByRole('heading', { name: accountA.display_name, exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('directory-desktop.png'), fullPage: true });
  await page.getByRole('link', { name: `View facilities for ${accountA.display_name}` }).click();
  await expect(page.getByRole('heading', { name: facilityA.display_name, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: facilityB.display_name, exact: true })).toHaveCount(0);
  await page.getByLabel('Account', { exact: true }).selectOption(accountB.id);
  await expect(page.getByRole('heading', { name: facilityB.display_name, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: facilityA.display_name, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByText(facilityB.display_name, { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => Object.values(localStorage).some((value) => value.includes('access_token')))).toBe(false);
  expect(backend.unexpected).toEqual([]);
});

test('fixture browser: credential-bearing redirects fail without forwarding the login', async ({ page }) => {
  const backend = await mockBackend(page);
  backend.redirectSignIn = true;
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('browser-fixture@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('synthetic-browser-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('could not be reached');
  expect(backend.redirectedCredentialRequests).toBe(0);
  await expect(page.getByRole('heading', { name: 'Accounts', exact: true })).toHaveCount(0);
  expect(backend.unexpected).toEqual([]);
});

test('fixture browser: expired-session sign-out cannot restore access after refresh failure and reload', async ({ page }) => {
  const backend = await mockBackend(page);
  await signIn(page);
  await expect(page.getByRole('heading', { name: accountA.display_name, exact: true })).toBeVisible();
  await page.clock.install();
  backend.failRefresh = true;
  await page.evaluate(() => {
    const key = 'auxiliumos.auth.txofqxictwecgcnvezlb.supabase.co';
    const session = JSON.parse(localStorage.getItem(key)!);
    session.expires_at = Math.floor(Date.now() / 1000) - 60;
    localStorage.setItem(key, JSON.stringify(session));
  });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect.poll(async () => backend.requests.some((url) => url.searchParams.get('grant_type') === 'refresh_token')
    || await page.getByRole('button', { name: /^(Sign in|Try signing out again)$/ }).isVisible()).toBe(true);
  // Advance the real SDK's bounded exponential refresh retry window without
  // waiting 30 wall-clock seconds. The endpoint still returns the actual 503.
  await page.clock.fastForward(31_000);
  await expect(page.getByRole('button', { name: /^(Sign in|Try signing out again)$/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: accountA.display_name, exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => Object.values(localStorage).some((value) => value.includes('access_token')))).toBe(false);
  await page.clock.resume();
  backend.failRefresh = false;
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Accounts', exact: true })).toHaveCount(0);
  backend.rejectSignIn = true;
  await page.getByLabel('Email', { exact: true }).fill('browser-fixture@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('synthetic-rejected-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Unable to sign in');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Accounts', exact: true })).toHaveCount(0);
  backend.rejectSignIn = false;
  await signIn(page);
  await expect(page.getByRole('heading', { name: accountA.display_name, exact: true })).toBeVisible();
  expect(backend.unexpected).toEqual([]);
});

test('fixture browser: recoverable service error, empty access and profile revocation clear rows', async ({ page }) => {
  const backend = await mockBackend(page);
  backend.failAccounts = true;
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Information could not be loaded' })).toBeVisible();
  await expect(page.getByText('Do not expose provider internals')).toHaveCount(0);
  backend.failAccounts = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('heading', { name: accountA.display_name, exact: true })).toBeVisible();
  backend.accounts = [];
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No accounts available' })).toBeVisible();
  await expect(page.getByRole('heading', { name: accountA.display_name, exact: true })).toHaveCount(0);
  backend.profileAvailable = false;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Access unavailable', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Accounts', exact: true })).toHaveCount(0);
  expect(backend.unexpected).toEqual([]);
});

test('fixture browser: late response from a previous account cannot replace the selected account', async ({ page }) => {
  const backend = await mockBackend(page);
  const gate = { accountId: accountA.id, arrived: deferred(), release: deferred() };
  backend.facilityGate = gate;
  try {
    await signIn(page);
    await page.getByRole('link', { name: `View facilities for ${accountA.display_name}` }).click();
    await gate.arrived.promise;
    await page.getByLabel('Account', { exact: true }).selectOption(accountB.id);
    await expect(page.getByRole('heading', { name: facilityB.display_name, exact: true })).toBeVisible();
    gate.release.resolve();
    await expect(page.getByRole('heading', { name: facilityA.display_name, exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Account', { exact: true })).toHaveValue(accountB.id);
    expect(backend.unexpected).toEqual([]);
  } finally { gate.release.resolve(); }
});

test('fixture browser: bounded cursor pages and an expired session', async ({ page }) => {
  const backend = await mockBackend(page);
  backend.accounts = Array.from({ length: 51 }, (_, index) => ({ id: uuid(100 + index), display_name: `Synthetic account ${index + 1}`, is_demo: true }));
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Synthetic account 50', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Synthetic account 51', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Synthetic account 51', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Previous page', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Synthetic account 1', exact: true })).toBeVisible();
  backend.sessionValid = false;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByText('Your session has expired. Sign in again to continue.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Synthetic account 1', exact: true })).toHaveCount(0);
  expect(backend.unexpected).toEqual([]);
});

test('fixture browser: phone navigation, keyboard close, honest module state and layout', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const backend = await mockBackend(page);
  await signIn(page);
  const open = page.getByRole('button', { name: 'Open navigation', exact: true });
  await open.click();
  await expect(page.getByRole('dialog', { name: 'Workspace navigation' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Workspace navigation' })).not.toBeVisible();
  await expect(open).toBeFocused();
  await open.click();
  await page.getByRole('dialog').getByRole('link', { name: 'Documents', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Not available in this increment', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('link', { name: 'Open account directory', exact: true }).click();
  await expect(page.getByRole('heading', { name: accountA.display_name, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('directory-phone.png'), fullPage: true });
  expect(backend.unexpected).toEqual([]);
});
