// Pure fetch handler shared by the real Edge entrypoint and deterministic
// failure-injection tests. No content route, scanner, clearance or release API.
export const MAX_BYTES = 65_536;
export const SYNTHETIC_PREFIX = 'AuxiliumOS synthetic fixture\n';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{64}$/;
const STATES = new Set(['reserved', 'receiving', 'stored_unverified', 'finalized', 'expired']);
const FAILURE_CODES = new Set(['provider_unavailable', 'provider_missing', 'byte_mismatch', 'invalid_text', 'receipt_unavailable']);

export class GatewayError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}

export async function boundedBytes(stream, limit = MAX_BYTES, timeoutMs = 15_000) {
  if (!stream) throw new GatewayError('invalid_request');
  const reader = stream.getReader();
  const parts = [];
  let total = 0;
  let timer;
  const timedOut = new Promise((_, reject) => { timer = setTimeout(() => reject(new GatewayError('request_timeout', 408)), timeoutMs); });
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), timedOut]);
      if (done) break;
      total += value.byteLength;
      if (total > limit) throw new GatewayError('payload_too_large', 413);
      parts.push(value);
    }
    const result = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) { result.set(part, offset); offset += part.byteLength; }
    return result;
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally { clearTimeout(timer); reader.releaseLock(); }
}

export async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

function validateText(bytes) {
  if (!bytes.length || bytes.length > MAX_BYTES) throw new GatewayError('invalid_text');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new GatewayError('invalid_text'); }
  // Accident-prevention for this configured development subset, NOT a PHI
  // detector: no real uploads are authorized even if they carry this marker.
  if (!text.startsWith(SYNTHETIC_PREFIX) || text.includes('\0')) throw new GatewayError('invalid_text');
}

function sqlError(error) {
  if (error?.code === '28000' || error?.code === 'PGRST301') return new GatewayError('unauthenticated', 401);
  if (error?.code === '42501') return new GatewayError('not_found_or_unavailable', 404);
  if (error?.code === '22023') return new GatewayError('invalid_request');
  if (['23505', '40001'].includes(error?.code)) return new GatewayError('conflict', 409);
  if (error?.code === '55000') return new GatewayError('expired_or_unavailable', 409);
  return new GatewayError('backend_unavailable', 503);
}
async function rpc(client, name, args) {
  let response;
  try { response = await client.rpc(name, args); } catch { throw new GatewayError('backend_unavailable', 503); }
  if (response.error) throw sqlError(response.error);
  return response.data;
}
function first(data) {
  if (!Array.isArray(data) || data.length !== 1 || !data[0] || typeof data[0] !== 'object') throw new GatewayError('backend_unavailable', 503);
  return data[0];
}
function revision(value) {
  const n = typeof value === 'string' && /^[1-9][0-9]*$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(n) || n < 1) throw new GatewayError('invalid_request');
  return n;
}
function uuid(value) { if (typeof value !== 'string' || !UUID.test(value)) throw new GatewayError('invalid_request'); return value; }
function statusResult(value) {
  if (value?.state === 'not_found_or_unavailable') throw new GatewayError('not_found_or_unavailable', 404);
  if (!value || !UUID.test(value.object_id) || !STATES.has(value.state) || value.quarantined !== true
    || value.scan_state !== 'pending' || value.clearance_state !== 'pending'
    || (value.failure_code !== null && !FAILURE_CODES.has(value.failure_code))) throw new GatewayError('backend_unavailable', 503);
  // Explicit projection: a future RPC cannot accidentally leak provider fields.
  return { objectId: value.object_id, state: value.state, stateRevision: revision(value.state_revision),
    expiresAt: value.expires_at, scanState: 'pending', clearanceState: 'pending', quarantined: true,
    failureCode: value.failure_code, nextAction: value.next_action };
}
function targetResult(value, objectId) {
  const target = first(value);
  const segments = typeof target.object_key === 'string' ? target.object_key.split('/') : [];
  if (target.bucket_id !== 'os-private-ingest' || segments.length !== 4
    || !UUID.test(segments[0]) || !UUID.test(segments[1]) || segments[2] !== objectId || segments[3] !== 'payload'
    || !Number.isInteger(target.byte_size) || target.byte_size < 1 || target.byte_size > MAX_BYTES
    || target.media_type !== 'text/plain' || !SHA.test(target.sha256)) throw new GatewayError('backend_unavailable', 503);
  return target;
}
async function jsonBody(request, keys) {
  if (request.headers.get('content-type') !== 'application/json') throw new GatewayError('invalid_request');
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await boundedBytes(request.body, 2048))); }
  catch (error) { if (error instanceof GatewayError) throw error; throw new GatewayError('invalid_request'); }
  if (!value || Array.isArray(value) || typeof value !== 'object'
    || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) throw new GatewayError('invalid_request');
  return value;
}

