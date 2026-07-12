# Project State

Last updated: 2026-07-13

## Current Phase

Dev-Only Foundation Schema Migration Preparation

## Source of Truth

The GitHub repository is the source of truth.

AI tools are workers.

Anything not recorded in the repository does not count.

## Canonical Data Spine

Client Account -> Program/MSA -> Portfolio -> Asset/Facility -> Zone/Area -> Incident -> Project Request -> Scope Record -> Authorization -> Project -> Tasks/Work Orders -> Deliverables -> Documents -> Communications -> Financial Records -> Reports/Dashboards -> Audit Events.

## Current Status

The project has completed the visual shell, static app shell, Playwright baseline, foundation schema design, schema readiness review, minimum dev-schema decisions, and migration control packet.

The founder has chosen to proceed toward a dev-only foundation migration issue.

No migration file or application table exists yet.

## Completed Issues

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

## Static App Status

Files:

- `app/index.html`
- `app/styles.css`
- `app/app.js`

Scope:

Static prototype only.

No backend, auth, storage, RLS, cloud Supabase connection, production, real client data, or PHI.

## Test Status

Playwright baseline:

- `tests/e2e/static-app-shell.spec.ts`

Package files:

- `package.json`
- `package-lock.json`
- `playwright.config.ts`

The current static-shell baseline contains three browser tests.

## Data Planning Status

Completed:

- Foundation schema design packet
- Schema readiness gate
- Minimum schema blocker decisions
- Foundation migration control packet
- Schema registry
- Table ownership map
- Relationship map
- Field dictionary
- Seed data registry

## Approved Initial Migration Candidate Tables

- `client_accounts`
- `user_profiles`
- `account_memberships`
- `facilities`
- `incident_requests`
- `documents`
- `audit_events`

## Current Supabase State

- Development project documented as `auxiliumos-dev`
- Repo not connected to a Supabase project
- No migration files
- No application tables
- No auth providers
- No storage buckets
- No RLS policies
- No edge functions
- No cloud integration
- No production project
- No real client data
- No PHI
- No secrets

## Current Migration Authorization Boundary

A future active issue may authorize:

- One exact dev-only migration file
- One exact fake/demo seed file
- One schema-registry update
- One migration contract test
- One package script update
- RLS enablement on the seven tables

That issue must not authorize:

- RLS policies
- Auth
- Storage
- Cloud connection
- Migration application
- App connection
- Production
- Real client data
- PHI
- Secrets

## Current Security Posture

- UI hiding is not security.
- No client-data table may be exposed without RLS policies and tests.
- Documents remain internal by default.
- No client-visible document without release workflow.
- Messages cannot change approved scope.
- Audit events remain internal-only for current planning.
- Storage remains deferred.
- Auth remains deferred.
- RLS helper design remains deferred.

## Open Or Deferred Decisions

- Final production role authority
- Full document-grant model
- Final document release authority
- Client-visible audit policy
- Final auth provider
- Storage bucket architecture
- RLS helper design
- Production readiness
- Real client-data onboarding
- PHI-capable workflow policy

## Current Next Action

Create GitHub issue:

`Initial dev-only foundation schema migrations`

Recommended board status:

`Ready for Build`

The issue must explicitly define:

- Exact branch
- Exact migration filename
- Exact seed filename
- Exact allowed files
- Exact table list
- Exact constraints
- Exact tests
- Fake/demo-only data
- No PHI
- No secrets
- No auth
- No storage
- No RLS policies
- No cloud connection
- No migration application

## Do Not Start Yet

- Cloud Supabase connection
- Local migration application
- Auth provider setup
- Storage bucket creation
- RLS policy creation
- Edge functions
- App/database connection
- Production
- Real client data
- PHI
- Claude Code implementation edits
- Codex implementation edits