import { expect, test, type Page, type Route } from '@playwright/test';

// Explicit browser_fixture evidence: real React and Supabase SDK with intercepted
// synthetic HTTP only. These tests do not authenticate real users, store bytes,
// execute RLS, prove tenancy, or contact a deployed backend.
const ORIGIN = 'https://txofqxictwecgcnvezlb.supabase.co';
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const accountA = { id: uuid(100), display_name: 'Synthetic East account', is_demo: true };
const accountB = { id: uuid(200), display_name: 'Synthetic West account', is_demo: true };
const facilityA = { id: uuid(1001), account_id: accountA.id, display_name: 'Synthetic East facility', is_demo: true };
const facilityA2 = { id: uuid(1002), account_id: accountA.id, display_name: 'Synthetic second East facility', is_demo: true };
const facilityB = { id: uuid(2001), account_id: accountB.id, display_name: 'Synthetic West facility', is_demo: true };
const contents = 'AuxiliumOS synthetic fixture\nPrivate fixture body is not a preview.';
const fileLabel = 'Synthetic UTF-8 text file';
const confirmation = 'I am uploading a synthetic fixture with no PHI or real client data.';
type Status = ReturnType<typeof status>;
function status(state: 'reserved' | 'receiving' | 'stored_unverified' | 'finalized' | 'expired' = 'reserved') {
  return { objectId: uuid(300), state, stateRevision: { reserved: 1, receiving: 2, stored_unverified: 3, finalized: 4, expired: 3 }[state],
    expiresAt: '2099-10-09T12:00:00Z', scanState: 'pending', clearanceState: 'pending', quarantined: true,
    failureCode: null, nextAction: state === 'finalized' ? 'await_review' : 'retry_same_file' };
}
function gate() {
  let arrive!: () => void;
  let release!: () => void;
  return { arrived: new Promise<void>(resolve => { arrive = resolve; }), wait: new Promise<void>(resolve => { release = resolve; }), arrive: () => arrive(), release: () => release() };
}

