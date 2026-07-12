# Foundation Migration Control Packet

Last updated: 2026-07-12

Issue: #74 — Foundation migration control packet

## Status

Documentation / migration planning control only.

This document does not authorize Supabase migrations, schema creation, tables, auth providers, storage buckets, RLS policies, edge functions, production deployment, real client data, PHI, secrets, Claude Code implementation edits, Codex implementation edits, or final business authority decisions.

## Purpose

This packet defines what a future dev-only foundation migration issue must contain before any Supabase migration files are created.

It converts the schema design and minimum blocker decisions into a controlled checklist for a future migration issue.

## Source-of-Truth Rule

GitHub is the source of truth.

AI tools are workers.

One issue controls one branch and one controlled change.

## Required Prior Docs

A future migration issue must read and comply with:

- `docs/03-data/FOUNDATION_SCHEMA_DESIGN_PACKET.md`
- `docs/03-data/SCHEMA_IMPLEMENTATION_READINESS_GATE.md`
- `docs/03-data/MINIMUM_SCHEMA_BLOCKER_DECISIONS.md`
- `docs/03-data/SCHEMA_REGISTRY.md`
- `docs/03-data/TABLE_OWNERSHIP.md`
- `docs/03-data/RELATIONSHIP_MAP.md`
- `docs/03-data/FIELD_DICTIONARY.md`
- `docs/03-data/SEED_DATA_REGISTRY.md`
- `docs/04-security/RLS_POLICY_MATRIX.md`
- `docs/04-security/SECURITY_GUARDRAILS.md`
- `docs/05-workflows/DOCUMENT_RELEASE_WORKFLOW.md`

## Future Migration Issue Title

Recommended future issue title:

Initial dev-only foundation schema migrations

## Future Migration Branch

Recommended future branch:

`schema/dev-foundation-slice-migrations`

## Future Migration Allowed Files

The future migration issue should allow only specifically named migration/seed files.

Recommended future allowed files:

- `supabase/migrations/[TIMESTAMP]_foundation_slice_schema.sql`
- `supabase/seed/foundation_demo_seed.sql`
- `docs/03-data/SCHEMA_REGISTRY.md`

The future issue must use a real timestamp in the migration filename.

No other files should be allowed unless the future issue explicitly lists them.

## Future Migration Candidate Tables

A future migration issue may propose dev-only versions of:

- `client_accounts`
- `user_profiles`
- `account_memberships`
- `facilities`
- `incident_requests`
- `documents`
- `audit_events`

These remain candidates until the migration issue explicitly defines exact SQL.

## Future Migration Excluded Tables

The future migration issue must not include:

- Programs/MSA tables
- Portfolio tables
- Zone/Area tables
- Scope Record tables
- Authorization tables
- Project tables
- Tasks/Work Orders tables
- Deliverables tables
- Communications tables
- Financial Records tables
- Reports/Dashboard tables
- Vendor tables
- Sampling tables
- Agreement/signature tables
- ROM/cap/finance tables

unless a future issue explicitly authorizes them.

## Future Migration Required Stances

A future migration issue must preserve:

- Dev-only environment.
- Fake/demo seed data only.
- No PHI.
- No real client data.
- No secrets.
- No production setup.
- No auth provider setup.
- No storage buckets.
- No RLS policies unless the future issue explicitly includes them.
- No service-role keys.
- No broad public access.

## Future Migration RLS Posture

Recommended posture for future migration issue:

- Create tables in a way that can support future RLS.
- Do not expose client-data tables publicly.
- Do not create broad permissive policies.
- Do not rely on UI hiding for security.
- If RLS is not implemented in the future migration issue, the issue must state that app connection remains blocked until RLS policies and tests exist.

## Future Migration Test Expectations

A future migration issue must include at least one of the following:

- Migration application proof if Supabase/local tooling is available.
- SQL review checklist if local tooling is not available.
- Manual verification that migration files contain no secrets or real data.

Future RLS tests are not required in the migration issue unless that issue explicitly authorizes RLS.

## Future Seed Data Rules

Future seed data must be fake/demo only.

Allowed examples:

- Demo Property Group
- North Wing Facility
- Water Intrusion Demo
- Document Placeholder 001
- Auxilium Admin Demo
- Client Viewer Demo
- Request Submitted placeholder event
- Document Released placeholder event

Disallowed:

- Real client names
- Real addresses
- Real contacts
- Real documents
- Real project data
- PHI
- API keys
- Service-role keys
- Passwords
- Secrets

## Review Requirements Before Future Migration Merge

A future migration PR must confirm:

- Exact allowed files only.
- No app files changed.
- No package files changed.
- No test files changed unless explicitly authorized.
- No secrets.
- No PHI.
- No real client data.
- No production connection.
- No auth/storage/RLS unless explicitly authorized.
- Candidate tables match this packet or explain the difference.

## Current Conclusion

This packet prepares the project for a future migration issue.

It does not authorize migrations.

The next safe sprint-level step after this packet is a bulk control doc update.