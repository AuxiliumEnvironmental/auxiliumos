import { createHash } from 'node:crypto';
import { expect, test, type Page, type Route } from '@playwright/test';

// browser_fixture only: actual app/SDK/fetch and browser attachment behavior
// with intercepted synthetic HTTP. No genuine Auth, current grant, provider,
// audit, quarantine, human review or deployment acceptance is claimed.
const ORIGIN = 'https://txofqxictwecgcnvezlb.supabase.co';
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const accountA = { id: uuid(100), display_name: 'Synthetic content East', is_demo: true };
const accountB = { id: uuid(200), display_name: 'Synthetic content West', is_demo: true };
const facilityA = { id: uuid(1001), account_id: accountA.id, display_name: 'Synthetic content East facility', is_demo: true };
const facilityA2 = { id: uuid(1002), account_id: accountA.id, display_name: 'Synthetic second facility', is_demo: true };
const content = Buffer.from('AuxiliumOS synthetic fixture\nCONTENT-ONLY-IN-DOWNLOAD\r\nCafé <script>not executable</script>');
const digest = createHash('sha256').update(content).digest('hex');
const versionId = uuid(601);
const filename = `document-version-${versionId}.txt`;
const version = (changes: Record<string, unknown> = {}) => ({ version_id: versionId, version_ordinal: 1, object_id: uuid(701),
  verified_sha256: digest, byte_size: content.length, media_type: 'text/plain', lifecycle_state: 'internal_draft',
  created_at: '2026-10-09T12:00:00Z', preservation_hold_at_adoption: true, preservation_hold: true, visibility_restricted: false, ...changes });
