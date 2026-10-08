> Historical phase document, retained for traceability. The 2026-10-08 owner mandate in AGENTS.md and EXECUTION_PROTOCOL.md supersedes preparation-only stop rules and first-slice scope ceilings. Permanent domain/security rules remain. Full delivery is REQUIREMENTS.json; pending owner policies permit synthetic development defaults with scoped live activation gates.

# First Build Implementation Plan

Last updated: 2026-07-05

Issue: #54 — First build implementation plan

## Status

Documentation/control plan only.

This document was created after Issue #52 — Create Lovable visual UI shell v1 — was completed and manually verified.

This document does not authorize app code, Supabase schema, Supabase tables, Supabase storage buckets, auth providers, RLS policies, edge functions, Playwright installation, Claude Code implementation edits, Codex implementation edits, production deployment, real client data, PHI, secrets, or business authority decisions.

## Purpose

This document defines the first controlled build sequence after the Lovable visual UI shell review.

The goal is to move from visual shell review into first build planning without skipping the issue/branch/PR workflow, without allowing tools to invent business logic, and without starting backend or app implementation before a future GitHub issue explicitly authorizes it.

## Source-of-Truth Rule

GitHub is the source of truth.

AI tools are workers.

One issue controls one branch and one controlled change.

ChatGPT, Cursor, Lovable, Claude Code, Codex, GitHub Copilot, and future AI tools may propose, draft, review, test, and implement only when a GitHub issue explicitly authorizes that scope.

No AI tool may silently decide:

- Core architecture
- Role authority
- Permission authority
- Document release authority
- Scope approval authority
- Cap/change authorization authority
- Agreement/signature authority
- Professional/legal/business authority
- Supabase schema
- RLS policies
- Auth logic
- Storage logic
- Production readiness

## Canonical Data Spine

Client Account -> Program/MSA -> Portfolio -> Asset/Facility -> Zone/Area -> Incident -> Project Request -> Scope Record -> Authorization -> Project -> Tasks/Work Orders -> Deliverables -> Documents -> Communications -> Financial Records -> Reports/Dashboards -> Audit Events.

Every future issue must preserve this spine or explicitly mark the work as global configuration, reference data, integration data, or out of scope.

## Completed Input

The following work is treated as completed for this plan:

- Repo control layer created.
- Core source-of-truth docs created.
- Spec gate passed for visual-only first build preparation.
- Issue #52 — Create Lovable visual UI shell v1 — completed and manually verified.
- Lovable visual shell was limited to UI shell concepts and did not authorize backend implementation.
- Issue #54 — First build implementation plan — created to define the next controlled build sequence.

## First Build Slice Target

The first controlled build target remains:

Account -> User Role -> Facility -> Incident Request -> Admin Queue -> Document Upload -> Document Release -> Client View -> Audit Event.

This slice is intended to prove:

- Account ownership
- User membership
- Role-aware access
- Facility ownership
- Incident/request submission
- Admin review queue
- Document upload/staging
- Document hidden by default
- Document release workflow
- Client-visible released document access
- Audit events
- Positive permission tests
- Negative permission tests

## Current Issue Authority

Current issue:

#54 — First build implementation plan

Current issue type:

Documentation / planning only.

Allowed files:

- docs/00-control/FIRST_BUILD_IMPLEMENTATION_PLAN.md
- docs/00-control/NEXT_ACTIONS.md
- docs/00-control/CURRENT_HANDOFF.md
- docs/00-control/PROJECT_STATE.md

Current issue does not authorize implementation.

## Immediate Build Issue Sequence

The following issue sequence must be created and worked one issue at a time.

Each future issue must include its own issue body, branch name, allowed file list, tool authorization, acceptance criteria, tests, and explicit out-of-scope rules.

