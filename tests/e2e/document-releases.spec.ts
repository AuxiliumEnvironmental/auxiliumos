import { expect, test, type Page, type Route } from '@playwright/test';

// browser_fixture: actual UI and SDK, intercepted synthetic HTTP only. This
// does not prove hosted Auth, RLS, assignments, human qualifications or release.
// Release controls mount only for the contract's exact synthetic class.
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
    documentClass: 'routine_synthetic_document', releaseRevision: 4, currentReleaseId: uuid(1200) as string | null,
    releaseRecord: null as Record<string, any> | null, withdrawalRecord: null as Record<string, any> | null,
    controllerEligible: true, canRelease: true, releaseApproved: true, audienceRevisionOffset: 0, releaseMalformed: false,
    releaseLost: false, releaseInvalid: false, releaseStatusFailure: null as Failure, releaseMutationFailure: null as Failure,
    withdrawalStatusFailure: null as Failure, withdrawalMalformed: false, withdrawalStatusGate: null as ReturnType<typeof gate> | null,
    recipientFailure: null as Failure, releaseStatusGate: null as ReturnType<typeof gate> | null,
    releaseMutationGate: null as ReturnType<typeof gate> | null, releaseReceipts: new Map<string, { args: Record<string, any>; value: Receipt }>(),
    profileAvailable: true, canRequest: false, assigned: false, documentRevision: 2, reviewRevision: 2,
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
  const row = (id = versionId, ordinal = 2, restricted = false) => ({ version_id: id, version_ordinal: ordinal, object_id: uuid(700 + ordinal),
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
        account_id: accountA.id, facility_id: facilityA.id, title: 'Synthetic review document', document_class: state.documentClass,
        document_revision: state.documentRevision, can_create_version: false }] : [], next_cursor: null });
      if (name === 'list_document_versions') return json(route, { document_id: docId, document_revision: state.documentRevision,
        state: 'available', items: [row(versionId, 2, state.includeRestricted)], next_cursor: null });
      if (name === 'document_version_release_status') {
        expect(args).toEqual({ p_version_id: versionId, p_expected_sha256: digest });
        const releaseState = !state.releaseRecord ? 'unreleased' : state.withdrawalRecord ? 'withdrawn'
          : state.currentReleaseId === state.releaseRecord.release_id ? 'current' : 'superseded';
        const value = { ...exact(), release_revision: state.releaseRevision, release_id: state.releaseRecord?.release_id ?? null,
          current_release_id: state.currentReleaseId, approved_review_decision_id: state.releaseApproved ? uuid(900) : null,
          release_state: releaseState, controller_eligible: state.controllerEligible,
          can_prepare_release: state.canRelease && state.controllerEligible && state.releaseApproved && !state.releaseRecord,
          metadata_only: !state.releaseMalformed, released_download_available: false };
        const wait = state.releaseStatusGate; if (wait) { wait.arrive(); await wait.wait; }
        try {
          if (state.releaseStatusFailure) return await failure(route, state.releaseStatusFailure);
          if (state.includeRestricted) return await failure(route, { code: '42501', status: 403 });
          return await json(route, value);
        }
        finally { wait?.finish(); }
      }
      if (name === 'document_release_withdrawal_status') {
        expect(args).toEqual({ p_version_id: versionId, p_expected_sha256: digest });
        const releaseState = !state.releaseRecord ? 'unreleased' : state.withdrawalRecord ? 'withdrawn'
          : state.currentReleaseId === state.releaseRecord.release_id ? 'current' : 'superseded';
        const value = { version_id: versionId, document_id: docId, verified_sha256: digest,
          release_id: state.releaseRecord?.release_id ?? null, release_revision: state.releaseRevision, release_state: releaseState,
          can_withdraw: state.withdrawalMalformed ? 'true' : releaseState === 'current' || releaseState === 'superseded' };
        const wait = state.withdrawalStatusGate; if (wait) { wait.arrive(); await wait.wait; }
        try { return state.withdrawalStatusFailure ? await failure(route, state.withdrawalStatusFailure) : await json(route, value); }
        finally { wait?.finish(); }
      }
      if (name === 'document_release_audience_options') {
        expect(args).toEqual({ p_version_id: versionId, p_expected_sha256: digest });
        return json(route, { ...exact(), release_revision: state.releaseRevision + state.audienceRevisionOffset, metadata_only: true,
          recipients: [{ grant_id: uuid(1100), recipient_profile_id: uuid(2100), recipient_display_name: 'Synthetic recipient A' },
            { grant_id: uuid(1101), recipient_profile_id: uuid(2101), recipient_display_name: 'Synthetic recipient B' }] });
      }
      if (name === 'release_document_version' || name === 'withdraw_document_release') {
        const withdrawing = name === 'withdraw_document_release';
        if (!withdrawing && state.includeRestricted) return failure(route, { code: '42501', status: 403 });
        expect(Object.keys(args).sort()).toEqual((withdrawing
          ? ['p_release_id', 'p_expected_release_revision', 'p_request_id', 'p_reason_code']
          : ['p_version_id', 'p_expected_sha256', 'p_expected_document_revision', 'p_expected_review_revision',
            'p_expected_release_revision', 'p_recipient_grant_ids', 'p_request_id', 'p_attestation_code']).sort());
        if (state.releaseMutationFailure) return failure(route, state.releaseMutationFailure);
        let old = state.releaseReceipts.get(args.p_request_id);
        if (old) expect(args).toEqual(old.args);
        else {
          expect(args.p_expected_release_revision).toBe(state.releaseRevision);
          ++state.releaseRevision;
          let value: Receipt;
          if (withdrawing) {
            expect(args.p_release_id).toBe(state.releaseRecord?.release_id);
            expect(['release_error', 'audience_change', 'security_concern']).toContain(args.p_reason_code);
            value = { withdrawal_id: uuid(1400), release_id: args.p_release_id, version_id: versionId, document_id: docId,
              release_revision: state.releaseRevision, reason_code: args.p_reason_code, withdrawn_at: '2026-10-09T15:00:00Z', withdrawn: true };
            state.withdrawalRecord = value;
            if (state.currentReleaseId === args.p_release_id) state.currentReleaseId = null;
          } else {
            expect(args.p_version_id).toBe(versionId); expect(args.p_expected_sha256).toBe(digest);
            expect(args.p_expected_document_revision).toBe(state.documentRevision); expect(args.p_expected_review_revision).toBe(state.reviewRevision);
            expect(args.p_attestation_code).toBe('released_exact_synthetic_version');
            expect(args.p_recipient_grant_ids.length).toBeGreaterThan(0);
            expect(args.p_recipient_grant_ids.every((grant: string) => [uuid(1100), uuid(1101)].includes(grant))).toBe(true);
            value = { ...exact(), release_id: uuid(1300), review_decision_id: uuid(900), controller_grant_id: uuid(1000),
              recipient_grant_ids: [...args.p_recipient_grant_ids], previous_release_id: state.currentReleaseId,
              release_class: 'routine_synthetic_document', attestation_code: args.p_attestation_code,
              release_revision: state.releaseRevision, released_at: '2026-10-09T14:00:00Z', metadata_only: true };
            state.releaseRecord = value; state.currentReleaseId = uuid(1300);
          }
          old = { args, value }; state.releaseReceipts.set(args.p_request_id, old);
        }
        const wait = state.releaseMutationGate; if (wait) { wait.arrive(); await wait.wait; }
        try {
          if (state.releaseLost) return await failure(route, { code: 'XX000', status: 503 });
          return await json(route, state.releaseInvalid ? { ...old.value, release_revision: -1 } : old.value);
        } finally { wait?.finish(); }
      }
      if (name === 'current_document_release' || name === 'historical_document_release') {
        const historical = name === 'historical_document_release';
        expect(args).toEqual(historical ? { p_version_id: versionId, p_expected_sha256: digest } : { p_document_id: docId });
        if (state.recipientFailure) return failure(route, state.recipientFailure);
        if (historical && (!state.releaseRecord || state.withdrawalRecord || state.currentReleaseId === state.releaseRecord.release_id)
          || !historical && !state.currentReleaseId) return failure(route, { code: '42501', status: 403 });
        const selectedVersion = historical || state.currentReleaseId === state.releaseRecord?.release_id;
        return json(route, { release_id: historical ? state.releaseRecord!.release_id : state.currentReleaseId,
          document_id: docId, version_id: selectedVersion ? versionId : uuid(602), verified_sha256: selectedVersion ? digest : 'b'.repeat(64),
          version_ordinal: selectedVersion ? 2 : 3, release_class: 'routine_synthetic_document',
          released_at: '2026-10-09T14:00:00Z', release_revision: state.releaseRevision,
          visibility: historical ? 'historical' : 'current', metadata_only: true, released_download_available: false });
      }
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


