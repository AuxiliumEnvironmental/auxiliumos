> Legacy question history. Current proposed choices and scoped activation gates are in OWNER_DECISIONS.json. Do not ask the owner to repeat already-settled answers or stop unrelated implementation.

# Open Questions

This file tracks unresolved AuxiliumOS decisions. If a question requires founder, legal, security, technical, or business authority, it belongs here until answered.

Last updated: 2026-06-22

## How to use this file

Every unresolved question should have:

- Question ID
- Area
- Question
- Why it matters
- Current recommendation, if any
- Decision owner
- Status
- Repo file to update after decision

Status options:

- Open
- Founder decision needed
- Legal review needed
- Security review needed
- Technical review needed
- Decided
- Deferred to later phase

---

## Q001 — Which client types are included in v1?

Area:
Product scope

Question:
Should v1 support only simple PA/project-document clients, only enterprise/Nutex-style clients, or both with different module visibility?

Why it matters:
This controls the first portal screens, dashboard complexity, request types, user roles, and onboarding workflow.

Current recommendation:
Support both in structure, but build the first vertical slice around shared foundations: Account → User Role → Facility → Incident Request → Admin Queue → Document Upload → Document Release → Client View → Audit Event.

Decision owner:
Founder

Status:
Open

Repo file to update after decision:
docs/01-product/V1_SCOPE.md

---

## Q002 — What exact Auxilium internal roles exist in v1?

Area:
Roles and permissions

Question:
Which internal roles are needed for v1?

Candidate roles:
- System Admin
- Account Manager
- Intake Admin
- Project Manager
- Technical Reviewer
- Document Controller
- Finance/Admin
- Vendor Coordinator
- Executive Viewer

Why it matters:
Role definitions control access, workflow routing, document release, scope approval, and future RLS policies.

Current recommendation:
Use the candidate list as draft roles, then refine before RLS implementation.

Decision owner:
Founder

Status:
Founder decision needed

Repo file to update after decision:
docs/04-security/ROLE_PERMISSION_MATRIX.md

---

## Q003 — What exact client-side roles exist in v1?

Area:
Roles and permissions

Question:
Which client-side roles are needed for v1?

Candidate roles:
- Client Executive
- Portfolio Manager
- Regional Manager
- Site Champion
- Project Requester
- Project Approver
- Agreement Signer
- Billing Contact
- Document Viewer
- Vendor User

Why it matters:
Client roles control who can submit requests, view documents, approve scopes, approve caps, sign agreements, view invoices, and access facility/project information.

Current recommendation:
Use these candidate roles as draft roles. Do not implement RLS until the role matrix is reviewed.

Decision owner:
Founder

Status:
Founder decision needed

Repo file to update after decision:
docs/04-security/ROLE_PERMISSION_MATRIX.md

---

## Q004 — Who can release final documents to clients?

Area:
Document control

Question:
Which Auxilium role can make a document client-visible?

Options:
A. Project Manager only
B. Document Controller only
C. PM marks ready, Document Controller releases
D. Technical Reviewer approves, Document Controller releases

Why it matters:
Document release is a core risk-control function. Draft reports, internal notes, and unreleased documents must not become client-visible accidentally.

Current recommendation:
Use D for final reports and sensitive documents: Technical Reviewer approves, Document Controller releases. Use C for routine non-technical document packages if appropriate.

Decision owner:
Founder + technical/legal review

Status:
Founder decision needed

Repo file to update after decision:
docs/04-security/DOCUMENT_ACCESS_MATRIX.md
docs/05-workflows/DOCUMENT_RELEASE_WORKFLOW.md

---

## Q005 — Who can approve project scope?

Area:
Scope control

Question:
Which Auxilium role can approve a final scope record before it goes to the client or signer?

Why it matters:
Scope approval controls what Auxilium is actually agreeing to do. It affects limitations, pricing assumptions, deliverables, sampling authorization, and professional risk.

Current recommendation:
Project Manager can prepare scope. Technical Reviewer or approved senior reviewer must approve higher-risk scopes.

Decision owner:
Founder

Status:
Open

Repo file to update after decision:
docs/05-workflows/SCOPE_STATE_MACHINE.md
docs/04-security/ROLE_PERMISSION_MATRIX.md

---

## Q006 — Who can approve cap increases or change authorizations?

Area:
Finance / authorization

Question:
Which client roles and Auxilium roles can approve changes to authorization caps, added services, additional sampling, added site visits, or expanded deliverables?

Why it matters:
This prevents unapproved work, scope creep, and billing disputes.

Current recommendation:
Client Project Approver or Agreement Signer approves client-side changes. Auxilium PM prepares change request; Account Manager or authorized internal approver approves before sending.

Decision owner:
Founder

Status:
Open

Repo file to update after decision:
docs/05-workflows/CHANGE_AUTHORIZATION_WORKFLOW.md
docs/04-security/ROLE_PERMISSION_MATRIX.md

---

## Q007 — What document classes exist in v1?

Area:
Document control

Question:
Which document classes should exist in v1?

