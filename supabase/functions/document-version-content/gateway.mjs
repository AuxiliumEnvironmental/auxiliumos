// Exact-version internal synthetic transport. A prepared response is not proof
// of delivery, a human read, professional approval, or client release.
export const MAX_BYTES = 65_536;
export const SYNTHETIC_PREFIX = 'AuxiliumOS synthetic fixture\n';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const BINDING_KEYS = ['authorization_id', 'version_id', 'object_id', 'verified_sha256', 'byte_size', 'media_type', 'bucket_id', 'object_key'];
const DENIAL_CODES = new Set(['unauthenticated', 'forbidden_origin', 'method_not_allowed', 'invalid_request', 'not_found_or_unavailable', 'backend_unavailable']);
const CORS_HEADERS = ['authorization', 'apikey', 'content-type', 'x-client-info'];

class GatewayError extends Error {
  constructor(code = 'backend_unavailable', status = 503) { super(code); this.code = code; this.status = status; }
}

export async function boundedBytes(stream, limit = MAX_BYTES, timeoutMs = 15_000) {
  if (!stream) throw new GatewayError();
  const reader = stream.getReader(), parts = [];
  let total = 0, timer;
  const timedOut = new Promise((_, reject) => { timer = setTimeout(() => reject(new GatewayError()), timeoutMs); });
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), timedOut]);
      if (done) break;
      if (!(value instanceof Uint8Array) || total + value.byteLength > limit) throw new GatewayError();
      total += value.byteLength;
      parts.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
    return bytes;
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally { clearTimeout(timer); reader.releaseLock(); }
}

export async function sha256(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
}

function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}
function uuid(value) { return typeof value === 'string' && UUID.test(value); }
function binding(value, versionId, digest) {
  const key = typeof value?.object_key === 'string' ? value.object_key.split('/') : [];
  if (!exactKeys(value, BINDING_KEYS) || !uuid(value.authorization_id) || value.version_id !== versionId
    || !uuid(value.object_id) || value.verified_sha256 !== digest || !SHA.test(value.verified_sha256)
    || !Number.isSafeInteger(value.byte_size) || value.byte_size < 1 || value.byte_size > MAX_BYTES
    || value.media_type !== 'text/plain' || value.bucket_id !== 'os-private-ingest'
    || key.length !== 4 || !uuid(key[0]) || !uuid(key[1]) || key[2] !== value.object_id || key[3] !== 'payload') throw new GatewayError();
  // Copy the exact immutable evidence; an adapter cannot mutate the first
  // returned object in place to conceal a changed second authorization.
  return Object.fromEntries(BINDING_KEYS.map(name => [name, value[name]]));
}
function authorizationError(error) {
  if (['28000', 'PGRST301', 'PGRST302'].includes(error?.code)) return new GatewayError('unauthenticated', 401);
  if (error?.code === '42501' && error.message === 'not_found_or_unavailable') return new GatewayError('not_found_or_unavailable', 404);
  if (error?.code === '22023') return new GatewayError('invalid_request', 400);
  return new GatewayError();
}
async function rpc(client, name, args, isAuthorization = false) {
  let result;
  try { result = await client.rpc(name, args); } catch { throw new GatewayError(); }
  if (!result || result.error) throw isAuthorization ? authorizationError(result?.error) : new GatewayError();
  return result.data;
}
async function recordResult(service, authorizationId, outcome) {
  const result = await rpc(service, 'record_document_content_result', { p_authorization_id: authorizationId, p_outcome: outcome });
  if (!exactKeys(result, ['result_id', 'authorization_id', 'outcome']) || !uuid(result.result_id)
    || result.authorization_id !== authorizationId || result.outcome !== outcome) throw new GatewayError();
}
async function recordDenial(service, requestId, versionId, subjectId, code) {
  const result = await rpc(service, 'record_document_content_denial', {
    p_request_id: requestId, p_attempted_version_id: versionId, p_observed_auth_user_id: subjectId, p_reason_code: code,
  });
  if (!exactKeys(result, ['denial_id', 'request_id', 'reason_code']) || !uuid(result.denial_id)
    || result.request_id !== requestId || result.reason_code !== code) throw new GatewayError();
}
function requestedVersion(request) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^(?:\/functions\/v1)?\/document-version-content\/([0-9a-f-]+)\/content$/i);
  const versionId = match?.[1]?.toLowerCase();
  if (!uuid(versionId)) throw new GatewayError('not_found_or_unavailable', 404);
  const digest = url.searchParams.get('sha256');
  // One exact canonical parameter, not duplicates, path/actor overrides,
  // transformation options, encoded aliases, fragments, or moving latest IDs.
  if (typeof digest !== 'string' || !SHA.test(digest) || url.search !== `?sha256=${digest}` || url.hash
    || request.body !== null || ['range', 'content-range', 'if-range', 'if-none-match', 'if-modified-since', 'content-encoding'].some(name => request.headers.has(name))) {
    throw new GatewayError('invalid_request', 400);
  }
  return { versionId, digest };
}
async function fetchObject(service, target) {
  let result;
  try { result = await service.storage.from(target.bucket_id).download(target.object_key); }
  catch { throw new GatewayError(); }
  if (!result || result.error) throw new GatewayError();
  return result.data;
}
async function verifyObject(blob, target) {
  if (!(blob instanceof Blob) || blob.size !== target.byte_size || blob.size > MAX_BYTES
    || !/^text\/plain(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$/i.test(blob.type)) throw new GatewayError();
  const bytes = await boundedBytes(blob.stream());
  if (bytes.byteLength !== target.byte_size) throw new GatewayError();
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new GatewayError(); }
  // Accident prevention, not a PHI detector or permission for real data.
  if (!text.startsWith(SYNTHETIC_PREFIX) || text.includes('\0') || await sha256(bytes) !== target.verified_sha256) throw new GatewayError();
  return bytes;
}

