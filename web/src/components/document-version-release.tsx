import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DocumentReleaseApi, DocumentReleaseError, type DocumentReleaseIntent, type DocumentReleaseReceipt,
  type ReleaseAudience, type ReleaseStatus, type RecipientReleaseMetadata, type WithdrawalReason } from '../lib/document-release-api';
import type { DocumentVersion } from '../lib/document-version-api';
import { isAbort } from '../lib/errors';
import { useRuntime } from '../lib/runtime';

type Read<T> = { state: 'idle' | 'loading' } | { state: 'ready'; value: T; check: number }
  | { state: 'error'; error: DocumentReleaseError };
type Outcome = { state: 'idle' | 'sending' } | { state: 'saved'; receipt: DocumentReleaseReceipt }
  | { state: 'error'; error: DocumentReleaseError; check: number };
const wrap = { overflowWrap: 'anywhere' as const };
const summaryStyle = { minHeight: '44px', paddingBlock: '0.75rem', cursor: 'pointer' };
const labels = { unreleased: 'Not released', current: 'Current release', superseded: 'Superseded release', withdrawn: 'Withdrawn release' };
const reasonLabels: Record<WithdrawalReason, string> = {
  release_error: 'Release error', audience_change: 'Audience change', security_concern: 'Security concern',
};
const releaseAcknowledgment = 'I am releasing metadata for this exact synthetic version to only the selected recipient grants.';
const withdrawalAcknowledgment = 'I am withdrawing this exact release; history is preserved and no earlier release is restored.';