const releasePanel = (page: Page) => page.getByRole('region', { name: 'Synthetic metadata release', exact: true });
const releaseStatusButton = (page: Page) => releasePanel(page).getByRole('button', { name: /^(Check|Refresh) release status$/ });
const withdrawalStatusButton = (page: Page) => releasePanel(page).getByRole('button', { name: /^(Check|Refresh) withdrawal access$/ });
async function checkWithdrawal(page: Page) {
  await withdrawalStatusButton(page).click();
  await expect(releasePanel(page).getByText(/^Recorded withdrawal state:/)).toBeVisible();
}
const releaseWrites = (state: Backend) => state.calls.filter(call => ['release_document_version', 'withdraw_document_release'].includes(call.name));
const releaseAck = 'I am releasing metadata for this exact synthetic version to only the selected recipient grants.';
const withdrawAck = 'I am withdrawing this exact release; history is preserved and no earlier release is restored.';
async function checkRelease(page: Page) {
  await releaseStatusButton(page).click();
  await expect(releasePanel(page).getByText(/^Recorded release state:/)).toBeVisible();
}
async function chooseAudience(page: Page) {
  await releasePanel(page).getByRole('button', { name: 'Load eligible recipient grants', exact: true }).click();
  await releasePanel(page).getByRole('checkbox', { name: /Synthetic recipient A/ }).check();
  await releasePanel(page).getByLabel(releaseAck, { exact: true }).check();
}
async function prepareRelease(page: Page) { await checkRelease(page); await chooseAudience(page); }
async function sendRelease(page: Page) {
  await releasePanel(page).getByRole('button', { name: 'Release exact metadata', exact: true }).click();
}
function existingRelease(state: Backend, superseded = false) {
  state.releaseRecord = { release_id: uuid(1300) }; state.releaseRevision = 5;
  state.currentReleaseId = superseded ? uuid(1301) : uuid(1300);
}
async function prepareWithdrawal(page: Page, reasonCode = 'audience_change') {
  const summary = releasePanel(page).getByText('Withdraw this exact release', { exact: true });
  await summary.focus(); await page.keyboard.press('Enter');
  await releasePanel(page).getByLabel('Withdrawal reason', { exact: true }).selectOption(reasonCode);
  await releasePanel(page).getByLabel(withdrawAck, { exact: true }).check();
}
async function openRecipients(page: Page) {
  const summary = releasePanel(page).getByText('Recipient metadata checks', { exact: true });
  await summary.focus(); await page.keyboard.press('Enter');
}

