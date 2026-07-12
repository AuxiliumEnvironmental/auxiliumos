# Current Handoff

Last updated: 2026-07-12

## Purpose

This file is the current AuxiliumOS handoff snapshot.

Use this file when starting a new ChatGPT, Cursor, Claude Code, Codex, Lovable, GitHub Copilot, or other AI-assisted development session.

The purpose is to prevent long-chat drift, hallucination, lost context, duplicated work, uncontrolled schema changes, and accidental violations of the AuxiliumOS architecture.

## Permanent Source-of-Truth Rule

The GitHub repository is the source of truth.

ChatGPT, Cursor, Lovable, Claude Code, Codex, GitHub Copilot, and all future AI agents are workers.

If a decision, workflow, assumption, schema change, permission rule, document rule, or project status is not captured in the repository, it does not count.

## Canonical AuxiliumOS Data Spine

Client Account
-> Program/MSA
-> Portfolio
-> Asset/Facility
-> Zone/Area
-> Incident
-> Project Request
-> Scope Record
-> Authorization
-> Project
-> Tasks/Work Orders
-> Deliverables
-> Documents
-> Communications
-> Financial Records
-> Reports/Dashboards
-> Audit Events.

Every future feature must connect to this spine or be treated as global configuration, reference data, integration data, or out-of-scope.

## Current Project Phase

First Build Implementation Planning.

Issue #52 — Create Lovable visual UI shell v1 — is complete and manually verified.

Issue #54 — First build implementation plan — created the first controlled build implementation plan.

The project is not approved for production, real client data, PHI, Supabase schema, storage buckets, auth providers, RLS policies, full backend build, Playwright installation, Claude Code implementation edits, or Codex implementation edits unless a future GitHub issue explicitly authorizes that scope.

## Completed So Far

The following have been completed and merged or manually verified:

- Local AuxiliumOS folder system
- Private GitHub repository named auxiliumos
- Starter repo skeleton committed and pushed
- GitHub Desktop connected
- GitHub labels created
- GitHub Project board created
- First set of issues created
- PROJECT_STATE.md v1
- DECISION_LOG.md v1
- OPEN_QUESTIONS.md v1
- DATA_SPINE.md v1
- MODULE_MAP.md v1
- AI_TOOL_RULES.md and PROMPT_LIBRARY.md
- Repo foundation review
- Node.js installed
- Cursor installed
- Lovable Workspace Knowledge and Project Knowledge configured
- Supabase dev project documented as dev-only
- ROLE_PERMISSION_MATRIX.md v1
- DOCUMENT_ACCESS_MATRIX.md v1
- V1_SCOPE.md and UAT_SCENARIOS.md
- RLS_POLICY_MATRIX.md and RLS_TEST_PLAN.md
- DOCUMENT_RELEASE_WORKFLOW.md
- REQUEST_STATE_MACHINE.md
- EMERGENCY_EXCEPTION_WORKFLOW.md
- CHANGE_AUTHORIZATION_WORKFLOW.md
- PLAYWRIGHT_TEST_PLAN.md
- No-PHI policy in SECURITY_GUARDRAILS.md and OUT_OF_SCOPE.md
- SPEC_GATE_REVIEW.md
- TRANSITION_PROTOCOL.md
- END_STATE_BLUEPRINT.md
- Issue #52 — Create Lovable visual UI shell v1
- Issue #54 — First build implementation plan
- FIRST_BUILD_IMPLEMENTATION_PLAN.md
- Issue #56 — Founder decision checkpoint for first build blockers
- FOUNDER_DECISION_CHECKPOINT_FIRST_BUILD.md
- Issue #58 — Foundation vertical slice build-control packet
- FOUNDATION_VERTICAL_SLICE_CONTROL_PACKET.md
- #60 — Static app shell scaffold and route placeholders
- #62 — App test harness and Playwright baseline
- #64 — Correct issue-number references and bulk control doc update after static shell baseline

## Current Static App Shell Status

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

## Current Playwright Baseline Status

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

## Current Tool Status

### GitHub

Status:

Active source of truth.

Repository:

auxiliumos

Workflow:

One issue, one branch, one controlled change, one PR, review, merge, board update.

### GitHub Desktop

Status:

Used for branch creation, commits, pushes, fetch/pull, and local branch cleanup.

### ChatGPT

Status:

Used for strategy, detailed step guidance, repo-document drafting, and reasoning.

Restriction:

ChatGPT cannot be the only place decisions live.

