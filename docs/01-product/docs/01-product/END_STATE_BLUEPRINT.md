# AuxiliumOS End-State Blueprint

## Purpose

This file defines the final long-term vision for AuxiliumOS.

It exists so future ChatGPT, Cursor, Lovable, Claude Code, Codex, GitHub Copilot, and other AI tools understand what the full product is ultimately becoming, even when working on one small issue.

This file is not the current build scope.

It is the permanent north star.

---

# Final Product Vision

AuxiliumOS is a modular operating suite for Auxilium Environmental.

It is designed to support both simple clients and complex enterprise/MSA clients through one shared data spine, controlled permissions, document release logic, project/scoping workflows, authorization controls, reporting, and auditability.

AuxiliumOS must eventually support:

- Simple project/document clients
- Public adjuster clients
- Attorneys/law firms
- Restoration contractors
- Property managers
- Real estate portfolios
- Healthcare/facility operators
- Industrial/manufacturing clients
- Enterprise/MSA clients such as Nutex-style healthcare platforms

The product should feel simple to the user but remain structurally rigorous underneath.

---

# Core Architecture

AuxiliumOS is not one giant app.

AuxiliumOS is not disconnected mini-apps.

AuxiliumOS is a modular suite with one shared data spine.

Canonical data spine:

Client Account
→ Program/MSA
→ Portfolio
→ Asset/Facility
→ Zone/Area
→ Incident
→ Project Request
→ Scope Record
→ Authorization
→ Project
→ Tasks/Work Orders
→ Deliverables
→ Documents
→ Communications
→ Financial Records
→ Reports/Dashboards
→ Audit Events.

Every feature must attach to this spine or be treated as global configuration, reference data, integration data, or out-of-scope.

---

# Final Module Set

The final AuxiliumOS platform should include:

1. Core
2. Accounts
3. Programs/MSA
4. Portfolios
5. Assets/Facilities
6. Readiness/Site Passport
7. Intake
8. Scope
9. Sampling
10. ROM
11. Agreements/Authorization
12. Operations/Projects
13. Documents
14. Communications
15. Vendors
16. Finance
17. Reporting/QBR
18. AI
19. Audit
20. Integrations

Each module must remain separate in responsibility but connected through the shared data spine.

---

# Final Client Surfaces

## Simple Project Portal

For PA firms, attorneys, restoration contractors, individual owners, and simple project clients.

Primary functions:

- Submit request
- View project status
- View released documents
- Ask project-linked questions
- View agreements/invoices if permitted

## Enterprise Facility Portal

For portfolio, healthcare, property management, industrial, or MSA clients.

Primary functions:

- View facilities/assets
- View site passports
- Submit incidents/requests
- View open risks
- View readiness status
- View released documents
- View executive dashboards where permitted
- View QBRs where permitted

## Internal Admin Command Center

For Auxilium internal users.

Primary functions:

- Intake queue
- Project queue
- Scope review queue
- Document release queue
- Missing information queue
- Authorization queue
- Vendor queue
- Risk/exception queue
- QBR prep queue

## Vendor Portal

For limited external vendor participation.

Primary functions:

- View assigned work only
- Upload vendor documents
- Upload closeout packages
- Maintain credentials if permitted

Vendors must not see unrelated client records, financials, executive dashboards, internal notes, or unrelated documents.

---

# Final Enterprise / MSA Capability

For a Nutex-style enterprise healthcare client or similar national/portfolio account, AuxiliumOS should eventually support:

- Parent account
- Program/MSA structure
- Portfolio dashboard
- Facility list
- Facility status
- Site activation status
- Site passports
- Site champions
- Emergency contacts
- Response maps
- Critical asset registry
- Site cache/readiness items
- Incident priority routing
- P0/P1/P2/P3/P4 workflows
- Vendor matrix
- Vendor documentation
- Open risks
- Compliance-support calendar
- Readiness reserve ledger
- Program reporting
- QBR packets
- Executive action lists
- Financial/reserve dashboards
- Audit history