test('fixture release: ineligible classes mount no release controls or release RPCs', async ({ page }) => {
  const backend = await fixture(page); backend.documentClass = 'internal_note'; await openHistory(page);
  await expect(releasePanel(page)).toHaveCount(0);
  expect(backend.calls.some(call => call.name.includes('release'))).toBe(false);
});

test('fixture release: administrator metadata never supplies controller or audience authority', async ({ page }) => {
  const backend = await fixture(page); backend.controllerEligible = false; backend.canRelease = false;
  await openHistory(page);
  expect(backend.calls.some(call => call.name === 'document_version_release_status')).toBe(false);
  await checkRelease(page);
  await expect(releasePanel(page).getByText(/No current preparation permission/)).toBeVisible();
  await expect(releasePanel(page).getByRole('button', { name: 'Load eligible recipient grants' })).toHaveCount(0);
  await expect(releasePanel(page).getByRole('button', { name: 'Release exact metadata' })).toHaveCount(0);
  expect(releaseWrites(backend)).toHaveLength(0);
  expect(backend.calls.some(call => /provision_|revoke_|retire_/.test(call.name))).toBe(false);
});

test('fixture release: human selects exact grants and attests to version, approval and all revisions', async ({ page }) => {
  const backend = await fixture(page); await openHistory(page); await checkRelease(page);
  await releasePanel(page).getByRole('button', { name: 'Load eligible recipient grants' }).click();
  await expect(releasePanel(page).getByRole('checkbox', { name: /Synthetic recipient A/ })).not.toBeChecked();
  await expect(releasePanel(page).getByRole('checkbox', { name: /Synthetic recipient B/ })).not.toBeChecked();
  const submit = releasePanel(page).getByRole('button', { name: 'Release exact metadata', exact: true });
  await expect(submit).toBeDisabled();
  await releasePanel(page).getByRole('checkbox', { name: /Synthetic recipient A/ }).check();
  await expect(submit).toBeDisabled();
  await releasePanel(page).getByLabel(releaseAck, { exact: true }).check(); await submit.click();
  await expect(releasePanel(page).getByText('Metadata release recorded', { exact: true })).toBeVisible();
  await expect(releasePanel(page).getByText('Recorded release state: Current release', { exact: true })).toBeVisible();
  expect(releaseWrites(backend)).toHaveLength(1);
  expect(releaseWrites(backend)[0].args).toEqual({
    p_version_id: versionId, p_expected_sha256: digest, p_expected_document_revision: 2, p_expected_review_revision: 2,
    p_expected_release_revision: 4, p_recipient_grant_ids: [uuid(1100)], p_request_id: expect.any(String),
    p_attestation_code: 'released_exact_synthetic_version',
  });
  expect(backend.releaseRecord?.previous_release_id).toBe(uuid(1200));
  await expect(releasePanel(page).getByText(/Its history was preserved/)).toBeVisible();
});

