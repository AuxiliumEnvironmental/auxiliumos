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
    profileAvailable: true, sessionValid: true, failAccounts: false, failProfile: false, userId: user.id,
    profileGate: null as null | { arrived: ReturnType<typeof deferred>; release: ReturnType<typeof deferred> },
    failRefresh: false, rejectSignIn: false, redirectSignIn: false,
    redirectedCredentialRequests: 0,
    facilityGate: null as null | { accountId: string; arrived: ReturnType<typeof deferred>; release: ReturnType<typeof deferred> },
    unexpected: [] as string[], requests: [] as URL[],
    planningAllowed: true, failPlanList: false, planListGate: null as null | { arrived: ReturnType<typeof deferred>; release: ReturnType<typeof deferred> },
    planBackend: true, plans: [] as Record<string, unknown>[], planCalls: [] as { name: string; body: Record<string, unknown> }[],
    dropNextSaveAck: false, loseNextSave: false, failNextGet: false, saveGate: null as null | { arrived: ReturnType<typeof deferred>; release: ReturnType<typeof deferred> }, getGate: null as null | { arrived: ReturnType<typeof deferred>; release: ReturnType<typeof deferred> },
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
      return state.sessionValid ? json(route, { ...user, id: state.userId }) : json(route, { code: 'bad_jwt', msg: 'Fixture session expired' }, 401);
    }
    if (url.pathname === '/auth/v1/logout') return json(route, {});
    if (url.pathname === '/rest/v1/user_profiles') {
      if (state.profileGate) { const gate = state.profileGate; state.profileGate = null; gate.arrived.resolve(); await gate.release.promise; }
      if (state.failProfile) return json(route, { message: 'Synthetic verification unavailable' }, 503);
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
    if (state.planBackend && url.pathname.startsWith('/rest/v1/rpc/') && route.request().method() === 'POST') {
      const name = url.pathname.slice('/rest/v1/rpc/'.length);
      const body = route.request().postDataJSON() as Record<string, unknown>;
      state.planCalls.push({ name, body });
      if (name === 'list_workspace_plans' && state.planListGate) { const gate = state.planListGate; state.planListGate = null; gate.arrived.resolve(); await gate.release.promise; }
      if (name === 'list_workspace_plans' && state.failPlanList) return json(route, { message: 'Synthetic planning check unavailable' }, 503);
      if (!state.planningAllowed) return json(route, { code: '42501', message: 'Synthetic planning denied' }, 403);
      if (name === 'list_workspace_plans') return json(route, state.plans.filter((plan) => plan.account_id === body.p_account_id && plan.facility_id === body.p_facility_id && plan.panel_key === body.p_panel_key).map(({ values, rows, checks, ...summary }) => summary));
      if (name === 'get_workspace_plan' && state.getGate) { const gate = state.getGate; state.getGate = null; gate.arrived.resolve(); await gate.release.promise; }
      if (name === 'get_workspace_plan' && state.failNextGet) { state.failNextGet = false; return json(route, { message: 'Synthetic readback unavailable' }, 503); }
      if (name === 'get_workspace_plan') { const found = state.plans.find((plan) => plan.id === body.p_plan_id); return found ? json(route, found) : route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: '42501', message: 'denied' }) }); }
      if (name === 'save_workspace_plan') {
        const existing = state.plans.find((plan) => plan.id === body.p_plan_id);
        // Idempotent: an identical retry returns the original saved revision.
        if (state.saveGate) { const gate = state.saveGate; state.saveGate = null; gate.arrived.resolve(); await gate.release.promise; }
        if (state.loseNextSave) { state.loseNextSave = false; return json(route, { message: 'Synthetic gateway timeout' }, 504); }
        if (existing && existing.request_id === body.p_request_id) return json(route, existing);
        if ((existing ? existing.revision : 0) !== body.p_expected_revision) return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ code: '40001', message: 'stale' }) });
        const plan = { request_id: body.p_request_id, id: body.p_plan_id, account_id: body.p_account_id, facility_id: body.p_facility_id, module_key: body.p_module_key, panel_key: body.p_panel_key, title: body.p_title, revision: (body.p_expected_revision as number) + 1, values: body.p_values, rows: body.p_rows, checks: body.p_checks, created_at: '2026-10-09T00:00:00Z', updated_at: '2026-10-09T00:00:00Z', is_demo: true, state: 'planning_draft' };
        state.plans = [plan, ...state.plans.filter((item) => item !== existing)];
        if (state.dropNextSaveAck) { state.dropNextSaveAck = false; return json(route, { message: 'Synthetic gateway timeout' }, 504); }
        return json(route, plan);
      }
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

