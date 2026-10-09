import assert from 'node:assert/strict';
import test from 'node:test';
import { boundedBytes, createDocumentVersionContentGateway, MAX_BYTES, sha256, SYNTHETIC_PREFIX } from '../../supabase/functions/document-version-content/gateway.mjs';

// Injected adapters exercise the real handler, not real Auth/SQL/Storage.
const versionId = '10000000-0000-4000-8000-000000000001';
const objectId = '10000000-0000-4000-8000-000000000002';
const authorizationId = '10000000-0000-4000-8000-000000000003';
const subjectId = '10000000-0000-4000-8000-000000000004';
const otherId = '10000000-0000-4000-8000-000000000005';
const eventId = '10000000-0000-4000-8000-000000000006';
const text = `${SYNTHETIC_PREFIX}Exact immutable internal draft. No real data.\n`;
const bytes = new TextEncoder().encode(text), digest = await sha256(bytes);
const objectKey = `${otherId}/${otherId}/${objectId}/payload`;
const canonicalBinding = { authorization_id: authorizationId, version_id: versionId, object_id: objectId,
  verified_sha256: digest, byte_size: bytes.length, media_type: 'text/plain', bucket_id: 'os-private-ingest', object_key: objectKey };
const ok = data => ({ data, error: null });
const failure = (code = '42501', message = 'not_found_or_unavailable') => ({ data: null, error: { code, message, details: 'SECRET raw provider path and token' } });
const origin = 'http://localhost:4179';
const requestUrl = `https://edge.test/functions/v1/document-version-content/${versionId}/content?sha256=${digest}`;

function fixture(overrides = {}) {
  const state = { calls: [], authCalls: 0, authorizations: 0, downloads: 0, serviceClients: 0, userTokens: [],
    identity: { id: subjectId, is_anonymous: false }, firstBinding: { ...canonicalBinding }, ...overrides };
  const handle = createDocumentVersionContentGateway({ enabled: state.enabled ?? true, allowedOrigins: [origin],
    createUserClient: token => {
      state.userTokens.push(token);
      return { auth: { getUser: async received => {
        state.authCalls++; state.calls.push(['auth', received]); assert.equal(received, token);
        if (state.throwAuth) throw new Error('SECRET auth error');
        return state.invalidAuth ? failure() : ok({ user: state.identity });
      } }, rpc: async (name, args) => {
        state.calls.push(['user', name, args]); state.authorizations++;
        assert.equal(name, 'authorize_document_version_content');
        assert.deepEqual(Object.keys(args).sort(), ['p_expected_sha256', 'p_request_id', 'p_version_id']);
        if (state.throwAuthorization) throw new Error('SECRET SQL error');
        if (state.authorizationError) return state.authorizationError;
        if (args.p_version_id !== versionId || args.p_expected_sha256 !== (state.expectedDigest ?? digest)) return failure();
        if (state.authorizations === 2 && state.secondError) return state.secondError;
        if (state.authorizations === 2 && state.mutateFirst) state.mutateFirst(state.firstBinding);
        if (state.authorizations === 2 && Object.hasOwn(state, 'secondBinding')) return ok(state.secondBinding);
        return ok(state.firstBinding);
      } };
    },
    createServiceClient: () => {
      state.serviceClients++;
      if (state.throwService) throw new Error('SECRET server credential');
      return { rpc: async (name, args) => {
        state.calls.push(['service', name, args]);
        if (state.throwAudit) throw new Error('SECRET audit error');
        if (name === 'record_document_content_result') {
          assert.deepEqual(Object.keys(args).sort(), ['p_authorization_id', 'p_outcome']);
          if (state.resultFailure) return failure('XX000');
          return ok(Object.hasOwn(state, 'resultReceipt') ? state.resultReceipt : { result_id: eventId, authorization_id: args.p_authorization_id, outcome: args.p_outcome });
        }
        assert.equal(name, 'record_document_content_denial');
        assert.deepEqual(Object.keys(args).sort(), ['p_attempted_version_id', 'p_observed_auth_user_id', 'p_reason_code', 'p_request_id']);
        if (state.denialFailure) return failure('XX000');
        return ok(Object.hasOwn(state, 'denialReceipt') ? state.denialReceipt : { denial_id: eventId, request_id: args.p_request_id, reason_code: args.p_reason_code });
      }, storage: { from: bucket => {
        assert.equal(bucket, 'os-private-ingest');
        return { download: async key => {
          state.downloads++; state.calls.push(['download', key]); assert.equal(key, objectKey);
          if (state.throwProvider) throw new Error('SECRET storage token');
          if (state.providerFailure) return { data: null, error: { statusCode: '404', message: 'SECRET missing path' } };
          return ok(Object.hasOwn(state, 'blob') ? state.blob : new Blob([bytes], { type: 'text/plain' }));
        } };
      } } };
    },
  });
  const request = ({ url = requestUrl, method = 'GET', headers = {} } = {}) => handle(new Request(url,
    { method, headers: { authorization: 'Bearer synthetic.user.token', ...headers } }));
  return { state, request, handle };
}
function outcome(f) { return f.state.calls.filter(c => c[1] === 'record_document_content_result').map(c => c[2].p_outcome); }
function denial(f) { return f.state.calls.find(c => c[1] === 'record_document_content_denial')?.[2]; }
async function safeError(response, expectedStatus, expectedError = undefined) {
  assert.equal(response.status, expectedStatus);
  const body = await response.json();
  if (expectedError) assert.equal(body.error, expectedError);
  assert.deepEqual(Object.keys(body).filter(k => k !== 'operationalFault'), ['error']);
  for (const forbidden of ['SECRET', 'payload', 'synthetic.user.token', objectId, authorizationId, digest, text]) assert.equal(JSON.stringify(body).includes(forbidden), false);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.has('Location'), false);
  return body;
}

