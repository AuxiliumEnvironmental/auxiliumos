# Minimum Schema Blocker Decisions — Foundation Slice

Last updated: 2026-07-10

Issue: #72 — Minimum schema blocker decisions for foundation slice

## Status

Founder/security decision checkpoint for dev-schema planning only.

This document records narrow decisions and deferrals needed before a future dev-only foundation schema migration can be planned.

This document does not authorize Supabase migrations, schema creation, tables, auth providers, storage buckets, RLS policies, edge functions, production deployment, real client data, PHI, secrets, Claude Code implementation edits, Codex implementation edits, or final business authority decisions.

## Purpose

The schema implementation readiness gate identified blockers that prevent safe migration planning.

This file resolves, defers, or scopes around the minimum blockers required before a future migration control packet can be created.

This is not a full Founder Homework Workbook exercise.

This does not finalize all roles, all permissions, all document authority, legal boundaries, production readiness, or long-term architecture.

## Source-of-Truth Rule

GitHub is the source of truth.

AI tools are workers.

One issue controls one branch and one controlled change.

## Canonical Data Spine

Client Account -> Program/MSA -> Portfolio -> Asset/Facility -> Zone/Area -> Incident -> Project Request -> Scope Record -> Authorization -> Project -> Tasks/Work Orders -> Deliverables -> Documents -> Communications -> Financial Records -> Reports/Dashboards -> Audit Events.

## Foundation Slice Context

The first controlled build target remains:

Account -> User Role -> Facility -> Incident Request -> Admin Queue -> Document Upload -> Document Release -> Client View -> Audit Event.

This decision checkpoint supports future dev-only migration planning for that slice.

## Decision Scope Rule

Every decision below is limited to:

- Dev-only schema planning.
- Fake/demo data.
- Foundation slice only.
- Future migration control packet preparation.

No decision below authorizes:

- Production use.
- Real client data.
- PHI.
- Supabase migrations.
- Supabase tables.
- Auth setup.
- Storage buckets.
- RLS policies.
- Client-visible document release.
- Final role authority.
- Final legal/professional/business authority.

## Minimum Decisions

### D-SCHEMA-001 — Account membership model for dev schema

Decision:

For dev-schema planning only, use an account-scoped membership concept so a fake/dev user can be linked to a fake/dev Client Account.

The candidate concept remains:

`account_memberships`

Scope:

Dev-only foundation schema planning.

What this allows:

- Future migration control packet may plan an `account_memberships` candidate table.
- Future tests may use fake/demo membership records.
- Future RLS planning may use account membership as a candidate access boundary.

What this does not allow:

- No production account membership model.
- No real users.
- No real client accounts.
- No auth setup.
- No RLS policies.
- No final invitation or account-admin workflow.

Decision status:

Approved for dev-schema planning only / Not production-approved.

Future final decision location:

- `docs/04-security/ROLE_PERMISSION_MATRIX.md`
- `docs/04-security/RLS_POLICY_MATRIX.md`
- `docs/00-control/DECISION_LOG.md`

Risk:

If wrong, future RLS and account isolation may need rework.

---

### D-SCHEMA-002 — Minimum static roles for fake/dev testing

Decision:

For fake/dev schema and test planning only, use a minimal static role set based on existing role language:

- System Admin
- Intake Admin
- Document Controller
- Site Champion
- Project Requester
- Document Viewer
- Removed/Suspended User

Scope:

Dev-only foundation schema planning and fake/demo test coverage.

What this allows:

- Future migration control packet may reference these labels as seed/test roles.
- Future permission-denial tests may include a removed/suspended user.
- Future tests may distinguish internal, client, document-viewer, and denied-access scenarios.

What this does not allow:

- No final role authority.
- No final permission matrix approval.
- No production roles.
- No invite workflow.
- No final client/admin authority decisions.
- No legal/professional authority decisions.

Decision status:

Approved for dev-schema planning only / Founder review still required for final authority.

