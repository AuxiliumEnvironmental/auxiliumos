import type { SupabaseClient } from '@supabase/supabase-js';
import { RuntimeError } from './errors';

export type ReleaseVersion = Readonly<{ documentId: string; versionId: string; verifiedSha256: string }>;
export type ReleaseState = 'unreleased' | 'current' | 'superseded' | 'withdrawn';
export type WithdrawalReason = 'release_error' | 'audience_change' | 'security_concern';
export type ReleaseStatus = {
  document_id: string; version_id: string; verified_sha256: string;
  document_revision: number; review_revision: number; release_revision: number;
  release_id: string | null; current_release_id: string | null; approved_review_decision_id: string | null;
  release_state: ReleaseState; controller_eligible: boolean; can_prepare_release: boolean;
  metadata_only: true; released_download_available: false;
};
export type WithdrawalStatus = {
  document_id: string; version_id: string; verified_sha256: string; release_revision: number;
  release_id: string | null; release_state: ReleaseState; can_withdraw: boolean;
};
export type ReleaseAudience = {
  document_id: string; version_id: string; verified_sha256: string;
  document_revision: number; review_revision: number; release_revision: number; metadata_only: true;
  recipients: { grant_id: string; recipient_profile_id: string; recipient_display_name: string }[];
};
export type ReleaseIntent = ReleaseVersion & Readonly<{
  kind: 'release'; documentRevision: number; reviewRevision: number; releaseRevision: number;
  approvedReviewDecisionId: string; previousReleaseId: string | null;
  recipientGrantIds: readonly string[]; requestId: string; attestationCode: 'released_exact_synthetic_version';
}>;
export type WithdrawalIntent = ReleaseVersion & Readonly<{
  kind: 'withdraw'; releaseId: string; releaseRevision: number; requestId: string; reasonCode: WithdrawalReason;
}>;
export type DocumentReleaseIntent = ReleaseIntent | WithdrawalIntent;
export type ReleaseReceipt = {
  release_id: string; document_id: string; version_id: string; verified_sha256: string;
  review_decision_id: string; controller_grant_id: string; recipient_grant_ids: string[];
  previous_release_id: string | null; release_class: 'routine_synthetic_document';
  attestation_code: 'released_exact_synthetic_version'; document_revision: number; review_revision: number;
  release_revision: number; released_at: string; metadata_only: true;
};
export type WithdrawalReceipt = {
  withdrawal_id: string; release_id: string; document_id: string; version_id: string;
  release_revision: number; reason_code: WithdrawalReason; withdrawn_at: string; withdrawn: true;
};
export type DocumentReleaseReceipt = ReleaseReceipt | WithdrawalReceipt;
export type RecipientReleaseMetadata = {
  release_id: string; document_id: string; version_id: string; verified_sha256: string;
  version_ordinal: number; release_class: 'routine_synthetic_document'; released_at: string;
  release_revision: number; visibility: 'current' | 'historical'; metadata_only: true; released_download_available: false;
};

const messages = {
  unavailable: 'Release metadata or this operation is unavailable to your current access. Controller and recipient grants are separate.',
  unauthenticated: 'Your session is unavailable. Sign in again to continue.',
  conflict: 'The exact digest or a document, review or release revision changed. Check current status before preparing a new operation.',
  request_conflict: 'This request reference is bound to different details. It cannot be reused for a changed release or withdrawal.',
  final: 'This release transition is no longer available. Withdrawal and replacement never reopen an earlier release.',
  validation: 'The exact version, revisions, recipient grants or withdrawal reason could not be validated.',
  backend: 'The release service could not confirm this operation. A submitted change may already have been recorded.',
  unexpected: 'The release service returned information that could not be verified. A submitted change is not confirmed.',
} as const;
export class DocumentReleaseError extends RuntimeError {
  constructor(public readonly reason: keyof typeof messages) {
    super(reason === 'unauthenticated' ? 'session_expired' : reason === 'validation' ? 'validation' : 'backend',
      messages[reason], reason === 'backend' || reason === 'unexpected');
    this.name = 'DocumentReleaseError';
  }
}
const unexpected = (): never => { throw new DocumentReleaseError('unexpected'); };
const invalid = (): never => { throw new DocumentReleaseError('validation'); };
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v);
const nullableUuid = (v: unknown): v is string | null => v === null || uuid(v);
const digest = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
const revision = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const reason = (v: unknown): v is WithdrawalReason => ['release_error', 'audience_change', 'security_concern'].includes(v as string);
const timestamp = (v: unknown): v is string => typeof v === 'string' && v.length <= 40
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
const record = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return unexpected();
  return v as Record<string, unknown>;
};
const audienceIds = (v: unknown): v is string[] => Array.isArray(v) && v.length >= 1 && v.length <= 32
  && v.every(uuid) && new Set(v).size === v.length;
