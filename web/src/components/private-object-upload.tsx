import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { PrivateObjectApi, PrivateObjectError, PRIVATE_OBJECT_MAX_BYTES, PRIVATE_OBJECT_SYNTHETIC_PREFIX, type PrivateObjectStatus } from '../lib/private-object-api';
import { useRuntime } from '../lib/runtime';
import { RuntimeError } from '../lib/errors';
import { SyntheticBadge } from './shared';
import { PrivateObjectSecurityStatus } from './private-object-security-status';
import { DocumentVersions } from './document-versions';
import type { EligibleDocumentSource } from '../lib/document-version-api';

const labels: Record<PrivateObjectStatus['state'], string> = {
  reserved: 'Reserved; bytes not yet received', receiving: 'Upload pending confirmation',
  stored_unverified: 'Bytes verified; finalization pending', finalized: 'Upload finalized; security status separate', expired: 'Upload window expired; history preserved',
};

// Composed beneath an already selected account/facility. Being visible
// grants no authority: every backend request independently checks current grants.
export function PrivateObjectUpload({ accountId, facilityId }: { accountId: string; facilityId: string }) {
  const { api, state } = useRuntime();
  if (state.status !== 'ready') return null;
  return <UploadForm key={`${state.context.profileId}:${state.revision}:${accountId}:${facilityId}`}
    clientApi={api} accountId={accountId} facilityId={facilityId} />;
}