Candidate document classes:
- Internal Note
- Client Upload
- Field Photo
- Draft Report
- Final Report
- Lab Report
- Agreement
- Signed Authorization
- Invoice
- Site Passport
- Critical Asset Registry
- Vendor Document
- QBR Packet
- Executive Document
- Legal/Dispute Sensitive
- Archive/Superseded

Why it matters:
Document classes determine release workflow, visibility, download permissions, audit events, and retention handling.

Current recommendation:
Use these as the starting list, with TBD permissions until the document access matrix is reviewed.

Decision owner:
Founder + document control/legal review

Status:
Founder decision needed

Repo file to update after decision:
docs/04-security/DOCUMENT_ACCESS_MATRIX.md

---

## Q008 — What is the v1 no-PHI policy?

Current status: RESOLVED by Decision 014 and D-SCHEMA-009. No PHI v1. Only incident-handling contacts/procedure remain OD-013 owner review; the historical discussion below is not a live policy question.

Area:
Security / healthcare

Question:
Should AuxiliumOS v1 prohibit PHI entirely and operate only on facility/environmental/project data?

Why it matters:
A healthcare-style client such as Nutex may create risk of patient data entering the platform. v1 should avoid PHI unless legal/security requirements are intentionally addressed.

Current recommendation:
V1 should prohibit PHI. No patient names, medical records, patient photos, treatment details, diagnoses, or patient identifiers.

Decision owner:
Founder + legal/security review

Status:
Founder decision needed

Repo file to update after decision:
docs/04-security/SECURITY_GUARDRAILS.md
docs/01-product/OUT_OF_SCOPE.md

---

## Q009 — What work is included under an enterprise MSA versus billable separately?

Area:
Program / MSA

Question:
For an enterprise client, how does AuxiliumOS classify requests?

Candidate categories:
- Included under program fee
- Billable under rate card
- Requires service authorization
- Requires change authorization
- Vendor-managed
- Licensed/specialty vendor only
- Engineering required
- Legal/claim/coverage issue
- Out of scope
- Emergency exception

Why it matters:
This protects Auxilium from becoming an unlimited-service provider and keeps enterprise client expectations controlled.

Current recommendation:
Use the candidate categories as the initial Scope Boundary Matrix.

Decision owner:
Founder + legal/contract review

Status:
Open

Repo file to update after decision:
docs/01-product/MODULE_MAP.md
docs/05-workflows/AGREEMENT_AUTHORIZATION_WORKFLOW.md

---

## Q010 — What is the first true app build slice?

Area:
Product build sequence

Question:
Should the first build slice remain Account → User Role → Facility → Incident Request → Admin Queue → Document Upload → Document Release → Client View → Audit Event?

Decision:
Yes. The first build slice is confirmed as Account → User Role → Facility → Incident Request → Admin Queue → Document Upload → Document Release → Client View → Audit Event.

Important limitation:
This decision confirms the build-slice direction only. It does not authorize Supabase schema, storage buckets, auth providers, RLS policies, production, real client data, PHI, or unrestricted backend/app build.

Why it matters:
This slice proves account ownership, roles, facility/project context, document release, client visibility, and audit events before building the full monster.

Current recommendation:
Proceed next with visual-only Lovable UI shell preparation. Full implementation requires later GitHub issues and approvals.

Decision owner:
Founder

Status:
Decided

Repo file to update after decision:
docs/01-product/V1_SCOPE.md
docs/07-testing/UAT_SCENARIOS.md
docs/00-control/SPEC_GATE_REVIEW.md


---

## Q011 — When should Lovable be allowed to create or modify schema?

Area:
AI/tool governance

Question:
Should Lovable be restricted to visual UI until Supabase schema and RLS rules are defined?

Why it matters:
Lovable can build quickly, but allowing it to invent schema/permissions can break the future-proof architecture.

Current recommendation:
Restrict Lovable to visual UI shell first. Schema changes require a GitHub issue, approved spec, and review.

Decision owner:
Founder

Status:
Open

Repo file to update after decision:
docs/08-ai/LOVABLE_KNOWLEDGE.md
docs/08-ai/AI_TOOL_RULES.md

---

## Q012 — When should Claude Code and Codex be allowed to edit files?

Area:
AI/tool governance

Question:
At what point can Claude Code or Codex edit files rather than summarize only?

Why it matters:
AI agents should not edit without ticket, branch, allowed-file list, closeout, and review.

Current recommendation:
Allow edits only after:
- GitHub issue exists
- Branch exists
- Allowed files are defined
- Agent summarizes plan before editing
- Human reviews diff before merge
- Session closeout is provided

Decision owner:
Founder

Status:
Open

Repo file to update after decision:
docs/08-ai/AI_TOOL_RULES.md
docs/08-ai/PROMPT_LIBRARY.md

---

## Q013 — What are the first client-facing portals?

Area:
UI / product scope

Question:
What are the first client-facing portal surfaces?

Candidate portals:
- Simple Project Portal for PA/project clients
- Enterprise Facility Portal for portfolio/MSA clients
- Admin Command Center for Auxilium internal users

Why it matters:
The UI should remain simple for smaller clients but powerful for enterprise clients.

