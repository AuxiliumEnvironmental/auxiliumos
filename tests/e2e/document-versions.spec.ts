import { expect, test, type Page, type Route } from '@playwright/test';

// browser_fixture only: actual React, runtime and Supabase SDK with explicit
// intercepted synthetic HTTP. No genuine Auth/RLS/grants/bytes/clearance or
// hosted adoption/release behavior is certified by these tests.
const ORIGIN = 'https://txofqxictwecgcnvezlb.supabase.co';
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const accountA = { id: uuid(100), display_name: 'Synthetic East account', is_demo: true };
const accountB = { id: uuid(200), display_name: 'Synthetic West account', is_demo: true };
const facilityA = { id: uuid(1001), account_id: accountA.id, display_name: 'Synthetic East facility', is_demo: true };
const facilityA2 = { id: uuid(1002), account_id: accountA.id, display_name: 'Synthetic second East facility', is_demo: true };
const facilityB = { id: uuid(2001), account_id: accountB.id, display_name: 'Synthetic West facility', is_demo: true };
const confirmation = 'I understand this creates an immutable internal draft and closes ingest access; it does not approve or release the document.';
const document = (changes: Record<string, unknown> = {}) => ({ document_id: uuid(400), account_id: accountA.id, facility_id: facilityA.id,
  title: 'Synthetic logical document', document_class: 'internal_note', document_revision: 2, can_create_version: true, ...changes });
const version = (ordinal = 1, changes: Record<string, unknown> = {}) => ({ version_id: uuid(600 + ordinal), version_ordinal: ordinal,
  object_id: uuid(700 + ordinal), verified_sha256: 'a'.repeat(64), byte_size: 48, media_type: 'text/plain', lifecycle_state: 'internal_draft',
  created_at: '2026-10-09T12:00:00+00:00', preservation_hold_at_adoption: true, preservation_hold: false, visibility_restricted: true, ...changes });
const security = (changes: Record<string, unknown> = {}) => ({ object_id: uuid(300), state: 'security_clearance_eligible', security_revision: 3,
  verified_sha256: 'a'.repeat(64), scan_state: 'result', scan_attempt_id: uuid(310), scan_observation_id: uuid(311), clearance_decision_id: uuid(312),
  malware_outcome: 'pass', phi_signal: 'no_signal', clearance_decision: 'cleared_no_phi', visibility_restricted: false, preservation_hold: true,
  ingest_closed: false, security_clearance_eligible: true, quarantined: false, next_action: 'await_separate_document_authority', ...changes });
