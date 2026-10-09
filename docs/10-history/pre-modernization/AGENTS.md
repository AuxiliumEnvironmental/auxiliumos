# AuxiliumOS Agent Instructions

## Absolute Source of Truth

This repository is the source of truth.

Do not rely on chat memory.

Before making changes, read in this order:

1. `AGENTS.md`
2. `docs/00-control/CURRENT_HANDOFF.md`
3. `docs/00-control/TRANSITION_PROTOCOL.md`
4. `docs/00-control/PROJECT_STATE.md`
5. `docs/00-control/NEXT_ACTIONS.md`
6. `docs/01-product/END_STATE_BLUEPRINT.md`
7. `docs/01-product/DATA_SPINE.md`
8. `docs/04-security/ROLE_PERMISSION_MATRIX.md`
9. `docs/04-security/DOCUMENT_ACCESS_MATRIX.md`
10. The active GitHub issue and its allowed file list

## Canonical Data Spine

Client Account -> Program/MSA -> Portfolio -> Asset/Facility -> Zone/Area -> Incident -> Project Request -> Scope Record -> Authorization -> Project -> Tasks/Work Orders -> Deliverables -> Documents -> Communications -> Financial Records -> Reports/Dashboards -> Audit Events.

Every feature must connect to this spine or be identified as global configuration, reference data, integration data, or out of scope.

## Current Phase

Dev-Only Foundation Schema Migration Preparation.

Completed control work includes:

- First build implementation plan
- Founder decision checkpoint
- Foundation vertical-slice control packet
- Static app shell
- Playwright baseline
- Foundation schema design packet
- Schema readiness gate
- Minimum schema blocker decisions
- Foundation migration control packet
- Bulk control updates through Issue #76

## Current Gate

The next implementation candidate is:

`Initial dev-only foundation schema migrations`

That work may begin only through an active GitHub issue that explicitly provides:

- Exact branch
- Exact migration filename
- Exact seed filename
- Exact allowed files
- Exact table list
- Exact constraints
- Exact tests
- Explicit fake/demo-data-only rule
- Explicit no-PHI rule
- Explicit no-secrets rule
- Explicit no-auth/no-storage/no-RLS-policy boundaries

A migration artifact does not authorize:

- Cloud Supabase connection
- Migration application
- App/database connection
- Auth provider setup
- Storage buckets
- RLS policies
- Edge functions
- Production
- Real client data
- PHI

## Non-Negotiable Rules

- Do not invent new core objects.
- Do not rename canonical objects without an approved architecture decision.
- Do not create or change schema outside an issue that explicitly authorizes it.
- Do not expose client data without RLS policies and tests.
- UI hiding is not security.
- Do not add service-role keys to browser or client code.
- Do not add API keys, passwords, connection strings, real client data, or PHI.
- Do not make documents client-visible without release workflow.
- Do not allow messages or chat to change approved scope.
- Do not create scope, sampling, cap, agreement, finance, or authorization logic without approved specs and tests.
- Do not remove or weaken audit requirements.
- Do not change professional-boundary language without a ticket.
- Do not work outside the active issue.
- Do not change files outside the allowed file list.
- Do not treat founder-decision items as final unless the repository explicitly says they are final.

## Required Workflow

1. Select one GitHub issue.
2. Confirm issue body, branch, allowed files, tests, and prohibitions.
3. Move the board card to `In Agent Work`.
4. Switch GitHub Desktop to `main`.
5. Fetch and pull.
6. Create the exact issue branch.
7. Edit only allowed files.
8. Run required tests.
9. Review GitHub Desktop changed files.
10. Commit with the required summary.
11. Push/publish.
12. Open the PR.
13. Use the required PR title and body.
14. Review the GitHub Files changed tab.
15. Merge only after the diff and tests pass.
16. Move the board card to `Done`.
17. Confirm the issue closes.
18. Switch GitHub Desktop back to `main`.
19. Fetch and pull.
20. Delete the local branch.
21. Confirm a clean working tree.

## Required Output For Every Task

Every agent/tool task must provide:

- Summary
- Files changed
- Database changes
- RLS changes
- Tests added or updated
- Tests run
- Test results
- Assumptions
- Risks
- Founder decisions needed
- Documentation updated
- Next recommended ticket

## Stop Conditions

Stop unless the active issue explicitly authorizes the work when a task requires:

- New migration or schema files
- SQL execution
- Supabase project connection
- RLS policy changes
- Auth provider setup
- Storage bucket creation
- Document release logic
- Scope-change logic
- Sampling authorization logic
- Agreement/signature logic
- Finance/cap logic
- Professional/legal boundary decisions
- Production deployment
- Real client data
- PHI-capable workflows
- Claude Code implementation edits
- Codex implementation edits