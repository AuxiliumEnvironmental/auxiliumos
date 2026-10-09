import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { PrivateObjectSecurityApi, PrivateObjectSecurityError, type PrivateObjectSecuritySnapshot } from '../lib/private-object-security-api';
import { asRuntimeError, isAbort, type RuntimeError } from '../lib/errors';
import { useRuntime } from '../lib/runtime';
import { LoadingState } from './shared';

const labels: Record<PrivateObjectSecuritySnapshot['state'], string> = {
  not_finalized: 'Security review unavailable: upload not finalized', ingest_closed: 'Ingest closed',
  scan_pending: 'Security scan pending', scan_running: 'Security scan running', scan_failed: 'Security scan failed',
  malware_blocked: 'Blocked by security scan', phi_suspected: 'Suspected PHI or restricted data',
  rejected: 'Security review rejected', restricted: 'Visibility restricted',
  security_clearance_eligible: 'Security eligibility recorded', human_review_required: 'Designated human security review required',
};
const scanLabels = { pending: 'Pending', running: 'Running', result: 'Result recorded' };
const malwareLabels = { pass: 'Synthetic check passed', blocked: 'Blocked', error: 'Check failed' };
const phiLabels = { no_signal: 'No signal recorded; not a PHI guarantee', suspected: 'Suspicion recorded', not_checked: 'Not checked' };
const decisionLabels = { cleared_no_phi: 'No-PHI security disposition recorded', rejected: 'Rejected', suspected_phi: 'Suspicion recorded' };
type Props = { objectId: string; accountId: string; facilityId: string; onAccessUnavailable: () => void };
type Resource = { state: 'loading' | 'reporting' } | { state: 'ready'; value: PrivateObjectSecuritySnapshot }
  | { state: 'error'; error: RuntimeError };

export function PrivateObjectSecurityStatus(props: Props) {
  const { state } = useRuntime();
  if (state.status !== 'ready') return null;
  return <SecurityPanel key={`${state.context.profileId}:${state.revision}:${props.accountId}:${props.facilityId}:${props.objectId}`} {...props} />;
}

