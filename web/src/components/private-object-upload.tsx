import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { PrivateObjectApi, PrivateObjectError, PRIVATE_OBJECT_MAX_BYTES, PRIVATE_OBJECT_SYNTHETIC_PREFIX, type PrivateObjectStatus } from '../lib/private-object-api';
import { useRuntime } from '../lib/runtime';
import { SyntheticBadge } from './shared';

const labels: Record<PrivateObjectStatus['state'], string> = {
  reserved: 'Reserved; bytes not yet received', receiving: 'Upload pending confirmation',
  stored_unverified: 'Bytes verified; finalization pending', finalized: 'Upload finalized; quarantined', expired: 'Upload window expired; history preserved',
};

// Lead composes this beneath an already selected account/facility. Being visible
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
  const inputId = useId();
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const key = useRef(crypto.randomUUID());
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<PrivateObjectStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [inputVersion, setInputVersion] = useState(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);

  async function run(operation: (signal: AbortSignal) => Promise<void>) {
    controller.current?.abort(); const current = new AbortController(); controller.current = current;
    setBusy(true); setError(null);
    try { await operation(current.signal); }
    catch (failure) {
      if (mounted.current && !current.signal.aborted) {
        if (failure instanceof PrivateObjectError && ['unauthenticated', 'not_found_or_unavailable'].includes(failure.code)) {
          setStatus(null); setFile(null); setConfirmed(false); setInputVersion(v => v + 1);
        }
        setError(failure instanceof PrivateObjectError ? failure.message : 'The upload could not be confirmed. Refresh status or retry the same file.');
      }
    } finally { if (mounted.current && !current.signal.aborted) setBusy(false); }
  }
  function show(value: PrivateObjectStatus, signal: AbortSignal) {
    if (mounted.current && !signal.aborted) setStatus(value);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!file || !confirmed || busy) return;
    void run(async signal => {
      if (file.size < 1 || file.size > PRIVATE_OBJECT_MAX_BYTES) throw new PrivateObjectError('payload_too_large');
      const bytes = await file.arrayBuffer();
      let text: string;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new PrivateObjectError('invalid_text'); }
      if (!text.startsWith(PRIVATE_OBJECT_SYNTHETIC_PREFIX) || text.includes('\0')) throw new PrivateObjectError('invalid_text');
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
    if (busy) return;
    key.current = crypto.randomUUID(); setFile(null); setStatus(null); setError(null); setConfirmed(false); setInputVersion(v => v + 1);
  }
  return <section className="account-selector-panel" aria-labelledby={`${inputId}-title`}>
    <div className="section-intro"><h2 id={`${inputId}-title`}>Private synthetic upload</h2><SyntheticBadge /></div>
    <p className="muted">Development text files only, up to 64 KiB. Start the file with “AuxiliumOS synthetic fixture” and a newline. No PHI or real client data.</p>
    <form onSubmit={submit} aria-busy={busy}>
      <div className="field"><label htmlFor={inputId}>Synthetic UTF-8 text file</label>
        <input key={inputVersion} id={inputId} type="file" accept="text/plain,.txt" disabled={busy || status !== null}
          onChange={event => { setFile(event.target.files?.[0] ?? null); setError(null); key.current = crypto.randomUUID(); }} /></div>
      <p><label><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} /> I am uploading a synthetic fixture with no PHI or real client data.</label></p>
      {status && <div className="notice" role="status"><strong>{labels[status.state]}</strong>
        <p>Scan: pending. Human clearance: pending. This is not a document version or a release. No download or uploader preview is available.</p></div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="button-row"><button className="button primary" type="submit" disabled={busy || !file || !confirmed || status?.state === 'finalized' || status?.state === 'expired'}>
        {busy ? 'Verifying upload…' : status ? 'Retry same file' : 'Upload synthetic file'}</button>
        {status && <button className="button secondary" type="button" disabled={busy} onClick={() => { void run(async signal => show(await api.status(status.objectId, signal), signal)); }}>Refresh status</button>}
        {(status || file) && <button className="button secondary" type="button" disabled={busy} onClick={newFile}>Choose a new file</button>}</div>
      <p className="field-hint">Retries reconcile the same immutable attempt. Choosing a new file does not delete previous bytes or history.</p>
    </form>
  </section>;
}