### Cursor

Status:

Installed.

Use:

Open the local repo, read files, summarize rules, and perform controlled edits when the issue defines branch and allowed files.

Current restriction:

No implementation edits unless issue, branch, and allowed files are defined.

### Lovable

Status:

Paid account available. Workspace Knowledge and Project Knowledge configured. Visual shell work completed for Issue #52.

Use:

Visual-only UI shell and controlled interface exploration.

Current restriction:

No backend, schema, RLS, auth, storage, Supabase connection, production connection, real workflows, real client data, or PHI unless a future issue explicitly authorizes it.

### Supabase

Status:

Development project documented as auxiliumos-dev.

Current restriction:

Dev only. No production. No staging yet. No tables. No storage buckets. No auth providers. No Lovable connection. No GitHub integration. No keys in repo or AI chats.

## Current Schema Design Status

Status:

Design packet created.

Issue:

#66 — Supabase schema design packet for foundation slice

File:

- `docs/03-data/FOUNDATION_SCHEMA_DESIGN_PACKET.md`

Scope:

Documentation/data planning only.

No Supabase migrations, tables, auth, storage, RLS, production deployment, real client data, PHI, or secrets were added.

## Current Schema Implementation Readiness Status

Status:

Blocked for migrations.

Issue:

#68 — Schema implementation readiness gate for foundation slice

File:

- `docs/03-data/SCHEMA_IMPLEMENTATION_READINESS_GATE.md`

Reason:

Minimum founder/security decisions remain unresolved or not implementation-approved.

Next required issue:

Minimum schema blocker decisions for foundation slice

## Current Minimum Schema Decision Status

Status:

Recorded for dev-schema planning only.

Issue:

#72 — Minimum schema blocker decisions for foundation slice

File:

- `docs/03-data/MINIMUM_SCHEMA_BLOCKER_DECISIONS.md`

Scope:

Minimum founder/security decisions needed before planning dev-only migrations.

Limitations:

- Not production-approved.
- Does not authorize migrations.
- Does not authorize auth, storage, RLS, real client data, PHI, or secrets.

## Current Migration Control Packet Status

Status:

Created.

Issue:

#74 — Foundation migration control packet

File:

- `docs/03-data/FOUNDATION_MIGRATION_CONTROL_PACKET.md`

Scope:

Defines what a future dev-only migration issue must contain.

Limitations:

- Does not itself authorize migrations.
- Does not authorize auth, storage, RLS, production, real client data, PHI, or secrets.

## Current Planning Document

Current first build plan:

`docs/00-control/FIRST_BUILD_IMPLEMENTATION_PLAN.md`

This plan defines:

- Future issue sequence
- First app-code authorization gate
- First Playwright authorization gate
- First Supabase schema authorization gate
- First auth authorization gate
- First RLS authorization gate
- First storage authorization gate
- First Claude Code / Codex implementation authorization gate
- Founder decision blockers
- Security/legal/professional review blockers
- Test requirements

## Current Foundation Vertical Slice Control Packet

Current packet file:

`docs/00-control/FOUNDATION_VERTICAL_SLICE_CONTROL_PACKET.md`

Status:

Created.

The packet defines the controlled first build slice:

Account -> User Role -> Facility -> Incident Request -> Admin Queue -> Document Upload -> Document Release -> Client View -> Audit Event.

The packet does not authorize implementation.

The next possible implementation issue is:

Static app shell scaffold and route placeholders

That future issue must be static-only and must include exact branch, allowed files, tests, and out-of-scope rules.

## Current Founder Decision Checkpoint

Current checkpoint file:

`docs/00-control/FOUNDER_DECISION_CHECKPOINT_FIRST_BUILD.md`

Status:

Founder/security/legal/professional decisions remain review-required / not implementation-approved unless explicitly recorded as approved in the repo.

Safe default:

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

## First Build Slice Target

The first controlled build target remains:

Account
-> User Role
-> Facility
-> Incident Request
-> Admin Queue
-> Document Upload
-> Document Release
-> Client View
-> Audit Event.

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

## Immediate Next Issue

Next issue to create only if founder chooses to proceed:

Initial dev-only foundation schema migrations

Recommended board status after creation:

Ready for Spec

Purpose:

Create the first dev-only foundation schema migration and fake/demo seed file under the foundation migration control packet.

This future issue must explicitly authorize exact migration and seed files.