| Order | Future issue title | Task type | May touch app code? | May authorize Supabase schema? | May authorize auth? | May authorize storage? | May authorize RLS? | May authorize Playwright? | May authorize Claude Code / Codex implementation edits? | Founder / review gate | Tests before merge |
|---|---|---|---|---|---|---|---|---|---|---|---|
| FB-01 | Founder decision checkpoint for first build blockers | Decision documentation | No | No | No | No | No | No | No | Founder, security, legal, professional review as applicable | Manual review only |
| FB-02 | Foundation vertical slice build-control packet | Documentation / control packet | No | No | No | No | No | No | No | Founder/security/legal/professional review if blockers remain | Manual review only |
| FB-03 | Static app shell scaffold and route placeholders | App/code implementation | Yes, only exact files listed in future issue | No | No | No | No | No | Yes, only if the issue explicitly authorizes them | Review UI terminology and no authority claims | Build/lint/typecheck if available |
| FB-04 | App test harness and Playwright baseline | Testing / app-code support | Yes, only test/config files listed in future issue | No | No | No | No | Yes | Yes, only if explicitly authorized | Security review for test-user assumptions | Test harness must run or blocker documented |
| FB-05 | Supabase schema design packet for foundation slice | Documentation / data planning | No | No | No | No | No | No | No | Founder/security review if data ownership or visibility depends on open decisions | Manual review only |
| FB-06 | Initial Supabase schema migrations for foundation slice | Schema implementation | No unless exact generated/helper files are authorized | Yes | No | No | Only deny-by-default posture if explicitly included | No | Yes, only if explicitly authorized | Founder/security review required before merge if blockers affect data ownership | Migration/schema validation required where available |
| FB-07 | Development auth setup and test identities | Auth implementation | Yes, only exact files listed in future issue | No, except reviewed support changes | Yes | No | No, except reviewed deny-by-default safety | No unless FB-04 already completed and issue says so | Yes, only if explicitly authorized | Founder/security review required if role authority or membership model is unresolved | Auth verification and test-user checks where available |
| FB-08 | RLS policies and permission-denial tests for foundation slice | RLS/security implementation | Only test/helper files explicitly authorized | Only reviewed support changes | Only if needed for test identities and explicitly authorized | No | Yes | No unless FB-04 already completed and issue says so | Yes, only if explicitly authorized | Founder/security review required | Permission-denial tests required |
| FB-09 | Development storage buckets and document metadata staging | Storage/document-control implementation | Only exact files listed in future issue | Only reviewed support changes | No | Yes | Storage/object policies only if explicitly included and tested | No unless FB-04 already completed and issue says so | Yes, only if explicitly authorized | Founder/security/document-control review required | Document release and denial tests required |
| FB-10 | Foundation incident request and admin queue implementation | App/code implementation | Yes | No new schema unless issue explicitly authorizes reviewed migration | No new auth unless explicitly reviewed | No unless explicitly reviewed | No broad new RLS unless explicitly reviewed | Only if explicitly authorized | Yes, only if explicitly authorized | Founder/security/professional review required if request/admin authority remains unresolved | Happy path, wrong-account denial, removed-user denial, admin queue, audit expectation |
| FB-11 | Foundation document release and client view implementation | App/code and document-control implementation | Yes | Only reviewed supporting migrations if explicitly listed | No | Only if FB-09 not completed and issue explicitly authorizes storage | Only document/storage policy updates if explicitly listed | Only if explicitly authorized | Yes, only if explicitly authorized | Founder/security/document-control/professional review required | Draft-hidden, released-visible, wrong-account denial, removed-user denial, release/view/download audit |
| FB-12 | Foundation audit, backup, and handoff proof | App/code, testing, release-safety documentation | Only if explicitly authorized | No major new schema | No | No | No broad new RLS | Only if explicitly authorized | Yes, only if explicitly authorized | Founder/security/legal/professional review required before real client or production use | Available foundation-slice tests must run or failures documented |

## First Authorization Summary

The first future issue that may touch app code:

