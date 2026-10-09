> Historical phase document, retained for traceability. The 2026-10-08 owner mandate in AGENTS.md and EXECUTION_PROTOCOL.md supersedes preparation-only stop rules and first-slice scope ceilings. Permanent domain/security rules remain. Full delivery is REQUIREMENTS.json; pending owner policies permit synthetic development defaults with scoped live activation gates.

# Founder Decision Checkpoint — First Build Blockers

Last updated: 2026-07-05

Issue: #56 — Founder decision checkpoint for first build blockers

## Status

Documentation / decision checkpoint only.

This file does not authorize app code, Supabase schema, Supabase tables, Supabase storage buckets, auth providers, RLS policies, edge functions, Playwright installation, Claude Code implementation edits, Codex implementation edits, production deployment, real client data, PHI, secrets, or business authority decisions.

No founder-decision item is final unless it is explicitly marked Approved in the repository by the founder or appropriate decision owner.

## Purpose

This checkpoint identifies decisions that must be answered, preserved as open, or reviewed before future AuxiliumOS implementation work can safely proceed.

The purpose is to prevent AI tools, app builders, coding agents, or future contributors from silently treating unresolved authority questions as implementation-approved.

## Source-of-Truth Rule

GitHub is the source of truth.

AI tools are workers.

Chat memory, Lovable project state, Cursor memory, Claude Code memory, Codex memory, or any other AI/tool memory is not the source of truth.

## Canonical Data Spine

Client Account -> Program/MSA -> Portfolio -> Asset/Facility -> Zone/Area -> Incident -> Project Request -> Scope Record -> Authorization -> Project -> Tasks/Work Orders -> Deliverables -> Documents -> Communications -> Financial Records -> Reports/Dashboards -> Audit Events.

All future implementation must preserve this spine unless a formal repo-recorded architecture decision approves a change.

## Decision Status Labels

Use these labels for founder-decision items:

- Open: unanswered.
- Draft: preliminary direction only.
- Review Required: needs founder, legal, security, accounting, or professional review.
- Approved: final enough for controlled implementation.
- Not Implementation-Approved: must not control app behavior yet.
- Deferred: not needed for the current build slice.

## Current Safe Default

Unless explicitly approved in the repo:

- Treat role authority as draft.
- Treat document release authority as draft.
- Treat scope approval authority as draft.
- Treat cap/change authorization authority as draft.
- Treat professional/legal boundaries as review-required.
- Treat auth, storage, schema, and RLS design as not implementation-approved.
- Treat real client data as not allowed.
- Treat PHI as not allowed.
- Treat production setup as not allowed.
- Treat all client-data access as deny-by-default until RLS design and tests exist.
- Treat all draft/internal documents as not client-visible.
- Treat chat/messages as unable to change approved scope.

## First Build Slice Context

The first controlled build target remains:

Account -> User Role -> Facility -> Incident Request -> Admin Queue -> Document Upload -> Document Release -> Client View -> Audit Event.

This checkpoint does not implement that slice. It identifies decisions that affect future implementation of that slice.

## Decision Blocker Table

