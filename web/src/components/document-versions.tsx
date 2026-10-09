import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FileStack } from 'lucide-react';
import { DocumentVersionApi, DocumentVersionError, type DocumentAdoptionReceipt, type DocumentAdoptionRequest,
  type DocumentVersionsPage, type EligibleDocumentSource, type VersionDocument } from '../lib/document-version-api';
import { asRuntimeError, isAbort, type RuntimeError } from '../lib/errors';
import { useRuntime } from '../lib/runtime';
import { useDirectoryPage } from '../lib/use-directory';
import { EmptyState, ErrorState, LoadingState, Pagination } from './shared';
import { DocumentContentDownload } from './document-content-download';
import { DocumentVersionReview } from './document-version-review';

type Props = {
  accountId: string; facilityId: string; source?: EligibleDocumentSource;
  onAdopted?: (receipt: DocumentAdoptionReceipt) => void;
};
type History = { status: 'loading'; key: string }
  | { status: 'ready'; key: string; value: DocumentVersionsPage }
  | { status: 'error'; key: string; error: RuntimeError };
const wrap = { overflowWrap: 'anywhere' as const };

// The caller supplies only a current eligible security snapshot, never a pasted
// hash or actor. The server independently rechecks exact source/target authority.
export function DocumentVersions(props: Props) {
  const { state } = useRuntime();
  if (state.status !== 'ready') return null;
  return <DocumentScope key={`${state.context.profileId}:${state.revision}:${props.accountId}:${props.facilityId}`} {...props} />;
}

function DocumentScope({ accountId, facilityId, source, onAdopted }: Props) {
  const { api: runtimeApi } = useRuntime();
  const api = useMemo(() => new DocumentVersionApi(runtimeApi.client), [runtimeApi.client]);
  const titleId = useId();
  const [selectedId, setSelectedId] = useState<string>();
  const [denied, setDenied] = useState(false);
  const [reviewPending, setReviewPending] = useState(false);
  const query = useCallback(async (afterId: string | undefined, signal: AbortSignal) => {
    const result = await api.documents(accountId, afterId ?? null, signal);
    return { items: result.items, nextCursor: result.next_cursor };
  }, [api, accountId]);
  const documents = useDirectoryPage(`${accountId}:${facilityId}:version-documents`, query);
  // Never render titles, counts or selectors for a different facility. An empty
  // filtered page is not evidence that this account has no other permitted rows.
  const rows = documents.state.status === 'ready' ? documents.state.result.items.filter(row => row.facility_id === facilityId) : [];
  const selected = rows.find(row => row.document_id === selectedId);
  const refresh = () => { if (reviewPending) return; setSelectedId(undefined); setDenied(false); documents.retry(); };
  const unavailable = useCallback(() => {
    setSelectedId(undefined); setDenied(true); documents.retry();
  }, [documents.retry]);
  return <section className="account-selector-panel" aria-labelledby={titleId} style={wrap}>
    <div className="section-intro"><div><p className="entity-type">M13 · Immutable internal drafts</p><h2 id={titleId}>Document versions</h2></div>
      <button type="button" className="button secondary" onClick={refresh} disabled={reviewPending || documents.state.status === 'loading'}>Refresh documents</button></div>
    <p>Only owner-provisioned logical documents with an exact version-view grant appear. Account or facility membership alone does not grant access.</p>
    <p className="field-hint">This list is filtered to the selected facility from account-wide permitted pages. Exact-version internal review is available with separate authority. Logical-document creation, inline content viewing and release are unavailable. Changing scope clears local attempts, not saved history.</p>
    {reviewPending && <p className="field-hint" role="status">Document navigation is paused while a review submission is pending or uncertain. Resolve its exact retry below before refreshing this history.</p>}
    {denied && <p role="alert" className="form-error">Document access is unavailable. The selected document, history and local adoption attempt were cleared; current list access is being checked again.</p>}
    {documents.state.status === 'loading' ? <LoadingState label="Loading permitted documents" />
      : documents.state.status === 'error' ? <ErrorState error={documents.state.error} onRetry={refresh} />
        : <>
          {rows.length === 0 ? <EmptyState icon={FileStack} title="No documents for this facility on this page">
            <p>No matching permitted logical documents were returned here. Check another page if available, or contact your workspace administrator. An empty page does not establish why access is absent.</p>
          </EmptyState> : <ul style={{ listStyle: 'none', padding: 0 }} aria-label="Permitted documents">
            {rows.map(document => <li key={document.document_id} className="notice" style={{ marginBlock: 'var(--space-3)' }}>
              <div><strong>{document.title}</strong><p className="field-hint">Class label: {document.document_class}. This label conveys no review or release authority.</p>
                <button type="button" className="button secondary" aria-expanded={selectedId === document.document_id}
                  disabled={reviewPending}
                  onClick={() => { setDenied(false); setSelectedId(document.document_id); }} aria-label={`View version history: ${document.title}`}>View version history</button></div>
            </li>)}
          </ul>}
          <fieldset disabled={reviewPending} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><Pagination page={documents.page} nextCursor={documents.state.result.nextCursor}
            onNext={() => { setSelectedId(undefined); documents.next(); }} onPrevious={() => { setSelectedId(undefined); documents.previous(); }} label="Document list pages" />
          </fieldset>
        </>}
    {selected && <VersionHistory key={selected.document_id} api={api} document={selected} source={source}
      onUnavailable={unavailable} onAdopted={onAdopted} onReviewPending={setReviewPending} />}
    <p className="field-hint">Synthetic development only. An internal draft never supersedes an existing release. OD-001/003 audience and actor decisions, OD-011 preservation/export and OD-013 real-upload/security activation remain gated.</p>
  </section>;
}

