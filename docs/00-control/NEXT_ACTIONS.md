# Next Actions

Last updated: 2026-06-24

## Current Phase

Spec Gate Passed / Visual First Build Preparation

## Current Goal

Begin the first controlled visual-only AuxiliumOS build step while preserving the repository-first workflow and all security, document-control, scope-control, and no-PHI guardrails.

---

# Current Source-of-Truth Rule

The GitHub repository is the source of truth.

AI tools are workers.

Anything not captured in the repository does not count.

---

# Current Approved Next Issue

Next issue to create/work:

Create Lovable visual UI shell v1

Purpose:
Create a visual-only UI shell for AuxiliumOS using Lovable.

Allowed:
- UI shell only
- Professional enterprise layout
- Navigation placeholders
- Client portal concept
- Admin command center concept
- Enterprise facility portal concept
- Status cards
- Empty states
- Fake/demo data only

Not allowed:
- Supabase schema
- Supabase storage
- Auth providers
- RLS policies
- Production backend
- Real document release logic
- Real scope logic
- Real agreement logic
- Real finance logic
- Real client data
- PHI
- Service-role keys
- API keys
- Production deployment

---

# Completed Gate Items

The following are complete and merged:

- [x] PROJECT_STATE.md v1
- [x] DECISION_LOG.md v1
- [x] OPEN_QUESTIONS.md v1
- [x] DATA_SPINE.md v1
- [x] MODULE_MAP.md v1
- [x] AI_TOOL_RULES.md and PROMPT_LIBRARY.md
- [x] Repo foundation review
- [x] ROLE_PERMISSION_MATRIX.md v1
- [x] DOCUMENT_ACCESS_MATRIX.md v1
- [x] V1_SCOPE.md and UAT_SCENARIOS.md
- [x] RLS_POLICY_MATRIX.md and RLS_TEST_PLAN.md
- [x] DOCUMENT_RELEASE_WORKFLOW.md
- [x] REQUEST_STATE_MACHINE.md
- [x] EMERGENCY_EXCEPTION_WORKFLOW.md
- [x] CHANGE_AUTHORIZATION_WORKFLOW.md
- [x] PLAYWRIGHT_TEST_PLAN.md
- [x] No-PHI policy in SECURITY_GUARDRAILS.md and OUT_OF_SCOPE.md
- [x] SPEC_GATE_REVIEW.md

---

# Still Draft / Founder Review Required

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

These must remain draft until founder/legal/security review is complete.

---

# Do Not Start Yet

Do not start these yet:

- Full Lovable app build
- Supabase schema
- Supabase production project
- Supabase storage buckets
- Auth providers
- RLS policy creation
- Claude Code implementation edits
- Codex implementation edits
- Playwright installation
- GitHub Actions real CI
- Real client data
- Real PHI or healthcare patient data
- Production deployment

---

# Immediate Next Step

After this issue is merged:

1. Create GitHub issue: Create Lovable visual UI shell v1.
2. Move that issue to Ready for Build.
3. Use Lovable only for visual shell work.
4. Do not connect Supabase.
5. Do not create backend/schema/auth/storage/RLS.
6. Do not use real client data or PHI.

---

# Next Phase After Visual Shell

After the visual shell is reviewed, create a separate issue for:

First build implementation plan

That future issue should define exactly when and how Supabase schema work begins.

Do not begin schema work until that issue exists and is approved.