FB-03 — Static app shell scaffold and route placeholders.

The first future issue that may authorize Playwright installation:

FB-04 — App test harness and Playwright baseline.

The first future issue that may authorize Supabase schema creation:

FB-06 — Initial Supabase schema migrations for foundation slice.

The first future issue that may authorize auth setup:

FB-07 — Development auth setup and test identities.

The first future issue that may authorize RLS policies:

FB-08 — RLS policies and permission-denial tests for foundation slice.

The first future issue that may authorize storage buckets:

FB-09 — Development storage buckets and document metadata staging.

The first future issue that may authorize Claude Code or Codex implementation edits:

FB-03 — Static app shell scaffold and route placeholders, if and only if the future issue explicitly authorizes those tools, exact files, tests, and out-of-scope rules.

## Founder Decision Blockers

The following remain founder-review-required before they can control implementation:

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
- Storage bucket design
- Supabase schema design
- Production readiness
- Real client data onboarding
- Whether any PHI-capable workflow will ever be supported

If unresolved, these must remain marked as:

Decision Status: Draft / Founder review required / Not implementation-approved.

## Security / Legal / Professional Review Blockers

Security review is required before:

- Client-data tables are exposed to the app
- RLS policies are merged
- Storage buckets are created
- Auth providers are configured
- Real users are invited
- Real client data is used
- Production is created
- Any PHI-capable workflow is considered

Legal/professional review is required before:

- Client-facing professional boundary language is finalized
- Scope approval rules are finalized
- Document release authority is finalized
- Emergency authorization workflow is used operationally
- Licensed/specialty service boundaries are represented to clients
- Real client terms, rates, caps, or agreement language are used

## Test Requirements by Future Issue Type

Documentation-only issues:

- No automated tests required.
- Manual review required.
- Confirm no unauthorized files changed.

Static app shell issues:

- Build/lint/typecheck if available.
- No backend or real workflow tests unless app supports them.

Schema issues:

- Migration application test where available.
- Data integrity checks where available.
- No public exposure without RLS plan and tests.

Auth issues:

- Auth setup verification.
- Test users only.
- Removed/suspended user path must be planned or tested.

RLS issues:

- Positive permission tests required.
- Negative permission tests required.
- Wrong-account denial required.
- Removed/suspended user denial required.

Document-release issues:

- Draft hidden test required.
- Released visible test required.
- Wrong-account denial required.
- Removed/suspended user denial required.
- View/download/release audit test required where implemented.

Audit-event issues:

- Important actions must create audit events.
- Tests must verify event creation where implemented.

Message/scope issues:

- Message cannot change approved scope.
- Message may create task/change-request draft only if the workflow issue explicitly authorizes it.

## Current Not-Allowed List

Do not start yet:

- Full Lovable backend app build
- Supabase schema
- Supabase tables
- Supabase storage buckets
- Auth providers
- RLS policies
- Edge functions
- Claude Code implementation edits
- Codex implementation edits
- Playwright installation
- GitHub Actions real CI
- Production setup
- Real client data onboarding
- PHI-capable workflows
- Real document release
- Real scope logic
- Real agreement/signature logic
- Real finance/cap logic
- Payment processing
- E-signature integration
- Full ROM engine
- Full sampling engine
- Full MSA engine
- Full enterprise site passport suite

until the relevant future GitHub issue explicitly authorizes the work and the issue is worked through branch, PR, review, merge, board update, and closeout.

## Immediate Next Issue After This Plan

Create GitHub issue:

Founder decision checkpoint for first build blockers

Recommended initial board status:

Ready for Spec

Purpose:

Collect and record the founder/security/legal/professional decisions needed before the first implementation issues can safely begin.

This next issue must not authorize app code, Supabase schema, auth, storage, RLS, Playwright, Claude Code implementation edits, Codex implementation edits, production, real client data, PHI, or secrets.
