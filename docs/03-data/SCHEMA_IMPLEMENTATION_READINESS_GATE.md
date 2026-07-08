# Schema Implementation Readiness Gate — Foundation Slice

Last updated: 2026-07-06

Issue: #68 — Schema implementation readiness gate for foundation slice

## Status

Documentation / readiness gate only.

This document does not authorize Supabase migrations, schema creation, tables, auth providers, storage buckets, RLS policies, edge functions, production deployment, real client data, PHI, secrets, Claude Code implementation edits, Codex implementation edits, or final business authority decisions.

## Purpose

This readiness gate determines whether the foundation schema design is ready for a future migration issue.

It records blockers that must be resolved before database implementation can safely begin.

## Readiness Result

Current readiness result:

Blocked for migrations.

Reason:

The foundation schema design exists, but several founder/security decisions remain unresolved or not implementation-approved. A future migration issue should not be created until minimum blockers are answered or explicitly scoped around.

## Schema Design Source

Design packet:

`docs/03-data/FOUNDATION_SCHEMA_DESIGN_PACKET.md`

Candidate concepts:

- `client_accounts`
- `user_profiles`
- `account_memberships`
- `facilities`
- `incident_requests`
- `documents`
- `audit_events`

All concepts remain draft / not implementation-approved.

## Minimum Blockers Before Migration Issue

| Blocker | Current status | Why it blocks migrations | Required next action |
|---|---|---|---|
| Account membership model | Founder review required | RLS and user/account relationships depend on it. | Founder must approve or explicitly defer a minimum model. |
| Final role authority | Founder review required | Permissions and tests depend on role behavior. | Founder must approve minimum static roles for schema testing. |
| Document grant model | Founder review required | Document access may follow account, project/request, facility, explicit grants, or hybrid. | Founder/security review required. |
| Document release authority | Founder review required | Document release state and audit depend on who can release. | Founder/security/professional review required. |
| Audit event visibility | Founder review required | Determines whether audit events are internal-only or client-visible. | Founder/security review required. |
| Auth provider strategy | Not implementation-approved | Schema user linkage may depend on auth identity model. | Define dev-only auth assumptions before auth issue. |
| Storage bucket design | Not implementation-approved | Document metadata must eventually align to storage design. | Defer storage or define a future storage packet. |
| RLS helper design | Not implementation-approved | Migrations may need helper functions or membership checks. | Security design required before RLS implementation. |
| No-PHI posture | No PHI allowed | Schema must avoid PHI fields and healthcare patient data. | Preserve no-PHI default. |
| Real client data policy | Not allowed | Seed/test data must be fake only. | Preserve fake/demo seed data only. |

## Safe Minimum Path

The next safe issue is not a migration issue.

The next safe issue should be:

Minimum schema blocker decisions for foundation slice

That issue should ask the founder to approve or defer only the minimum decisions needed to create a safe dev-only schema later.

## Future Migration Issue Requirements

A future migration issue must include:

- Exact branch
- Exact allowed migration files
- Exact table list
- Exact fields
- Exact constraints
- Exact seed-data stance
- Explicit fake/demo data rule
- RLS posture
- Tests or documented test deferral
- No real client data
- No PHI
- No secrets
- Security review requirement

## Still Not Authorized

Do not start:

- Supabase migrations
- Supabase table creation
- Supabase storage buckets
- Auth provider setup
- RLS policies
- Edge functions
- Production setup
- Real client data
- PHI
- Service-role keys
- API keys
- Passwords
- Secrets

## Conclusion

Schema implementation is not ready.

A minimum founder/security decision issue is required before migrations.