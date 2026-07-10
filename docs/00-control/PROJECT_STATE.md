
---

## File 4 — `docs/00-control/PROJECT_STATE.md`

Replace the entire file with:

```markdown
# Project State

Last updated: 2026-07-05

## Current Phase

First Build Implementation Planning

## Source of Truth

The GitHub repository is the source of truth.

ChatGPT, Cursor, Lovable, Claude Code, Codex, GitHub Copilot, and all future AI agents are workers. If a decision, workflow, assumption, schema change, permission rule, document rule, or project status is not captured in the repository, it does not count.

## Canonical Data Spine

Client Account -> Program/MSA -> Portfolio -> Asset/Facility -> Zone/Area -> Incident -> Project Request -> Scope Record -> Authorization -> Project -> Tasks/Work Orders -> Deliverables -> Documents -> Communications -> Financial Records -> Reports/Dashboards -> Audit Events.

## Current Status

Issue #52 — Create Lovable visual UI shell v1 — is complete and manually verified.

Issue #54 — First build implementation plan — has created the controlled plan for moving from visual shell review into first build planning.

The repo now contains a first build implementation plan that defines future issue sequencing and authorization gates.

The project is not approved for production, real client data, PHI, Supabase schema, storage buckets, auth providers, RLS policies, edge functions, full backend workflows, Playwright installation, Claude Code implementation edits, or Codex implementation edits unless a future GitHub issue explicitly authorizes that scope.

## Completed Setup Items

- Local AuxiliumOS folder system created.
- Private GitHub repository named auxiliumos created.
- Starter repo skeleton committed and pushed.
- GitHub Desktop connected.
- GitHub labels created.
- GitHub Project board created.
- First set of issues created and worked through the issue/branch/PR workflow.
- Node.js installed.
- Cursor installed.
- Lovable paid account available.
- Lovable Workspace Knowledge and Project Knowledge configured.
- Supabase dev project documented as auxiliumos-dev.
- No real client data has been used.
- No PHI has been used.
- No secrets have been committed.

## Completed Control Documents

- PROJECT_STATE.md v1
- DECISION_LOG.md v1
- OPEN_QUESTIONS.md v1
- DATA_SPINE.md v1
- MODULE_MAP.md v1
- AI_TOOL_RULES.md
- PROMPT_LIBRARY.md
- CURRENT_HANDOFF.md
- Repo foundation review
- SPEC_GATE_REVIEW.md
- TRANSITION_PROTOCOL.md
- END_STATE_BLUEPRINT.md
- FIRST_BUILD_IMPLEMENTATION_PLAN.md
- FOUNDER_DECISION_CHECKPOINT_FIRST_BUILD.md
- FOUNDATION_VERTICAL_SLICE_CONTROL_PACKET.md

## Completed Specification Documents

- ROLE_PERMISSION_MATRIX.md v1
- DOCUMENT_ACCESS_MATRIX.md v1
- V1_SCOPE.md
- UAT_SCENARIOS.md
- RLS_POLICY_MATRIX.md
- RLS_TEST_PLAN.md
- DOCUMENT_RELEASE_WORKFLOW.md
- REQUEST_STATE_MACHINE.md
- EMERGENCY_EXCEPTION_WORKFLOW.md
- CHANGE_AUTHORIZATION_WORKFLOW.md
- PLAYWRIGHT_TEST_PLAN.md
- SECURITY_GUARDRAILS.md no-PHI policy
- OUT_OF_SCOPE.md no-PHI/out-of-scope policy

## Completed Visual Preparation

- Issue #52 — Create Lovable visual UI shell v1
- Visual UI shell review completed manually.
- Visual shell did not authorize backend implementation.

## Spec Gate Review Status

Status:

Passed for visual-only first build preparation and first build planning.

Important limitation:

This gate allowed the Lovable visual shell and first build planning.

This gate does not authorize Supabase schema creation, storage buckets, auth providers, RLS policies, production deployment, real client data, PHI, unrestricted AI coding, Claude Code implementation edits, Codex implementation edits, or Playwright installation.

## First Build Implementation Plan Status

Status:

Created.

Plan file:

`docs/00-control/FIRST_BUILD_IMPLEMENTATION_PLAN.md`

The plan defines:

- Next build issues in exact order
- Docs-only issues
- First issue that may touch app code
- First issue that may authorize Supabase schema
- First issue that may authorize auth setup
- First issue that may authorize storage buckets
- First issue that may authorize RLS policies
- First issue that may authorize Playwright installation
- First issue that may authorize Claude Code or Codex implementation edits
- Founder decision blockers
- Security/legal/professional review blockers
- Test expectations

## Founder Decision Checkpoint Status

Status:

Created.

Checkpoint file:

`docs/00-control/FOUNDER_DECISION_CHECKPOINT_FIRST_BUILD.md`

The checkpoint identifies founder/security/legal/professional decisions that remain review-required or not implementation-approved before future implementation work.

No implementation was authorized by the checkpoint.

Safe default remains:

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
- No final business authority decisions by AI.

## Foundation Vertical Slice Control Packet Status

Status:

Created.

Packet file:

`docs/00-control/FOUNDATION_VERTICAL_SLICE_CONTROL_PACKET.md`

The packet defines the controlled first build slice:

Account -> User Role -> Facility -> Incident Request -> Admin Queue -> Document Upload -> Document Release -> Client View -> Audit Event.

The packet does not authorize implementation.

The next possible implementation issue is:

Static app shell scaffold and route placeholders

That future issue must be static-only and must include exact branch, allowed files, tests, and out-of-scope rules.

## First Build Slice Confirmed

The first controlled build target remains:

Account -> User Role -> Facility -> Incident Request -> Admin Queue -> Document Upload -> Document Release -> Client View -> Audit Event.

This slice proves:

- Account ownership
- User membership
- Role assignment
- Facility ownership
- Incident/request submission
- Admin review
- Document upload
- Document hidden by default
- Document release workflow
- Client-visible released document access
- Audit events
- Positive permission tests
- Negative permission tests

## Static App Shell Status

Status:

Created.

Issue:

#60 — Static app shell scaffold and route placeholders

Files:

- `app/index.html`
- `app/styles.css`
- `app/app.js`

Scope:

Static frontend only.

No backend, Supabase, auth, storage, RLS, production deployment, real client data, PHI, or secrets were added.

## Playwright Baseline Status

Status:

Created.

Issue:

#62 — App test harness and Playwright baseline

Files:

- `package.json`
- `package-lock.json`
- `playwright.config.ts`
- `tests/e2e/static-app-shell.spec.ts`

Scope:

Development-only Playwright baseline for the static app shell.

No Supabase, auth, storage, RLS, production deployment, real client data, PHI, or secrets were added.

## Supabase Dev Project Status

Status:

Created / documented as development only.

Project name:

auxiliumos-dev

Environment:

Development only

Production status:

Not created

Staging status:

Not created

Important security note:

No Supabase URL, publishable key, anon key, secret key, service-role key, database password, JWT secret, connection string, or API credential is stored in this repository.

Current Supabase limitations:

- No production client data
- No real client data
- No PHI
- No schema migrations yet
- No storage buckets yet
- No auth providers enabled yet
- No RLS policies yet
- No Lovable/Supabase connection yet
- No GitHub/Supabase integration yet

RLS posture:

RLS should be enabled by default for any future exposed client-data table, but no application tables or policies have been created yet.

## First Authorization Gates

First issue that may touch app code:

FB-03 — Static app shell scaffold and route placeholders

First issue that may authorize Playwright installation:

FB-04 — App test harness and Playwright baseline

First issue that may authorize Supabase schema creation:

FB-06 — Initial Supabase schema migrations for foundation slice

First issue that may authorize auth setup:

FB-07 — Development auth setup and test identities

First issue that may authorize RLS policies:

FB-08 — RLS policies and permission-denial tests for foundation slice

First issue that may authorize storage buckets:

FB-09 — Development storage buckets and document metadata staging

First issue that may authorize Claude Code or Codex implementation edits:

FB-03 — Static app shell scaffold and route placeholders, if and only if the issue body explicitly authorizes those tools, exact files, tests, and out-of-scope rules.

## Still Draft / Founder Review Required

The following are not final implementation decisions:

- Role authority
- Document release authority
- Scope approval authority
- Cap/change authorization authority
- Emergency conditional authorization authority
- No-PHI operational exceptions
- Professional/legal boundaries
- RLS helper design
- Auth provider strategy
- Storage bucket design
- Supabase schema design
- Production readiness
- Real client data onboarding
- PHI-capable workflow policy

## Do Not Start Yet

Do not start:

- Full Lovable backend app build
- App implementation beyond future issue authorization
- Supabase schema
- Supabase storage buckets
- Auth providers
- RLS policy creation
- Edge functions
- Claude Code implementation edits
- Codex implementation edits
- Playwright install
- GitHub Actions real CI
- Production setup
- Real client data onboarding
- PHI-capable workflows
- Real document release logic
- Real scope logic
- Real agreement/signature logic
- Real finance/cap logic

until the relevant future GitHub issue is created, approved, and worked through the normal branch/PR process.

## Current Next Action

Create GitHub issue:

Minimum schema blocker decisions for foundation slice

Recommended board status:

Ready for Spec

Purpose:

Resolve, defer, or explicitly scope around the minimum blockers that prevent initial schema migrations.

This next issue is founder/security decision documentation.

This next issue must not create migrations, tables, auth, storage, RLS policies, edge functions, production deployment, real client data, PHI, or secrets.

## Schema Design Status

Status:

Created.

Issue:

#66 — Supabase schema design packet for foundation slice

File:

- `docs/03-data/FOUNDATION_SCHEMA_DESIGN_PACKET.md`

Scope:

Documentation/data planning only.

No Supabase migrations, tables, auth, storage, RLS, production deployment, real client data, PHI, or secrets were added.

## Schema Implementation Readiness Status

Status:

Blocked for migrations.

Issue:

#68 — Schema implementation readiness gate for foundation slice

File:

- `docs/03-data/SCHEMA_IMPLEMENTATION_READINESS_GATE.md`

Reason:

Minimum founder/security decisions remain unresolved or not implementation-approved.

No schema implementation is authorized.