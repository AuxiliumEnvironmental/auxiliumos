import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

// Production adapter, simulated SDK replies only. No hosted Auth, grants, RLS,
// actual immutable bytes, scanner/human clearance or release is proved here.
const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const transpile = async name => ts.transpileModule(await readFile(new URL(`../../web/src/lib/${name}.ts`, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const errorsUrl = moduleUrl(await transpile('errors'));
const directoryUrl = moduleUrl((await transpile('directory-api'))
  .replace(/from\s+["']@supabase\/supabase-js["']/, `from '${import.meta.resolve('@supabase/supabase-js')}'`)
  .replace(/from\s+["']\.\/errors["']/, `from '${errorsUrl}'`));
const { DocumentVersionApi, DocumentVersionError } = await import(moduleUrl((await transpile('document-version-api'))
  .replace(/from\s+["']\.\/directory-api["']/, `from '${directoryUrl}'`)
  .replace(/from\s+["']\.\/errors["']/, `from '${errorsUrl}'`)));
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const document = (changes = {}) => ({ document_id: id(10), account_id: id(1), facility_id: id(2), title: 'Synthetic logical document',
  document_class: 'internal_note', document_revision: 4, can_create_version: true, ...changes });
const version = (changes = {}) => ({ version_id: id(30), version_ordinal: 1, object_id: id(20), verified_sha256: 'a'.repeat(64),
  byte_size: 45, media_type: 'text/plain', lifecycle_state: 'internal_draft', created_at: '2026-10-09T12:00:00.123456+00:00',
  preservation_hold_at_adoption: true, ...changes });
const request = (changes = {}) => ({ objectId: id(20), documentId: id(10), verifiedSha256: 'a'.repeat(64),
  documentRevision: 4, securityRevision: 3, requestId: id(40), ...changes });
const receipt = (changes = {}) => ({ ...version(), document_id: id(10), document_revision: 5, security_revision: 4, ...changes });
const history = (changes = {}) => ({ document_id: id(10), state: 'available', document_revision: 5,
  items: [{ ...version(), preservation_hold: false, visibility_restricted: true }], next_cursor: null, ...changes });
function setup(data, error = null, status = 200) {
  const calls = [];
  const client = { rpc(name, args) {
    const call = { name, args, retry: null, signal: null }; calls.push(call);
    return { retry(value) { call.retry = value; return this; }, abortSignal(value) { call.signal = value; return this; },
      then(resolve, reject) { return Promise.resolve({ data, error, status }).then(resolve, reject); } };
  } };
  return { api: new DocumentVersionApi(client), calls, client };
}

test('exact scoped list and ordinal history RPCs use bounded cursor arguments, abort signal and no SDK retries', async () => {
  const signal = new AbortController().signal;
  const docs = { items: [document()], next_cursor: id(10) };
  const list = setup(docs);
  assert.deepEqual(await list.api.documents(id(1), id(9), signal, 1), docs);
  assert.deepEqual(list.calls, [{ name: 'list_version_documents', args: { p_account_id: id(1), p_after_id: id(9), p_limit: 1 }, retry: false, signal }]);
  const value = history({ next_cursor: 1 });
  const versions = setup(value);
  assert.deepEqual(await versions.api.versions(id(10), 0, signal, 1), value);
  assert.deepEqual(versions.calls, [{ name: 'list_document_versions', args: { p_document_id: id(10), p_after_ordinal: 0, p_limit: 1 }, retry: false, signal }]);
});

test('adoption sends only frozen exact references, digest, both revisions and idempotency request ID', async () => {
  const { api, calls } = setup(receipt());
  const signal = new AbortController().signal;
  assert.deepEqual(await api.adopt(request(), signal), receipt());
  assert.deepEqual(calls, [{ name: 'adopt_private_object', args: { p_object_id: id(20), p_expected_sha256: 'a'.repeat(64), p_document_id: id(10),
    p_expected_security_revision: 3, p_expected_document_revision: 4, p_request_id: id(40) }, retry: false, signal }]);
  await api.adopt(request(), signal);
  assert.deepEqual(calls[0], calls[1], 'exact replay carries no newly generated actor, time, grant or request ID');
});

test('receipt projection excludes live flags and provider extras; history retains separate current flags', async () => {
  assert.deepEqual(await setup({ ...receipt(), preservation_hold: false, visibility_restricted: false,
    release_approved: true, content: 'PRIVATE bytes' }).api.adopt(request()), receipt());
  const value = history();
  value.items[0].storage_path = 'PRIVATE path';
  assert.deepEqual(await setup(value).api.versions(id(10)), history());
  assert.deepEqual(await setup({ items: [{ ...document(), release_state: 'client_visible_released', version_label: 'latest', is_admin: true }], next_cursor: null }).api.documents(id(1)),
    { items: [document()], next_cursor: null });
});

test('SDK, missing-RPC, conflict and access errors have safe distinct meanings without leaking SQL', async () => {
  for (const [code, status, reason] of [['40001', 409, 'conflict'], ['23505', 409, 'request_conflict'], ['42501', 403, 'unavailable'],
    ['55000', 400, 'source_unavailable'], ['22023', 400, 'validation'], ['28000', 400, 'unauthenticated'], ['PGRST301', 401, 'unauthenticated'],
    ['PGRST202', 404, 'backend'], ['42883', 404, 'backend'], ['XX000', 503, 'backend']]) {
    await assert.rejects(setup(null, { code, message: 'PRIVATE SQL details' }, status).api.adopt(request()), error =>
      error instanceof DocumentVersionError && error.reason === reason && !error.message.includes('PRIVATE')
      && (reason !== 'unauthenticated' || error.code === 'session_expired'));
  }
  await assert.rejects(setup({ document_id: null, state: 'not_found_or_unavailable', items: [], next_cursor: null }).api.versions(id(10)), error => error.reason === 'unavailable');
  assert.deepEqual(await setup({ items: [], next_cursor: null }).api.documents(id(1)), { items: [], next_cursor: null });
  assert.deepEqual(await setup(history({ items: [] })).api.versions(id(10)), history({ items: [] }));
});

test('invalid identifiers, unsafe revisions, digests and page bounds cause no RPC', async () => {
  const { api, calls } = setup(receipt());
  for (const bad of ['', '../path', null]) {
    await assert.rejects(api.documents(bad));
    if (bad !== null) await assert.rejects(api.documents(id(1), bad));
    await assert.rejects(api.versions(bad)); await assert.rejects(api.adopt(request({ requestId: bad })));
    await assert.rejects(api.adopt(request({ documentId: bad }))); await assert.rejects(api.adopt(request({ objectId: bad })));
  }
  for (const bad of [-1, 0.5, '1', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(api.versions(id(10), bad));
    await assert.rejects(api.adopt(request({ documentRevision: bad })));
    await assert.rejects(api.adopt(request({ securityRevision: bad })));
  }
  for (const bad of [null, '', 'A'.repeat(64), 'a'.repeat(63), 'a'.repeat(65)]) await assert.rejects(api.adopt(request({ verifiedSha256: bad })));
  for (const bad of [0, -1, 101, 1.5, '25']) {
    await assert.rejects(api.documents(id(1), null, undefined, bad)); await assert.rejects(api.versions(id(10), 0, undefined, bad));
  }
  await assert.rejects(api.adopt(request({ securityRevision: Number.MAX_SAFE_INTEGER })));
  await assert.rejects(api.adopt(request({ documentRevision: Number.MAX_SAFE_INTEGER })));
  assert.equal(calls.length, 0);
});

test('document lists reject wrong account, unbounded fields, malformed scalars and nonprogressing cursors', async () => {
  for (const row of [document({ account_id: id(9) }), document({ facility_id: null }), document({ title: ' '.repeat(5) }),
    document({ title: 'x'.repeat(251) }), document({ document_class: 'x'.repeat(101) }), document({ can_create_version: 'true' }),
    document({ document_revision: '4' }), document({ document_revision: Number.MAX_SAFE_INTEGER + 1 })]) {
    await assert.rejects(setup({ items: [row], next_cursor: null }).api.documents(id(1)), error => error.reason === 'unexpected');
  }
  for (const value of [null, [], {}, { items: {}, next_cursor: null }, { items: [document(), document()], next_cursor: null },
    { items: [document()], next_cursor: id(9) }, { items: [], next_cursor: id(10) }]) {
    await assert.rejects(setup(value).api.documents(id(1)), error => error.reason === 'unexpected');
  }
  await assert.rejects(setup({ items: [document()], next_cursor: null }).api.documents(id(1), id(10)), error => error.reason === 'unexpected');
  await assert.rejects(setup({ items: Array.from({ length: 26 }, (_, i) => document({ document_id: id(10 + i) })), next_cursor: null }).api.documents(id(1)), error => error.reason === 'unexpected');
});

test('history accepts only bounded immutable drafts, independent boolean flags and ascending unique exact versions', async () => {
  for (const changes of [{ version_id: '../path' }, { object_id: null }, { version_ordinal: 0 }, { version_ordinal: '1' },
    { verified_sha256: 'bad' }, { byte_size: 0 }, { byte_size: 65_537 }, { media_type: 'text/html' }, { lifecycle_state: 'released' },
    { preservation_hold_at_adoption: 'true' }, { preservation_hold: null }, { visibility_restricted: 'false' }, { created_at: 'PRIVATE invalid date' }]) {
    await assert.rejects(setup(history({ items: [{ ...history().items[0], ...changes }] })).api.versions(id(10)), error => error.reason === 'unexpected');
  }
  for (const value of [history({ document_id: id(11) }), history({ state: 'released' }), history({ document_revision: null }),
    history({ next_cursor: 2 }), history({ items: [...history().items, ...history().items] })]) {
    await assert.rejects(setup(value).api.versions(id(10)), error => error.reason === 'unexpected');
  }
  await assert.rejects(setup(history()).api.versions(id(10), 1), error => error.reason === 'unexpected');
});

test('adoption receipts must match exact object, digest, document and both revision increments', async () => {
  for (const changes of [{ document_id: id(11) }, { object_id: id(21) }, { verified_sha256: 'b'.repeat(64) },
    { document_revision: 4 }, { security_revision: 3 }, { security_revision: '4' }, { lifecycle_state: 'released' }]) {
    await assert.rejects(setup(receipt(changes)).api.adopt(request()), error => error.reason === 'unexpected');
  }
});

test('mutating a caller request while awaiting the SDK cannot alter the response binding', async () => {
  const input = request();
  const { api, client } = setup(receipt());
  client.rpc = () => ({ retry() { return this; }, then(resolve) { input.objectId = id(99); input.documentRevision = 99;
    return Promise.resolve({ data: receipt(), error: null }).then(resolve); } });
  assert.deepEqual(await api.adopt(input), receipt());
});

test('canceled requests do not dispatch or publish late document metadata or adoption receipts', async () => {
  const before = new AbortController(); before.abort();
  const { api, calls } = setup(receipt());
  await assert.rejects(api.documents(id(1), null, before.signal), { name: 'AbortError' });
  await assert.rejects(api.versions(id(10), 0, before.signal), { name: 'AbortError' });
  await assert.rejects(api.adopt(request(), before.signal), { name: 'AbortError' });
  assert.equal(calls.length, 0);
  const during = new AbortController();
  const late = setup(receipt());
  late.client.rpc = () => ({ retry() { return this; }, abortSignal() { return this; }, then(resolve) {
    during.abort(); return Promise.resolve({ data: receipt(), error: null }).then(resolve); } });
  await assert.rejects(late.api.adopt(request(), during.signal), { name: 'AbortError' });
});