test('real handler exact byte roundtrip: auth, user authorization, server download, same user recheck, durable response-prepared receipt', async () => {
  const f = fixture(), response = await f.request({ headers: { origin } });
  assert.equal(response.status, 200); assert.equal(await response.text(), text);
  assert.equal(response.headers.get('Content-Type'), 'text/plain; charset=utf-8');
  assert.equal(response.headers.get('Content-Disposition'), `attachment; filename="document-version-${versionId}.txt"`);
  assert.equal(response.headers.get('Content-Length'), String(bytes.length));
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(response.headers.get('Access-Control-Expose-Headers'), 'Content-Disposition,Content-Length,X-Content-Type-Options,Cache-Control');
  assert.equal(response.headers.get('Accept-Ranges'), 'none');
  assert.equal(response.headers.has('ETag'), false); assert.equal(response.headers.has('Location'), false);
  assert.deepEqual(f.state.calls.map(c => c[0]), ['auth', 'user', 'download', 'user', 'service']);
  assert.deepEqual(f.state.calls[1][2], f.state.calls[3][2]);
  assert.match(f.state.calls[1][2].p_request_id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(outcome(f), ['response_prepared']); assert.equal(denial(f), undefined);
  assert.equal(f.state.serviceClients, 1); assert.equal(f.state.authCalls, 1);
  assert.equal(JSON.stringify([...response.headers]).includes('SECRET'), false);
});

test('each request reauthenticates and generates a new server request UUID', async () => {
  const f = fixture(); await f.request(); await f.request({ headers: { authorization: 'Bearer another.user.token' } });
  assert.deepEqual(f.state.userTokens, ['synthetic.user.token', 'another.user.token']);
  const checks = f.state.calls.filter(c => c[0] === 'user');
  assert.equal(checks[0][2].p_request_id, checks[1][2].p_request_id);
  assert.equal(checks[2][2].p_request_id, checks[3][2].p_request_id);
  assert.notEqual(checks[0][2].p_request_id, checks[2][2].p_request_id);
  assert.equal(f.state.authCalls, 2); assert.equal(f.state.serviceClients, 2);
});

test('different version, guessed ID or digest cannot reach Storage and yields redacted system denial input', async () => {
  for (const url of [requestUrl.replace(versionId, otherId), requestUrl.replace(digest, 'a'.repeat(64))]) {
    const f = fixture(); await safeError(await f.request({ url }), 404, 'not_found_or_unavailable');
    assert.equal(f.state.downloads, 0); assert.deepEqual(outcome(f), []);
    assert.equal(denial(f).p_observed_auth_user_id, subjectId);
    assert.equal(denial(f).p_reason_code, 'not_found_or_unavailable');
  }
});

test('current backend lifecycle/grant/scope denial stays denied without attempting provider I/O', async () => {
  // Backend tests, not these adapter injections, prove each SQL predicate.
  for (const condition of ['revoked', 'inactive', 'unlinked', 'missing_view_versions', 'restricted', 'uncleared', 'ingest_open', 'wrong_lifecycle']) {
    const f = fixture({ authorizationError: failure() });
    await safeError(await f.request(), 404, 'not_found_or_unavailable');
    assert.equal(f.state.downloads, 0, condition); assert.equal(denial(f).p_reason_code, 'not_found_or_unavailable');
  }
});

test('invalid or anonymous Auth cannot become an observed verified subject or call authorization', async () => {
  for (const overrides of [{ invalidAuth: true }, { identity: null }, { identity: { id: subjectId } },
    { identity: { id: subjectId, is_anonymous: true } }, { identity: { id: 'invalid', is_anonymous: false } }]) {
    const f = fixture(overrides); await safeError(await f.request(), 401, 'unauthenticated');
    assert.equal(f.state.authorizations, 0); assert.equal(f.state.downloads, 0);
    assert.equal(denial(f).p_observed_auth_user_id, null); assert.equal(denial(f).p_attempted_version_id, null);
  }
  for (const authorization of ['', 'Basic secret', 'Bearer two tokens', 'Bearer token\tbad']) {
    const f = fixture(); await safeError(await f.request({ headers: { authorization } }), 401, 'unauthenticated');
    assert.equal(f.state.authCalls, 0); assert.equal(denial(f).p_observed_auth_user_id, null);
  }
});

test('Auth/SQL outages and unexpected denial text are opaque; raw SDK failures never escape', async () => {
  for (const overrides of [{ throwAuth: true }, { throwAuthorization: true },
    { authorizationError: failure('XX000') }, { authorizationError: failure('42501', 'SECRET path') }]) {
    const f = fixture(overrides); await safeError(await f.request(), 503, 'backend_unavailable');
    assert.equal(f.state.downloads, 0); assert.equal(denial(f).p_reason_code, 'backend_unavailable');
  }
  const expired = fixture({ authorizationError: failure('28000') });
  await safeError(await expired.request(), 401, 'unauthenticated');
});

test('malformed or overbroad authorization binding fails before Storage', async () => {
  const invalid = [null, [], [canonicalBinding], {}, { ...canonicalBinding, extra: 'SECRET' },
    ...Object.keys(canonicalBinding).map(key => Object.fromEntries(Object.entries(canonicalBinding).filter(([name]) => name !== key))),
    ...[{ authorization_id: 'invalid' }, { version_id: otherId }, { object_id: otherId }, { verified_sha256: 'a'.repeat(64) },
      { byte_size: 0 }, { byte_size: MAX_BYTES + 1 }, { byte_size: String(bytes.length) }, { byte_size: 1.5 },
      { media_type: 'text/html' }, { bucket_id: 'another-bucket' }, { object_key: 'https://evil.test/payload' },
      { object_key: `${otherId}/${otherId}/${otherId}/payload` }, { object_key: `${otherId}/../${objectId}/payload` },
      { object_key: `${objectKey}/extra` }].map(change => ({ ...canonicalBinding, ...change }))];
  for (const firstBinding of invalid) {
    const f = fixture({ firstBinding }); await safeError(await f.request(), 503, 'backend_unavailable');
    assert.equal(f.state.downloads, 0); assert.equal(denial(f).p_reason_code, 'backend_unavailable');
  }
});

test('provider absence or throw records bounded failure and returns no bytes', async () => {
  for (const overrides of [{ providerFailure: true }, { throwProvider: true }]) {
    const f = fixture(overrides); await safeError(await f.request(), 503, 'backend_unavailable');
    assert.deepEqual(outcome(f), ['provider_failure']); assert.equal(f.state.authorizations, 1); assert.equal(denial(f), undefined);
  }
});

test('byte length, digest, media, UTF8 and synthetic marker mismatches never serve content', async () => {
  const invalid = [null, new Blob([bytes.slice(1)], { type: 'text/plain' }), new Blob([bytes, 'x'], { type: 'text/plain' }),
    new Blob([bytes.map(value => value ^ 1)], { type: 'text/plain' }), new Blob([bytes], { type: 'text/html' }),
    new Blob([bytes], { type: 'text/plain; charset=iso-8859-1' }), new Blob([new Uint8Array(MAX_BYTES + 1)], { type: 'text/plain' })];
  for (const blob of invalid) {
    const f = fixture({ blob }); await safeError(await f.request(), 503, 'backend_unavailable');
    assert.deepEqual(outcome(f), ['integrity_failure']); assert.equal(f.state.authorizations, 1);
  }
  for (const content of [new Uint8Array([255]), new TextEncoder().encode('unmarked synthetic-only restriction failure'), new TextEncoder().encode(`${SYNTHETIC_PREFIX}\0`)]) {
    const hash = await sha256(content);
    // Ask exactly for this malformed stored fixture so text validation, not
    // just a digest mismatch, must deny it.
    const f = fixture({ expectedDigest: hash, firstBinding: { ...canonicalBinding, verified_sha256: hash, byte_size: content.length }, blob: new Blob([content], { type: 'text/plain' }) });
    await safeError(await f.request({ url: requestUrl.replace(digest, hash) }), 503);
    assert.deepEqual(outcome(f), ['integrity_failure']);
  }
});

test('UTF8 text containing HTML-like data remains a text attachment, never inline rendering', async () => {
  const content = new TextEncoder().encode(`${SYNTHETIC_PREFIX}<script>alert('synthetic data')</script>`), hash = await sha256(content);
  const f = fixture({ expectedDigest: hash, firstBinding: { ...canonicalBinding, verified_sha256: hash, byte_size: content.length }, blob: new Blob([content], { type: 'text/plain; charset=utf-8' }) });
  const response = await f.request({ url: requestUrl.replace(digest, hash) }); assert.equal(response.status, 200);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), content);
  assert.match(response.headers.get('Content-Disposition'), /^attachment;/);
  assert.equal(response.headers.get('Content-Security-Policy'), "default-src 'none'; sandbox");
});

