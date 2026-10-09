import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

// Injected Auth/HTTP adapters exercise production byte validation, not genuine
// Supabase Auth, current grants, gateway audit, provider storage or release.
const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const transpile = async name => ts.transpileModule(await readFile(new URL(`../../web/src/lib/${name}.ts`, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const errorsUrl = moduleUrl(await transpile('errors'));
const { DocumentContentApi, DocumentContentError } = await import(moduleUrl((await transpile('document-content-api'))
  .replace(/from\s+["']\.\/errors["']/, `from '${errorsUrl}'`)));
const id = '00000000-0000-4000-8000-000000000030';
const bytes = Buffer.from('AuxiliumOS synthetic fixture\nExact UTF-8 café\r\n<script>untrusted data</script>');
const sha = value => createHash('sha256').update(value).digest('hex');
const request = (changes = {}) => ({ versionId: id, verifiedSha256: sha(bytes), byteSize: bytes.length, mediaType: 'text/plain', ...changes });
const filename = `document-version-${id}.txt`;
const headers = () => ({ 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': String(bytes.length),
  'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': `attachment; filename="${filename}"` });
const reply = (changes = {}, body = bytes) => new Response(body, { status: 200, headers: { ...headers(), ...changes } });
const config = { url: 'https://txofqxictwecgcnvezlb.supabase.co', publishableKey: 'sb_publishable_synthetic_unit', localTestBackend: false };
const session = () => ({ data: { session: { access_token: 'synthetic-user-jwt', user: { is_anonymous: false } } }, error: null });
function setup(response = reply()) {
  const calls = [];
  const client = { auth: { getSession: async () => session() } };
  const transport = async (...args) => { calls.push(args); return response; };
  return { api: new DocumentContentApi(client, config, transport), client, calls };
}

test('exact version/digest GET uses only current user bearer and public apikey; preserves exact binary bytes', async () => {
  const { api, calls } = setup();
  const result = await api.download(request());
  assert.equal(result.filename, filename);
  assert.deepEqual(Buffer.from(result.bytes), bytes);
  assert.equal(sha(Buffer.from(result.bytes)), request().verifiedSha256);
  const [url, options] = calls[0];
  assert.equal(url, `${config.url}/functions/v1/document-version-content/${id}/content?sha256=${sha(bytes)}`);
  assert.deepEqual(options.headers, { Authorization: 'Bearer synthetic-user-jwt', apikey: config.publishableKey, Accept: 'text/plain' });
  assert.equal(options.method, 'GET'); assert.equal(options.body, undefined);
  assert.equal(options.cache, 'no-store'); assert.equal(options.redirect, 'error');
  assert.equal(options.credentials, 'omit'); assert.equal(options.referrerPolicy, 'no-referrer');
  assert.ok(options.signal instanceof AbortSignal);
});

test('invalid version, digest, exact size or media is rejected before requesting credentials or HTTP', async () => {
  const { api, client, calls } = setup();
  let authCalls = 0; client.auth.getSession = async () => { authCalls++; return session(); };
  for (const changes of [{ versionId: '../path' }, { versionId: null }, { versionId: [id] }, { verifiedSha256: [sha(bytes)] }, { verifiedSha256: 'A'.repeat(64) },
    { verifiedSha256: 'a'.repeat(63) }, { byteSize: 0 }, { byteSize: 65_537 }, { byteSize: 1.5 },
    { byteSize: '10' }, { mediaType: 'text/html' }]) {
    await assert.rejects(api.download(request(changes)), error => error.reason === 'invalid_request');
  }
  assert.equal(authCalls, 0); assert.equal(calls.length, 0);
});

test('missing, expired or anonymous local session never starts content HTTP', async () => {
  for (const value of [{ data: { session: null }, error: null }, { data: { session: null }, error: { message: 'PRIVATE auth failure' } },
    { data: { session: { access_token: 'synthetic', user: { is_anonymous: true } } }, error: null }]) {
    const { api, client, calls } = setup(); client.auth.getSession = async () => value;
    await assert.rejects(api.download(request()), error => error.reason === 'unauthenticated' && error.code === 'session_expired');
    assert.equal(calls.length, 0);
  }
});

test('status-only bounded errors do not consume or expose provider error bodies', async () => {
  for (const [status, reason] of [[401, 'unauthenticated'], [404, 'unavailable'], [403, 'unavailable'], [400, 'invalid_request'],
    [409, 'conflict'], [503, 'backend'], [500, 'backend'], [206, 'backend']]) {
    const response = new Response('PRIVATE provider error, key and token', { status });
    let canceled = false;
    response.body.cancel = async () => { canceled = true; };
    response.json = response.text = async () => { throw new Error('Must not parse body'); };
    await assert.rejects(setup(response).api.download(request()), error => error instanceof DocumentContentError
      && error.reason === reason && !error.message.includes('PRIVATE'));
    assert.equal(canceled, true);
  }
});

test('unexpected media, cache, disposition, filename, sniffing or length headers cannot start a handoff', async () => {
  for (const changes of [{ 'Content-Type': 'text/html' }, { 'Content-Type': 'text/plain' }, { 'Content-Type': 'text/plain;charset=iso-8859-1' },
    { 'Cache-Control': 'public,max-age=60' }, { 'Cache-Control': 'x-no-store' }, { 'X-Content-Type-Options': '' },
    { 'Content-Disposition': `inline; filename="${filename}"` }, { 'Content-Disposition': 'attachment; filename="../../secret.txt"' },
    { 'Content-Disposition': 'attachment; filename="document-version-00000000-0000-4000-8000-000000000031.txt"' },
    { 'Content-Length': '0' }, { 'Content-Length': '65537' }, { 'Content-Length': String(bytes.length + 1) },
    { 'Content-Length': '1e2' }]) {
    await assert.rejects(setup(reply(changes)).api.download(request()), error => error.reason === 'invalid_response');
  }
});

test('actual bytes must equal expected size and SHA-256 even when headers claim success', async () => {
  for (const value of [Buffer.alloc(0), bytes.subarray(1), Buffer.concat([bytes, Buffer.from('x')]), Buffer.alloc(bytes.length, 'x')]) {
    await assert.rejects(setup(reply({}, value)).api.download(request()), error => error.reason === 'invalid_response');
  }
  const response = reply(); response.headers.delete('Content-Length');
  assert.deepEqual(Buffer.from((await setup(response).api.download(request())).bytes), bytes, 'stream count remains authoritative if HTTP length is unavailable');
});

test('bounded streaming rejects an oversized chunk and cancels its source without reading the tail', async () => {
  let canceled = false, pulls = 0;
  const stream = new ReadableStream({ pull(controller) { pulls++; controller.enqueue(new Uint8Array(65_537)); }, cancel() { canceled = true; } }, { highWaterMark: 0 });
  await assert.rejects(setup(reply({}, stream)).api.download(request()), error => error.reason === 'invalid_response');
  assert.equal(canceled, true); assert.equal(pulls, 1);
});

test('streamed split UTF-8 sequences, minimum and maximum byte lengths preserve the exact digest', async () => {
  for (const content of [Buffer.from('x'), bytes, Buffer.alloc(65_536, 'x')]) {
    let offset = 0;
    const stream = new ReadableStream({ pull(controller) {
      if (offset === content.length) return controller.close();
      const end = Math.min(offset + 7, content.length); controller.enqueue(content.subarray(offset, end)); offset = end;
    } });
    const response = reply({ 'Content-Length': String(content.length) }, stream);
    const result = await setup(response).api.download(request({ byteSize: content.length, verifiedSha256: sha(content) }));
    assert.deepEqual(Buffer.from(result.bytes), content);
  }
});

test('a pending caller cannot retarget version/digest/size while local session loads', async () => {
  const input = request(); const { api, client, calls } = setup();
  client.auth.getSession = async () => { Object.assign(input, request({ versionId: 'other', verifiedSha256: 'b'.repeat(64), byteSize: 1 })); return session(); };
  assert.deepEqual(Buffer.from((await api.download(input)).bytes), bytes);
  assert.equal(calls[0][0], `${config.url}/functions/v1/document-version-content/${id}/content?sha256=${sha(bytes)}`);
});

test('pre-abort and cancellation during credential loading cause no content HTTP or late bytes', async () => {
  const { api, client, calls } = setup();
  const before = new AbortController(); before.abort();
  await assert.rejects(api.download(request(), before.signal), { name: 'AbortError' });
  let resolveSession;
  client.auth.getSession = () => new Promise(resolve => { resolveSession = resolve; });
  const current = new AbortController(); const pending = api.download(request(), current.signal);
  current.abort(); await assert.rejects(pending, { name: 'AbortError' });
  resolveSession(session()); await Promise.resolve();
  assert.equal(calls.length, 0);
});

test('late HTTP after abort is discarded and its body canceled even if the transport ignores AbortSignal', async () => {
  let resolveResponse, reached;
  const arrived = new Promise(resolve => { reached = resolve; });
  const client = { auth: { getSession: async () => session() } };
  const api = new DocumentContentApi(client, config, () => { reached(); return new Promise(resolve => { resolveResponse = resolve; }); });
  const current = new AbortController(), pending = api.download(request(), current.signal);
  await arrived; current.abort();
  const response = reply(); let canceled = false; response.body.cancel = async () => { canceled = true; };
  resolveResponse(response); await assert.rejects(pending, { name: 'AbortError' }); assert.equal(canceled, true);
});

test('abort while reading a stalled stream cancels it and does not return partially verified content', async () => {
  let reached, canceled = false;
  const arrived = new Promise(resolve => { reached = resolve; });
  const response = reply({}, new ReadableStream({ pull() { reached(); }, cancel() { canceled = true; } }, { highWaterMark: 0 }));
  const current = new AbortController(), pending = setup(response).api.download(request(), current.signal);
  await arrived; current.abort(); await assert.rejects(pending, { name: 'AbortError' }); assert.equal(canceled, true);
});

test('network and local SDK failures are safe and retryable without exposing raw reasons', async () => {
  const { client } = setup();
  const api = new DocumentContentApi(client, config, async () => { throw new TypeError('PRIVATE network detail'); });
  await assert.rejects(api.download(request()), error => error.reason === 'network' && error.retryable && !error.message.includes('PRIVATE'));
  client.auth.getSession = async () => { throw new Error('PRIVATE SDK detail'); };
  await assert.rejects(api.download(request()), error => error.reason === 'network' && !error.message.includes('PRIVATE'));
});
