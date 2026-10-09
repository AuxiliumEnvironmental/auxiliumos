import type { SupabaseClient } from '@supabase/supabase-js';
import { assertUuid } from './directory-api';
import { RuntimeError } from './errors';

const states = ['not_finalized', 'ingest_closed', 'scan_running', 'scan_pending', 'scan_failed', 'malware_blocked',
  'phi_suspected', 'rejected', 'restricted', 'security_clearance_eligible', 'human_review_required'] as const;
export type PrivateObjectSecuritySnapshot = {
  object_id: string;
  state: typeof states[number];
  security_revision: number;
  verified_sha256: string | null;
  scan_state: 'pending' | 'running' | 'result';
  scan_attempt_id: string | null;
  scan_observation_id: string | null;
  clearance_decision_id: string | null;
  malware_outcome: 'pass' | 'blocked' | 'error' | null;
  phi_signal: 'no_signal' | 'suspected' | 'not_checked' | null;
  clearance_decision: 'cleared_no_phi' | 'rejected' | 'suspected_phi' | null;
  visibility_restricted: boolean;
  preservation_hold: boolean;
  ingest_closed: boolean;
  security_clearance_eligible: boolean;
  quarantined: boolean;
  next_action: 'await_separate_document_authority' | 'designated_human_review' | 'await_authorized_security_handling';
};

const messages = {
  unavailable: 'Security information is unavailable to your current access.',
  unauthenticated: 'Your session is unavailable. Sign in again to continue.',
  conflict: 'The security revision changed. Refresh security status and review it before reporting again.',
  closed: 'This upload is not open to this action. Refresh security status before continuing.',
  validation: 'Choose a valid upload and current security revision.',
  backend: 'Security status is unavailable. The review service could not be reached or may not be enabled. No clearance or report outcome is confirmed.',
  unexpected: 'Security status could not be verified. Refresh security status before taking another action.',
} as const;
export class PrivateObjectSecurityError extends RuntimeError {
  constructor(public readonly reason: keyof typeof messages) {
    super(reason === 'unauthenticated' ? 'session_expired' : reason === 'validation' ? 'validation' : 'backend', messages[reason]);
    this.name = 'PrivateObjectSecurityError';
  }
}
const unexpected = (): never => { throw new PrivateObjectSecurityError('unexpected'); };
const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const nullableUuid = (value: unknown) => value === null || uuid(value);

