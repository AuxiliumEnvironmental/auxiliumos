# AuxiliumOS

AuxiliumOS is a modular operating suite with one canonical data spine, built to support client intake, enterprise account/asset management, project coordination, document control, scope control, authorization, reporting, and auditability for Auxilium Environmental.

## Current Stage

Spec Gate Passed / Visual First Build Preparation.

The next approved work is a visual-only Lovable UI shell.

This stage does not approve production, real client data, PHI, Supabase schema, storage buckets, auth providers, RLS policies, or real backend workflows.

## Source of Truth

The GitHub repository is the source of truth.

ChatGPT, Cursor, Lovable, Claude Code, Codex, GitHub Copilot, and future AI agents are workers that must follow the repository.

## Start Here

Read these files in order:

1. `AGENTS.md`
2. `docs/00-control/CURRENT_HANDOFF.md`
3. `docs/00-control/PROJECT_STATE.md`
4. `docs/00-control/TRANSITION_PROTOCOL.md`
5. `docs/01-product/END_STATE_BLUEPRINT.md`
6. `docs/00-control/NEXT_ACTIONS.md`
7. `docs/01-product/DATA_SPINE.md`
8. The active GitHub issue being worked.

## Canonical Data Spine

Client Account -> Program/MSA -> Portfolio -> Asset/Facility -> Zone/Area -> Incident -> Project Request -> Scope Record -> Authorization -> Project -> Tasks/Work Orders -> Deliverables -> Documents -> Communications -> Financial Records -> Reports/Dashboards -> Audit Events.

## Current Next Work

Create Lovable visual UI shell v1.

Allowed:

- Visual UI shell
- Navigation placeholders
- Status cards
- Empty states
- Fake/demo data only

Not allowed yet:

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