async function recheck(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}
async function scopeDraft(page: Page, scoped = true) {
  await page.goto(scoped ? `/scope?account=${accountA.id}&facility=${facilityA.id}` : '/scope');
  const panel = page.getByRole('tabpanel').first();
  await panel.getByRole('button', { name: 'Prepare draft', exact: true }).click();
  await panel.getByLabel('Planning draft title', { exact: true }).fill('Synthetic retained preparation');
  await panel.getByLabel('Inclusions', { exact: true }).fill('Keep these authored inclusions');
  return panel;
}
const navigation = (page: Page, name: string) => page.locator('.sidebar').getByRole('link', { name, exact: true });

test('draft before context survives first selection; SPA return restores original scoped work', async ({ page }) => {
  const backend = await mockBackend(page);
  await signIn(page);
  const panel = await scopeDraft(page, false);
  await panel.getByRole('button', { name: 'Add item', exact: true }).click();
  await panel.getByLabel('Deliverable', { exact: true }).fill('Synthetic field notes');
  await page.getByLabel('Development account', { exact: true }).selectOption(accountA.id);
  await page.getByLabel('Facility', { exact: true }).selectOption(facilityA.id);
  await expect(panel.getByLabel('Inclusions', { exact: true })).toHaveValue('Keep these authored inclusions');
  await expect(panel.getByLabel('Deliverable', { exact: true })).toHaveValue('Synthetic field notes');
  await panel.getByRole('button', { name: 'Save planning draft', exact: true }).click();
  await expect(panel.getByText('Showing the latest saved copy · revision 1')).toBeVisible();
  await panel.getByLabel('Inclusions', { exact: true }).fill('Unsaved edit after revision one');
  await navigation(page, 'Projects').click();
  await expect(page.getByRole('heading', { name: 'Operations / Projects', exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`account=${accountA.id}.*facility=${facilityA.id}`));
  await navigation(page, 'Scope').click();
  await expect(panel.getByLabel('Inclusions', { exact: true })).toHaveValue('Unsaved edit after revision one');
  await expect(panel.getByLabel('Deliverable', { exact: true })).toHaveValue('Synthetic field notes');
  await page.getByLabel('Development account', { exact: true }).selectOption(accountB.id);
  await page.getByLabel('Facility', { exact: true }).selectOption(facilityB.id);
  await expect(panel.getByRole('button', { name: 'Prepare draft', exact: true })).toBeVisible();
  await page.getByLabel('Development account', { exact: true }).selectOption(accountA.id);
  await page.getByLabel('Facility', { exact: true }).selectOption(facilityA.id);
  await expect(panel.getByLabel('Inclusions', { exact: true })).toHaveValue('Unsaved edit after revision one');
  expect(backend.planCalls.filter(call => call.name === 'save_workspace_plan')).toHaveLength(1);
  expect(await page.evaluate(() => Object.values(localStorage).some(value => value.includes('Unsaved edit after revision one')))).toBe(false);
  expect(backend.unexpected).toEqual([]);
});

test('sample adoption is confirmed, starts a new draft and clears old review checks on phone', async ({ page }) => {
  const backend = await mockBackend(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  const panel = await scopeDraft(page);
  await panel.getByRole('button', { name: 'Load sample example', exact: true }).click();
  await expect(panel.getByLabel('Inclusions', { exact: true })).toHaveValue('Keep these authored inclusions');
  await panel.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await panel.getByRole('button', { name: 'Save planning draft', exact: true }).click();
  await expect(panel.getByText('Showing the latest saved copy · revision 1')).toBeVisible();
  await panel.getByRole('button', { name: 'Load sample example', exact: true }).click();
  await panel.getByRole('button', { name: 'Replace with sample', exact: true }).click();
  await panel.getByRole('button', { name: 'Save planning draft', exact: true }).click();
  await expect.poll(() => backend.plans.length).toBe(2);
  const saves = backend.planCalls.filter(call => call.name === 'save_workspace_plan');
  expect(saves[0].body.p_plan_id).not.toBe(saves[1].body.p_plan_id);
  expect(saves[1].body.p_expected_revision).toBe(0);
  await page.getByRole('tab', { name: 'Revision review', exact: true }).click();
  const review = page.getByRole('tabpanel');
  await review.getByRole('button', { name: 'Prepare review notes', exact: true }).click();
  await review.getByLabel('Confirm the exact scope revision', { exact: true }).check();
  await review.getByRole('button', { name: 'Load sample example', exact: true }).click();
  await review.getByRole('button', { name: 'Replace with sample', exact: true }).click();
  await expect(review.getByLabel('Confirm the exact scope revision', { exact: true })).not.toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(backend.unexpected).toEqual([]);
});

test('same-user verification hides work while pending and restores it after a transient failure', async ({ page }) => {
  const backend = await mockBackend(page);
  await signIn(page);
  const panel = await scopeDraft(page);
  const gate = { arrived: deferred(), release: deferred() };
  backend.profileGate = gate;
  try {
    await recheck(page);
    await gate.arrived.promise;
    await expect(page.getByText('Checking your access')).toBeVisible();
    await expect(page.getByLabel('Inclusions', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save planning draft', exact: true })).toHaveCount(0);
  } finally { gate.release.resolve(); }
  await expect(panel.getByLabel('Inclusions', { exact: true })).toHaveValue('Keep these authored inclusions');
  backend.failProfile = true;
  await recheck(page);
  await expect(page.getByRole('heading', { name: 'Workspace unavailable', exact: true })).toBeVisible();
  await expect(page.getByLabel('Inclusions', { exact: true })).toHaveCount(0);
  backend.failProfile = false;
  await page.getByRole('button', { name: 'Check again', exact: true }).click();
  await expect(panel.getByLabel('Inclusions', { exact: true })).toHaveValue('Keep these authored inclusions');
  expect(backend.planCalls.filter(call => call.name === 'save_workspace_plan')).toHaveLength(0);
  expect(backend.unexpected).toEqual([]);
});

test('facility revocation purges drafts on inactive routes and regrant cannot restore them', async ({ page }) => {
  const backend = await mockBackend(page);
  await signIn(page);
  await scopeDraft(page);
  await navigation(page, 'Projects').click();
  await expect(page.getByRole('heading', { name: 'Operations / Projects', exact: true })).toBeVisible();
  backend.facilities = [facilityB];
  await recheck(page);
  await expect(page.getByText('This facility is unavailable in the selected account. Choose an available facility.')).toBeVisible();
  backend.facilities = [facilityA, facilityB];
  await recheck(page);
  await expect(page.getByLabel('Facility', { exact: true })).toHaveValue(facilityA.id);
  await navigation(page, 'Scope').click();
  const panel = page.getByRole('tabpanel').first();
  await expect(panel.getByRole('button', { name: 'Prepare draft', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Prepare draft', exact: true }).click();
  await expect(panel.getByLabel('Inclusions', { exact: true })).toHaveValue('');
  expect(backend.unexpected).toEqual([]);
});

test('changed Auth subject, revoked profile and sign-out clear previous recovery state', async ({ page }) => {
  const backend = await mockBackend(page);
  await signIn(page);
  const panel = await scopeDraft(page);
  // Keep the same profile row to prove that profile ID alone cannot retain work.
  backend.userId = uuid(9);
  await recheck(page);
  await expect(panel.getByRole('button', { name: 'Prepare draft', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Prepare draft', exact: true }).click();
  await expect(panel.getByLabel('Inclusions', { exact: true })).toHaveValue('');
  await panel.getByLabel('Inclusions', { exact: true }).fill('New subject draft');
  backend.profileAvailable = false;
  await recheck(page);
  await expect(page.getByRole('heading', { name: 'Access unavailable', exact: true })).toBeVisible();
  backend.profileAvailable = true;
  await page.getByRole('button', { name: 'Check again', exact: true }).click();
  await panel.getByRole('button', { name: 'Prepare draft', exact: true }).click();
  await expect(panel.getByLabel('Inclusions', { exact: true })).toHaveValue('');
  await panel.getByLabel('Inclusions', { exact: true }).fill('Draft before sign-out');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  backend.userId = uuid(1);
  await signIn(page);
  await page.goto(`/scope?account=${accountA.id}&facility=${facilityA.id}`);
  await panel.getByRole('button', { name: 'Prepare draft', exact: true }).click();
  await expect(panel.getByLabel('Inclusions', { exact: true })).toHaveValue('');
  expect(backend.unexpected).toEqual([]);
});

test('interrupted pending save keeps its exact operation through recheck and blocks scope or route moves', async ({ page }) => {
  const backend = await mockBackend(page);
  await signIn(page);
  const panel = await scopeDraft(page);
  const gate = { arrived: deferred(), release: deferred() };
  backend.saveGate = gate;
  backend.dropNextSaveAck = true;
  try {
    await panel.getByRole('button', { name: 'Save planning draft', exact: true }).click();
    await gate.arrived.promise;
    await recheck(page);
    await expect(panel.getByRole('button', { name: 'Retry same save', exact: true })).toBeVisible();
    await expect(panel.getByLabel('Inclusions', { exact: true })).toBeDisabled();
    await page.getByLabel('Development account', { exact: true }).selectOption(accountB.id);
    await expect(page.getByText('Finish or retry the current planning save before changing context or leaving this screen.')).toBeVisible();
    await page.getByRole('button', { name: 'Return to draft', exact: true }).click();
    await expect(page.getByLabel('Development account', { exact: true })).toHaveValue(accountA.id);
    await navigation(page, 'Projects').click();
    await page.getByRole('button', { name: 'Return to draft', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/scope\\?account=${accountA.id}`));
  } finally { gate.release.resolve(); }
  await expect.poll(() => backend.plans.length).toBe(1);
  await panel.getByRole('button', { name: 'Retry same save', exact: true }).click();
  await expect(panel.getByText('Showing the latest saved copy · revision 1')).toBeVisible();
  const saves = backend.planCalls.filter(call => call.name === 'save_workspace_plan');
  expect(saves).toHaveLength(2);
  expect(saves[1].body).toEqual(saves[0].body);
  expect(saves[1].body.p_account_id).toBe(accountA.id);
  expect(saves[1].body.p_facility_id).toBe(facilityA.id);
  expect(backend.plans).toHaveLength(1);
  expect(backend.unexpected).toEqual([]);
});

test('later account and facility pages resolve once and directory links carry the exact context', async ({ page }) => {
  const backend = await mockBackend(page);
  backend.accounts = Array.from({ length: 55 }, (_, n) => ({ id: uuid(100 + n), display_name: `Synthetic account ${n + 1}`, is_demo: true }));
  const account = backend.accounts[54];
  backend.facilities = Array.from({ length: 55 }, (_, n) => ({ id: uuid(1000 + n), account_id: account.id, display_name: `Synthetic facility ${n + 1}`, is_demo: true }));
  const facility = backend.facilities[54];
  await signIn(page);
  await page.getByRole('navigation', { name: 'Account pages', exact: true }).getByRole('button', { name: 'Next page', exact: true }).click();
  await page.getByRole('link', { name: `View facilities for ${account.display_name}`, exact: true }).click();
  await expect(page.getByLabel('Account', { exact: true })).toHaveValue(account.id);
  await page.getByRole('navigation', { name: 'Facility pages', exact: true }).getByRole('button', { name: 'Next page', exact: true }).click();
  const row = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: facility.display_name, exact: true }) });
  await row.getByRole('button', { name: 'View details', exact: true }).click();
  await row.getByRole('link', { name: 'Plan scope', exact: true }).click();
  await expect(page.getByLabel('Development account', { exact: true })).toHaveValue(account.id);
  await expect(page.getByLabel('Facility', { exact: true })).toHaveValue(facility.id);
  await expect(page.getByRole('tabpanel').first().getByText('You have no planning drafts for this facility yet.')).toBeVisible();
  const reads = backend.requests.filter(url => url.pathname === '/rest/v1/facilities' && url.searchParams.get('account_id') === `eq.${account.id}`);
  // One first and one later facility page in Directory, then one each in Scope.
  // Picker, link resolver and both planning panels share Scope's permitted reads.
  expect(reads).toHaveLength(4);
  await page.getByRole('navigation', { name: 'Planning facility pages', exact: true }).getByRole('button', { name: 'Next page', exact: true }).click();
  await page.getByLabel('Facility', { exact: true }).selectOption(backend.facilities[53].id);
  await expect(page.getByLabel('Facility', { exact: true })).toHaveValue(backend.facilities[53].id);
  await page.getByRole('navigation', { name: 'Work flow', exact: true }).getByRole('link', { name: 'Sampling', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`account=${account.id}.*facility=${backend.facilities[53].id}`));
  expect(backend.unexpected).toEqual([]);
});

test('a wrong-account facility link never grants planning context or a save', async ({ page }) => {
  const backend = await mockBackend(page);
  await signIn(page);
  await page.goto(`/scope?account=${accountB.id}&facility=${facilityA.id}`);
  await expect(page.getByText('This facility is unavailable in the selected account. Choose an available facility.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save planning draft', exact: true })).toHaveCount(0);
  await expect(page.getByRole('option', { name: facilityA.display_name, exact: true })).toHaveCount(0);
  expect(backend.planCalls).toHaveLength(0);
  expect(backend.requests.filter(url => url.pathname === '/rest/v1/facilities').every(url => url.searchParams.get('account_id') === `eq.${accountB.id}`)).toBe(true);
  expect(backend.unexpected).toEqual([]);
});


test('directory access alone cannot restore a draft when planning permission is uncertain or revoked', async ({ page }) => {
  const backend = await mockBackend(page);
  await signIn(page);
  const panel = await scopeDraft(page);
  await panel.getByRole('button', { name: 'Save planning draft', exact: true }).click();
  await expect(panel.getByText('Showing the latest saved copy · revision 1')).toBeVisible();
  await panel.getByLabel('Inclusions', { exact: true }).fill('Unconfirmed planning-authority draft');
  backend.failPlanList = true;
  await recheck(page);
  await expect(page.getByRole('heading', { name: 'Workspace unavailable', exact: true })).toBeVisible();
  await expect(page.getByLabel('Inclusions', { exact: true })).toHaveCount(0);
  backend.failPlanList = false;
  await page.getByRole('button', { name: 'Check again', exact: true }).click();
  await expect(panel.getByLabel('Inclusions', { exact: true })).toHaveValue('Unconfirmed planning-authority draft');
  const gate = { arrived: deferred(), release: deferred() };
  backend.planListGate = gate;
  try {
    await recheck(page);
    await gate.arrived.promise;
    await expect(page.getByText('Checking your access')).toBeVisible();
    await expect(page.getByLabel('Inclusions', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save planning draft', exact: true })).toHaveCount(0);
    backend.planningAllowed = false;
  } finally { gate.release.resolve(); }
  await expect(page.getByRole('heading', { name: 'Access unavailable', exact: true })).toBeVisible();
  expect(backend.accounts).toContainEqual(accountA);
  expect(backend.facilities).toContainEqual(facilityA);
  backend.planningAllowed = true;
  await page.getByRole('button', { name: 'Check again', exact: true }).click();
  await panel.getByRole('button', { name: 'Prepare draft', exact: true }).click();
  await expect(panel.getByLabel('Inclusions', { exact: true })).toHaveValue('');
  expect(backend.planCalls.filter(call => call.name === 'save_workspace_plan')).toHaveLength(1);
  expect(backend.unexpected).toEqual([]);
});
