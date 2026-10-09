import { Link, Navigate } from "@tanstack/react-router";
import { useId, useState } from "react";
import { ArrowRight, ChevronRight, FileSearch, Layers3, LockKeyhole, Search, ShieldCheck } from "lucide-react";
import { Button } from "../components/button";
import { PageHeader } from "../components/app-shell";
import { moduleForPath, modules } from "../lib/modules";
import { moduleSurfaces } from "./module-surfaces";
import { AccountsPage } from "./directory";
import { NotFoundPage } from "./workspace";

export function MyWorkPage() {
  return <><PageHeader eyebrow="Core · Your workspace" title="My work" description="Continue with the accounts and work available to your assigned login." />
    <section className="work-start" aria-labelledby="continue-heading"><div className="section-intro"><h2 id="continue-heading">Continue your work</h2><span className="status-label"><ShieldCheck size={14} />Assigned access</span></div>
      <div className="work-links">
        <Link to="/" className="work-link"><span className="module-number">01</span><div><h3>Choose an account</h3><p>Open your permitted account directory.</p></div><ArrowRight size={20} /></Link>
        <Link to="/intake" search={{}} className="work-link"><span className="module-number">02</span><div><h3>Follow a project request</h3><p>Submission, review routing and next actions.</p></div><ArrowRight size={20} /></Link>
        <Link to="/documents" search={{}} className="work-link"><span className="module-number">03</span><div><h3>Open private documents</h3><p>Upload staging and exact-version history.</p></div><ArrowRight size={20} /></Link>
      </div>
    </section>
    <section className="module-section"><h2>Assigned actions</h2><div className="unconnected-state"><LockKeyhole size={24} /><div><h3>Work queue not connected</h3><p>An assigned-action projection is not yet available. No overdue counts, tasks or workload totals are shown.</p></div></div></section>
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
  const [expanded, setExpanded] = useState(true);
  const id = useId();
  return <>
    <PageHeader eyebrow={`${module.id} · Workspace module`} title={module.name} description={module.description} action={<span className="status-label unavailable"><LockKeyhole size={14} />Not connected</span>} />
    <div className="module-boundary"><ShieldCheck size={19} /><p>{surface.boundary}</p></div>
    <div className="module-tabs" role="tablist" aria-label={`${module.name} sections`}>{surface.tabs.map((label, index) => <Button key={label} variant="text-button" role="tab" id={`${id}-tab-${index}`} aria-controls={`${id}-panel`} aria-selected={tab === index} tabIndex={tab === index ? 0 : -1} className={tab === index ? "selected" : ""} onClick={() => setTab(index)} onKeyDown={event => {
      const next = event.key === "ArrowRight" ? (index + 1) % surface.tabs.length : event.key === "ArrowLeft" ? (index + surface.tabs.length - 1) % surface.tabs.length : event.key === "Home" ? 0 : event.key === "End" ? surface.tabs.length - 1 : null;
      if (next === null) return; event.preventDefault(); setTab(next); document.getElementById(`${id}-tab-${next}`)?.focus();
    }}>{label}</Button>)}</div>
    <section role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${tab}`} tabIndex={0} className="module-section">
      <div className="section-intro"><div><p className="entity-type">{tab === 0 ? "Record workspace" : "Review workspace"}</p><h2>{surface.tabs[tab]}</h2></div><Button disabled title={surface.dependency}><LockKeyhole size={15} />{surface.action}</Button></div>
      <div className="record-table" role="region" aria-label={`${surface.noun} list`} tabIndex={0}><table><thead><tr>{surface.columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead><tbody><tr><td colSpan={surface.columns.length}><div className="unconnected-state"><FileSearch size={30} /><div><h3>{surface.tabs[tab]} are not connected</h3><p>{surface.dependency}</p><span className="field-hint">No records have been requested. This is not an empty-result confirmation.</span></div></div></td></tr></tbody></table></div>
      <div className="outline-heading"><h2>{tab === 0 ? "Record structure" : tab === 1 ? "Review structure" : "Control structure"}</h2><Button variant="text-button" aria-expanded={expanded} aria-controls={`${id}-structure`} onClick={() => setExpanded(value => !value)}>{expanded ? "Hide structure" : "Show structure"}<ChevronRight size={15} className={expanded ? "rotate-icon" : ""} /></Button></div>
      {expanded && <div className="record-outline" id={`${id}-structure`}>{surface.sections.map((section, index) => <section className="outline-section" key={section.title}><div className="outline-section-title"><span className="module-number">0{index + 1}</span><h3>{section.title}</h3></div><dl>{section.fields.map(field => <div key={field}><dt>{field}</dt><dd>Unavailable</dd></div>)}</dl><p>{section.note}</p></section>)}</div>}
    </section>
    <section className="module-section dependency-footer"><Layers3 size={18} /><div><h2>Connection required</h2><p>{surface.dependency} No local changes are saved and no authority is granted.</p></div></section>
  </>;
}