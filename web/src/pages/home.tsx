import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { ArrowRight, BarChart3, BriefcaseBusiness, Building2, Calculator, ClipboardCheck, ClipboardList, FileText, FlaskConical, FolderKanban, Layers3, LayoutList, Network, ShieldCheck, Wallet } from "lucide-react";
import { SampleCaseTag } from "../components/sample-case";
import { SAMPLE_CASE } from "../lib/sample-case";
import { PageHeader } from "../components/app-shell";
import { ModuleFinder } from "./module-workspace";
import { useRuntime } from "../lib/runtime";

const spine = [
  { label: "Account", to: "/", icon: BriefcaseBusiness },
  { label: "Facility", to: "/facilities", icon: Building2 },
  { label: "Intake", to: "/intake", icon: ClipboardList },
  { label: "Scope", to: "/scope", icon: LayoutList },
  { label: "Sampling", to: "/sampling", icon: FlaskConical },
  { label: "ROM", to: "/estimates", icon: Calculator },
  { label: "Authorization", to: "/approvals", icon: ClipboardCheck },
  { label: "Project", to: "/projects", icon: FolderKanban },
  { label: "Documents", to: "/documents", icon: FileText },
  { label: "Finance", to: "/finance", icon: Wallet },
  { label: "Reporting", to: "/reports", icon: BarChart3 },
] as const;
type StepTo = (typeof spine)[number]["to"] | `/${string}`;
const DIRECT = ["/facilities", "/intake", "/documents"] as const;

/** Link to a step, carrying only an account already present in the URL. No facility is looked up. */
function StepLink({ to, accountId, children, ...rest }: { to: StepTo; accountId?: string; children: ReactNode; className?: string; "aria-current"?: "step" }) {
  const search = accountId ? { account: accountId } : {};
  if (to === "/") return <Link to="/" {...rest}>{children}</Link>;
  if ((DIRECT as readonly string[]).includes(to)) return <Link to={to as (typeof DIRECT)[number]} search={search} {...rest}>{children}</Link>;
  return <Link to="/$module" params={{ module: to.slice(1) }} search={search} {...rest}>{children}</Link>;
}

export function SpineStrip({ current, accountId }: { current?: string; accountId?: string }) {
  return <nav className="spine-strip" aria-label="Work flow"><ol>{spine.map(step => <li key={step.label} className={current === step.to ? "is-current" : ""}><StepLink to={step.to} accountId={accountId} aria-current={current === step.to ? "step" : undefined}><step.icon size={15} aria-hidden="true" /><span>{step.label}</span></StepLink></li>)}</ol><p className="spine-optional"><Layers3 size={13} aria-hidden="true" />Optional: <Link to="/$module" params={{ module: "programs" }}>Programs / MSA</Link> · <Link to="/$module" params={{ module: "portfolios" }}>Portfolios</Link></p></nav>;
}

const R = SAMPLE_CASE.refs;
const journey: { to: StepTo; ref: string; text: string }[] = [
  { to: "/", ref: R.account, text: SAMPLE_CASE.account },
  { to: "/facilities", ref: R.facility, text: `${SAMPLE_CASE.facility} · north service corridor` },
  { to: "/intake", ref: `${R.incident} → ${R.request}`, text: "Moisture concern reported, then a project request" },
  { to: "/scope", ref: R.scope, text: "Inclusions, exclusions and deliverables" },
  { to: "/sampling", ref: R.sampling, text: "Sampling decision still open" },
  { to: "/estimates", ref: R.rom, text: "Illustrative planning range" },
  { to: "/approvals", ref: `${R.scope} rev B`, text: "Exact-revision authority pending" },
  { to: "/projects", ref: R.project, text: "Planned work, not scheduled" },
  { to: "/documents", ref: R.document, text: "Inspection memo, not released" },
  { to: "/finance", ref: R.project, text: "Committed and incurred unknown" },
  { to: "/reports", ref: "Response time", text: "Definition and sources" },
];

