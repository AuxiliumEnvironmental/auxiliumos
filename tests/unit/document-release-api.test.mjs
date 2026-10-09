import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

// Production adapter, simulated SDK only. No hosted authority or release claim.
const moduleUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const transpile = async name => ts.transpileModule(await readFile(new URL('../../web/src/lib/' + name + '.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const errorsUrl = moduleUrl(await transpile('errors'));
const { DocumentReleaseApi, DocumentReleaseError } = await import(moduleUrl((await transpile('document-release-api'))
  .replace(/from\s+["']\.\/errors["']/, "from '" + errorsUrl + "'")));
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const exact = () => ({ documentId: id(10), versionId: id(20), verifiedSha256: 'a'.repeat(64) });
const identity = () => ({ document_id: id(10), version_id: id(20), verified_sha256: 'a'.repeat(64) });
const releaseIntent = (changes = {}) => ({ ...exact(), kind: 'release', documentRevision: 4, reviewRevision: 2, releaseRevision: 7,
  approvedReviewDecisionId: id(40), previousReleaseId: id(50), recipientGrantIds: [id(61), id(60)],
  requestId: id(30), attestationCode: 'released_exact_synthetic_version', ...changes });
const withdrawalIntent = (changes = {}) => ({ ...exact(), kind: 'withdraw', releaseId: id(70), releaseRevision: 8,
  requestId: id(31), reasonCode: 'audience_change', ...changes });
const receipt = (changes = {}) => ({ ...identity(), release_id: id(70), review_decision_id: id(40), controller_grant_id: id(80),
  recipient_grant_ids: [id(60), id(61)], previous_release_id: id(50), release_class: 'routine_synthetic_document',
  attestation_code: 'released_exact_synthetic_version', document_revision: 4, review_revision: 2, release_revision: 8,
  released_at: '2026-10-09T12:00:00.123456+00:00', metadata_only: true, ...changes });
const withdrawal = (changes = {}) => ({ withdrawal_id: id(90), release_id: id(70), document_id: id(10), version_id: id(20),
  release_revision: 9, reason_code: 'audience_change', withdrawn_at: '2026-10-09T13:00:00Z', withdrawn: true, ...changes });
const status = (changes = {}) => ({ ...identity(), document_revision: 4, review_revision: 2, release_revision: 7,
  release_id: null, current_release_id: id(50), approved_review_decision_id: id(40), release_state: 'unreleased',
  controller_eligible: true, can_prepare_release: true, metadata_only: true, released_download_available: false, ...changes });
const audience = (changes = {}) => ({ ...identity(), document_revision: 4, review_revision: 2, release_revision: 7, metadata_only: true,
  recipients: [{ grant_id: id(60), recipient_profile_id: id(160), recipient_display_name: 'Synthetic recipient' }], ...changes });
const metadata = (changes = {}) => ({ ...identity(), release_id: id(70), version_ordinal: 3, release_class: 'routine_synthetic_document',
  released_at: '2026-10-09T12:00:00Z', release_revision: 8, visibility: 'current', metadata_only: true, released_download_available: false, ...changes });
function setup(data, error = null, statusCode = 200) {
  const calls = [];
  const client = { rpc(name, args) {
    const call = { name, args, retry: null, signal: null }; calls.push(call);
    return { retry(value) { call.retry = value; return this; }, abortSignal(value) { call.signal = value; return this; },
      then(resolve, reject) { return Promise.resolve({ data, error, status: statusCode }).then(resolve, reject); } };
  } };
  return { api: new DocumentReleaseApi(client), calls, client };
}
const rejected = (promise, reason = 'unexpected') => assert.rejects(promise, error => error instanceof DocumentReleaseError && error.reason === reason);

test('exact status and eligible-audience reads project only typed observations without owner authority or directories', async () => {
  const signal = new AbortController().signal;
  const s = setup({ ...status(), owner: true, can_withdraw: true, storage_path: 'PRIVATE' });
  assert.deepEqual(await s.api.status(exact(), signal), status());
  assert.deepEqual(s.calls, [{ name: 'document_version_release_status', args: { p_version_id: id(20), p_expected_sha256: 'a'.repeat(64) }, retry: false, signal }]);
  const a = setup(audience({ recipients: [{ ...audience().recipients[0], auth_user_id: 'PRIVATE' }] }));
  assert.deepEqual(await a.api.audience(exact()), audience());
  assert.equal(a.calls[0].name, 'document_release_audience_options');
  assert.deepEqual(await setup(status({ controller_eligible: false, can_prepare_release: false })).api.status(exact()),
    status({ controller_eligible: false, can_prepare_release: false }));
});

test('status fails closed for mixed identities, unsafe revisions, impossible pointer states and release capability contradictions', async () => {
  for (const change of [{ document_id: id(11) }, { version_id: id(21) }, { verified_sha256: 'b'.repeat(64) },
    { document_revision: '4' }, { review_revision: 1 }, { release_revision: Number.MAX_SAFE_INTEGER + 1 },
    { release_id: id(70) }, { current_release_id: undefined }, { approved_review_decision_id: null },
    { controller_eligible: false }, { can_prepare_release: 'true' }, { metadata_only: false }, { released_download_available: true }]) {
    await rejected(setup(status(change)).api.status(exact()));
  }
  for (const state of ['current', 'superseded', 'withdrawn']) {
    const valid = status({ release_id: id(70), current_release_id: state === 'current' ? id(70) : null,
      release_state: state, can_prepare_release: false, release_revision: 8 });
    assert.deepEqual(await setup(valid).api.status(exact()), valid);
    await rejected(setup({ ...valid, current_release_id: state === 'current' ? null : id(70) }).api.status(exact()));
  }
});

test('audience rejects duplicate grants, malformed recipients and foreign exact references; empty eligible audience is valid', async () => {
  assert.deepEqual((await setup(audience({ recipients: [] })).api.audience(exact())).recipients, []);
  for (const change of [{ version_id: id(21) }, { verified_sha256: 'b'.repeat(64) }, { release_revision: -1 }, { metadata_only: false },
    { recipients: null }, { recipients: [audience().recipients[0], audience().recipients[0]] },
    { recipients: [{ grant_id: id(60), recipient_profile_id: id(160), recipient_display_name: '' }] },
    { recipients: [{ grant_id: id(60), recipient_profile_id: null, recipient_display_name: 'Unknown' }] }]) {
    await rejected(setup(audience(change)).api.audience(exact()));
  }
});

test('release sends exact version, digest, all three CAS revisions and explicit normalized grant IDs with one attestation', async () => {
  const s = setup(receipt()), signal = new AbortController().signal;
  assert.deepEqual(await s.api.release(releaseIntent(), signal), receipt());
  await s.api.release(releaseIntent(), signal);
  assert.deepEqual(s.calls[0], { name: 'release_document_version', args: {
    p_version_id: id(20), p_expected_sha256: 'a'.repeat(64), p_expected_document_revision: 4, p_expected_review_revision: 2,
    p_expected_release_revision: 7, p_recipient_grant_ids: [id(60), id(61)], p_request_id: id(30),
    p_attestation_code: 'released_exact_synthetic_version',
  }, retry: false, signal });
  assert.deepEqual(s.calls[1], s.calls[0]);
});

test('receipt binds approval, exact audience set, previous pointer, original revisions and resulting revision', async () => {
  for (const change of [{ release_id: null }, { document_id: id(11) }, { version_id: id(21) }, { verified_sha256: 'b'.repeat(64) },
    { review_decision_id: id(41) }, { controller_grant_id: 'bad' }, { recipient_grant_ids: [id(60)] },
    { recipient_grant_ids: [id(60), id(60)] }, { recipient_grant_ids: [id(60), id(62)] }, { previous_release_id: null },
    { release_class: 'final_report' }, { attestation_code: 'owner_approved' }, { document_revision: 5 }, { review_revision: 3 },
    { release_revision: 9 }, { released_at: 'bad' }, { metadata_only: false }]) {
    await rejected(setup(receipt(change)).api.release(releaseIntent()));
  }
});

test('withdrawal is a separate narrowing RPC with its own exact original intent and receipt', async () => {
  for (const reasonCode of ['release_error', 'audience_change', 'security_concern']) {
    const s = setup(withdrawal({ reason_code: reasonCode }));
    assert.deepEqual(await s.api.withdraw(withdrawalIntent({ reasonCode })), withdrawal({ reason_code: reasonCode }));
    assert.deepEqual(s.calls[0].args, { p_release_id: id(70), p_expected_release_revision: 8, p_request_id: id(31), p_reason_code: reasonCode });
    assert.equal(s.calls[0].name, 'withdraw_document_release');
    assert.equal(s.calls[0].retry, false);
  }
  for (const change of [{ withdrawal_id: null }, { release_id: id(71) }, { document_id: id(11) }, { version_id: id(21) },
    { release_revision: 10 }, { reason_code: 'release_error' }, { withdrawn_at: 'bad' }, { withdrawn: false }]) {
    await rejected(setup(withdrawal(change)).api.withdraw(withdrawalIntent()));
  }
});

test('current recipient metadata may describe a replacement; historical metadata must match the selected exact version', async () => {
  const newer = metadata({ version_id: id(21), verified_sha256: 'b'.repeat(64), version_ordinal: 4 });
  const current = setup({ ...newer, recipient_grant_ids: [id(60)], storage_path: 'PRIVATE' });
  assert.deepEqual(await current.api.current(id(10)), newer);
  assert.deepEqual(current.calls[0].args, { p_document_id: id(10) });
  const historical = setup(metadata({ visibility: 'historical' }));
  assert.deepEqual(await historical.api.historical(exact()), metadata({ visibility: 'historical' }));
  assert.equal(historical.calls[0].name, 'historical_document_release');
  for (const change of [{ visibility: 'current' }, { version_id: id(21) }, { verified_sha256: 'b'.repeat(64) },
    { metadata_only: false }, { released_download_available: true }, { version_ordinal: 0 }, { release_revision: 0 }]) {
    await rejected(setup(metadata({ visibility: 'historical', ...change })).api.historical(exact()));
  }
  await rejected(setup(metadata({ visibility: 'historical' })).api.current(id(10)));
});

test('invalid audiences and mutation inputs never dispatch authority operations', async () => {
  const s = setup(null);
  for (const recipientGrantIds of [[], [id(60), id(60)], [[id(60)]], [null], Array.from({ length: 33 }, (_, n) => id(200 + n))]) {
    await rejected(s.api.release(releaseIntent({ recipientGrantIds })), 'validation');
  }
  for (const change of [{ kind: 'withdraw' }, { documentId: null }, { versionId: 'bad' }, { verifiedSha256: 'A'.repeat(64) },
    { requestId: null }, { approvedReviewDecisionId: null }, { previousReleaseId: 'bad' }, { attestationCode: 'owner' },
    { documentRevision: -1 }, { reviewRevision: 1 }, { releaseRevision: Number.MAX_SAFE_INTEGER }]) {
    await rejected(s.api.release(releaseIntent(change)), 'validation');
  }
  for (const change of [{ kind: 'release' }, { releaseId: null }, { reasonCode: 'delete' }, { releaseRevision: -1 },
    { releaseRevision: Number.MAX_SAFE_INTEGER }, { requestId: 'bad' }]) {
    await rejected(s.api.withdraw(withdrawalIntent(change)), 'validation');
  }
  assert.equal(s.calls.length, 0);
});

test('later caller edits cannot alter the nested audience, revisions or receipt binding while the SDK waits', async () => {
  const input = releaseIntent(), s = setup(receipt());
  s.client.rpc = (name, args) => {
    s.calls.push({ name, args });
    return { retry() { return this; }, then(resolve) {
      input.recipientGrantIds[0] = id(99); input.documentRevision = 99; input.approvedReviewDecisionId = id(99);
      input.previousReleaseId = id(99); input.requestId = id(99);
      return Promise.resolve({ data: receipt(), error: null }).then(resolve);
    } };
  };
  assert.deepEqual(await s.api.release(input), receipt());
  assert.deepEqual(s.calls[0].args.p_recipient_grant_ids, [id(60), id(61)]);
  assert.equal(s.calls[0].args.p_request_id, id(30));
});

test('safe typed errors preserve uncertainty and suppress provider details', async () => {
  for (const [code, statusCode, expected] of [['28000', 400, 'unauthenticated'], ['PGRST301', 401, 'unauthenticated'],
    ['42501', 403, 'unavailable'], ['40001', 409, 'conflict'], ['23505', 409, 'request_conflict'], ['55000', 400, 'final'],
    ['22023', 400, 'validation'], ['XX000', 503, 'backend'], ['PGRST202', 404, 'backend']]) {
    const s = setup(null, { code, message: 'PRIVATE SQL actor/path' }, statusCode);
    await assert.rejects(s.api.release(releaseIntent()), error => error.reason === expected && !error.message.includes('PRIVATE')
      && (expected !== 'unauthenticated' || error.code === 'session_expired'));
    assert.equal(s.calls[0].retry, false);
  }
  const s = setup(null); s.client.rpc = () => { throw new DOMException('Provider timeout', 'AbortError'); };
  await rejected(s.api.release(releaseIntent()), 'backend');
});

test('cancellation prevents dispatch and suppresses late receipts and metadata', async () => {
  for (const [operation, input, data] of [['status', exact(), status()], ['audience', exact(), audience()],
    ['release', releaseIntent(), receipt()], ['withdraw', withdrawalIntent(), withdrawal()],
    ['current', id(10), metadata()], ['historical', exact(), metadata({ visibility: 'historical' })]]) {
    const before = new AbortController(); before.abort(); const first = setup(data);
    await assert.rejects(first.api[operation](input, before.signal), { name: 'AbortError' }); assert.equal(first.calls.length, 0);
    const during = new AbortController(), late = setup(data);
    late.client.rpc = () => ({ retry() { return this; }, abortSignal() { return this; }, then(resolve) {
      during.abort(); return Promise.resolve({ data, error: null }).then(resolve);
    } });
    await assert.rejects(late.api[operation](input, during.signal), { name: 'AbortError' });
  }
});