function SecurityPanel({ objectId, onAccessUnavailable }: Props) {
  const { api: runtimeApi, handleFailure } = useRuntime();
  const api = useMemo(() => new PrivateObjectSecurityApi(runtimeApi.client), [runtimeApi.client]);
  const inputId = useId();
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const [resource, setResource] = useState<Resource>({ state: 'loading' });
  const [confirmed, setConfirmed] = useState(false);
  const [reportOutcome, setReportOutcome] = useState<'none' | 'unconfirmed' | 'confirmed'>('none');

  const run = useCallback(async (operation: 'loading' | 'reporting', request: (signal: AbortSignal) => Promise<PrivateObjectSecuritySnapshot>) => {
    if (controller.current) return;
    const current = new AbortController();
    controller.current = current;
    // Hide the prior snapshot while checking. In particular, never leave an
    // earlier eligible indication visible during an uncertain narrowing action.
    setResource({ state: operation }); setConfirmed(false);
    if (operation === 'reporting') setReportOutcome('unconfirmed');
    else setReportOutcome(previous => previous === 'confirmed' ? 'none' : previous);
    try {
      const value = await request(current.signal);
      if (!mounted.current || current.signal.aborted || controller.current !== current) return;
      setResource({ state: 'ready', value });
      if (operation === 'reporting') setReportOutcome('confirmed');
    } catch (error) {
      if (!mounted.current || current.signal.aborted || isAbort(error) || controller.current !== current) return;
      const failure = asRuntimeError(error);
      setResource({ state: 'error', error: failure });
      if (failure.code === 'session_expired') handleFailure(failure);
      if (failure instanceof PrivateObjectSecurityError && failure.reason === 'unavailable') onAccessUnavailable();
    } finally { if (controller.current === current) controller.current = null; }
  }, [handleFailure, onAccessUnavailable]);
  const refresh = useCallback(() => run('loading', signal => api.status(objectId, signal)), [api, objectId, run]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => { mounted.current = false; controller.current?.abort(); controller.current = null; };
  }, [refresh]);

  const busy = resource.state === 'loading' || resource.state === 'reporting';
  const snapshot = resource.state === 'ready' ? resource.value : null;
  return <section className="notice" aria-labelledby={`${inputId}-title`} aria-busy={busy}>
    <h3 id={`${inputId}-title`}>Current security review status</h3>
    <p>Checked separately from transport. Security eligibility is not document approval, professional review, permission to read bytes, or release.</p>
    {resource.state === 'loading' ? <LoadingState label="Checking current security status" />
      : resource.state === 'reporting' ? <LoadingState label="Reporting concern; outcome not yet confirmed" />
        : resource.state === 'error' ? <div role="alert"><strong>Security status unavailable</strong><p>{resource.error.message}</p></div> : null}
    {snapshot && <div role="status" style={{ marginTop: 'var(--space-3)' }}>
      <strong>{labels[snapshot.state]}</strong>
      <p>Security revision: {snapshot.security_revision}. This is the last confirmed security snapshot; refresh to check again.</p>
      <dl style={{ marginBlock: 'var(--space-3)' }}>
        <dt>Security scan</dt><dd>{scanLabels[snapshot.scan_state]}</dd>
        <dt>Malware result</dt><dd>{snapshot.malware_outcome ? malwareLabels[snapshot.malware_outcome] : 'No current result'}</dd>
        <dt>Scanner PHI signal</dt><dd>{snapshot.phi_signal ? phiLabels[snapshot.phi_signal] : 'No current scan signal'}</dd>
        <dt>Designated security review</dt><dd>{snapshot.clearance_decision ? decisionLabels[snapshot.clearance_decision] : 'No current decision'}</dd>
        <dt>Visibility restriction</dt><dd>{snapshot.visibility_restricted ? 'Restricted' : 'No restriction recorded; this does not grant content access'}</dd>
        <dt>Preservation hold</dt><dd>{snapshot.preservation_hold ? 'Hold recorded' : 'No hold recorded; this does not authorize destruction'}</dd>
      </dl>
      {snapshot.security_clearance_eligible && <p><strong>Security eligibility only.</strong> Separate document authority is still required. No viewer or release action is provided.</p>}
      {snapshot.ingest_closed && <p>Ingest is closed. Reporting and security changes are unavailable here; preserved bytes and history are not deleted.</p>}
    </div>}
    {reportOutcome === 'unconfirmed' && !busy && <p className="form-error" role="alert">The earlier report outcome is not confirmed. It may already have restricted access. Refresh security status before any further action; a refreshed snapshot alone does not confirm who changed it.</p>}
    {reportOutcome === 'confirmed' && <p role="status">Concern report acknowledged. Access is restricted and current security clearance is invalidated. Bytes and history are preserved. This records suspicion, not PHI detection.</p>}
    <div className="button-row"><button className="button secondary" type="button" disabled={busy} onClick={() => { void refresh(); }}>Refresh security status</button></div>
    {snapshot && !snapshot.ingest_closed && snapshot.state !== 'not_finalized' && <div style={{ marginTop: 'var(--space-4)' }}>
      <p>Suspect PHI or restricted data? Reporting narrows access and invalidates security clearance. It never deletes bytes or history. Do not enter, paste, or describe the suspected data here.</p>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', minHeight: '44px', paddingBlock: 'var(--space-3)' }}>
        <input id={inputId} type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)}
          style={{ width: '18px', height: '18px', minHeight: '18px', flexShrink: 0, padding: 0, marginTop: '3px' }} />
        <span>I understand this reports a suspicion and restricts access without deleting the file.</span>
      </label>
      <button className="button secondary" type="button" disabled={busy || !confirmed} onClick={() => {
        if (!confirmed || busy) return;
        void run('reporting', signal => api.report(objectId, snapshot.security_revision, signal));
      }}>Report suspected restricted data</button>
    </div>}
    <p className="field-hint" style={{ marginTop: 'var(--space-3)' }}>Synthetic development only. OD-013 real-upload and incident-handling approval remains gated. This panel does not run a scanner, clear content, provision grants, or contact an incident responder.</p>
  </section>;
}
