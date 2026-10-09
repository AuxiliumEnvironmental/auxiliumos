# AuxiliumOS

AuxiliumOS is a modular operating suite with one canonical data spine for client intake, account and facility management, project coordination, scope control, authorization, document control, reporting, and auditability for Auxilium Environmental.

## Current Stage

Dev-Only Foundation Schema Migration Preparation.

The repo currently contains:

- Durable control and handoff documents
- Canonical data spine and module map
- Initial permission and document-access specifications
- Request and document workflows
- Static app shell
- Playwright static-shell baseline
- Foundation schema design packet
- Schema implementation readiness gate
- Minimum dev-schema blocker decisions
- Foundation migration control packet

No Supabase migration has been created or applied yet.

## Current Next Work

Create the issue:

`Initial dev-only foundation schema migrations`

That future issue must explicitly authorize exact migration, seed, documentation, and test files.

The migration must remain:

- Dev-only
- Fake/demo-data-only
- No PHI
- No secrets
- No cloud Supabase connection
- No auth provider setup
- No storage buckets
- No RLS policies
- No production
- No app/database connection

## Source of Truth

The GitHub repository is the source of truth.

ChatGPT, Cursor, Lovable, Claude Code, Codex, GitHub Copilot, and future AI agents are workers.

## Start Here

Read in this order:

1. `AGENTS.md`
2. `docs/00-control/CURRENT_HANDOFF.md`
3. `docs/00-control/TRANSITION_PROTOCOL.md`
4. `docs/00-control/PROJECT_STATE.md`
5. `docs/00-control/NEXT_ACTIONS.md`
6. `docs/01-product/END_STATE_BLUEPRINT.md`
7. `docs/01-product/DATA_SPINE.md`
8. The active GitHub issue

## Canonical Data Spine

Client Account -> Program/MSA -> Portfolio -> Asset/Facility -> Zone/Area -> Incident -> Project Request -> Scope Record -> Authorization -> Project -> Tasks/Work Orders -> Deliverables -> Documents -> Communications -> Financial Records -> Reports/Dashboards -> Audit Events.

## Current Static App

Static files:

- `app/index.html`
- `app/styles.css`
- `app/app.js`

The app is a prototype shell only.

It has no backend, auth, storage, RLS, production behavior, real client data, or PHI.

## Current Tests

Playwright baseline:

- `tests/e2e/static-app-shell.spec.ts`

Run from the repo root:

```text
npm test