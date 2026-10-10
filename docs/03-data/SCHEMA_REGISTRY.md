# Current development readback, 2026-10-10 UTC

The current S00 readback supersedes dated observations below. Existing `auxiliumos-dev` (`txofqxictwecgcnvezlb`) has fourteen applied migrations through `20261009194030_document_release_content.sql`; every stored statement SHA-256 matches the canonical file. PostgreSQL reports `17.6.1.127`. Active JWT-verified functions are `private-objects` v3, `document-version-content` v4 and `document-release-content` v1. The two released-content Edge source files match canonical source exactly.

The private `os-private-ingest` bucket remains limited to `text/plain`, 65,536 bytes. Source defaults leave released-content transport disabled; runtime secret settings were not inspected. These are source/deployment observations, not authentic Auth, recipient-byte retrieval or full release acceptance. No migration was reapplied, no fixture or privilege was created, and Moldo was untouched. Exact readback: [S00 evidence](../00-control/evidence/integration-reconciliation-2026-10-10.json).

# Current development readback, 2026-10-09

This current section supersedes the dated preparation observations below. Existing `auxiliumos-dev` (`txofqxictwecgcnvezlb`) has ten applied migrations through `20261009130331_owner_onboarding_activation.sql`, plus JWT-protected `private-objects` v2 and `document-version-content` v3. No Moldo backend changed. Original foundation/seed bytes remain preserved.

The tenth migration adds only service-executable initial owner activation, with fixed scoped development access and immutable provenance. No professional authority is granted. See [owner onboarding contract](OWNER_ONBOARDING.md) and [actual preparation receipt](../00-control/evidence/development-owner-preparation.json). Auth users and Storage buckets remain zero at this readback; both synthetic operational gates are disabled. A separate synthetic logical document/facility/account was actually provisioned for the connected browser test at initial document revision0. No hosted sign-in, upload or retrieval is certified.

The older sections below record historical stages; statements that no cloud application occurred are not current deployment facts.

> Current observation 2026-10-09: four unchanged reviewed migrations (foundation, directory, audit, reservations) are applied to existing auxiliumos-dev (`txofqxictwecgcnvezlb`), PostgreSQL17. Exact migration-source/history readback and all11 application tables with RLS are recorded in [deployment evidence](../00-control/evidence/development-migrations.json). Auth users/buckets remain zero; reservation configuration remains disabled. New intake/transport source is independently reviewed but its deployment is tracked separately. Schema deployment does not establish authentic Auth/API or full application acceptance. Older preparation restrictions below are historical; AGENTS.md governs synthetic development.

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

# Historical Supabase Environment Status

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

# Historical schema status before runtime integration

Current schema status:
The seven-table foundation schema exists as a repository SQL artifact. Application to any database is unverified in this review.

Current migration status:
supabase/migrations/20260713000100_foundation_slice_schema.sql exists, recorded under Issue #80. Do not recreate it.

Current RLS status:
The migration enables RLS on seven tables but defines no RLS policies. Runtime denial behavior is unverified.

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


---

# Foundation Migration Control Packet

Added: 2026-07-12 
Source issue: #74 — Foundation migration control packet

## Status

Migration control packet created.

Migrations status:

Not yet authorized.

## Packet File

`docs/03-data/FOUNDATION_MIGRATION_CONTROL_PACKET.md`

## Future Migration Candidate Scope

Candidate tables for a future dev-only migration issue:

- `client_accounts`
- `user_profiles`
- `account_memberships`
- `facilities`
- `incident_requests`
- `documents`
- `audit_events`

## Current Limitation

No migrations have been created.

No Supabase tables have been created.

No auth, storage, RLS, production, real client data, PHI, or secrets are authorized by this packet.

---

# Initial Dev-Only Foundation Migration

Added: 2026-07-13  
Source issue: #80 — Initial dev-only foundation schema migrations

## Status

Migration artifact created.

Database application status:

Not applied by this issue.

## Migration File