function VersionHistory({ api, document, source, onUnavailable, onAdopted, onReviewPending }: {
  api: DocumentVersionApi; document: VersionDocument; source?: EligibleDocumentSource;
  onUnavailable: () => void; onAdopted?: Props['onAdopted']; onReviewPending: (pending: boolean) => void;
}) {
  const { handleFailure } = useRuntime();
  const headingId = useId();
  const [cursors, setCursors] = useState<number[]>([]);
  const [check, setCheck] = useState(0);
  const pendingReviews = useRef(new Set<string>());
  const [reviewPending, setReviewPending] = useState(false);
  const reviewPendingChanged = useCallback((versionId: string, pending: boolean) => {
    if (pending) pendingReviews.current.add(versionId); else pendingReviews.current.delete(versionId);
    const blocked = pendingReviews.current.size > 0;
    setReviewPending(blocked); onReviewPending(blocked);
  }, [onReviewPending]);
  useLayoutEffect(() => () => { onReviewPending(false); }, [onReviewPending]);
  const after = cursors.at(-1) ?? 0;
  const key = `${document.document_id}:${after}:${check}`;
  const [stored, setStored] = useState<History>({ status: 'loading', key: '' });
  const resource: History = stored.key === key ? stored : { status: 'loading', key };
  // Callbacks can change when the parent renders without restarting the read.
  const callbacks = useRef({ onUnavailable, onAdopted });
  callbacks.current = { onUnavailable, onAdopted };
  useEffect(() => {
    const controller = new AbortController();
    setStored({ status: 'loading', key });
    void api.versions(document.document_id, after, controller.signal).then(value => {
      if (!controller.signal.aborted) setStored({ status: 'ready', key, value });
    }).catch(error => {
      if (controller.signal.aborted || isAbort(error)) return;
      const failure = asRuntimeError(error);
      setStored({ status: 'error', key, error: failure }); handleFailure(failure);
      if (failure instanceof DocumentVersionError && failure.reason === 'unavailable') callbacks.current.onUnavailable();
    });
    return () => controller.abort();
  }, [api, after, document.document_id, handleFailure, key]);
  const refresh = useCallback(() => { if (pendingReviews.current.size) return; setCursors([]); setCheck(value => value + 1); }, []);
  const saved = useCallback((receipt: DocumentAdoptionReceipt) => {
    refresh(); callbacks.current.onAdopted?.(receipt);
  }, [refresh]);
  const sourceKey = source ? `${source.objectId}:${source.verifiedSha256}:${source.securityRevision}` : 'no-source';
  return <section className="notice" aria-labelledby={headingId} style={{ marginBlock: 'var(--space-4)', ...wrap }}>
    <h3 id={headingId}>Version history: {document.title}</h3>
    <p>History shows metadata, not content permission. Current restrictions and preservation holds are separate from the hold recorded at adoption. Neither an old release label nor a prior receipt permits reading content.</p>
    <details style={{ marginBlock: 'var(--space-3)' }}><summary style={{ minHeight: '44px', paddingBlock: 'var(--space-3)', cursor: 'pointer' }}>Secure download boundary</summary>
      <p>Each request checks separate current permission for the exact immutable version, then verifies its bytes before a browser attachment handoff. This synthetic development feature does not approve or release a document. Content is not shown inline or kept in workspace browser storage. Already downloaded files cannot be recalled by changing scope, signing out or revoking access.</p>
    </details>
    <div className="button-row"><button type="button" className="button secondary" disabled={reviewPending || resource.status === 'loading'} onClick={refresh}>Refresh version history</button></div>
    {resource.status === 'loading' ? <LoadingState label="Checking current version history" />
      : resource.status === 'error' ? <ErrorState error={resource.error} onRetry={refresh} />
        : <>
          <p className="field-hint">Last confirmed document revision: {resource.value.document_revision}. Refresh to check current access and metadata.</p>
          {resource.value.items.length === 0 ? <p role="status">No internal draft versions on this page.</p>
            : <ol aria-label="Immutable version history" style={{ listStyle: 'none', padding: 0 }}>
              {resource.value.items.map(version => <li key={version.version_id} className="notice" style={{ marginBlock: 'var(--space-3)' }}>
                <h4>Version {version.version_ordinal} · Internal draft</h4>
                <dl><dt>Immutable version reference</dt><dd style={wrap}>{version.version_id}</dd>
                  <dt>Verified SHA-256</dt><dd style={wrap}><code>{version.verified_sha256}</code></dd>
                  <dt>Verified size and media type</dt><dd>{version.byte_size} bytes · {version.media_type}</dd>
                  <dt>Recorded at</dt><dd><time dateTime={version.created_at}>{new Date(version.created_at).toLocaleString()}</time></dd>
                  <dt>Hold at adoption</dt><dd>{version.preservation_hold_at_adoption ? 'Recorded' : 'Not recorded'}</dd>
                  <dt>Current preservation hold</dt><dd>{version.preservation_hold ? 'Hold recorded; preservation is required' : 'No hold recorded; destruction is not authorized'}</dd>
                  <dt>Current visibility restriction</dt><dd>{version.visibility_restricted ? 'Restricted; no content access is provided' : 'No restriction recorded; this does not grant content access'}</dd>
                </dl>
                <DocumentContentDownload key={`${resource.key}:${version.version_id}:${version.verified_sha256}`} version={version} />
                <DocumentVersionReview key={`review:${resource.key}:${version.version_id}:${version.verified_sha256}`}
                  documentId={document.document_id} version={version} onPendingChange={pending => reviewPendingChanged(version.version_id, pending)} />
              </li>)}
            </ol>}
          <fieldset disabled={reviewPending} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><Pagination page={cursors.length + 1} nextCursor={resource.value.next_cursor === null ? null : String(resource.value.next_cursor)}
            onNext={() => { const next = resource.value.next_cursor; if (next !== null) setCursors(values => [...values, next]); }}
            onPrevious={() => setCursors(values => values.slice(0, -1))} label="Version history pages" />
          </fieldset>
        </>}
    {!document.can_create_version ? <p className="field-hint">Read-only history. No version-creation affordance was returned for this document; the server checks exact grants on every operation.</p>
      : !source ? <p className="field-hint">No current eligible source is selected. Finalize a synthetic upload and check its security status before adopting it. Security eligibility alone is not document authority.</p>
        : <fieldset disabled={reviewPending} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><AdoptionForm key={sourceKey} api={api} document={document} source={source}
          documentRevision={resource.status === 'ready' ? resource.value.document_revision : undefined}
          checkKey={resource.status === 'ready' ? resource.key : undefined} onRefresh={refresh} onSaved={saved} onUnavailable={onUnavailable} /></fieldset>}
  </section>;
}