| ID | Decision required | Current status | Why it matters | Safe default until approved | Future work affected | Repo file for final decision |
|---|---|---|---|---|---|---|
| FD-01 | Final role authority | Review Required / Not Implementation-Approved | Determines who can view, submit, approve, release, invite, administer, and audit. | Use placeholder roles only; do not enforce final authority. | Auth, RLS, app workflows, document release, admin queue | `docs/04-security/ROLE_PERMISSION_MATRIX.md` and `docs/00-control/DECISION_LOG.md` |
| FD-02 | Final client-side roles and internal roles | Review Required / Not Implementation-Approved | Prevents role drift and permission gaps. | Keep roles draft; do not add new roles casually. | Auth, UI, RLS, tests | `docs/04-security/ROLE_PERMISSION_MATRIX.md` |
| FD-03 | Document release authority | Review Required / Not Implementation-Approved | Controls who may make a document client-visible. | Draft/internal documents remain hidden; no release logic implemented. | Document workflow, storage, RLS, client view | `docs/05-workflows/DOCUMENT_RELEASE_WORKFLOW.md` and `docs/04-security/DOCUMENT_ACCESS_MATRIX.md` |
| FD-04 | Document grant model | Review Required / Not Implementation-Approved | Determines whether document access follows project access, account access, explicit grants, or a hybrid. | Do not expose document records to clients. | Storage, RLS, document release tests | `docs/04-security/DOCUMENT_ACCESS_MATRIX.md` and future schema design packet |
| FD-05 | Scope approval authority | Review Required / Not Implementation-Approved | Determines who can approve work, limitations, changes, and acceptance. | No real scope approval logic. | Request flow, scope records, agreements, change authorization | `docs/05-workflows/REQUEST_STATE_MACHINE.md` and `docs/05-workflows/CHANGE_AUTHORIZATION_WORKFLOW.md` |
| FD-06 | Cap/change authorization authority | Review Required / Not Implementation-Approved | Determines who can approve cost changes, caps, sampling, and billable changes. | No cap/change logic. | Agreements, finance, scope changes | `docs/05-workflows/CHANGE_AUTHORIZATION_WORKFLOW.md` |
| FD-07 | Emergency conditional authorization authority | Review Required / Not Implementation-Approved | Determines who can bypass normal authorization in emergency workflows. | Emergency exceptions remain documentation-only. | Emergency workflow, admin queue, audit | `docs/05-workflows/EMERGENCY_EXCEPTION_WORKFLOW.md` |
| FD-08 | Emergency authorization thresholds | Review Required / Not Implementation-Approved | Determines dollar/time/risk limits for emergency work. | No emergency cap logic. | Emergency workflow, finance, approvals | `docs/05-workflows/EMERGENCY_EXCEPTION_WORKFLOW.md` |
| FD-09 | No-PHI exceptions | Review Required / Not Implementation-Approved | Determines whether any PHI-capable workflow can exist. | No PHI. No patient data. No PHI-capable workflow. | Healthcare workflows, storage, auth, production | `docs/04-security/SECURITY_GUARDRAILS.md` and `docs/01-product/OUT_OF_SCOPE.md` |
| FD-10 | Professional/legal boundaries | Review Required / Not Implementation-Approved | Prevents the platform from implying unsupported licensed, legal, engineering, medical, claim, or specialist authority. | Use conservative placeholder language; do not make claims. | UI language, scope, reports, client-facing workflows | `docs/00-control/DECISION_LOG.md` and future professional-boundary docs |
| FD-11 | Client Executive visibility boundaries | Review Required / Not Implementation-Approved | Determines whether executives see all account data, portfolio data, finance, reports, or audit events. | Do not expose real client data. | RLS, dashboards, reports | `docs/04-security/ROLE_PERMISSION_MATRIX.md` |
| FD-12 | Site Champion visibility boundaries | Review Required / Not Implementation-Approved | Determines whether site users see only assigned facilities, incidents, projects, documents, and reports. | Assigned-facility concept only; no enforcement yet. | Auth, RLS, facility routes, document access | `docs/04-security/ROLE_PERMISSION_MATRIX.md` |
| FD-13 | Billing Contact access boundaries | Review Required / Not Implementation-Approved | Determines invoice, cap, authorization, and finance visibility. | Do not expose billing/finance records. | Finance, reports, RLS | `docs/04-security/ROLE_PERMISSION_MATRIX.md` |
| FD-14 | Vendor User inclusion in v1 | Review Required / Not Implementation-Approved | Determines whether external vendors exist in the first implementation slice. | Vendor users remain out of scope unless separately approved. | Auth, RLS, vendor portal, tasks | `docs/01-product/V1_SCOPE.md` and `docs/01-product/OUT_OF_SCOPE.md` |
| FD-15 | Account membership model | Review Required / Not Implementation-Approved | Determines how users attach to accounts, portfolios, facilities, projects, and documents. | Do not implement membership tables. | Schema, auth, RLS, tests | Future schema design packet and `docs/04-security/RLS_POLICY_MATRIX.md` |
| FD-16 | Billing visibility model | Review Required / Not Implementation-Approved | Determines who can see caps, invoices, terms, reserves, and financial records. | Billing records remain not implemented. | Finance, reports, RLS | `docs/04-security/ROLE_PERMISSION_MATRIX.md` |
| FD-17 | Audit event visibility | Review Required / Not Implementation-Approved | Determines whether clients can see any audit trail or only internal users can. | Audit visibility remains internal concept only. | Audit UI, reports, RLS | `docs/04-security/ROLE_PERMISSION_MATRIX.md` and future audit design packet |
| FD-18 | Auth provider strategy | Review Required / Not Implementation-Approved | Determines login, invitation, identity lifecycle, and MFA assumptions. | No auth configuration. | Auth, app shell, RLS tests | Future auth setup issue |
| FD-19 | RLS helper design | Review Required / Not Implementation-Approved | Determines database-level enforcement pattern. | No RLS policies. | Schema, RLS, tests | `docs/04-security/RLS_POLICY_MATRIX.md` and future RLS issue |
| FD-20 | Supabase schema design | Review Required / Not Implementation-Approved | Determines table design, data ownership, constraints, and migrations. | No schema migrations. | Schema, auth, RLS, app code | Future schema design packet |
| FD-21 | Storage bucket design | Review Required / Not Implementation-Approved | Determines document storage boundaries and object-level security. | No storage buckets. | Storage, document release, RLS | Future storage design/implementation issue |
| FD-22 | Production readiness | Review Required / Not Implementation-Approved | Determines whether the system can hold real users or real client data. | No production. | Deployment, real data, security, backup | Future production readiness packet |
| FD-23 | Real client data onboarding | Review Required / Not Implementation-Approved | Determines when actual client records or documents may be used. | Use fake/demo data only. | All implementation | Future security/production readiness packet |
| FD-24 | PHI-capable workflow policy | Review Required / Not Implementation-Approved | Determines whether healthcare-adjacent workflows can ever include PHI. | No PHI-capable workflows. | Healthcare enterprise workflows, storage, auth, compliance | `docs/04-security/SECURITY_GUARDRAILS.md` and `docs/01-product/OUT_OF_SCOPE.md` |

## Minimum Gates By Future Work Type

### Static app shell

Can proceed later only through a future app-code issue.

Founder decisions required before static app shell:

- None, as long as the shell is placeholder/static only and does not imply final permissions, document release authority, scope authority, or professional conclusions.

Still required:

- Exact issue
- Exact branch
- Exact allowed app files
- Tests or documented test deferral
- No backend
- No Supabase
- No auth
- No real data
- No PHI

### Supabase schema

Cannot proceed until future schema design and implementation issues explicitly authorize it.

Likely blockers before schema implementation:

- Account membership model
- Role authority
- Document grant model
- Audit visibility
- No-PHI posture
- Supabase schema design approval
- Security review

### Auth

Cannot proceed until a future auth issue explicitly authorizes it.

Likely blockers before auth implementation:

- Auth provider strategy
- User lifecycle
- Removed/suspended user behavior
- Account membership model
- Role authority

### RLS

Cannot proceed until a future RLS issue explicitly authorizes it.

Likely blockers before RLS implementation:

- Role authority
- Account membership model
- Facility assignment rules
- Document grant model
- Billing visibility
- Audit visibility
- Permission-denial tests

### Storage

Cannot proceed until a future storage issue explicitly authorizes it.

Likely blockers before storage implementation:

- Storage bucket design
- Document class model
- Release state model
- Document grant model
- Document release authority
- Storage/RLS test design

### Document release

Cannot proceed until a future document-control implementation issue explicitly authorizes it.

Likely blockers before document-release implementation:

- Document release authority
- Document access matrix approval
- Document grant model
- Draft/internal/default-hidden rule
- Release audit event rules
- Permission-denial tests

### Real client data

Cannot proceed until future security/production readiness issues explicitly authorize it.

Likely blockers:

- Security review
- Backup/export process
- RLS tests
- Document-release tests
- Access removal tests
- No-PHI confirmation
- Production readiness approval

### PHI-capable workflows

Not allowed.

Any PHI-capable workflow requires a separate founder/legal/security/compliance decision and is not part of the current first build path.

## Decision Recording Rule

Final approved decisions must be recorded in the relevant durable repo file, not only in chat or an issue comment.

Use:

- `docs/00-control/DECISION_LOG.md` for final approved cross-cutting decisions.
- `docs/00-control/OPEN_QUESTIONS.md` for unresolved items.
- `docs/04-security/ROLE_PERMISSION_MATRIX.md` for final role authority.
- `docs/04-security/DOCUMENT_ACCESS_MATRIX.md` for final document access rules.
- `docs/04-security/RLS_POLICY_MATRIX.md` for RLS design.
- `docs/04-security/SECURITY_GUARDRAILS.md` for security and no-PHI rules.
- `docs/05-workflows/DOCUMENT_RELEASE_WORKFLOW.md` for document release workflow.
- `docs/05-workflows/CHANGE_AUTHORIZATION_WORKFLOW.md` for change/cap authority.
- `docs/05-workflows/EMERGENCY_EXCEPTION_WORKFLOW.md` for emergency authority.
- Future schema/auth/storage packets for implementation-specific design.

## Checkpoint Conclusion

No implementation is authorized by this checkpoint.

The next safe task is:

Foundation vertical slice build-control packet

That next issue should remain documentation/control only and must not authorize app code, Supabase schema, auth, storage, RLS, Playwright, Claude Code implementation edits, Codex implementation edits, production, real client data, PHI, or secrets.
