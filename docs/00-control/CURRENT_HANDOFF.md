# Current Handoff

Last updated: 2026-06-22

## Purpose

This file is the current AuxiliumOS handoff snapshot.

Use this file when starting a new ChatGPT, Cursor, Claude Code, Codex, Lovable, GitHub Copilot, or other AI-assisted development session.

The purpose is to prevent long-chat drift, hallucination, lost context, duplicated work, uncontrolled schema changes, and accidental violations of the AuxiliumOS architecture.

---

# Permanent Source-of-Truth Rule

The GitHub repository is the source of truth.

ChatGPT, Cursor, Lovable, Claude Code, Codex, GitHub Copilot, and all future AI agents are workers.

If a decision, workflow, assumption, schema change, permission rule, document rule, or project status is not captured in the repository, it does not count.

---

# Canonical AuxiliumOS Data Spine

Client Account
→ Program/MSA
→ Portfolio
→ Asset/Facility
→ Zone/Area
→ Incident
→ Project Request
→ Scope Record
→ Authorization
→ Project
→ Tasks/Work Orders
→ Deliverables
→ Documents
→ Communications
→ Financial Records
→ Reports/Dashboards
→ Audit Events.

Every future feature must connect to this spine or be treated as global configuration, reference data, integration data, or out-of-scope.

---

# Current Project Phase

Spec Gate Passed / Visual First Build Preparation

The repo control layer and required specification documents are complete enough to begin visual-only first build preparation.

The project is not approved for production, real client data, PHI, Supabase schema, storage buckets, auth providers, RLS policies, or full backend build yet.

---

# Completed So Far

The following have been completed and merged into main:

- Local AuxiliumOS folder system
- Private GitHub repository named auxiliumos
- Starter repo skeleton committed and pushed
- GitHub Desktop connected
- GitHub labels created
- GitHub Project board created
- First set of issues created
- PROJECT_STATE.md v1
- DECISION_LOG.md v1
- OPEN_QUESTIONS.md v1
- DATA_SPINE.md v1
- MODULE_MAP.md v1
- AI_TOOL_RULES.md and PROMPT_LIBRARY.md
- Repo foundation review
- Node.js installed
- Cursor installed
- Lovable Workspace Knowledge and Project Knowledge configured
- Supabase dev project documented as dev-only
- ROLE_PERMISSION_MATRIX.md v1
- DOCUMENT_ACCESS_MATRIX.md v1
- V1_SCOPE.md and UAT_SCENARIOS.md
- RLS_POLICY_MATRIX.md and RLS_TEST_PLAN.md
- DOCUMENT_RELEASE_WORKFLOW.md
- REQUEST_STATE_MACHINE.md
- EMERGENCY_EXCEPTION_WORKFLOW.md
- CHANGE_AUTHORIZATION_WORKFLOW.md
- PLAYWRIGHT_TEST_PLAN.md
- No-PHI policy in SECURITY_GUARDRAILS.md and OUT_OF_SCOPE.md
- SPEC_GATE_REVIEW.md

---

# Current Tool Status

## GitHub

Status:
Active source of truth.

Repository:
auxiliumos

Workflow:
One issue, one branch, one controlled change, one PR, review, merge, board update.

## GitHub Desktop

Status:
Used for branch creation, commits, pushes, fetch/pull, and local branch cleanup.

## ChatGPT

Status:
Used for strategy, detailed step guidance, repo-document drafting, and reasoning.

Restriction:
ChatGPT cannot be the only place decisions live.

## Cursor

Status:
Installed.

Use:
Open the local repo, read files, summarize rules, later supervise edits.

Current restriction:
No implementation edits unless issue, branch, and allowed files are defined.

## Lovable

Status:
Paid account available. Workspace Knowledge and Project Knowledge configured.

Use:
Visual-only UI shell and controlled interface exploration.

Current restriction:
No backend, schema, RLS, auth, storage, Supabase connection, production connection, real workflows, real client data, or PHI.

## Supabase

Status:
Development project documented as auxiliumos-dev.

Current restriction:
Dev only. No production. No staging yet. No tables. No storage buckets. No auth providers. No Lovable connection. No GitHub integration. No keys in repo or AI chats.

---

# Current Next Issue

Next issue to work after this handoff update:

