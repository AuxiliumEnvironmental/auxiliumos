import { useId } from "react";
import { Building2, BriefcaseBusiness } from "lucide-react";
import { usePlanningContext } from "../lib/use-planning-context";
import { Pagination } from "./shared";
import { Button } from "./button";

export function PlanContextBar({ directory, onAccount, onFacility }: { directory: ReturnType<typeof usePlanningContext>; onAccount: (id: string) => void; onFacility: (id: string) => void }) {
  const { accounts, facilities, account, facility, resolution, retry } = directory;
  const id = useId();
  const accountItems = accounts.state.status === "ready" ? accounts.state.result.items : [];
  const facilityItems = facilities.state.status === "ready" ? facilities.state.result.items : [];
  return <section className="context-bar" aria-label="Development context">
    <div className="field"><label htmlFor={`${id}-account`}><BriefcaseBusiness size={14} aria-hidden="true" />Development account</label>
      <select id={`${id}-account`} value={account?.id ?? ""} disabled={accounts.state.status !== "ready"} onChange={event => onAccount(event.target.value)}>
        <option value="">{accounts.state.status === "loading" ? "Loading accounts…" : accounts.state.status === "error" ? "Accounts unavailable" : accountItems.length ? "Choose an account" : "No assigned accounts"}</option>
        {account && !accountItems.some(item => item.id === account.id) && <option value={account.id}>{account.displayName}</option>}
        {accountItems.map(item => <option key={item.id} value={item.id}>{item.displayName}</option>)}
      </select>
      {accounts.state.status === "ready" && <Pagination page={accounts.page} nextCursor={accounts.state.result.nextCursor} onNext={accounts.next} onPrevious={accounts.previous} label="Planning account pages" />}
    </div>
    <div className="field"><label htmlFor={`${id}-facility`}><Building2 size={14} aria-hidden="true" />Facility</label>
      <select id={`${id}-facility`} value={facility?.id ?? ""} disabled={!account || facilities.state.status !== "ready"} onChange={event => onFacility(event.target.value)}>
        <option value="">{!account ? "Choose an account first" : facilities.state.status === "loading" ? "Loading facilities…" : facilities.state.status === "error" ? "Facilities unavailable" : facilityItems.length ? "Choose a facility" : "No assigned facilities"}</option>
        {facility && !facilityItems.some(item => item.id === facility.id) && <option value={facility.id}>{facility.displayName}</option>}
        {facilityItems.map(item => <option key={item.id} value={item.id}>{item.displayName}</option>)}
      </select>
      {account && facilities.state.status === "ready" && <Pagination page={facilities.page} nextCursor={facilities.state.result.nextCursor} onNext={facilities.next} onPrevious={facilities.previous} label="Planning facility pages" />}
    </div>
    {(resolution.status === "error" || accounts.state.status === "error" || facilities.state.status === "error") && <div role="alert"><p>Context could not be verified. Your work is kept while you retry.</p><Button onClick={retry}>Retry context</Button></div>}
  </section>;
}