This future issue must not authorize auth setup, storage buckets, RLS policies, edge functions, production deployment, real client data, PHI, secrets, Claude Code implementation edits, or Codex implementation edits unless explicitly and separately authorized.

## Future Build Issue Sequence

Follow the sequence in `FIRST_BUILD_IMPLEMENTATION_PLAN.md`:

1. Founder decision checkpoint for first build blockers
2. Foundation vertical slice build-control packet
3. Static app shell scaffold and route placeholders
4. App test harness and Playwright baseline
5. Supabase schema design packet for foundation slice
6. Initial Supabase schema migrations for foundation slice
7. Development auth setup and test identities
8. RLS policies and permission-denial tests for foundation slice
9. Development storage buckets and document metadata staging
10. Foundation incident request and admin queue implementation
11. Foundation document release and client view implementation
12. Foundation audit, backup, and handoff proof

Each issue must have its own issue body, branch name, allowed file list, tool authorization, acceptance criteria, tests, and out-of-scope rules.

## Founder-Decision Rule

Some items require founder, legal, security, or professional judgment.

AI may draft options and recommendations.

AI may not finalize:

- Role authority
- Document release authority
- Scope approval authority
- Cap approval authority
- Agreement signer rules
- No-PHI policy exceptions
- Professional/legal boundaries
- RLS exceptions
- Production deployment approval
- Client-facing promises
- Sampling strategy approval

If unresolved, mark as:

Decision Status: Draft / Founder review required / Not implementation-approved.

Also preserve the item in the appropriate control file or future issue.

## Non-Negotiable Guardrails

- No secrets in GitHub, ChatGPT, Lovable, Cursor, Claude, Codex, screenshots, or markdown files.
- No API keys.
- No service-role keys.
- No database passwords.
- No real client data during planning/specification/visual shell.
- No PHI.
- No production data.
- No client-visible document without release workflow.
- No chat/message may change approved scope.
- No client-data table without RLS plan and tests.
- No AI-created professional/legal/business authority.
- No direct production edits.
- No broad public Supabase policies.
- No full Lovable backend app build before a specific GitHub issue authorizes it.
- No Supabase schema before a specific schema issue authorizes it.
- No Playwright install until a specific test-harness issue authorizes it.
- No Claude Code implementation edits until a specific issue authorizes them.
- No Codex implementation edits until a specific issue authorizes them.
- No GitHub Actions real CI until package scripts/tests exist and an issue authorizes real CI.

## What Must Not Start Yet

Do not start:

- Full Lovable backend app build
- App code implementation beyond future issue authorization
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
- Real document release
- Real scope logic
- Real agreement/signature logic
- Real finance/cap logic

until the relevant future GitHub issue is created, approved, and worked through the normal branch/PR process.

## Required Workflow For Every Future Issue

1. Open GitHub Project board.
2. Select one issue only.
3. Move issue card to In Agent Work.
4. Open GitHub Desktop.
5. Confirm branch is main.
6. Fetch/pull.
7. Create issue-specific branch.
8. Edit only allowed files.
9. Save.
10. Confirm changed files in GitHub Desktop.
11. Commit with specified summary.
12. Push/publish branch.
13. Create pull request.
14. Replace PR body with specified PR body.
15. Review Files Changed.
16. Confirm no secrets, client data, PHI, or unrelated files.
17. Merge only after review.
18. Delete remote branch if offered.
19. Move board card to Released.
20. Close issue if not closed automatically.
21. Switch GitHub Desktop back to main.
22. Fetch/pull.
23. Delete local branch if desired.
24. Confirm clean state.

## Required Start-of-Session Behavior

Before any AI tool edits files, it must read or be given:

- AGENTS.md
- CLAUDE.md if using Claude Code
- docs/00-control/CURRENT_HANDOFF.md
- docs/00-control/PROJECT_STATE.md
- docs/00-control/NEXT_ACTIONS.md
- The relevant GitHub issue
- The allowed file list
- The required output format

The AI must first summarize:

- Current task
- Files expected to change
- What it must not change
- Risks or assumptions
- Tests or documentation expected

If it cannot determine those items, it must stop and ask.

## Required End-of-Session Closeout

Every AI/tool session must end with this closeout:

```markdown

# Session Closeout

Date:

Tool used:

Ticket(s):

Completed:

Files changed:

Database changes:

RLS changes:

Tests added:

Tests run:

Test results:

Assumptions made:

Decisions needed from founder:

Risks introduced:

Docs updated:

Next recommended ticket: