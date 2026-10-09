import { expect, test, type Page, type Route } from '@playwright/test';

// Real browser + SDK with isolated HTTP fixtures. This does not certify hosted
// email delivery, authentic Auth tokens, application grants or backend RLS.
const backendOrigin = 'https://txofqxictwecgcnvezlb.supabase.co';
const email = 'invited-fixture@example.invalid';
const userId = '00000000-0000-4000-8000-000000000001';
const profileId = '00000000-0000-4000-8000-000000000002';

async function fixture(page: Page) {
  const user = { id: userId, aud: 'authenticated', role: 'authenticated', email, email_confirmed_at: '2026-10-09T00:00:00Z', phone: '', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [], created_at: '2026-10-09T00:00:00Z', is_anonymous: false };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.synthetic-signature`;
  const state = { profileAvailable: true, valid: true, failUser: false, failUpdate: false, failVerificationAfterUpdate: false, recoveryStatus: 200, updateGate: null as Promise<void> | null, updates: [] as unknown[], recoveries: [] as { body: unknown; redirect: string | null }[], applicationRequests: [] as string[], unexpected: [] as string[] };
  const json = (route: Route, value: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
  await page.route(`${backendOrigin}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/auth/v1/user') {
      if (route.request().method() === 'PUT') {
        state.updates.push(route.request().postDataJSON());
        if (state.updateGate) await state.updateGate;
        if (state.failUpdate) return json(route, { message: 'provider-secret-details' }, 503);
      }
      if (!state.valid) return json(route, { code: 'bad_jwt', message: 'provider-secret-details' }, 401);
      if (state.failVerificationAfterUpdate && state.updates.length && route.request().method() === 'GET') return json(route, { message: 'provider-secret-details' }, 503);
      if (state.failUser) return json(route, { message: 'provider-secret-details' }, 503);
      return json(route, user);
    }
    if (url.pathname === '/auth/v1/recover') {
      state.recoveries.push({ body: route.request().postDataJSON(), redirect: url.searchParams.get('redirect_to') });
      return json(route, state.recoveryStatus === 200 ? {} : { code: 'email_not_found', message: 'provider-secret-details' }, state.recoveryStatus);
    }
    if (url.pathname === '/auth/v1/logout') return json(route, {});
    if (url.pathname === '/auth/v1/token') return json(route, { access_token: token, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 3600, user });
    if (url.pathname.startsWith('/rest/')) state.applicationRequests.push(url.pathname);
    if (url.pathname === '/rest/v1/user_profiles') return json(route, state.profileAvailable ? [{ id: profileId, display_name: 'Synthetic owner', identity_status: 'active', is_demo: true }] : []);
    if (url.pathname === '/rest/v1/client_accounts') return json(route, []);
    state.unexpected.push(`${route.request().method()} ${url.pathname}`);
    return route.abort('blockedbyclient');
  });
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin === backendOrigin) return route.fallback();
    if (url.hostname === '127.0.0.1') return route.continue();
    state.unexpected.push(`external ${url.origin}`);
    return route.abort('blockedbyclient');
  });
  const link = (kind: 'invite' | 'recovery') => `/?auth=${kind}#access_token=${token}&refresh_token=synthetic-refresh&token_type=bearer&type=${kind}&expires_in=3600`;
  return { state, link };
}

async function fillPassword(page: Page, confirmation = 'synthetic-new-password') {
  await page.getByLabel('New password', { exact: true }).fill('synthetic-new-password');
  await page.getByLabel('Confirm password', { exact: true }).fill(confirmation);
  await page.getByRole('button', { name: 'Save password and continue' }).click();
}

async function hasSavedCredential(page: Page) {
  return page.evaluate(() => Object.values(localStorage).some((value) => value.includes('access_token') || value.includes('synthetic-refresh')));
}

test('invitation stays private until matching password is saved and verified, then permits the assigned workspace', async ({ page }) => {
  const { state, link } = await fixture(page);
  await page.goto(link('invite'));
  await expect(page.getByRole('heading', { name: 'Set your password' })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  expect(state.applicationRequests).toEqual([]);
  expect(await hasSavedCredential(page)).toBe(false);
  await fillPassword(page, 'different-synthetic-password');
  await expect(page.getByRole('alert')).toContainText('passwords do not match');
  expect(state.updates).toEqual([]);
  await fillPassword(page);
  await expect(page.getByRole('heading', { name: 'Accounts', exact: true })).toBeVisible();
  expect(state.updates).toHaveLength(1);
  expect(state.updates[0]).toMatchObject({ password: 'synthetic-new-password' });
  expect(await hasSavedCredential(page)).toBe(true);
  expect(state.unexpected).toEqual([]);
});

test('password recovery never grants workspace membership and handles retry without revealing app data', async ({ page }) => {
  const { state, link } = await fixture(page);
  state.profileAvailable = false;
  await page.goto(link('recovery'));
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  state.failUpdate = true;
  await fillPassword(page);
  await expect(page.getByRole('alert')).toContainText('could not be reached');
  expect(await hasSavedCredential(page)).toBe(false);
  expect(state.applicationRequests).toEqual([]);
  state.failUpdate = false;
  await fillPassword(page);
  await expect(page.getByRole('heading', { name: 'Access unavailable' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Accounts', exact: true })).toHaveCount(0);
  expect(state.unexpected).toEqual([]);
});

test('expired link drops sensitive URL and provider error text, then offers a new link', async ({ page }) => {
  const { state } = await fixture(page);
  await page.goto('/?auth=invite#error=access_denied&error_code=otp_expired&error_description=provider-secret-details');
  await expect(page.getByRole('heading', { name: 'Link unavailable' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('expired');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('provider-secret-details')).toHaveCount(0);
  expect(state.applicationRequests).toEqual([]);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Send password link' }).click();
  await expect(page.getByRole('status')).toContainText('If this email has an eligible account');
  expect(state.recoveries).toHaveLength(1);
});

test('a saved password followed by a verification outage offers sign-in without repeating the update', async ({ page }) => {
  const { state, link } = await fixture(page);
  state.failVerificationAfterUpdate = true;
  await page.goto(link('recovery'));
  await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
  await fillPassword(page);
  await expect(page.getByRole('alert')).toContainText('Your password was saved, but access could not be verified');
  expect(state.updates).toHaveLength(1);
  expect(state.applicationRequests).toEqual([]);
  expect(await hasSavedCredential(page)).toBe(false);
  await page.getByRole('button', { name: 'Back to sign in' }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
});

test('cancel and reload both discard an unfinished invitation session', async ({ page }) => {
  const { state, link } = await fixture(page);
  await page.goto(link('invite'));
  await expect(page.getByRole('heading', { name: 'Set your password' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  expect(await hasSavedCredential(page)).toBe(false);
  await page.goto(link('invite'));
  await expect(page.getByRole('heading', { name: 'Set your password' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel and sign out' }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  expect(state.applicationRequests).toEqual([]);
  expect(await hasSavedCredential(page)).toBe(false);
});

test('forgot password uses an exact same-origin callback and identical eligible/noneligible responses', async ({ page }) => {
  const { state } = await fixture(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Send password link' }).click();
  const message = await page.getByRole('status').textContent();
  await page.getByRole('button', { name: 'Use a different email' }).click();
  state.recoveryStatus = 400;
  await page.getByLabel('Email', { exact: true }).fill('absent-fixture@example.invalid');
  await page.getByRole('button', { name: 'Send password link' }).click();
  await expect(page.getByRole('status')).toHaveText(message!);
  expect(state.recoveries.map((request) => request.redirect)).toEqual([new URL('/?auth=recovery', page.url()).href, new URL('/?auth=recovery', page.url()).href]);
  expect(state.applicationRequests).toEqual([]);
  expect(await hasSavedCredential(page)).toBe(false);
});

test('rate-limited password-link request is retryable without disclosing provider messages', async ({ page }) => {
  const { state } = await fixture(page);
  state.recoveryStatus = 429;
  await page.goto('/');
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Send password link' }).click();
  await expect(page.getByRole('alert')).toContainText('wait a moment');
  await expect(page.getByText('provider-secret-details')).toHaveCount(0);
  state.recoveryStatus = 200;
  await page.getByRole('button', { name: 'Send password link' }).click();
  await expect(page.getByRole('status')).toContainText('If this email has an eligible account');
});

test('unverifiable callback never opens password setup or application data', async ({ page }) => {
  const { state, link } = await fixture(page);
  state.valid = false;
  await page.goto(link('invite'));
  await expect(page.getByRole('heading', { name: 'Link unavailable' })).toBeVisible();
  await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0);
  expect(state.applicationRequests).toEqual([]);
  expect(await hasSavedCredential(page)).toBe(false);
});

test('callback connection failure can retry the staged link without persisting credentials', async ({ page }) => {
  const { state, link } = await fixture(page);
  state.failUser = true;
  await page.goto(link('recovery'));
  await expect(page.getByRole('heading', { name: 'Link unavailable' })).toBeVisible();
  expect(await hasSavedCredential(page)).toBe(false);
  state.failUser = false;
  await page.getByRole('button', { name: 'Retry secure link' }).click();
  await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
  expect(state.applicationRequests).toEqual([]);
});

test('an expired recovery session cannot submit a password or expose application data', async ({ page }) => {
  const { state, link } = await fixture(page);
  await page.goto(link('recovery'));
  await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
  state.valid = false;
  await fillPassword(page);
  await expect(page.getByRole('heading', { name: 'Link unavailable' })).toBeVisible();
  expect(state.updates).toEqual([]);
  expect(state.applicationRequests).toEqual([]);
  expect(await hasSavedCredential(page)).toBe(false);
});

test('another tab superseding a recovery generation fences password update and clears setup', async ({ page }) => {
  const { state, link } = await fixture(page);
  await page.goto(link('recovery'));
  await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const key = 'auxiliumos.auth.txofqxictwecgcnvezlb.supabase.co.generation';
    const previous = localStorage.getItem(key);
    const next = crypto.randomUUID();
    localStorage.setItem(key, next);
    window.dispatchEvent(new StorageEvent('storage', { key, oldValue: previous, newValue: next, storageArea: localStorage }));
  });
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  expect(state.updates).toEqual([]);
  expect(state.applicationRequests).toEqual([]);
  expect(await hasSavedCredential(page)).toBe(false);
});

test('a late password update cannot persist or reopen a superseded recovery session', async ({ page }) => {
  const { state, link } = await fixture(page);
  let release!: () => void;
  state.updateGate = new Promise<void>((resolve) => { release = resolve; });
  await page.goto(link('recovery'));
  await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
  await fillPassword(page);
  await expect.poll(() => state.updates.length).toBe(1);
  await page.evaluate(() => {
    const key = 'auxiliumos.auth.txofqxictwecgcnvezlb.supabase.co.generation';
    const previous = localStorage.getItem(key);
    const next = crypto.randomUUID();
    localStorage.setItem(key, next);
    window.dispatchEvent(new StorageEvent('storage', { key, oldValue: previous, newValue: next, storageArea: localStorage }));
  });
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  const response = page.waitForResponse((item) => new URL(item.url()).pathname === '/auth/v1/user' && item.request().method() === 'PUT');
  release();
  await response;
  // Let the request chain settle through the SDK's verification step.
  await page.getByLabel('Email', { exact: true }).fill('different-fixture@example.invalid');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  expect(await hasSavedCredential(page)).toBe(false);
  expect(state.applicationRequests).toEqual([]);
});

test('phone password setup is readable, reachable by keyboard and free of horizontal overflow', async ({ page }, testInfo) => {
  const { state, link } = await fixture(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(link('invite'));
  await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
  await page.getByLabel('Confirm password', { exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Save password and continue' })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const bounds = await page.getByRole('button', { name: 'Save password and continue' }).boundingBox();
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: testInfo.outputPath('password-setup-mobile.png'), fullPage: true });
  expect(state.applicationRequests).toEqual([]);
});
