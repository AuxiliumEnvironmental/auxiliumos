import { Link } from "@tanstack/react-router";
import { useCallback } from "react";
import { ArrowRight, Building2, Check, CircleHelp, FolderOpen, RefreshCw } from "lucide-react";
import { PageHeader } from "../components/app-shell";
import { EmptyState, ErrorState, LoadingState, Pagination, SyntheticBadge } from "../components/shared";
import type { AccountDirectoryItem } from "../lib/directory-api";
import { useAccounts, useDirectoryPage } from "../lib/use-directory";
import { useRuntime } from "../lib/runtime";

export function RefreshButton() {
  const { recheck } = useRuntime();
  return <button className="button secondary" onClick={() => { void recheck(); }}><RefreshCw size={16} aria-hidden="true" />Refresh</button>;
}

function DirectoryNote() {
  return <div className="directory-note"><CircleHelp size={18} aria-hidden="true" /><p>Only entries available to your login appear here. For access changes, contact your workspace administrator.</p></div>;
}

export function AccountsPage() {
  const page = useAccounts();
  return <><PageHeader title="Accounts" description="Choose an account to explore its available facilities." action={<RefreshButton />} /><div className="section-intro"><h2>Your account directory</h2><span className="section-meta"><Check size={15} aria-hidden="true" />Assigned access</span></div>{page.state.status === "loading" ? <LoadingState label="Loading accounts" /> : page.state.status === "error" ? <ErrorState error={page.state.error} onRetry={page.retry} /> : <>{page.state.result.items.length === 0 ? <EmptyState icon={FolderOpen} title="No accounts available"><p>No account directory entries are available on this page. Contact your workspace administrator if you expected access.</p></EmptyState> : <div className="account-grid">{page.state.result.items.map((account) => <article className="account-card" key={account.id}><div className="account-card-top"><span className="entity-icon"><Building2 size={22} aria-hidden="true" /></span><SyntheticBadge /></div><p className="entity-type">Account</p><h3>{account.displayName}</h3><p className="muted">View the facilities available to your login.</p><Link className="card-link" to="/facilities" search={{ account: account.id }} aria-label={`View facilities for ${account.displayName}`}>View facilities<ArrowRight size={17} aria-hidden="true" /></Link></article>)}</div>}<Pagination page={page.page} nextCursor={page.state.result.nextCursor} onNext={page.next} onPrevious={page.previous} label="Account pages" /></>}<DirectoryNote /></>;
}

function FacilityList({ account }: { account: AccountDirectoryItem }) {
  const { api, state } = useRuntime();
  const scopeKey = state.status === "ready" ? `${state.context.profileId}:${state.revision}:${account.id}:facilities` : "unavailable";
  const query = useCallback((afterId: string | undefined, signal: AbortSignal) => api.listFacilities({ accountId: account.id, afterId, signal }), [account.id, api]);
  const page = useDirectoryPage(scopeKey, query);
  return <section aria-labelledby="facility-directory-title"><div className="section-intro facility-section-intro"><div><p className="entity-type">Facilities for</p><h2 id="facility-directory-title">{account.displayName}</h2></div><SyntheticBadge /></div>{page.state.status === "loading" ? <LoadingState label="Loading facilities" /> : page.state.status === "error" ? <ErrorState error={page.state.error} onRetry={page.retry} /> : <>{page.state.result.items.length === 0 ? <EmptyState icon={Building2} title="No facilities available"><p>No facility entries are available on this page for this account. Account access does not automatically include facilities.</p></EmptyState> : <ul className="facility-list">{page.state.result.items.map((facility) => <li className="facility-row" key={facility.id}><span className="entity-icon"><Building2 size={21} aria-hidden="true" /></span><div className="facility-name"><h3>{facility.displayName}</h3><p>Facility directory entry</p></div><SyntheticBadge /></li>)}</ul>}<Pagination page={page.page} nextCursor={page.state.result.nextCursor} onNext={page.next} onPrevious={page.previous} label="Facility pages" /></>}</section>;
}

export function FacilitiesPage({ accountId, onAccountChange }: { accountId?: string; onAccountChange: (accountId: string) => void }) {
  const accounts = useAccounts();
  const selected = accounts.state.status === "ready" ? accounts.state.result.items.find((item) => item.id === accountId) : undefined;
  return <><PageHeader title="Facilities" description="Explore the facility directory for an available account." action={<RefreshButton />} />{accounts.state.status === "loading" ? <LoadingState label="Loading accounts" /> : accounts.state.status === "error" ? <ErrorState error={accounts.state.error} onRetry={accounts.retry} /> : accounts.state.result.items.length === 0 ? <><EmptyState icon={FolderOpen} title="No accounts available"><p>No account entries are available on this page. Contact your workspace administrator if you expected access.</p></EmptyState><Pagination page={accounts.page} nextCursor={accounts.state.result.nextCursor} onNext={accounts.next} onPrevious={accounts.previous} label="Account pages" /></> : <><section className="account-selector-panel" aria-label="Account selection"><div className="field account-select"><label htmlFor="account-select">Account</label><select id="account-select" value={selected?.id ?? ""} onChange={(event) => onAccountChange(event.target.value)} aria-describedby="account-selection-hint"><option value="">Choose an account</option>{accounts.state.result.items.map((account) => <option key={account.id} value={account.id}>{account.displayName}</option>)}</select><p id="account-selection-hint" className="field-hint">Accounts on this directory page. Selecting an account shows only its available facilities.</p></div><Pagination page={accounts.page} nextCursor={accounts.state.result.nextCursor} onNext={accounts.next} onPrevious={accounts.previous} label="Account pages" /></section>{selected ? <FacilityList key={selected.id} account={selected} /> : <EmptyState icon={Building2} title="Choose an account"><p>Select an account from this directory page to view available facilities.</p></EmptyState>}</>}<DirectoryNote /></>;
}
