---

# Supabase Dev Project Status

Status:
Created

Project name:
auxiliumos-dev

Environment:
Development only

Production status:
Not created

Staging status:
Not created

Important security note:
No Supabase URL, publishable key, anon key, secret key, service-role key, database password, JWT secret, connection string, or API credential is stored in this repository.

Current Supabase limitations:
- No production client data
- No real client data
- No PHI
- No schema migrations yet
- No storage buckets yet
- No auth providers enabled yet
- No RLS policies yet
- No Lovable/Supabase connection yet
- No GitHub/Supabase integration yet

RLS posture:
RLS should be enabled by default for any future exposed client-data table, but no application tables or policies have been created yet.

Next Supabase work requires:
- Role permission matrix
- Document access matrix
- First vertical slice spec
- RLS test matrix
- Document release workflow
- No-PHI policy
- Schema plan
- Approved GitHub issue
---

# Spec Gate Review Status

Date:
2026-06-22

Status:
Passed for visual-only first build preparation.

Completed:
- Role permission matrix draft
- Document access matrix draft
- First vertical slice spec
- UAT scenarios
- RLS policy matrix
- RLS test plan
- Document release workflow
- Project request state machine
- Emergency exception workflow
- Change authorization workflow
- Playwright UAT plan
- No-PHI policy
- Spec gate review

Next approved issue:
Create Lovable visual UI shell v1

Current limitations:
- Visual shell only
- Fake/demo data only
- No Supabase schema
- No Supabase storage
- No auth providers
- No RLS policies
- No production
- No real client data
- No PHI
- No full backend workflows
- No Claude Code implementation edits
- No Codex implementation edits
- No Playwright install yet

Important note:
This gate does not finalize founder-decision items. Role authority, document release authority, scope approval, cap/change authorization, no-PHI exceptions, production readiness, and real client data onboarding remain draft/founder-review-required until separately approved.