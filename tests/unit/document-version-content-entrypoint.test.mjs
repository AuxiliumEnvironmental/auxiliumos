import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { createClient as realCreateClient } from '@supabase/supabase-js';
import { boundedBytes, createDocumentVersionContentGateway, MAX_BYTES, sha256, SYNTHETIC_PREFIX } from '../../supabase/functions/document-version-content/gateway.mjs';

// Real entrypoint + real gateway + installed pinned SDK, with the network/serve
// boundary injected. This is not hosted Deno, genuine Auth or provider evidence.
const source = await readFile(new URL('../../supabase/functions/document-version-content/index.ts', import.meta.url), 'utf8');
const runnable = ts.transpileModule(source.replace(/^import .*;\n/gm, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const canonical = 'https://txofqxictwecgcnvezlb.supabase.co';
function evaluate(overrides = {}, { fetch = async () => { throw Error('Unexpected test network access'); }, sdk = realCreateClient } = {}) {
  const env = { SUPABASE_URL: canonical, SUPABASE_ANON_KEY: 'test-public-key', SUPABASE_SERVICE_ROLE_KEY: 'test-server-secret', ...overrides };
  let config, handle;
  const clients = [];
  vm.runInNewContext(runnable, {
    Deno: { env: { get: key => env[key] }, serve: handler => { handle = handler; } },
    createDocumentVersionContentGateway: value => { config = value; return createDocumentVersionContentGateway(value); },
    createClient: (...args) => { clients.push(args); return sdk(...args); },
    URL, Request, Response, AbortController, setTimeout, clearTimeout, fetch, boundedBytes, MAX_BYTES,
  });
  return { config, handle, clients };
}
const versionId = '20000000-0000-4000-8000-000000000001';
const objectId = '20000000-0000-4000-8000-000000000002';
const authorizationId = '20000000-0000-4000-8000-000000000003';
const subjectId = '20000000-0000-4000-8000-000000000004';
const eventId = '20000000-0000-4000-8000-000000000005';
const bytes = new TextEncoder().encode(`${SYNTHETIC_PREFIX}SDK wire fixture only.\n`), digest = await sha256(bytes);
const objectKey = `${subjectId}/${subjectId}/${objectId}/payload`;
const binding = { authorization_id: authorizationId, version_id: versionId, object_id: objectId,
  verified_sha256: digest, byte_size: bytes.length, media_type: 'text/plain', bucket_id: 'os-private-ingest', object_key: objectKey };
const url = `${canonical}/functions/v1/document-version-content/${versionId}/content?sha256=${digest}`;
function wire(overrides = {}) {
  const state = { calls: [], authorizations: 0, ...overrides };
  const fetch = async (input, init = {}) => {
    const request = new Request(input, init), target = new URL(request.url), headers = Object.fromEntries(request.headers);
    const body = request.method === 'POST' ? await request.json() : null;
    state.calls.push({ path: target.pathname, method: request.method, headers, body });
    assert.equal(target.origin, canonical); assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store');
    assert.equal(target.search, '');
    if (target.pathname === '/auth/v1/user') {
      assert.equal(headers.apikey, 'test-public-key');
      return Response.json({ id: subjectId, is_anonymous: false, aud: 'authenticated', role: 'authenticated' });
    }
    if (target.pathname === '/rest/v1/rpc/authorize_document_version_content') {
      state.authorizations++; assert.equal(headers.apikey, 'test-public-key');
      if (state.authorizations === 2 && state.revoked) return Response.json({ code: '42501', message: 'not_found_or_unavailable' }, { status: 403 });
      return Response.json(binding);
    }
    assert.equal(headers.apikey, 'test-server-secret');
    assert.equal(headers.authorization, 'Bearer test-server-secret');
    if (target.pathname === `/storage/v1/object/os-private-ingest/${objectKey}`) {
      if (state.redirect) return new Response(null, { status: 302, headers: { Location: 'https://evil.test/secret' } });
      return new Response(state.oversized ? new Uint8Array(MAX_BYTES + 1) : bytes, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': '1' } });
    }
    if (target.pathname === '/rest/v1/rpc/record_document_content_result') {
      if (state.auditFailure) return Response.json({ code: '42501', message: 'SECRET provider message' }, { status: 403 });
      return Response.json({ result_id: eventId, authorization_id: body.p_authorization_id, outcome: body.p_outcome });
    }
    if (target.pathname === '/rest/v1/rpc/record_document_content_denial') {
      return Response.json({ denial_id: eventId, request_id: body.p_request_id, reason_code: body.p_reason_code });
    }
    assert.fail('Unexpected provider endpoint');
  };
  return { state, fetch };
}

test('exact auxiliumos-dev defaults remain bounded synthetic-only and independently DB-gated', () => {
  const { config } = evaluate(); assert.equal(config.enabled, true);
  assert.deepEqual(Array.from(config.allowedOrigins), ['http://127.0.0.1:4179', 'http://localhost:4179']);
  assert.match(source, /@supabase\/supabase-js@2\.117\.3/);
});
test('unknown targets, lookalikes, incomplete credentials and non-synthetic modes are disabled', () => {
  for (const target of ['', 'https://other.supabase.co', `${canonical}.example.test`, `${canonical}/`, canonical.replace('https:', 'http:')]) {
    assert.equal(evaluate({ SUPABASE_URL: target, DOCUMENT_CONTENT_TRANSPORT_MODE: 'synthetic-only' }).config.enabled, false);
  }
  for (const mode of ['', 'disabled', 'production', 'SYNTHETIC-ONLY']) assert.equal(evaluate({ DOCUMENT_CONTENT_TRANSPORT_MODE: mode }).config.enabled, false);
  for (const key of ['SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) assert.equal(evaluate({ [key]: '' }).config.enabled, false);
  assert.equal(evaluate({ SUPABASE_ANON_KEY: '', DOCUMENT_CONTENT_PUBLISHABLE_KEY: 'explicit-public' }).config.enabled, true);
});
test('origin overrides accept only exact local origins and never Lovable or wildcard patterns', () => {
  for (const origin of ['*', 'null', 'https://example.test:4179', 'https://preview.lovable.app', 'http://localhost', 'http://localhost:80',
    'http://localhost:4179/', 'http://user@localhost:4179', 'http://localhost:4179/path', 'http://localhost:4179?next=x', 'http://localhost:4179,']) {
    assert.equal(evaluate({ DOCUMENT_CONTENT_ALLOWED_ORIGINS: origin }).config.enabled, false, origin);
  }
  const f = evaluate({ DOCUMENT_CONTENT_ALLOWED_ORIGINS: ' http://localhost:4180 , https://127.0.0.1:4181 ' });
  assert.equal(f.config.enabled, true); assert.deepEqual(Array.from(f.config.allowedOrigins), ['http://localhost:4180', 'https://127.0.0.1:4181']);
  assert.deepEqual(Array.from(evaluate({ DOCUMENT_CONTENT_ALLOWED_ORIGINS: '' }).config.allowedOrigins), []);
});
test('local test stack requires explicit synthetic mode and opt-in, with no inherited origins', () => {
  for (const target of ['http://localhost:54321', 'http://127.0.0.1:54321', 'http://kong:8000']) {
    assert.equal(evaluate({ SUPABASE_URL: target }).config.enabled, false);
    assert.equal(evaluate({ SUPABASE_URL: target, DOCUMENT_CONTENT_ALLOW_LOCAL_TEST: 'true' }).config.enabled, false);
    const f = evaluate({ SUPABASE_URL: target, DOCUMENT_CONTENT_ALLOW_LOCAL_TEST: 'true', DOCUMENT_CONTENT_TRANSPORT_MODE: 'synthetic-only' });
    assert.equal(f.config.enabled, true); assert.deepEqual(Array.from(f.config.allowedOrigins), []);
  }
  for (const target of ['http://localhost:0', 'http://localhost:65536', 'http://localhost:54321/path', 'http://evil.test:54321']) {
    assert.equal(evaluate({ SUPABASE_URL: target, DOCUMENT_CONTENT_ALLOW_LOCAL_TEST: 'true', DOCUMENT_CONTENT_TRANSPORT_MODE: 'synthetic-only' }).config.enabled, false);
  }
});
test('per-request public+user credentials cannot mutate service Storage/audit clients', () => {
  const f = evaluate({}, { sdk: (...args) => args });
  f.config.createUserClient('first.token'); f.config.createServiceClient(); f.config.createUserClient('second.token');
  assert.equal(f.clients[0][1], 'test-public-key'); assert.equal(f.clients[0][2].global.headers.Authorization, 'Bearer first.token');
  assert.equal(f.clients[1][1], 'test-server-secret'); assert.equal(f.clients[1][2].global.headers, undefined);
  assert.equal(f.clients[2][2].global.headers.Authorization, 'Bearer second.token');
  for (const [, , options] of f.clients) for (const field of ['persistSession', 'autoRefreshToken', 'detectSessionInUrl']) assert.equal(options.auth[field], false);
});
test('actual entrypoint and pinned SDK wire all current human RPCs separately from Storage and audit credentials', async () => {
  const w = wire(), f = evaluate({}, { fetch: w.fetch });
  const response = await f.handle(new Request(url, { headers: { Authorization: 'Bearer first.user.token' } }));
  assert.equal(response.status, 200); assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  assert.deepEqual(w.state.calls.map(c => c.path), ['/auth/v1/user', '/rest/v1/rpc/authorize_document_version_content',
    `/storage/v1/object/os-private-ingest/${objectKey}`, '/rest/v1/rpc/authorize_document_version_content', '/rest/v1/rpc/record_document_content_result']);
  for (const i of [0, 1, 3]) assert.equal(w.state.calls[i].headers.authorization, 'Bearer first.user.token');
  assert.deepEqual(w.state.calls[1].body, w.state.calls[3].body);
  assert.equal(w.state.calls[4].body.p_outcome, 'response_prepared');
  assert.equal(JSON.stringify([...response.headers]).includes('test-server-secret'), false);
  const second = await f.handle(new Request(url, { headers: { Authorization: 'Bearer second.user.token' } }));
  assert.equal(second.status, 200);
  for (const i of [5, 6, 8]) assert.equal(w.state.calls[i].headers.authorization, 'Bearer second.user.token');
  assert.notEqual(w.state.calls[1].body.p_request_id, w.state.calls[6].body.p_request_id);
});
test('SDK wire revocation and audit errors block response bytes and never expose service errors', async () => {
  for (const override of [{ revoked: true }, { auditFailure: true }]) {
    const w = wire(override), f = evaluate({}, { fetch: w.fetch });
    const response = await f.handle(new Request(url, { headers: { Authorization: 'Bearer current.user.token' } }));
    assert.equal(response.status, override.revoked ? 404 : 503);
    const body = await response.text(); for (const secret of ['test-server-secret', 'SECRET', objectKey, SYNTHETIC_PREFIX]) assert.equal(body.includes(secret), false);
    assert.equal(w.state.calls.at(-1).body.p_outcome, override.revoked ? 'access_changed' : 'response_prepared');
  }
});
test('provider redirects and >64KiB bytes fail before SDK Blob decode even with false content-length', async () => {
  for (const override of [{ redirect: true }, { oversized: true }]) {
    const w = wire(override), f = evaluate({}, { fetch: w.fetch });
    const response = await f.handle(new Request(url, { headers: { Authorization: 'Bearer current.user.token' } }));
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'backend_unavailable' });
    assert.equal(w.state.authorizations, 1); assert.equal(w.state.calls.at(-1).body.p_outcome, 'provider_failure');
  }
});
test('bounded fetch rejects foreign destinations before forwarding any credential', async () => {
  let calls = 0;
  const f = evaluate({}, { sdk: (...args) => args, fetch: async () => { calls++; return Response.json({}); } });
  f.config.createServiceClient(); const boundedFetch = f.clients[0][2].global.fetch;
  for (const target of ['https://evil.test/storage/v1/object/secret', `${canonical}.evil.test/auth/v1/user`, canonical.replace('https://', 'https://user@')]) {
    await assert.rejects(boundedFetch(target, { headers: { Authorization: 'Bearer test-server-secret' } }), /backend_unavailable/);
  }
  assert.equal(calls, 0);
});
test('bounded fetch caps error/JSON bodies and propagates an already-aborted Request signal', async () => {
  let canceled = false;
  const f = evaluate({}, { sdk: (...args) => args, fetch: async (_input, init) => {
    assert.equal(init.redirect, 'error');
    return new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(131_073)); }, cancel() { canceled = true; } }), { status: 500 });
  } });
  f.config.createUserClient('user.token'); const boundedFetch = f.clients[0][2].global.fetch;
  await assert.rejects(boundedFetch(`${canonical}/rest/v1/rpc/authorize_document_version_content`), /backend_unavailable/);
  assert.equal(canceled, true);
  const g = evaluate({}, { sdk: (...args) => args, fetch: async (_input, init) => { assert.equal(init.signal.aborted, true); throw Error('aborted'); } });
  g.config.createUserClient('user.token');
  const controller = new AbortController(); controller.abort();
  await assert.rejects(g.clients[0][2].global.fetch(new Request(`${canonical}/auth/v1/user`, { signal: controller.signal })), /aborted/);
});
