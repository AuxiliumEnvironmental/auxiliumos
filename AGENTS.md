# AuxiliumOS Agent Instructions

## Absolute Source of Truth

This repository is the source of truth.

Do not rely on chat memory.

Before making changes, read in this order:

1. docs/00-control/CURRENT_HANDOFF.md
2. docs/00-control/PROJECT_STATE.md
3. docs/00-control/NEXT_ACTIONS.md
4. docs/01-product/DATA_SPINE.md
5. docs/04-security/ROLE_PERMISSION_MATRIX.md
6. docs/04-security/DOCUMENT_ACCESS_MATRIX.md
7. The specific GitHub issue/ticket/spec linked to the task.

## Canonical Data Spine

Client Account -> Program/MSA -> Portfolio -> Asset/Facility -> Zone/Area -> Incident -> Project Request -> Scope Record -> Authorization -> Project -> Tasks/Work Orders -> Deliverables -> Documents -> Communications -> Financial Records -> Reports/Dashboards -> Audit Events.

Every future feature must connect to this spine or be treated as global configuration, reference data, integration data, or out-of-scope.

## Current Gate

The current phase is:

Spec Gate Passed / Visual First Build Preparation.

The next approved work is visual-only Lovable UI shell preparation.

This does not authorize:

- Supabase schema
- Supabase storage buckets
- Auth providers
- RLS policy creation
- Real backend workflows
- Production setup
- Real client data
- PHI
- Unrestricted AI agent implementation edits

## Non-Negotiable Rules

- Do not invent new core objects without an architecture decision.
- Do not bypass RLS.
- Do not expose service-role keys to browser/client code.
- Do not add secrets, API keys, passwords, Supabase keys, connection strings, real client data, or PHI.
- Do not make documents client-visible without release workflow.
- Do not allow messages or chat to change approved scope.
- Do not create new scope, sampling, cap, or authorization logic without corresponding specs/tests.
- Do not change production data.
- Do not remove audit events.
- Do not change professional-boundary language without a ticket.
- Do not work outside the GitHub issue scope.
- Do not change files outside the allowed file list.
- Do not treat founder-decision items as final unless the repository says they are final.

## Required Output for Every Task

Every agent/tool task must provide:

- Summary of changes
- Files changed
- Tests added or updated
- Tests run
- Assumptions
- Risks
- Founder decisions needed
- Next recommended ticket

## Required Closeout

Every AI/tool session must end with a session closeout that includes:

- Date
- Tool used
- Ticket(s)
- Completed
- Files changed
- Database changes
- RLS changes
- Tests added
- Tests run
- Test results
- Assumptions made
- Decisions needed from founder
- Risks introduced
- Docs updated
- Next recommended ticket

## Stop Conditions

Stop and ask before proceeding if the task requires:

- New database schema
- RLS policy changes
- Auth provider setup
- Storage bucket creation
- Document release logic
- Scope-change logic
- Sampling authorization logic
- Agreement/signature logic
- Finance/cap logic
- Professional/legal boundary decisions
- Production deployment
- Real client data
- PHI-capable workflow