import type { SupabaseClient } from '@supabase/supabase-js';
import { assertUuid } from './directory-api';
import { RuntimeError } from './errors';

export type EligibleDocumentSource = Readonly<{ objectId: string; verifiedSha256: string; securityRevision: number }>;
export type VersionDocument = {
  document_id: string; account_id: string; facility_id: string; title: string; document_class: string;
  document_revision: number; can_create_version: boolean;
};
type ImmutableVersion = {
  version_id: string; version_ordinal: number; object_id: string; verified_sha256: string;
  byte_size: number; media_type: 'text/plain'; lifecycle_state: 'internal_draft'; created_at: string;
  preservation_hold_at_adoption: boolean;
};
export type DocumentVersion = ImmutableVersion & { preservation_hold: boolean; visibility_restricted: boolean };
// A receipt records the transaction, not continuing read authority or live hold/restriction state.
export type DocumentAdoptionReceipt = ImmutableVersion & { document_id: string; document_revision: number; security_revision: number };
export type DocumentAdoptionRequest = Readonly<EligibleDocumentSource & {
  documentId: string; documentRevision: number; requestId: string;
}>;
export type VersionDocumentsPage = { items: VersionDocument[]; next_cursor: string | null };
export type DocumentVersionsPage = {
  document_id: string; state: 'available'; document_revision: number; items: DocumentVersion[]; next_cursor: number | null;
};

const messages = {
  unavailable: 'Document version information is unavailable to your current access. No permission is inferred from account membership.',
  unauthenticated: 'Your session is unavailable. Sign in again to continue.',
  conflict: 'The document or security revision changed. Refresh current information and review it before starting another adoption.',
  request_conflict: 'This request identifier is already bound to different details. Do not change and replay it. Refresh and review the document.',
  source_unavailable: 'The source is not currently eligible for adoption. It may be uncleared, restricted, or closed. Recheck its security status.',
  validation: 'Choose a valid document and current eligible source. The request could not be validated.',
  backend: 'The document service is unavailable or may not be enabled. No save outcome is confirmed.',
  unexpected: 'The document service returned information that could not be verified. No save outcome is confirmed.',
} as const;
export class DocumentVersionError extends RuntimeError {
  constructor(public readonly reason: keyof typeof messages) {
    super(reason === 'unauthenticated' ? 'session_expired' : reason === 'validation' ? 'validation' : 'backend', messages[reason],
      reason === 'backend' || reason === 'unexpected');
    this.name = 'DocumentVersionError';
  }
}
const unexpected = (): never => { throw new DocumentVersionError('unexpected'); };
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
const revision = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const digest = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const boundedText = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max && value.trim().length > 0;
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return unexpected();
  return value as Record<string, unknown>;
};
function pageRows(value: unknown, limit: number): unknown[] {
  if (!Array.isArray(value) || value.length > limit) return unexpected();
  return value;
}
function immutableVersion(value: unknown): ImmutableVersion {
  const s = record(value);
  if (!uuid(s.version_id) || !revision(s.version_ordinal) || s.version_ordinal < 1 || !uuid(s.object_id)
    || !digest(s.verified_sha256) || !revision(s.byte_size) || s.byte_size < 1 || s.byte_size > 65_536
    || s.media_type !== 'text/plain' || s.lifecycle_state !== 'internal_draft' || typeof s.preservation_hold_at_adoption !== 'boolean'
    || typeof s.created_at !== 'string' || s.created_at.length > 40
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(s.created_at)
    || !Number.isFinite(Date.parse(s.created_at))) return unexpected();
  return { version_id: s.version_id, version_ordinal: s.version_ordinal, object_id: s.object_id,
    verified_sha256: s.verified_sha256, byte_size: s.byte_size, media_type: s.media_type,
    lifecycle_state: s.lifecycle_state, created_at: s.created_at, preservation_hold_at_adoption: s.preservation_hold_at_adoption };
}
function limitArgument(limit: number) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new DocumentVersionError('validation');
}
function checkAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Canceled', 'AbortError');
}

export class DocumentVersionApi {
  constructor(private readonly client: SupabaseClient) {}
  private async invoke(name: string, args: Record<string, string | number | null>, signal?: AbortSignal) {
    checkAborted(signal);
    let query = this.client.rpc(name, args).retry(false);
    if (signal) query = query.abortSignal(signal);
    const result = await query;
    checkAborted(signal);
    if (result.error) {
      const code = result.error.code;
      if (code === '28000' || result.status === 401) throw new DocumentVersionError('unauthenticated');
      if (code === '42501' || result.status === 403) throw new DocumentVersionError('unavailable');
      if (code === '40001') throw new DocumentVersionError('conflict');
      if (code === '23505') throw new DocumentVersionError('request_conflict');
      if (code === '55000') throw new DocumentVersionError('source_unavailable');
      if (code === '22023') throw new DocumentVersionError('validation');
      throw new DocumentVersionError('backend');
    }
    return result.data as unknown;
  }

