# Next Actions

Last updated: 2026-07-05

## Current Phase

First Build Implementation Planning

## Current Goal

Move from the completed Lovable visual UI shell into controlled first build planning without starting app code, Supabase schema, auth, storage, RLS, Playwright, Claude Code implementation edits, Codex implementation edits, production setup, real client data, or PHI-capable workflows.

## Source-of-Truth Rule

The GitHub repository is the source of truth.

AI tools are workers.

Anything not captured in the repository does not count.

One issue controls one branch and one controlled change.

## Canonical Data Spine

Client Account -> Program/MSA -> Portfolio -> Asset/Facility -> Zone/Area -> Incident -> Project Request -> Scope Record -> Authorization -> Project -> Tasks/Work Orders -> Deliverables -> Documents -> Communications -> Financial Records -> Reports/Dashboards -> Audit Events.

## Completed Immediate Work

Completed and manually verified:

- Issue #52 — Create Lovable visual UI shell v1

Completed by this planning update:

- Issue #54 — First build implementation plan
- `docs/00-control/FIRST_BUILD_IMPLEMENTATION_PLAN.md`
- Updated `PROJECT_STATE.md`
- Updated `CURRENT_HANDOFF.md`
- Updated `NEXT_ACTIONS.md`

- Issue #56 — Founder decision checkpoint for first build blockers

- Issue #58 — Foundation vertical slice build-control packet

- #60 — Static app shell scaffold and route placeholders
- #62 — App test harness and Playwright baseline
- #64 — Correct issue-number references and bulk control doc update after static shell baseline

## Current Approved Planning Output

Current planning document:

`docs/00-control/FIRST_BUILD_IMPLEMENTATION_PLAN.md`

Purpose:

Define the first build issue sequence and identify which future issue may first authorize app code, Supabase schema, auth, storage, RLS, Playwright installation, Claude Code implementation edits, and Codex implementation edits.

## Immediate Next Issue To Create

Create GitHub issue:

Supabase schema design packet for foundation slice

Recommended board status after creation:

Ready for Spec

Task type:

Documentation / data planning only.

Purpose:

Document the first-slice schema design before creating migrations.

This next issue may discuss proposed data domains and table concepts, but it must not create migrations, tables, Supabase schema, auth, storage, RLS policies, edge functions, production setup, real client data, PHI, or secrets.

Required emphasis:

- Map proposed records to the canonical data spine.
- Identify founder/security/legal/professional blockers.
- Identify table ownership by module.
- Identify RLS/test requirements.
- Identify seed data requirements.
- Identify audit-event expectations.
- Preserve all unresolved decisions as Draft / Founder review required / Not implementation-approved.

## Recommended Labels For Next Issue

- `type:feature`
- `type:ui`
- `module:ai`
- `module:security`
- `risk:permission`
- `risk:document-release`
- `risk:client-data`
- `ready-for-agent`

Do not add implementation labels that imply app code, schema, auth, storage, or RLS is authorized.

## Next Issue Must Decide Or Preserve As Open

The next issue should review the following blockers:

- Final role authority
- Final client-side roles and internal roles
- Document release authority
- Document grant model
- Scope approval authority
- Cap/change authorization authority
- Emergency conditional authorization authority
- Emergency authorization thresholds
- No-PHI exceptions
- Professional/legal boundaries
- Client Executive visibility boundaries
- Site Champion visibility boundaries
- Billing Contact access boundaries
- Vendor User inclusion in v1
- Account membership model
- Billing visibility model
- Audit event visibility
- Auth provider strategy
- Storage bucket design
- Supabase schema design
- Production readiness
- Real client data onboarding
- Whether any PHI-capable workflow will ever be supported

If unresolved, mark the item as:

Decision Status: Draft / Founder review required / Not implementation-approved.

## First Build Issue Sequence

After the founder decision checkpoint, follow the sequence in:

`docs/00-control/FIRST_BUILD_IMPLEMENTATION_PLAN.md`

Summary:

1. Founder decision checkpoint for first build blockers
2. Foundation vertical slice build-control packet
3. Static app shell scaffold and route placeholders
4. App test harness and Playwright baseline
5. Supabase schema design packet for foundation slice
6. Initial Supabase schema migrations for foundation slice
7. Development auth setup and test identities
8. RLS policies and permission-denial tests for foundation slice
9. Development storage buckets and document metadata staging
10. Foundation incident request and admin queue implementation
11. Foundation document release and client view implementation
12. Foundation audit, backup, and handoff proof

Each future issue must have its own issue body, branch name, allowed file list, tool authorization, acceptance criteria, tests, and out-of-scope rules.

## First Authorization Gates

First issue that may touch app code:

First issue that touched app code:

#60 — Static app shell scaffold and route placeholders

First issue that authorized Playwright installation:

#62 — App test harness and Playwright baseline

First future issue that may authorize Supabase schema creation:

Not yet authorized. Schema design must happen first.

First future issue that may authorize auth setup:

Not yet authorized.

First future issue that may authorize RLS policies:

Not yet authorized.

First future issue that may authorize storage buckets:

Not yet authorized.

First future issue that may authorize Claude Code or Codex implementation edits:

Not yet authorized.

## Still Draft / Founder Review Required

The following are not final implementation decisions:

- Role authority
- Document release authority
- Scope approval authority
- Cap/change authorization authority
- No-PHI exceptions
- Emergency authorization thresholds
- RLS helper design
- Auth provider strategy
- Storage bucket design
- Supabase schema design
- Production readiness
- Real client data onboarding
- PHI-capable workflow policy

These must remain draft until founder/legal/security/professional review is complete.

## Do Not Start Yet

Do not start these yet:

- Full Lovable backend app build
- App implementation beyond future issue authorization
- Supabase schema
- Supabase production project
- Supabase storage buckets
- Auth providers
- RLS policy creation
- Edge functions
- Claude Code implementation edits
- Codex implementation edits
- Playwright installation
- GitHub Actions real CI
- Real client data
- Real PHI or healthcare patient data
- Production deployment
- Real document release logic
- Real scope logic
- Real agreement/signature logic
- Real finance/cap logic

## Immediate Operating Instruction

Next session should create the issue:

Founder decision checkpoint for first build blockers

Do not provide implementation steps for app code, Supabase schema, auth, storage, RLS, Playwright, Claude Code, Codex, production, real client data, or PHI until the relevant future issue explicitly authorizes that work.