function validateVersion(v: ReleaseVersion) {
  if (!uuid(v.documentId) || !uuid(v.versionId) || !digest(v.verifiedSha256)) invalid();
}
function checkAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Canceled', 'AbortError');
}
function exact(s: Record<string, unknown>, v: ReleaseVersion) {
  if (s.document_id !== v.documentId || s.version_id !== v.versionId || s.verified_sha256 !== v.verifiedSha256) unexpected();
  return { document_id: v.documentId, version_id: v.versionId, verified_sha256: v.verifiedSha256 };
}
function revisions(s: Record<string, unknown>) {
  if (!revision(s.document_revision) || !revision(s.review_revision) || !revision(s.release_revision)) return unexpected();
  return { document_revision: s.document_revision, review_revision: s.review_revision, release_revision: s.release_revision };
}

export class DocumentReleaseApi {
  constructor(private readonly client: SupabaseClient) {}
  private async invoke(name: string, args: Record<string, string | number | readonly string[]>, signal?: AbortSignal): Promise<unknown> {
    checkAborted(signal);
    try {
      let query = this.client.rpc(name, args).retry(false);
      if (signal) query = query.abortSignal(signal);
      const result = await query;
      checkAborted(signal);
      if (result.error) {
        const code = result.error.code;
        if (code === '28000' || result.status === 401) throw new DocumentReleaseError('unauthenticated');
        if (code === '42501' || result.status === 403) throw new DocumentReleaseError('unavailable');
        if (code === '40001') throw new DocumentReleaseError('conflict');
        if (code === '23505') throw new DocumentReleaseError('request_conflict');
        if (code === '55000') throw new DocumentReleaseError('final');
        if (code === '22023') throw new DocumentReleaseError('validation');
        throw new DocumentReleaseError('backend');
      }
      return result.data;
    } catch (error) {
      checkAborted(signal);
      if (error instanceof DocumentReleaseError) throw error;
      throw new DocumentReleaseError('backend');
    }
  }

  async status(version: ReleaseVersion, signal?: AbortSignal): Promise<ReleaseStatus> {
    const v = { ...version }; validateVersion(v);
    const s = record(await this.invoke('document_version_release_status', { p_version_id: v.versionId, p_expected_sha256: v.verifiedSha256 }, signal));
    const identity = exact(s, v), observed = revisions(s);
    if (!nullableUuid(s.release_id) || !nullableUuid(s.current_release_id) || !nullableUuid(s.approved_review_decision_id)
      || !['unreleased', 'current', 'superseded', 'withdrawn'].includes(s.release_state as string)
      || typeof s.controller_eligible !== 'boolean' || typeof s.can_prepare_release !== 'boolean'
      || s.metadata_only !== true || s.released_download_available !== false) return unexpected();
    const state = s.release_state as ReleaseState;
    if ((state === 'unreleased') !== (s.release_id === null)
      || state === 'current' && s.current_release_id !== s.release_id
      || (state === 'superseded' || state === 'withdrawn') && s.current_release_id === s.release_id
      || s.release_id !== null && (!s.approved_review_decision_id || observed.release_revision < 1)
      || s.approved_review_decision_id !== null && observed.review_revision < 2
      || s.can_prepare_release && (!s.controller_eligible || !s.approved_review_decision_id || state !== 'unreleased')) return unexpected();
    return { ...identity, ...observed, release_id: s.release_id, current_release_id: s.current_release_id,
      approved_review_decision_id: s.approved_review_decision_id, release_state: state,
      controller_eligible: s.controller_eligible, can_prepare_release: s.can_prepare_release,
      metadata_only: true, released_download_available: false };
  }