type Outcome = { state: 'idle' } | { state: 'saving' } | { state: 'saved'; receipt: DocumentAdoptionReceipt }
  | { state: 'error'; error: RuntimeError; checkKey?: string };
function AdoptionForm({ api, document, source, documentRevision, checkKey, onRefresh, onSaved, onUnavailable }: {
  api: DocumentVersionApi; document: VersionDocument; source: EligibleDocumentSource;
  documentRevision?: number; checkKey?: string; onRefresh: () => void;
  onSaved: (receipt: DocumentAdoptionReceipt) => void; onUnavailable: () => void;
}) {
  const { handleFailure } = useRuntime();
  const inputId = useId();
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const [confirmed, setConfirmed] = useState(false);
  const [attempt, setAttempt] = useState<DocumentAdoptionRequest | null>(null);
  const [outcome, setOutcome] = useState<Outcome>({ state: 'idle' });
  const [uncertain, setUncertain] = useState(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); controller.current = null; }; }, []);

  const submit = async () => {
    if (controller.current || documentRevision === undefined || outcome.state === 'saved' || !confirmed && !attempt) return;
    // Freeze the entire request before sending, even when no receipt comes back.
    const request = attempt ?? Object.freeze({ objectId: source.objectId, verifiedSha256: source.verifiedSha256,
      securityRevision: source.securityRevision, documentId: document.document_id, documentRevision, requestId: crypto.randomUUID() });
    const current = new AbortController(); controller.current = current;
    setAttempt(request); setConfirmed(false); setOutcome({ state: 'saving' });
    let receipt: DocumentAdoptionReceipt;
    try {
      receipt = await api.adopt(request, current.signal);
    } catch (error) {
      if (!mounted.current || current.signal.aborted || isAbort(error) || controller.current !== current) return;
      const failure = asRuntimeError(error);
      setOutcome({ state: 'error', error: failure, checkKey });
      // A later definitive denial must not erase an earlier ambiguous save.
      if (!(failure instanceof DocumentVersionError) || ['backend', 'unexpected'].includes(failure.reason)) setUncertain(true);
      handleFailure(failure);
      if (failure instanceof DocumentVersionError && failure.reason === 'unavailable') onUnavailable();
      return;
    } finally { if (controller.current === current) controller.current = null; }
    if (!mounted.current || current.signal.aborted) return;
    setUncertain(false); setOutcome({ state: 'saved', receipt });
    // Refresh is a new current-authority read. Never insert a receipt as a live row.
    onSaved(receipt);
  };
  const busy = outcome.state === 'saving';
  const reason = outcome.state === 'error' && outcome.error instanceof DocumentVersionError ? outcome.error.reason : undefined;
  const retryExact = outcome.state === 'error' && (!reason || ['backend', 'unexpected'].includes(reason) || uncertain && reason === 'conflict');
  const canReviewNew = outcome.state === 'error' && !uncertain && ['conflict', 'request_conflict', 'validation'].includes(reason ?? '');
  return <section aria-labelledby={`${inputId}-title`} style={{ marginTop: 'var(--space-4)' }} aria-busy={busy}>
    <h4 id={`${inputId}-title`}>Adopt current source as an internal draft</h4>
    <p>This binds the exact verified bytes to this logical document and closes all ingest access. It does not approve, release, supersede, destroy, or grant access to content.</p>
    <dl><dt>Source reference</dt><dd style={wrap}>{source.objectId}</dd>
      <dt>Verified SHA-256 from current security status</dt><dd style={wrap}><code>{source.verifiedSha256}</code></dd>
      <dt>Source security revision</dt><dd>{source.securityRevision}</dd></dl>
    {busy && <LoadingState label="Creating internal draft; awaiting the server receipt" />}
    {outcome.state === 'error' && <div role="alert"><strong>Internal draft save not confirmed</strong><p>{outcome.error.message}</p></div>}
    {uncertain && <p className="form-error" role="alert">The earlier save may already have committed. A history refresh does not confirm that request. Retry only the exact request while this source remains selected; do not start a replacement request to guess the outcome.</p>}
    {outcome.state === 'saved' && <div role="status"><strong>Internal draft saved: version {outcome.receipt.version_ordinal}</strong>
      <p style={wrap}>Server receipt: {outcome.receipt.version_id}. Ingest is closed. This receipt is not continuing read permission, professional approval or release. Current history is checked separately.</p></div>}
    {attempt && outcome.state !== 'saved' && <p className="field-hint" style={wrap}>Exact request reference: {attempt.requestId}. Frozen document revision: {attempt.documentRevision}; frozen security revision: {attempt.securityRevision}. Scope or source changes discard only the local retry context, not any server transaction.</p>}
    {outcome.state === 'idle' && <>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', minHeight: '44px', paddingBlock: 'var(--space-3)' }}>
        <input id={inputId} type="checkbox" checked={confirmed} disabled={documentRevision === undefined} onChange={event => setConfirmed(event.target.checked)}
          style={{ width: '18px', height: '18px', minHeight: '18px', flexShrink: 0, padding: 0, marginTop: '3px' }} />
        <span>I understand this creates an immutable internal draft and closes ingest access; it does not approve or release the document.</span>
      </label>
      <button type="button" className="button primary" disabled={!confirmed || documentRevision === undefined} onClick={() => { void submit(); }}>Create internal draft</button>
    </>}
    {retryExact && <button type="button" className="button secondary" disabled={documentRevision === undefined} onClick={() => { void submit(); }}>Retry exact adoption request</button>}
    {canReviewNew && <div className="button-row">
      <button type="button" className="button secondary" onClick={onRefresh} disabled={documentRevision === undefined}>Refresh before a new request</button>
      <button type="button" className="button secondary" disabled={!checkKey || checkKey === outcome.checkKey} onClick={() => {
        if (!checkKey || checkKey === outcome.checkKey) return;
        setAttempt(null); setConfirmed(false); setOutcome({ state: 'idle' });
      }}>Review a new adoption request</button>
    </div>}
  </section>;
}
