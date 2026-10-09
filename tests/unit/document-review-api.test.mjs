import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

// Production adapter with simulated SDK replies. These tests do not certify
// hosted Auth, actual human assignment, RLS, review decisions or release.
const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const transpile = async name => ts.transpileModule(await readFile(new URL(`../../web/src/lib/${name}.ts`, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const errorsUrl = moduleUrl(await transpile('errors'));
const { DocumentReviewApi, DocumentReviewError } = await import(moduleUrl((await transpile('document-review-api'))
  .replace(/from\s+["']\.\/errors["']/, `from '${errorsUrl}'`)));
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const exact = () => ({ documentId: id(10), versionId: id(20), verifiedSha256: 'a'.repeat(64) });
const intent = (changes = {}) => ({ ...exact(), kind: 'request', documentRevision: 4, reviewRevision: 1, requestId: id(30), ...changes });
const decisionIntent = (changes = {}) => intent({ kind: 'decision', reviewRequestId: id(40), decision: 'approved_internal',
  attestationCode: 'reviewed_exact_synthetic_version', ...changes });
const baseReceipt = (changes = {}) => ({ document_id: id(10), version_id: id(20), verified_sha256: 'a'.repeat(64), document_revision: 4, review_revision: 2, ...changes });
const requestReceipt = (changes = {}) => ({ ...baseReceipt(), review_request_id: id(40), requested_at: '2026-10-09T12:00:00.123456+00:00', state: 'under_review', ...changes });
const decisionReceipt = (changes = {}) => ({ ...baseReceipt(), review_request_id: id(40), decision_id: id(50), assignment_id: id(60),
  decided_at: '2026-10-09T13:00:00Z', decision: 'approved_internal', attestation_code: 'reviewed_exact_synthetic_version', ...changes });
const status = (changes = {}) => ({ ...baseReceipt({ review_revision: 1 }), historical_review_state: 'internal_draft', request: null,
  decision: null, can_request: true, can_decide: false, release_authorized: false, ...changes });
const requested = (changes = {}) => status({ review_revision: 2, historical_review_state: 'under_review',
  request: { review_request_id: id(40), requested_at: requestReceipt().requested_at }, can_request: false, can_decide: true, ...changes });
function setup(data, error = null, status = 200) {
  const calls = [];
  const client = { rpc(name, args) {
    const call = { name, args, retry: null, signal: null }; calls.push(call);
    return { retry(value) { call.retry = value; return this; }, abortSignal(value) { call.signal = value; return this; },
      then(resolve, reject) { return Promise.resolve({ data, error, status }).then(resolve, reject); } };
  } };
  return { api: new DocumentReviewApi(client), calls, client };
}

test('status reads only exact version and digest, projects safe typed observations and never creates authority', async () => {
  const signal = new AbortController().signal;
  const value = status();
  const { api, calls } = setup({ ...value, is_admin: true, storage_path: 'PRIVATE path', profile_id: id(70) });
  assert.deepEqual(await api.status(exact(), signal), value);
  assert.deepEqual(calls, [{ name: 'document_version_review_status', args: { p_version_id: id(20), p_expected_sha256: 'a'.repeat(64) }, retry: false, signal }]);
});

test('review requests freeze and replay exact version, digest, both revisions and original idempotency reference', async () => {
  const { api, calls } = setup(requestReceipt());
  const signal = new AbortController().signal;
  assert.deepEqual(await api.request(intent(), signal), requestReceipt());
  await api.request(intent(), signal);
  assert.deepEqual(calls[0], { name: 'request_document_version_review', args: { p_version_id: id(20), p_expected_sha256: 'a'.repeat(64),
    p_expected_document_revision: 4, p_expected_review_revision: 1, p_request_id: id(30) }, retry: false, signal });
  assert.deepEqual(calls[1], calls[0]);
});

test('decisions send only explicit exact intent and deliberate typed attestation; all three outcomes bind their receipts', async () => {
  for (const decision of ['approved_internal', 'changes_requested', 'rejected']) {
    const { api, calls } = setup({ ...decisionReceipt({ decision }), storage_path: 'PRIVATE', actor: id(70), release_authorized: true });
    assert.deepEqual(await api.decide(decisionIntent({ decision })), decisionReceipt({ decision }));
    assert.deepEqual(calls[0], { name: 'decide_document_version_review', args: { p_review_request_id: id(40), p_expected_sha256: 'a'.repeat(64),
      p_expected_document_revision: 4, p_expected_review_revision: 1, p_request_id: id(30), p_decision: decision,
      p_attestation_code: 'reviewed_exact_synthetic_version' }, retry: false, signal: null });
  }
});

test('status validates review state, summaries, exact identities, boolean permissions and permanently closed release boundary', async () => {
  const approved = requested({ historical_review_state: 'approved_internal', can_decide: false,
    decision: { decision_id: id(50), decision: 'approved_internal', decided_at: decisionReceipt().decided_at } });
  assert.deepEqual(await setup(approved).api.status(exact()), approved);
  for (const changes of [{ version_id: id(21) }, { document_id: id(11) }, { verified_sha256: 'b'.repeat(64) },
    { document_revision: '4' }, { review_revision: Number.MAX_SAFE_INTEGER + 1 }, { historical_review_state: 'released' },
    { can_request: 'true' }, { can_decide: true }, { release_authorized: true }, { release_authorized: null },
    { request: undefined }, { request: { review_request_id: 'bad', requested_at: 'bad' } }, { decision: approved.decision }]) {
    await assert.rejects(setup(status(changes)).api.status(exact()), error => error.reason === 'unexpected');
  }
  for (const value of [requested({ can_request: true }), requested({ review_revision: 0 }),
    { ...approved, can_decide: true }, { ...approved, review_revision: 1 },
    { ...approved, decision: { ...approved.decision, decided_at: '2026-10-08T12:00:00Z' } },
    { ...approved, historical_review_state: 'rejected' }, null, [], {}]) {
    await assert.rejects(setup(value).api.status(exact()), error => error.reason === 'unexpected');
  }
});

test('request receipts must preserve the document revision and advance only the review revision', async () => {
  for (const changes of [{ document_id: id(11) }, { version_id: id(21) }, { verified_sha256: 'b'.repeat(64) },
    { document_revision: 5 }, { review_revision: 1 }, { review_revision: 3 }, { review_revision: '2' },
    { review_request_id: 'bad' }, { state: 'approved_internal' }, { requested_at: 'PRIVATE malformed date' }]) {
    await assert.rejects(setup(requestReceipt(changes)).api.request(intent()), error => error.reason === 'unexpected');
  }
});

test('decision receipts bind request, exact version, outcome, attestation, assignment identifier and preserved revisions', async () => {
  for (const changes of [{ review_request_id: id(41) }, { version_id: id(21) }, { document_id: id(11) },
    { verified_sha256: 'b'.repeat(64) }, { document_revision: 5 }, { review_revision: 3 }, { decision_id: 'bad' },
    { assignment_id: null }, { decision: 'changes_requested' }, { attestation_code: 'approved' }, { decided_at: 'bad' }]) {
    await assert.rejects(setup(decisionReceipt(changes)).api.decide(decisionIntent()), error => error.reason === 'unexpected');
  }
});

test('typed invalid inputs, unsafe revisions and substituted choices never dispatch an RPC', async () => {
  const { api, calls } = setup(null);
  for (const key of ['documentId', 'versionId', 'requestId']) {
    for (const value of ['', null, '../path', id(20).toUpperCase().replace('0000', 'ABCD')]) {
      await assert.rejects(api.request(intent({ [key]: value })), error => error.reason === 'validation');
    }
  }
  for (const value of ['', null, 'A'.repeat(64), 'a'.repeat(63)]) {
    await assert.rejects(api.status({ ...exact(), verifiedSha256: value }), error => error.reason === 'validation');
  }
  for (const key of ['documentRevision', 'reviewRevision']) for (const value of [-1, 0.5, '4', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(api.request(intent({ [key]: value })), error => error.reason === 'validation');
  }
  await assert.rejects(api.request(intent({ reviewRevision: Number.MAX_SAFE_INTEGER })), error => error.reason === 'validation');
  for (const changes of [{ reviewRequestId: null }, { decision: 'released' }, { attestationCode: null },
    { attestationCode: 'AI_reviewed' }, { kind: 'request' }]) {
    await assert.rejects(api.decide(decisionIntent(changes)), error => error.reason === 'validation');
  }
  await assert.rejects(api.request(decisionIntent()), error => error.reason === 'validation');
  assert.equal(calls.length, 0);
});

test('safe errors distinguish authentication, authority, stale revisions, changed intent, final history and uncertain service outcomes', async () => {
  for (const [code, status, reason] of [['28000', 400, 'unauthenticated'], ['PGRST301', 401, 'unauthenticated'], ['42501', 403, 'unavailable'],
    ['40001', 409, 'conflict'], ['23505', 409, 'request_conflict'], ['55000', 400, 'final'], ['22023', 400, 'validation'],
    ['PGRST202', 404, 'backend'], ['42883', 404, 'backend'], ['XX000', 503, 'backend'], ['', 0, 'backend']]) {
    const { api, calls } = setup(null, { code, message: 'PRIVATE SQL details', details: 'PRIVATE actor' }, status);
    await assert.rejects(api.request(intent()), error => error instanceof DocumentReviewError && error.reason === reason
      && !error.message.includes('PRIVATE') && (reason !== 'unauthenticated' || error.code === 'session_expired'));
    assert.equal(calls.length, 1); assert.equal(calls[0].retry, false);
  }
  const { api, client } = setup(null);
  client.rpc = () => { throw new Error('PRIVATE network failure'); };
  await assert.rejects(api.request(intent()), error => error.reason === 'backend' && !error.message.includes('PRIVATE'));
  client.rpc = () => { throw new DOMException('Provider-side timeout', 'AbortError'); };
  await assert.rejects(api.request(intent()), error => error.reason === 'backend', 'an abort without our cancellation signal is an uncertain service outcome');
});

test('changing caller intent while the SDK is pending cannot retarget request or decision receipt validation', async () => {
  for (const kind of ['request', 'decision']) {
    const input = kind === 'request' ? intent() : decisionIntent();
    const expected = kind === 'request' ? requestReceipt() : decisionReceipt();
    const { api, client } = setup(expected);
    client.rpc = () => ({ retry() { return this; }, then(resolve) {
      input.documentId = id(99); input.versionId = id(99); input.documentRevision = 99; input.reviewRevision = 99;
      input.decision = 'rejected'; input.attestationCode = 'changed';
      return Promise.resolve({ data: expected, error: null }).then(resolve);
    } });
    assert.deepEqual(await api[kind === 'request' ? 'request' : 'decide'](input), expected);
  }
});

test('abort prevents dispatch and drops late status or mutation receipts without converting cancellation into a service error', async () => {
  for (const operation of ['status', 'request', 'decide']) {
    const input = operation === 'status' ? exact() : operation === 'request' ? intent() : decisionIntent();
    const result = operation === 'status' ? status() : operation === 'request' ? requestReceipt() : decisionReceipt();
    const before = new AbortController(); before.abort();
    const first = setup(result);
    await assert.rejects(first.api[operation](input, before.signal), { name: 'AbortError' }); assert.equal(first.calls.length, 0);
    const during = new AbortController(), late = setup(result);
    late.client.rpc = () => ({ retry() { return this; }, abortSignal() { return this; }, then(resolve) {
      during.abort(); return Promise.resolve({ data: result, error: null }).then(resolve);
    } });
    await assert.rejects(late.api[operation](input, during.signal), { name: 'AbortError' });
  }
});