Future final decision location:

- `docs/04-security/ROLE_PERMISSION_MATRIX.md`
- `docs/00-control/DECISION_LOG.md`

Risk:

If roles drift from the final role matrix, test data and RLS planning may need updates.

---

### D-SCHEMA-003 — Document grant model for first slice

Decision:

For the first dev-only schema slice, document access must not rely on account membership alone.

Document metadata planning must preserve:

- Account link
- Optional facility link
- Optional incident/request link
- Document class
- Version
- Status/release state
- Default internal/hidden stance

Explicit per-document grant tables are deferred until a later document-access or RLS design issue.

Scope:

Dev-only document metadata planning.

What this allows:

- Future migration control packet may plan document metadata fields needed for later release/access checks.
- Future RLS planning may treat document visibility as stricter than general account access.

What this does not allow:

- No storage buckets.
- No real document upload.
- No client-visible documents.
- No document release logic.
- No final document grant architecture.
- No production document access model.

Decision status:

Approved for dev-schema planning only / Final document grant model deferred.

Future final decision location:

- `docs/04-security/DOCUMENT_ACCESS_MATRIX.md`
- `docs/04-security/RLS_POLICY_MATRIX.md`
- `docs/05-workflows/DOCUMENT_RELEASE_WORKFLOW.md`

Risk:

If document grants are too simple, future client-visible document access may be unsafe.

---

### D-SCHEMA-004 — Document release authority stance for schema purposes only

Decision:

For dev-schema planning only, document release must be represented as a controlled future state/action, not as immediate client visibility.

Schema planning may include fields or concepts that support a future release state, but release authority remains founder-review-required.

For fake/dev tests, any future release actor must be internal-only and must not imply final business authority.

Scope:

Dev-only schema planning.

What this allows:

- Future migration control packet may plan release-state metadata.
- Future test planning may include draft-hidden and released-visible cases.

What this does not allow:

- No real document release.
- No client-visible release workflow.
- No final document controller authority.
- No final professional review authority.
- No storage or file download behavior.

Decision status:

Approved for dev-schema planning only / Final release authority deferred.

Future final decision location:

- `docs/05-workflows/DOCUMENT_RELEASE_WORKFLOW.md`
- `docs/04-security/DOCUMENT_ACCESS_MATRIX.md`
- `docs/00-control/DECISION_LOG.md`

Risk:

If release authority is wrong, draft/internal documents may become visible too early.

---

### D-SCHEMA-005 — Audit event visibility for now

Decision:

For now, audit events are internal-only for schema planning.

Client-visible audit events are deferred.

Scope:

Dev-only schema planning.

What this allows:

- Future migration control packet may plan audit event records.
- Future tests may verify internal audit creation where implemented.

What this does not allow:

- No client-visible audit log.
- No production audit visibility.
- No final audit reporting rules.

Decision status:

Approved for dev-schema planning only / Client audit visibility deferred.

Future final decision location:

- `docs/04-security/ROLE_PERMISSION_MATRIX.md`
- `docs/04-security/RLS_POLICY_MATRIX.md`
- Future audit design packet

Risk:

If audit visibility is overexposed later, sensitive operational history may be visible to the wrong users.

---

### D-SCHEMA-006 — Auth identity linkage assumption for dev

Decision:

For dev-schema planning only, user profile records may include a future auth identity reference concept.

Auth provider setup is deferred.

The dev schema should not require a real Supabase auth provider before schema planning.

Scope:

Dev-only schema planning.

What this allows:

- Future migration control packet may plan a nullable or placeholder auth identity linkage concept.
- Future auth issue may later define the real linkage.

What this does not allow:

- No auth provider setup.
- No real users.
- No login flow.
- No passwords.
- No service-role keys.
- No production auth.

Decision status:

Approved for dev-schema planning only / Auth implementation deferred.

Future final decision location:

- Future auth setup issue
- `docs/04-security/ROLE_PERMISSION_MATRIX.md`
- `docs/04-security/RLS_POLICY_MATRIX.md`

