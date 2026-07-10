# Schema Registry

## Purpose

This file records Supabase/Postgres schema planning and schema change history for AuxiliumOS.

No production schema changes should exist without:

- GitHub issue
- Approved spec
- Migration file
- RLS plan where applicable
- Test plan
- Documentation update
- Pull request review

---

# Current Supabase Environment Status

## Development Project

Project name:
auxiliumos-dev

Status:
Created

Purpose:
Development and future testing only.

Allowed current use:
- Project shell
- Future schema planning
- Future migration testing
- Future auth/storage/RLS experimentation using fake data only

Disallowed current use:
- Real client data
- PHI
- Production data
- Production app traffic
- Unreviewed table creation
- Unreviewed storage buckets
- Unreviewed auth provider setup
- Unreviewed RLS policies
- Lovable production connection
- GitHub auto-deployment/integration

## Staging Project

Status:
Not created

## Production Project

Status:
Not created

---

# Schema Status

Current schema status:
No application schema has been created yet.

Current migration status:
No AuxiliumOS application migrations have been created yet.

Current RLS status:
No AuxiliumOS RLS policies have been created yet.

Current storage status:
No AuxiliumOS storage buckets have been created yet.

Current auth status:
No AuxiliumOS auth provider configuration has been finalized yet.

Current GitHub/Supabase integration status:
Not connected.

Current Lovable/Supabase integration status:
Not connected.

---

# RLS Position

RLS should be enabled by default for future exposed client-data tables.

RLS enabled without policies is acceptable during secure development because it prevents API access until policies are intentionally created.

Broad public read/write policies are not acceptable.

---

# Next Required Schema Work Before Tables

Before creating client-data tables, the following must be drafted or approved:

- ROLE_PERMISSION_MATRIX.md
- DOCUMENT_ACCESS_MATRIX.md
- DATA_SPINE.md
- MODULE_MAP.md
- First vertical slice spec
- RLS test matrix
- Document release workflow
- Project request state machine
- No-PHI policy

---

# Non-Negotiable Schema Rules

- No client-data table without RLS plan.
- No production schema changes from the Supabase dashboard alone.
- No service-role or secret keys in browser/client code.
- No secrets in GitHub.
- No real client data during prep.
- No PHI during v1 setup.
- No document storage buckets before document access rules exist.
- No auth provider setup before role/onboarding flow is defined.
- No Lovable/Supabase connection before schema and RLS planning is approved.
- No GitHub/Supabase integration before migration workflow is approved.

---

# Foundation Schema Design Packet

Added: 2026-07-08  
Source issue: #66 — Supabase schema design packet for foundation slice

## Status

Foundation schema design packet created.

Implementation status:

Not implementation-approved.

No Supabase migrations have been created.

No application tables have been created.

No auth providers have been configured.

No storage buckets have been created.

No RLS policies have been created.

## Candidate Concepts Documented

See:

`docs/03-data/FOUNDATION_SCHEMA_DESIGN_PACKET.md`

Candidate concepts documented:

- `client_accounts`
- `user_profiles`
- `account_memberships`
- `facilities`
- `incident_requests`
- `documents`
- `audit_events`

Derived surfaces documented:

- Admin Queue
- Document Release Queue
- Client View
- Reports/Dashboards

## Next Required Step Before Migrations

Create and complete:

Schema implementation readiness gate for foundation slice

That gate must determine whether unresolved founder/security decisions block migrations.

---

# Schema Implementation Readiness Gate

Added: 2026-07-08  
Source issue: #68 — Schema implementation readiness gate for foundation slice

## Readiness Result

Blocked for migrations.

## Reason

The foundation schema design packet exists, but minimum founder/security decisions remain unresolved.

## Required Before Migration Issue

- Account membership model
- Minimum role authority
- Document grant model
- Document release authority
- Audit visibility
- Auth provider strategy or safe dev-only assumption
- Storage deferral or storage design packet
- RLS helper strategy
- No-PHI confirmation
- Fake/demo seed data confirmation

No migration issue should be worked until these blockers are resolved, deferred, or explicitly scoped around in the repo.


---

# Minimum Schema Blocker Decisions

Added: 2026-07-10  
Source issue: #72 — Minimum schema blocker decisions for foundation slice

## Status

Minimum founder/security decision checkpoint completed for dev-schema planning only.

## Result

Ready to create a migration control packet.

Still blocked for actual migrations.

## Decision File

`docs/03-data/MINIMUM_SCHEMA_BLOCKER_DECISIONS.md`

## Important Limitation

This update does not authorize:

- Supabase migrations
- Supabase tables
- Auth setup
- Storage buckets
- RLS policies
- Edge functions
- Production setup
- Real client data
- PHI
- Secrets