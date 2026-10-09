import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { SAMPLE_CASE } from "../lib/sample-case";

const R = SAMPLE_CASE.refs;

/** Persistent marker for every illustrative area. */
export function SampleCaseTag({ label = "Sample case" }: { label?: string }) {
  return <span className="sample-tag" title="Fictional illustration. Not a record and never saved automatically.">{label}</span>;
}

type Item = { title: string; meta?: string; status?: string };
type Block =
  | { kind: "facts"; title: string; facts: [string, string][] }
  | { kind: "list"; title: string; items: Item[] }
  | { kind: "stages"; title: string; items: Item[] }
  | { kind: "thread"; title: string; items: Item[] };
type Composition = { lead: string; blocks: Block[]; next?: { label: string; module: string } };

/** Module-specific illustrations of the one sample case. Nothing here is fetched or stored. */
export const moduleSamples: Record<string, Composition> = {
  programs: { lead: "How a program's coverage would read for the sample account.", next: { label: "See the portfolio", module: "portfolios" }, blocks: [
    { kind: "facts", title: "Coverage summary", facts: [["Program", "Harbour Point regional facilities (sample)"], ["Account", R.account], ["Framework", "SAMPLE-MSA-01 · effective revision not connected"], ["Facilities covered", "3 in this illustration"]] },
    { kind: "list", title: "Covered facilities", items: [{ title: `${SAMPLE_CASE.facility} · ${R.facility}`, status: "Active in sample" }, { title: "Sample West Depot", status: "Active in sample" }, { title: "Sample Harbour Annex", status: "Pending activation" }] },
  ] },
  portfolios: { lead: "A portfolio groups sites for enterprise reporting; simple clients can skip it.", next: { label: "Open site readiness", module: "readiness" }, blocks: [
    { kind: "list", title: "Sites in Harbour Point east portfolio", items: [{ title: SAMPLE_CASE.facility, meta: `${R.facility} · 1 open request (${R.request})`, status: "Needs attention" }, { title: "Sample West Depot", meta: "No open requests", status: "Steady" }, { title: "Sample Harbour Annex", meta: "Readiness review due", status: "Review due" }] },
  ] },
  readiness: { lead: "Site passport evidence and the gaps a reviewer would track.", next: { label: "Go to intake", module: "intake" }, blocks: [
    { kind: "list", title: "Evidence on file", items: [{ title: "Site contacts", status: "Reviewed in sample" }, { title: "Access information", status: "Reviewed in sample" }, { title: "Response map", status: "Gap" }] },
    { kind: "list", title: "Open gaps", items: [{ title: "Shut-off locations unconfirmed", meta: "Owner: sample facility manager · next: confirm on walkthrough" }, { title: "Electrical room escort contact missing", meta: "Owner: sample project lead" }] },
  ] },
  scope: { lead: `${R.scope} revision B for request ${R.request}: what is in, what is out, and what will be delivered.`, next: { label: "Plan sampling", module: "sampling" }, blocks: [
    { kind: "list", title: "Inclusions", items: [{ title: "Visual inspection of corridor walls and ceiling" }, { title: "Non-destructive moisture readings on a marked grid" }, { title: "Photo log of visible staining" }] },
    { kind: "list", title: "Exclusions", items: [{ title: "Destructive openings" }, { title: "Roof inspection" }, { title: "Occupied office areas" }] },
    { kind: "list", title: "Deliverables", items: [{ title: "Inspection summary memo", meta: `Will be filed as ${R.document}` }, { title: "Moisture reading sheet" }] },
  ] },
  sampling: { lead: `${R.sampling}: each stage is kept separate. No results or conclusions exist in this sample.`, next: { label: "Prepare the ROM", module: "estimates" }, blocks: [
    { kind: "stages", title: "Sampling stages", items: [{ title: "Requested", meta: "Reviewer to decide after inspection", status: "Open question" }, { title: "Collected", meta: "Nothing collected", status: "Not started" }, { title: "Laboratory", meta: "No report received", status: "Not started" }, { title: "Interpreted", meta: "Professional interpretation is recorded separately by a qualified person", status: "Not started" }] },
  ] },
  estimates: { lead: `${R.rom} is a planning estimate for ${R.scope} revision B, not a price or commitment.`, next: { label: "Review authorization", module: "approvals" }, blocks: [
    { kind: "facts", title: "Illustrative planning range", facts: [["Range", "USD 12,000 to 18,500 (illustrative only)"], ["Basis", "Inspection day plus reporting time"], ["Status", "Not reviewed · no cap granted"]] },
    { kind: "list", title: "Assumptions", items: [{ title: "Business-hours corridor access" }, { title: "Laboratory analysis excluded until a sampling decision exists" }, { title: "Range widens if the storage room is added" }] },
  ] },
  approvals: { lead: "Authorization always binds one exact scope revision. Authority here is pending.", next: { label: "Open the project", module: "projects" }, blocks: [
    { kind: "facts", title: "Exact-revision review", facts: [["Scope revision", `${R.scope} revision B`], ["Estimate", `${R.rom} revision A`], ["Signer", "Sample role: facility manager"], ["Authority", "Pending · nothing signed"]] },
  ] },
  projects: { lead: `${R.project}: planned work and next actions. Nothing is scheduled.`, next: { label: "See documents", module: "documents" }, blocks: [
    { kind: "list", title: "Planned work", items: [{ title: "Corridor moisture readings", meta: "Planned, not scheduled", status: "Planning" }, { title: "Corridor photo log", meta: "Planned, not scheduled", status: "Planning" }] },
    { kind: "list", title: "Next actions", items: [{ title: "Confirm corridor access window", meta: "Owner: sample project lead" }, { title: "Await authorization of revision B", meta: "Owner: sample facility manager" }] },
  ] },
  messages: { lead: `A conversation linked to ${R.request}. Messages never change approved scope.`, blocks: [
    { kind: "thread", title: "Sample thread", items: [{ title: "Sample project lead", meta: "Could you confirm corridor access after 10:00 on the proposed day?" }, { title: "Sample facility manager", meta: "Yes. The electrical room needs an escort; I will arrange it." }, { title: "Draft reply (not sent)", meta: "Thanks, we will plan around deliveries before 10:00." }] },
  ] },
  vendors: { lead: "An assigned vendor sees only its permitted packet and the evidence it uploads.", blocks: [
    { kind: "facts", title: "Assigned work packet", facts: [["Vendor", "Sample Field Services (fictional)"], ["Assignment", `${R.project} assignment 1`], ["Instructions", "Photo log of the north service corridor only"]] },
    { kind: "list", title: "Evidence", items: [{ title: "Photo log", meta: `${R.document}`, status: "Received, not reviewed" }] },
  ] },
  finance: { lead: "Illustrative inputs kept separate. Values not illustrated stay unknown.", next: { label: "See reporting", module: "reports" }, blocks: [
    { kind: "facts", title: `Financial inputs for ${R.project}`, facts: [["Committed", "Unknown · no authorization"], ["Incurred", "Unknown"], ["Invoiced", "Unknown"], ["Reserve", "Unknown"], ["Planning range (ROM)", "USD 12,000 to 18,500, illustrative"]] },
  ] },
  reports: { lead: "Every figure needs a definition, a denominator and its source records.", blocks: [
    { kind: "facts", title: "Response time to first inspection", facts: [["Definition", "Days from request receipt to first inspection"], ["Denominator", "Requests with both dates recorded"], ["Missing values", "Reported separately, never as zero"], ["Sources", `${R.request}; ${R.project}`], ["Value", "Not calculated · sources not connected"]] },
  ] },
  ai: { lead: "Assistance is bound to permitted sources and always reviewed by a person.", blocks: [
    { kind: "stages", title: "Source-bound draft", items: [{ title: "Sources", meta: `${R.scope} revision B; ${R.request}`, status: "Cited" }, { title: "Suggested wording", meta: "Summary of open reviewer questions", status: "Draft" }, { title: "Human review", meta: "Sample qualified reviewer", status: "Pending" }] },
  ] },
  audit: { lead: "Event example only. This is not your audit log; actual events require audit access.", blocks: [
    { kind: "facts", title: "Event example", facts: [["Operation", "Scope revision submitted for review"], ["Object", `${R.scope} revision B`], ["Actor", "Sample role: project lead"], ["Provenance", "Recorded by the server, not the browser"]] },
  ] },
  integrations: { lead: "Moldo stays independently operated. Nothing is connected or exchanged.", blocks: [
    { kind: "facts", title: "Moldo", facts: [["Independence", "Operates without AuxiliumOS"], ["Provenance", "Source records would stay owned by Moldo"], ["Status", "Not connected"]] },
  ] },
};