// Security is its own versioned authority. Legacy transport "pending" fields
// never fill gaps in this response; unavailable or inconsistent data fails shut.
function parseSnapshot(value: unknown, objectId: string): PrivateObjectSecuritySnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return unexpected();
  const s = value as Record<string, unknown>;
  if (s.object_id === null && s.state === 'not_found_or_unavailable') throw new PrivateObjectSecurityError('unavailable');
  if (!uuid(s.object_id) || s.object_id !== objectId.toLowerCase() || !states.includes(s.state as PrivateObjectSecuritySnapshot['state'])
    || !Number.isSafeInteger(s.security_revision) || Number(s.security_revision) < 0
    || !(s.verified_sha256 === null || typeof s.verified_sha256 === 'string' && /^[0-9a-f]{64}$/.test(s.verified_sha256))
    || !['pending', 'running', 'result'].includes(s.scan_state as string)
    || !nullableUuid(s.scan_attempt_id) || !nullableUuid(s.scan_observation_id) || !nullableUuid(s.clearance_decision_id)
    || ![null, 'pass', 'blocked', 'error'].includes(s.malware_outcome as string | null)
    || ![null, 'no_signal', 'suspected', 'not_checked'].includes(s.phi_signal as string | null)
    || ![null, 'cleared_no_phi', 'rejected', 'suspected_phi'].includes(s.clearance_decision as string | null)
    || ['visibility_restricted', 'preservation_hold', 'ingest_closed', 'security_clearance_eligible', 'quarantined'].some(key => typeof s[key] !== 'boolean')
    || !['await_separate_document_authority', 'designated_human_review', 'await_authorized_security_handling'].includes(s.next_action as string)) return unexpected();

  if ((s.state === 'not_finalized') !== (s.verified_sha256 === null)
    || s.security_clearance_eligible !== (s.state === 'security_clearance_eligible') || s.quarantined === s.security_clearance_eligible
    || s.next_action !== (s.security_clearance_eligible ? 'await_separate_document_authority'
      : s.state === 'human_review_required' ? 'designated_human_review' : 'await_authorized_security_handling')
    || s.ingest_closed !== (s.state === 'ingest_closed')
    || (s.clearance_decision_id === null) !== (s.clearance_decision === null)
    || (s.scan_state === 'pending' && (s.scan_attempt_id !== null || s.scan_observation_id !== null || s.clearance_decision_id !== null))
    || (s.scan_state === 'running' && (s.scan_attempt_id === null || s.scan_observation_id !== null || s.clearance_decision_id !== null))
    || (s.scan_state === 'result' && (s.scan_attempt_id === null || s.scan_observation_id === null || s.malware_outcome === null || s.phi_signal === null))
    || (s.scan_state !== 'result' && (s.malware_outcome !== null || s.phi_signal !== null))
    || (s.state === 'scan_pending' && s.scan_state !== 'pending') || (s.state === 'scan_running' && s.scan_state !== 'running')
    || (s.state === 'scan_failed' && s.malware_outcome !== 'error') || (s.state === 'malware_blocked' && s.malware_outcome !== 'blocked')
    || (s.state === 'restricted' && !s.visibility_restricted)
    || (s.security_clearance_eligible && (s.scan_state !== 'result' || s.malware_outcome !== 'pass'
      || s.clearance_decision !== 'cleared_no_phi' || s.visibility_restricted || s.ingest_closed
      || s.next_action !== 'await_separate_document_authority'))) return unexpected();

  // Project only the frozen status surface; never retain extra provider data.
  const result = s as PrivateObjectSecuritySnapshot;
  return { object_id: result.object_id, state: result.state, security_revision: result.security_revision,
    verified_sha256: result.verified_sha256, scan_state: result.scan_state, scan_attempt_id: result.scan_attempt_id,
    scan_observation_id: result.scan_observation_id, clearance_decision_id: result.clearance_decision_id,
    malware_outcome: result.malware_outcome, phi_signal: result.phi_signal, clearance_decision: result.clearance_decision,
    visibility_restricted: result.visibility_restricted, preservation_hold: result.preservation_hold,
    ingest_closed: result.ingest_closed, security_clearance_eligible: result.security_clearance_eligible,
    quarantined: result.quarantined, next_action: result.next_action };
}

export class PrivateObjectSecurityApi {
  constructor(private readonly client: SupabaseClient) {}
  private async invoke(name: 'private_object_security_status' | 'report_private_object_phi',
    args: Record<string, string | number>, objectId: string, signal?: AbortSignal) {
    if (signal?.aborted) throw new DOMException('Canceled', 'AbortError');
    let query = this.client.rpc(name, args).retry(false);
    if (signal) query = query.abortSignal(signal);
    const result = await query;
    if (signal?.aborted) throw new DOMException('Canceled', 'AbortError');
    if (result.error) {
      const code = result.error.code;
      if (code === '28000' || result.status === 401) throw new PrivateObjectSecurityError('unauthenticated');
      if (code === '42501' || result.status === 403) throw new PrivateObjectSecurityError('unavailable');
      if (code === '40001') throw new PrivateObjectSecurityError('conflict');
      if (code === '55000') throw new PrivateObjectSecurityError('closed');
      if (code === '22023') throw new PrivateObjectSecurityError('validation');
      throw new PrivateObjectSecurityError('backend');
    }
    return parseSnapshot(result.data, objectId);
  }
  async status(objectId: string, signal?: AbortSignal) {
    assertUuid(objectId, 'upload');
    return this.invoke('private_object_security_status', { p_object_id: objectId }, objectId, signal);
  }
  async report(objectId: string, expectedRevision: number, signal?: AbortSignal) {
    assertUuid(objectId, 'upload');
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new PrivateObjectSecurityError('validation');
    const result = await this.invoke('report_private_object_phi', { p_object_id: objectId, p_expected_revision: expectedRevision }, objectId, signal);
    if (!result.visibility_restricted || result.security_clearance_eligible || !result.quarantined || result.ingest_closed
      || result.clearance_decision_id !== null || result.state === 'not_finalized'
      || !['phi_suspected', 'scan_failed', 'malware_blocked'].includes(result.state)
      || ![expectedRevision, expectedRevision + 1].includes(result.security_revision)) return unexpected();
    return result;
  }
}
