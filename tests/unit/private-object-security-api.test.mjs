import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

// Production adapter with a simulated SDK. No authentic Auth, database,
// scanner, human disposition, content authorization or release is proved.
const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const transpile = async name => ts.transpileModule(await readFile(new URL(`../../web/src/lib/${name}.ts`, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const errorsUrl = moduleUrl(await transpile('errors'));
const directoryUrl = moduleUrl((await transpile('directory-api'))
  .replace(/from\s+["']@supabase\/supabase-js["']/, `from '${import.meta.resolve('@supabase/supabase-js')}'`)
  .replace(/from\s+["']\.\/errors["']/, `from '${errorsUrl}'`));
const { PrivateObjectSecurityApi, PrivateObjectSecurityError } = await import(moduleUrl((await transpile('private-object-security-api'))
  .replace(/from\s+["']\.\/directory-api["']/, `from '${directoryUrl}'`)
  .replace(/from\s+["']\.\/errors["']/, `from '${errorsUrl}'`)));
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const snapshot = (changes = {}) => ({ object_id: id(1), state: 'scan_pending', security_revision: 0, verified_sha256: 'a'.repeat(64),
  scan_state: 'pending', scan_attempt_id: null, scan_observation_id: null, clearance_decision_id: null,
  malware_outcome: null, phi_signal: null, clearance_decision: null, visibility_restricted: false,
  preservation_hold: false, ingest_closed: false, security_clearance_eligible: false, quarantined: true,
  next_action: 'await_authorized_security_handling', ...changes });
const observed = (changes = {}) => snapshot({ state: 'human_review_required', security_revision: 2, scan_state: 'result',
  scan_attempt_id: id(2), scan_observation_id: id(3), malware_outcome: 'pass', phi_signal: 'no_signal',
  next_action: 'designated_human_review', ...changes });
const eligible = (changes = {}) => observed({ state: 'security_clearance_eligible', security_revision: 3,
  clearance_decision_id: id(4), clearance_decision: 'cleared_no_phi', security_clearance_eligible: true,
  quarantined: false, next_action: 'await_separate_document_authority', ...changes });
function setup(data = snapshot(), error = null, status = 200) {
  const calls = [];
  const client = { rpc(name, args) {
    const call = { name, args, retry: null, signal: null }; calls.push(call);
    return { retry(value) { call.retry = value; return this; }, abortSignal(value) { call.signal = value; return this; },
      then(resolve, reject) { return Promise.resolve({ data, error, status }).then(resolve, reject); } };
  } };
  return { api: new PrivateObjectSecurityApi(client), client, calls };
}

test('security status uses exact read-only RPC, current signal and no SDK retries', async () => {
  const { api, calls } = setup();
  const signal = new AbortController().signal;
  assert.deepEqual(await api.status(id(1), signal), snapshot());
  assert.deepEqual(calls, [{ name: 'private_object_security_status', args: { p_object_id: id(1) }, retry: false, signal }]);
});

test('report sends only object and displayed revision, with no body, actor, grants or clearance authority', async () => {
  const result = snapshot({ state: 'phi_suspected', security_revision: 1, visibility_restricted: true });
  const { api, calls } = setup(result);
  const signal = new AbortController().signal;
  assert.deepEqual(await api.report(id(1), 0, signal), result);
  assert.deepEqual(calls, [{ name: 'report_private_object_phi', args: { p_object_id: id(1), p_expected_revision: 0 }, retry: false, signal }]);
});

test('a report can confirm a restriction while scan stays pending or running', async () => {
  for (const result of [snapshot({ state: 'phi_suspected', visibility_restricted: true, security_revision: 1 }),
    snapshot({ state: 'phi_suspected', scan_state: 'running', scan_attempt_id: id(2), visibility_restricted: true, security_revision: 1 })]) {
    assert.deepEqual(await setup(result).api.report(id(1), 0), result);
    assert.deepEqual(await setup(result).api.report(id(1), 1), result, 'same-revision no-op acknowledgment is valid');
  }
});

test('all bounded server disposition states are supported without translating eligibility into release', async () => {
  const values = [snapshot({ state: 'not_finalized', verified_sha256: null }), snapshot(),
    snapshot({ state: 'scan_running', scan_state: 'running', scan_attempt_id: id(2) }),
    observed({ state: 'scan_failed', malware_outcome: 'error', phi_signal: 'not_checked', next_action: 'await_authorized_security_handling' }),
    observed({ state: 'malware_blocked', malware_outcome: 'blocked', phi_signal: 'not_checked', next_action: 'await_authorized_security_handling' }),
    observed({ state: 'phi_suspected', phi_signal: 'suspected', visibility_restricted: true, next_action: 'await_authorized_security_handling' }),
    observed({ state: 'rejected', clearance_decision_id: id(4), clearance_decision: 'rejected', next_action: 'await_authorized_security_handling' }),
    observed({ state: 'restricted', visibility_restricted: true, next_action: 'await_authorized_security_handling' }),
    eligible(), eligible({ preservation_hold: true, phi_signal: 'suspected' }), observed(),
    snapshot({ state: 'ingest_closed', ingest_closed: true })];
  for (const value of values) assert.deepEqual(await setup(value).api.status(id(1)), value);
});

test('redacted unavailable success, missing RPC and errors never become fabricated pending status', async () => {
  await assert.rejects(setup({ object_id: null, state: 'not_found_or_unavailable' }).api.status(id(1)), error => error.reason === 'unavailable');
  for (const [code, status, reason] of [['42501', 403, 'unavailable'], ['28000', 400, 'unauthenticated'],
    ['PGRST301', 401, 'unauthenticated'], ['40001', 409, 'conflict'], ['55000', 400, 'closed'], ['22023', 400, 'validation'],
    ['PGRST202', 404, 'backend'], ['42883', 404, 'backend'], ['PRIVATE internals', 503, 'backend']]) {
    await assert.rejects(setup(null, { code, message: 'PRIVATE backend payload' }, status).api.status(id(1)), error =>
      error instanceof PrivateObjectSecurityError && error.reason === reason && !error.message.includes('PRIVATE')
      && (reason !== 'unauthenticated' || error.code === 'session_expired'));
  }
});

test('invalid request IDs and unsafe revisions make no RPC', async () => {
  const { api, calls } = setup();
  for (const objectId of [null, '', '../path']) await assert.rejects(api.status(objectId));
  for (const revision of [-1, 0.5, NaN, Infinity, '0', Number.MAX_SAFE_INTEGER + 1]) await assert.rejects(api.report(id(1), revision), error => error.reason === 'validation');
  assert.equal(calls.length, 0);
});

test('malformed, wrong-object and contradictory security claims fail closed', async () => {
  for (const value of [null, [], {}, snapshot({ object_id: id(9) }), snapshot({ state: 'released' }),
    snapshot({ security_revision: -1 }), snapshot({ security_revision: '0' }), snapshot({ security_revision: Number.MAX_SAFE_INTEGER + 1 }),
    snapshot({ verified_sha256: null }), snapshot({ verified_sha256: 'bad' }), snapshot({ quarantined: false }),
    snapshot({ visibility_restricted: 'false' }), snapshot({ preservation_hold: null }), snapshot({ scan_attempt_id: id(2) }),
    snapshot({ scan_state: 'result' }), snapshot({ scan_state: ['pending'] }), snapshot({ malware_outcome: 'pass' }), snapshot({ phi_signal: 'cleared' }),
    snapshot({ clearance_decision: 'cleared_no_phi' }), snapshot({ next_action: 'release_document' }), snapshot({ next_action: ['await_authorized_security_handling'] }), snapshot({ next_action: 'await_separate_document_authority' }),
    eligible({ visibility_restricted: true }), eligible({ ingest_closed: true }), eligible({ malware_outcome: 'blocked' }),
    eligible({ clearance_decision_id: null }), eligible({ clearance_decision: 'rejected' }), eligible({ security_clearance_eligible: false })]) {
    await assert.rejects(setup(value).api.status(id(1)), error => error.reason === 'unexpected');
  }
});

test('report success needs actual narrowed response and exact revision progression', async () => {
  for (const value of [snapshot(), eligible(), snapshot({ visibility_restricted: true, security_revision: 4 }),
    snapshot({ visibility_restricted: true, ingest_closed: true, state: 'ingest_closed' }),
    observed({ visibility_restricted: true, clearance_decision_id: id(4), clearance_decision: 'rejected' })]) {
    await assert.rejects(setup(value).api.report(id(1), 0), error => error.reason === 'unexpected');
  }
});

test('security projection never exposes extra provider, content or release fields', async () => {
  assert.deepEqual(await setup({ ...eligible(), content: 'PRIVATE bytes', provider_path: 'PRIVATE path', release_approved: true }).api.status(id(1)), eligible());
});

test('aborted requests cannot send or publish a late security response', async () => {
  const { api, calls, client } = setup();
  const before = new AbortController(); before.abort();
  await assert.rejects(api.status(id(1), before.signal), { name: 'AbortError' });
  assert.equal(calls.length, 0);
  const during = new AbortController();
  client.rpc = () => ({ retry() { return this; }, abortSignal() { return this; },
    then(resolve, reject) { during.abort(); return Promise.resolve({ data: eligible(), error: null }).then(resolve, reject); } });
  await assert.rejects(api.status(id(1), during.signal), { name: 'AbortError' });
});