test('exactly 64KiB valid synthetic text is accepted without relaxing the immutable binding', async () => {
  const content = new Uint8Array(MAX_BYTES).fill(120); content.set(new TextEncoder().encode(SYNTHETIC_PREFIX));
  const hash = await sha256(content);
  const f = fixture({ expectedDigest: hash, firstBinding: { ...canonicalBinding, verified_sha256: hash, byte_size: MAX_BYTES }, blob: new Blob([content], { type: 'text/plain' }) });
  const response = await f.request({ url: requestUrl.replace(digest, hash) }); assert.equal(response.status, 200);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), content);
});

test('revocation between provider read and final authorization prevents bytes and records access_changed', async () => {
  for (const secondError of [failure(), failure('28000'), failure('XX000')]) {
    const f = fixture({ secondError }); const r = await f.request();
    await safeError(r, secondError.error.code === '42501' ? 404 : secondError.error.code === '28000' ? 401 : 503);
    assert.equal(f.state.downloads, 1); assert.deepEqual(outcome(f), ['access_changed']);
  }
});

test('second binding must be identical, not merely a newly valid manifest or authorization', async () => {
  for (const change of [{ authorization_id: otherId }, { object_id: otherId, object_key: `${otherId}/${otherId}/${otherId}/payload` },
    { object_key: `${subjectId}/${otherId}/${objectId}/payload` }, { byte_size: bytes.length + 1 }, { verified_sha256: 'a'.repeat(64) }, { extra: true }]) {
    const f = fixture({ secondBinding: { ...canonicalBinding, ...change } });
    await safeError(await f.request(), 503); assert.deepEqual(outcome(f), ['access_changed']);
  }
  const f = fixture({ mutateFirst: value => { value.authorization_id = otherId; } });
  await safeError(await f.request(), 503); assert.deepEqual(outcome(f), ['access_changed']);
});