function BlockView({ block }: { block: Block }) {
  if (block.kind === "facts") return <div className="sample-block"><h3>{block.title}</h3><dl className="sample-facts">{block.facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></div>;
  const cls = block.kind === "stages" ? "sample-stages" : block.kind === "thread" ? "sample-thread" : "sample-list";
  return <div className="sample-block"><h3>{block.title}</h3><ol className={cls}>{block.items.map(item => <li key={item.title}><div><strong>{item.title}</strong>{item.meta && <span>{item.meta}</span>}</div>{item.status && <span className="status-label">{item.status}</span>}</li>)}</ol></div>;
}

/** Illustration for one module. Kept visually separate from real planning drafts. */
export function ModuleSampleCase({ module }: { module: string }) {
  const sample = moduleSamples[module];
  if (!sample) return null;
  return <section className="sample-case" aria-label="Sample case illustration">
    <div className="sample-case-head"><SampleCaseTag /><p><strong>{SAMPLE_CASE.name}</strong> · {sample.lead}</p></div>
    <div className="sample-blocks">{sample.blocks.map(block => <BlockView key={block.title} block={block} />)}</div>
    {sample.next && <Link className="sample-next" to="/$module" params={{ module: sample.next.module }}>{sample.next.label}<ArrowRight size={15} aria-hidden="true" /></Link>}
  </section>;
}
