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
import { ModuleRecordList } from "../components/module-record-list";

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

export function ModuleWorkspace({ path, accountId }: { path: string; accountId?: string }) {
  if (path === "core") return <MyWorkPage />;
  if (path === "accounts") return <AccountsPage />;
  if (path === "assets") return <Navigate to="/facilities" search={accountId ? { account: accountId } : {}} replace />;
  const module = moduleForPath(path);
  const surface = moduleSurfaces[path];
  if (!module || !surface) return <NotFoundPage />;
  return <ModuleOutline key={path} module={module} surface={surface} />;
}

function ModuleOutline({ module, surface }: { module: (typeof modules)[number]; surface: (typeof moduleSurfaces)[string] }) {
  const [tab, setTab] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const id = useId();
  const screens = moduleScreens[module.path];
  if (!screens) return <NotFoundPage />;
  return <>
    <PageHeader eyebrow={`${module.id} · Workspace`} title={module.name} description={module.description} />
    <div className="module-boundary"><ShieldCheck size={19} /><p>{surface.boundary}</p></div>
    <div className="module-tabs" role="tablist" aria-label={`${module.name} sections`}>{surface.tabs.map((label, index) => <Button key={label} variant="text-button" role="tab" id={`${id}-tab-${index}`} aria-controls={`${id}-panel-${index}`} aria-selected={tab === index} tabIndex={tab === index ? 0 : -1} className={tab === index ? "selected" : ""} onClick={() => setTab(index)} onKeyDown={event => {
      const next = event.key === "ArrowRight" ? (index + 1) % surface.tabs.length : event.key === "ArrowLeft" ? (index + surface.tabs.length - 1) % surface.tabs.length : event.key === "Home" ? 0 : event.key === "End" ? surface.tabs.length - 1 : null;
      if (next === null) return; event.preventDefault(); setTab(next); document.getElementById(`${id}-tab-${next}`)?.focus();
    }}>{label}</Button>)}</div>
    {screens.map((screen,index) => <section key={surface.tabs[index]} role="tabpanel" id={`${id}-panel-${index}`} aria-labelledby={`${id}-tab-${index}`} hidden={tab !== index} tabIndex={0} className="module-section">
      {index === 0 && !['integration','audit','conversation'].includes(screen.pattern) && <><div className="workspace-mode" role="group" aria-label="Workspace view"><Button variant={preparing ? 'text-button' : 'secondary'} aria-pressed={!preparing} onClick={()=>setPreparing(false)}>Records</Button><Button variant={preparing ? 'secondary' : 'text-button'} aria-pressed={preparing} onClick={()=>setPreparing(true)}>Draft preparation</Button></div><div hidden={preparing}><ModuleRecordList title={surface.tabs[0]} columns={surface.columns} access={{status:'unavailable'}} onPrepare={()=>setPreparing(true)} /></div></>}
      <div hidden={index === 0 && !preparing && !['integration','audit','conversation'].includes(screen.pattern)}><ModuleDraftScreen definition={screen} open={index === 0 && preparing} /></div>
    </section>)}
  </>;
}
