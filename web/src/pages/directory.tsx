import { Link } from "@tanstack/react-router";
import { useCallback, useId, useState } from "react";
import { ArrowRight, Building2, Check, CircleHelp, FolderOpen, RefreshCw } from "lucide-react";
import { Button } from "../components/button";
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
  const [query, setQuery] = useState("");
  const searchId = useId();
  const items = page.state.status === "ready" ? page.state.result.items.filter(account => account.displayName.toLowerCase().includes(query.toLowerCase())) : [];
  return <><PageHeader title="Accounts" description="Choose an account to explore its available facilities." action={<RefreshButton />} /><div className="field directory-search"><label htmlFor={searchId}>Find an account on this page</label><input id={searchId} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search account names" /></div><div className="section-intro"><h2>Your account directory</h2><span className="section-meta"><Check size={15} aria-hidden="true" />Assigned access</span></div>{page.state.status === "loading" ? <LoadingState label="Loading accounts" /> : page.state.status === "error" ? <ErrorState error={page.state.error} onRetry={page.retry} /> : <>{page.state.result.items.length === 0 ? <EmptyState icon={FolderOpen} title="No accounts available"><p>No account directory entries are available on this page. Contact your workspace administrator if you expected access.</p></EmptyState> : <>{items.length === 0 && <p className="directory-result-note" role="status">No accounts match this search on the current page.</p>}<div className="account-grid">{items.map((account) => <article className="account-card" key={account.id}><div className="account-card-top"><span className="entity-icon"><Building2 size={22} aria-hidden="true" /></span><SyntheticBadge /></div><p className="entity-type">Account</p><h3>{account.displayName}</h3><p className="muted">View the facilities available to your login.</p><Link className="card-link" to="/facilities" search={{ account: account.id }} aria-label={`View facilities for ${account.displayName}`}>View facilities<ArrowRight size={17} aria-hidden="true" /></Link></article>)}</div></>}<Pagination page={page.page} nextCursor={page.state.result.nextCursor} onNext={page.next} onPrevious={page.previous} label="Account pages" /></>}<DirectoryNote /></>;
}

function FacilityList({ account }: { account: AccountDirectoryItem }) {
  const { api, state } = useRuntime();
  const scopeKey = state.status === "ready" ? `${state.context.profileId}:${state.revision}:${account.id}:facilities` : "unavailable";
  const query = useCallback((afterId: string | undefined, signal: AbortSignal) => api.listFacilities({ accountId: account.id, afterId, signal }), [account.id, api]);
  const page = useDirectoryPage(scopeKey, query);
  const [detailId, setDetailId] = useState("");
  return <section aria-labelledby="facility-directory-title"><div className="section-intro facility-section-intro"><div><p className="entity-type">Facilities for</p><h2 id="facility-directory-title">{account.displayName}</h2></div><SyntheticBadge /></div>{page.state.status === "loading" ? <LoadingState label="Loading facilities" /> : page.state.status === "error" ? <ErrorState error={page.state.error} onRetry={page.retry} /> : <>{page.state.result.items.length === 0 ? <EmptyState icon={Building2} title="No facilities available"><p>No facility entries are available on this page for this account. Account access does not automatically include facilities.</p></EmptyState> : <ul className="facility-list">{page.state.result.items.map((facility) => <li key={facility.id}><div className="facility-row"><span className="entity-icon"><Building2 size={21} aria-hidden="true" /></span><div className="facility-name"><h3>{facility.displayName}</h3><p>Facility directory entry</p></div><Button className="compact" aria-expanded={detailId === facility.id} aria-controls={`facility-${facility.id}`} onClick={() => setDetailId(value => value === facility.id ? "" : facility.id)}>{detailId === facility.id ? "Close details" : "View details"}</Button></div>{detailId === facility.id && <div className="facility-detail" id={`facility-${facility.id}`}><dl><dt>Account</dt><dd>{account.displayName}</dd><dt>Facility identifier</dt><dd>{facility.id}</dd><dt>Record source</dt><dd>Authorized synthetic facility directory</dd></dl><div className="button-row"><Link className="button secondary" to="/intake" search={{ account: account.id }}>Account intake<ArrowRight size={15} /></Link><Link className="button secondary" to="/documents" search={{ account: account.id }}>Account documents<ArrowRight size={15} /></Link></div><p className="field-hint">Choose the exact facility again in the workflow. Directory access does not grant action authority.</p></div>}</li>)}</ul>}<Pagination page={page.page} nextCursor={page.state.result.nextCursor} onNext={page.next} onPrevious={page.previous} label="Facility pages" /></>}</section>;
}

export function FacilitiesPage({ accountId, onAccountChange }: { accountId?: string; onAccountChange: (accountId: string) => void }) {
  const accounts = useAccounts();
  const selected = accounts.state.status === "ready" ? accounts.state.result.items.find((item) => item.id === accountId) : undefined;
  return <><PageHeader title="Facilities" description="Explore the facility directory for an available account." action={<RefreshButton />} />{accounts.state.status === "loading" ? <LoadingState label="Loading accounts" /> : accounts.state.status === "error" ? <ErrorState error={accounts.state.error} onRetry={accounts.retry} /> : accounts.state.result.items.length === 0 ? <><EmptyState icon={FolderOpen} title="No accounts available"><p>No account entries are available on this page. Contact your workspace administrator if you expected access.</p></EmptyState><Pagination page={accounts.page} nextCursor={accounts.state.result.nextCursor} onNext={accounts.next} onPrevious={accounts.previous} label="Account pages" /></> : <><section className="account-selector-panel" aria-label="Account selection"><div className="field account-select"><label htmlFor="account-select">Account</label><select id="account-select" value={selected?.id ?? ""} onChange={(event) => onAccountChange(event.target.value)} aria-describedby="account-selection-hint"><option value="">Choose an account</option>{accounts.state.result.items.map((account) => <option key={account.id} value={account.id}>{account.displayName}</option>)}</select><p id="account-selection-hint" className="field-hint">Accounts on this directory page. Selecting an account shows only its available facilities.</p></div><Pagination page={accounts.page} nextCursor={accounts.state.result.nextCursor} onNext={accounts.next} onPrevious={accounts.previous} label="Account pages" /></section>{selected ? <FacilityList key={selected.id} account={selected} /> : <EmptyState icon={Building2} title="Choose an account"><p>{accountId ? "The linked account is not on this directory page. Use account pagination to locate an available account; no account access is inferred from the link." : "Select an account from this directory page to view available facilities."}</p></EmptyState>}</>}<DirectoryNote /></>;
}
