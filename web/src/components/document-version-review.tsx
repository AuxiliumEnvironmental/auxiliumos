import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ClipboardCheck, LockKeyhole } from 'lucide-react';
import { DocumentReviewApi, DocumentReviewError, type DocumentReviewIntent, type DocumentReviewReceipt,
  type DocumentReviewStatus, type ReviewDecision, type ReviewState } from '../lib/document-review-api';
import type { DocumentVersion } from '../lib/document-version-api';
import { isAbort } from '../lib/errors';
import { useRuntime } from '../lib/runtime';

type ReadState = { state: 'idle' | 'loading' } | { state: 'ready'; value: DocumentReviewStatus; check: number }
  | { state: 'error'; error: DocumentReviewError };
type Outcome = { state: 'idle' | 'sending' } | { state: 'saved'; receipt: DocumentReviewReceipt }
  | { state: 'error'; error: DocumentReviewError; check: number };
const labels: Record<ReviewState, string> = {
  internal_draft: 'Not requested', under_review: 'Under internal review', approved_internal: 'Approved internally',
  changes_requested: 'Changes requested', rejected: 'Rejected',
};
const wrap = { overflowWrap: 'anywhere' as const };
const requestAcknowledgment = 'I am requesting an internal human review of this exact immutable version.';
const decisionAttestation = 'I have reviewed this exact synthetic version and am recording my own internal review decision.';

