import type { SupabaseClient } from '@supabase/supabase-js';
import { RuntimeError } from './errors';

export type ReviewDecision = 'approved_internal' | 'changes_requested' | 'rejected';
export type ReviewState = 'internal_draft' | 'under_review' | ReviewDecision;
export type ReviewVersion = Readonly<{ documentId: string; versionId: string; verifiedSha256: string }>;
type ReviewIntent = ReviewVersion & Readonly<{ documentRevision: number; reviewRevision: number; requestId: string }>;
export type ReviewRequestIntent = ReviewIntent & Readonly<{ kind: 'request' }>;
export type ReviewDecisionIntent = ReviewIntent & Readonly<{
  kind: 'decision'; reviewRequestId: string; decision: ReviewDecision; attestationCode: 'reviewed_exact_synthetic_version';
}>;
export type DocumentReviewIntent = ReviewRequestIntent | ReviewDecisionIntent;
type RequestSummary = { review_request_id: string; requested_at: string };
type DecisionSummary = { decision_id: string; decision: ReviewDecision; decided_at: string };
export type DocumentReviewStatus = {
  version_id: string; document_id: string; verified_sha256: string; document_revision: number; review_revision: number;
  historical_review_state: ReviewState; request: RequestSummary | null; decision: DecisionSummary | null;
  can_request: boolean; can_decide: boolean; release_authorized: false;
};
type ReceiptVersion = {
  version_id: string; document_id: string; verified_sha256: string; document_revision: number; review_revision: number;
};
export type ReviewRequestReceipt = ReceiptVersion & RequestSummary & { state: 'under_review' };
export type ReviewDecisionReceipt = ReceiptVersion & DecisionSummary & {
  review_request_id: string; assignment_id: string; attestation_code: 'reviewed_exact_synthetic_version';
};
export type DocumentReviewReceipt = ReviewRequestReceipt | ReviewDecisionReceipt;

const messages = {
  unavailable: 'Internal review is unavailable to your current access. Request permission, content access and reviewer assignment are checked separately.',
  unauthenticated: 'Your session is unavailable. Sign in again to continue.',
  conflict: 'The document, review revision or exact digest changed. Check current review status before preparing a new request.',
  request_conflict: 'This request reference is bound to different details. It cannot be reused for a changed review.',
  final: 'A review request or final decision already exists, or this action is no longer available. Check current review status.',
  validation: 'The exact version, revisions or review choice could not be validated.',
  backend: 'The review service could not confirm this operation. A submitted change may already have been recorded.',
  unexpected: 'The review service returned information that could not be verified. A submitted change is not confirmed.',
} as const;
export class DocumentReviewError extends RuntimeError {
  constructor(public readonly reason: keyof typeof messages) {
    super(reason === 'unauthenticated' ? 'session_expired' : reason === 'validation' ? 'validation' : 'backend',
      messages[reason], reason === 'backend' || reason === 'unexpected');
    this.name = 'DocumentReviewError';
  }
}
const unexpected = (): never => { throw new DocumentReviewError('unexpected'); };
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
const digest = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const revision = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const decision = (value: unknown): value is ReviewDecision => ['approved_internal', 'changes_requested', 'rejected'].includes(value as string);
const timestamp = (value: unknown): value is string => typeof value === 'string' && value.length <= 40
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return unexpected();
  return value as Record<string, unknown>;
};
function validateVersion(value: ReviewVersion) {
  if (!uuid(value.documentId) || !uuid(value.versionId) || !digest(value.verifiedSha256)) throw new DocumentReviewError('validation');
}
function validateIntent(value: DocumentReviewIntent) {
  validateVersion(value);
  if (!uuid(value.requestId) || !revision(value.documentRevision) || !revision(value.reviewRevision)
    || value.reviewRevision === Number.MAX_SAFE_INTEGER || !['request', 'decision'].includes(value.kind)) throw new DocumentReviewError('validation');
  if (value.kind === 'decision' && (!uuid(value.reviewRequestId) || !decision(value.decision)
    || value.attestationCode !== 'reviewed_exact_synthetic_version')) throw new DocumentReviewError('validation');
}
function checkAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Canceled', 'AbortError');
}
function requestSummary(value: unknown): RequestSummary {
  const s = record(value);
  if (!uuid(s.review_request_id) || !timestamp(s.requested_at)) return unexpected();
  return { review_request_id: s.review_request_id, requested_at: s.requested_at };
}
function decisionSummary(value: unknown): DecisionSummary {
  const s = record(value);
  if (!uuid(s.decision_id) || !decision(s.decision) || !timestamp(s.decided_at)) return unexpected();
  return { decision_id: s.decision_id, decision: s.decision, decided_at: s.decided_at };
}
function receiptVersion(s: Record<string, unknown>, intent: DocumentReviewIntent): ReceiptVersion {
  if (s.version_id !== intent.versionId || s.document_id !== intent.documentId || s.verified_sha256 !== intent.verifiedSha256
    || s.document_revision !== intent.documentRevision || s.review_revision !== intent.reviewRevision + 1) return unexpected();
  return { version_id: intent.versionId, document_id: intent.documentId, verified_sha256: intent.verifiedSha256,
    document_revision: intent.documentRevision, review_revision: intent.reviewRevision + 1 };
}

