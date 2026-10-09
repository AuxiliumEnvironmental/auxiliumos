import type { DraftField } from "../pages/module-screen-definitions";

/**
 * One fictional case used for every illustrative surface. These references are
 * plain sample labels: never backend IDs, never persisted automatically and never
 * authorized records.
 */
export const SAMPLE_CASE = {
  name: "Harbour Point · north service corridor moisture concern",
  account: "Harbour Point (sample account)",
  facility: "Sample East Facility",
  area: "North service corridor",
  refs: {
    account: "SAMPLE-AC-01", facility: "SAMPLE-FAC-01", incident: "SAMPLE-INC-14", request: "SAMPLE-REQ-21",
    scope: "SAMPLE-SCP-03", sampling: "SAMPLE-SMP-02", rom: "SAMPLE-ROM-04", project: "SAMPLE-PRJ-08", document: "SAMPLE-DOC-06",
  },
} as const;
const R = SAMPLE_CASE.refs;
const AREA = `${R.facility} · north service corridor`;

/** Values chosen for exact existing field labels. Labels are never renamed here. */
const BY_LABEL: Record<string, string> = {
  "Project request reference": R.request,
  "Facility / area": AREA,
  Facility: R.facility,
  Inclusions: "Visual inspection of the north service corridor walls and ceiling; non-destructive moisture readings at marked grid points; photo log of visible staining.",
  Exclusions: "Destructive openings, roof inspection and occupied office areas are not part of this sample plan.",
  Assumptions: "Corridor access during normal business hours; facility contact available to open the electrical room; no known hazardous materials in the area.",
  Limitations: "Readings describe conditions on the inspection day only. Concealed cavities are not assessed without later approval.",
  "Sampling decision": "Not decided. The qualified reviewer decides after inspection whether sampling is needed; nothing is recorded as decided in this example.",
  "Accepted recommendations": "None recorded in this sample.",
  "Declined recommendations": "None recorded in this sample.",
  "Scope revision reference": `${R.scope} revision B`,
  "Scope revision": `${R.scope} revision B`,
  "Current approved revision": `${R.scope} revision A (sample; not an approved record)`,
  "Requested change": "Add moisture readings in the adjacent storage room where staining was reported after the original request.",
  "Reason for change": "Facility contact reported new staining near the shared wall in the sample narrative.",
  "Work affected": "Inspection grid and photo log extend by one room.",
  "Schedule and cost considerations": "Roughly half a day of additional field time in this illustration; not a commercial commitment.",
  "Project reference": R.project,
  "Authorization reference": `Pending for ${R.scope} revision B (sample)`,
  "Accountable owner": "Sample role: project lead",
  "Handoff notes": "Coordinate corridor access with the facility contact; share the photo log template before mobilization planning.",
  "Scheduling constraints": "Corridor carries deliveries before 10:00; plan inspection after mid-morning.",
  "Accountable reviewer": "Sample role: qualified reviewer",
  "Handoff evidence": `Inspection photo log and moisture reading sheet, filed as ${R.document} (sample).`,
  "Exceptions and outstanding work": "Storage room readings pending a change request decision.",
  "Program name": "Harbour Point regional facilities program (sample)",
  "Client account reference": R.account,
  "MSA reference": "SAMPLE-MSA-01",
  "Portfolio name": "Harbour Point east portfolio (sample)",
  "Regional grouping": "East region",
  "Facility reference": R.facility,
  "Facility coordinator": "Sample role: facility coordinator",
  "Accountable contact": "Sample role: facility manager",
  "Response map": "Main entrance, loading dock and north service corridor; shut-off locations to be confirmed by the facility contact.",
  "Access information": "Badge access through the loading dock; escort required in the electrical room.",
  Currency: "USD",
  "Planning range lower": "12000.00",
  "Planning range upper": "18500.00",
  "Labor basis": "One technician and one reviewer; inspection day plus reporting time (illustrative).",
  "Direct cost basis": "Moisture meter calibration and photo documentation only in this illustration.",
  "Travel assumptions": "Local travel within the east region.",
  "Uncertainty and exclusions": "Range widens if the change request adds the storage room; laboratory analysis excluded until a sampling decision exists.",
  "Estimate revision": `${R.rom} revision A`,
  "Sampling plan revision": `${R.sampling} revision A`,
  "Sampling strategy": "Not yet determined. This placeholder only lists what a qualified reviewer would need to decide.",
  "Professional review questions": "Is sampling needed after inspection? If so, which locations and methods are appropriate?",
  "Laboratory report reference": "Not received (sample)",
  Subject: `Access for corridor inspection · ${R.request}`,
  "Linked record reference": R.request,
  "Recipient reference": "Sample role: facility manager",
  Message: "Could you confirm corridor access after 10:00 on the proposed day and who can open the electrical room? This is a planning question only.",
  "Work order reference": `${R.project} work order 1`,
  "Vendor reference": "SAMPLE-VEN-02",
  "Assignment reference": `${R.project} assignment 1`,
  "Completion evidence": `Photo log uploaded as ${R.document} (sample); received, not reviewed.`,
  Exceptions: "None recorded in this sample.",
  "Company name": "Sample Field Services (fictional)",
  "Report name": "Response time to first inspection (sample definition)",
  "Metric definition": "Days from request receipt to first site inspection.",
  "Denominator definition": "Requests with a recorded first inspection in the period.",
  "Source references": `${R.request}; ${R.project}`,
  "Definition name": "Response time to first inspection",
  "Calculation definition": "Inspection date minus request receipt date, in calendar days.",
  Denominator: "Requests with both dates recorded in the period.",
  "Source records": "Intake requests and project field records.",
  "Missing-value handling": "Requests without an inspection date are reported separately, not as zero.",
  Question: `Summarize the open questions in ${R.scope} revision B for the reviewer.`,
  "Review notes": "Sample review notes. Not an approval or completion record.",
  "Current revision notes": `${R.scope} revision A covers the corridor only.`,
  "Proposed revision notes": `${R.scope} revision B adds the adjacent storage room.`,
};