test('response-prepared audit must return an exact durable receipt before bytes can escape', async () => {
  for (const override of [{ resultFailure: true }, { throwAudit: true }, ...[null, {}, [],
    { result_id: eventId, authorization_id: otherId, outcome: 'response_prepared' },
    { result_id: eventId, authorization_id: authorizationId, outcome: 'delivered' },
    { result_id: eventId, authorization_id: authorizationId, outcome: 'response_prepared', secret: true }].map(resultReceipt => ({ resultReceipt }))]) {
    const f = fixture(override); const body = await safeError(await f.request(), 503, 'backend_unavailable');
    assert.equal(body.operationalFault, 'result_record_unavailable'); assert.deepEqual(outcome(f), ['response_prepared']);
  }
});

test('failed result/denial observation remains denied and surfaces only safe operational fault', async () => {
  const f = fixture({ secondError: failure(), resultFailure: true });
  assert.equal((await safeError(await f.request(), 404)).operationalFault, 'result_record_unavailable');
  for (const override of [{ denialFailure: true }, { throwAudit: true }, { throwService: true }, { denialReceipt: null },
    { denialReceipt: { denial_id: eventId, request_id: otherId, reason_code: 'not_found_or_unavailable' } }]) {
    const denied = fixture({ authorizationError: failure(), ...override });
    assert.equal((await safeError(await denied.request(), 404)).operationalFault, 'denial_record_unavailable');
    assert.equal(denied.state.downloads, 0);
  }
});

