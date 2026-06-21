# AuxiliumOS Agent Instructions

## Absolute Source of Truth
This repository is the source of truth. Do not rely on chat memory.

Read in this order before making changes:
1. docs/00-control/PROJECT_STATE.md
2. docs/00-control/NEXT_ACTIONS.md
3. docs/01-product/DATA_SPINE.md
4. docs/04-security/ROLE_PERMISSION_MATRIX.md
5. The specific issue/ticket/spec linked to the task.

## Canonical Data Spine
Client Account -> Program/MSA -> Portfolio -> Asset/Facility -> Zone/Area -> Incident -> Project Request -> Scope Record -> Authorization -> Project -> Tasks -> Deliverables -> Documents -> Communications -> Financial Records -> Reports -> Audit Events.

## Non-Negotiable Rules
- Do not invent new core objects without an architecture decision.
- Do not bypass RLS.
- Do not expose service-role keys to browser/client code.
- Do not make documents client-visible without release workflow.
- Do not allow messages to change scope.
- Do not create new scope, sampling, cap, or authorization logic without corresponding tests.
- Do not change production data.
- Do not remove audit events.
- Do not change professional-boundary language without a ticket.

## Required Output for Every Task
- Summary of changes
- Files changed
- Tests added or updated
- Tests run
- Assumptions
- Risks
- Next recommended ticket