Create Lovable visual UI shell v1

Purpose:
Create a visual-only AuxiliumOS interface shell using Lovable.

Allowed:
- UI shell
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

---

# Founder-Decision Rule

Some items require founder, legal, security, or professional judgment.

AI may draft options and recommendations.

AI may not finalize:

- Role authority
- Document release authority
- Scope approval authority
- Cap approval authority
- Agreement signer rules
- No-PHI policy exceptions
- Professional/legal boundaries
- RLS exceptions
- Production deployment approval
- Client-facing promises
- Sampling strategy approval

If unresolved, mark as:

Decision Status: Draft / Founder review required / Not implementation-approved.

Also add or preserve the item in:

docs/00-control/OPEN_QUESTIONS.md

---

# Non-Negotiable Guardrails

- No secrets in GitHub, ChatGPT, Lovable, Cursor, Claude, Codex, screenshots, or markdown files.
- No API keys.
- No service-role keys.
- No database passwords.
- No real client data during prep/specification/visual shell.
- No PHI.
- No production data.
- No client-visible document without release workflow.
- No chat/message may change approved scope.
- No client-data table without RLS plan and tests.
- No AI-created professional/legal/business authority.
- No direct production edits.
- No broad public Supabase policies.
- No full Lovable app build before a specific GitHub issue authorizes it.
- No Supabase schema before a specific schema issue authorizes it.
- No Playwright install until an app exists.
- No GitHub Actions real CI until package scripts/tests exist.

---

# What Must Not Start Yet

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

---

# Required Workflow for Every Future Issue

1. Open GitHub Project board.
2. Select one issue only.
3. Move issue card to In Agent Work.
4. Open GitHub Desktop.
5. Confirm branch is main.
6. Fetch/pull.
7. Create issue-specific branch.
8. Edit only allowed files.
9. Save.
10. Confirm changed files in GitHub Desktop.
11. Commit with specified summary.
12. Push/publish branch.
13. Create pull request.
14. Replace PR body with the specified PR body.
15. Review Files changed.
16. Confirm no secrets/client data/unrelated files.
17. Merge.
18. Delete remote branch if offered.
19. Move board card to Released.
20. Close issue.
21. Switch GitHub Desktop back to main.
22. Fetch/pull.
23. Delete local branch if desired.

---

# Required New Chat Startup

When starting a new ChatGPT chat, paste the New Chat Starter Prompt from this file and upload or paste the current contents of:

- AGENTS.md
- docs/00-control/CURRENT_HANDOFF.md
- docs/00-control/PROJECT_STATE.md
- docs/00-control/NEXT_ACTIONS.md
- docs/00-control/OPEN_QUESTIONS.md
- docs/00-control/DECISION_LOG.md

If the new chat does not have those files or current text, it must not give build instructions.

---

# New Chat Starter Prompt

Paste this at the start of any new ChatGPT chat:

```text
You are helping me continue AuxiliumOS.

Do not rely on prior chat memory.

The GitHub repository is the source of truth.

Before giving instructions, read and summarize the current framework from these files I will provide:
- AGENTS.md
- CURRENT_HANDOFF.md
- PROJECT_STATE.md
- NEXT_ACTIONS.md
- OPEN_QUESTIONS.md
- DECISION_LOG.md

You must preserve this canonical data spine:
Client Account -> Program/MSA -> Portfolio -> Asset/Facility -> Zone/Area -> Incident -> Project Request -> Scope Record -> Authorization -> Project -> Tasks/Work Orders -> Deliverables -> Documents -> Communications -> Financial Records -> Reports/Dashboards -> Audit Events.

Rules:
- Do not invent new core objects.
- Do not skip issue/branch/PR workflow.
- Do not give app-build instructions before verifying current status.
- Do not tell me to add secrets, API keys, service-role keys, passwords, PHI, or real client data.
- Do not allow chat/messages to change approved scope.
- Do not allow client-visible documents without release workflow.
- Do not treat founder-decision items as final unless the repo says they are final.
- If something is unresolved, mark it as a decision question.

First, summarize:
1. Current project phase.
2. Completed items.
3. Current next issue.
4. Items that must not start yet.
5. Any founder decisions still open.

Then wait for me to confirm before giving step-by-step instructions.