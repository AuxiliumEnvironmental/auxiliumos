import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { DocumentContentApi, DocumentContentError } from '../lib/document-content-api';
import type { DocumentVersion } from '../lib/document-version-api';
import { isAbort } from '../lib/errors';
import { useRuntime } from '../lib/runtime';

type Outcome = { state: 'idle' | 'requesting' | 'handoff' } | { state: 'error'; error: DocumentContentError };

export function DocumentContentDownload({ version }: { version: DocumentVersion }) {
  const { api: runtimeApi, config, handleFailure } = useRuntime();
  const api = useMemo(() => new DocumentContentApi(runtimeApi.client, config), [runtimeApi.client, config]);
  const hintId = useId();
  const mounted = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const objectUrl = useRef<string | null>(null);
  const revokeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [outcome, setOutcome] = useState<Outcome>({ state: 'idle' });
  const revoke = () => {
    clearTimeout(revokeTimer.current);
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
  };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controller.current?.abort(); controller.current = null; revoke(); };
  }, []);

  const download = async () => {
    if (!mounted.current || controller.current || version.visibility_restricted) return;
    const current = new AbortController(); controller.current = current;
    revoke(); setOutcome({ state: 'requesting' });
    let bytes: ArrayBuffer | undefined;
    const isCurrent = () => mounted.current && !current.signal.aborted && controller.current === current;
    try {
      const content = await api.download({ versionId: version.version_id, verifiedSha256: version.verified_sha256,
        byteSize: version.byte_size, mediaType: version.media_type }, current.signal);
      bytes = content.bytes;
      if (!isCurrent()) return;
      // Bytes never enter React state, markup, persistent storage, a preview or
      // an AI pipeline. A brief object URL is only for the browser attachment.
      try {
        objectUrl.current = URL.createObjectURL(new Blob([bytes], { type: 'text/plain;charset=utf-8' }));
        const anchor = document.createElement('a');
        anchor.href = objectUrl.current; anchor.download = content.filename;
        anchor.hidden = true; anchor.rel = 'noopener';
        document.body.append(anchor);
        try { anchor.click(); } finally { anchor.remove(); }
        // Give the browser time to accept the handoff, then revoke. Unmounts
        // revoke immediately; no application-level reusable download URL exists.
        revokeTimer.current = setTimeout(revoke, 1_000);
      } catch { revoke(); throw new DocumentContentError('save'); }
      if (isCurrent()) setOutcome({ state: 'handoff' });
    } catch (error) {
      if (!isCurrent() || isAbort(error)) return;
      const failure = error instanceof DocumentContentError ? error : new DocumentContentError('network');
      setOutcome({ state: 'error', error: failure }); handleFailure(failure);
    } finally {
      if (bytes) new Uint8Array(bytes).fill(0);
      if (controller.current === current) controller.current = null;
    }
  };

  if (version.visibility_restricted) return <p className="field-hint">Secure download unavailable while this version is restricted.</p>;
  const busy = outcome.state === 'requesting';
  return <section aria-label={`Secure download for version ${version.version_ordinal}`} aria-busy={busy}>
    <p id={hintId} className="field-hint">Requires separate current permission for this exact version.</p>
    <div className="button-row">
      <button type="button" className="button secondary" disabled={busy} aria-describedby={hintId}
        onClick={() => { void download(); }}>{outcome.state === 'error' ? 'Retry secure download' : 'Request secure download'}</button>
      {busy && <button type="button" className="button secondary" onClick={() => {
        controller.current?.abort(); controller.current = null; setOutcome({ state: 'idle' });
      }}>Cancel download request</button>}
    </div>
    {busy && <p role="status">Checking current permission and verifying exact version bytes…</p>}
    {outcome.state === 'error' && <p role="alert" className="form-error">{outcome.error.message}</p>}
    {outcome.state === 'handoff' && <p role="status">Browser handoff initiated. Check your browser downloads; saving is not confirmed.</p>}
  </section>;
}