  async documents(accountId: string, afterId: string | null = null, signal?: AbortSignal, limit = 25): Promise<VersionDocumentsPage> {
    assertUuid(accountId, 'account');
    if (afterId !== null) assertUuid(afterId, 'document cursor');
    limitArgument(limit);
    const s = record(await this.invoke('list_version_documents', {
      p_account_id: accountId, p_after_id: afterId, p_limit: limit,
    }, signal));
    let previous = afterId?.toLowerCase() ?? '';
    const items = pageRows(s.items, limit).map(value => {
      const d = record(value);
      if (!uuid(d.document_id) || d.document_id <= previous || d.account_id !== accountId.toLowerCase() || !uuid(d.facility_id)
        || !boundedText(d.title, 250) || !boundedText(d.document_class, 100) || !revision(d.document_revision)
        || typeof d.can_create_version !== 'boolean') return unexpected();
      previous = d.document_id;
      return { document_id: d.document_id, account_id: accountId.toLowerCase(), facility_id: d.facility_id,
        title: d.title, document_class: d.document_class, document_revision: d.document_revision, can_create_version: d.can_create_version };
    });
    if (s.next_cursor !== null && (!uuid(s.next_cursor) || items.length !== limit || s.next_cursor !== previous)) return unexpected();
    return { items, next_cursor: s.next_cursor as string | null };
  }

  async versions(documentId: string, afterOrdinal = 0, signal?: AbortSignal, limit = 25): Promise<DocumentVersionsPage> {
    assertUuid(documentId, 'document');
    if (!revision(afterOrdinal)) throw new DocumentVersionError('validation');
    limitArgument(limit);
    const s = record(await this.invoke('list_document_versions', {
      p_document_id: documentId, p_after_ordinal: afterOrdinal, p_limit: limit,
    }, signal));
    if (s.document_id === null && s.state === 'not_found_or_unavailable') throw new DocumentVersionError('unavailable');
    if (s.document_id !== documentId.toLowerCase() || s.state !== 'available' || !revision(s.document_revision)) return unexpected();
    let previous = afterOrdinal;
    const ids = new Set<string>();
    const objects = new Set<string>();
    const items = pageRows(s.items, limit).map(value => {
      const v = immutableVersion(value), raw = record(value);
      if (v.version_ordinal <= previous || ids.has(v.version_id) || objects.has(v.object_id)
        || typeof raw.preservation_hold !== 'boolean' || typeof raw.visibility_restricted !== 'boolean') return unexpected();
      previous = v.version_ordinal; ids.add(v.version_id); objects.add(v.object_id);
      return { ...v, preservation_hold: raw.preservation_hold, visibility_restricted: raw.visibility_restricted };
    });
    if (s.next_cursor !== null && (!revision(s.next_cursor) || items.length !== limit || s.next_cursor !== previous)) return unexpected();
    return { document_id: s.document_id, state: 'available', document_revision: s.document_revision,
      items, next_cursor: s.next_cursor as number | null };
  }

  async adopt(request: DocumentAdoptionRequest, signal?: AbortSignal): Promise<DocumentAdoptionReceipt> {
    // Take a primitive copy before awaiting; a caller cannot retarget a pending request.
    const r = { ...request };
    assertUuid(r.objectId, 'source upload'); assertUuid(r.documentId, 'document'); assertUuid(r.requestId, 'request');
    if (!digest(r.verifiedSha256) || !revision(r.securityRevision) || !revision(r.documentRevision)
      || r.securityRevision === Number.MAX_SAFE_INTEGER || r.documentRevision === Number.MAX_SAFE_INTEGER) throw new DocumentVersionError('validation');
    const data = await this.invoke('adopt_private_object', {
      p_object_id: r.objectId, p_expected_sha256: r.verifiedSha256, p_document_id: r.documentId,
      p_expected_security_revision: r.securityRevision, p_expected_document_revision: r.documentRevision, p_request_id: r.requestId,
    }, signal);
    const s = record(data), v = immutableVersion(s);
    if (s.document_id !== r.documentId.toLowerCase() || v.object_id !== r.objectId.toLowerCase() || v.verified_sha256 !== r.verifiedSha256
      || s.document_revision !== r.documentRevision + 1 || s.security_revision !== r.securityRevision + 1) return unexpected();
    return { ...v, document_id: s.document_id, document_revision: s.document_revision, security_revision: s.security_revision };
  }
}
