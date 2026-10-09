import { expect, test, type Page, type Route } from '@playwright/test';

// browser_fixture: actual UI and SDK, intercepted synthetic HTTP only. This
// does not prove hosted Auth, RLS, assignments, human qualifications or release.
const ORIGIN = 'https://txofqxictwecgcnvezlb.supabase.co';
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const accountA = { id: uuid(100), display_name: 'Synthetic review account', is_demo: true };
const accountB = { id: uuid(200), display_name: 'Synthetic other account', is_demo: true };
const facilityA = { id: uuid(1001), account_id: accountA.id, display_name: 'Synthetic review facility', is_demo: true };
const facilityA2 = { id: uuid(1002), account_id: accountA.id, display_name: 'Synthetic other facility', is_demo: true };
const docId = uuid(400), versionId = uuid(601), digest = 'a'.repeat(64);
const requestAcknowledgment = 'I am requesting an internal human review of this exact immutable version.';
const decisionAttestation = 'I have reviewed this exact synthetic version and am recording my own internal review decision.';
type Decision = 'approved_internal' | 'changes_requested' | 'rejected';
type Failure = { code: string; status: number } | null;
type Receipt = Record<string, unknown>;
function gate() {
  let arrive!: () => void, release!: () => void, finish!: () => void;
  return { arrived: new Promise<void>(resolve => { arrive = resolve; }), wait: new Promise<void>(resolve => { release = resolve; }),
    finished: new Promise<void>(resolve => { finish = resolve; }), arrive: () => arrive(), release: () => release(), finish: () => finish() };
}
const fixtureErrors = new WeakMap<Page, { unexpected: string[]; browserErrors: string[] }>();
async function fixture(page: Page) {
  const user = { id: uuid(1), aud: 'authenticated', role: 'authenticated', email: 'review-fixture@example.invalid',
    email_confirmed_at: '2026-10-09T00:00:00Z', phone: '', app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { is_admin: true }, identities: [], created_at: '2026-10-09T00:00:00Z', is_anonymous: false };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, role: 'authenticated', is_anonymous: false, exp: Math.floor(Date.now() / 1000) + 3600 })}.synthetic-review-signature`;
  const state = {
    profileAvailable: true, canRequest: true, assigned: false, documentRevision: 2, reviewRevision: 0,
    request: null as { review_request_id: string; requested_at: string } | null,
    decision: null as { decision_id: string; decision: Decision; decided_at: string } | null,
    statusFailure: null as Failure, mutationFailure: null as Failure, lostResponse: false, invalidReceipt: false,
    malformedStatus: false, includeRestricted: false, statusGate: null as ReturnType<typeof gate> | null,
    mutationGate: null as ReturnType<typeof gate> | null, calls: [] as { name: string; args: Record<string, unknown> }[],
    receipts: new Map<string, { args: Record<string, unknown>; value: Receipt }>(), unexpected: [] as string[], browserErrors: [] as string[],
  };
  fixtureErrors.set(page, state); page.on('pageerror', error => state.browserErrors.push(error.message));
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  const failure = (route: Route, error: NonNullable<Failure>) => json(route, { code: error.code, message: 'PRIVATE SQL provider details' }, error.status);
  const exact = () => ({ version_id: versionId, document_id: docId, verified_sha256: digest,
    document_revision: state.documentRevision, review_revision: state.reviewRevision });
  const row = (id = versionId, ordinal = 1, restricted = false) => ({ version_id: id, version_ordinal: ordinal, object_id: uuid(700 + ordinal),
    verified_sha256: digest, byte_size: 48, media_type: 'text/plain', lifecycle_state: 'internal_draft', created_at: '2026-10-09T12:00:00Z',
    preservation_hold_at_adoption: true, preservation_hold: false, visibility_restricted: restricted });
  await page.route(`${ORIGIN}/**`, async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname === '/auth/v1/token') return json(route, { access_token: token, refresh_token: 'synthetic-review-refresh', token_type: 'bearer', expires_in: 3600, user });
    if (url.pathname === '/auth/v1/user') return json(route, user);
    if (url.pathname === '/auth/v1/logout') return json(route, {});
    if (url.pathname === '/rest/v1/user_profiles') return json(route, state.profileAvailable ? [{ id: uuid(2), display_name: 'Synthetic review operator', identity_status: 'active', is_demo: true }] : []);
    if (url.pathname === '/rest/v1/client_accounts') return json(route, [accountA, accountB]);
    if (url.pathname === '/rest/v1/facilities') return json(route, [facilityA, facilityA2].filter(row => `eq.${row.account_id}` === url.searchParams.get('account_id')));
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const name = url.pathname.split('/').at(-1)!, args = request.postDataJSON();
      state.calls.push({ name, args }); expect(request.method()).toBe('POST');
      if (name === 'list_version_documents') return json(route, { items: args.p_account_id === accountA.id ? [{ document_id: docId,
        account_id: accountA.id, facility_id: facilityA.id, title: 'Synthetic review document', document_class: 'internal_note',
        document_revision: state.documentRevision, can_create_version: false }] : [], next_cursor: null });
      if (name === 'list_document_versions') return json(route, { document_id: docId, document_revision: state.documentRevision,
        state: 'available', items: [row(), ...(state.includeRestricted ? [row(uuid(602), 2, true)] : [])], next_cursor: null });
      if (name === 'document_version_review_status') {
        expect(args).toEqual({ p_version_id: versionId, p_expected_sha256: digest });
        const value = { ...exact(), historical_review_state: state.decision?.decision ?? (state.request ? 'under_review' : 'internal_draft'),
          request: state.request, decision: state.decision, can_request: state.canRequest && !state.request,
          can_decide: state.assigned && !!state.request && !state.decision, release_authorized: state.malformedStatus };
        const wait = state.statusGate;
        if (wait) { wait.arrive(); await wait.wait; }
        try { return state.statusFailure ? await failure(route, state.statusFailure) : await json(route, value); }
        finally { wait?.finish(); }
      }
      if (name === 'request_document_version_review' || name === 'decide_document_version_review') {
        const deciding = name === 'decide_document_version_review';
        expect(Object.keys(args).sort()).toEqual((deciding
          ? ['p_review_request_id', 'p_expected_sha256', 'p_expected_document_revision', 'p_expected_review_revision', 'p_request_id', 'p_decision', 'p_attestation_code']
          : ['p_version_id', 'p_expected_sha256', 'p_expected_document_revision', 'p_expected_review_revision', 'p_request_id']).sort());
        expect(args.p_expected_sha256).toBe(digest); expect(args.p_request_id).toMatch(/^[0-9a-f-]{36}$/);
        if (state.mutationFailure) return failure(route, state.mutationFailure);
        let previous = state.receipts.get(args.p_request_id);
        if (previous) expect(args).toEqual(previous.args);
        else {
          expect(args.p_expected_document_revision).toBe(state.documentRevision);
          expect(args.p_expected_review_revision).toBe(state.reviewRevision);
          let value: Receipt;
          ++state.reviewRevision;
          if (deciding) {
            expect(state.assigned).toBe(true); expect(args.p_review_request_id).toBe(state.request?.review_request_id);
            expect(args.p_attestation_code).toBe('reviewed_exact_synthetic_version');
            state.decision = { decision_id: uuid(900), decision: args.p_decision, decided_at: '2026-10-09T14:00:00Z' };
            value = { ...exact(), ...state.decision, review_request_id: state.request!.review_request_id,
              assignment_id: uuid(800), attestation_code: args.p_attestation_code };
          } else {
            expect(args.p_version_id).toBe(versionId);
            state.request = { review_request_id: uuid(700), requested_at: '2026-10-09T13:00:00Z' };
            value = { ...exact(), ...state.request, state: 'under_review' };
          }
          previous = { args, value }; state.receipts.set(args.p_request_id, previous);
        }
        const wait = state.mutationGate;
        if (wait) { wait.arrive(); await wait.wait; }
        try {
          if (state.lostResponse) return await failure(route, { code: 'XX000', status: 503 });
          return await json(route, state.invalidReceipt ? { ...previous.value, verified_sha256: 'b'.repeat(64) } : previous.value);
        } finally { wait?.finish(); }
      }
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
type Backend = Awaited<ReturnType<typeof fixture>>;
const mutations = (state: Backend) => state.calls.filter(call => ['request_document_version_review', 'decide_document_version_review'].includes(call.name));
const panel = (page: Page) => page.getByRole('region', { name: 'Internal review', exact: true }).first();
const statusButton = (page: Page) => panel(page).getByRole('button', { name: /^(Check|Refresh) internal review status$/ });
async function openHistory(page: Page) {
  await page.goto('/documents');
  await page.getByLabel('Email', { exact: true }).fill('review-fixture@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('synthetic-review-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Account', { exact: true }).selectOption(accountA.id);
  await page.getByLabel('Facility', { exact: true }).selectOption(facilityA.id);
  await page.getByRole('button', { name: 'View version history: Synthetic review document', exact: true }).click();
  await expect(panel(page).getByRole('heading', { name: 'Internal review', exact: true })).toBeVisible();
}
async function checkStatus(page: Page) { await statusButton(page).click(); await expect(panel(page).getByText(/^Recorded review state:/)).toBeVisible(); }
async function requestReview(page: Page) {
  await panel(page).getByLabel(requestAcknowledgment, { exact: true }).check();
  await panel(page).getByRole('button', { name: 'Request internal review', exact: true }).click();
}
function assignPendingReview(state: Backend) {
  state.assigned = true; state.reviewRevision = 2;
  state.request = { review_request_id: uuid(700), requested_at: '2026-10-09T13:00:00Z' };
}
async function decideReview(page: Page, decision: Decision = 'approved_internal') {
  await panel(page).getByLabel('Internal review decision', { exact: true }).selectOption(decision);
  await panel(page).getByLabel(decisionAttestation, { exact: true }).check();
  await panel(page).getByRole('button', { name: 'Record internal decision', exact: true }).click();
}
test.afterEach(async ({ page }) => {
  expect(fixtureErrors.get(page)?.unexpected ?? []).toEqual([]); expect(fixtureErrors.get(page)?.browserErrors ?? []).toEqual([]);
});

test('fixture review: explicit status, deliberate exact request and no reviewer authority from administrator metadata', async ({ page }) => {
  const backend = await fixture(page); await openHistory(page);
  expect(backend.calls.filter(call => call.name === 'document_version_review_status')).toHaveLength(0);
  await checkStatus(page);
  await expect(panel(page).getByRole('button', { name: 'Request internal review', exact: true })).toBeDisabled();
  await expect(panel(page).getByLabel('Internal review decision', { exact: true })).toHaveCount(0);
  await requestReview(page);
  await expect(panel(page).getByText('Internal review request recorded', { exact: true })).toBeVisible();
  await expect(panel(page).getByText('Recorded review state: Under internal review', { exact: true })).toBeVisible();
  await expect(panel(page).getByText(/No current decision permission/)).toBeVisible();
  expect(mutations(backend)).toHaveLength(1);
  await expect(panel(page).getByText('Release unavailable', { exact: true })).toBeVisible();
  backend.statusFailure = { code: '42501', status: 403 }; await statusButton(page).click();
  await expect(panel(page).getByRole('alert')).toContainText('unavailable to your current access');
  await expect(panel(page).getByText('Internal review request recorded', { exact: true })).toHaveCount(0);
});

for (const [decision, label] of [['approved_internal', 'Approved internally'], ['changes_requested', 'Changes requested'], ['rejected', 'Rejected']] as const) {
  test(`fixture review: explicitly assigned human records ${decision} for the exact version`, async ({ page }) => {
    const backend = await fixture(page); assignPendingReview(backend); await openHistory(page); await checkStatus(page);
    const action = panel(page).getByRole('button', { name: 'Record internal decision', exact: true });
    await expect(action).toBeDisabled(); await expect(panel(page).getByLabel(decisionAttestation, { exact: true })).toBeDisabled();
    await panel(page).getByLabel('Internal review decision', { exact: true }).selectOption(decision);
    await expect(action).toBeDisabled(); await panel(page).getByLabel(decisionAttestation, { exact: true }).check(); await action.click();
    await expect(panel(page).getByText(`Internal decision recorded: ${label}`, { exact: true })).toBeVisible();
    await expect(panel(page).getByText(`Recorded review state: ${label}`, { exact: true })).toBeVisible();
    await expect(action).toHaveCount(0); expect(mutations(backend)).toHaveLength(1);
    if (decision !== 'approved_internal') await expect(panel(page).getByText(/replacement immutable version is needed/)).toBeVisible();
    backend.assigned = false; await checkStatus(page);
    await expect(panel(page).getByText(`Recorded review state: ${label}`, { exact: true })).toBeVisible();
    await expect(panel(page).getByText('Release unavailable', { exact: true })).toBeVisible();
  });
}

test('fixture review: lost request response remains uncertain after fresh status and retries the original frozen revisions', async ({ page }) => {
  const backend = await fixture(page); backend.lostResponse = true; await openHistory(page); await checkStatus(page); await requestReview(page);
  await expect(panel(page).getByText(/An earlier submission may already have committed/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh documents', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Refresh version history', exact: true })).toBeDisabled();
  backend.documentRevision = 9; backend.reviewRevision = 10; backend.assigned = true; await checkStatus(page);
  await expect(panel(page).getByText('Recorded review state: Under internal review', { exact: true })).toBeVisible();
  await expect(panel(page).getByText('Internal review request recorded', { exact: true })).toHaveCount(0);
  await expect(panel(page).getByLabel('Internal review decision', { exact: true })).toHaveCount(0);
  await expect(panel(page).getByRole('button', { name: 'Review a new operation', exact: true })).toHaveCount(0);
  backend.lostResponse = false; await panel(page).getByRole('button', { name: 'Retry exact review operation', exact: true }).click();
  await expect(panel(page).getByText('Internal review request recorded', { exact: true })).toBeVisible();
  expect(mutations(backend)).toHaveLength(2); expect(mutations(backend)[1]).toEqual(mutations(backend)[0]);
  await expect(page.getByRole('button', { name: 'Refresh version history', exact: true })).toBeEnabled();
});

test('fixture review: invalid decision receipt then authority denial never erases the uncertain original choice or attestation', async ({ page }) => {
  const backend = await fixture(page); assignPendingReview(backend); backend.invalidReceipt = true;
  await openHistory(page); await checkStatus(page); await decideReview(page, 'changes_requested');
  await expect(panel(page).getByText(/An earlier submission may already have committed/)).toBeVisible();
  await expect(panel(page).getByText('Frozen decision: Changes requested', { exact: true })).toBeVisible();
  backend.invalidReceipt = false; backend.mutationFailure = { code: '42501', status: 403 };
  await panel(page).getByRole('button', { name: 'Retry exact review operation', exact: true }).click();
  await expect(panel(page).getByText(/Internal review is unavailable to your current access/)).toBeVisible();
  await expect(panel(page).getByText(/An earlier submission may already have committed/)).toBeVisible();
  backend.assigned = false; await checkStatus(page);
  await expect(panel(page).getByText('Recorded review state: Changes requested', { exact: true })).toBeVisible();
  await expect(panel(page).getByText('Internal decision recorded: Changes requested', { exact: true })).toHaveCount(0);
  await expect(panel(page).getByRole('button', { name: 'Review a new operation', exact: true })).toHaveCount(0);
  expect(mutations(backend)).toHaveLength(2); expect(mutations(backend)[1]).toEqual(mutations(backend)[0]);
});

test('fixture review: definitive stale failure needs a fresh status and new human confirmation before a new intent', async ({ page }) => {
  const backend = await fixture(page); backend.mutationFailure = { code: '40001', status: 409 };
  await openHistory(page); await checkStatus(page); await requestReview(page);
  await expect(panel(page).getByText(/document, review revision or exact digest changed/)).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'Review a new operation', exact: true })).toHaveCount(0);
  await expect(panel(page).getByRole('button', { name: 'Retry exact review operation', exact: true })).toHaveCount(0);
  backend.documentRevision = 3; backend.reviewRevision = 2; backend.mutationFailure = null; await checkStatus(page);
  await panel(page).getByRole('button', { name: 'Review a new operation', exact: true }).click();
  await expect(panel(page).getByRole('button', { name: 'Request internal review', exact: true })).toBeDisabled(); await requestReview(page);
  await expect(panel(page).getByText('Internal review request recorded', { exact: true })).toBeVisible();
  const sent = mutations(backend); expect(sent).toHaveLength(2); expect(sent[1].args.p_request_id).not.toBe(sent[0].args.p_request_id);
  expect(sent[1].args.p_expected_document_revision).toBe(3); expect(sent[1].args.p_expected_review_revision).toBe(2);
});

test('fixture review: duplicate submit clicks dispatch one mutation and disable history navigation', async ({ page }) => {
  const backend = await fixture(page); backend.mutationGate = gate(); await openHistory(page); await checkStatus(page);
  await panel(page).getByLabel(requestAcknowledgment, { exact: true }).check();
  await panel(page).getByRole('button', { name: 'Request internal review', exact: true }).evaluate(button => {
    (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click();
  });
  await backend.mutationGate.arrived; expect(mutations(backend)).toHaveLength(1);
  await expect(statusButton(page)).toBeDisabled();
  await expect(page.getByRole('button', { name: 'View version history: Synthetic review document', exact: true })).toBeDisabled();
  backend.mutationGate.release(); await backend.mutationGate.finished;
  await expect(panel(page).getByText('Internal review request recorded', { exact: true })).toBeVisible();
});

test('fixture review: malformed status fails closed and restricted versions have no review request', async ({ page }) => {
  const backend = await fixture(page); backend.malformedStatus = true; backend.includeRestricted = true; await openHistory(page);
  await expect(page.getByText('Internal review unavailable while this version is restricted.', { exact: true })).toBeVisible();
  await statusButton(page).click(); await expect(panel(page).getByRole('alert')).toContainText('could not be verified');
  await expect(panel(page).getByLabel(requestAcknowledgment, { exact: true })).toHaveCount(0);
  await expect(panel(page).getByLabel('Internal review decision', { exact: true })).toHaveCount(0);
  expect(mutations(backend)).toHaveLength(0); backend.malformedStatus = false; await checkStatus(page);
  await expect(panel(page).getByText('Recorded review state: Not requested', { exact: true })).toBeVisible();
});

test('fixture review: current status denial clears old capabilities and suppresses raw service details', async ({ page }) => {
  const backend = await fixture(page); assignPendingReview(backend); await openHistory(page); await checkStatus(page);
  await panel(page).getByLabel('Internal review decision', { exact: true }).selectOption('approved_internal');
  await panel(page).getByLabel(decisionAttestation, { exact: true }).check();
  backend.statusFailure = { code: '42501', status: 403 }; await statusButton(page).click();
  await expect(panel(page).getByRole('alert')).toContainText('unavailable to your current access');
  await expect(panel(page).getByLabel('Internal review decision', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/PRIVATE/)).toHaveCount(0); expect(mutations(backend)).toHaveLength(0);
});

for (const transition of ['facility', 'account', 'logout', 'profile'] as const) {
  test(`fixture review: ${transition} change suppresses a late committed review receipt`, async ({ page }) => {
    const backend = await fixture(page); backend.mutationGate = gate(); await openHistory(page); await checkStatus(page); await requestReview(page);
    await backend.mutationGate.arrived;
    if (transition === 'facility') await page.getByLabel('Facility', { exact: true }).selectOption(facilityA2.id);
    if (transition === 'account') await page.getByLabel('Account', { exact: true }).selectOption(accountB.id);
    if (transition === 'logout') await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    if (transition === 'profile') { backend.profileAvailable = false; await page.getByRole('button', { name: 'Refresh', exact: true }).click(); }
    backend.mutationGate.release(); await backend.mutationGate.finished;
    await expect(page.getByText('Internal review request recorded', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Frozen review request', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Internal review', exact: true })).toHaveCount(0);
    expect(mutations(backend)).toHaveLength(1);
  });
}

test('fixture review: session expiry during mutation clears the workspace', async ({ page }) => {
  const backend = await fixture(page); backend.mutationFailure = { code: '28000', status: 401 };
  await openHistory(page); await checkStatus(page); await requestReview(page);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Internal review', exact: true })).toHaveCount(0);
  await expect(page.getByText(/PRIVATE/)).toHaveCount(0);
});

test('fixture review: late status from a prior facility cannot restore its review controls', async ({ page }) => {
  const backend = await fixture(page); assignPendingReview(backend); backend.statusGate = gate(); await openHistory(page);
  await statusButton(page).click(); await backend.statusGate.arrived;
  await page.getByLabel('Facility', { exact: true }).selectOption(facilityA2.id);
  backend.statusGate.release(); await backend.statusGate.finished;
  await expect(page.getByLabel('Internal review decision', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/^Recorded review state:/)).toHaveCount(0);
});

test('fixture review: phone keyboard flow keeps exact references readable and avoids review intent persistence', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const backend = await fixture(page); assignPendingReview(backend); await openHistory(page);
  await statusButton(page).focus(); await page.keyboard.press('Enter');
  await expect(panel(page).getByLabel('Internal review decision', { exact: true })).toBeVisible();
  await panel(page).getByLabel('Internal review decision', { exact: true }).selectOption('rejected');
  await panel(page).getByLabel(decisionAttestation, { exact: true }).focus(); await page.keyboard.press('Space');
  const action = panel(page).getByRole('button', { name: 'Record internal decision', exact: true });
  await expect(action).toBeEnabled(); await action.focus(); await expect(action).toBeFocused();
  expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('document-review-mobile.png'), fullPage: true });
  await page.keyboard.press('Enter'); await expect(panel(page).getByText('Internal decision recorded: Rejected', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => [...Object.values(localStorage), ...Object.values(sessionStorage)].some(value =>
    /reviewed_exact_synthetic_version|review_request_id|reviewRevision|Frozen decision/.test(value)))).toBe(false);
});
