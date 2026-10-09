import type { SupabaseClient } from '@supabase/supabase-js';
import { assertUuid } from './directory-api';

export const PRIVATE_OBJECT_MAX_BYTES = 65_536;
export const PRIVATE_OBJECT_SYNTHETIC_PREFIX = 'AuxiliumOS synthetic fixture\n';
export type PrivateObjectStatus = {
  objectId: string;
  state: 'reserved' | 'receiving' | 'stored_unverified' | 'finalized' | 'expired';
  stateRevision: number;
  expiresAt: string;
  scanState: 'pending';
  clearanceState: 'pending';
  quarantined: true;
  failureCode: string | null;
  nextAction: string;
};

const messages: Record<string, string> = {
  unauthenticated: 'Your session is unavailable. Sign in again before retrying.',
  not_found_or_unavailable: 'This upload is unavailable to your current access.',
  origin_unavailable: 'Private uploads are not enabled for this workspace address.',
  transport_disabled: 'Synthetic private-file transport has not been enabled for this workspace.',
  expired_or_unavailable: 'This upload window has expired or is unavailable. Existing bytes are preserved; choose a new synthetic file to start again.',
  conflict: 'The upload changed or these bytes do not match the original attempt. Refresh status before retrying the same file.',
  invalid_request: 'Check the synthetic text file and try again.',
  invalid_text: 'Use a UTF-8 text file beginning with “AuxiliumOS synthetic fixture” followed by a newline. No PHI or real client data.',
  payload_too_large: 'The development upload limit is 64 KiB.',
  byte_mismatch: 'Stored bytes did not match the upload. They remain quarantined. Contact your administrator.',
  provider_missing: 'The file was not confirmed in private storage. Retry the same file; no overwrite will occur.',
  provider_unavailable: 'Private storage could not be verified. Retry the same file.',
  backend_unavailable: 'The upload could not be confirmed. Refresh status or retry the same file.',
  request_timeout: 'The request timed out. Refresh status or retry the same file.',
};
export class PrivateObjectError extends Error {
  constructor(public code: string) { super(messages[code] ?? messages.backend_unavailable); }
}

function parseStatus(value: unknown): PrivateObjectStatus {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PrivateObjectError('backend_unavailable');
  const s = value as Record<string, unknown>;
  assertUuid(s.objectId, 'upload');
  if (!['reserved', 'receiving', 'stored_unverified', 'finalized', 'expired'].includes(String(s.state))
    || !Number.isSafeInteger(s.stateRevision) || Number(s.stateRevision) < 1
    || typeof s.expiresAt !== 'string' || !Number.isFinite(Date.parse(s.expiresAt))
    || s.scanState !== 'pending' || s.clearanceState !== 'pending' || s.quarantined !== true
    || !(s.failureCode === null || typeof s.failureCode === 'string') || typeof s.nextAction !== 'string') throw new PrivateObjectError('backend_unavailable');
  return { objectId: s.objectId, state: s.state as PrivateObjectStatus['state'], stateRevision: Number(s.stateRevision),
    expiresAt: s.expiresAt, scanState: 'pending', clearanceState: 'pending', quarantined: true,
    failureCode: s.failureCode as string | null, nextAction: s.nextAction };
}

// The existing browser SDK supplies its user's bearer token. It never receives
// service credentials, Storage paths, digest authority or signing capabilities.
export class PrivateObjectApi {
  constructor(private readonly client: SupabaseClient) {}
  private async invoke(path: string, method: 'GET' | 'PUT' | 'POST', body?: object | ArrayBuffer,
    headers?: Record<string, string>, signal?: AbortSignal): Promise<PrivateObjectStatus> {
    if (signal?.aborted) throw new DOMException('Canceled', 'AbortError');
    const result = await this.client.functions.invoke(`private-objects${path}`, { method, body, headers, signal });
    if (signal?.aborted) throw new DOMException('Canceled', 'AbortError');
    if (result.error) {
      // FunctionsHttpError.context is the server Response; only known bounded
      // error codes enter UI. No raw SDK/provider message is displayed.
      let code = 'backend_unavailable';
      const context = result.error.context;
      if (context instanceof Response) {
        try { const value = await context.json(); if (typeof value.error === 'string' && Object.hasOwn(messages, value.error)) code = value.error; } catch { /* opaque backend failure */ }
      }
      throw new PrivateObjectError(code);
    }
    return parseStatus(result.data);
  }
  reserve(accountId: string, facilityId: string, idempotencyKey: string, byteSize: number, signal?: AbortSignal) {
    for (const id of [accountId, facilityId, idempotencyKey]) assertUuid(id, 'upload scope');
    if (!Number.isInteger(byteSize) || byteSize < 1 || byteSize > PRIVATE_OBJECT_MAX_BYTES) throw new PrivateObjectError('payload_too_large');
    return this.invoke('', 'POST', { accountId, facilityId, idempotencyKey, byteSize, mediaType: 'text/plain' }, { 'Content-Type': 'application/json' }, signal);
  }
  status(objectId: string, signal?: AbortSignal) {
    assertUuid(objectId, 'upload');
    return this.invoke(`/${objectId}`, 'GET', undefined, undefined, signal);
  }
  upload(status: PrivateObjectStatus, bytes: ArrayBuffer, signal?: AbortSignal) {
    assertUuid(status.objectId, 'upload');
    if (!bytes.byteLength || bytes.byteLength > PRIVATE_OBJECT_MAX_BYTES) throw new PrivateObjectError('payload_too_large');
    return this.invoke(`/${status.objectId}/bytes`, 'PUT', bytes,
      { 'Content-Type': 'text/plain', 'X-State-Revision': String(status.stateRevision) }, signal);
  }
  finalize(status: PrivateObjectStatus, signal?: AbortSignal) {
    assertUuid(status.objectId, 'upload');
    return this.invoke(`/${status.objectId}/finalize`, 'POST', { expectedStateRevision: status.stateRevision },
      { 'Content-Type': 'application/json' }, signal);
  }
}