export class DocumentReviewApi {
  constructor(private readonly client: SupabaseClient) {}
  private async invoke(name: string, args: Record<string, string | number>, signal?: AbortSignal): Promise<unknown> {
    checkAborted(signal);
    try {
      // Every mutation retry is a deliberate replay of the same frozen intent.
      let query = this.client.rpc(name, args).retry(false);
      if (signal) query = query.abortSignal(signal);
      const result = await query;
      checkAborted(signal);
      if (result.error) {
        const code = result.error.code;
        if (code === '28000' || result.status === 401) throw new DocumentReviewError('unauthenticated');
        if (code === '42501' || result.status === 403) throw new DocumentReviewError('unavailable');
        if (code === '40001') throw new DocumentReviewError('conflict');
        if (code === '23505') throw new DocumentReviewError('request_conflict');
        if (code === '55000') throw new DocumentReviewError('final');
        if (code === '22023') throw new DocumentReviewError('validation');
        throw new DocumentReviewError('backend');
      }
      return result.data;
    } catch (error) {
      checkAborted(signal);
      if (error instanceof DocumentReviewError) throw error;
      throw new DocumentReviewError('backend');
    }
  }

  async status(version: ReviewVersion, signal?: AbortSignal): Promise<DocumentReviewStatus> {
    const expected = { ...version }; validateVersion(expected);
    const s = record(await this.invoke('document_version_review_status', {
      p_version_id: expected.versionId, p_expected_sha256: expected.verifiedSha256,
    }, signal));
    if (s.version_id !== expected.versionId || s.document_id !== expected.documentId || s.verified_sha256 !== expected.verifiedSha256
      || !revision(s.document_revision) || !revision(s.review_revision) || typeof s.can_request !== 'boolean'
      || typeof s.can_decide !== 'boolean' || s.release_authorized !== false) return unexpected();
    const request = s.request === null ? null : requestSummary(s.request);
    const result = s.decision === null ? null : decisionSummary(s.decision);
    const state = result ? result.decision : request ? 'under_review' : 'internal_draft';
    if (s.historical_review_state !== state || result && !request || s.can_request && !!request
      || s.can_decide && (!request || !!result) || request && s.review_revision < 1 || result && s.review_revision < 2
      || result && request && Date.parse(result.decided_at) < Date.parse(request.requested_at)) return unexpected();
    return { version_id: expected.versionId, document_id: expected.documentId, verified_sha256: expected.verifiedSha256,
      document_revision: s.document_revision, review_revision: s.review_revision, historical_review_state: state,
      request, decision: result, can_request: s.can_request, can_decide: s.can_decide, release_authorized: false };
  }

  async request(intent: ReviewRequestIntent, signal?: AbortSignal): Promise<ReviewRequestReceipt> {
    const r = { ...intent }; validateIntent(r);
    if (r.kind !== 'request') throw new DocumentReviewError('validation');
    const s = record(await this.invoke('request_document_version_review', {
      p_version_id: r.versionId, p_expected_sha256: r.verifiedSha256, p_expected_document_revision: r.documentRevision,
      p_expected_review_revision: r.reviewRevision, p_request_id: r.requestId,
    }, signal));
    const exact = receiptVersion(s, r), summary = requestSummary(s);
    if (s.state !== 'under_review') return unexpected();
    return { ...exact, ...summary, state: 'under_review' };
  }

  async decide(intent: ReviewDecisionIntent, signal?: AbortSignal): Promise<ReviewDecisionReceipt> {
    const r = { ...intent }; validateIntent(r);
    if (r.kind !== 'decision') throw new DocumentReviewError('validation');
    const s = record(await this.invoke('decide_document_version_review', {
      p_review_request_id: r.reviewRequestId, p_expected_sha256: r.verifiedSha256,
      p_expected_document_revision: r.documentRevision, p_expected_review_revision: r.reviewRevision,
      p_request_id: r.requestId, p_decision: r.decision, p_attestation_code: r.attestationCode,
    }, signal));
    const exact = receiptVersion(s, r), summary = decisionSummary(s);
    if (s.review_request_id !== r.reviewRequestId || !uuid(s.assignment_id) || s.decision !== r.decision
      || s.attestation_code !== r.attestationCode) return unexpected();
    return { ...exact, ...summary, review_request_id: r.reviewRequestId, assignment_id: s.assignment_id, attestation_code: r.attestationCode };
  }
}
