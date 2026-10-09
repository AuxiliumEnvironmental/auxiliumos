/** Repository-defined presentation outlines. These are not API contracts or records. */
export type ModuleSection = { title: string; fields: readonly string[]; note: string };
export type ModuleSurface = {
  noun: string; tabs: readonly string[]; columns: readonly string[];
  sections: readonly ModuleSection[]; action: string; dependency: string; boundary: string;
};
export const moduleSurfaces: Record<string, ModuleSurface> = {
  programs: {
    noun: "programs", tabs: ["Coverage", "Effective periods", "Commercial framework"], columns: ["Program / MSA", "Account", "Covered facilities", "Effective period"], action: "Create program",
    sections: [
      { title: "Program coverage", fields: ["Client account", "MSA reference", "Covered facilities"], note: "Facility activation belongs to the effective program coverage." },
      { title: "Effective framework", fields: ["Effective period", "Response expectations", "Rate card reference"], note: "Commercial terms require their own valid authority." },
    ], dependency: "Scoped program and coverage reads, versioned terms, and program-management capabilities are not connected.", boundary: "An MSA does not authorize individual project work.",
  },
  portfolios: {
    noun: "portfolios", tabs: ["Portfolios", "Facility relationships", "Executive view"], columns: ["Portfolio", "Client account", "Regional grouping", "Facilities"], action: "Create portfolio",
    sections: [
      { title: "Portfolio structure", fields: ["Client account", "Regional grouping", "Facility relationships"], note: "The portfolio is optional; simple clients can work directly with facilities." },
      { title: "Executive context", fields: ["Assigned audience", "Source facilities", "Released executive content"], note: "Portfolio summaries must respect the same record-level visibility as their source." },
    ], dependency: "Portfolio relationships, scoped aggregate reads and executive audience capabilities are not connected.", boundary: "Grouping facilities never broadens access to their records.",
  },
  readiness: {
    noun: "site passports", tabs: ["Site passport", "Readiness gaps", "Recurring work"], columns: ["Facility", "Facility Coordinator", "Review", "Next action"], action: "Update site passport",
    sections: [
      { title: "Site passport", fields: ["Facility Coordinator", "Response map", "Critical assets", "Access information"], note: "Site information remains attached to the facility and its areas." },
      { title: "Readiness review", fields: ["Recorded deficiencies", "Accountable owner", "Due date", "Evidence"], note: "A readiness indicator describes recorded evidence, not a safety certification." },
    ], dependency: "Facility passport reads, readiness review records and scoped update capabilities are not connected.", boundary: "Readiness is not a professional safety or compliance conclusion.",
  },
  scope: {
    noun: "scope records", tabs: ["Scope records", "Revision review", "Change requests"], columns: ["Scope record", "Project request", "Revision", "Review state"], action: "Create scope draft",
    sections: [
      { title: "Work boundaries", fields: ["Project request", "Areas", "Inclusions", "Exclusions"], note: "Scope connects to the original request without replacing its original wording." },
      { title: "Revision review", fields: ["Assumptions", "Deliverables", "Sampling decision", "Exact revision"], note: "Qualified review and client decisions bind a specific immutable revision." },
    ], dependency: "Versioned scope reads, revision mutations, reviewer capabilities and change-authorization endpoints are not connected.", boundary: "Messages and AI cannot change an approved scope.",
  },
  sampling: {
    noun: "sampling plans", tabs: ["Plans", "Chain of custody", "Laboratory evidence"], columns: ["Sampling plan", "Scope revision", "Location", "Qualified review"], action: "Prepare sampling plan",
    sections: [
      { title: "Plan and location", fields: ["Scope revision", "Facility / area", "Sampling strategy", "Qualified reviewer"], note: "Sampling strategy requires professional review tied to the approved scope." },
      { title: "Evidence chain", fields: ["Sample identification", "Chain of custody", "Laboratory report", "Professional interpretation"], note: "Laboratory-reported results and professionally interpreted conclusions remain distinct." },
    ], dependency: "Sampling-plan and custody reads, exact-revision approvals and qualified reviewer capabilities are not connected.", boundary: "No scientific thresholds or automated approval are supplied by this screen.",
  },
  estimates: {
    noun: "ROM estimates", tabs: ["Estimates", "Assumptions", "Cap review"], columns: ["Estimate", "Scope revision", "Planning range", "Commercial review"], action: "Create ROM draft",
    sections: [
      { title: "Planning basis", fields: ["Scope revision", "Labor range", "Direct costs", "Travel"], note: "No live rates or estimate values have been configured here." },
      { title: "Commercial assumptions", fields: ["Time and materials basis", "Assumptions", "Recommended cap", "Granted cap reference"], note: "A recommendation is not a granted spending authorization." },
    ], dependency: "Versioned estimate reads, configured commercial inputs and separate cap-authority capabilities are not connected.", boundary: "ROM planning does not authorize expenditure or promise a final price.",
  },
  approvals: {
    noun: "authorizations", tabs: ["Authorizations", "Exact-revision review", "Amendments"], columns: ["Agreement", "Exact revision", "Signer / payer", "Decision"], action: "Request authorization",
    sections: [
      { title: "Authority and terms", fields: ["Authorized signer", "Payer", "Rate basis", "Terms"], note: "Signer, payer and technical reviewer are separate authorities." },
      { title: "Bound revision", fields: ["Scope revision", "Agreement revision", "Effective amendment", "Signature evidence"], note: "Signatures bind exact immutable terms; a new draft does not supersede them." },
    ], dependency: "Agreement revision reads, signer verification, signature transactions and amendment capabilities are not connected.", boundary: "No signature, approval or emergency exception can be granted here.",
  },
  projects: {
    noun: "projects", tabs: ["Projects", "Assigned tasks", "Deliverables & closeout"], columns: ["Project", "Authorized scope", "Accountable owner", "Next action"], action: "Schedule project",
    sections: [
      { title: "Authorized work", fields: ["Authorization", "Scope revision", "Facility", "Accountable owner"], note: "An incident, a project request and an authorized project are distinct records." },
      { title: "Execution and closeout", fields: ["Visits / work orders", "Checklist evidence", "Working / waiting time", "Deliverables"], note: "Completion needs accountable review and a recorded handoff, not a local checkbox." },
    ], dependency: "Authorized project reads, assigned-work projections, task transactions and scheduling capabilities are not connected.", boundary: "Scheduling and mobilization require effective authorization.",
  },
  messages: {
    noun: "conversations", tabs: ["Conversations", "Follow-up requests", "Communication routes"], columns: ["Conversation", "Linked record", "Route", "Next responsible person"], action: "Send message",
    sections: [
      { title: "Linked conversation", fields: ["Account / project / document", "Recipient audience", "Subject", "Communication route"], note: "Technical, billing, scheduling, urgent and vendor communication remain separately routed." },
      { title: "Follow-up work", fields: ["Question", "Clarification", "Task", "Change request draft"], note: "A message can request a change; it cannot make an approved change." },
    ], dependency: "Scoped conversation reads, recipient capabilities, delivery and follow-up mutation contracts are not connected.", boundary: "No outbound messages are sent. Scope, caps and signed terms cannot change through chat.",
  },
  vendors: {
    noun: "vendor assignments", tabs: ["Assigned work", "Closeout evidence", "Company credentials"], columns: ["Assignment", "Permitted instructions", "Due date", "Closeout review"], action: "Assign vendor work",
    sections: [
      { title: "Assigned work only", fields: ["Work order", "Permitted instructions", "Accountable contact", "Due date"], note: "Vendors need an explicit assigned-work projection, not general project access." },
      { title: "Qualification and closeout", fields: ["Company profile", "Credential evidence", "Completion evidence", "Closeout review"], note: "Assignments and credentials require current server-verified authority." },
    ], dependency: "Assigned-work-only audience support, vendor credentials and closeout capabilities are not connected.", boundary: "No client-internal or cross-vendor records are requested.",
  },
  finance: {
    noun: "financial records", tabs: ["Commitments & costs", "Invoices", "Reserves & exports"], columns: ["Financial record", "Authorization", "Record basis", "Review"], action: "Record financial entry",
    sections: [
      { title: "Distinct financial positions", fields: ["Authorized cap", "Committed costs", "Incurred costs", "Invoiced amounts"], note: "Estimate, committed, incurred and invoiced amounts are not interchangeable." },
      { title: "Review and export", fields: ["Source transaction", "Payer", "Reserve record", "Export status"], note: "Financial access is independent of technical review and document release." },
    ], dependency: "Finance-specific capabilities, source-backed ledger reads and controlled mutation/export endpoints are not connected.", boundary: "No balances, rates, commitments or financial records are fabricated.",
  },
  reports: {
    noun: "reports", tabs: ["Service reporting", "QBR packages", "Definitions & sources"], columns: ["Report", "Period", "Source definition", "Approved audience"], action: "Prepare QBR package",
    sections: [
      { title: "Reporting basis", fields: ["Reporting period", "Metric definition", "Denominator", "Source records"], note: "Missing values stay unknown; they are never presented as zero or successful." },
      { title: "QBR review", fields: ["Package revision", "Recorded actions", "Qualified review", "Approved audience"], note: "Executive reports require controlled revisions and an audience-approved release." },
    ], dependency: "Permission-filtered reporting projections, agreed metric definitions and QBR review/release endpoints are not connected.", boundary: "No operational metrics are shown without their source records.",
  },
  ai: {
    noun: "assistance requests", tabs: ["Source-grounded assistance", "Human review", "Adoption history"], columns: ["Assistance request", "Permitted sources", "Human review", "Adoption"], action: "Request assistance",
    sections: [
      { title: "Permitted sources", fields: ["Linked record", "Exact source revisions", "Audience permission", "Requested question"], note: "Quarantined documents and unauthorized records cannot be sent to an assistant." },
      { title: "Human adoption", fields: ["Source citations", "Suggested draft", "Human review", "Recorded adoption"], note: "Assistance remains a recommendation until an authorized human adopts it." },
    ], dependency: "Authorized source retrieval, safe AI execution, citations and reviewed adoption contracts are not connected.", boundary: "AI cannot approve scientific conclusions, scope, caps, signed terms or document release.",
  },
  audit: {
    noun: "audit events", tabs: ["Event trail", "Correlation", "Governed access"], columns: ["Server time", "Actor", "Operation", "Correlation"], action: "Export permitted events",
    sections: [
      { title: "Recorded provenance", fields: ["Server timestamp", "Actor", "Operation source", "Correlation UUID"], note: "Existing backend audit recording is separate from a connected audit-reader screen." },
      { title: "Governed inspection", fields: ["Object identifiers", "Safe status metadata", "Permitted audience", "Export authority"], note: "Audit events are immutable; this screen does not create, edit or delete them." },
    ], dependency: "A permission-filtered audit reader, scoped correlation queries and export capability are not connected to this interface.", boundary: "Raw audit data is not exposed through a general workspace membership.",
  },
  integrations: {
    noun: "integration connections", tabs: ["Connections", "Provenance", "Synchronization"], columns: ["Integration", "Source ownership", "Last synchronization", "Connection state"], action: "Configure integration",
    sections: [
      { title: "Moldo", fields: ["Independent source ownership", "Authorized enterprise projection", "External identifiers", "Contract version"], note: "Moldo operates independently. Its OS integration is not connected." },
      { title: "Synchronization", fields: ["Source system", "Last confirmed synchronization", "Failure handling", "Export / separation boundary"], note: "No synchronization time or successful connection is invented." },
    ], dependency: "A reviewed Moldo adapter, management/enterprise projection capabilities and versioned synchronization contracts are not connected.", boundary: "Moldo-only users have no OS access. Companion redesign remains deferred.",
  },
};