export function createDocumentVersionContentGateway({ createUserClient, createServiceClient, enabled = false, allowedOrigins = [] }) {
  return async function handle(request) {
    const origin = request.headers.get('origin'), originAllowed = origin !== null && allowedOrigins.includes(origin);
    const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Origin',
      ...(originAllowed ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': CORS_HEADERS.join(','), 'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Expose-Headers': 'Content-Disposition,Content-Length,X-Content-Type-Options,Cache-Control' } : {}) };
    const response = (body, status) => Response.json(body, { status, headers: { ...headers, ...(status === 405 ? { Allow: 'GET, OPTIONS' } : {}) } });
    // Misconfiguration must never contact an unintended backend, even to audit.
    if (!enabled) return response({ error: 'transport_disabled' }, 503);
    const requestId = crypto.randomUUID();
    let service, attemptedVersion = null, subjectId = null, target = null, failureOutcome = null, resultAuditFailed = false;
    const privileged = () => (service ??= createServiceClient());
    try {
      if (origin !== null && !originAllowed) throw new GatewayError('forbidden_origin', 403);
      if (!['GET', 'OPTIONS'].includes(request.method)) throw new GatewayError('method_not_allowed', 405);
      if (request.method === 'OPTIONS') {
        requestedVersion(request);
        const requestedHeaders = request.headers.get('access-control-request-headers');
        if (!originAllowed || request.headers.get('access-control-request-method') !== 'GET'
          || (requestedHeaders !== null && requestedHeaders.split(',').some(name => !CORS_HEADERS.includes(name.trim().toLowerCase())))) throw new GatewayError('invalid_request', 400);
        return new Response(null, { status: 204, headers });
      }
      const authorization = request.headers.get('authorization');
      if (!authorization || !/^Bearer [A-Za-z0-9_.-]+$/.test(authorization)) throw new GatewayError('unauthenticated', 401);
      const token = authorization.slice(7), user = createUserClient(token);
      let identity;
      try { identity = await user.auth.getUser(token); } catch { throw new GatewayError(); }
      const observed = identity?.data?.user;
      if (identity?.error || !uuid(observed?.id) || observed.is_anonymous !== false) throw new GatewayError('unauthenticated', 401);
      subjectId = observed.id;
      const { versionId, digest } = requestedVersion(request);
      attemptedVersion = versionId;
      const args = { p_version_id: versionId, p_expected_sha256: digest, p_request_id: requestId };
      target = binding(await rpc(user, 'authorize_document_version_content', args, true), versionId, digest);
      // DB authorization transactions finish before any provider I/O. Neither
      // successful getUser nor a service credential substitutes for this RPC.
      failureOutcome = 'provider_failure';
      const blob = await fetchObject(privileged(), target);
      failureOutcome = 'integrity_failure';
      const bytes = await verifyObject(blob, target);
      failureOutcome = 'access_changed';
      const current = binding(await rpc(user, 'authorize_document_version_content', args, true), versionId, digest);
      if (BINDING_KEYS.some(name => target[name] !== current[name])) throw new GatewayError();
      failureOutcome = null;
      try { await recordResult(privileged(), target.authorization_id, 'response_prepared'); }
      catch { resultAuditFailed = true; throw new GatewayError(); }
      // Buffering and both audits precede any response bytes. Revocation after
      // this final check can still race an in-flight response; no recall promise.
      return new Response(bytes, { status: 200, headers: { ...headers,
        'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': String(bytes.byteLength), 'Accept-Ranges': 'none',
        'Content-Disposition': `attachment; filename="document-version-${target.version_id}.txt"`,
        'Content-Security-Policy': "default-src 'none'; sandbox",
      } });
    } catch (error) {
      const safe = error instanceof GatewayError ? error : new GatewayError();
      let operationalFault = resultAuditFailed ? 'result_record_unavailable' : null;
      if (target && failureOutcome) {
        try { await recordResult(privileged(), target.authorization_id, failureOutcome); }
        catch { operationalFault = 'result_record_unavailable'; }
      } else if (!target) {
        const reason = DENIAL_CODES.has(safe.code) ? safe.code : 'backend_unavailable';
        try { await recordDenial(privileged(), requestId, attemptedVersion, subjectId, reason); }
        catch { operationalFault = 'denial_record_unavailable'; }
      }
      // No raw SDK errors, bytes, storage paths, Auth claims, tokens or secrets.
      // A denied operation stays denied when its audit observation fails.
      return response({ error: safe.code, ...(operationalFault ? { operationalFault } : {}) }, safe.status);
    }
  };
}