test('fixture release: lost response remains uncertain through GET and denied replay, preserving original audience and revisions', async ({ page }) => {
  const backend = await fixture(page); backend.releaseLost = true; await openHistory(page); await prepareRelease(page); await sendRelease(page);
  await expect(releasePanel(page).getByText('Release operation not confirmed', { exact: true })).toBeVisible();
  const original = structuredClone(releaseWrites(backend)[0].args);
  backend.releaseRevision += 3; backend.documentRevision += 1;
  await checkRelease(page);
  await expect(releasePanel(page).getByText(/Status and recipient metadata reads cannot confirm it/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh documents', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Refresh version history', exact: true })).toBeDisabled();
  await expect(releasePanel(page).getByRole('button', { name: 'Release exact metadata' })).toHaveCount(0);
  await expect(releasePanel(page).getByText('Withdraw this exact release', { exact: true })).toHaveCount(0);
  await expect(releasePanel(page).getByRole('button', { name: 'Review a new release operation' })).toHaveCount(0);
  backend.releaseMutationFailure = { code: '42501', status: 403 };
  await releasePanel(page).getByRole('button', { name: 'Retry exact release operation' }).click();
  await expect(releasePanel(page).getByText(/current access. Controller/)).toBeVisible();
  await expect(releasePanel(page).getByText(/earlier submission may already have committed/)).toBeVisible();
  expect(releaseWrites(backend)[1].args).toEqual(original);
  backend.releaseMutationFailure = null; backend.releaseLost = false;
  await releasePanel(page).getByRole('button', { name: 'Retry exact release operation' }).click();
  await expect(releasePanel(page).getByText('Metadata release recorded', { exact: true })).toBeVisible();
  expect(releaseWrites(backend)[2].args).toEqual(original); expect(backend.releaseReceipts.size).toBe(1);
});

