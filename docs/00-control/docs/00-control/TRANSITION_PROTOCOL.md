# Transition Protocol

## Purpose

This file defines the exact process for moving AuxiliumOS work into a new ChatGPT chat or AI tool session without losing context, drifting logic, or relying on memory.

The transition process must work no matter how far the project grows.

---

# Permanent Rule

Do not rely on prior chat memory.

The GitHub repository is the source of truth.

A new chat/tool session must prove it understands the current repo state before giving build instructions.

---

# Required Handoff Files

At minimum, a new ChatGPT chat should receive or read:

- AGENTS.md
- docs/00-control/CURRENT_HANDOFF.md
- docs/00-control/PROJECT_STATE.md
- docs/00-control/NEXT_ACTIONS.md
- docs/00-control/OPEN_QUESTIONS.md
- docs/00-control/DECISION_LOG.md
- docs/00-control/SPEC_GATE_REVIEW.md
- docs/00-control/TRANSITION_PROTOCOL.md
- docs/01-product/END_STATE_BLUEPRINT.md
- docs/01-product/DATA_SPINE.md
- docs/01-product/MODULE_MAP.md
- docs/08-ai/AI_TOOL_RULES.md
- docs/08-ai/PROMPT_LIBRARY.md

For issue-specific work, also provide the active GitHub issue body and relevant module/spec files.

---

# New Chat Startup Prompt

Use this prompt at the start of any new ChatGPT chat:

```text
You are helping me continue AuxiliumOS.

Do not rely on prior chat memory.

The GitHub repository is the source of truth.

Use only the uploaded files as the current handoff context unless I provide additional repo files.

Before giving any build instructions, read and summarize the current framework from these uploaded files:

- AGENTS.md
- CURRENT_HANDOFF.md
- PROJECT_STATE.md
- NEXT_ACTIONS.md
- OPEN_QUESTIONS.md
- DECISION_LOG.md
- SPEC_GATE_REVIEW.md
- TRANSITION_PROTOCOL.md
- END_STATE_BLUEPRINT.md
- DATA_SPINE.md
- MODULE_MAP.md
- AI_TOOL_RULES.md
- PROMPT_LIBRARY.md

You must preserve this canonical data spine:

Client Account -> Program/MSA -> Portfolio -> Asset/Facility -> Zone/Area -> Incident -> Project Request -> Scope Record -> Authorization -> Project -> Tasks/Work Orders -> Deliverables -> Documents -> Communications -> Financial Records -> Reports/Dashboards -> Audit Events.

Rules:

- Do not invent new core objects.
- Do not skip issue/branch/PR workflow.
- Do not give app-build instructions before verifying current status.
- Do not tell me to add secrets, API keys, service-role keys, passwords, PHI, or real client data.
- Do not allow chat/messages to change approved scope.
- Do not allow client-visible documents without release workflow.
- Do not treat founder-decision items as final unless the repo files say they are final.
- If something is unresolved, mark it as a decision question.
- Do not start Supabase schema, storage, auth providers, RLS policies, Claude Code edits, Codex edits, Playwright install, production setup, real client data, or PHI-capable workflows unless the current repo files explicitly authorize it.

First, summarize only:

1. Current project phase.
2. Final AuxiliumOS end-state vision.
3. Completed items.
4. Current next issue.
5. Items that must not start yet.
6. Founder decisions still open.
7. The exact workflow future issues must follow.
8. Any contradictions or missing files you notice in the uploaded handoff packet.

After the summary, stop and wait for me to confirm. Do not provide step-by-step build instructions yet.