  async withdrawalStatus(version: ReleaseVersion, signal?: AbortSignal): Promise<WithdrawalStatus> {
    const v = { ...version }; validateVersion(v);
    const s = record(await this.invoke('document_release_withdrawal_status', {
      p_version_id: v.versionId, p_expected_sha256: v.verifiedSha256,
    }, signal));
    const identity = exact(s, v);
    if (!revision(s.release_revision) || !nullableUuid(s.release_id)
      || !['unreleased', 'current', 'superseded', 'withdrawn'].includes(s.release_state as string)
      || typeof s.can_withdraw !== 'boolean') return unexpected();
    const state = s.release_state as ReleaseState;
    if ((state === 'unreleased') !== (s.release_id === null)
      || s.release_id !== null && s.release_revision < 1
      || s.can_withdraw !== (state === 'current' || state === 'superseded')) return unexpected();
    return { ...identity, release_revision: s.release_revision, release_id: s.release_id,
      release_state: state, can_withdraw: s.can_withdraw };
  }

  async audience(version: ReleaseVersion, signal?: AbortSignal): Promise<ReleaseAudience> {
    const v = { ...version }; validateVersion(v);
    const s = record(await this.invoke('document_release_audience_options', { p_version_id: v.versionId, p_expected_sha256: v.verifiedSha256 }, signal));
    const identity = exact(s, v), observed = revisions(s);
    if (s.metadata_only !== true || !Array.isArray(s.recipients)) return unexpected();
    const recipients = s.recipients.map(value => {
      const r = record(value);
      if (!uuid(r.grant_id) || !uuid(r.recipient_profile_id) || typeof r.recipient_display_name !== 'string'
        || !r.recipient_display_name.trim()) return unexpected();
      return { grant_id: r.grant_id, recipient_profile_id: r.recipient_profile_id, recipient_display_name: r.recipient_display_name };
    });
    if (new Set(recipients.map(r => r.grant_id)).size !== recipients.length) return unexpected();
    return { ...identity, ...observed, metadata_only: true, recipients };
  }

  async release(intent: ReleaseIntent, signal?: AbortSignal): Promise<ReleaseReceipt> {
    // Copy the nested audience before awaiting; later caller changes cannot alter
    // either the dispatched tuple or receipt verification.
    const r = { ...intent, recipientGrantIds: Array.isArray(intent.recipientGrantIds) ? [...intent.recipientGrantIds].sort() : [] };
    validateVersion(r);
    if (r.kind !== 'release' || !uuid(r.requestId) || !uuid(r.approvedReviewDecisionId) || !nullableUuid(r.previousReleaseId)
      || !revision(r.documentRevision) || !revision(r.reviewRevision) || r.reviewRevision < 2
      || !revision(r.releaseRevision) || r.releaseRevision === Number.MAX_SAFE_INTEGER
      || !audienceIds(r.recipientGrantIds) || r.attestationCode !== 'released_exact_synthetic_version') invalid();
    const s = record(await this.invoke('release_document_version', {
      p_version_id: r.versionId, p_expected_sha256: r.verifiedSha256,
      p_expected_document_revision: r.documentRevision, p_expected_review_revision: r.reviewRevision,
      p_expected_release_revision: r.releaseRevision, p_recipient_grant_ids: r.recipientGrantIds,
      p_request_id: r.requestId, p_attestation_code: r.attestationCode,
    }, signal));
    const identity = exact(s, r);
    if (!uuid(s.release_id) || s.review_decision_id !== r.approvedReviewDecisionId || !uuid(s.controller_grant_id)
      || s.previous_release_id !== r.previousReleaseId || s.release_class !== 'routine_synthetic_document'
      || s.attestation_code !== r.attestationCode || s.document_revision !== r.documentRevision
      || s.review_revision !== r.reviewRevision || s.release_revision !== r.releaseRevision + 1
      || !audienceIds(s.recipient_grant_ids) || [...s.recipient_grant_ids].sort().join(',') !== r.recipientGrantIds.join(',')
      || !timestamp(s.released_at) || s.metadata_only !== true) return unexpected();
    return { ...identity, release_id: s.release_id, review_decision_id: r.approvedReviewDecisionId,
      controller_grant_id: s.controller_grant_id, recipient_grant_ids: [...s.recipient_grant_ids],
      previous_release_id: r.previousReleaseId, release_class: 'routine_synthetic_document', attestation_code: r.attestationCode,
      document_revision: r.documentRevision, review_revision: r.reviewRevision, release_revision: r.releaseRevision + 1,
      released_at: s.released_at, metadata_only: true };
  }