export function DocumentVersionReview({ documentId, version, onPendingChange }: {
  documentId: string; version: DocumentVersion; onPendingChange: (pending: boolean) => void;
}) {
  const { api: runtimeApi, handleFailure } = useRuntime();
  const api = useMemo(() => new DocumentReviewApi(runtimeApi.client), [runtimeApi.client]);
  const id = useId();
  const mounted = useRef(false);
  const readController = useRef<AbortController | null>(null);
  const mutationController = useRef<AbortController | null>(null);
  const readCheck = useRef(0);
  const pendingCallback = useRef(onPendingChange);
  pendingCallback.current = onPendingChange;
  const [read, setRead] = useState<ReadState>({ state: 'idle' });
  const [outcome, setOutcome] = useState<Outcome>({ state: 'idle' });
  const [attempt, setAttempt] = useState<DocumentReviewIntent | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [choice, setChoice] = useState<ReviewDecision | ''>('');
  const busy = outcome.state === 'sending';
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false; readController.current?.abort(); mutationController.current?.abort();
      readController.current = null; mutationController.current = null; pendingCallback.current(false);
    };
  }, []);
  useLayoutEffect(() => { pendingCallback.current(busy || uncertain); }, [busy, uncertain]);

  const checkStatus = async () => {
    if (!mounted.current || mutationController.current || version.visibility_restricted) return;
    readController.current?.abort();
    const current = new AbortController(); readController.current = current;
    const check = ++readCheck.current;
    setRead({ state: 'loading' }); setConfirmed(false); setChoice('');
    try {
      const value = await api.status({ documentId, versionId: version.version_id, verifiedSha256: version.verified_sha256 }, current.signal);
      if (mounted.current && !current.signal.aborted && readController.current === current) setRead({ state: 'ready', value, check });
    } catch (error) {
      if (!mounted.current || current.signal.aborted || readController.current !== current || isAbort(error)) return;
      const failure = error instanceof DocumentReviewError ? error : new DocumentReviewError('backend');
      if (failure.reason === 'unavailable' || failure.reason === 'unauthenticated') {
        setOutcome(previous => previous.state === 'saved' ? { state: 'idle' } : previous);
      }
      setRead({ state: 'error', error: failure }); handleFailure(failure);
    } finally { if (readController.current === current) readController.current = null; }
  };

  const submit = async (kind: DocumentReviewIntent['kind']) => {
    if (!mounted.current || mutationController.current || readController.current || version.visibility_restricted) return;
    let intent = attempt;
    if (!intent) {
      if (read.state !== 'ready' || !confirmed) return;
      const common = { documentId, versionId: version.version_id, verifiedSha256: version.verified_sha256,
        documentRevision: read.value.document_revision, reviewRevision: read.value.review_revision, requestId: crypto.randomUUID() };
      if (kind === 'request') {
        if (!read.value.can_request) return;
        intent = Object.freeze({ ...common, kind });
      } else {
        if (!read.value.can_decide || !read.value.request || !choice) return;
        intent = Object.freeze({ ...common, kind, reviewRequestId: read.value.request.review_request_id,
          decision: choice, attestationCode: 'reviewed_exact_synthetic_version' as const });
      }
    }
    // The retained intent wins over all later status observations and UI input.
    const current = new AbortController(); mutationController.current = current;
    setAttempt(intent); setConfirmed(false); setChoice(''); setOutcome({ state: 'sending' });
    try {
      const receipt = intent.kind === 'request' ? await api.request(intent, current.signal) : await api.decide(intent, current.signal);
      if (!mounted.current || current.signal.aborted || mutationController.current !== current) return;
      setUncertain(false); setAttempt(null); setOutcome({ state: 'saved', receipt });
      // A receipt proves only this operation. Capabilities come from a new read.
      mutationController.current = null;
      void checkStatus();
    } catch (error) {
      if (!mounted.current || current.signal.aborted || mutationController.current !== current || isAbort(error)) return;
      const failure = error instanceof DocumentReviewError ? error : new DocumentReviewError('backend');
      setOutcome({ state: 'error', error: failure, check: readCheck.current });
      if (failure.reason === 'backend' || failure.reason === 'unexpected') setUncertain(true);
      // A denial invalidates the visible capabilities, but never resolves an
      // earlier lost response or replaces its original idempotency context.
      setRead({ state: 'idle' }); handleFailure(failure);
    } finally { if (mutationController.current === current) mutationController.current = null; }
  };

  const snapshot = read.state === 'ready' ? read.value : null;
  const canPrepare = !attempt && !busy && read.state === 'ready';
  const canStartNew = attempt && !uncertain && outcome.state === 'error' && read.state === 'ready' && read.check > outcome.check;
  const receipt = outcome.state === 'saved' ? outcome.receipt : null;
  return <section aria-labelledby={`${id}-title`} aria-busy={busy || read.state === 'loading'}
    style={{ marginTop: 'var(--space-5)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border)', ...wrap }}>
    <div className="section-intro"><div><p className="entity-type">Human review · Exact version {version.version_ordinal}</p>
      <h5 id={`${id}-title`} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', margin: '0.5rem 0' }}>
        <ClipboardCheck size={18} aria-hidden="true" />Internal review</h5></div>
      <span className="status-label unavailable"><LockKeyhole size={13} aria-hidden="true" />Release unavailable</span></div>
    <p className="field-hint">An internal decision applies only to this version. It never releases a document or grants content access.</p>
    {version.visibility_restricted ? <p role="status" className="field-hint">Internal review unavailable while this version is restricted.</p> : <>
      <div className="button-row"><button type="button" className="button secondary" disabled={busy || read.state === 'loading'}
        onClick={() => { void checkStatus(); }}>{read.state === 'idle' ? 'Check internal review status' : 'Refresh internal review status'}</button></div>
      {read.state === 'loading' && <p role="status">Checking current exact-version review access…</p>}
      {read.state === 'error' && <p role="alert" className="form-error">{read.error.message}</p>}
      {snapshot && <>
        <div className="notice" style={{ marginTop: 'var(--space-3)' }}>
          <strong>Recorded review state: {labels[snapshot.historical_review_state]}</strong>
          <p className="field-hint">Current document revision {snapshot.document_revision} · review revision {snapshot.review_revision}</p>
          {snapshot.request && <p className="field-hint">Requested <time dateTime={snapshot.request.requested_at}>{new Date(snapshot.request.requested_at).toLocaleString()}</time></p>}
          {snapshot.decision && <p className="field-hint">Decision recorded <time dateTime={snapshot.decision.decided_at}>{new Date(snapshot.decision.decided_at).toLocaleString()}</time>. This historical decision remains a record if access or assignment later changes.</p>}
          {(snapshot.historical_review_state === 'changes_requested' || snapshot.historical_review_state === 'rejected')
            && <p>A replacement immutable version is needed for another review. This decision cannot be edited or reopened.</p>}
        </div>
        {!snapshot.can_request && !snapshot.can_decide && !snapshot.decision && <p className="field-hint">
          {snapshot.request ? 'No current decision permission was returned. An independently assigned reviewer needs current access to this exact version.'
            : 'No current request permission was returned. Account membership or an administrative role alone does not grant it.'}</p>}
        {canPrepare && snapshot.can_request && <div style={{ marginTop: 'var(--space-3)' }}>
          <label style={{ minHeight: '44px', paddingBlock: '0.75rem' }}><input type="checkbox" checked={confirmed}
            onChange={event => setConfirmed(event.target.checked)} /><span>{requestAcknowledgment}</span></label>
          <button type="button" className="button primary" disabled={!confirmed} onClick={() => { void submit('request'); }}>Request internal review</button>
        </div>}
        {canPrepare && snapshot.can_decide && <div style={{ marginTop: 'var(--space-4)' }}>
          <p className="field-hint">Current server permission includes a separate assignment for this exact synthetic version. Administrative access and a previous download are insufficient.</p>
          <div className="field"><label htmlFor={`${id}-decision`}>Internal review decision</label>
            <select id={`${id}-decision`} value={choice} onChange={event => { setChoice(event.target.value as ReviewDecision | ''); setConfirmed(false); }}>
              <option value="">Choose a decision</option><option value="approved_internal">Approve internally</option>
              <option value="changes_requested">Request changes</option><option value="rejected">Reject</option>
            </select></div>
          <label style={{ minHeight: '44px', paddingBlock: '0.75rem' }}><input type="checkbox" checked={confirmed} disabled={!choice}
            onChange={event => setConfirmed(event.target.checked)} /><span>{decisionAttestation}</span></label>
          <p className="field-hint">The decision is final for this version. This attestation does not establish professional qualifications or approve real scientific conclusions.</p>
          <button type="button" className="button primary" disabled={!choice || !confirmed} onClick={() => { void submit('decision'); }}>Record internal decision</button>
        </div>}
      </>}
      {busy && <p role="status">Submitting the exact review intent; awaiting the server receipt…</p>}
      {outcome.state === 'error' && <div role="alert" className="form-error"><strong>Review operation not confirmed</strong><p>{outcome.error.message}</p></div>}
      {uncertain && <p role="alert" className="form-error">An earlier submission may already have committed. A status or history refresh cannot confirm that request. Only retry the exact frozen intent; do not start a replacement to guess its outcome.</p>}
      {attempt && <div className="notice" style={{ marginTop: 'var(--space-3)' }}>
        <strong>{attempt.kind === 'request' ? 'Frozen review request' : `Frozen decision: ${labels[attempt.decision]}`}</strong>
        <p className="field-hint">Request reference: <code>{attempt.requestId}</code><br />Document revision {attempt.documentRevision} · review revision {attempt.reviewRevision}</p>
        <p className="field-hint">Changing account, facility, login or leaving this history clears this browser’s retry context, not any recorded server operation.</p>
      </div>}
      {outcome.state === 'error' && uncertain && attempt && <button type="button" className="button secondary"
        disabled={read.state === 'loading'} onClick={() => { void submit(attempt.kind); }}>Retry exact review operation</button>}
      {outcome.state === 'error' && attempt && !uncertain && <p className="field-hint">Check current review status, then deliberately prepare a new operation if permission is returned.</p>}
      {canStartNew && <button type="button" className="button secondary" onClick={() => {
        setAttempt(null); setConfirmed(false); setChoice(''); setOutcome({ state: 'idle' });
      }}>Review a new operation</button>}
      {receipt && <div role="status" className="notice" style={{ marginTop: 'var(--space-3)' }}>
        <strong>{'state' in receipt ? 'Internal review request recorded' : `Internal decision recorded: ${labels[receipt.decision]}`}</strong>
        <p className="field-hint">Server receipt: <code>{'state' in receipt ? receipt.review_request_id : receipt.decision_id}</code>. This confirms the operation only; current access is checked separately.</p>
      </div>}
    </>}
    <details style={{ marginTop: 'var(--space-3)' }}><summary style={{ minHeight: '44px', paddingBlock: '0.75rem', cursor: 'pointer' }}>Review authority and boundaries</summary>
      <p>Only synthetic internal reviews are enabled. Reviewer assignments are provisioned outside this browser. The owner’s account and facility capabilities do not confer reviewer authority. No AI output, role label, security clearance or historical decision permits a release.</p>
      <p>One immutable request and one final human decision are recorded per version. New drafts do not supersede existing releases. Scope, signatures, client audiences and real-person qualification gates remain separate.</p>
    </details>
  </section>;
}