async function fixture(page: Page) {
  const user = { id: uuid(1), aud: 'authenticated', role: 'authenticated', email: 'private-fixture@example.invalid',
    email_confirmed_at: '2026-10-08T00:00:00Z', phone: '', app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {}, identities: [], created_at: '2026-10-08T00:00:00Z', is_anonymous: false };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, role: 'authenticated', is_anonymous: false, exp: Math.floor(Date.now() / 1000) + 3600 })}.synthetic-signature`;
  const state = {
    accounts: [accountA, accountB], facilities: [facilityA, facilityA2, facilityB], profileAvailable: true,
    failAccounts: false, failFacilities: false, facilityGate: null as ReturnType<typeof gate> | null,
    putGate: null as ReturnType<typeof gate> | null, finalizeGate: null as ReturnType<typeof gate> | null,
    reserveError: null as string | null, putError: null as string | null, statusError: null as string | null,
    lostReservation: false, lostFinalization: false, unsafeFinalization: false,
    current: null as Status | null, reservations: new Map<string, Record<string, unknown>>(),
    calls: [] as { method: string; suffix: string; body: unknown; revision?: string }[],
    facilityRequests: [] as string[], unexpected: [] as string[],
  };
  const json = (route: Route, body: unknown, responseStatus = 200) => route.fulfill({ status: responseStatus, contentType: 'application/json', body: JSON.stringify(body) });
  const failure = (route: Route, code: string) => json(route, { error: code, message: 'PRIVATE provider detail must never be displayed' }, code === 'unauthenticated' ? 401 : code === 'not_found_or_unavailable' ? 404 : code === 'conflict' ? 409 : 503);
  await page.route(`${ORIGIN}/**`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/auth/v1/token') return json(route, { access_token: token, refresh_token: 'synthetic-private-refresh', token_type: 'bearer', expires_in: 3600, user });
    if (url.pathname === '/auth/v1/user') return json(route, user);
    if (url.pathname === '/auth/v1/logout') return json(route, {});
    if (url.pathname === '/rest/v1/user_profiles') return json(route, state.profileAvailable ? [{ id: uuid(2), display_name: 'Synthetic operator', identity_status: 'active', is_demo: true }] : []);
    if (url.pathname === '/rest/v1/client_accounts') {
      if (state.failAccounts) return json(route, { message: 'PRIVATE provider detail' }, 503);
      const after = url.searchParams.get('id')?.replace(/^gt\./, '');
      return json(route, state.accounts.filter(row => !after || row.id > after).slice(0, 51));
    }
    if (url.pathname === '/rest/v1/facilities') {
      expect(url.searchParams.get('select')).toBe('id,account_id,display_name,is_demo');
      const scope = url.searchParams.get('account_id');
      expect(scope).toMatch(/^eq\.[0-9a-f-]{36}$/);
      state.facilityRequests.push(scope!.slice(3));
      if (state.facilityGate) { state.facilityGate.arrive(); await state.facilityGate.wait; }
      if (state.failFacilities) return json(route, { message: 'PRIVATE provider detail' }, 503);
      const after = url.searchParams.get('id')?.replace(/^gt\./, '');
      return json(route, state.facilities.filter(row => `eq.${row.account_id}` === scope && (!after || row.id > after)).slice(0, 51));
    }
    if (url.pathname.startsWith('/functions/v1/private-objects')) {
      const suffix = url.pathname.slice('/functions/v1/private-objects'.length);
      const method = request.method();
      const body = method === 'PUT' ? request.postDataBuffer()?.toString('utf8') : method === 'POST' ? request.postDataJSON() : null;
      state.calls.push({ method, suffix, body, revision: request.headers()['x-state-revision'] });
      expect(request.headers().authorization).toBe(`Bearer ${token}`);
      expect(request.headers().apikey).toBe('sb_publishable_synthetic_browser_fixture');
      if (suffix === '' && method === 'POST') {
        if (state.reserveError) return failure(route, state.reserveError);
        const args = body as Record<string, unknown>;
        const previous = state.reservations.get(String(args.idempotencyKey));
        if (previous) expect(args).toEqual(previous);
        else { state.reservations.set(String(args.idempotencyKey), args); state.current = status(); }
        if (state.lostReservation) return failure(route, 'backend_unavailable');
        return json(route, state.current, 201);
      }
      if (suffix === `/${uuid(300)}` && method === 'GET') {
        if (state.statusError) return failure(route, state.statusError);
        return json(route, state.current);
      }
      if (suffix === `/${uuid(300)}/bytes` && method === 'PUT') {
        if (state.putGate) { state.putGate.arrive(); await state.putGate.wait; }
        if (state.putError) { state.current = status('receiving'); return failure(route, state.putError); }
        state.current = status('stored_unverified');
        return json(route, state.current);
      }
      if (suffix === `/${uuid(300)}/finalize` && method === 'POST') {
        expect(body).toEqual({ expectedStateRevision: 3 });
        if (state.finalizeGate) { state.finalizeGate.arrive(); await state.finalizeGate.wait; }
        state.current = status('finalized');
        if (state.lostFinalization) return failure(route, 'backend_unavailable');
        return json(route, state.unsafeFinalization ? { ...state.current, quarantined: false, scanState: 'passed' } : state.current);
      }
    }
    state.unexpected.push(`${request.method()} ${url.pathname}`);
    return route.abort('blockedbyclient');
  });
  // Block every non-local request unless it is explicitly handled above.
  await page.route('**/*', route => {
    const origin = new URL(route.request().url()).origin;
    if (origin === ORIGIN) return route.fallback();
    if (origin === 'http://127.0.0.1:4179') return route.continue();
    state.unexpected.push(`external ${origin}`);
    return route.abort('blockedbyclient');
  });
  return state;
}
async function signIn(page: Page, path = '/documents') {
  await page.goto(path);
  await page.getByLabel('Email', { exact: true }).fill('private-fixture@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('synthetic-private-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Private files', exact: true })).toBeVisible();
}
async function chooseScope(page: Page) {
  await page.getByLabel('Account', { exact: true }).selectOption(accountA.id);
  await page.getByLabel('Facility', { exact: true }).selectOption(facilityA.id);
  await expect(page.getByLabel(fileLabel)).toBeVisible();
}
async function chooseFile(page: Page, buffer: Buffer = Buffer.from(contents), name = 'synthetic.txt') {
  await page.getByLabel(fileLabel).setInputFiles({ name, mimeType: 'text/plain', buffer });
  await page.getByLabel(confirmation, { exact: true }).check();
}
async function upload(page: Page) {
  await page.getByRole('button', { name: 'Upload synthetic file', exact: true }).click();
}

test('fixture browser: permitted scope, loading and recoverable directory failure gate uploads', async ({ page }) => {
  const backend = await fixture(page);
  backend.failAccounts = true;
  await signIn(page);
  await expect(page.getByRole('alert')).toContainText('could not be reached');
  backend.failAccounts = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Choose an account', exact: true })).toBeVisible();
  await expect(page.getByLabel(fileLabel)).toHaveCount(0);
  backend.facilityGate = gate();
  backend.failFacilities = true;
  await page.getByLabel('Account', { exact: true }).selectOption(accountA.id);
  await backend.facilityGate.arrived;
  await expect(page.getByRole('status')).toContainText('Loading facilities');
  await expect(page.getByLabel(fileLabel)).toHaveCount(0);
  backend.facilityGate.release();
  await expect(page.getByRole('alert')).toContainText('could not be reached');
  await expect(page.getByText('PRIVATE provider detail')).toHaveCount(0);
  backend.failFacilities = false;
  backend.facilityGate = null;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.getByLabel('Facility', { exact: true }).selectOption(facilityA.id);
  await expect(page.getByLabel(fileLabel)).toBeVisible();
  expect(backend.calls).toEqual([]);
  expect(backend.unexpected).toEqual([]);
});

test('fixture browser: unlisted deep links and empty account/facility pages do not imply access', async ({ page }) => {
  const backend = await fixture(page);
  await signIn(page, `/documents?account=${uuid(999)}`);
  await expect(page.getByRole('heading', { name: 'Account unavailable on this page' })).toBeVisible();
  expect(backend.facilityRequests).toEqual([]);
  await expect(page.getByLabel(fileLabel)).toHaveCount(0);
  backend.accounts = [];
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No accounts available' })).toBeVisible();
  backend.accounts = [accountA, accountB];
  backend.facilities = [];
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByLabel('Account', { exact: true }).selectOption(accountB.id);
  await expect(page.getByRole('heading', { name: 'No facilities available' })).toBeVisible();
  await expect(page.getByLabel(fileLabel)).toHaveCount(0);
  expect(backend.calls).toEqual([]);
  expect(backend.unexpected).toEqual([]);
});

test('fixture browser: confirmation, exact scoped wire contract and pending finalization never imply release', async ({ page }, testInfo) => {
  const backend = await fixture(page);
  backend.finalizeGate = gate();
  await signIn(page);
  await chooseScope(page);
  await page.getByLabel(fileLabel).setInputFiles({ name: 'never-sent-to-server.txt', mimeType: 'text/plain', buffer: Buffer.from(contents) });
  await expect(page.getByRole('button', { name: 'Upload synthetic file', exact: true })).toBeDisabled();
  await page.getByLabel(confirmation, { exact: true }).check();
  await page.getByLabel(confirmation, { exact: true }).press('Tab');
  await expect(page.getByRole('button', { name: 'Upload synthetic file', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await backend.finalizeGate.arrived;
  await expect(page.getByText('Bytes verified; finalization pending', { exact: true })).toBeVisible();
  await expect(page.getByText('Upload finalized; quarantined', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Verifying upload…', exact: true })).toBeDisabled();
  backend.finalizeGate.release();
  await expect(page.getByText('Upload finalized; quarantined', { exact: true })).toBeVisible();
  expect(backend.calls.map(call => [call.method, call.suffix])).toEqual([
    ['POST', ''], ['PUT', `/${uuid(300)}/bytes`], ['POST', `/${uuid(300)}/finalize`],
  ]);
  expect(backend.calls[0].body).toEqual({ accountId: accountA.id, facilityId: facilityA.id, idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/), byteSize: Buffer.byteLength(contents), mediaType: 'text/plain' });
  expect(backend.calls[1].body).toBe(contents);
  expect(backend.calls[1].revision).toBe('1');
  await expect(page.getByText('Scan: pending. Human clearance: pending.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: /download|preview|release|clearance|scan/i })).toHaveCount(0);
  await expect(page.getByText('Private fixture body is not a preview.', { exact: false })).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('private-files-desktop-fixture.png'), fullPage: true });
  expect(backend.unexpected).toEqual([]);
});

test('fixture browser: invalid bytes are rejected before an endpoint request', async ({ page }) => {
  const backend = await fixture(page);
  await signIn(page);
  await chooseScope(page);
  for (const [buffer, message] of [
    [Buffer.alloc(0), 'non-empty'], [Buffer.alloc(65_537), '64 KiB'],
    [Buffer.from('No required synthetic marker'), 'Use a UTF-8 text file'],
    [Buffer.concat([Buffer.from('AuxiliumOS synthetic fixture\n'), Buffer.from([0xff])]), 'Use a UTF-8 text file'],
    [Buffer.from('AuxiliumOS synthetic fixture\nContains\0NUL'), 'Use a UTF-8 text file'],
  ] as [Buffer, string][]) {
    await chooseFile(page, buffer);
    await upload(page);
    await expect(page.getByRole('alert')).toContainText(message);
    await expect(page.getByLabel(fileLabel)).toBeEnabled();
  }
  expect(backend.calls).toEqual([]);
  expect(backend.unexpected).toEqual([]);
});

test('fixture browser: ambiguous reservation keeps immutable file and idempotency key for retry', async ({ page }) => {
  const backend = await fixture(page);
  backend.lostReservation = true;
  await signIn(page);
  await chooseScope(page);
  await chooseFile(page);
  await upload(page);
  await expect(page.getByRole('alert')).toContainText('could not be confirmed');
  await expect(page.getByLabel(fileLabel)).toBeDisabled();
  await expect(page.getByLabel(confirmation, { exact: true })).toBeDisabled();
  await expect(page.getByText('Upload finalized; quarantined', { exact: true })).toHaveCount(0);
  backend.lostReservation = false;
  await page.getByRole('button', { name: 'Retry same file', exact: true }).click();
  await expect(page.getByText('Upload finalized; quarantined', { exact: true })).toBeVisible();
  expect(backend.calls[1].body).toEqual(backend.calls[0].body);
  expect(backend.reservations.size).toBe(1);
  await expect(page.getByText('PRIVATE provider detail', { exact: false })).toHaveCount(0);
  expect(backend.unexpected).toEqual([]);
});

test('fixture browser: conflict is recoverable with current status and exact same bytes', async ({ page }) => {
  const backend = await fixture(page);
  backend.putError = 'conflict';
  await signIn(page);
  await chooseScope(page);
  await chooseFile(page);
  await upload(page);
  await expect(page.getByRole('alert')).toContainText('Refresh status');
  await expect(page.getByText('Upload finalized; quarantined', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await expect(page.getByText('Upload pending confirmation', { exact: true })).toBeVisible();
  backend.putError = null;
  await page.getByRole('button', { name: 'Retry same file', exact: true }).click();
  await expect(page.getByText('Upload finalized; quarantined', { exact: true })).toBeVisible();
  const puts = backend.calls.filter(call => call.method === 'PUT');
  expect(puts.map(call => call.body)).toEqual([contents, contents]);
  expect(puts.map(call => call.revision)).toEqual(['1', '2']);
  expect(backend.reservations.size).toBe(1);
  expect(backend.unexpected).toEqual([]);
});

test('fixture browser: lost finalization response is not a success until status confirms it', async ({ page }) => {
  const backend = await fixture(page);
  backend.lostFinalization = true;
  await signIn(page);
  await chooseScope(page);
  await chooseFile(page);
  await upload(page);
  await expect(page.getByRole('alert')).toContainText('could not be confirmed');
  await expect(page.getByText('Bytes verified; finalization pending', { exact: true })).toBeVisible();
  await expect(page.getByText('Upload finalized; quarantined', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Retry same file', exact: true }).click();
  await expect(page.getByText('Upload finalized; quarantined', { exact: true })).toBeVisible();
  expect(backend.calls.filter(call => call.suffix.endsWith('/finalize'))).toHaveLength(1);
  expect(backend.calls.filter(call => call.method === 'PUT')).toHaveLength(1);
  expect(backend.reservations.size).toBe(1);
  expect(backend.unexpected).toEqual([]);
});

test('fixture browser: disabled transport and malformed authority response cannot report a successful upload', async ({ page }) => {
  const backend = await fixture(page);
  backend.reserveError = 'transport_disabled';
  await signIn(page);
  await chooseScope(page);
  await chooseFile(page);
  await upload(page);
  await expect(page.getByRole('alert')).toContainText('has not been enabled');
  expect(backend.calls.filter(call => call.method === 'PUT')).toHaveLength(0);
  backend.reserveError = null;
  backend.unsafeFinalization = true;
  await page.getByRole('button', { name: 'Retry same file', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('could not be confirmed');
  await expect(page.getByText('Upload finalized; quarantined', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Bytes verified; finalization pending', { exact: true })).toBeVisible();
  expect(backend.unexpected).toEqual([]);
});

test('fixture browser: access denial clears file and prior status; expired Auth closes the page', async ({ page }) => {
  const backend = await fixture(page);
  await signIn(page);
  await chooseScope(page);
  await chooseFile(page);
  await upload(page);
  await expect(page.getByText('Upload finalized; quarantined', { exact: true })).toBeVisible();
  backend.statusError = 'not_found_or_unavailable';
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('unavailable to your current access');
  await expect(page.getByText(uuid(300), { exact: false })).toHaveCount(0);
  await expect(page.getByLabel(fileLabel)).toHaveValue('');
  await expect(page.getByLabel(confirmation, { exact: true })).not.toBeChecked();
  backend.reserveError = 'unauthenticated';
  await chooseFile(page);
  await upload(page);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Private files', exact: true })).toHaveCount(0);
  await expect(page.getByLabel(fileLabel)).toHaveCount(0);
  expect(backend.unexpected).toEqual([]);
});

test('fixture browser: expired attempt preserves history and requires a new file choice', async ({ page }) => {
  const backend = await fixture(page);
  backend.putError = 'provider_unavailable';
  await signIn(page);
  await chooseScope(page);
  await chooseFile(page);
  await upload(page);
  await expect(page.getByRole('alert')).toContainText('could not be verified');
  backend.current = status('expired');
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await expect(page.getByText('Upload window expired; history preserved', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry same file', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Choose a new file', exact: true }).click();
  await expect(page.getByLabel(fileLabel)).toHaveValue('');
  await expect(page.getByText('Upload window expired; history preserved', { exact: true })).toHaveCount(0);
  expect(backend.calls.some(call => call.method === 'DELETE')).toBe(false);
  expect(backend.reservations.size).toBe(1);
  expect(backend.unexpected).toEqual([]);
});

test('fixture browser: scope changes and sign-out discard in-flight UI without claiming cancellation on the server', async ({ page }) => {
  const backend = await fixture(page);
  backend.putGate = gate();
  await signIn(page);
  await chooseScope(page);
  await chooseFile(page);
  await upload(page);
  await backend.putGate.arrived;
  await page.getByLabel('Facility', { exact: true }).selectOption(facilityA2.id);
  await expect(page.getByLabel(fileLabel)).toHaveValue('');
  await expect(page.getByText(uuid(300), { exact: false })).toHaveCount(0);
  backend.putGate.release();
  await expect(page.getByRole('button', { name: 'Upload synthetic file', exact: true })).toBeDisabled();
  await page.getByLabel('Account', { exact: true }).selectOption(accountB.id);
  await expect(page.getByLabel(fileLabel)).toHaveCount(0);
  await page.getByLabel('Facility', { exact: true }).selectOption(facilityB.id);
  await chooseFile(page);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByLabel(fileLabel)).toHaveCount(0);
  expect(backend.calls.filter(call => call.suffix.endsWith('/finalize'))).toHaveLength(0);
  expect(backend.calls.some(call => call.method === 'DELETE')).toBe(false);
  expect(await page.evaluate(fixtureContents => Object.values(localStorage).some(value => value.includes(fixtureContents) || value.includes('synthetic.txt') || value.includes('objectId')), contents)).toBe(false);
  expect(backend.unexpected).toEqual([]);
});

test('fixture browser: directory pagination clears scoped file choices and phone layout stays usable', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const backend = await fixture(page);
  backend.facilities = Array.from({ length: 51 }, (_, index) => ({ ...facilityA, id: uuid(1001 + index), display_name: `Synthetic permitted facility ${index + 1}` }));
  await signIn(page);
  await chooseScope(page);
  await chooseFile(page);
  const pagination = page.getByRole('navigation', { name: 'Private-file facility pages' });
  await pagination.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(pagination).toContainText('Page 2');
  await expect(page.getByLabel(fileLabel)).toHaveCount(0);
  await page.getByLabel('Facility', { exact: true }).selectOption(uuid(1051));
  await expect(page.getByLabel(fileLabel)).toHaveValue('');
  await expect(page.getByLabel(confirmation, { exact: true })).not.toBeChecked();
  const geometry = await page.getByLabel(confirmation, { exact: true }).evaluate(input => ({
    width: input.getBoundingClientRect().width, height: input.getBoundingClientRect().height,
    labelHeight: input.closest('label')!.getBoundingClientRect().height,
  }));
  expect(geometry.width).toBe(18);
  expect(geometry.height).toBe(18);
  expect(geometry.labelHeight).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('private-files-phone-fixture.png'), fullPage: true });
  expect(backend.calls).toEqual([]);
  expect(backend.unexpected).toEqual([]);
});