  async withdraw(intent: WithdrawalIntent, signal?: AbortSignal): Promise<WithdrawalReceipt> {
    const r = { ...intent }; validateVersion(r);
    if (r.kind !== 'withdraw' || !uuid(r.releaseId) || !uuid(r.requestId) || !revision(r.releaseRevision)
      || r.releaseRevision === Number.MAX_SAFE_INTEGER || !reason(r.reasonCode)) invalid();
    const s = record(await this.invoke('withdraw_document_release', { p_release_id: r.releaseId,
      p_expected_release_revision: r.releaseRevision, p_request_id: r.requestId, p_reason_code: r.reasonCode }, signal));
    if (!uuid(s.withdrawal_id) || s.release_id !== r.releaseId || s.document_id !== r.documentId || s.version_id !== r.versionId
      || s.release_revision !== r.releaseRevision + 1 || s.reason_code !== r.reasonCode || !timestamp(s.withdrawn_at)
      || s.withdrawn !== true) return unexpected();
    return { withdrawal_id: s.withdrawal_id, release_id: r.releaseId, document_id: r.documentId, version_id: r.versionId,
      release_revision: r.releaseRevision + 1, reason_code: r.reasonCode, withdrawn_at: s.withdrawn_at, withdrawn: true };
  }

  private metadata(value: unknown, documentId: string, visibility: RecipientReleaseMetadata['visibility'], expected?: ReleaseVersion): RecipientReleaseMetadata {
    const s = record(value);
    if (s.document_id !== documentId || !uuid(s.release_id) || !uuid(s.version_id) || !digest(s.verified_sha256)
      || !revision(s.version_ordinal) || s.version_ordinal < 1 || !revision(s.release_revision) || s.release_revision < 1
      || s.release_class !== 'routine_synthetic_document' || !timestamp(s.released_at) || s.visibility !== visibility
      || s.metadata_only !== true || s.released_download_available !== false
      || expected && (s.version_id !== expected.versionId || s.verified_sha256 !== expected.verifiedSha256)) return unexpected();
    return { release_id: s.release_id, document_id: documentId, version_id: s.version_id, verified_sha256: s.verified_sha256,
      version_ordinal: s.version_ordinal, release_class: 'routine_synthetic_document', released_at: s.released_at,
      release_revision: s.release_revision, visibility, metadata_only: true, released_download_available: false };
  }
  async current(documentId: string, signal?: AbortSignal): Promise<RecipientReleaseMetadata> {
    if (!uuid(documentId)) invalid();
    return this.metadata(await this.invoke('current_document_release', { p_document_id: documentId }, signal), documentId, 'current');
  }
  async historical(version: ReleaseVersion, signal?: AbortSignal): Promise<RecipientReleaseMetadata> {
    const v = { ...version }; validateVersion(v);
    return this.metadata(await this.invoke('historical_document_release', { p_version_id: v.versionId, p_expected_sha256: v.verifiedSha256 }, signal),
      v.documentId, 'historical', v);
  }
}