Current recommendation:
Design all three conceptually, but build only the foundation shared slice first.

Decision owner:
Founder

Status:
Open

Repo file to update after decision:
docs/06-ui/CLIENT_PORTAL_MAP.md
docs/06-ui/ADMIN_CONSOLE_MAP.md
docs/06-ui/EXECUTIVE_PORTAL_MAP.md

---

## Q014 — What professional boundaries must be written into v1?

Area:
Professional/legal boundaries

Question:
Which professional boundaries must v1 recognize before client-facing workflows are built?

Candidate boundaries:
- Engineering
- Mold assessment/remediation conflict
- Public adjusting/claim negotiation
- HAZWOPER/high-hazard chemical response
- Fire/life-safety certification
- HVAC/TAB/medical ventilation
- Generator testing/certification
- Asbestos/lead abatement
- Medical/health opinions

Why it matters:
AuxiliumOS must prevent the platform from suggesting that Auxilium performs roles that require separate licensing, specialist vendors, or legal authority.

Current recommendation:
Capture boundaries in OUT_OF_SCOPE.md and future scope limitation templates before client-facing service promises are generated.

Decision owner:
Founder + legal/professional review

Status:
Legal review needed

Repo file to update after decision:
docs/01-product/OUT_OF_SCOPE.md
docs/02-ontology/SCOPE_LIMITATIONS.md

---

## Q015 — What counts as “done” for prep?

Area:
Prep completion

Question:
What must be true before moving from prep to app build?

Current recommendation:
Prep is complete when:
- PROJECT_STATE.md is filled
- DECISION_LOG.md is filled
- OPEN_QUESTIONS.md is filled
- DATA_SPINE.md is filled
- MODULE_MAP.md is filled
- Role matrix draft exists
- Document matrix draft exists
- First vertical slice spec exists
- Cursor can read repo rules
- Lovable Project Knowledge exists
- Supabase dev project exists
- No real client data has been used
- No secrets have been committed

Decision owner:
Founder

Status:
Open

Repo file to update after decision:
docs/00-control/PROJECT_STATE.md
docs/00-control/NEXT_ACTIONS.md

## First Build Blocker Checkpoint — Added 2026-07-05

Source issue: #56 — Founder decision checkpoint for first build blockers

The following decisions remain founder-review-required / not implementation-approved unless a later repo update marks them approved:

- Final role authority
- Final client-side roles and internal roles
- Document release authority
- Document grant model
- Scope approval authority
- Cap/change authorization authority
- Emergency conditional authorization authority
- Emergency authorization thresholds
- No-PHI exceptions
- Professional/legal boundaries
- Client Executive visibility boundaries
- Site Champion visibility boundaries
- Billing Contact access boundaries
- Vendor User inclusion in v1
- Account membership model
- Billing visibility model
- Audit event visibility
- Auth provider strategy
- RLS helper design
- Supabase schema design
- Storage bucket design
- Production readiness
- Real client data onboarding
- Whether any PHI-capable workflow will ever be supported

Safe default until approved:

- No real client data.
- No PHI.
- No secrets.
- No production setup.
- No Supabase schema.
- No auth setup.
- No storage buckets.
- No RLS policies.
- No client-visible document without release workflow.
- No chat/message changes approved scope.
- No client-data table without RLS plan and tests.
- No final business authority decisions by AI.

Detailed checkpoint file:

`docs/00-control/FOUNDER_DECISION_CHECKPOINT_FIRST_BUILD.md`

## Minimum Schema Blockers — Added 2026-07-08

Source issue: #68 — Schema implementation readiness gate for foundation slice

The following questions block initial schema migrations unless resolved, deferred, or explicitly scoped around:

1. What is the minimum approved account membership model for development schema?
2. Which minimum roles may exist for schema/testing only?
3. Should document access follow account access, facility/request access, explicit grants, or a hybrid model?
4. Who may release a document in future workflows?
5. Are audit events internal-only for now?
6. How should future user records link to auth identities?
7. Is storage fully deferred until a storage design packet?
8. Is RLS helper design deferred until the RLS issue?
9. Confirm that no PHI fields are allowed.
10. Confirm that only fake/demo seed data may be used.

Current safe status:

Blocked for migrations.


## Post-Minimum Schema Decision Open Questions — Added 2026-07-10

Source issue: #72 — Minimum schema blocker decisions for foundation slice

The following remain open beyond dev-schema planning:

- Final production account membership model
- Final role authority
- Full document grant model
- Final document release authority
- Client-visible audit event policy
- Final auth provider strategy
- Storage bucket design
- RLS helper design
- Production readiness
- Real client data onboarding
- PHI-capable workflow policy

Current status:

- #74 — Foundation migration control packet — complete.
- #76 — Bulk control doc update after schema blocker sprint — complete.
- Founder selected the controlled dev-only migration path.

Current safe next step:

Create the issue `Initial dev-only foundation schema migrations` with exact migration, seed, documentation, and test files.

Still blocked outside that future issue:

- Migration application
- Cloud Supabase connection
- Auth setup
- Storage buckets
- RLS policies
- Production setup
- Real client data
- PHI
- Secrets
