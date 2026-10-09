# Current Handoff

Last updated: 2026-07-13

## Purpose

This is the current AuxiliumOS restart and handoff snapshot.

Use it at the start of any new ChatGPT, Cursor, Lovable, Claude Code, Codex, GitHub Copilot, or other AI-assisted session.

## Permanent Source-of-Truth Rule

The GitHub repository is the source of truth.

AI tools are workers.

Do not rely on prior chat memory.

## Canonical Data Spine

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

## Current Project Phase

Dev-Only Foundation Schema Migration Preparation.

The founder has selected the controlled path toward an initial dev-only migration artifact.

No migration has been created or applied yet.

## Completed Board Sequence

- #52 — Create Lovable visual UI shell v1
- #54 — First build implementation plan
- #56 — Founder decision checkpoint for first build blockers
- #58 — Foundation vertical slice build-control packet
- #60 — Static app shell scaffold and route placeholders
- #62 — App test harness and Playwright baseline
- #64 — Correct issue-number references and bulk control doc update after static shell baseline
- #66 — Supabase schema design packet for foundation slice
- #68 — Schema implementation readiness gate for foundation slice
- #70 — Bulk control doc update after schema design sprint
- #72 — Minimum schema blocker decisions for foundation slice
- #74 — Foundation migration control packet
- #76 — Bulk control doc update after schema blocker sprint

## Current Static App

Files:

- `app/index.html`
- `app/styles.css`
- `app/app.js`

Status:

Static prototype only.

No backend, auth, storage, RLS, database connection, production, real client data, or PHI.

## Current Test Harness

Files:

- `package.json`
- `package-lock.json`
- `playwright.config.ts`
- `tests/e2e/static-app-shell.spec.ts`

Status:

Playwright static-shell baseline exists.

## Current Data Design

Files:

- `docs/03-data/FOUNDATION_SCHEMA_DESIGN_PACKET.md`
- `docs/03-data/SCHEMA_IMPLEMENTATION_READINESS_GATE.md`
- `docs/03-data/MINIMUM_SCHEMA_BLOCKER_DECISIONS.md`
- `docs/03-data/FOUNDATION_MIGRATION_CONTROL_PACKET.md`
- `docs/03-data/SCHEMA_REGISTRY.md`
- `docs/03-data/TABLE_OWNERSHIP.md`
- `docs/03-data/RELATIONSHIP_MAP.md`
- `docs/03-data/FIELD_DICTIONARY.md`
- `docs/03-data/SEED_DATA_REGISTRY.md`

## Current Migration Candidate Scope

Only these seven candidate tables may be included in the first migration issue:

- `client_accounts`
- `user_profiles`
- `account_memberships`
- `facilities`
- `incident_requests`
- `documents`
- `audit_events`

## Current Supabase Status

Development project:

`auxiliumos-dev`

Repo/project connection:

Not connected.

Schema:

No application tables.

Migrations:

None.

Auth:

Not configured.

Storage:

Not configured.

RLS:

No policies.

Edge functions:

None.

Production:

Not created.

Data:

Fake/demo only.

PHI:

Not allowed.

Secrets:

None stored in the repo.

## Current Next Issue

Create:

`Initial dev-only foundation schema migrations`

Recommended board status:

`Ready for Build`

The issue must explicitly authorize exact files and tests.

It may create a migration artifact and fake/demo seed artifact.

It may not apply the migration or connect to Supabase.

## Current Tool Status

### GitHub

Source of truth for issues, branches, PRs, history, and board status.

### GitHub Desktop

Used for branch creation, commit, push, pull, and cleanup.

### Cursor

Used for controlled local editing and approved terminal commands.

### ChatGPT

Used for planning, drafting, risk review, and exact operational instructions.

### Lovable

Visual-only prototype work completed.

No backend or Supabase authority.

### Supabase

Development project documented but not connected.

No dashboard schema edits authorized.

### Claude Code and Codex

No implementation edits currently authorized.

## Non-Negotiable Guardrails

- No secrets in GitHub, AI chats, screenshots, or app code.
- No real client data.
- No PHI.
- No production.
- No cloud database connection without an issue.
- No client-data exposure without RLS policies and denial tests.
- No client-visible document without release workflow.
- No message or chat changes approved scope.
- No silent schema expansion.
- No new core object without an architecture decision.
- No founder-decision item treated as final unless recorded as final.

## Required Workflow For Every Issue

1. Open the board.
2. Select one issue.
3. Confirm branch, allowed files, tests, and prohibitions.
4. Move the issue to `In Agent Work`.
5. Switch GitHub Desktop to `main`.
6. Fetch and pull.
7. Create the exact branch.
8. Edit only allowed files.
9. Run required tests.
10. Review GitHub Desktop changes.
11. Commit with the required summary.
12. Push/publish.
13. Create the PR.
14. Use the required PR title and body.
15. Review the GitHub Files changed tab.
16. Merge only after review.
17. Move the board card to `Done`.
18. Confirm the issue closes.
19. Return GitHub Desktop to `main`.
20. Fetch and pull.
21. Delete the local branch.
22. Confirm no uncommitted changes.

## Required Start-of-Session Intake

Before editing, read:

- `AGENTS.md`
- `docs/00-control/CURRENT_HANDOFF.md`
- `docs/00-control/TRANSITION_PROTOCOL.md`
- `docs/00-control/PROJECT_STATE.md`
- `docs/00-control/NEXT_ACTIONS.md`
- The active issue
- Every relevant spec named by the issue

Before editing, summarize:

- Current task
- Expected files
- Prohibited files/actions
- Tests
- Assumptions
- Risks

## Required Session Closeout

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