test('fixture release: stale rejection requires fresh status, explicit new preparation and a new UUID', async ({ page }) => {
  const backend = await fixture(page); backend.releaseMutationFailure = { code: '40001', status: 409 };
  await openHistory(page); await prepareRelease(page); await sendRelease(page);
  await expect(releasePanel(page).getByText('Release operation not confirmed', { exact: true })).toBeVisible();
  const first = releaseWrites(backend)[0].args;
  await expect(releasePanel(page).getByRole('button', { name: 'Retry exact release operation' })).toHaveCount(0);
  await expect(releasePanel(page).getByRole('button', { name: 'Review a new release operation' })).toHaveCount(0);
  backend.releaseMutationFailure = null; backend.releaseRevision++;
  await checkRelease(page); await releasePanel(page).getByRole('button', { name: 'Review a new release operation' }).click();
  await chooseAudience(page); await sendRelease(page);
  await expect(releasePanel(page).getByText('Metadata release recorded', { exact: true })).toBeVisible();
  expect(releaseWrites(backend)[1].args.p_request_id).not.toBe(first.p_request_id);
  expect(releaseWrites(backend)[1].args.p_expected_release_revision).toBe(5);
});

test('fixture release: mismatched audience revision and malformed status fail closed without dispatching a release', async ({ page }) => {
  const backend = await fixture(page); backend.audienceRevisionOffset = 1; await openHistory(page); await checkRelease(page);
  await releasePanel(page).getByRole('button', { name: 'Load eligible recipient grants' }).click();
  await expect(releasePanel(page).getByRole('alert')).toContainText('revision changed');
  await expect(releasePanel(page).getByRole('button', { name: 'Release exact metadata' })).toHaveCount(0);
  backend.releaseMalformed = true; await releaseStatusButton(page).click();
  await expect(releasePanel(page).getByRole('alert')).toContainText('could not be verified');
  expect(releaseWrites(backend)).toHaveLength(0);
});

test('fixture release: denied content status cannot block independently authorized narrowing of a restricted release', async ({ page }) => {
  const backend = await fixture(page); existingRelease(backend); backend.controllerEligible = false; backend.canRelease = false; backend.includeRestricted = true;
  await openHistory(page);
  await releaseStatusButton(page).click();
  await expect(releasePanel(page).getByRole('alert')).toContainText('unavailable');
  await expect(releasePanel(page).getByText('Withdraw this exact release', { exact: true })).toHaveCount(0);
  await checkWithdrawal(page); await prepareWithdrawal(page, 'security_concern');
  await releasePanel(page).getByRole('button', { name: 'Withdraw exact release', exact: true }).click();
  await expect(releasePanel(page).getByText('Withdrawal recorded', { exact: true })).toBeVisible();
  await expect(releasePanel(page).getByText('Recorded withdrawal state: Withdrawn release', { exact: true })).toBeVisible();
  expect(releaseWrites(backend)[0].args).toEqual({ p_release_id: uuid(1300), p_expected_release_revision: 5,
    p_request_id: expect.any(String), p_reason_code: 'security_concern' });
  expect(backend.currentReleaseId).toBeNull(); expect(backend.releaseRecord).not.toBeNull();
  await openRecipients(page); await releasePanel(page).getByRole('button', { name: 'Check current recipient metadata' }).click();
  await expect(releasePanel(page).getByRole('alert')).toContainText('unavailable');
  await expect(releasePanel(page).getByText('Current recipient metadata', { exact: true })).toHaveCount(0);
});

test('fixture release: denied or malformed narrowing discovery supplies no withdrawal or new-release authority', async ({ page }) => {
  const backend = await fixture(page); existingRelease(backend);
  backend.withdrawalStatusFailure = { code: '42501', status: 403 }; await openHistory(page);
  await withdrawalStatusButton(page).click();
  await expect(releasePanel(page).getByRole('alert')).toContainText('unavailable');
  await expect(releasePanel(page).getByText('Withdraw this exact release', { exact: true })).toHaveCount(0);
  backend.withdrawalStatusFailure = null; backend.withdrawalMalformed = true;
  await withdrawalStatusButton(page).click();
  await expect(releasePanel(page).getByRole('alert')).toContainText('could not be verified');
  await expect(releasePanel(page).getByRole('button', { name: 'Release exact metadata', exact: true })).toHaveCount(0);
  await expect(releasePanel(page).getByText('Withdraw this exact release', { exact: true })).toHaveCount(0);
  expect(releaseWrites(backend)).toHaveLength(0);
});

test('fixture release: invalid withdrawal receipt cannot be erased by denial or a fresh withdrawn status', async ({ page }) => {
  const backend = await fixture(page); existingRelease(backend); backend.releaseInvalid = true;
  await openHistory(page); await checkWithdrawal(page); await prepareWithdrawal(page); await releasePanel(page).getByRole('button', { name: 'Withdraw exact release' }).click();
  await expect(releasePanel(page).getByText('Release operation not confirmed', { exact: true })).toBeVisible();
  const original = structuredClone(releaseWrites(backend)[0].args);
  await checkWithdrawal(page); await expect(releasePanel(page).getByText('Recorded withdrawal state: Withdrawn release', { exact: true })).toBeVisible();
  await expect(releasePanel(page).getByText(/earlier submission may already have committed/)).toBeVisible();
  backend.releaseMutationFailure = { code: '42501', status: 403 };
  await releasePanel(page).getByRole('button', { name: 'Retry exact release operation' }).click();
  await expect(releasePanel(page).getByText(/current access. Controller/)).toBeVisible();
  await expect(releasePanel(page).getByText('Frozen withdrawal: Audience change', { exact: true })).toBeVisible();
  await expect(releasePanel(page).getByLabel('Withdrawal reason', { exact: true })).toHaveCount(0);
  expect(releaseWrites(backend)[1].args).toEqual(original);
  backend.releaseMutationFailure = null; backend.releaseInvalid = false;
  await releasePanel(page).getByRole('button', { name: 'Retry exact release operation' }).click();
  await expect(releasePanel(page).getByText('Withdrawal recorded', { exact: true })).toBeVisible();
  expect(releaseWrites(backend)[2].args).toEqual(original);
});

test('fixture release: current and historical recipient metadata stay separate and never replace the selected version', async ({ page }) => {
  const backend = await fixture(page); existingRelease(backend, true); await openHistory(page); await checkRelease(page); await openRecipients(page);
  await releasePanel(page).getByRole('button', { name: 'Check current recipient metadata' }).click();
  await expect(releasePanel(page).getByText('Current recipient metadata', { exact: true })).toBeVisible();
  await expect(releasePanel(page).getByText(uuid(602), { exact: true })).toBeVisible();
  await expect(releasePanel(page).getByText('Recorded release state: Superseded release', { exact: true })).toBeVisible();
  await releasePanel(page).getByRole('button', { name: 'Check this historical version’s recipient metadata', exact: true }).click();
  await expect(releasePanel(page).getByText('Historical recipient metadata', { exact: true })).toBeVisible();
  await expect(releasePanel(page).getByText(uuid(602), { exact: true })).toHaveCount(0);
  backend.recipientFailure = { code: '42501', status: 403 };
  await releasePanel(page).getByRole('button', { name: 'Check current recipient metadata' }).click();
  await expect(releasePanel(page).getByText('Historical recipient metadata', { exact: true })).toHaveCount(0);
  await expect(releasePanel(page).getByRole('alert')).toContainText('unavailable');
  expect(releaseWrites(backend)).toHaveLength(0);
});