type Mode = 'ok' | 'denied' | 'missing_route' | 'provider' | 'media' | 'digest' | 'length' | 'filename' | 'headers' | 'network' | 'conflict' | 'unauthenticated';
type Probe = { created: string[]; revoked: string[]; sizes: number[]; clicks: number; failSave: boolean; digestWaiting: boolean; holdDigest: boolean; releaseDigest?: () => void };
declare global { interface Window { __documentContentProbe: Probe } }
function gate() {
  let arrive!: () => void, release!: () => void, finish!: () => void;
  return { arrived: new Promise<void>(resolve => { arrive = resolve; }), wait: new Promise<void>(resolve => { release = resolve; }),
    finished: new Promise<void>(resolve => { finish = resolve; }), arrive: () => arrive(), release: () => release(), finish: () => finish() };
}
const errors = new WeakMap<Page, { unexpected: string[]; browserErrors: string[] }>();
async function fixture(page: Page) {
  await page.addInitScript(() => {
    const probe: Probe = { created: [], revoked: [], sizes: [], clicks: 0, failSave: false, digestWaiting: false, holdDigest: false };
    window.__documentContentProbe = probe;
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = value => { const url = create(value); probe.created.push(url); probe.sizes.push((value as Blob).size); return url; };
    URL.revokeObjectURL = url => { probe.revoked.push(url); revoke(url); };
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) { if (probe.failSave) throw new Error('Synthetic browser save rejection'); probe.clicks++; }
      click.call(this);
    };
    const hash = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = async (...args) => {
      const result = await hash(...args);
      if (probe.holdDigest) { probe.digestWaiting = true; await new Promise<void>(resolve => { probe.releaseDigest = resolve; }); }
      return result;
    };
  });
  const user = { id: uuid(1), aud: 'authenticated', role: 'authenticated', email: 'content-fixture@example.invalid',
    email_confirmed_at: '2026-10-09T00:00:00Z', phone: '', app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {}, identities: [], created_at: '2026-10-09T00:00:00Z', is_anonymous: false };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, role: 'authenticated', is_anonymous: false, exp: Math.floor(Date.now() / 1000) + 3600 })}.synthetic-content-signature`;
  const state = { mode: 'ok' as Mode, versions: [version()], profileAvailable: true, contentGate: null as ReturnType<typeof gate> | null,
    contentCalls: [] as string[], unexpected: [] as string[], browserErrors: [] as string[] };
  errors.set(page, state); page.on('pageerror', error => state.browserErrors.push(error.message));
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route(`${ORIGIN}/**`, async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname === '/auth/v1/token') return json(route, { access_token: token, refresh_token: 'synthetic-content-refresh', token_type: 'bearer', expires_in: 3600, user });
    if (url.pathname === '/auth/v1/user') return json(route, user);
    if (url.pathname === '/auth/v1/logout') return json(route, {});
    if (url.pathname === '/rest/v1/user_profiles') return json(route, state.profileAvailable ? [{ id: uuid(2), display_name: 'Synthetic content operator', identity_status: 'active', is_demo: true }] : []);
    if (url.pathname === '/rest/v1/client_accounts') return json(route, [accountA, accountB]);
    if (url.pathname === '/rest/v1/facilities') return json(route, [facilityA, facilityA2].filter(row => `eq.${row.account_id}` === url.searchParams.get('account_id')));
    if (url.pathname === '/rest/v1/rpc/list_version_documents') {
      const args = request.postDataJSON();
      return json(route, { items: args.p_account_id === accountA.id ? [{ document_id: uuid(400), account_id: accountA.id, facility_id: facilityA.id,
        title: 'Synthetic version-bound document', document_class: 'internal_note', document_revision: 2, can_create_version: false }] : [], next_cursor: null });
    }
    if (url.pathname === '/rest/v1/rpc/list_document_versions') return json(route, { document_id: uuid(400), state: 'available',
      document_revision: 2, items: state.versions, next_cursor: null });
    if (url.pathname === `/functions/v1/document-version-content/${versionId}/content`) {
      expect(request.method()).toBe('GET'); expect(request.postData()).toBeNull();
      expect(url.search).toBe(`?sha256=${digest}`);
      expect(request.headers().authorization).toBe(`Bearer ${token}`);
      expect(request.headers().apikey).toBe('sb_publishable_synthetic_browser_fixture');
      expect(request.headers().referer).toBeUndefined();
      state.contentCalls.push(url.pathname + url.search);
      const wait = state.contentGate;
      if (wait) { wait.arrive(); await wait.wait; }
      try {
        if (state.mode === 'network') return await route.abort('failed');
        if (state.mode === 'missing_route') return await route.fulfill({ status: 404, contentType: 'text/html', body: 'PRIVATE missing provider route' });
        if (['denied', 'provider', 'conflict', 'unauthenticated'].includes(state.mode)) return await json(route,
          { error: state.mode === 'denied' ? 'not_found_or_unavailable' : 'PRIVATE provider details' },
          { denied: 404, provider: 503, conflict: 409, unauthenticated: 401 }[state.mode as 'denied']);
        const body = state.mode === 'digest' ? Buffer.alloc(content.length, 'x') : content;
        return await route.fulfill({ status: 200, body, headers: {
          'Content-Type': state.mode === 'media' ? 'text/html' : 'text/plain; charset=utf-8',
          'Content-Length': String(content.length), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
          'Content-Disposition': `attachment; filename="${state.mode === 'filename' ? '../provider-name.txt' : filename}"`,
          'Access-Control-Expose-Headers': state.mode === 'headers' ? '' : 'Content-Disposition, Content-Length, X-Content-Type-Options, Cache-Control',
          ...(state.mode === 'length' ? { 'Content-Length': String(content.length + 1) } : {}),
        } });
      } finally { wait?.finish(); }
    }
    state.unexpected.push(`${request.method()} ${url.pathname}`); return route.abort('blockedbyclient');
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === ORIGIN) return route.fallback();
    if (url.origin === 'http://127.0.0.1:4179') return route.continue();
    state.unexpected.push(`external ${url.origin}${url.pathname}`); return route.abort('blockedbyclient');
  });
  return state;
}
test.afterEach(async ({ page }) => {
  expect(errors.get(page)?.unexpected ?? []).toEqual([]); expect(errors.get(page)?.browserErrors ?? []).toEqual([]);
});
async function openHistory(page: Page) {
  await page.goto('/documents');
  await page.getByLabel('Email', { exact: true }).fill('content-fixture@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('synthetic-content-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Account', { exact: true }).selectOption(accountA.id);
  await page.getByLabel('Facility', { exact: true }).selectOption(facilityA.id);
  await page.getByRole('button', { name: 'View version history: Synthetic version-bound document', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Version 1 · Internal draft', exact: true })).toBeVisible();
}
const action = (page: Page, retry = false) => page.getByRole('button', { name: retry ? 'Retry secure download' : 'Request secure download', exact: true });
async function assertNoContentPersistence(page: Page) {
  await expect(page.getByText('CONTENT-ONLY-IN-DOWNLOAD', { exact: false })).toHaveCount(0);
  await expect(page.locator('a[download]')).toHaveCount(0);
  expect(await page.evaluate(() => [...Object.values(localStorage), ...Object.values(sessionStorage)]
    .some(value => /CONTENT-ONLY-IN-DOWNLOAD|document-version-|blob:|verifiedSha256/.test(value)))).toBe(false);
  expect(await page.evaluate(() => caches.keys())).toEqual([]);
}
async function assertNoHandoff(page: Page) {
  expect(await page.evaluate(() => window.__documentContentProbe.created)).toEqual([]);
  expect(await page.evaluate(() => window.__documentContentProbe.clicks)).toBe(0);
  await expect(page.getByText(/Browser handoff initiated/)).toHaveCount(0);
  await assertNoContentPersistence(page);
}

test('fixture secure download: explicit request verifies exact bytes and hands off one version-named attachment without content persistence', async ({ page }) => {
  const backend = await fixture(page);
  backend.versions.push(version({ version_id: uuid(602), object_id: uuid(702), version_ordinal: 2, visibility_restricted: true }));
  await openHistory(page);
  expect(backend.contentCalls).toHaveLength(0);
  await expect(action(page)).toHaveCount(1);
  await expect(page.getByText('Secure download unavailable while this version is restricted.', { exact: true })).toBeVisible();
  await expect(page.getByText('Requires separate current permission for this exact version.', { exact: true })).toBeVisible();
  await page.getByText('Secure download boundary', { exact: true }).click();
  await expect(page.getByText(/Already downloaded files cannot be recalled/)).toBeVisible();
  const handoff = page.waitForEvent('download'); await action(page).click();
  await expect(page.getByText(/Browser handoff initiated/)).toBeVisible();
  const download = await handoff; expect(download.suggestedFilename()).toBe(filename);
  const stream = await download.createReadStream(); const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const received = Buffer.concat(chunks);
  expect(received).toEqual(content); expect(createHash('sha256').update(received).digest('hex')).toBe(digest);
  await expect(page.getByRole('status').filter({ hasText: 'Browser handoff initiated.' })).toBeVisible();
  expect(backend.contentCalls).toHaveLength(1);
  await expect.poll(() => page.evaluate(() => window.__documentContentProbe.revoked.length)).toBe(1);
  expect(await page.evaluate(() => window.__documentContentProbe.sizes)).toEqual([content.length]);
  await assertNoContentPersistence(page);
});

for (const mode of ['denied', 'missing_route', 'provider', 'media', 'digest', 'length', 'filename', 'headers', 'network', 'conflict'] as const) {
  test(`fixture secure download: ${mode} fails closed with a safe recoverable state`, async ({ page }) => {
    const backend = await fixture(page); backend.mode = mode;
    await openHistory(page); await action(page).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByText(/PRIVATE|provider-name/)).toHaveCount(0);
    await assertNoHandoff(page);
    await expect(page.getByRole('heading', { name: 'Version 1 · Internal draft', exact: true })).toBeVisible();
    backend.mode = 'ok'; const handoff = page.waitForEvent('download'); await action(page, true).click(); await handoff;
    await expect(page.getByText(/Browser handoff initiated/)).toBeVisible();
    expect(backend.contentCalls).toHaveLength(2);
  });
}

test('fixture secure download: a prior handoff grants no next-read permission and its bytes are not reused', async ({ page }) => {
  const backend = await fixture(page); await openHistory(page);
  const handoff = page.waitForEvent('download'); await action(page).click(); await handoff;
  await expect(page.getByText(/Browser handoff initiated/)).toBeVisible();
  backend.mode = 'denied'; await action(page).click();
  await expect(page.getByRole('alert')).toContainText('unavailable to your current access');
  await expect(page.getByText(/Browser handoff initiated/)).toHaveCount(0);
  expect(backend.contentCalls).toHaveLength(2);
  expect(await page.evaluate(() => window.__documentContentProbe.clicks)).toBe(1);
  expect(await page.evaluate(() => window.__documentContentProbe.revoked)).toEqual(await page.evaluate(() => window.__documentContentProbe.created));
  await assertNoContentPersistence(page);
});

test('fixture secure download: duplicate clicks issue one request; cancel discards late bytes and permits a deliberate retry', async ({ page }) => {
  const backend = await fixture(page); backend.contentGate = gate();
  await openHistory(page);
  await action(page).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await backend.contentGate.arrived; expect(backend.contentCalls).toHaveLength(1);
  await expect(action(page)).toBeDisabled();
  await expect(page.getByRole('status').filter({ hasText: 'Checking current permission' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel download request', exact: true }).click();
  backend.contentGate.release(); await backend.contentGate.finished;
  await assertNoHandoff(page);
  backend.contentGate = null; const handoff = page.waitForEvent('download'); await action(page).click(); await handoff;
  expect(backend.contentCalls).toHaveLength(2);
});

for (const transition of ['facility', 'account', 'logout', 'profile', 'history_revision'] as const) {
  test(`fixture secure download: ${transition} change drops late bytes before browser handoff`, async ({ page }) => {
    const backend = await fixture(page); backend.contentGate = gate();
    await openHistory(page); await action(page).click(); await backend.contentGate.arrived;
    if (transition === 'facility') await page.getByLabel('Facility', { exact: true }).selectOption(facilityA2.id);
    if (transition === 'account') await page.getByLabel('Account', { exact: true }).selectOption(accountB.id);
    if (transition === 'logout') await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    if (transition === 'profile') { backend.profileAvailable = false; await page.getByRole('button', { name: 'Refresh', exact: true }).click(); }
    if (transition === 'history_revision') await page.getByRole('button', { name: 'Refresh version history', exact: true }).click();
    backend.contentGate.release(); await backend.contentGate.finished;
    if (transition === 'logout') await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    if (transition === 'profile') await expect(page.getByRole('heading', { name: 'Access unavailable', exact: true })).toBeVisible();
    if (transition === 'history_revision') await expect(action(page)).toBeEnabled();
    await assertNoHandoff(page);
  });
}

test('fixture secure download: logout while byte hashing is pending discards already received content', async ({ page }) => {
  await fixture(page); await openHistory(page);
  await page.evaluate(() => { window.__documentContentProbe.holdDigest = true; });
  await action(page).click();
  await expect.poll(() => page.evaluate(() => window.__documentContentProbe.digestWaiting)).toBe(true);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.evaluate(() => window.__documentContentProbe.releaseDigest?.());
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await assertNoHandoff(page);
});

test('fixture secure download: unauthenticated response clears workspace without displaying provider detail', async ({ page }) => {
  const backend = await fixture(page); backend.mode = 'unauthenticated';
  await openHistory(page); await action(page).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Document versions', exact: true })).toHaveCount(0);
  await expect(page.getByText(/PRIVATE/)).toHaveCount(0); await assertNoHandoff(page);
});

test('fixture secure download: browser save failure revokes the temporary URL and retry rechecks permission', async ({ page }) => {
  const backend = await fixture(page); await openHistory(page);
  await page.evaluate(() => { window.__documentContentProbe.failSave = true; });
  await action(page).click();
  await expect(page.getByRole('alert')).toContainText('browser handoff could not be confirmed');
  expect(await page.evaluate(() => window.__documentContentProbe.revoked)).toEqual(await page.evaluate(() => window.__documentContentProbe.created));
  expect(await page.evaluate(() => window.__documentContentProbe.clicks)).toBe(0);
  await page.evaluate(() => { window.__documentContentProbe.failSave = false; });
  const handoff = page.waitForEvent('download'); await action(page, true).click(); await handoff;
  expect(backend.contentCalls).toHaveLength(2); await assertNoContentPersistence(page);
});

test('fixture secure download: phone keyboard control and scope cleanup after browser handoff', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page); await openHistory(page);
  const boundary = page.getByText('Secure download boundary', { exact: true });
  await boundary.focus(); await page.keyboard.press('Enter');
  await expect(page.getByText(/Already downloaded files cannot be recalled/)).toBeVisible();
  expect((await boundary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await action(page).focus(); await expect(action(page)).toBeFocused();
  const geometry = await action(page).boundingBox(); expect(geometry!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('document-content-mobile.png'), fullPage: true });
  const handoff = page.waitForEvent('download'); await page.keyboard.press('Enter'); await handoff;
  await expect(page.getByText(/Browser handoff initiated/)).toBeVisible();
  expect(await page.evaluate(() => window.__documentContentProbe.revoked)).toEqual([]);
  await page.getByLabel('Facility', { exact: true }).selectOption(facilityA2.id);
  expect(await page.evaluate(() => window.__documentContentProbe.revoked)).toEqual(await page.evaluate(() => window.__documentContentProbe.created));
  await assertNoContentPersistence(page);
});