const REF_RULES: [RegExp, string][] = [
  [/scope|revision/i, `${R.scope} revision B`], [/request/i, R.request], [/incident/i, R.incident],
  [/estimate|cap\b/i, R.rom], [/sampl|lab/i, R.sampling], [/project|work order|assignment/i, R.project],
  [/document|deliverable|evidence|source|report|invoice|credential|reserve|transaction/i, R.document],
  [/facility|area|asset|location/i, AREA], [/account/i, R.account],
];
const PEOPLE = /reviewer|owner|contact|person|signer|coordinator|custodian|actor|recipient|responsible|payer|authority|audience/i;

export function sampleValue(field: DraftField): string {
  if (Object.prototype.hasOwnProperty.call(BY_LABEL, field.label)) return BY_LABEL[field.label];
  const label = field.label;
  if (field.kind === "select") return field.options?.[0] ?? "";
  if (field.kind === "date") return /end|until|to date/i.test(label) ? "2026-12-31" : /start|from/i.test(label) ? "2026-10-01" : "2026-11-04";
  if (field.kind === "money") return "1500.00";
  if (field.kind === "quantity") return "6";
  if (field.kind === "multiline") return `Sample note for the ${SAMPLE_CASE.area.toLowerCase()} case: ${label.toLowerCase()} to be confirmed by the responsible person.`;
  if (PEOPLE.test(label)) return `Sample role: ${/review/i.test(label) ? "qualified reviewer" : /payer|commercial/i.test(label) ? "commercial contact" : "facility manager"}`;
  for (const [rule, value] of REF_RULES) if (rule.test(label)) return value;
  if (/name|title/i.test(label)) return "North corridor moisture follow-up (sample)";
  return `Sample · ${SAMPLE_CASE.area.toLowerCase()}`;
}

/** Two coherent illustrative rows for repeatable sections. */
export function sampleRows(fields: DraftField[]): Record<string, string>[] {
  const second: Record<string, string> = {
    Deliverable: "Moisture reading sheet", "Acceptance evidence": `Reading grid filed as ${R.document} (sample)`,
    "Work order title": "Corridor photo log", "Location reference": "Corridor grid C4", "Sample identifier": "Not assigned",
    Description: "Reporting and review", Unit: "hour", "Assignment title": "Upload photo log",
  };
  const first = Object.fromEntries(fields.map(field => [field.label, field.label === "Deliverable" ? "Inspection summary memo" : field.label === "Work order title" ? "Corridor moisture readings" : field.label === "Description" ? "Inspection day" : field.label === "Unit" ? "day" : sampleValue(field)]));
  const next = Object.fromEntries(fields.map(field => [field.label, second[field.label] ?? first[field.label]]));
  return [first, next];
}

export const sampleTitle = (screenTitle: string) => `Sample – Harbour Point corridor · ${screenTitle}`.slice(0, 120);