test('fixture release: scope switch ignores an old status and clears the selected version', async ({ page }) => {
  const backend = await fixture(page); backend.releaseStatusGate = gate(); await openHistory(page);
  await releaseStatusButton(page).click(); await backend.releaseStatusGate.arrived;
  await page.getByLabel('Facility', { exact: true }).selectOption(facilityA2.id);
  backend.releaseStatusGate.release(); await backend.releaseStatusGate.finished;
  await expect(releasePanel(page)).toHaveCount(0); expect(releaseWrites(backend)).toHaveLength(0);
});

test('fixture release: late withdrawal discovery after a facility switch cannot restore its narrowing controls', async ({ page }) => {
  const backend = await fixture(page); existingRelease(backend); backend.withdrawalStatusGate = gate(); await openHistory(page);
  await withdrawalStatusButton(page).click(); await backend.withdrawalStatusGate.arrived;
  await page.getByLabel('Facility', { exact: true }).selectOption(facilityA2.id);
  backend.withdrawalStatusGate.release(); await backend.withdrawalStatusGate.finished;
  await expect(releasePanel(page)).toHaveCount(0); expect(releaseWrites(backend)).toHaveLength(0);
});

for (const leave of ['account', 'signout'] as const) {
  test('fixture release: late committed mutation is suppressed after ' + leave, async ({ page }) => {
    const backend = await fixture(page); backend.releaseMutationGate = gate();
    await openHistory(page); await prepareRelease(page); await sendRelease(page); await backend.releaseMutationGate.arrived;
    if (leave === 'account') await page.getByLabel('Account', { exact: true }).selectOption(accountB.id);
    else await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    backend.releaseMutationGate.release(); await backend.releaseMutationGate.finished;
    await expect(page.getByText('Metadata release recorded', { exact: true })).toHaveCount(0);
    await expect(releasePanel(page)).toHaveCount(0); expect(backend.releaseReceipts.size).toBe(1);
  });
}

test('fixture release: session expiry clears the workspace and suppresses raw service details', async ({ page }) => {
  const backend = await fixture(page); backend.releaseMutationFailure = { code: '28000', status: 401 };
  await openHistory(page); await prepareRelease(page); await sendRelease(page);
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  await expect(releasePanel(page)).toHaveCount(0); await expect(page.getByText(/PRIVATE SQL/)).toHaveCount(0);
});

test('fixture release: duplicate submission is one mutation, document navigation is fenced and phone disclosures work by keyboard', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const backend = await fixture(page); backend.releaseMutationGate = gate();
  await openHistory(page); await checkRelease(page);
  const summary = releasePanel(page).getByText('Release version and revisions', { exact: true });
  await summary.focus(); await page.keyboard.press('Enter');
  await expect(summary.locator('..').getByText(digest, { exact: true })).toBeVisible();
  expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.keyboard.press('Enter'); await expect(summary.locator('..').getByText(digest, { exact: true })).not.toBeVisible();
  await chooseAudience(page);
  const submit = releasePanel(page).getByRole('button', { name: 'Release exact metadata', exact: true });
  expect((await submit.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await submit.evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await backend.releaseMutationGate.arrived;
  expect(releaseWrites(backend)).toHaveLength(1);
  await expect(page.getByRole('button', { name: 'Refresh documents', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Refresh version history', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('metadata-release-phone.png'), fullPage: true });
  backend.releaseMutationGate.release(); await backend.releaseMutationGate.finished;
  await expect(releasePanel(page).getByText('Metadata release recorded', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => [...Object.values(localStorage), ...Object.values(sessionStorage)].some(value =>
    /released_exact_synthetic_version|recipientGrantIds|Frozen metadata release/.test(value)))).toBe(false);
});
