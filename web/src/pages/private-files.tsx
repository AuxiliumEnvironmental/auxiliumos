import { useCallback, useId, useState } from 'react';
import { Building2, FolderOpen } from 'lucide-react';
import { PageHeader } from '../components/app-shell';
import { PrivateObjectUpload } from '../components/private-object-upload';
import { EmptyState, ErrorState, LoadingState, Pagination, SyntheticBadge } from '../components/shared';
import type { AccountDirectoryItem } from '../lib/directory-api';
import { useRuntime } from '../lib/runtime';
import { useAccounts, useDirectoryPage } from '../lib/use-directory';
import { RefreshButton } from './directory';

type PrivateFilesProps = { accountId?: string; onAccountChange: (id: string) => void };

// The directory is a scope picker, not an ingest grant. The private-object
// endpoint independently checks the current user's exact scope on every call.
export function PrivateFilesPage(props: PrivateFilesProps) {
  const { state } = useRuntime();
  if (state.status !== 'ready') return null;
  return <PrivateFiles key={`${state.context.profileId}:${state.revision}`} {...props} />;
}

function PrivateFiles({ accountId, onAccountChange }: PrivateFilesProps) {
  const accounts = useAccounts();
  const inputId = useId();
  const selected = accounts.state.status === 'ready'
    ? accounts.state.result.items.find(item => item.id === accountId) : undefined;

  return <>
    <PageHeader eyebrow="M13 · Private files and document versions" title="Private files"
      description="Stage synthetic files, manage immutable internal drafts and request separately authorized exact-version downloads."
      action={<RefreshButton />} />
    <section className="notice module-notice" aria-label="Private-file development boundary">
      <div><strong>Quarantined uploads are not document versions or releases.</strong>
        <p>Synthetic data only. No PHI or real client data. Exact cleared files can become immutable internal drafts only with separate document authority. Downloads require their own current exact-version permission and an enabled service. Real scanning, professional approval, inline preview and release are not available here.</p>
        <p>OD-001/003 actor and audience approval, OD-011 retention/export approval, and OD-013 incident handling and real-upload approval remain gated. The text marker and acknowledgment do not detect PHI or grant authority.</p>
      </div>
    </section>
    {accounts.state.status === 'loading' ? <LoadingState label="Loading accounts" />
      : accounts.state.status === 'error' ? <ErrorState error={accounts.state.error} onRetry={accounts.retry} />
        : <>
          <section className="account-selector-panel" aria-label="Private-file account selection">
            <div className="field account-select"><label htmlFor={inputId}>Account</label>
              <select id={inputId} value={selected?.id ?? ''} onChange={event => onAccountChange(event.target.value)}
                aria-describedby={`${inputId}-hint`}>
                <option value="">Choose an account</option>
                {accounts.state.result.items.map(account => <option key={account.id} value={account.id}>{account.displayName}</option>)}
              </select>
              <p id={`${inputId}-hint`} className="field-hint">Only accounts on this directory page appear. Changing scope clears the on-screen upload attempt, not preserved bytes or history.</p>
            </div>
            <Pagination page={accounts.page} nextCursor={accounts.state.result.nextCursor}
              onNext={accounts.next} onPrevious={accounts.previous} label="Private-file account pages" />
          </section>
          {selected ? <FacilityScope key={selected.id} account={selected} />
            : <EmptyState icon={FolderOpen} title={accounts.state.result.items.length === 0 ? 'No accounts available'
              : accountId ? 'Account unavailable on this page' : 'Choose an account'}>
              <p>{accountId ? 'The requested account is not in this permitted directory page. Choose an available account or check another page.'
                : 'Select a permitted account to see its available facilities. Contact your workspace administrator if you expected access.'}</p>
            </EmptyState>}
        </>}
    <p className="field-hint">Directory visibility does not grant upload, document or content authority. Every operation rechecks current access. The upload attempt is in memory; permitted version history comes from the backend. Verified downloads use a browser attachment handoff, not an inline viewer.</p>
  </>;
}

function FacilityScope({ account }: { account: AccountDirectoryItem }) {
  const { api } = useRuntime();
  const inputId = useId();
  const [facilityId, setFacilityId] = useState('');
  const query = useCallback((afterId: string | undefined, signal: AbortSignal) =>
    api.listFacilities({ accountId: account.id, afterId, signal }), [account.id, api]);
  const facilities = useDirectoryPage(`${account.id}:private-file-facilities`, query);
  const selected = facilities.state.status === 'ready'
    ? facilities.state.result.items.find(item => item.id === facilityId) : undefined;

  return <>
    <section className="account-selector-panel" aria-labelledby={`${inputId}-title`}>
      <div className="section-intro"><div><p className="entity-type">Facilities for</p>
        <h2 id={`${inputId}-title`}>{account.displayName}</h2></div><SyntheticBadge /></div>
      {facilities.state.status === 'loading' ? <LoadingState label="Loading facilities" />
        : facilities.state.status === 'error' ? <ErrorState error={facilities.state.error} onRetry={facilities.retry} />
          : <>
            {facilities.state.result.items.length === 0 ? <EmptyState icon={Building2} title="No facilities available">
              <p>No facility entries are available on this page. Account access does not automatically include facilities or upload permission.</p>
            </EmptyState> : <div className="field account-select"><label htmlFor={inputId}>Facility</label>
              <select id={inputId} value={selected?.id ?? ''} onChange={event => setFacilityId(event.target.value)}
                aria-describedby={`${inputId}-hint`}>
                <option value="">Choose a facility</option>
                {facilities.state.result.items.map(facility => <option key={facility.id} value={facility.id}>{facility.displayName}</option>)}
              </select>
              <p id={`${inputId}-hint`} className="field-hint">The upload is bound to this exact account and facility. Changing facilities clears the on-screen attempt.</p>
            </div>}
            <Pagination page={facilities.page} nextCursor={facilities.state.result.nextCursor}
              onNext={() => { setFacilityId(''); facilities.next(); }}
              onPrevious={() => { setFacilityId(''); facilities.previous(); }} label="Private-file facility pages" />
          </>}
    </section>
    {selected ? <PrivateObjectUpload accountId={account.id} facilityId={selected.id} />
      : facilities.state.status === 'ready' && facilities.state.result.items.length > 0
        ? <EmptyState icon={Building2} title="Choose a facility"><p>Select an available facility to start a synthetic upload.</p></EmptyState> : null}
  </>;
}
