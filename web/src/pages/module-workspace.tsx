import { Link, Navigate } from "@tanstack/react-router";
import { useId, useState } from "react";
import { ArrowRight, ChevronRight, LockKeyhole, Search, ShieldCheck } from "lucide-react";
import { Button } from "../components/button";
import { PageHeader } from "../components/app-shell";
import { moduleForPath, modules } from "../lib/modules";
import { moduleSurfaces } from "./module-surfaces";
import { AccountsPage } from "./directory";
import { NotFoundPage } from "./workspace";
import { moduleScreens } from "./module-screen-definitions";
import { ModuleDraftScreen } from "../components/module-draft-screen";
import { ModuleSampleCase } from "../components/sample-case";
import { HomePage, SpineStrip } from "./home";
import { PlanContextBar } from "../components/plan-context";
import { usePlanningContext } from "../lib/use-planning-context";
import { isSavablePanel } from "../components/module-draft-screen";
import { useNavigate } from "@tanstack/react-router";

export function MyWorkPage() {
  return <><PageHeader eyebrow="Core · Your workspace" title="My work" description="Continue with the accounts and work available to your assigned login." />
    <section className="work-start" aria-labelledby="continue-heading"><div className="section-intro"><h2 id="continue-heading">Continue your work</h2><span className="status-label"><ShieldCheck size={14} />Assigned access</span></div>
      <div className="work-links">
        <Link to="/" className="work-link"><span className="module-number">01</span><div><h3>Choose an account</h3><p>Open your permitted account directory.</p></div><ArrowRight size={20} /></Link>
        <Link to="/intake" search={{}} className="work-link"><span className="module-number">02</span><div><h3>Follow a project request</h3><p>Submission, review routing and next actions.</p></div><ArrowRight size={20} /></Link>
        <Link to="/documents" search={{}} className="work-link"><span className="module-number">03</span><div><h3>Open private documents</h3><p>Upload staging and exact-version history.</p></div><ArrowRight size={20} /></Link>
      </div>
    </section>
    <section className="module-section"><h2>Assigned actions</h2><div className="unconnected-state"><LockKeyhole size={24} /><div><h3>Work queue not connected</h3><p>Your assigned work is not available here yet.</p></div></div></section>
    <div className="module-section"><h2>Workspace directory</h2><ModuleFinder /></div>
  </>;
}

export function ModuleFinder() {
  const [query, setQuery] = useState("");
  const id = useId();
  const matching = modules.filter(module => `${module.name} ${module.description}`.toLowerCase().includes(query.toLowerCase()));
  return <><div className="field module-search"><label htmlFor={id}>Find a module</label><div className="search-input"><Search size={17} /><input id={id} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search module names" /></div></div><div className="module-index">{matching.map(module => <Link key={module.id} to="/$module" params={{ module: module.path }} className="module-index-link"><span className="module-number">{module.id}</span><span>{module.name}</span><ChevronRight size={15} /></Link>)}</div>{matching.length === 0 && <p role="status" className="field-hint">No matching modules.</p>}</>;
}

export function ModuleWorkspace({ path, accountId, facilityId }: { path: string; accountId?: string; facilityId?: string }) {
  if (path === "core") return <HomePage />;
  if (path === "accounts") return <AccountsPage />;
  if (path === "assets") return <Navigate to="/facilities" search={accountId ? { account: accountId } : {}} replace />;
  const module = moduleForPath(path);
  const surface = moduleSurfaces[path];
  if (!module || !surface) return <NotFoundPage />;
  return <ModuleOutline key={path} module={module} surface={surface} accountId={accountId} facilityId={facilityId} />;
}

function ModuleOutline({ module, surface, accountId, facilityId }: { module: (typeof modules)[number]; surface: (typeof moduleSurfaces)[string]; accountId?: string; facilityId?: string }) {
  const [tab, setTab] = useState(0);
  const navigate = useNavigate();
  const directory = usePlanningContext(accountId, facilityId);
  const context = directory.context;
    const id = useId();
  const screens = moduleScreens[module.path];
  if (!screens) return <NotFoundPage />;
  return <>
    <PageHeader eyebrow={`${module.id} · Workspace`} title={module.name} description={module.description} />
    <SpineStrip current={`/${module.path}`} accountId={accountId} />
    <div className="module-boundary"><ShieldCheck size={19} /><p>{surface.boundary}</p></div>
    <ModuleSampleCase module={module.path} />
    {screens.some(screen => isSavablePanel(module.path, screen)) && <PlanContextBar directory={directory} onAccount={id => { void navigate({ to: "/$module", params: { module: module.path }, search: { account: id || undefined, facility: undefined } }); }} onFacility={id => { void navigate({ to: "/$module", params: { module: module.path }, search: { account: accountId, facility: id || undefined } }); }} />}
    {facilityId && !context && <p role="status">{directory.resolution.status === 'loading' ? 'Verifying the selected facility…' : directory.resolution.status === 'error' ? 'Verify context above to continue your draft.' : 'This facility is unavailable in the selected account. Choose an available facility.'}</p>}
    <div className="module-tabs" role="tablist" aria-label={`${module.name} sections`}>{surface.tabs.map((label, index) => <Button key={label} variant="text-button" role="tab" id={`${id}-tab-${index}`} aria-controls={`${id}-panel-${index}`} aria-selected={tab === index} tabIndex={tab === index ? 0 : -1} className={tab === index ? "selected" : ""} onClick={() => setTab(index)} onKeyDown={event => {
      const next = event.key === "ArrowRight" ? (index + 1) % surface.tabs.length : event.key === "ArrowLeft" ? (index + surface.tabs.length - 1) % surface.tabs.length : event.key === "Home" ? 0 : event.key === "End" ? surface.tabs.length - 1 : null;
      if (next === null) return; event.preventDefault(); setTab(next); document.getElementById(`${id}-tab-${next}`)?.focus();
    }}>{label}</Button>)}</div>
    {screens.map((screen,index) => <section key={surface.tabs[index]} role="tabpanel" id={`${id}-panel-${index}`} aria-labelledby={`${id}-tab-${index}`} hidden={tab !== index} tabIndex={0} className="module-section">
      {(!facilityId || context) && <ModuleDraftScreen definition={screen} moduleKey={module.path} index={index} context={context} />}
    </section>)}
  </>;
}
