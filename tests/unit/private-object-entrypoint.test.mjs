import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { createPrivateObjectGateway } from '../../supabase/functions/private-objects/gateway.mjs';

// Execute the real entrypoint after TypeScript erasure with injected SDK/serve
// boundaries. This is configuration evidence, not a Deno/provider execution.
const source = await readFile(new URL('../../supabase/functions/private-objects/index.ts', import.meta.url), 'utf8');
const runnable = ts.transpileModule(source.replace(/^import .*;\n/gm, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const canonical = 'https://txofqxictwecgcnvezlb.supabase.co';
const editorOrigin = 'https://id-preview--0b7bbfc6-627f-4ca0-9217-98f5b164b419.lovable.app';
function evaluate(overrides = {}) {
  const env = { SUPABASE_URL: canonical, SUPABASE_ANON_KEY: 'test-public', SUPABASE_SERVICE_ROLE_KEY: 'test-server', ...overrides };
  let config;
  const clients = [];
  vm.runInNewContext(runnable, {
    Deno: { env: { get: (key) => env[key] }, serve: (handler) => assert.equal(handler, 'test-handler') },
    createPrivateObjectGateway: (value) => { config = value; return 'test-handler'; },
    createClient: (...args) => { clients.push(args); return args; },
    URL, Request, Response, AbortController, setTimeout, clearTimeout,
    boundedBytes: () => { throw new Error('Provider I/O not expected'); }, MAX_BYTES: 65536,
  });
  return { config, clients };
}

test('exact development target has bounded synthetic defaults', () => {
  const { config } = evaluate();
  assert.equal(config.enabled, true);
  assert.deepEqual(Array.from(config.allowedOrigins), ['http://127.0.0.1:4179', 'http://localhost:4179', editorOrigin]);
});
test('mode overrides disable rather than silently enable', () => {
  for (const mode of ['', 'disabled', 'production', 'SYNTHETIC-ONLY']) {
    assert.equal(evaluate({ PRIVATE_OBJECT_TRANSPORT_MODE: mode }).config.enabled, false);
  }
});
test('unknown targets, incomplete credentials and lookalike hosts remain disabled', () => {
  for (const url of ['', 'https://other.supabase.co', canonical + '.example.test', canonical + '/', 'http://txofqxictwecgcnvezlb.supabase.co']) {
    assert.equal(evaluate({ SUPABASE_URL: url, PRIVATE_OBJECT_TRANSPORT_MODE: 'synthetic-only' }).config.enabled, false);
  }
  for (const key of ['SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) assert.equal(evaluate({ [key]: '' }).config.enabled, false);
});
test('explicit origins replace defaults and an empty value clears CORS access', () => {
  const { config } = evaluate({ PRIVATE_OBJECT_ALLOWED_ORIGINS: ' http://localhost:4180 , https://127.0.0.1:4181 ' });
  assert.equal(config.enabled, true);
  assert.deepEqual(Array.from(config.allowedOrigins), ['http://localhost:4180', 'https://127.0.0.1:4181']);
  assert.deepEqual(Array.from(evaluate({ PRIVATE_OBJECT_ALLOWED_ORIGINS: '' }).config.allowedOrigins), []);
});
test('invalid or unrecognized origins disable the transport', () => {
  for (const origin of ['*', 'null', 'https://example.com:4179', 'http://localhost', 'http://localhost:80', 'http://localhost:4179/', 'http://user@localhost:4179', 'ftp://localhost:4179', 'http://localhost:4179/path', 'http://localhost:4179,']) {
    assert.equal(evaluate({ PRIVATE_OBJECT_ALLOWED_ORIGINS: origin }).config.enabled, false, origin);
  }
});
test('only the exact existing editor origin is permitted, exclusively on the intended development backend', async () => {
  assert.equal(evaluate({ PRIVATE_OBJECT_ALLOWED_ORIGINS: editorOrigin }).config.enabled, true);
  for (const origin of [editorOrigin + '/', editorOrigin + '.evil.test', editorOrigin + ':444', editorOrigin.replace('https:', 'http:'),
    editorOrigin.replace('0b7bbfc6', '0b7bbfc7'), 'https://lovable.dev', 'https://other.lovable.app', 'https://*.lovable.app',
    editorOrigin.replace('https://', 'https://user@')]) {
    assert.equal(evaluate({ PRIVATE_OBJECT_ALLOWED_ORIGINS: origin }).config.enabled, false, origin);
  }
  assert.equal(evaluate({ SUPABASE_URL: 'http://localhost:54321', PRIVATE_OBJECT_ALLOW_LOCAL_TEST: 'true',
    PRIVATE_OBJECT_TRANSPORT_MODE: 'synthetic-only', PRIVATE_OBJECT_ALLOWED_ORIGINS: editorOrigin }).config.enabled, false);
  const { config } = evaluate();
  const noBackend = () => { throw Error('Preflight must not authenticate, provision, or access storage'); };
  const handler = createPrivateObjectGateway({ ...config, createUserClient: noBackend, createServiceClient: noBackend });
  const response = await handler(new Request(`${canonical}/functions/v1/private-objects`, { method: 'OPTIONS', headers: { Origin: editorOrigin } }));
  assert.equal(response.status, 204); assert.equal(response.headers.get('Access-Control-Allow-Origin'), editorOrigin);
  assert.equal(response.headers.get('Access-Control-Allow-Credentials'), null);
});
test('local stack is opt-in with explicit synthetic mode and no inherited CORS defaults', () => {
  for (const target of ['http://localhost:54321', 'http://127.0.0.1:54321', 'http://kong:8000']) {
    assert.equal(evaluate({ SUPABASE_URL: target }).config.enabled, false);
    assert.equal(evaluate({ SUPABASE_URL: target, PRIVATE_OBJECT_ALLOW_LOCAL_TEST: 'true' }).config.enabled, false);
    const { config } = evaluate({ SUPABASE_URL: target, PRIVATE_OBJECT_ALLOW_LOCAL_TEST: 'true', PRIVATE_OBJECT_TRANSPORT_MODE: 'synthetic-only' });
    assert.equal(config.enabled, true);
    assert.deepEqual(Array.from(config.allowedOrigins), []);
  }
  for (const target of ['http://localhost:0', 'http://localhost:65536', 'http://localhost:54321/path', 'http://evil.test:54321']) {
    assert.equal(evaluate({ SUPABASE_URL: target, PRIVATE_OBJECT_ALLOW_LOCAL_TEST: 'true', PRIVATE_OBJECT_TRANSPORT_MODE: 'synthetic-only' }).config.enabled, false);
  }
});
test('per-request user credentials never contaminate privileged Storage client', () => {
  const { config, clients } = evaluate();
  config.createUserClient('caller-one');
  config.createServiceClient();
  config.createUserClient('caller-two');
  assert.equal(clients[0][1], 'test-public');
  assert.equal(clients[0][2].global.headers.Authorization, 'Bearer caller-one');
  assert.equal(clients[1][1], 'test-server');
  assert.equal(clients[1][2].global.headers, undefined);
  assert.equal(clients[2][2].global.headers.Authorization, 'Bearer caller-two');
  assert.equal(clients[0][2].global.headers.Authorization, 'Bearer caller-one');
  for (const [, , options] of clients) assert.equal(options.auth.persistSession, false);
});