function gate() {
  let arrive!: () => void, release!: () => void;
  return { arrived: new Promise<void>(resolve => { arrive = resolve; }), wait: new Promise<void>(resolve => { release = resolve; }),
    arrive: () => arrive(), release: () => release() };
}
type Failure = { code: string; status: number } | null;
const fixtureErrors = new WeakMap<Page, { unexpected: string[]; browserErrors: string[] }>();
async function fixture(page: Page) {
  const user = { id: uuid(1), aud: 'authenticated', role: 'authenticated', email: 'document-fixture@example.invalid',
    email_confirmed_at: '2026-10-08T00:00:00Z', phone: '', app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {}, identities: [], created_at: '2026-10-08T00:00:00Z', is_anonymous: false };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, role: 'authenticated', is_anonymous: false, exp: Math.floor(Date.now() / 1000) + 3600 })}.synthetic-signature`;
  const state = { profileAvailable: true, documents: [document()], versions: [] as ReturnType<typeof version>[], documentRevision: 2,
    security: security(), listError: null as Failure, historyError: null as Failure, adoptionError: null as Failure, securityError: null as Failure,
    historyUnavailable: false, lostAdoption: false, invalidReceipt: false,
    listGate: null as ReturnType<typeof gate> | null, historyGate: null as ReturnType<typeof gate> | null,
    adoptionGate: null as ReturnType<typeof gate> | null, securityGate: null as ReturnType<typeof gate> | null,
    calls: [] as { name: string; args: Record<string, unknown> }[], receipts: new Map<string, { args: Record<string, unknown>; value: Record<string, unknown> }>(),
    unexpected: [] as string[], browserErrors: [] as string[] };
  fixtureErrors.set(page, state);
  page.on('pageerror', error => state.browserErrors.push(error.message));
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  const failure = (route: Route, value: Exclude<Failure, null>) => json(route, { code: value.code, message: 'PRIVATE provider details must not appear' }, value.status);
  await page.route(`${ORIGIN}/**`, async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname === '/auth/v1/token') return json(route, { access_token: token, refresh_token: 'synthetic-document-refresh', token_type: 'bearer', expires_in: 3600, user });
    if (url.pathname === '/auth/v1/user') return json(route, user);
    if (url.pathname === '/auth/v1/logout') return json(route, {});
    if (url.pathname === '/rest/v1/user_profiles') return json(route, state.profileAvailable ? [{ id: uuid(2), display_name: 'Synthetic operator', identity_status: 'active', is_demo: true }] : []);
    if (url.pathname === '/rest/v1/client_accounts') return json(route, [accountA, accountB]);
    if (url.pathname === '/rest/v1/facilities') return json(route, [facilityA, facilityA2, facilityB].filter(item => `eq.${item.account_id}` === url.searchParams.get('account_id')));
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const name = url.pathname.split('/').at(-1)!, args = request.postDataJSON() as Record<string, unknown>;
      state.calls.push({ name, args });
      expect(request.headers().authorization).toBe(`Bearer ${token}`);
      if (name === 'list_version_documents') {
        expect(Object.keys(args).sort()).toEqual(['p_account_id', 'p_after_id', 'p_limit']); expect(args.p_limit).toBe(25);
        const rows = state.documents.filter(item => item.account_id === args.p_account_id && (!args.p_after_id || item.document_id > String(args.p_after_id))).sort((a, b) => a.document_id.localeCompare(b.document_id));
        const result = { items: rows.slice(0, 25), next_cursor: rows.length > 25 ? rows[24].document_id : null };
        if (state.listGate) { state.listGate.arrive(); await state.listGate.wait; }
        if (state.listError) return failure(route, state.listError);
        return json(route, result);
      }
      if (name === 'list_document_versions') {
        expect(Object.keys(args).sort()).toEqual(['p_after_ordinal', 'p_document_id', 'p_limit']); expect(args.p_limit).toBe(25);
        const rows = state.versions.filter(item => item.version_ordinal > Number(args.p_after_ordinal));
        const result = { document_id: args.p_document_id, state: 'available', document_revision: state.documentRevision,
          items: rows.slice(0, 25), next_cursor: rows.length > 25 ? rows[24].version_ordinal : null };
        if (state.historyGate) { state.historyGate.arrive(); await state.historyGate.wait; }
        if (state.historyError) return failure(route, state.historyError);
        if (state.historyUnavailable) return json(route, { document_id: null, state: 'not_found_or_unavailable', items: [], next_cursor: null });
        return json(route, result);
      }
      if (name === 'private_object_security_status') {
        expect(args).toEqual({ p_object_id: uuid(300) });
        const result = state.security;
        if (state.securityGate) { state.securityGate.arrive(); await state.securityGate.wait; }
        if (state.securityError) return failure(route, state.securityError);
        return json(route, result);
      }
      if (name === 'report_private_object_phi') {
        expect(args).toEqual({ p_object_id: uuid(300), p_expected_revision: state.security.security_revision });
        state.security = security({ state: 'phi_suspected', security_revision: state.security.security_revision + 1,
          visibility_restricted: true, clearance_decision_id: null, clearance_decision: null, security_clearance_eligible: false,
          quarantined: true, next_action: 'await_authorized_security_handling' });
        // Explicit lost-report-response fixture: the client cannot infer success.
        return failure(route, { code: 'XX000', status: 503 });
      }
      if (name === 'adopt_private_object') {
        expect(Object.keys(args).sort()).toEqual(['p_document_id', 'p_expected_document_revision', 'p_expected_security_revision', 'p_expected_sha256', 'p_object_id', 'p_request_id']);
        expect(args.p_request_id).toMatch(/^[0-9a-f-]{36}$/);
        expect(args.p_object_id).toBe(uuid(300)); expect(args.p_expected_sha256).toBe('a'.repeat(64));
        if (state.adoptionGate) { state.adoptionGate.arrive(); await state.adoptionGate.wait; }
        if (state.adoptionError) return failure(route, state.adoptionError);
        const previous = state.receipts.get(String(args.p_request_id));
        if (previous) { expect(args).toEqual(previous.args); return json(route, previous.value); }
        expect(args.p_expected_document_revision).toBe(state.documentRevision);
        expect(args.p_expected_security_revision).toBe(state.security.security_revision);
        const row = version(state.versions.length + 1, { object_id: uuid(300), visibility_restricted: false, preservation_hold: true });
        const { preservation_hold: _hold, visibility_restricted: _restriction, ...immutable } = row;
        const result = { ...immutable, document_id: args.p_document_id, document_revision: ++state.documentRevision,
          security_revision: Number(args.p_expected_security_revision) + 1 };
        state.versions.push(row); state.receipts.set(String(args.p_request_id), { args, value: result });
        state.security = security({ state: 'ingest_closed', security_revision: result.security_revision, ingest_closed: true,
          security_clearance_eligible: false, quarantined: true, next_action: 'await_authorized_security_handling' });
        if (state.lostAdoption) return failure(route, { code: 'XX000', status: 503 });
        return json(route, state.invalidReceipt ? { ...result, verified_sha256: 'b'.repeat(64) } : result);
      }
    }
    if (url.pathname.startsWith('/functions/v1/private-objects')) {
      const suffix = url.pathname.slice('/functions/v1/private-objects'.length);
      const value = (stage: 'reserved' | 'stored_unverified' | 'finalized') => ({ objectId: uuid(300), state: stage,
        stateRevision: { reserved: 1, stored_unverified: 3, finalized: 4 }[stage], expiresAt: '2099-10-09T12:00:00Z',
        scanState: 'pending', clearanceState: 'pending', quarantined: true, failureCode: null, nextAction: stage === 'finalized' ? 'await_review' : 'retry_same_file' });
      if (suffix === '' && request.method() === 'POST') return json(route, value('reserved'), 201);
      if (suffix === `/${uuid(300)}/bytes` && request.method() === 'PUT') return json(route, value('stored_unverified'));
      if (suffix === `/${uuid(300)}/finalize` && request.method() === 'POST') return json(route, value('finalized'));
      if (suffix === `/${uuid(300)}` && request.method() === 'GET') return json(route, value('finalized'));
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
  const state = fixtureErrors.get(page);
  expect(state?.unexpected ?? []).toEqual([]); expect(state?.browserErrors ?? []).toEqual([]);
});
async function openScope(page: Page) {
  await page.goto('/documents');
  await page.getByLabel('Email', { exact: true }).fill('document-fixture@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('synthetic-document-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Account', { exact: true }).selectOption(accountA.id);
  await page.getByLabel('Facility', { exact: true }).selectOption(facilityA.id);
}
async function openHistory(page: Page, title = 'Synthetic logical document') {
  await page.getByRole('button', { name: `View version history: ${title}`, exact: true }).click();
  await expect(page.getByText(/Last confirmed document revision:/)).toBeVisible();
}
async function eligibleUpload(page: Page) {
  await page.getByLabel('Synthetic UTF-8 text file').setInputFiles({ name: 'synthetic-document.txt', mimeType: 'text/plain', buffer: Buffer.from('AuxiliumOS synthetic fixture\nDocument version fixture only.') });
  await page.getByLabel('I am uploading a synthetic fixture with no PHI or real client data.', { exact: true }).check();
  await page.getByRole('button', { name: 'Upload synthetic file', exact: true }).click();
  await expect(page.getByText('Security eligibility recorded', { exact: true })).toBeVisible();
}
async function createDraft(page: Page) {
  await page.getByLabel(confirmation, { exact: true }).check();
  await page.getByRole('button', { name: 'Create internal draft', exact: true }).click();
}
const adoptionCalls = (state: Awaited<ReturnType<typeof fixture>>) => state.calls.filter(call => call.name === 'adopt_private_object');

test('fixture document versions: facility-filtered empty pages preserve account cursor and read-only history', async ({ page }) => {
  const backend = await fixture(page);
  backend.documents = Array.from({ length: 25 }, (_, i) => document({ document_id: uuid(400 + i), facility_id: facilityA2.id, title: `OTHER FACILITY ${i}` }));
  backend.documents.push(document({ document_id: uuid(500), can_create_version: false }));
  backend.versions = [version()]; backend.documentRevision = 3;
  await openScope(page);
  await expect(page.getByRole('heading', { name: 'No documents for this facility on this page' })).toBeVisible();
  await expect(page.getByText(/OTHER FACILITY/)).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Document list pages' }).getByRole('button', { name: 'Next page' }).click();
  await openHistory(page);
  await expect(page.getByText('Read-only history.', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Version 1 · Internal draft', exact: true })).toBeVisible();
  await expect(page.getByRole('paragraph').filter({ hasText: /^Restricted; no content access is provided$/ })).toBeVisible();
  const versionDetails = page.locator('details').filter({ has: page.getByText('Exact-version details · Version 1', { exact: true }) });
  await expect(versionDetails.getByText('No hold recorded; destruction is not authorized', { exact: true })).not.toBeVisible();
  await versionDetails.locator('summary').focus();
  await versionDetails.locator('summary').press('Enter');
  await expect(versionDetails).toHaveAttribute('open', '');
  await expect(versionDetails.getByText(version().version_id, { exact: true })).toBeVisible();
  await expect(versionDetails.getByText(version().verified_sha256, { exact: true })).toBeVisible();
  await expect(versionDetails.getByText('Restricted; no content access is provided', { exact: true })).toBeVisible();
  await expect(versionDetails.getByText('No hold recorded; destruction is not authorized', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Create internal draft|Download|Approve|Release/ })).toHaveCount(0);
  expect(backend.calls.filter(call => call.name === 'list_version_documents').at(-1)?.args.p_after_id).toBe(uuid(424));
  expect(adoptionCalls(backend)).toHaveLength(0);
});

test('fixture document versions: loading, missing RPC and redacted detail never fabricate empty success or stale rows', async ({ page }) => {
  const backend = await fixture(page); backend.listGate = gate();
  await openScope(page); await backend.listGate.arrived;
  await expect(page.getByText('Loading permitted documents…', { exact: true })).toBeVisible();
  backend.listError = { code: 'PGRST202', status: 404 }; backend.listGate.release();
  await expect(page.getByRole('alert')).toContainText('may not be enabled');
  await expect(page.getByRole('heading', { name: 'No documents for this facility on this page' })).toHaveCount(0);
  backend.listGate = null; backend.listError = null;
  await page.getByRole('button', { name: 'Refresh documents', exact: true }).click();
  await openHistory(page);
  await expect(page.getByText('No internal draft versions on this page.', { exact: true })).toBeVisible();
  backend.documents = []; backend.historyUnavailable = true;
  await page.getByRole('button', { name: 'Refresh version history', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Document access is unavailable');
  await expect(page.getByRole('heading', { name: /Version history:/ })).toHaveCount(0);
  await expect(page.getByText(/PRIVATE provider/)).toHaveCount(0);
});

test('fixture document versions: version paging binds numeric cursor and never merges pages', async ({ page }) => {
  const backend = await fixture(page); backend.versions = Array.from({ length: 26 }, (_, i) => version(i + 1)); backend.documentRevision = 28;
  await openScope(page); await openHistory(page);
  const navigation = page.getByRole('navigation', { name: 'Version history pages' });
  await expect(page.getByRole('heading', { name: 'Version 25 · Internal draft', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Version 26 · Internal draft', exact: true })).toHaveCount(0);
  await navigation.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByRole('heading', { name: 'Version 26 · Internal draft', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Version 1 · Internal draft', exact: true })).toHaveCount(0);
  expect(backend.calls.filter(call => call.name === 'list_document_versions').at(-1)?.args.p_after_ordinal).toBe(25);
  await navigation.getByRole('button', { name: 'Previous page' }).click();
  await expect(page.getByRole('heading', { name: 'Version 1 · Internal draft', exact: true })).toBeVisible();
});

test('fixture document versions: explicit adoption creates one immutable draft then rechecks history and security', async ({ page }) => {
  const backend = await fixture(page); backend.adoptionGate = gate();
  await openScope(page); await openHistory(page);
  await expect(page.getByRole('button', { name: 'Create internal draft' })).toHaveCount(0);
  await eligibleUpload(page);
  const create = page.getByRole('button', { name: 'Create internal draft', exact: true });
  await expect(create).toBeDisabled();
  await page.getByLabel(confirmation, { exact: true }).check();
  await create.evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await backend.adoptionGate.arrived;
  await expect(page.getByText('Creating internal draft; awaiting the server receipt…', { exact: true })).toBeVisible();
  expect(adoptionCalls(backend)).toHaveLength(1);
  await expect(page.getByText(/Internal draft saved:/)).toHaveCount(0);
  backend.adoptionGate.release();
  await expect(page.getByRole('heading', { name: 'Version 1 · Internal draft', exact: true })).toBeVisible();
  await expect(page.getByText('Ingest closed', { exact: true })).toBeVisible();
  await expect(create).toHaveCount(0);
  expect(backend.receipts.size).toBe(1);
  expect(adoptionCalls(backend)[0].args).toMatchObject({ p_document_id: uuid(400), p_expected_document_revision: 2, p_expected_security_revision: 3 });
  expect(backend.calls.filter(call => call.name === 'private_object_security_status')).toHaveLength(2);
  expect(await page.evaluate(() => Object.values(localStorage).some(value => value.includes('verified_sha256') || value.includes('p_request_id')))).toBe(false);
});

test('fixture document versions: lost receipt retry preserves exact request despite newer history revision', async ({ page }) => {
  const backend = await fixture(page); backend.lostAdoption = true;
  await openScope(page); await eligibleUpload(page); await openHistory(page); await createDraft(page);
  await expect(page.getByText(/The earlier save may already have committed/)).toBeVisible();
  await page.getByRole('button', { name: 'Refresh version history', exact: true }).click();
  await expect(page.getByText('Last confirmed document revision: 3.', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Version 1 · Internal draft', exact: true })).toBeVisible();
  await expect(page.getByText(/The earlier save may already have committed/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review a new adoption request' })).toHaveCount(0);
  backend.lostAdoption = false;
  await page.getByRole('button', { name: 'Retry exact adoption request', exact: true }).click();
  await expect(page.getByText('Ingest closed', { exact: true })).toBeVisible();
  expect(adoptionCalls(backend)).toHaveLength(2);
  expect(adoptionCalls(backend)[1].args).toEqual(adoptionCalls(backend)[0].args);
  expect(backend.versions).toHaveLength(1);
});

test('fixture document versions: stale CAS requires fresh history and explicit new confirmation', async ({ page }) => {
  const backend = await fixture(page); backend.adoptionError = { code: '40001', status: 409 };
  await openScope(page); await eligibleUpload(page); await openHistory(page); await createDraft(page);
  await expect(page.getByRole('alert')).toContainText('revision changed');
  const review = page.getByRole('button', { name: 'Review a new adoption request', exact: true });
  await expect(review).toBeDisabled();
  backend.documentRevision = 5; backend.adoptionError = null;
  await page.getByRole('button', { name: 'Refresh before a new request', exact: true }).click();
  await expect(review).toBeEnabled(); await review.click();
  await expect(page.getByRole('button', { name: 'Create internal draft', exact: true })).toBeDisabled();
  await createDraft(page); await expect(page.getByText('Ingest closed', { exact: true })).toBeVisible();
  const calls = adoptionCalls(backend);
  expect(calls).toHaveLength(2); expect(calls[1].args.p_request_id).not.toBe(calls[0].args.p_request_id);
  expect(calls[1].args.p_expected_document_revision).toBe(5);
});

test('fixture document versions: malformed receipt stays uncertain even when a later replay conflicts', async ({ page }) => {
  const backend = await fixture(page); backend.invalidReceipt = true;
  await openScope(page); await eligibleUpload(page); await openHistory(page); await createDraft(page);
  await expect(page.getByText(/The earlier save may already have committed/)).toBeVisible();
  await expect(page.getByText(/Internal draft saved:/)).toHaveCount(0);
  backend.adoptionError = { code: '40001', status: 409 };
  await page.getByRole('button', { name: 'Retry exact adoption request', exact: true }).click();
  await expect(page.getByText(/The earlier save may already have committed/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review a new adoption request' })).toHaveCount(0);
  expect(adoptionCalls(backend)[1].args).toEqual(adoptionCalls(backend)[0].args);
});

test('fixture document versions: unavailable source and missing security RPC remove adoption authority', async ({ page }) => {
  const backend = await fixture(page); backend.adoptionError = { code: '55000', status: 400 };
  await openScope(page); await eligibleUpload(page); await openHistory(page); await createDraft(page);
  await expect(page.getByRole('alert')).toContainText('not currently eligible');
  await expect(page.getByRole('button', { name: /Retry exact adoption|Review a new adoption|Create internal draft/ })).toHaveCount(0);
  backend.securityError = { code: 'PGRST202', status: 404 };
  await page.getByRole('button', { name: 'Refresh security status', exact: true }).click();
  await expect(page.getByText('Security status unavailable', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Adopt current source as an internal draft' })).toHaveCount(0);
  await expect(page.getByText(/Exact request reference:/)).toHaveCount(0);
  await expect(page.getByText(/PRIVATE provider/)).toHaveCount(0);
});

test('fixture document versions: transport finalization cannot substitute for current eligibility and a new check invalidates retry context', async ({ page }) => {
  const backend = await fixture(page);
  backend.security = security({ state: 'scan_pending', security_revision: 0, scan_state: 'pending', scan_attempt_id: null,
    scan_observation_id: null, clearance_decision_id: null, malware_outcome: null, phi_signal: null, clearance_decision: null,
    security_clearance_eligible: false, quarantined: true, next_action: 'await_authorized_security_handling' });
  await openScope(page); await openHistory(page);
  await page.getByLabel('Synthetic UTF-8 text file').setInputFiles({ name: 'synthetic.txt', mimeType: 'text/plain', buffer: Buffer.from('AuxiliumOS synthetic fixture\nNot yet eligible.') });
  await page.getByLabel('I am uploading a synthetic fixture with no PHI or real client data.', { exact: true }).check();
  await page.getByRole('button', { name: 'Upload synthetic file', exact: true }).click();
  await expect(page.getByText('Security scan pending', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create internal draft', exact: true })).toHaveCount(0);
  backend.security = security();
  await page.getByRole('button', { name: 'Refresh security status', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create internal draft', exact: true })).toBeVisible();
  backend.adoptionError = { code: 'XX000', status: 503 };
  await createDraft(page); await expect(page.getByText(/The earlier save may already have committed/)).toBeVisible();
  backend.securityGate = gate();
  backend.security = security({ state: 'restricted', security_revision: 4, visibility_restricted: true,
    security_clearance_eligible: false, quarantined: true, next_action: 'await_authorized_security_handling' });
  await page.getByRole('button', { name: 'Refresh security status', exact: true }).click();
  await backend.securityGate.arrived;
  await expect(page.getByRole('heading', { name: 'Adopt current source as an internal draft' })).toHaveCount(0);
  await expect(page.getByText(/Exact request reference:/)).toHaveCount(0);
  backend.securityGate.release();
  await expect(page.getByText('Visibility restricted', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create internal draft', exact: true })).toHaveCount(0);
  expect(adoptionCalls(backend)).toHaveLength(1);
});

test('fixture document versions: adoption denial clears exact target metadata and invalid Auth clears workspace', async ({ page }) => {
  const backend = await fixture(page);
  await openScope(page); await eligibleUpload(page); await openHistory(page);
  backend.adoptionError = { code: '42501', status: 403 }; backend.documents = [];
  await createDraft(page);
  await expect(page.getByRole('alert')).toContainText('Document access is unavailable');
  await expect(page.getByRole('heading', { name: /Version history:/ })).toHaveCount(0);
  await expect(page.getByText(/Exact request reference:/)).toHaveCount(0);
  backend.listError = { code: '28000', status: 400 };
  await page.getByRole('button', { name: 'Refresh documents', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Document versions', exact: true })).toHaveCount(0);
  await expect(page.getByText(/PRIVATE provider/)).toHaveCount(0);
});

test('fixture document versions: transport recheck keeps ambiguous concern outcome and invalidates source', async ({ page }) => {
  await fixture(page); await openScope(page); await eligibleUpload(page); await openHistory(page);
  await page.getByLabel('I understand this reports a suspicion and restricts access without deleting the file.', { exact: true }).check();
  await page.getByRole('button', { name: 'Report suspected restricted data', exact: true }).click();
  await expect(page.getByText(/The earlier report outcome is not confirmed/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create internal draft', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await expect(page.getByText('Suspected PHI or restricted data', { exact: true })).toBeVisible();
  await expect(page.getByText(/The earlier report outcome is not confirmed/)).toBeVisible();
  await expect(page.getByText(/Concern report acknowledged/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Create internal draft', exact: true })).toHaveCount(0);
});

test('fixture document versions: source change aborts a pending adoption and ignores its late receipt', async ({ page }) => {
  const backend = await fixture(page); backend.adoptionGate = gate();
  await openScope(page); await eligibleUpload(page); await openHistory(page); await createDraft(page);
  await backend.adoptionGate.arrived;
  await page.getByRole('button', { name: 'Choose a new file', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Adopt current source as an internal draft' })).toHaveCount(0);
  backend.adoptionGate.release();
  await expect.poll(() => backend.receipts.size).toBe(1);
  await expect(page.getByText(/Internal draft saved:|Exact request reference:/)).toHaveCount(0);
  await expect(page.getByText('No internal draft versions on this page.', { exact: true })).toBeVisible();
  expect(backend.calls.filter(call => call.name === 'private_object_security_status')).toHaveLength(1);
  // An explicit later read may truthfully reveal a transaction that finished
  // after cancellation; cancellation never claims to roll back server work.
  await page.getByRole('button', { name: 'Refresh version history', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Version 1 · Internal draft', exact: true })).toBeVisible();
});

test('fixture document versions: facility switch and current-profile revocation suppress late history', async ({ page }) => {
  const backend = await fixture(page); backend.historyGate = gate(); backend.versions = [version()];
  backend.documents.push(document({ document_id: uuid(500), facility_id: facilityA2.id, title: 'Other permitted scope' }));
  await openScope(page);
  await page.getByRole('button', { name: 'View version history: Synthetic logical document', exact: true }).click();
  await backend.historyGate.arrived;
  await page.getByLabel('Facility', { exact: true }).selectOption(facilityA2.id);
  backend.historyGate.release();
  await expect(page.getByRole('button', { name: 'View version history: Other permitted scope', exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic logical document', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Version 1 · Internal draft', exact: true })).toHaveCount(0);
  backend.historyGate = gate();
  await page.getByRole('button', { name: 'View version history: Other permitted scope', exact: true }).click();
  await backend.historyGate.arrived;
  backend.profileAvailable = false;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Access unavailable', exact: true })).toBeVisible();
  backend.historyGate.release();
  await expect(page.getByRole('heading', { name: /Version history:/ })).toHaveCount(0);
});

test('fixture document versions: mobile keyboard confirmation has bounded checkbox and no horizontal overflow', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page); await openScope(page); await eligibleUpload(page); await openHistory(page);
  const checkbox = page.getByLabel(confirmation, { exact: true });
  await checkbox.focus(); await page.keyboard.press('Space'); await expect(checkbox).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Create internal draft', exact: true })).toBeFocused();
  const geometry = await checkbox.evaluate(input => ({ input: input.getBoundingClientRect().toJSON(), label: input.closest('label')!.getBoundingClientRect().toJSON() }));
  expect(geometry.input.width).toBe(18); expect(geometry.input.height).toBe(18); expect(geometry.label.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('document-versions-mobile.png'), fullPage: true });
});
