# Next Actions

Last updated: 2026-07-13

## Current Phase

Dev-Only Foundation Schema Migration Preparation

## Current Goal

Create the first controlled dev-only foundation migration artifact after repairing the current source-of-truth entrypoints.

The migration must remain disconnected from cloud Supabase and must not configure auth, storage, RLS policies, production, real client data, PHI, or secrets.

## Source-of-Truth Rule

The GitHub repository is the source of truth.

AI tools are workers.

One issue controls one branch and one controlled change.

## Canonical Data Spine

Client Account -> Program/MSA -> Portfolio -> Asset/Facility -> Zone/Area -> Incident -> Project Request -> Scope Record -> Authorization -> Project -> Tasks/Work Orders -> Deliverables -> Documents -> Communications -> Financial Records -> Reports/Dashboards -> Audit Events.

## Completed Issue Chain

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

## Current Approved Planning Files

- `docs/03-data/FOUNDATION_SCHEMA_DESIGN_PACKET.md`
- `docs/03-data/SCHEMA_IMPLEMENTATION_READINESS_GATE.md`
- `docs/03-data/MINIMUM_SCHEMA_BLOCKER_DECISIONS.md`
- `docs/03-data/FOUNDATION_MIGRATION_CONTROL_PACKET.md`
- `docs/03-data/SCHEMA_REGISTRY.md`
- `docs/03-data/TABLE_OWNERSHIP.md`
- `docs/03-data/RELATIONSHIP_MAP.md`
- `docs/03-data/FIELD_DICTIONARY.md`
- `docs/03-data/SEED_DATA_REGISTRY.md`

## Immediate Next Issue To Create

Create:

`Initial dev-only foundation schema migrations`

Recommended board status:

`Ready for Build`

Purpose:

Create one dev-only migration SQL file, one fake/demo seed SQL file, one schema-registry entry, one static migration contract test, and one package script update.

The issue must explicitly identify every allowed file.

## Migration Candidate Tables

Only these candidate tables are permitted in the initial migration issue:

- `client_accounts`
- `user_profiles`
- `account_memberships`
- `facilities`
- `incident_requests`
- `documents`
- `audit_events`

## Migration Safety Stance

The migration issue may:

- Create only the seven approved tables.
- Enable RLS on all seven tables.
- Add fake/demo seed data.
- Add static migration contract tests.

The migration issue may not:

- Create RLS policies.
- Create RLS helper functions.
- Configure auth.
- Create storage buckets.
- Create edge functions.
- Connect the app.
- Connect a cloud Supabase project.
- Apply the migration.
- Use production.
- Use real client data.
- Use PHI.
- Add secrets.

## Following Sprint Sequence

After the migration artifact is merged:

1. Foundation RLS design packet
2. Foundation RLS denial-test specification
3. Dev auth identity-linkage design packet
4. Document storage readiness and deferral packet
5. Local Supabase tooling readiness check
6. Foundation data sprint bulk closeout

## Current Authorization Gates

### App code

Static app shell only is complete.

No backend app connection is authorized.

### Playwright

The static-shell Playwright baseline exists.

### Migration artifacts

The next exact issue may authorize one dev-only migration and one fake/demo seed file.

### Migration application

Not authorized until local tooling readiness is confirmed and a separate issue authorizes local-only commands.

### Auth

Not authorized.

### Storage

Not authorized.

### RLS policies

Not authorized.

RLS enablement in the migration may be authorized as a secure deny-by-default posture.

### Cloud Supabase

Not authorized.

### Production

Not authorized.

### Real client data

Not authorized.

### PHI

Not authorized.

### Claude Code and Codex implementation edits

Not authorized.

## Still Draft Or Deferred

- Final production account membership model
- Final role authority
- Full document grant model
- Final document release authority
- Client-visible audit policy
- Final auth provider
- Storage bucket design
- RLS helper design
- Production readiness
- Real client-data onboarding
- PHI-capable workflow policy

## Do Not Start Yet

- Cloud Supabase connection
- Migration application
- Auth provider setup
- Storage buckets
- RLS policies
- RLS helper functions
- Edge functions
- App/database connection
- Production setup
- Real client data
- PHI
- Real document release
- Real scope logic
- Agreement/signature logic
- Finance/cap logic