function UploadForm({ clientApi, accountId, facilityId }: {
  clientApi: ReturnType<typeof useRuntime>['api']; accountId: string; facilityId: string;
}) {
  const api = useMemo(() => new PrivateObjectApi(clientApi.client), [clientApi]);
  const { handleFailure } = useRuntime();
  const inputId = useId();
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const key = useRef(crypto.randomUUID());
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<PrivateObjectStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [inputVersion, setInputVersion] = useState(0);
  const [eligibleSource, setEligibleSource] = useState<EligibleDocumentSource>();
  const [securityCheck, setSecurityCheck] = useState(0);
  const onAdopted = useCallback(() => {
    // An immutable transaction receipt cannot establish continuing eligibility.
    setEligibleSource(undefined); setSecurityCheck(value => value + 1);
  }, []);
  const onSecurityUnavailable = useCallback(() => {
    controller.current?.abort(); controller.current = null; setBusy(false);
    key.current = crypto.randomUUID(); setAttempted(false); setStatus(null); setFile(null); setConfirmed(false);
    setInputVersion(value => value + 1); setEligibleSource(undefined); setError('This upload is unavailable to your current access.');
  }, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);

  async function run(operation: (signal: AbortSignal) => Promise<void>) {
    // The ref also prevents duplicate events before React paints busy=true.
    if (controller.current) return;
    const current = new AbortController(); controller.current = current;
    setBusy(true); setError(null); setEligibleSource(undefined);
    try { await operation(current.signal); }
    catch (failure) {
      if (mounted.current && !current.signal.aborted) {
        if (failure instanceof PrivateObjectError && ['unauthenticated', 'not_found_or_unavailable'].includes(failure.code)) {
          key.current = crypto.randomUUID(); setAttempted(false);
          setStatus(null); setFile(null); setConfirmed(false); setInputVersion(v => v + 1);
          if (failure.code === 'unauthenticated') handleFailure(new RuntimeError('session_expired', failure.message));
        }
        setError(failure instanceof PrivateObjectError ? failure.message : 'The upload could not be confirmed. Refresh status or retry the same file.');
      }
    } finally {
      if (controller.current === current) controller.current = null;
      if (mounted.current && !current.signal.aborted) {
        setBusy(false); setEligibleSource(undefined); setSecurityCheck(value => value + 1);
      }
    }
  }
  function show(value: PrivateObjectStatus, signal: AbortSignal) {
    if (mounted.current && !signal.aborted) setStatus(value);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!file || !confirmed || busy) return;
    if (file.size === 0) { setError('Choose a non-empty synthetic UTF-8 text file, up to 64 KiB.'); return; }
    void run(async signal => {
      if (file.size < 1 || file.size > PRIVATE_OBJECT_MAX_BYTES) throw new PrivateObjectError('payload_too_large');
      const bytes = await file.arrayBuffer();
      let text: string;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new PrivateObjectError('invalid_text'); }
      if (!text.startsWith(PRIVATE_OBJECT_SYNTHETIC_PREFIX) || text.includes('\0')) throw new PrivateObjectError('invalid_text');
      if (signal.aborted || !mounted.current) return;
      // A lost POST response may already have reserved an object. Freeze this
      // exact File and key even before an objectId is known, so retry reconciles.
      setAttempted(true);
      let current = status ? await api.status(status.objectId, signal)
        : await api.reserve(accountId, facilityId, key.current, bytes.byteLength, signal);
      show(current, signal);
      if (current.state === 'expired') throw new PrivateObjectError('expired_or_unavailable');
      if (current.state === 'reserved' || current.state === 'receiving') {
        current = await api.upload(current, bytes, signal); show(current, signal);
      }
      if (current.state === 'stored_unverified') show(await api.finalize(current, signal), signal);
    });
  }
  function newFile() {
    if (busy || controller.current) return;
    key.current = crypto.randomUUID(); setAttempted(false); setFile(null); setStatus(null); setError(null); setConfirmed(false); setInputVersion(v => v + 1); setEligibleSource(undefined);
  }
  return <><section className="account-selector-panel" aria-labelledby={`${inputId}-title`}>
    <div className="section-intro"><h2 id={`${inputId}-title`}>Private synthetic upload</h2><SyntheticBadge /></div>
    <p className="muted">Development text files only, up to 64 KiB. Start the file with “AuxiliumOS synthetic fixture” and a newline. No PHI or real client data.</p>
    <form onSubmit={submit} aria-busy={busy} style={{ marginTop: 'var(--space-4)' }}>
      <div className="field"><label htmlFor={inputId}>Synthetic UTF-8 text file</label>
        <input key={inputVersion} id={inputId} type="file" accept="text/plain,.txt" disabled={busy || attempted}
          aria-describedby={`${inputId}-constraints`}
          onChange={event => { setFile(event.target.files?.[0] ?? null); setConfirmed(false); setError(null); key.current = crypto.randomUUID(); }} /></div>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', minHeight: '44px', paddingBlock: 'var(--space-3)' }}>
        <input type="checkbox" checked={confirmed} disabled={busy || attempted} onChange={event => setConfirmed(event.target.checked)}
          style={{ width: '18px', height: '18px', minHeight: '18px', flexShrink: 0, padding: 0, marginTop: '3px' }} />
        <span>I am uploading a synthetic fixture with no PHI or real client data.</span>
      </label>
      {busy && <p role="status">Verifying the upload with the server. Do not change scope until the response is confirmed.</p>}
      {status && <div className="notice" role="status"><p>Last confirmed server status</p><strong>{labels[status.state]}</strong>
        <p>Upload reference: {status.objectId}</p>
        <p>Transport does not establish current scanning or clearance. Its legacy pending fields are not authoritative security status. This is not a document version or a release. No download or uploader preview is available.</p></div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="button-row"><button className="button primary" type="submit" disabled={busy || !file || !confirmed || status?.state === 'finalized' || status?.state === 'expired'}>
        {busy ? 'Verifying upload…' : attempted ? 'Retry same file' : 'Upload synthetic file'}</button>
        {status && <button className="button secondary" type="button" disabled={busy} onClick={() => { void run(async signal => show(await api.status(status.objectId, signal), signal)); }}>Refresh status</button>}
        {(status || file) && <button className="button secondary" type="button" disabled={busy} onClick={newFile}>Choose a new file</button>}</div>
      <p id={`${inputId}-constraints`} className="field-hint">UTF-8 text only, 1–65,536 bytes. Retries reconcile the same immutable attempt. A failed or interrupted response does not prove that nothing was saved. Choosing a new file does not delete previous bytes or history.</p>
    </form>
    {status?.state === 'finalized' && <PrivateObjectSecurityStatus objectId={status.objectId} accountId={accountId} facilityId={facilityId}
      onAccessUnavailable={onSecurityUnavailable} onEligibleSourceChange={setEligibleSource} refreshKey={securityCheck} />}
  </section>
    <DocumentVersions accountId={accountId} facilityId={facilityId} source={status?.state === 'finalized' && !busy ? eligibleSource : undefined} onAdopted={onAdopted} />
  </>;
}