`supabase/migrations/20260713000100_foundation_slice_schema.sql`

## Seed File

`supabase/seed/foundation_demo_seed.sql`

## Tables Defined

- `client_accounts`
- `user_profiles`
- `account_memberships`
- `facilities`
- `incident_requests`
- `documents`
- `audit_events`

## Security Posture

- RLS enabled on all seven tables.
- No RLS policies created.
- No RLS helper functions created.
- No app connection authorized.
- No auth provider configured.
- No storage bucket created.
- No cloud project connected.

## Data Posture

- Fake/demo seed data only.
- No PHI.
- No real client data.
- No credentials or secrets.

## Next Requirements

Before any database application or app connection:

- Complete foundation RLS design packet.
- Complete foundation RLS denial-test specification.
- Complete dev auth identity-linkage design packet.
- Complete document storage readiness and deferral packet.
- Complete local Supabase tooling readiness check.


# Identity and directory development increment

Added: 2026-10-08. Task: SEC-001A; architecture: ADR-002. Initial GitHub write failures were resolved after app installation. The recovered increment is saved in [draft PR #84](https://github.com/AuxiliumEnvironmental/auxiliumos/pull/84), with remote source-tree verification in SOURCE_RECONCILIATION.json.

The original `20260713000100_foundation_slice_schema.sql` and `supabase/seed/foundation_demo_seed.sql` are unchanged. New CLI-generated artifact: `20261008120645_identity_access_directory.sql`. Application to the existing cloud backend is **not performed**.

The additive migration creates `account_access` and `account_capability_grants`; adds suspended-by-default identity status, immutable link history and the Auth FK; conservatively backfills lifecycle rows; and installs private authorization helpers, exact column privileges and three directory SELECT policies. Legacy roles alone grant no access. Only active demo identities, active account membership and explicit capability/scope grants can read. All client mutations, Auth-link history, authorization tables and other business tables stay unavailable. No bucket, document-release or audit-provenance implementation is implied.

The independent review resolved an unlink/relink inheritance gap and recorded exact source hashes in [SEC-001A review](../00-control/reviews/SEC-001A-2026-10-08.json). The `directory-database` profile runs the actual migrations in PGlite with mocked Auth functions and simulated subjects. It covers positive and negative reads, independent status/grant revocation, column ACLs, trusted link guards, seed ordering and rollback. Genuine Auth/Data API and real-service browser acceptance remain unexecuted.

Before cloud application, re-inspect the target, preserve migration identity/history, apply the existing foundation exactly once followed by the additive artifact, and record the resulting migration versions/checksums. The available migration connector has no explicit version argument; do not rename/recreate the foundation or blindly run a duplicate CLI migration to repair a mismatch. Select a reviewed application path when secure tooling is configured. Never reset a populated backend to make tests pass.

## Protected access-change audit increment

Added: 2026-10-08. Task: SEC-001C-AUDIT, [issue #85](https://github.com/AuxiliumEnvironmental/auxiliumos/issues/85). CLI-generated migration `20261008154950_access_audit_provenance.sql` extends the existing audit table after the directory migration; the original foundation and seed remain unchanged.

The migration records allowlisted profile/access/capability changes with server actor/time/correlation provenance, preserves legacy history and existing foreign keys, and denies client audit mutation and source truncation. It adds no client mutation endpoint, file access, denied-attempt collector or human approval authority. See [implementation and boundaries](ACCESS_AUDIT_IMPLEMENTATION.md) and [independent review](../00-control/reviews/SEC-001C-AUDIT-2026-10-08.json).

Integrated PostgreSQL 18.3/PGlite checks passed: 30 audit checks and all 19 directory regressions, now exercised after migration three except the intentional pre-directory failure case. These use simulated Auth context, not genuine Auth/API or the observed PostgreSQL 17 cloud target. No cloud migration was applied. Audited synthetic account/profile records are preserved; API fixture cleanup must disable access without deleting their history. Actual target migration/owner/role/advisor checks and authentic API acceptance remain gates.