function SampleJourney() {
  return <section className="sample-case" aria-labelledby="sample-journey-title">
    <div className="sample-case-head"><SampleCaseTag /><div><h2 id="sample-journey-title">{SAMPLE_CASE.name}</h2><p>Follow one fictional case through the workspace. Nothing here is a record or is saved.</p></div></div>
    <div className="sample-next-action"><strong>Next action in this case</strong><span>A qualified reviewer compares {R.scope} revisions A and B before authorization.</span><Link className="button primary" to="/$module" params={{ module: "scope" }}>Open the scope example<ArrowRight size={16} aria-hidden="true" /></Link></div>
    <ol className="sample-journey">{journey.map((step, index) => <li key={step.to}><StepLink to={step.to}><span className="module-number">{String(index + 1).padStart(2, "0")}</span><div><strong>{spine.find(item => item.to === step.to)?.label}</strong><span>{step.ref} · {step.text}</span></div><ArrowRight size={15} aria-hidden="true" /></StepLink></li>)}</ol>
  </section>;
}

type ViewRow = { title: string; note: string; to: StepTo; badge?: string };
const audiences: Record<string, { lead: string; heading: string; rows: ViewRow[]; layout: "list" | "grid" | "queue" | "packet" }> = {
  "Simple client": { layout: "list", heading: "Your current work", lead: "A small client sees one request, what happens next, and released documents.", rows: [
    { title: `Corridor moisture concern · ${R.request}`, note: "Next: we confirm the scope with you", to: "/intake", badge: "In review" },
    { title: "Confirm corridor access", note: "Your next action: reply to the access question", to: "/messages" },
    { title: "Released documents", note: "None released yet", to: "/documents" },
  ] },
  Enterprise: { layout: "grid", heading: "Harbour Point east portfolio", lead: "An enterprise client sees facility evidence across the portfolio.", rows: [
    { title: SAMPLE_CASE.facility, note: `1 open request · readiness gap: response map`, to: "/readiness", badge: "Attention" },
    { title: "Sample West Depot", note: "No open requests", to: "/portfolios" },
    { title: "Response time definition", note: "Definition and sources, value not calculated", to: "/reports" },
  ] },
  "Internal team": { layout: "queue", heading: "Owner and next-action queue", lead: "The internal team works from owners, due dates and reviewers.", rows: [
    { title: `Compare ${R.scope} revisions`, note: "Owner: project lead · Reviewer: qualified reviewer · Due: 2026-11-02 (sample)", to: "/scope", badge: "Due soon" },
    { title: "Sampling decision", note: "Owner: qualified reviewer · Due: after inspection", to: "/sampling" },
    { title: `Review ${R.rom} range`, note: "Owner: commercial reviewer · Due: 2026-11-05 (sample)", to: "/estimates" },
  ] },
  "Assigned vendor": { layout: "packet", heading: "Your assigned packet", lead: "An assigned vendor sees only permitted instructions and its evidence.", rows: [
    { title: `${R.project} assignment 1`, note: "Photo log of the north service corridor only", to: "/vendors", badge: "Assigned" },
    { title: "Upload evidence", note: `Photo log as ${R.document}: received, not reviewed`, to: "/vendors" },
    { title: "Ask a scoped question", note: "Questions never change approved scope", to: "/messages" },
  ] },
};
type AudienceName = keyof typeof audiences;

function SampleViews() {
  const [view, setView] = useState<AudienceName>("Simple client");
  const sample = audiences[view];
  return <section className="sample-views" aria-labelledby="sample-view-title"><div className="section-intro"><div><p className="entity-type">Sample views</p><h2 id="sample-view-title">How each audience would see this case</h2></div><SampleCaseTag /></div>
    <p className="field-hint">Illustration only. Choosing a view never changes your access or role.</p>
    <div className="segmented" role="group" aria-label="Sample audience">{(Object.keys(audiences) as AudienceName[]).map(name => <button key={name} type="button" className={view === name ? "is-selected" : ""} aria-pressed={view === name} onClick={() => setView(name)}>{name}</button>)}</div>
    <div className={`sample-panel sample-layout-${sample.layout}`}><div className="sample-panel-head"><h3>{sample.heading}</h3><SampleCaseTag label="Sample" /></div><p className="sample-lead">{sample.lead}</p><ul>{sample.rows.map(row => <li key={row.title}><StepLink to={row.to}><div><strong>{row.title}</strong><span>{row.note}</span></div>{row.badge && <span className="status-label">{row.badge}</span>}<ArrowRight size={15} aria-hidden="true" /></StepLink></li>)}</ul></div>
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
    <SampleJourney />
    <SampleViews />
    <section className="module-section"><h2>All 20 modules</h2><ModuleFinder /></section>
  </>;
}