test('query/path allowlist rejects duplicates, actor/path/bucket overrides, encoded aliases and other actions', async () => {
  for (const suffix of ['', `?sha256=${digest.toUpperCase()}`, '?sha256=short', `?sha256=${digest}&sha256=${digest}`,
    `?sha256=${digest}&path=secret`, `?sha256=${digest}&bucket=secret`, `?sha256=${digest}&actor=${subjectId}`,
    `?sha256=${digest}&requestId=${otherId}`, `?%73ha256=${digest}`, `?sha256=${digest}#fragment`, `?sha256=${digest}&`]) {
    const f = fixture(); await safeError(await f.request({ url: requestUrl.split('?')[0] + suffix }), 400, 'invalid_request');
    assert.equal(f.state.authorizations, 0); assert.equal(f.state.downloads, 0);
  }
  for (const path of [`/${versionId}/content`, `/other/document-version-content/${versionId}/content`,
    `/functions/v1/document-version-content/${versionId}/content/`, `/functions/v1/document-version-content/latest/content`,
    `/functions/v1/document-version-content/${versionId}/signed-url`, `/functions/v1/document-version-content/${versionId}`]) {
    const f = fixture(); await safeError(await f.request({ url: `https://edge.test${path}?sha256=${digest}` }), 404);
    assert.equal(f.state.authorizations, 0);
  }
});

test('range/resume/conditional or encoded requests cannot bypass full verification', async () => {
  for (const header of ['range', 'content-range', 'if-range', 'if-none-match', 'if-modified-since', 'content-encoding']) {
    const f = fixture(); await safeError(await f.request({ headers: { [header]: 'opaque' } }), 400);
    assert.equal(f.state.downloads, 0);
  }
});

test('only GET and exact allowlisted CORS preflight can succeed; no production-origin widening', async () => {
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'HEAD']) {
    const f = fixture(), response = await f.request({ method });
    await safeError(response, 405, 'method_not_allowed'); assert.equal(response.headers.get('Allow'), 'GET, OPTIONS');
    assert.equal(f.state.authCalls, 0); assert.equal(denial(f).p_reason_code, 'method_not_allowed');
  }
  for (const rejected of ['https://evil.test', 'null', 'https://preview.lovable.app', 'http://localhost:4179.evil.test']) {
    const f = fixture(), response = await f.request({ headers: { origin: rejected } });
    await safeError(response, 403, 'forbidden_origin'); assert.equal(response.headers.has('Access-Control-Allow-Origin'), false);
    assert.equal(f.state.authCalls, 0); assert.equal(denial(f).p_observed_auth_user_id, null);
  }
  const f = fixture(), response = await f.request({ method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'GET', 'access-control-request-headers': 'Authorization, apikey' } });
  assert.equal(response.status, 204); assert.equal(f.state.serviceClients, 0); assert.equal(f.state.authCalls, 0);
  for (const extra of [{ 'access-control-request-method': 'POST' }, { 'access-control-request-headers': 'range' }, { origin: '' }]) {
    const denied = fixture(); assert.notEqual((await denied.request({ method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'GET', ...extra } })).status, 204);
    assert.equal(denied.state.downloads, 0);
  }
});

test('disabled configuration contacts neither identity, provider nor audit backend', async () => {
  const f = fixture({ enabled: false }); await safeError(await f.request(), 503, 'transport_disabled');
  assert.deepEqual(f.state.calls, []); assert.equal(f.state.serviceClients, 0);
});

test('stream cap and timeout cancel incomplete reads without trusting reported content length', async () => {
  let canceled = false;
  const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(20)); c.enqueue(new Uint8Array(20)); }, cancel() { canceled = true; } });
  await assert.rejects(boundedBytes(stream, 30), /backend_unavailable/); assert.equal(canceled, true);
  await assert.rejects(boundedBytes(new ReadableStream({}), 30, 5), /backend_unavailable/);
  class FalseSizeBlob extends Blob {
    get size() { return bytes.length; }
    stream() { return new Blob([bytes.slice(1)]).stream(); }
  }
  const f = fixture({ blob: new FalseSizeBlob([bytes], { type: 'text/plain' }) });
  await safeError(await f.request(), 503); assert.deepEqual(outcome(f), ['integrity_failure']);
});
