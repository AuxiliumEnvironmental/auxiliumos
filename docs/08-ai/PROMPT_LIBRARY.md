# Prompt Library

## Purpose

This file stores reusable prompts for working safely with AI tools on AuxiliumOS.

Prompts in this file help AI tools follow the repository source of truth, work within one issue, avoid uncontrolled architecture changes, and produce session closeouts.

Use this file when you need a clean copy/paste prompt for ChatGPT, Cursor, Claude Code, Codex, Lovable, GitHub Copilot, or future agents.

---

# Prompt 1 — Rule Summary Only

Use this when opening the repository in a new AI tool for the first time.

```text
Read AGENTS.md, CLAUDE.md if available, docs/00-control/CURRENT_HANDOFF.md, docs/00-control/PROJECT_STATE.md, and docs/00-control/NEXT_ACTIONS.md.

Summarize the AuxiliumOS project rules, data spine, non-negotiable guardrails, current phase, and current next actions.

Do not edit any files.
```

---

# Prompt 2 — Safe Issue-Based Work Prompt

Use this when asking an AI tool to work on a specific issue.

```text
You are working on GitHub issue #__ only.

Read:
- AGENTS.md
- docs/00-control/CURRENT_HANDOFF.md
- docs/00-control/PROJECT_STATE.md
- docs/00-control/NEXT_ACTIONS.md
- the issue body

Allowed files:
-

Do not change files outside the allowed list.

Do not invent new core objects, roles, permissions, document states, scope logic, sampling logic, agreement logic, database architecture, RLS policies, or professional boundaries.

Do not alter document release, scope control, sampling authorization, financial authorization, or agreement workflows unless the issue specifically asks for it.

Before editing, summarize:
1. What you understand the task to be
2. Files you expect to change
3. Files you will not change
4. Risks or assumptions
5. Tests or documentation expected

After editing, provide the required Session Closeout.
```

---

# Prompt 3 — Session Closeout

Use this at the end of every AI/tool work session.

```markdown
# Session Closeout

Date:

Tool used:

Ticket(s):

Completed:

Files changed:

Database changes:

RLS changes:

Tests added:

Tests run:

Test results:

Assumptions made:

Decisions needed from founder:

Risks introduced:

Docs updated:

Next recommended ticket:
```

---

# Prompt 4 — Decision Required

Use this when an AI tool reaches a question it cannot safely decide.

```markdown
# Decision Required

Decision ID:

Area:

Question:

Options:

Recommendation:

Risk if wrong:

Founder decision:

Repo file to update after decision:
```

---

# Prompt 5 — PR Review Prompt

Use this to ask an AI tool to review a pull request summary or changed files.

```text
Review this pull request for AuxiliumOS.

Check for:
- data spine consistency
- unrelated file changes
- hidden schema changes
- RLS/security impact
- document-control impact
- scope-control impact
- professional/legal boundary risk
- missing tests or missing explanation for deferred tests
- missing documentation updates
- assumptions that should be moved to ASSUMPTION_REGISTER.md
- founder decisions that should be moved to OPEN_QUESTIONS.md

Do not approve automatically.

Provide findings and recommended next actions.
```

---

# Prompt 6 — Lovable Visual Shell Only

Use this when first setting up Lovable for UI-only work.

```text
Build a visual-only AuxiliumOS client/admin portal shell.

Do not create or change database schema.
Do not create backend logic.
Do not create RLS policies.
Do not create auth logic.
Do not create storage buckets.
Do not connect to Supabase.
Do not invent roles, permissions, document states, service logic, scope logic, sampling logic, agreement logic, or professional-boundary rules.

Create navigation placeholders for:
- Dashboard
- Facilities
- Projects
- Documents
- Messages
- Approvals
- Reports
- Account
- Admin Command Center

Use professional enterprise styling.

Include status cards and empty-state examples only.

Follow the canonical data spine:
Client Account -> Program/MSA -> Portfolio -> Asset/Facility -> Zone/Area -> Incident -> Project Request -> Scope Record -> Authorization -> Project -> Tasks/Work Orders -> Deliverables -> Documents -> Communications -> Financial Records -> Reports/Dashboards -> Audit Events.

If this requires schema, security, RLS, document-release logic, scope logic, auth, storage, or backend workflows, stop and ask first.
```

---

# Prompt 7 — Cursor Repo Verification

Use this when first opening the repository in Cursor.

```text
Read AGENTS.md, CLAUDE.md, docs/00-control/CURRENT_HANDOFF.md, docs/00-control/PROJECT_STATE.md, and docs/00-control/NEXT_ACTIONS.md.

Summarize the AuxiliumOS project rules, data spine, non-negotiable guardrails, and current next actions.

Do not edit any files.
```

---

# Prompt 8 — Claude Code First Check

Use this when first using Claude Code.

```text
Read AGENTS.md, CLAUDE.md, docs/00-control/CURRENT_HANDOFF.md, docs/00-control/PROJECT_STATE.md, and docs/00-control/NEXT_ACTIONS.md.

Summarize:
- the project
- the current phase
- the data spine
- the non-negotiable rules
- what you are not allowed to change

Do not edit any files.
```

---

# Prompt 9 — Codex First Check

Use this when first using Codex.

```text
Read AGENTS.md, docs/00-control/CURRENT_HANDOFF.md, and docs/00-control/PROJECT_STATE.md.

Do not edit files.

Summarize the project rules, current phase, data spine, and required output format for future tasks.
```

---

# Prompt 10 — Stop Condition Prompt

Use this when an AI tool starts to drift.

```text
Stop.

Do not edit further.

Summarize exactly what you changed, what files were touched, what assumptions you made, and what decision you need from me.

Do not proceed until I approve the next step.
```

---

# Permanent Prompt Rule

Never prompt an AI tool with:

```text
Build the entire AuxiliumOS app.
```

Always prompt by:

- One issue
- One branch
- Allowed files
- Source-of-truth docs
- Expected tests
- Required closeout
