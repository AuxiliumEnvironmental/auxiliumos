import { useCallback, useId } from "react";
import { Building2, BriefcaseBusiness } from "lucide-react";
import { useAccounts, useDirectoryPage } from "../lib/use-directory";
import { useRuntime } from "../lib/runtime";

/** Only verified directory rows are offered. A URL value is ignored unless it matches a fetched row. */
export function PlanContextBar({ accountId, facilityId, onAccount, onFacility }: { accountId?: string; facilityId?: string; onAccount: (id: string) => void; onFacility: (id: string) => void }) {
  const accounts = useAccounts();
  const id = useId();
  const accountItems = accounts.state.status === "ready" ? accounts.state.result.items : [];
  const account = accountItems.find(item => item.id === accountId);
  return <section className="context-bar" aria-label="Development context">
    <div className="field"><label htmlFor={`${id}-account`}><BriefcaseBusiness size={14} aria-hidden="true" />Development account</label>
      <select id={`${id}-account`} value={account?.id ?? ""} disabled={accounts.state.status !== "ready"} onChange={event => onAccount(event.target.value)}>
        <option value="">{accounts.state.status === "loading" ? "Loading accounts…" : accounts.state.status === "error" ? "Accounts unavailable" : accountItems.length ? "Choose an account" : "No assigned accounts"}</option>
        {accountItems.map(item => <option key={item.id} value={item.id}>{item.displayName}</option>)}
      </select></div>
    {account ? <FacilitySelect key={account.id} accountId={account.id} facilityId={facilityId} onFacility={onFacility} /> : <div className="field"><label htmlFor={`${id}-facility-none`}><Building2 size={14} aria-hidden="true" />Facility</label><select id={`${id}-facility-none`} disabled value=""><option value="">Choose an account first</option></select></div>}
  </section>;
}

function FacilitySelect({ accountId, facilityId, onFacility }: { accountId: string; facilityId?: string; onFacility: (id: string) => void }) {
  const { api, state } = useRuntime();
  const id = useId();
  const scopeKey = state.status === "ready" ? `${state.context.profileId}:${state.revision}:${accountId}:plan-facilities` : "unavailable";
  const query = useCallback((afterId: string | undefined, signal: AbortSignal) => api.listFacilities({ accountId, afterId, signal }), [accountId, api]);
  const page = useDirectoryPage(scopeKey, query);
  const items = page.state.status === "ready" ? page.state.result.items : [];
  const selected = items.find(item => item.id === facilityId);
  return <div className="field"><label htmlFor={id}><Building2 size={14} aria-hidden="true" />Facility</label>
    <select id={id} value={selected?.id ?? ""} disabled={page.state.status !== "ready"} onChange={event => onFacility(event.target.value)}>
      <option value="">{page.state.status === "loading" ? "Loading facilities…" : page.state.status === "error" ? "Facilities unavailable" : items.length ? "Choose a facility" : "No assigned facilities"}</option>
      {items.map(item => <option key={item.id} value={item.id}>{item.displayName}</option>)}
    </select></div>;
}

/** Resolves the selected facility only when it is a fetched row of the selected account. */
export function useVerifiedFacility(accountId?: string, facilityId?: string) {
  const { api, state } = useRuntime();
  const scopeKey = state.status === "ready" && accountId ? `${state.context.profileId}:${state.revision}:${accountId}:plan-facilities` : "unavailable";
  const query = useCallback((afterId: string | undefined, signal: AbortSignal) => accountId ? api.listFacilities({ accountId, afterId, signal }) : Promise.resolve({ items: [], nextCursor: null }), [accountId, api]);
  const page = useDirectoryPage(scopeKey, query);
  const accounts = useAccounts();
  const accountOk = accounts.state.status === "ready" && accounts.state.result.items.some(item => item.id === accountId);
  const facility = page.state.status === "ready" ? page.state.result.items.find(item => item.id === facilityId) : undefined;
  return accountOk && facility && accountId ? { accountId, facilityId: facility.id } : null;
}
