import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

// Production adapter, simulated SDK responses. This is unit evidence only,
// never authentic Auth, gateway, Storage, quarantine, or tenancy acceptance.
const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const transpile = async name => ts.transpileModule(await readFile(new URL(`../../web/src/lib/${name}.ts`, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const errorsUrl = moduleUrl(await transpile('errors'));
const directoryUrl = moduleUrl((await transpile('directory-api'))
  .replace(/from\s+["']@supabase\/supabase-js["']/, `from '${import.meta.resolve('@supabase/supabase-js')}'`)
  .replace(/from\s+["']\.\/errors["']/, `from '${errorsUrl}'`));
const { PrivateObjectApi, PrivateObjectError, PRIVATE_OBJECT_MAX_BYTES } = await import(moduleUrl((await transpile('private-object-api'))
  .replace(/from\s+["']\.\/directory-api["']/, `from '${directoryUrl}'`)));
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const status = () => ({ objectId: id(3), state: 'reserved', stateRevision: 1, expiresAt: '2099-10-09T12:00:00Z', scanState: 'pending', clearanceState: 'pending', quarantined: true, failureCode: null, nextAction: 'upload' });
function setup(data = status(), error = null) {
  const calls = [];
  const client = { functions: { invoke: async (name, options) => { calls.push({ name, ...options }); return { data, error }; } } };
  return { api: new PrivateObjectApi(client), calls, client };
}

test('reserve sends only exact scoped wire fields and preserves supplied idempotency key', async () => {
  const { api, calls } = setup();
  const signal = new AbortController().signal;
  await api.reserve(id(1), id(2), id(4), 55, signal);
  await api.reserve(id(1), id(2), id(4), 55, signal);
  assert.deepEqual(calls[0], { name: 'private-objects', method: 'POST', body: { accountId: id(1), facilityId: id(2), idempotencyKey: id(4), byteSize: 55, mediaType: 'text/plain' }, headers: { 'Content-Type': 'application/json' }, signal });
  assert.deepEqual(calls[1], calls[0]);
});

test('bytes remain raw and finalization/status carry only the object and expected revision', async () => {
  const { api, calls } = setup();
  const bytes = new TextEncoder().encode('AuxiliumOS synthetic fixture\nUnit fixture').buffer;
  await api.upload(status(), bytes);
  await api.finalize({ ...status(), state: 'stored_unverified', stateRevision: 3 });
  await api.status(id(3));
  assert.equal(calls[0].name, `private-objects/${id(3)}/bytes`);
  assert.equal(calls[0].method, 'PUT');
  assert.equal(calls[0].body, bytes);
  assert.deepEqual(calls[0].headers, { 'Content-Type': 'text/plain', 'X-State-Revision': '1' });
  assert.equal(calls[1].name, `private-objects/${id(3)}/finalize`);
  assert.deepEqual(calls[1].body, { expectedStateRevision: 3 });
  assert.equal(calls[2].name, `private-objects/${id(3)}`);
  assert.equal(calls[2].method, 'GET');
  assert.equal(calls[2].body, undefined);
});

test('invalid scope, empty and oversized byte sizes fail before SDK invocation', async () => {
  const { api, calls } = setup();
  for (const n of [0, -1, 1.5, PRIVATE_OBJECT_MAX_BYTES + 1]) assert.throws(() => api.reserve(id(1), id(2), id(4), n), PrivateObjectError);
  for (const scope of [[null, id(2), id(4)], [id(1), '../secret', id(4)], [id(1), id(2), '']]) assert.throws(() => api.reserve(...scope, 100));
  assert.throws(() => api.upload(status(), new ArrayBuffer(0)), PrivateObjectError);
  assert.throws(() => api.upload(status(), new ArrayBuffer(PRIVATE_OBJECT_MAX_BYTES + 1)), PrivateObjectError);
  assert.throws(() => api.status('../path'));
  assert.equal(calls.length, 0);
});

test('safe response projection cannot carry provider paths, content or implicit authority into UI', async () => {
  const safe = status();
  const { api } = setup({ ...safe, storagePath: 'private/provider/path', filename: 'private.txt', content: 'private bytes', released: true });
  assert.deepEqual(await api.status(id(3)), safe);
});

test('malformed and non-quarantined successes are rejected instead of reported as finalized', async () => {
  for (const value of [null, [], {}, { ...status(), objectId: 'bad' }, { ...status(), state: 'released' },
    { ...status(), stateRevision: 0 }, { ...status(), stateRevision: 1.5 }, { ...status(), expiresAt: 'bad' },
    { ...status(), scanState: 'passed' }, { ...status(), clearanceState: 'approved' }, { ...status(), quarantined: false },
    { ...status(), nextAction: null }, { ...status(), failureCode: {} }]) {
    await assert.rejects(setup(value).api.status(id(3)));
  }
});

test('known conflict and access errors are bounded; unknown provider errors stay opaque', async () => {
  for (const code of ['conflict', 'unauthenticated', 'not_found_or_unavailable', 'transport_disabled', 'expired_or_unavailable', 'provider_unavailable']) {
    const error = { context: new Response(JSON.stringify({ error: code, message: 'PRIVATE provider detail' }), { status: 409 }) };
    await assert.rejects(setup(null, error).api.status(id(3)), failure => failure instanceof PrivateObjectError && failure.code === code && !failure.message.includes('PRIVATE'));
  }
  for (const context of [new Response(JSON.stringify({ error: 'PRIVATE provider detail' })), new Response('PRIVATE non-JSON error'), undefined]) {
    await assert.rejects(setup(null, { context, message: 'PRIVATE SDK detail' }).api.status(id(3)), failure => failure.code === 'backend_unavailable' && !failure.message.includes('PRIVATE'));
  }
});

test('cancellation prevents both outgoing requests and publication of late responses', async () => {
  const { api, calls, client } = setup();
  const before = new AbortController();
  before.abort();
  await assert.rejects(api.status(id(3), before.signal), { name: 'AbortError' });
  assert.equal(calls.length, 0);
  const during = new AbortController();
  client.functions.invoke = async () => { during.abort(); return { data: status(), error: null }; };
  await assert.rejects(api.status(id(3), during.signal), { name: 'AbortError' });
});
