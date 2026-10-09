import { useCallback, useId, useState } from 'react';
import { Building2, FolderOpen } from 'lucide-react';
import { PageHeader } from '../components/app-shell';
import { PrivateObjectUpload } from '../components/private-object-upload';
import { EmptyState, ErrorState, LoadingState, Pagination } from '../components/shared';
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
    <PageHeader title="Private files"
      description="Internal document versions and synthetic uploads."
      action={<RefreshButton />} />
    <p className="field-hint">Synthetic data only. No PHI or real client data. Uploads start in quarantine; review and downloads need separate current permission. Release is unavailable.</p>
    {accounts.state.status === 'loading' ? <LoadingState label="Loading accounts" />
      : accounts.state.status === 'error' ? <ErrorState error={accounts.state.error} onRetry={accounts.retry} />
        : <>
          <section className="account-selector-panel" aria-label="Private-file account selection">
            <div className="field account-select"><label htmlFor={inputId}>Account</label>
              <select id={inputId} value={selected?.id ?? ''} onChange={event => onAccountChange(event.target.value)}
>
                <option value="">Choose an account</option>
                {accounts.state.result.items.map(account => <option key={account.id} value={account.id}>{account.displayName}</option>)}
              </select>

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
    <details style={{ overflowWrap: 'anywhere' }}>
      <summary style={{ minHeight: '44px', paddingBlock: 'var(--space-3)', cursor: 'pointer' }}>Upload, access and preservation boundaries</summary>
      <p>Only accounts and facilities on the current permitted directory page appear. Directory visibility does not grant upload, document, review or content authority. Every operation rechecks current access.</p>
      <p>Changing account or facility clears only local upload attempts, not preserved bytes, saved versions or history. The upload attempt is held in memory; permitted version history comes from the server.</p>
      <p>Uploads start in quarantine. Exact cleared files can become immutable internal drafts only with separate document authority. The text marker and acknowledgment do not detect PHI or grant authority. Real scanning and real-upload security activation remain unavailable.</p>
      <p>Review and exact-version downloads require separate current permission. Downloads use a verified browser attachment handoff, not an inline viewer. Professional approval, document creation and release are unavailable. Actor, audience, preservation, export and incident-handling activation decisions remain gated.</p>
    </details>
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
    <section className="account-selector-panel" aria-label="Private-file facility selection">

      {facilities.state.status === 'loading' ? <LoadingState label="Loading facilities" />
        : facilities.state.status === 'error' ? <ErrorState error={facilities.state.error} onRetry={facilities.retry} />
          : <>
            {facilities.state.result.items.length === 0 ? <EmptyState icon={Building2} title="No facilities available">
              <p>No facility entries are available on this page. Account access does not automatically include facilities or upload permission.</p>
            </EmptyState> : <div className="field account-select"><label htmlFor={inputId}>Facility</label>
              <select id={inputId} value={selected?.id ?? ''} onChange={event => setFacilityId(event.target.value)}
>
                <option value="">Choose a facility</option>
                {facilities.state.result.items.map(facility => <option key={facility.id} value={facility.id}>{facility.displayName}</option>)}
              </select>

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
