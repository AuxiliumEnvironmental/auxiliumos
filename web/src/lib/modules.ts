// The complete destination remains visible without implying module completion.
export const modules = [
  { id: "M01", path: "core", name: "Core", description: "Shared workspace services, configuration, and permission-filtered search." },
  { id: "M02", path: "accounts", name: "Accounts", description: "Account relationships, contacts, client types, and governed access." },
  { id: "M03", path: "programs", name: "Programs / MSA", description: "Program coverage, facility activation, and effective service periods." },
  { id: "M04", path: "portfolios", name: "Portfolios", description: "Optional account structures and portfolio relationships." },
  { id: "M05", path: "assets", name: "Assets / Facilities", description: "Facility records, critical assets, and scoped site relationships." },
  { id: "M06", path: "readiness", name: "Readiness / Site Passport", description: "Site information, readiness gaps, champions, and recurring work." },
  { id: "M07", path: "intake", name: "Intake", description: "Structured incident and project requests with recorded triage." },
  { id: "M08", path: "scope", name: "Scope", description: "Versioned scopes, qualified review, and approved work boundaries." },
  { id: "M09", path: "sampling", name: "Sampling", description: "Sampling plans, chain of custody, and reviewed laboratory evidence." },
  { id: "M10", path: "estimates", name: "ROM", description: "Traceable planning estimates and versioned commercial assumptions." },
  { id: "M11", path: "approvals", name: "Agreements / Authorization", description: "Exact-revision agreements, signatures, and change authority." },
  { id: "M12", path: "projects", name: "Operations / Projects", description: "Assignments, scheduling, field records, and closeout." },
  { id: "M13", path: "documents", name: "Documents", description: "Immutable file versions, human review, and audience-approved release." },
  { id: "M14", path: "messages", name: "Communications", description: "Scoped questions, tasks, and communication linked to the work." },
  { id: "M15", path: "vendors", name: "Vendors", description: "Qualified vendors, assigned work, and closeout evidence." },
  { id: "M16", path: "finance", name: "Finance", description: "Commitments, costs, invoices, and reserve records." },
  { id: "M17", path: "reports", name: "Reporting / QBR", description: "Permission-filtered reporting and evidence-supported reviews." },
  { id: "M18", path: "ai", name: "AI", description: "Source-grounded assistance with human review and adoption." },
  { id: "M19", path: "audit", name: "Audit", description: "Server-recorded provenance and governed audit access." },
  { id: "M20", path: "integrations", name: "Integrations", description: "Controlled external adapters, including an independent Moldo integration." },
] as const;

export function moduleForPath(path: string) {
  return modules.find((module) => module.path === path);
}
