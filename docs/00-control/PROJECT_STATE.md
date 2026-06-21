# Project State

## Current Phase

Prep / AI Software Factory Setup

## Source of Truth

The GitHub repository is the source of truth. ChatGPT, Lovable, Claude Code, Codex, Cursor, and other tools are workers that must follow the repository files, tickets, and guardrails.

## Canonical Data Spine

Client Account -> Program/MSA -> Portfolio -> Asset/Facility -> Zone/Area -> Incident -> Project Request -> Scope Record -> Authorization -> Project -> Tasks -> Deliverables -> Documents -> Communications -> Financial Records -> Reports -> Audit Events.

## Current Setup Status

- Local AuxiliumOS folder system has been created.
- Private GitHub repository is being created and initialized.
- Starter repo skeleton is being committed.
- No app code has been built yet.
- No production data exists.
- No real client data should be uploaded.
- No Supabase production project should be used yet.

## Current Non-Negotiable Guardrails

- No secrets in GitHub, ChatGPT, Lovable, screenshots, or AI chats.
- No production data during prep.
- No AI-created architecture without founder approval.
- No direct production edits.
- No client-visible document without release workflow.
- No chat message changes scope.
- No client-data table without RLS.
- Every important decision must be written into the repo.

## Current Next Actions

1. Finish GitHub repository setup.
2. Confirm starter skeleton is committed and pushed.
3. Create labels.
4. Create GitHub Project board.
5. Create first 20 setup issues.
6. Install Cursor.
7. Verify Cursor can read project rules without editing files.
8. Set up Lovable Project Knowledge.
9. Create Supabase dev project.
10. Do not start app build until prep checklist is complete.

## Open Risks

- Founder is new to GitHub/tooling and needs noob-safe workflow discipline.
- AI tools may drift if they are not forced to read AGENTS.md and PROJECT_STATE.md.
- Real client data must not enter the system during setup.

## Last Updated

2026-06-21