Risk:

If the auth linkage assumption is wrong, user/profile migration design may need revision.

---

### D-SCHEMA-007 — Storage deferred

Decision:

Storage is deferred.

The foundation schema may plan document metadata only.

No storage buckets, file paths, object keys, signed URLs, or storage policies are authorized.

Scope:

Dev-only schema planning.

What this allows:

- Future schema planning may include document metadata without storage implementation.
- Future storage design packet may define bucket strategy later.

What this does not allow:

- No Supabase storage buckets.
- No real file upload.
- No document download.
- No storage RLS.
- No client-visible files.

Decision status:

Deferred / Storage not implementation-approved.

Future final decision location:

- Future storage design packet
- `docs/04-security/DOCUMENT_ACCESS_MATRIX.md`
- `docs/05-workflows/DOCUMENT_RELEASE_WORKFLOW.md`

Risk:

If storage is assumed too early, document security boundaries may be wrong.

---

### D-SCHEMA-008 — RLS helper design deferred

Decision:

RLS helper design is deferred.

Future migrations may not create RLS helper functions unless a later RLS-specific issue explicitly authorizes them.

Scope:

Dev-only schema planning.

What this allows:

- Future migration control packet may identify where RLS helper functions might be needed.
- Future RLS issue may design helper functions separately.

What this does not allow:

- No RLS policies.
- No helper functions.
- No security-definer functions.
- No database permission shortcuts.

Decision status:

Deferred / RLS helper design not implementation-approved.

Future final decision location:

- `docs/04-security/RLS_POLICY_MATRIX.md`
- Future RLS implementation issue

Risk:

If helper design is invented during migrations, security behavior may become hidden or unsafe.

---

### D-SCHEMA-009 — No-PHI confirmation

Decision:

No PHI is allowed.

No patient data, patient identifiers, medical record data, patient room/bed association, healthcare treatment information, or PHI-capable workflow is authorized.

Scope:

All current dev-schema planning.

What this allows:

- Fake/demo facility and incident records only.
- No-PHI schema planning.

What this does not allow:

- No PHI fields.
- No real healthcare patient data.
- No PHI-capable workflow.
- No production healthcare data.

Decision status:

Confirmed for current build path.

Future final decision location:

- `docs/04-security/SECURITY_GUARDRAILS.md`
- `docs/01-product/OUT_OF_SCOPE.md`
- `docs/00-control/DECISION_LOG.md`

Risk:

PHI exposure would create major legal/security/compliance risk.

---

### D-SCHEMA-010 — Fake/demo seed data confirmation

Decision:

Only fake/demo seed data is allowed.

Scope:

All current dev-schema, app, and test planning.

What this allows:

- Demo Property Group
- North Wing Facility
- Water Intrusion Demo
- Document Placeholder 001
- Auxilium Admin Demo
- Client Viewer Demo
- Request Submitted placeholder event
- Document Released placeholder event

What this does not allow:

- No real client names.
- No real addresses.
- No real contacts.
- No real documents.
- No real project names.
- No PHI.
- No passwords.
- No API keys.
- No service-role keys.
- No secrets.

Decision status:

Confirmed for current build path.

Future final decision location:

- `docs/03-data/SEED_DATA_REGISTRY.md`
- `docs/04-security/SECURITY_GUARDRAILS.md`
- `docs/00-control/DECISION_LOG.md`

Risk:

Real data in dev/test creates avoidable privacy, legal, and security exposure.

## Readiness Impact

These decisions allow creation of a future documentation-only migration control packet.

They do not authorize migrations.

Updated readiness stance:

Ready to create a migration control packet.

Still blocked for actual migrations until a future migration issue explicitly authorizes exact migration files, table definitions, tests, and out-of-scope rules.

## Next Safe Issue

Create:

Foundation migration control packet

This next issue should remain documentation/control only and must not create migrations or touch Supabase.