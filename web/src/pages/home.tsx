import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, BriefcaseBusiness, Building2, ClipboardCheck, ClipboardList, FileText, FolderKanban, Layers3, LayoutList, Network, ShieldCheck } from "lucide-react";
import { PageHeader } from "../components/app-shell";
import { ModuleFinder } from "./module-workspace";
import { useRuntime } from "../lib/runtime";

const spine = [
  { label: "Account", to: "/", icon: BriefcaseBusiness, note: "Your assigned directory" },
  { label: "Facility", to: "/facilities", icon: Building2, note: "Site context" },
  { label: "Incident / Request", to: "/intake", icon: ClipboardList, note: "Distinct records" },
  { label: "Scope", to: "/scope", icon: LayoutList, note: "Versioned revisions" },
  { label: "Authorization", to: "/approvals", icon: ClipboardCheck, note: "Exact-revision authority" },
  { label: "Project", to: "/projects", icon: FolderKanban, note: "Work orders and closeout" },
  { label: "Deliverables / Documents", to: "/documents", icon: FileText, note: "Immutable versions" },
] as const;

export function SpineStrip({ current }: { current?: string }) {
  return <nav className="spine-strip" aria-label="Work flow"><ol>{spine.map(step => <li key={step.label} className={current === step.to ? "is-current" : ""}><Link {...(["/", "/facilities", "/intake", "/documents"].includes(step.to) ? { to: step.to as "/" | "/facilities" | "/intake" | "/documents", search: {} } : { to: "/$module" as const, params: { module: step.to.slice(1) } })} aria-current={current === step.to ? "step" : undefined}><step.icon size={15} aria-hidden="true" /><span>{step.label}</span></Link></li>)}</ol><p className="spine-optional"><Layers3 size={13} aria-hidden="true" />Optional: <Link to="/$module" params={{ module: "programs" }}>Programs / MSA</Link> · <Link to="/$module" params={{ module: "portfolios" }}>Portfolios</Link></p></nav>;
}

const audiences = {
  "Simple client": { lead: "A small client sees only a few core actions.", items: [["Submit a request", "Tell us what is happening at your site."], ["Follow your project", "SAMPLE: Water intrusion review – status shown when assigned."], ["Open released documents", "Only documents released to you appear."]] },
  Enterprise: { lead: "An enterprise client sees site and portfolio context.", items: [["SAMPLE portfolio · Northern region", "Sample: 4 facilities"], ["Site passport gaps", "Sample: 2 open readiness items"], ["Executive brief", "Sample period summary, released sources only"]] },
  "Internal team": { lead: "The internal team sees an owner and next-action queue.", items: [["Triage SAMPLE request", "Sample owner: Project lead · Next: classify"], ["Scope revision review", "Sample owner: Qualified reviewer · Next: compare revisions"], ["Closeout evidence", "Sample owner: Field coordinator · Next: confirm deliverables"]] },
  "Assigned vendor": { lead: "An assigned vendor sees only their instructions and evidence.", items: [["SAMPLE work order", "Permitted instructions for an assigned area"], ["Upload completion evidence", "Evidence is received, not approved"], ["Ask a scoped question", "Questions never change approved scope"]] },
} as const;
type AudienceName = keyof typeof audiences;

function SampleViews() {
  const [view, setView] = useState<AudienceName>("Simple client");
  const sample = audiences[view];
  return <section className="sample-views" aria-labelledby="sample-view-title"><div className="section-intro"><div><p className="entity-type">Sample view</p><h2 id="sample-view-title">How each audience experiences AuxiliumOS</h2></div><span className="sample-tag">Sample</span></div>
    <p className="field-hint">Illustration only. It does not change your access; your actions always follow your assigned rights.</p>
    <div className="segmented" role="group" aria-label="Sample audience">{(Object.keys(audiences) as AudienceName[]).map(name => <button key={name} type="button" className={view === name ? "is-selected" : ""} aria-pressed={view === name} onClick={() => setView(name)}>{name}</button>)}</div>
    <div className={`sample-panel sample-${view.replace(/\s/g, "-").toLowerCase()}`}><p className="sample-lead">{sample.lead}</p><ul>{sample.items.map(([title, note]) => <li key={title}><span className="sample-tag">Sample</span><div><strong>{title}</strong><span>{note}</span></div></li>)}</ul></div>
  </section>;
}

export function HomePage() {
  const { state } = useRuntime();
  const name = state.status === "ready" ? state.context.displayName : "";
  return <>
    <PageHeader eyebrow="Core · Development workspace" title={name ? `Welcome, ${name}` : "Home"} description="Start from an assigned account and facility, then follow the work from request to released documents." />
    <section className="home-grid">
      <div className="home-card home-next"><h2>Next actions</h2><ul className="next-list">
        <li><Link to="/"><BriefcaseBusiness size={18} /><div><strong>Choose an account</strong><span>See the accounts assigned to your login.</span></div><ArrowRight size={16} /></Link></li>
        <li><Link to="/intake" search={{}}><ClipboardList size={18} /><div><strong>Submit or triage a request</strong><span>Incidents and project requests stay separate.</span></div><ArrowRight size={16} /></Link></li>
        <li><Link to="/$module" params={{ module: "scope" }}><LayoutList size={18} /><div><strong>Prepare a scope planning draft</strong><span>Saved for a development facility; not a scope revision.</span></div><ArrowRight size={16} /></Link></li>
        <li><Link to="/documents" search={{}}><FileText size={18} /><div><strong>Open private documents</strong><span>Upload, version history and exact-version download.</span></div><ArrowRight size={16} /></Link></li>
      </ul></div>
      <div className="home-card home-facts"><h2>Workspace</h2><dl>
        <div><dt>Dataset</dt><dd><span className="dataset-pill">Development · Sample dataset</span></dd></div>
        <div><dt>Access</dt><dd><ShieldCheck size={14} /> Assigned login</dd></div>
        <div><dt>Open work</dt><dd>Unknown until your work queue is connected</dd></div>
        <div><dt>Moldo</dt><dd><Network size={14} /> Independently operated · not connected</dd></div>
      </dl></div>
    </section>
    <section className="module-section"><h2>From request to released documents</h2><p className="field-hint">Links help you move between related work. Following a link never creates or approves anything.</p><SpineStrip /></section>
    <SampleViews />
    <section className="module-section"><h2>All 20 modules</h2><ModuleFinder /></section>
  </>;
}