Enterprise capability must not make the simple client portal complicated.

Module visibility must depend on client/account/program configuration.

---

# Final Intake / Scoping Capability

AuxiliumOS must eventually support structured project intake that captures:

- Account
- Property/facility
- Affected areas
- Issue type
- Service intent
- Event timeline
- Prior work
- Photos/documents
- Safety/access flags
- Sampling/testing preference
- Deliverable preference
- Urgency
- Payer
- Signer/approver
- Change approver
- Smart prompts
- Missing information
- Auxilium review
- Scope recommendations
- Accepted recommendations
- Declined recommendations
- Scope limitations
- ROM assumptions
- Authorization/cap workflow

A submitted request is not accepted work.

A submitted request does not equal approved scope.

A submitted request does not equal authorization to mobilize.

---

# Final Scope-Control Principle

Approved scope must outrank:

- Client messages
- Uploaded files
- Third-party documents
- Informal notes
- AI summaries
- Original unclear request wording

A message/chat may create:

- Task
- Question
- Clarification
- Change request draft
- Review request

A message/chat may not directly change:

- Approved scope
- Authorization cap
- Sampling authorization
- Signed agreement
- Released document
- Deliverable requirement

---

# Final Document-Control Principle

No document is client-visible by default.

Client-visible documents require:

- Document class
- Version
- Linked object
- Release approval
- Permission check
- Audit event

Draft reports, internal notes, unreleased documents, restricted documents, and legal/dispute-sensitive documents must not be exposed casually.

Folder paths are not security.

Document metadata and backend policies must control access.

---

# Final Security Principle

UI hiding is not security.

Backend/database authorization must enforce access.

Future Supabase/Postgres implementation must use RLS or equivalent backend controls for client-data tables.

No client-data table may be used for production without:

- Role model
- Permission model
- RLS policy
- Access-denial tests
- Document release tests
- Audit events where applicable

---

# Final No-PHI Principle

AuxiliumOS v1 is facility/environmental/project/operational data only.

No PHI should be uploaded, processed, summarized by AI, stored, tested, or used unless a separate legal/security/contractual workflow approves a future PHI-capable design.

Prohibited unless separately approved:

- Patient names
- Medical records
- Patient photos
- Treatment details
- Diagnoses
- Patient identifiers
- Insurance/member numbers
- Medical billing records
- Patient-specific medical narratives

---

# Final AI Principle

AI tools may:

- Propose
- Draft
- Summarize
- Review
- Build
- Refactor
- Test
- Flag risks
- Prepare pull requests when authorized

AI tools may not silently decide:

- Core architecture
- Legal/professional boundaries
- Scope approval
- Sampling strategy approval
- Document release authority
- Agreement/signature authority
- Financial/cap approval
- RLS/security exceptions
- Production deployment
- Client-facing promises
- Whether PHI is allowed

AI is a worker.

The repository is the source of truth.

---

# First Build Slice

The first real build slice remains:

Account
→ User Role
→ Facility
→ Incident Request
→ Admin Queue
→ Document Upload
→ Document Release
→ Client View
→ Audit Event.

This slice proves the core operating model before building the full enterprise suite.

---

# Long-Term Build Sequence

The long-term sequence is:

1. Repo/control layer
2. Spec gate
3. Visual Lovable UI shell
4. First build implementation plan
5. Supabase schema planning
6. Supabase local/dev implementation
7. RLS policies and access-denial tests
8. Document storage/release workflow
9. Auth/user flow
10. First vertical slice
11. Browser/UAT tests
12. Controlled staging
13. Controlled pilot
14. Additional modules
15. Enterprise/MSA expansion
16. Production readiness
17. Real client data gate

Do not skip gates.

---

# Final Rule

Every future chat, AI tool, contractor, or developer must understand:

AuxiliumOS is not a simple portal.

AuxiliumOS is a controlled operating system for client intake, scoping, authorizations, asset/facility intelligence, document control, project execution, reporting, and auditability.

The UI may be simple.

The logic must remain rigorous.