export function DocumentVersionRelease({ documentId, version, blocked = false, onPendingChange }: {
  documentId: string; version: DocumentVersion; blocked?: boolean; onPendingChange: (pending: boolean) => void;
}) {
  const { api: runtimeApi, handleFailure } = useRuntime();
  const api = useMemo(() => new DocumentReleaseApi(runtimeApi.client), [runtimeApi.client]);
  const id = useId();
  const mounted = useRef(false), readController = useRef<AbortController | null>(null), mutationController = useRef<AbortController | null>(null);
  const readCheck = useRef(0), pendingCallback = useRef(onPendingChange);
  pendingCallback.current = onPendingChange;
  const [read, setRead] = useState<Read<ReleaseStatus>>({ state: 'idle' });
  const [audience, setAudience] = useState<Read<ReleaseAudience>>({ state: 'idle' });
  const [metadata, setMetadata] = useState<Read<RecipientReleaseMetadata>>({ state: 'idle' });
  const [outcome, setOutcome] = useState<Outcome>({ state: 'idle' });
  const [attempt, setAttempt] = useState<DocumentReleaseIntent | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false), [withdrawConfirmed, setWithdrawConfirmed] = useState(false);
  const [reason, setReason] = useState<WithdrawalReason | ''>('');
  const busy = outcome.state === 'sending';
  const reading = read.state === 'loading' || audience.state === 'loading' || metadata.state === 'loading';
  const identity = { documentId, versionId: version.version_id, verifiedSha256: version.verified_sha256 };
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false; readController.current?.abort(); mutationController.current?.abort();
      readController.current = null; mutationController.current = null; pendingCallback.current(false);
    };
  }, []);
  useLayoutEffect(() => { pendingCallback.current(busy || uncertain); }, [busy, uncertain]);
  const resetChoice = () => { setSelected([]); setConfirmed(false); setWithdrawConfirmed(false); setReason(''); };
  const failure = (error: unknown) => error instanceof DocumentReleaseError ? error : new DocumentReleaseError('backend');
  const currentRead = (controller: AbortController) => mounted.current && !controller.signal.aborted && readController.current === controller;

  const checkStatus = async () => {
    if (!mounted.current || mutationController.current) return;
    readController.current?.abort();
    const controller = new AbortController(); readController.current = controller;
    const check = ++readCheck.current;
    setRead({ state: 'loading' }); setAudience({ state: 'idle' }); setMetadata({ state: 'idle' }); resetChoice();
    try {
      const value = await api.status(identity, controller.signal);
      if (currentRead(controller)) setRead({ state: 'ready', value, check });
    } catch (error) {
      if (!currentRead(controller) || isAbort(error)) return;
      const errorValue = failure(error);
      if (errorValue.reason === 'unavailable' || errorValue.reason === 'unauthenticated') {
        setOutcome(previous => previous.state === 'saved' ? { state: 'idle' } : previous);
      }
      setRead({ state: 'error', error: errorValue }); handleFailure(errorValue);
    } finally { if (readController.current === controller) readController.current = null; }
  };

  const loadAudience = async () => {
    if (!mounted.current || mutationController.current || readController.current || blocked || attempt
      || version.visibility_restricted || read.state !== 'ready' || !read.value.can_prepare_release) return;
    const observed = read.value, check = read.check;
    const controller = new AbortController(); readController.current = controller;
    setAudience({ state: 'loading' }); resetChoice();
    try {
      const value = await api.audience(identity, controller.signal);
      if (!currentRead(controller)) return;
      if (value.document_revision !== observed.document_revision || value.review_revision !== observed.review_revision
        || value.release_revision !== observed.release_revision) throw new DocumentReleaseError('conflict');
      setAudience({ state: 'ready', value, check });
    } catch (error) {
      if (!currentRead(controller) || isAbort(error)) return;
      const errorValue = failure(error);
      setAudience({ state: 'error', error: errorValue }); setRead({ state: 'idle' }); handleFailure(errorValue);
    } finally { if (readController.current === controller) readController.current = null; }
  };

  const readRecipientMetadata = async (visibility: 'current' | 'historical') => {
    if (!mounted.current || mutationController.current || readController.current) return;
    if (visibility === 'historical' && (read.state !== 'ready' || read.value.release_state !== 'superseded')) return;
    const controller = new AbortController(); readController.current = controller;
    setMetadata({ state: 'loading' });
    try {
      const value = visibility === 'current' ? await api.current(documentId, controller.signal) : await api.historical(identity, controller.signal);
      if (currentRead(controller)) setMetadata({ state: 'ready', value, check: readCheck.current });
    } catch (error) {
      if (!currentRead(controller) || isAbort(error)) return;
      const errorValue = failure(error); setMetadata({ state: 'error', error: errorValue }); handleFailure(errorValue);
    } finally { if (readController.current === controller) readController.current = null; }
  };

  const submit = async (kind: DocumentReleaseIntent['kind']) => {
    if (!mounted.current || mutationController.current || readController.current || (!attempt && blocked)) return;
    let intent = attempt;
    if (!intent) {
      if (read.state !== 'ready') return;
      const observed = read.value;
      if (kind === 'release') {
        if (version.visibility_restricted || !observed.can_prepare_release || !observed.approved_review_decision_id || !confirmed
          || audience.state !== 'ready' || audience.check !== read.check || selected.length < 1 || selected.length > 32
          || !selected.every(grant => audience.value.recipients.some(recipient => recipient.grant_id === grant))) return;
        intent = Object.freeze({ ...identity, kind, documentRevision: observed.document_revision, reviewRevision: observed.review_revision,
          releaseRevision: observed.release_revision, approvedReviewDecisionId: observed.approved_review_decision_id,
          previousReleaseId: observed.current_release_id, recipientGrantIds: Object.freeze([...selected].sort()),
          requestId: crypto.randomUUID(), attestationCode: 'released_exact_synthetic_version' as const });
      } else {
        // controller_eligible covers new release safety/content requirements.
        // It is NOT a can_withdraw flag. Narrowing rechecks its own server rules.
        if (!observed.release_id || !['current', 'superseded'].includes(observed.release_state) || !reason || !withdrawConfirmed) return;
        intent = Object.freeze({ ...identity, kind, releaseId: observed.release_id, releaseRevision: observed.release_revision,
          requestId: crypto.randomUUID(), reasonCode: reason });
      }
    }
    const controller = new AbortController(); mutationController.current = controller;
    setAttempt(intent); resetChoice(); setAudience({ state: 'idle' }); setMetadata({ state: 'idle' }); setRead({ state: 'idle' });
    setOutcome({ state: 'sending' });
    try {
      const receipt = intent.kind === 'release' ? await api.release(intent, controller.signal) : await api.withdraw(intent, controller.signal);
      if (!mounted.current || controller.signal.aborted || mutationController.current !== controller) return;
      setAttempt(null); setUncertain(false); setOutcome({ state: 'saved', receipt });
      mutationController.current = null;
      void checkStatus();
    } catch (error) {
      if (!mounted.current || controller.signal.aborted || mutationController.current !== controller || isAbort(error)) return;
      const errorValue = failure(error);
      setOutcome({ state: 'error', error: errorValue, check: readCheck.current });
      if (errorValue.reason === 'backend' || errorValue.reason === 'unexpected') setUncertain(true);
      // Later denials and GET observations cannot resolve an earlier lost write.
      setRead({ state: 'idle' }); handleFailure(errorValue);
    } finally { if (mutationController.current === controller) mutationController.current = null; }
  };

  const snapshot = read.state === 'ready' ? read.value : null;
  const canPrepare = !blocked && !attempt && !busy && !reading;
  const canStartNew = attempt && !uncertain && !blocked && outcome.state === 'error' && read.state === 'ready' && read.check > outcome.check;
  const receipt = outcome.state === 'saved' ? outcome.receipt : null;
  return <section aria-labelledby={id + '-title'} aria-busy={busy || reading} style={{ marginTop: 'var(--space-5)', ...wrap }}>
    <h5 id={id + '-title'} style={{ fontSize: '1rem' }}>Synthetic metadata release</h5>
    <p className="field-hint">Metadata only. Separate human controller and recipient grants are required. Released-file downloads and professional release are unavailable.</p>
    <button type="button" className="button secondary" disabled={busy || reading} onClick={() => { void checkStatus(); }}>
      {read.state === 'idle' ? 'Check release status' : 'Refresh release status'}</button>
    {read.state === 'loading' && <p role="status">Checking this exact version’s release status…</p>}
    {read.state === 'error' && <p role="alert" className="form-error">{read.error.message}</p>}
    {snapshot && <>
      <p><strong>Recorded release state: {labels[snapshot.release_state]}</strong></p>
      <p className="field-hint">Document revision {snapshot.document_revision} · review revision {snapshot.review_revision} · release revision {snapshot.release_revision}</p>
      {snapshot.release_state === 'superseded' && <p className="field-hint">This version is historical. Ordinary recipient reads follow the current release; historical access requires a separate grant.</p>}
      {snapshot.release_state === 'withdrawn' && <p className="field-hint">Withdrawal preserves history and restores no earlier release. This version cannot be released again.</p>}
      {snapshot.release_state === 'unreleased' && !snapshot.can_prepare_release && <p className="field-hint">No current preparation permission was returned. Exact approval, a separate controller assignment, safe content and a newer version are required.</p>}
      {canPrepare && snapshot.can_prepare_release && !version.visibility_restricted && <div>
        <p className="field-hint">{snapshot.current_release_id
          ? 'A successful release will replace the current release. Selecting this draft has not changed it.'
          : 'No current release was observed. Only a confirmed release can establish one.'}</p>
        <button type="button" className="button secondary" onClick={() => { void loadAudience(); }}>Load eligible recipient grants</button>
        {audience.state === 'ready' && <>
          <fieldset style={{ minWidth: 0, marginBlock: 'var(--space-3)' }}><legend>Exact recipient grants</legend>
            {audience.value.recipients.length === 0 && <p>No eligible recipient grants were returned. Nothing is selected.</p>}
            {audience.value.recipients.map(recipient => <label key={recipient.grant_id} style={{ display: 'flex', gap: '0.75rem', minHeight: '44px', paddingBlock: '0.75rem' }}>
              <input type="checkbox" checked={selected.includes(recipient.grant_id)}
                disabled={!selected.includes(recipient.grant_id) && selected.length >= 32}
                onChange={event => {
                  setSelected(previous => event.target.checked ? [...previous, recipient.grant_id] : previous.filter(grant => grant !== recipient.grant_id));
                  setConfirmed(false);
                }} />
              <span>{recipient.recipient_display_name}<small style={{ display: 'block', ...wrap }}>Grant {recipient.grant_id}</small></span>
            </label>)}
          </fieldset>
          <p className="field-hint">{selected.length} of up to 32 grants selected. New grants are never silently added.</p>
          <label style={{ minHeight: '44px', paddingBlock: '0.75rem' }}><input type="checkbox" checked={confirmed} disabled={selected.length === 0}
            onChange={event => setConfirmed(event.target.checked)} /><span>{releaseAcknowledgment}</span></label>
          <button type="button" className="button primary" disabled={!confirmed || selected.length === 0} onClick={() => { void submit('release'); }}>Release exact metadata</button>
        </>}
      </div>}
      {canPrepare && snapshot.release_id && ['current', 'superseded'].includes(snapshot.release_state) && <details style={{ marginTop: 'var(--space-3)' }}>
        <summary style={summaryStyle}>Withdraw this exact release</summary>
        <p>Withdrawal narrows recipient visibility. The server checks your current exact controller assignment and logical-view access. Eligibility for a new release does not determine withdrawal authority.</p>
        <div className="field"><label htmlFor={id + '-reason'}>Withdrawal reason</label><select id={id + '-reason'} value={reason}
          onChange={event => { setReason(event.target.value as WithdrawalReason | ''); setWithdrawConfirmed(false); }}>
          <option value="">Choose a reason</option>{Object.entries(reasonLabels).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
        </select></div>
        <label style={{ minHeight: '44px', paddingBlock: '0.75rem' }}><input type="checkbox" checked={withdrawConfirmed} disabled={!reason}
          onChange={event => setWithdrawConfirmed(event.target.checked)} /><span>{withdrawalAcknowledgment}</span></label>
        <button type="button" className="button secondary" disabled={!reason || !withdrawConfirmed} onClick={() => { void submit('withdraw'); }}>Withdraw exact release</button>
      </details>}
      <details><summary style={summaryStyle}>Release version and revisions</summary>
        <dl><dt>Exact version</dt><dd>{snapshot.version_id}</dd><dt>Verified SHA-256</dt><dd><code>{snapshot.verified_sha256}</code></dd>
          <dt>Approved review decision</dt><dd>{snapshot.approved_review_decision_id ?? 'None recorded'}</dd>
          <dt>This version’s release</dt><dd>{snapshot.release_id ?? 'None recorded'}</dd>
          <dt>Observed current release</dt><dd>{snapshot.current_release_id ?? 'None recorded'}</dd></dl>
      </details>
    </>}
    {audience.state === 'loading' && <p role="status">Checking explicitly provisioned recipient grants…</p>}
    {audience.state === 'error' && <p role="alert" className="form-error">{audience.error.message}</p>}
    {blocked && !attempt && <p role="status" className="field-hint">Another document operation is pending or uncertain. Resolve it before starting a release operation.</p>}
    {busy && <p role="status">Submitting the exact release operation; awaiting the server receipt…</p>}
    {outcome.state === 'error' && <div role="alert" className="form-error"><strong>Release operation not confirmed</strong><p>{outcome.error.message}</p></div>}
    {uncertain && <p role="alert" className="form-error">An earlier submission may already have committed. Status and recipient metadata reads cannot confirm it. Retry only the original frozen operation; do not replace its audience, reason or revisions.</p>}
    {attempt && <div className="notice">
      <strong>{attempt.kind === 'release' ? 'Frozen metadata release' : 'Frozen withdrawal: ' + reasonLabels[attempt.reasonCode]}</strong>
      <p className="field-hint">Request reference: <code>{attempt.requestId}</code> · release revision {attempt.releaseRevision}
        {attempt.kind === 'release' && <> · document revision {attempt.documentRevision} · review revision {attempt.reviewRevision} · {attempt.recipientGrantIds.length} recipient grants</>}</p>
      <details><summary style={summaryStyle}>Frozen exact references</summary><p>{attempt.versionId}<br /><code>{attempt.verifiedSha256}</code></p>
        {attempt.kind === 'release' ? <ul>{attempt.recipientGrantIds.map(grant => <li key={grant}>{grant}</li>)}</ul> : <p>Release {attempt.releaseId}</p>}</details>
      <p className="field-hint">Changing account, facility or login, or leaving this history clears only the local retry context, not a server transaction.</p>
    </div>}
    {outcome.state === 'error' && uncertain && attempt && <button type="button" className="button secondary" disabled={reading}
      onClick={() => { void submit(attempt.kind); }}>Retry exact release operation</button>}
    {outcome.state === 'error' && attempt && !uncertain && <p className="field-hint">Refresh release status, then deliberately prepare a new operation.</p>}
    {canStartNew && <button type="button" className="button secondary" onClick={() => {
      setAttempt(null); resetChoice(); setAudience({ state: 'idle' }); setOutcome({ state: 'idle' });
    }}>Review a new release operation</button>}
    {receipt && <div role="status" className="notice"><strong>{'withdrawal_id' in receipt ? 'Withdrawal recorded' : 'Metadata release recorded'}</strong>
      <p className="field-hint">Server receipt: <code>{'withdrawal_id' in receipt ? receipt.withdrawal_id : receipt.release_id}</code>. This proves the operation only, not continuing recipient access.</p>
      {'previous_release_id' in receipt && receipt.previous_release_id && <p className="field-hint">This operation replaced release {receipt.previous_release_id}. Its history was preserved.</p>}
    </div>}
    <details style={{ marginTop: 'var(--space-3)' }}><summary style={summaryStyle}>Recipient metadata checks</summary>
      <p>Recipient permission is separate from internal view, review and controller assignments. Current and historical reads use different grants. No released bytes are provided here.</p>
      <div className="button-row"><button type="button" className="button secondary" disabled={busy || reading}
        onClick={() => { void readRecipientMetadata('current'); }}>Check current recipient metadata</button>
        {snapshot?.release_state === 'superseded' && <button type="button" className="button secondary" disabled={busy || reading}
          onClick={() => { void readRecipientMetadata('historical'); }}>Check this historical version’s recipient metadata</button>}</div>
      {metadata.state === 'loading' && <p role="status">Checking current recipient entitlement…</p>}
      {metadata.state === 'error' && <p role="alert" className="form-error">{metadata.error.message}</p>}
      {metadata.state === 'ready' && <div role="status"><strong>{metadata.value.visibility === 'current' ? 'Current recipient metadata' : 'Historical recipient metadata'}</strong>
        <p>Version {metadata.value.version_ordinal} · metadata only</p><dl>
          <dt>Release</dt><dd>{metadata.value.release_id}</dd><dt>Returned version</dt><dd>{metadata.value.version_id}</dd>
          <dt>Verified SHA-256</dt><dd><code>{metadata.value.verified_sha256}</code></dd>
          <dt>Released at</dt><dd><time dateTime={metadata.value.released_at}>{new Date(metadata.value.released_at).toLocaleString()}</time></dd>
        </dl><p className="field-hint">This read does not change the selected draft or resolve an uncertain write.</p></div>}
    </details>
    <details><summary style={summaryStyle}>Release authority and boundaries</summary>
      <p>Only routine synthetic documents are eligible. The controller and each exact recipient grant are provisioned outside this browser. Owner access, reviewer status, a role label, AI output and a previous download do not create release authority or professional qualifications.</p>
      <p>Approval, recipient grants and all three revisions are rechecked on submission. Only a confirmed newer release replaces the current pointer. Withdrawal preserves history, clears no hold, restores no previous release and permits no same-version re-release.</p>
      <p>Internal content permission is independent. These metadata controls send no notification, sign nothing, change no scope or terms, and provide no released-file download.</p>
    </details>
  </section>;
}