async function verifiedReadback(service, target) {
  let result;
  try { result = await service.storage.from(target.bucket_id).download(target.object_key); }
  catch { throw new GatewayError('provider_unavailable', 503); }
  if (result.error) {
    const missing = [404, '404'].includes(result.error.statusCode) || result.error.code === 'NoSuchKey';
    throw new GatewayError(missing ? 'provider_missing' : 'provider_unavailable', 503);
  }
  const blob = result.data;
  if (!(blob instanceof Blob) || blob.size !== target.byte_size
    || blob.type.split(';')[0].trim().toLowerCase() !== 'text/plain') throw new GatewayError('byte_mismatch', 409);
  const bytes = await boundedBytes(blob.stream());
  try { validateText(bytes); } catch { throw new GatewayError('byte_mismatch', 409); }
  if (await sha256(bytes) !== target.sha256) throw new GatewayError('byte_mismatch', 409);
  return { p_sha256: target.sha256, p_byte_size: bytes.byteLength, p_media_type: 'text/plain' };
}

export function createPrivateObjectGateway({ createUserClient, createServiceClient, enabled = false, allowedOrigins = [] }) {
  return async function handle(request) {
    const origin = request.headers.get('origin');
    const cors = origin && allowedOrigins.includes(origin) ? { 'Access-Control-Allow-Origin': origin,
      'Vary': 'Origin', 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-state-revision,x-client-info',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS' } : {};
    const response = (body, status = 200) => Response.json(body, { status, headers: {
      ...cors, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
    let service;
    let attempt;
    let objectId;
    try {
      if (!enabled) throw new GatewayError('transport_disabled', 503);
      if (origin && !allowedOrigins.includes(origin)) throw new GatewayError('origin_unavailable', 403);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      const authorization = request.headers.get('authorization');
      if (!authorization || !/^Bearer [A-Za-z0-9_.-]+$/.test(authorization)) throw new GatewayError('unauthenticated', 401);
      const token = authorization.slice(7);
      // Fresh client per request. getUser performs remote token validation; no
      // decoded JWT/session/user_metadata authorizes an object operation.
      const user = createUserClient(token);
      let identity;
      try { identity = await user.auth.getUser(token); } catch { throw new GatewayError('backend_unavailable', 503); }
      if (identity.error || !UUID.test(identity.data?.user?.id) || identity.data.user.is_anonymous !== false) throw new GatewayError('unauthenticated', 401);
      const url = new URL(request.url);
      const match = url.pathname.match(/(?:^|\/)private-objects(?:\/([0-9a-f-]+)(?:\/(bytes|finalize))?)?\/?$/i);
      if (!match || url.search || url.hash) throw new GatewayError('not_found_or_unavailable', 404);
      objectId = match[1] ? uuid(match[1]) : undefined;
      const action = match[2];
      if (request.method === 'POST' && !objectId) {
        const body = await jsonBody(request, ['accountId', 'facilityId', 'idempotencyKey', 'byteSize', 'mediaType']);
        if (body.mediaType !== 'text/plain' || !Number.isInteger(body.byteSize) || body.byteSize < 1 || body.byteSize > MAX_BYTES) throw new GatewayError('invalid_request');
        const reservation = first(await rpc(user, 'reserve_private_object', { p_account_id: uuid(body.accountId),
          p_facility_id: uuid(body.facilityId), p_idempotency_key: uuid(body.idempotencyKey),
          p_byte_size: body.byteSize, p_media_type: body.mediaType }));
        return response(statusResult(await rpc(user, 'private_file_status', { p_object_id: uuid(reservation.object_id) })), 201);
      }
      if (!objectId) throw new GatewayError('not_found_or_unavailable', 404);
      const args = { p_object_id: objectId };
      if (request.method === 'GET' && !action) return response(statusResult(await rpc(user, 'private_file_status', args)));
      if (request.method === 'PUT' && action === 'bytes') {
        if (request.headers.get('content-type') !== 'text/plain'
          || ['range', 'content-range', 'content-encoding', 'content-disposition', 'x-upsert'].some((header) => request.headers.has(header))) throw new GatewayError('invalid_request');
        const expected = revision(request.headers.get('x-state-revision'));
        attempt = first(await rpc(user, 'claim_private_object_upload', { ...args, p_expected_revision: expected }));
        uuid(attempt.attempt_id);
        service = createServiceClient();
        const bytes = await boundedBytes(request.body);
        validateText(bytes);
        const bound = { ...args, p_attempt_id: attempt.attempt_id };
        await rpc(service, 'bind_private_object_upload', { ...bound, p_sha256: await sha256(bytes), p_byte_size: bytes.byteLength });
        const target = targetResult(await rpc(service, 'private_object_transport_target', bound), objectId);
        if (target.state === 'finalized') return response(statusResult(await rpc(user, 'private_file_status', args)));
        // No retry ever overwrites. Even ambiguous upload errors are reconciled
        // through exact readback, including a provider commit with lost response.
        try { await service.storage.from(target.bucket_id).upload(target.object_key, bytes, {
          contentType: 'text/plain', upsert: false, cacheControl: '0' }); } catch { /* readback determines the outcome */ }
        const evidence = await verifiedReadback(service, target);
        await rpc(service, 'record_private_object_receipt', { ...bound, ...evidence });
        // The user's current entitlement is rechecked after I/O even for status.
        return response(statusResult(await rpc(user, 'private_file_status', args)));
      }
      if (request.method === 'POST' && action === 'finalize') {
        const body = await jsonBody(request, ['expectedStateRevision']);
        attempt = first(await rpc(user, 'authorize_private_object_finalize', { ...args, p_expected_revision: revision(body.expectedStateRevision) }));
        uuid(attempt.attempt_id);
        if (attempt.state === 'finalized') return response(statusResult(await rpc(user, 'private_file_status', args)));
        service = createServiceClient();
        const bound = { ...args, p_attempt_id: attempt.attempt_id };
        const target = targetResult(await rpc(service, 'private_object_transport_target', bound), objectId);
        const evidence = await verifiedReadback(service, target);
        const receipt = first(await rpc(service, 'record_private_object_receipt', { ...bound, ...evidence }));
        return response(statusResult(await rpc(user, 'finalize_private_object', { ...bound,
          p_receipt_id: uuid(receipt.receipt_id), p_expected_revision: revision(receipt.state_revision) })));
      }
      throw new GatewayError('not_found_or_unavailable', 404);
    } catch (error) {
      const safe = error instanceof GatewayError ? error : new GatewayError('backend_unavailable', 503);
      if (service && attempt && objectId && (FAILURE_CODES.has(safe.code) || safe.code === 'backend_unavailable')) {
        try { await rpc(service, 'record_private_object_failure', { p_object_id: objectId,
          p_attempt_id: attempt.attempt_id, p_failure_code: FAILURE_CODES.has(safe.code) ? safe.code : 'receipt_unavailable' }); }
        catch { return response({ error: safe.code, operationalFault: 'failure_record_unavailable' }, safe.status); }
      }
      // Raw SDK error, body, filename, path, credentials and claims never escape.
      return response({ error: safe.code }, safe.status);
    }
  };
}
