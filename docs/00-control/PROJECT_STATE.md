# Project State

Last updated: 2026-06-24

## Current Phase

Spec Gate Passed / Visual First Build Preparation

## Source of Truth

The GitHub repository is the source of truth.

ChatGPT, Cursor, Lovable, Claude Code, Codex, GitHub Copilot, and all future AI agents are workers. If a decision, workflow, assumption, schema change, permission rule, document rule, or project status is not captured in the repository, it does not count.

## Canonical Data Spine

Client Account -> Program/MSA -> Portfolio -> Asset/Facility -> Zone/Area -> Incident -> Project Request -> Scope Record -> Authorization -> Project -> Tasks/Work Orders -> Deliverables -> Documents -> Communications -> Financial Records -> Reports/Dashboards -> Audit Events.

## Current Status

The repo control layer and required specification documents are complete enough to begin visual-only first build preparation.

The project is not approved for production, real client data, PHI, Supabase schema, storage buckets, auth providers, RLS policies, or full backend workflows.

## Completed Setup Items

- Local AuxiliumOS folder system created.
- Private GitHub repository named auxiliumos created.
- Starter repo skeleton committed and pushed.
- GitHub Desktop connected.
- GitHub labels created.
- GitHub Project board created.
- First set of issues created and worked through the issue/branch/PR workflow.
- Node.js installed.
- Cursor installed.
- Lovable paid account available.
- Lovable Workspace Knowledge and Project Knowledge configured.
- Supabase dev project documented as auxiliumos-dev.
- No real client data has been used.
- No PHI has been used.
- No secrets have been committed.

## Completed Control Documents

- PROJECT_STATE.md v1
- DECISION_LOG.md v1
- OPEN_QUESTIONS.md v1
- DATA_SPINE.md v1
- MODULE_MAP.md v1
- AI_TOOL_RULES.md
- PROMPT_LIBRARY.md
- CURRENT_HANDOFF.md
- Repo foundation review
- SPEC_GATE_REVIEW.md

## Completed Specification Documents

- ROLE_PERMISSION_MATRIX.md v1
- DOCUMENT_ACCESS_MATRIX.md v1
- V1_SCOPE.md
- UAT_SCENARIOS.md
- RLS_POLICY_MATRIX.md
- RLS_TEST_PLAN.md
- DOCUMENT_RELEASE_WORKFLOW.md
- REQUEST_STATE_MACHINE.md
- EMERGENCY_EXCEPTION_WORKFLOW.md
- CHANGE_AUTHORIZATION_WORKFLOW.md
- PLAYWRIGHT_TEST_PLAN.md
- SECURITY_GUARDRAILS.md no-PHI policy
- OUT_OF_SCOPE.md no-PHI/out-of-scope policy

## Spec Gate Review Status

Status:
Passed for visual-only first build preparation.

Next approved issue:
Create Lovable visual UI shell v1

Allowed next work:
- Visual-only UI shell
- Navigation placeholders
- Status cards
- Empty states
- Simple fake/demo data
- No backend
- No schema
- No Supabase connection
- No auth
- No RLS
- No storage
- No real client data
- No PHI

## Supabase Dev Project Status

Status:
Created / documented as development only.

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

## Still Draft / Founder Review Required

The following are not final implementation decisions:

- Role authority
- Document release authority
- Scope approval authority
- Cap/change authorization authority
- Emergency conditional authorization authority
- No-PHI operational exceptions
- Professional/legal boundaries
- RLS helper design
- Auth provider strategy
- Storage bucket design
- Supabase schema design
- Production readiness
- Real client data onboarding

## Do Not Start Yet

Do not start:

- Full Lovable backend app build
- Supabase schema
- Supabase storage buckets
- Auth providers
- RLS policy creation
- Claude Code implementation edits
- Codex implementation edits
- Playwright install
- GitHub Actions real CI
- Production setup
- Real client data onboarding
- PHI-capable workflows

until the relevant future GitHub issues are created, approved, and worked through the normal branch/PR process.

## Current Next Action

Create GitHub issue:

Create Lovable visual UI shell v1
