
# AuxiliumOS Prep-to-Fly Checklist

## Purpose of this document

This document is the beginner-friendly setup guide for building the AuxiliumOS development workflow before major app construction begins. It is not the app build plan itself. It is the preparation system that makes the app build safe, fast, organized, and repeatable.

The goal is to create an AI-powered software factory where every tool works from the same source of truth, every change is tracked, every decision is recorded, and no AI tool is allowed to invent dangerous logic or drift away from the AuxiliumOS framework.

The controlling end-state remains:

**One data spine. Separate purpose-built modules. One clean client portal. One internal command center. Strict scope, document, permission, authorization, and audit controls.**

The canonical AuxiliumOS data spine is:

**Client Account -> Program / MSA -> Portfolio -> Asset / Facility / Property -> Zone / Area -> Incident -> Project Request -> Scope Record -> Authorization -> Project -> Work Orders / Tasks -> Deliverables -> Documents -> Communications -> Financial Records -> Reports / Dashboards -> Audit Events**

Everything in this prep workflow exists to protect that spine.

---

## How to use this document

Read this once from start to finish before touching tools. Then use it as a checklist. The checkboxes are designed so you can work through the setup in order.

Do not skip ahead to Lovable, Supabase, or code generation before the source-of-truth files and repository structure exist. The tools are powerful, but they are only safe if they are forced to follow your rules.

### Three layers of this setup

1. **Control layer** - the rules, docs, decision logs, and source-of-truth files that keep AI from drifting.
2. **Development layer** - GitHub, Supabase, Lovable, Cursor, Claude Code, Codex, and test tools.
3. **Operating layer** - the daily/weekly workflow that tells you what to do, what AI can do, what requires your approval, and how to restart after a long session.

### What prep complete means

Prep is complete only when all of these are true:

- [ ] The private GitHub repository exists.
- [ ] The starter folder structure exists.
- [ ] `AGENTS.md` exists at the repo root.
- [ ] `CLAUDE.md` exists at the repo root.
- [ ] The core source-of-truth docs exist in `docs/00-control`.
- [ ] The data spine is documented.
- [ ] The initial role/permission matrix exists.
- [ ] The initial RLS policy matrix exists.
- [ ] The initial document-control matrix exists.
- [ ] The initial workflow/state-machine docs exist.
- [ ] GitHub issue templates exist.
- [ ] GitHub pull request template exists.
- [ ] GitHub labels are defined.
- [ ] Supabase dev/staging/prod plan is written.
- [ ] Lovable project knowledge is written.
- [ ] Cursor rules are written.
- [ ] Claude Code and Codex instructions are written.
- [ ] First 20 foundation tickets are created.
- [ ] Daily closeout procedure is written.
- [ ] Backup procedure is written.
- [ ] No tool has production write access before security gates are defined.

---

# Part 1 - The beginner mental model

## 1.1 What you are actually building first

You are not starting by building AuxiliumOS. You are starting by building the **factory that will build AuxiliumOS**.

A normal person might open Lovable and type: "Build my client portal." That can produce something impressive quickly, but it can also create hidden failures: weak permissions, sloppy document access, unclear project states, bad database tables, missing audit logs, and features that do not match Auxilium's real operations.

Your path is different:

1. Create the project brain.
2. Create the rules AI must obey.
3. Create the repo where all truth lives.
4. Create tickets that are small enough for AI agents to build safely.
5. Build vertical slices one at a time.
6. Test each slice before expanding.

## 1.2 What GitHub is

GitHub is the cloud home for the project. Think of it as a controlled filing cabinet plus history tracker plus task board.

A GitHub repository contains:

- all app code;
- all database migrations;
- all project instructions;
- all product decisions;
- all AI rules;
- all test files;
- all issue tickets;
- all pull requests;
- all release records.

Why it matters: if a chat becomes too long, a tool session crashes, or Lovable/Claude/Codex loses context, the repository is still the source of truth.

## 1.3 What Git is

Git is the version-history system behind GitHub. Every meaningful change can be committed. A commit is like a save point with a message.

Why it matters: if AI breaks something, you can compare changes, revert, branch, or restore.

## 1.4 What a branch is

A branch is a safe copy of the project where a change can be developed without damaging the main version.

Simple example:

- `main` = stable version.
- `feature/document-release-workflow` = a branch where AI builds document release.

Why it matters: AI agents should not edit the stable version directly.

## 1.5 What a pull request is

A pull request, often called a PR, is a formal proposal to merge one branch into another.

A PR should show:

- what changed;
- why it changed;
- what files changed;
- what tests were run;
- what risks exist;
- whether it is safe to merge.

Why it matters: the PR is where AI work gets reviewed before it becomes part of the official product.

## 1.6 What Supabase is

Supabase is the backend platform. For AuxiliumOS, it can provide:

- PostgreSQL database;
- authentication;
- row-level security;
- file storage;
- Edge Functions;
- local development tools;
- migrations;
- database testing.

Why it matters: AuxiliumOS depends on structured data and strict access controls. Supabase is where the data spine, roles, documents, requests, projects, and audit records can live.

## 1.7 What Row Level Security means

Row Level Security, or RLS, is the database rule system that decides which rows a user can see or change.

Example:

- PA Firm A can see only PA Firm A projects.
- A Nutex site champion can see only assigned facilities.
- A vendor can see only assigned vendor tasks.
- A client cannot see draft reports.
- A removed user sees nothing.

Why it matters: hiding a button in the UI is not enough. The database itself must deny access.

## 1.8 What Lovable is

Lovable is an AI app builder that can rapidly generate UI and app logic and connect to Supabase.

Use it for speed:

- client portal pages;
- admin pages;
- dashboards;
- request forms;
- facility pages;
- site passport pages;
- document views;
- status cards.

Do not let it decide:

- the data spine;
- permissions;
- document release rules;
- professional boundaries;
- scope-change logic;
- sampling authorization logic.

## 1.9 What Cursor is

Cursor is a code editor with AI built in. Think of it as your cockpit for inspecting the project, making targeted edits, and asking the AI to work inside the repository.

Why it matters: Lovable is fast, but Cursor helps you inspect and control the actual code and files.

## 1.10 What Claude Code and Codex are

Claude Code and Codex are coding agents. They can read the codebase, edit files, run commands, and work on tasks.

They should work from:

- `AGENTS.md`;
- `CLAUDE.md`;
- the exact GitHub issue;
- the relevant docs;
- the test requirements.

They should not work from vague memory.

## 1.11 What Playwright is

Playwright is a browser testing tool. It can simulate users clicking through your app.

Example tests:

- a site champion submits a water intrusion incident;
- an admin sees the incident;
- a draft report is hidden;
- a released report is visible;
- a wrong user is denied access.

Why it matters: the most dangerous bugs are permission and workflow bugs. Playwright helps catch them.

## 1.12 What pgTAP/database tests are

pgTAP is a way to test PostgreSQL database logic.

It can test:

- tables;
- constraints;
- functions;
- RLS policies;
- data integrity.

Why it matters: the browser may look right, but database policies can still be wrong. Database tests attack that directly.

## 1.13 What MCP is

MCP, or Model Context Protocol, is a way for AI tools to connect to external systems like databases, files, and APIs.

Use MCP carefully. Start with read-only access. Do not give AI production write access.

Why it matters: MCP can make AI powerful, but uncontrolled MCP can let AI change things it should only inspect.

---

# Part 2 - The non-negotiable AuxiliumOS rules

These are the rules every tool, agent, contractor, and future teammate must follow.

## 2.1 Source-of-truth rules

- [ ] The repository is the project source of truth.
- [ ] Chat memory is never the source of truth.
- [ ] Lovable project state is never the only source of truth.
- [ ] Claude/Codex/Cursor memory is never the only source of truth.
- [ ] Every meaningful decision must be written into the repo.
- [ ] Every task must be tracked as an issue or checklist item.
- [ ] Every change must be committed or documented.

Why: if the source of truth lives only inside one chat, the project becomes fragile. If the source of truth lives in the repository, any AI session can restart from the correct framework.

## 2.2 Data-spine rules

- [ ] Every feature must attach to the canonical data spine.
- [ ] No feature may invent a parallel client/project/document structure.
- [ ] No object may float without an owner.
- [ ] No document may exist without a linked account and document class.
- [ ] No incident may exist without an account and, where applicable, asset/facility.
- [ ] No project may exist without a scope status.
- [ ] No scope change may happen outside the scope-change workflow.

Why: AuxiliumOS is not a pile of app screens. It is a controlled operating system. The data spine prevents chaos.

## 2.3 Security rules

- [ ] RLS must be enabled on every client-data table exposed to the app.
- [ ] No client-data table may be publicly readable.
- [ ] No service-role key may appear in browser/frontend code.
- [ ] No AI agent may have production write access during prep.
- [ ] Every role must have positive and negative tests.
- [ ] A removed user must lose access.
- [ ] A wrong client must not see another client account, project, document, invoice, or dashboard.

Why: UI hiding is not security. Database-level security is required.

## 2.4 Document-control rules

- [ ] Every document must have a document class.
- [ ] Every document must have a version.
- [ ] Every document must have a release state.
- [ ] Draft documents are internal by default.
- [ ] Final documents are not client-visible until released.
- [ ] Client-visible documents require release approval.
- [ ] Download/view events must be auditable.
- [ ] Superseded documents must remain historically traceable.
- [ ] Legal/dispute-sensitive documents must have special access rules.

Why: document mistakes are high-risk. A portal that leaks drafts, reports, invoices, or legal-sensitive information is worse than no portal.

## 2.5 Scope-control rules

- [ ] Chat messages cannot change scope.
- [ ] Client messages can create questions, tasks, clarification requests, or change-request drafts.
- [ ] Approved scope can be changed only by formal change authorization.
- [ ] Sampling must have an authorization status.
- [ ] Declined recommendations must be recorded.
- [ ] Declined sampling must apply limitation language.
- [ ] Client-selected, Auxilium-suggested, accepted, declined, excluded, and revised scope must be recorded.

Why: Auxilium's risk is not only technical. It is also expectation risk. Scope control prevents disputes.

## 2.6 Professional-boundary rules

- [ ] AI may not decide what Auxilium is licensed or qualified to perform.
- [ ] Engineering, fire/life-safety, HVAC/TAB, generator, hazmat, public adjusting, mold conflict, asbestos/lead abatement, medical, legal, and coverage boundaries must be reviewed by qualified humans.
- [ ] The platform may coordinate a specialist without claiming Auxilium performs that specialist role.
- [ ] Client-facing language must not overpromise.

Why: the platform should make Auxilium stronger, not accidentally turn Auxilium into a contractor, engineer, public adjuster, hazmat company, or medical/legal advisor.

## 2.7 AI-agent rules

- [ ] AI may draft.
- [ ] AI may summarize.
- [ ] AI may classify.
- [ ] AI may propose.
- [ ] AI may build ticketed code.
- [ ] AI may write tests.
- [ ] AI may review for risk.
- [ ] AI may not approve production release.
- [ ] AI may not approve scope.
- [ ] AI may not release documents.
- [ ] AI may not approve professional conclusions.
- [ ] AI may not silently change the data model.

Why: AI accelerates the work. It does not replace ownership, legal judgment, or professional review.

---

# Part 3 - Tool stack recommendation for the prep workflow

## 3.1 Required tools

Use these as the baseline:

- [ ] GitHub - source control, issues, pull requests, project board, CI.
- [ ] Supabase - backend database, auth, storage, RLS, Edge Functions.
- [ ] Lovable - rapid UI and app generation.
- [ ] Cursor - code editor and AI cockpit.
- [ ] Claude Code - repo-aware implementation agent.
- [ ] OpenAI Codex / Codex CLI - repo-aware implementation and review agent.
- [ ] Playwright - browser/UAT testing.
- [ ] ChatGPT Project - product architecture, logic review, decision support.

## 3.2 Tools to add later

Do not add these first unless there is a clear need:

- [ ] n8n - human-in-the-loop workflow automation and notifications.
- [ ] LangGraph - custom multi-agent orchestration.
- [ ] Power BI or Metabase - executive reporting if app dashboards are insufficient.
- [ ] DocuSign or Adobe Sign - e-signature once authorization workflows are ready.
- [ ] External document vault such as SharePoint/Box - if enterprise document controls require it.

Why: too many tools too early creates setup burden. First, build the repository-centered workflow. Then add orchestration.

## 3.3 Tool ownership rule

Each tool has a job:

- GitHub owns truth and workflow.
- Supabase owns structured data and backend security.
- Lovable owns fast UI iteration.
- Cursor owns local inspection and controlled editing.
- Claude Code and Codex own ticketed implementation work.
- Playwright owns browser workflow proof.
- pgTAP/database tests own database/RLS proof.
- ChatGPT owns strategy, logic, and architecture review.

No tool owns everything.

---

# Part 4 - Phase 0: freeze the operating constitution

Do this before creating accounts or tools.

## 4.1 Create the one-page mission statement

- [ ] Write the mission statement in `docs/00-control/PROJECT_STATE.md`.

Recommended wording:

> AuxiliumOS is a modular operating suite with one canonical data spine, built to support client intake, enterprise account/asset management, project coordination, document control, scope control, authorization, reporting, and auditability for Auxilium Environmental.

Why: every future tool and agent must know what this project is.

## 4.2 Write the current build objective

- [ ] Write the current build objective in `docs/00-control/PROJECT_STATE.md`.

Recommended first objective:

> Build the controlled development factory and first vertical-slice foundation so AI agents can safely build AuxiliumOS without drifting from the canonical architecture.

Why: the first goal is not to build every feature. The first goal is to build the machine that can build features safely.

## 4.3 Lock the canonical data spine

- [ ] Add the data spine to `docs/01-product/DATA_SPINE.md`.
- [ ] Add a rule that all features must attach to the spine.
- [ ] Add a rule that new core objects require a formal architecture decision.

Why: the data spine is the spine of the product. It prevents the tool from creating random, disconnected app areas.

## 4.4 Lock the first product surfaces

- [ ] Define the first client portal surfaces.
- [ ] Define the first internal admin surfaces.
- [ ] Define the first configuration/admin surfaces.

Recommended first surfaces:

Client portal:

- Dashboard
- Projects
- Facilities if enabled
- Documents
- Messages
- Requests
- Approvals if enabled

Internal admin console:

- Intake Queue
- Projects
- Accounts
- Assets/Facilities
- Document Release Queue
- Messages
- Scope Review Queue
- Admin/Configuration

Why: UI surfaces should map to business domains, not random pages.

## 4.5 Lock the first user types

- [ ] Add initial user types to `docs/04-security/ROLE_PERMISSION_MATRIX.md`.

Start with:

- Auxilium System Admin
- Auxilium Account Manager
- Auxilium Intake Admin
- Auxilium Project Manager
- Auxilium Technical Reviewer
- Auxilium Document Controller
- Auxilium Finance/Admin
- Client Executive Viewer
- Client Portfolio/Regional Manager
- Client Site Champion
- Client Project Requester
- Client Agreement Signer
- Client Billing Contact
- Client Document Viewer
- Vendor User
- Read-Only User
- Removed/Suspended User

Why: permissions cannot be designed after the app is built. They are part of the foundation.

## 4.6 Lock the first document classes

- [ ] Add first document classes to `docs/04-security/DOCUMENT_ACCESS_MATRIX.md`.

Start with:

- Internal Note
- Client Upload
- Field Photo
- Draft Report
- Final Report
- Lab Report
- Agreement
- Signed Authorization
- Invoice
- Site Passport
- Critical Asset Registry
- Vendor Document
- QBR Packet
- Executive Document
- Legal/Dispute Sensitive
- Archive/Superseded

Why: document class controls visibility, review, retention, release, and risk.

## 4.7 Lock the first workflow states

- [ ] Add workflow states to `docs/05-workflows`.

At minimum:

Project Request states:

- Draft
- Submitted
- Intake Review
- Needs Client Information
- Classification Review
- Technical Review
- Safety Review
- ROM Preparation
- Revision Proposed
- Client Decision Pending
- Approved for Agreement
- Agreement Pending
- Signature Pending
- Payment/Cap Pending
- Scheduling Released
- Converted to Project
- Declined
- Cancelled
- Expired

Document states:

- Uploaded Unclassified
- Internal Draft
- Under Review
- Approved Internal
- Release Requested
- Client Visible Released
- Superseded
- Restricted
- Archived
- Withdrawn

Scope states:

- Draft
- Under Review
- Proposed to Client
- Client Accepted
- Client Declined
- Approved with Limitations
- Locked
- Superseded
- Change Pending
- Changed
- Closed

Why: uncontrolled status text becomes chaos. Controlled states allow automation and testing.

## 4.8 Create the architecture decision process

- [ ] Create `docs/00-control/DECISION_LOG.md`.
- [ ] Create an Architecture Decision Record template.

Every major decision should include:

- decision number;
- date;
- decision owner;
- problem;
- options considered;
- selected decision;
- reason;
- risks;
- follow-up actions.

Why: future AI sessions need to know why a choice was made.

## 4.9 Create the assumption register

- [ ] Create `docs/00-control/ASSUMPTION_REGISTER.md`.

Each assumption should include:

- assumption;
- owner;
- confidence;
- risk if wrong;
- date to verify;
- status.

Why: assumptions are where AI can quietly break the project. Make them visible.

---

# Part 5 - Phase 1: create accounts and access safely

## 5.1 Create or confirm your GitHub account

- [ ] Create a GitHub account or confirm access to your existing one.
- [ ] Enable multi-factor authentication.
- [ ] Use a strong password.
- [ ] Decide whether this project will live under your personal GitHub account or a company organization.

Recommended: create a company GitHub organization when possible.

Why: the organization structure will scale better when contractors, employees, and AI tools need access.

## 5.2 Create a private GitHub repository

- [ ] Create a private repository named `auxiliumos`.
- [ ] Set visibility to private.
- [ ] Add a README.
- [ ] Do not add sensitive client information yet.

Why: this repo becomes the project brain.

## 5.3 Protect the main branch

- [ ] Create branch protection for `main`.
- [ ] Require pull requests before merging.
- [ ] Require at least one review before merging if your plan allows it.
- [ ] Require status checks once CI exists.
- [ ] Prevent force pushes.

Why: AI agents should not be able to quietly rewrite stable history.

## 5.4 Create development branches

- [ ] Create `dev` branch.
- [ ] Create `staging` branch if you want a staging release branch.

Recommended branch pattern:

- `main` = stable release.
- `dev` = active integration.
- `feature/...` = one ticket or feature.
- `fix/...` = one bug fix.
- `docs/...` = documentation-only changes.

Why: branches keep work isolated and reviewable.

## 5.5 Create a ChatGPT Project

- [ ] Create a ChatGPT Project named `AuxiliumOS Product Command`.
- [ ] Add the Master Map and current planning documents.
- [ ] Add custom instructions saying the repo is the source of truth and the data spine is mandatory.
- [ ] Use this project for strategy, product decisions, and review.

Why: ChatGPT Projects organize long-running work, but they should support the repo, not replace it.

## 5.6 Create Supabase account and organization

- [ ] Create or confirm Supabase account.
- [ ] Create an organization if available.
- [ ] Enable MFA on your account.
- [ ] Do not create production client data yet.

Why: Supabase will hold the backend. Secure the account before creating anything important.

## 5.7 Create Lovable account

- [ ] Create or confirm Lovable account.
- [ ] Connect GitHub when ready.
- [ ] Do not build the full app yet.
- [ ] Prepare the Lovable project knowledge before using it to generate major app sections.

Why: Lovable is powerful, but it should receive rules before generating architecture.

## 5.8 Create or install Cursor

- [ ] Install Cursor.
- [ ] Sign in.
- [ ] Connect GitHub repository.
- [ ] Do not let Cursor/agents edit without rules in place.

Why: Cursor becomes your local inspection and AI-control cockpit.

## 5.9 Prepare Claude Code and Codex access

- [ ] Confirm Claude Code access.
- [ ] Confirm OpenAI Codex / Codex CLI access.
- [ ] Do not give either production secrets.
- [ ] Use only the project repo as working directory.

Why: these tools can modify files. They must work inside the project rules.

---

# Part 6 - Phase 2: create the repository skeleton

## 6.1 Create the top-level files

- [ ] Add `README.md`.
- [ ] Add `AGENTS.md`.
- [ ] Add `CLAUDE.md`.
- [ ] Add `.gitignore`.
- [ ] Add `CHANGELOG.md`.

Why: these files orient humans and AI tools.

## 6.2 Create the core docs folders

Create this folder structure:

```text
docs/
  00-control/
  01-product/
  02-ontology/
  03-data/
  04-security/
  05-workflows/
  06-ui/
  07-testing/
  08-ai/
  09-release/
```

Why: the numbering forces the docs to stay organized. Agents can be told exactly where to look.

## 6.3 Create the future app folders

Create:

```text
app/
supabase/
  migrations/
  functions/
  seed/
  tests/
    rls/
    database/
tests/
  e2e/
  integration/
  unit/
.github/
  ISSUE_TEMPLATE/
  workflows/
.cursor/
  rules/
```

Why: even before code exists, the folder structure tells AI how the project is organized.

## 6.4 Create the control docs

In `docs/00-control`, create:

- [ ] `PROJECT_STATE.md`
- [ ] `NEXT_ACTIONS.md`
- [ ] `DECISION_LOG.md`
- [ ] `ASSUMPTION_REGISTER.md`
- [ ] `OPEN_QUESTIONS.md`
- [ ] `RISK_REGISTER.md`
- [ ] `CHANGE_LOG.md`

Why: this is the anti-lost-context system.

## 6.5 Create the product docs

In `docs/01-product`, create:

- [ ] `PRODUCT_PRINCIPLES.md`
- [ ] `DATA_SPINE.md`
- [ ] `MODULE_MAP.md`
- [ ] `CLIENT_TYPES.md`
- [ ] `V1_SCOPE.md`
- [ ] `OUT_OF_SCOPE.md`

Why: AI needs product boundaries. Otherwise it will add nice-sounding features that break the timeline.

## 6.6 Create the ontology docs

In `docs/02-ontology`, create:

- [ ] `SERVICE_FAMILIES.md`
- [ ] `ISSUES_INTENTS_MODULES.md`
- [ ] `RELATIONSHIP_TAXONOMY.md`
- [ ] `SMART_PROMPTS.md`
- [ ] `SAMPLING_ENGINE.md`
- [ ] `DELIVERABLES.md`
- [ ] `SCOPE_LIMITATIONS.md`

Why: this is where Auxilium's business logic lives.

## 6.7 Create the data docs

In `docs/03-data`, create:

- [ ] `SCHEMA_REGISTRY.md`
- [ ] `TABLE_OWNERSHIP.md`
- [ ] `FIELD_DICTIONARY.md`
- [ ] `RELATIONSHIP_MAP.md`
- [ ] `SEED_DATA_REGISTRY.md`

Why: database changes need a written map so agents do not invent duplicate tables.

## 6.8 Create the security docs

In `docs/04-security`, create:

- [ ] `ROLE_PERMISSION_MATRIX.md`
- [ ] `RLS_POLICY_MATRIX.md`
- [ ] `DOCUMENT_ACCESS_MATRIX.md`
- [ ] `TEST_USERS.md`
- [ ] `SECURITY_GUARDRAILS.md`

Why: security must be designed before UI. The UI should reflect permissions, not create them.

## 6.9 Create workflow docs

In `docs/05-workflows`, create:

- [ ] `REQUEST_STATE_MACHINE.md`
- [ ] `SCOPE_STATE_MACHINE.md`
- [ ] `PROJECT_STATE_MACHINE.md`
- [ ] `DOCUMENT_RELEASE_WORKFLOW.md`
- [ ] `AGREEMENT_AUTHORIZATION_WORKFLOW.md`
- [ ] `EMERGENCY_EXCEPTION_WORKFLOW.md`
- [ ] `CHANGE_AUTHORIZATION_WORKFLOW.md`

Why: workflows need defined states and allowed transitions.

## 6.10 Create UI docs

In `docs/06-ui`, create:

- [ ] `CLIENT_PORTAL_MAP.md`
- [ ] `ADMIN_CONSOLE_MAP.md`
- [ ] `EXECUTIVE_PORTAL_MAP.md`
- [ ] `VENDOR_PORTAL_MAP.md`
- [ ] `COMPONENT_RULES.md`
- [ ] `DESIGN_SYSTEM.md`

Why: Lovable and UI agents need boundaries and a consistent experience.

## 6.11 Create testing docs

In `docs/07-testing`, create:

- [ ] `ACCEPTANCE_TEST_MATRIX.md`
- [ ] `PLAYWRIGHT_TEST_PLAN.md`
- [ ] `RLS_TEST_PLAN.md`
- [ ] `UAT_SCENARIOS.md`
- [ ] `EDGE_CASES.md`

Why: tests should be planned before features are considered complete.

## 6.12 Create AI docs

In `docs/08-ai`, create:

- [ ] `AI_AGENT_ROLES.md`
- [ ] `AI_TOOL_RULES.md`
- [ ] `PROMPT_LIBRARY.md`
- [ ] `LOVABLE_KNOWLEDGE.md`
- [ ] `CURSOR_RULES.md`
- [ ] `CODEX_RULES.md`
- [ ] `CLAUDE_RULES.md`

Why: this allows each AI tool to receive the same instructions.

## 6.13 Create release docs

In `docs/09-release`, create:

- [ ] `RELEASE_CHECKLIST.md`
- [ ] `DEPLOYMENT_RUNBOOK.md`
- [ ] `ROLLBACK_PLAN.md`
- [ ] `SUPPORT_RUNBOOK.md`
- [ ] `BACKUP_RECOVERY_PLAN.md`

Why: you do not want to figure out release and rollback during an emergency.

---

# Part 7 - Phase 3: write the root AI instruction files

## 7.1 Write `AGENTS.md`

- [ ] Add `AGENTS.md` at the repository root.

Recommended contents:

```markdown
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
- Do not create new scope, sampling, cap, or authorization logic without tests.
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
```

Why: AGENTS.md is the universal instruction file for AI coding agents. It keeps them aligned.

## 7.2 Write `CLAUDE.md`

- [ ] Add `CLAUDE.md` at the repository root.

Recommended contents:

```markdown
# Claude Code Instructions for AuxiliumOS

You are working on AuxiliumOS. This is a safety-critical business operations platform for Auxilium Environmental. Follow AGENTS.md first.

Before implementation:
- Read PROJECT_STATE.md.
- Read the relevant module docs.
- Restate the ticket objective.
- Identify affected files.
- Identify tests required.
- Ask for clarification only if the task is blocked.

During implementation:
- Work in small changes.
- Do not change unrelated files.
- Do not create broad abstractions unless requested.
- Do not loosen permissions to make tests pass.
- Do not use mock security in production paths.

Before closeout:
- Run available tests.
- Update docs if behavior changed.
- Provide a session closeout.
```

Why: Claude Code starts fresh each session. This file gives it persistent project behavior.

## 7.3 Write Cursor rules

- [ ] Create `.cursor/rules/product.mdc`.
- [ ] Create `.cursor/rules/supabase.mdc`.
- [ ] Create `.cursor/rules/security.mdc`.
- [ ] Create `.cursor/rules/testing.mdc`.
- [ ] Create `.cursor/rules/document-control.mdc`.

Each rule file should be short and specific.

Example `security.mdc`:

```markdown
# Security Rules
- RLS is required on client-data tables.
- Never expose service-role keys in frontend code.
- Every client-owned row must include account_id unless intentionally global.
- Document visibility must be controlled by document metadata and release state.
- UI hiding is not security.
- Add denial tests for every permission path.
```

Why: Cursor can use these as persistent project instructions.

## 7.4 Write Lovable project knowledge

- [ ] Create `docs/08-ai/LOVABLE_KNOWLEDGE.md`.
- [ ] Copy the contents into Lovable project knowledge.

Recommended opening:

```markdown
This Lovable project must follow the AuxiliumOS data spine and may not invent alternate core objects. Build only the requested vertical slice. Do not add unrelated modules. Do not create client-visible documents without release_status logic. Do not make chat messages change scope. Do not bypass Supabase RLS.
```

Why: Lovable can move very fast. It needs guardrails before generating major UI and database structure.

---

# Part 8 - Phase 4: set up GitHub workflow

## 8.1 Create issue labels

- [ ] Add module labels.
- [ ] Add type labels.
- [ ] Add risk labels.
- [ ] Add status labels.

Recommended labels:

Module labels:

- `module:accounts`
- `module:assets`
- `module:intake`
- `module:scope`
- `module:documents`
- `module:messages`
- `module:agreements`
- `module:vendors`
- `module:reporting`
- `module:security`
- `module:testing`
- `module:docs`

Type labels:

- `type:feature`
- `type:schema`
- `type:rls`
- `type:ui`
- `type:test`
- `type:docs`
- `type:bug`
- `type:refactor`

Risk labels:

- `risk:client-data`
- `risk:document-release`
- `risk:scope-control`
- `risk:professional-boundary`
- `risk:finance`
- `risk:security`

Workflow labels:

- `ready-for-agent`
- `needs-founder-decision`
- `needs-security-review`
- `needs-legal-review`
- `blocked`

Why: labels let agents and humans sort work quickly.

## 8.2 Create a GitHub Project board

- [ ] Create a project board named `AuxiliumOS Build Command`.
- [ ] Add these columns:

```text
Backlog
Ready for Spec
Spec in Progress
Needs Founder Decision
Ready for Build
In Agent Work
PR Open
AI Review
Human Review
Staging
UAT
Ready for Release
Released
Blocked
```

Why: this becomes the visual control center.

## 8.3 Create issue templates

Create issue templates for:

- [ ] Feature ticket
- [ ] Schema ticket
- [ ] RLS/security ticket
- [ ] UI ticket
- [ ] Test ticket
- [ ] Documentation ticket
- [ ] Decision required
- [ ] Bug report

Why: AI agents work best when tickets are structured.

## 8.4 Create the pull request template

- [ ] Add `.github/PULL_REQUEST_TEMPLATE.md`.

Minimum required sections:

```markdown
## Summary

## Related Issue

## Module(s)

## Files Changed

## Database Changes

## RLS / Permission Changes

## Document-Control Impact

## Scope-Control Impact

## Tests Added or Updated

## Tests Run

## Screenshots / Demo Notes

## Assumptions

## Risks

## Checklist
- [ ] Follows data spine
- [ ] No unrelated changes
- [ ] RLS considered
- [ ] Document release considered
- [ ] Scope-control impact considered
- [ ] Tests included or intentionally deferred with reason
- [ ] Docs updated
```

Why: the PR template forces every change to expose risk before merge.

## 8.5 Create the first 20 tickets

- [ ] Create the first 20 tickets from Part 18 of this document.
- [ ] Do not assign all of them to AI immediately.
- [ ] Start with the setup tickets.

Why: a clear backlog prevents panic-driven tool usage.

---

# Part 9 - Phase 5: Supabase prep

## 9.1 Create Supabase environments

- [ ] Create or plan three Supabase projects: development, staging, production.

Recommended naming:

- `auxiliumos-dev`
- `auxiliumos-staging`
- `auxiliumos-prod`

Why: AI and development work must not happen directly in production.

## 9.2 Decide what data can exist in each environment

Development:

- fake data only;
- AI tools may inspect and write if configured safely;
- no real client sensitive data.

Staging:

- fake data and approved test data;
- used for UAT;
- no unnecessary sensitive client data.

Production:

- real data;
- tightly restricted;
- no AI production writes during early build.

Why: environment separation prevents development mistakes from exposing client information.

## 9.3 Create Supabase local development plan

- [ ] Install or plan Supabase CLI.
- [ ] Use migrations for schema changes.
- [ ] Use seed data for test users and fake clients.
- [ ] Use local testing for database/RLS tests.

Why: database changes should be repeatable. Manual dashboard edits become hard to track.

## 9.4 Document the initial schema domains

- [ ] Add the final intended schema map to `docs/03-data/SCHEMA_REGISTRY.md`.

Start with these logical domains:

- `core`
- `iam`
- `account`
- `program`
- `asset`
- `readiness`
- `service`
- `rules`
- `intake`
- `scope`
- `sampling`
- `rom`
- `agreement`
- `ops`
- `docs`
- `comm`
- `vendor`
- `finance`
- `reporting`
- `integration`
- `ai`
- `audit`
- `api`

Why: even if the first implementation uses prefixed table names or fewer schemas, the logical domains should remain clear.

## 9.5 Create the tenant ownership rule

- [ ] Add this rule to `docs/04-security/RLS_POLICY_MATRIX.md`:

> Every client-owned operational table must include `account_id` or have a clear path to account ownership through a required parent record.

Why: account ownership is the basis of tenant isolation.

## 9.6 Create the no-public-client-data rule

- [ ] Add this rule:

> No table containing client, project, facility, document, invoice, agreement, or communication data may be publicly readable.

Why: public access should be limited to static brand assets or deliberately public information.

## 9.7 Create the storage policy plan

- [ ] Decide whether v1 uses Supabase Storage, external document vault, or hybrid.
- [ ] If Supabase Storage is used, define buckets before building document upload.

Recommended buckets:

- `public_brand_assets`
- `client_upload_staging`
- `internal_project_files`
- `released_client_documents`
- `field_media`
- `agreement_files`
- `vendor_documents`
- `qbr_executive_packets`
- `system_exports`
- `ai_processing_staging`

Why: storage organization should support document control, not random uploads.

## 9.8 Create test users before real users

- [ ] Define fake test users in `docs/04-security/TEST_USERS.md`.

Minimum test users:

- Auxilium System Admin
- Auxilium PM
- Auxilium Document Controller
- Client Executive
- Client Site Champion A
- Client Site Champion B
- PA Firm A User
- PA Firm B User
- Billing Contact
- Vendor User
- Removed User

Why: testing permissions requires multiple fake identities.

---

# Part 10 - Phase 6: Lovable prep

## 10.1 Create Lovable project only after rules exist

- [ ] Confirm `LOVABLE_KNOWLEDGE.md` exists.
- [ ] Confirm `DATA_SPINE.md` exists.
- [ ] Confirm `V1_SCOPE.md` exists.
- [ ] Confirm `ROLE_PERMISSION_MATRIX.md` exists.
- [ ] Create the Lovable project.

Why: Lovable should receive the rules before it creates screens or schema.

## 10.2 Connect Lovable to GitHub

- [ ] Connect Lovable to the GitHub repository.
- [ ] Confirm changes sync to GitHub.
- [ ] Do not let Lovable be the only place code exists.

Why: if the project only exists inside Lovable, continuity and backup are weaker.

## 10.3 Connect Lovable to Supabase dev only

- [ ] Connect Lovable to `auxiliumos-dev` first.
- [ ] Do not connect Lovable directly to production during prep.

Why: AI-generated changes belong in development until reviewed.

## 10.4 Add Lovable guardrail prompt

Use this every time you ask Lovable to build something:

```text
Follow the AuxiliumOS data spine. Build only the requested vertical slice. Do not invent new core objects, roles, workflow states, document states, or permission concepts. Do not make documents client-visible without release_status and access rules. Do not allow messages to alter scope. Do not add production secrets. Do not bypass RLS. If a requirement is unclear, list the assumption instead of inventing it.
```

Why: this prevents Lovable from turning one feature request into a broad architecture rewrite.

## 10.5 Build only one first vertical slice

- [ ] First Lovable build should be the foundation slice:

**Account -> User Role -> Facility -> Incident Request -> Admin Queue -> Document Upload -> Document Release -> Client View -> Audit Event**

Why: this slice proves the core system without building every module.

---

# Part 11 - Phase 7: Cursor, Claude Code, and Codex prep

## 11.1 Open the repo in Cursor

- [ ] Clone the GitHub repo to your computer or open it through Cursor.
- [ ] Confirm the repo files appear.
- [ ] Confirm `.cursor/rules` exists.
- [ ] Confirm `AGENTS.md` exists.
- [ ] Confirm `CLAUDE.md` exists.

Why: Cursor should work inside the actual project, not a random folder.

## 11.2 Use Cursor as inspection cockpit

- [ ] Use Cursor to inspect file changes.
- [ ] Use Cursor to ask repo-aware questions.
- [ ] Use Cursor to make small edits.
- [ ] Do not use Cursor to bypass the issue/branch/PR process.

Why: Cursor is powerful, but process still controls changes.

## 11.3 Configure Claude Code to read project memory

- [ ] Confirm `CLAUDE.md` is at the repo root.
- [ ] Start Claude Code inside the repo.
- [ ] Ask Claude to summarize the project from `AGENTS.md`, `CLAUDE.md`, and `PROJECT_STATE.md` before implementing anything.

Why: this proves Claude is reading the repo context.

## 11.4 Configure Codex to read AGENTS.md

- [ ] Start Codex from the repo root.
- [ ] Ask Codex to read `AGENTS.md` and `PROJECT_STATE.md`.
- [ ] Ask Codex to create no changes until assigned a ticket.

Why: Codex should operate from repository instructions, not memory.

## 11.5 Create agent roles

- [ ] Add agent role definitions to `docs/08-ai/AI_AGENT_ROLES.md`.

Recommended roles:

- Product Architect Agent
- Domain/Ontology Agent
- Database/Supabase Architect Agent
- UI/UX Build Agent
- Feature Implementation Agent
- Security/RLS Agent
- QA/UAT Agent
- Documentation/Handoff Agent
- Release Manager Agent

Why: different AI agents should not all act like generalists.

## 11.6 Create the agent handoff format

- [ ] Add the session closeout template to `docs/08-ai/AI_TOOL_RULES.md`.

Template:

```markdown
# Session Closeout

## Date

## Agent / Tool Used

## Ticket(s)

## Completed

## Files Changed

## Database Changes

## RLS Changes

## Tests Added

## Tests Run

## Test Results

## Assumptions Made

## Decisions Needed From Founder

## Risks Introduced

## Next Recommended Ticket

## Docs Updated
```

Why: this is how every new session picks up cleanly.

---

# Part 12 - Phase 8: testing and CI prep

## 12.1 Define the first business-risk tests

- [ ] Add these to `docs/07-testing/ACCEPTANCE_TEST_MATRIX.md`.

Required early tests:

- PA Firm A cannot see PA Firm B projects.
- Site Champion A cannot see Site Champion B facility unless granted.
- Draft report is not visible to client.
- Released report is visible only to authorized client users.
- Vendor cannot see invoices.
- Billing contact cannot release documents.
- Chat message cannot change scope.
- Removed user loses access.
- Document URL guessing fails.
- Scope-locked project cannot be edited without change request.

Why: these are the risks that can hurt the company.

## 12.2 Plan Playwright tests

- [ ] Create `docs/07-testing/PLAYWRIGHT_TEST_PLAN.md`.

First flows to test:

1. Login as PA client and view released project document.
2. Login as wrong PA client and confirm denial.
3. Login as site champion and submit incident.
4. Login as admin and view intake queue.
5. Upload draft document and confirm client cannot see it.
6. Release document and confirm authorized client can see it.
7. Try to change scope by message and confirm it creates a change-request draft only.

Why: Playwright proves the app works from the user's perspective.

## 12.3 Plan RLS/database tests

- [ ] Create `docs/07-testing/RLS_TEST_PLAN.md`.

First database tests:

- user can read own account records;
- user cannot read other account records;
- user can read assigned facility;
- user cannot read unassigned facility;
- user cannot read unreleased document;
- user can read released document if authorized;
- vendor can read only assigned work;
- removed user reads nothing.

Why: RLS is the real security layer.

## 12.4 Create GitHub Actions CI skeleton

- [ ] Add `.github/workflows/ci.yml`.
- [ ] Add placeholder jobs for lint, typecheck, test, and build.
- [ ] Add RLS test workflow when Supabase local tests exist.
- [ ] Add Playwright workflow when app tests exist.

Why: CI is the automated gatekeeper. It keeps broken work out of stable branches.

## 12.5 Create definition of done

- [ ] Add Definition of Done to `docs/00-control/PROJECT_STATE.md` or `docs/07-testing/ACCEPTANCE_TEST_MATRIX.md`.

Minimum Definition of Done:

- code implemented;
- tests added or updated;
- tests pass;
- permissions considered;
- document-control impact considered;
- scope-control impact considered;
- docs updated;
- PR reviewed;
- no unresolved critical risk.

Why: without a definition of done, AI will stop at “looks built.” That is not enough.

---

# Part 13 - Phase 9: backup and disaster recovery prep

## 13.1 Create backup plan

- [ ] Add `docs/09-release/BACKUP_RECOVERY_PLAN.md`.

Minimum backup plan:

- GitHub repo is primary source of code/docs.
- Weekly local clone backup.
- Weekly external hard-drive backup.
- Supabase schema exported regularly.
- Supabase migrations committed.
- Supabase seed data committed if safe.
- Important docs exported to local backup.
- Production secrets never stored in repo.

Why: backups are not optional. AI tools can make large changes quickly.

## 13.2 Create rollback plan

- [ ] Add `docs/09-release/ROLLBACK_PLAN.md`.

Rollback plan should explain:

- how to revert code;
- how to roll back a failed deployment;
- how to handle bad database migration;
- who approves rollback;
- how to notify users;
- how to preserve audit trail.

Why: the time to design rollback is before a bad release.

## 13.3 Create secrets policy

- [ ] Add secrets policy to `docs/04-security/SECURITY_GUARDRAILS.md`.

Rules:

- no secrets in GitHub repo;
- no service-role key in frontend;
- no production secrets in AI chat;
- use environment variables or approved secret manager;
- rotate exposed secrets immediately;
- document which systems hold secrets.

Why: leaked secrets can expose client data.

## 13.4 Create data classification policy

- [ ] Add a data classification section.

Recommended categories:

- Public
- Internal Auxilium
- Client Confidential
- Executive Restricted
- Legal/Dispute Sensitive
- Financial Restricted
- Facility Sensitive
- No-PHI / Patient Data Prohibited

Why: the platform needs to know what it is allowed to store and who can see it.

---

# Part 14 - Phase 10: first vertical slice readiness

Before building, confirm this checklist.

## 14.1 Foundation slice target

- [ ] The first build target is:

**Account -> User Role -> Facility -> Incident Request -> Admin Queue -> Document Upload -> Document Release -> Client View -> Audit Event**

Why: this vertical slice proves the core operational loop.

## 14.2 Foundation slice must include

- [ ] Account record.
- [ ] User profile.
- [ ] Account membership.
- [ ] Role assignment.
- [ ] Facility record.
- [ ] Incident/request form.
- [ ] Admin intake queue.
- [ ] Document metadata record.
- [ ] Upload staging state.
- [ ] Release approval state.
- [ ] Client-visible released state.
- [ ] Audit events.
- [ ] Positive permission tests.
- [ ] Negative permission tests.

Why: if the first slice does not include security and audit, the foundation is weak.

## 14.3 Foundation slice must not include

- [ ] Full ROM engine.
- [ ] Full sampling engine.
- [ ] Full QBR automation.
- [ ] Full vendor scorecards.
- [ ] Full finance integration.
- [ ] Full AI routing.
- [ ] Production client data.
- [ ] Autonomous agent deployment.

Why: overbuilding the first slice delays proof and creates risk.

## 14.4 First build prompt for AI agents

Use this style:

```text
Build only the foundation vertical slice described in issue #[number]. Follow AGENTS.md. Do not create new core objects. Do not bypass RLS. Do not add billing, ROM, sampling, or QBR logic. Include account ownership, role-aware access, document release status, and audit event placeholders. Add tests or clearly state what tests remain to be added.
```

Why: the prompt forces scope control for the coding agent.

---

# Part 15 - Daily operating procedure

## 15.1 Morning checklist

- [ ] Open GitHub Project board.
- [ ] Review `PROJECT_STATE.md`.
- [ ] Review `NEXT_ACTIONS.md`.
- [ ] Review open PRs.
- [ ] Review tickets marked `needs-founder-decision`.
- [ ] Choose the day's top 1-3 priorities.
- [ ] Confirm no one is working on overlapping schema/RLS changes.

Why: daily priority control prevents chaos.

## 15.2 Working block checklist

Before assigning an AI task:

- [ ] Confirm there is a ticket.
- [ ] Confirm the ticket has acceptance criteria.
- [ ] Confirm relevant docs are linked.
- [ ] Confirm the tool is working on the correct branch.
- [ ] Confirm the task is small enough.
- [ ] Confirm the agent knows what not to change.

Why: AI performs best with bounded tasks.

## 15.3 Review block checklist

When AI finishes:

- [ ] Read the session closeout.
- [ ] Review files changed.
- [ ] Review assumptions.
- [ ] Review risks.
- [ ] Check whether docs were updated.
- [ ] Check whether tests were added.
- [ ] Run or review tests.
- [ ] Decide whether to approve, request changes, or reject.

Why: do not accept AI work just because it looks complete.

## 15.4 End-of-day checklist

- [ ] Update `PROJECT_STATE.md`.
- [ ] Update `NEXT_ACTIONS.md`.
- [ ] Update `DECISION_LOG.md` if a decision was made.
- [ ] Update `RISK_REGISTER.md` if a risk appeared.
- [ ] Commit documentation updates.
- [ ] Push changes to GitHub.
- [ ] Back up important exports if needed.

Why: this is how every new session can start cleanly.

---

# Part 16 - Weekly operating procedure

## 16.1 Weekly demo

- [ ] Demo the current working app or prototype.
- [ ] Test one happy path.
- [ ] Test one denied-access path.
- [ ] Test one document-release path.
- [ ] Test one scope-control path if built.

Why: demos expose workflow gaps quickly.

## 16.2 Weekly security review

- [ ] Review new tables.
- [ ] Confirm RLS status.
- [ ] Review user roles.
- [ ] Review document visibility.
- [ ] Review secrets exposure.
- [ ] Review production access.

Why: security debt compounds quickly.

## 16.3 Weekly backlog cut

- [ ] Review all open tickets.
- [ ] Move nonessential features to backlog.
- [ ] Keep current sprint focused.
- [ ] Reject features that do not attach to the data spine.

Why: speed comes from disciplined focus, not unlimited activity.

## 16.4 Weekly backup

- [ ] Pull latest GitHub repo locally.
- [ ] Copy repo to external hard drive.
- [ ] Export important Supabase schema/migration state.
- [ ] Export key docs if needed.
- [ ] Confirm backups can be opened.

Why: backup failure is usually discovered too late.

---

# Part 17 - Decision queue system

When AI needs your input, it should not ask vague questions. It should create a Decision Required item.

## 17.1 Decision item format

```markdown
# Decision Required

## Decision ID
D-YYYY-###

## Area
Documents / Permissions / Scope / Finance / UI / Legal / Sampling / Security

## Question
What must be decided?

## Options
A.
B.
C.

## Recommendation
Which option is recommended and why?

## Risk If Wrong
What could break?

## Your Decision
[Blank]

## Follow-up Action
What changes after the decision?
```

## 17.2 Your job

- [ ] Answer decisions quickly.
- [ ] Do not let business decisions sit for weeks.
- [ ] Record final answer in `DECISION_LOG.md`.

Why: AI can continue work only when founder decisions are resolved.

---

# Part 18 - First 20 prep/build tickets

Create these tickets in GitHub.

## Ticket 1 - Create repository skeleton

- Module: Docs / Setup
- Goal: create folder structure and root instruction files.
- Acceptance: all required folders and files exist.

## Ticket 2 - Add AGENTS.md and CLAUDE.md

- Module: AI / Setup
- Goal: add persistent AI rules.
- Acceptance: both files exist and reference source-of-truth docs.

## Ticket 3 - Add project state and decision log

- Module: Control
- Goal: create restart/handoff system.
- Acceptance: `PROJECT_STATE.md`, `NEXT_ACTIONS.md`, `DECISION_LOG.md`, `ASSUMPTION_REGISTER.md`, `OPEN_QUESTIONS.md` exist.

## Ticket 4 - Define v1 scope and out-of-scope list

- Module: Product
- Goal: prevent overbuilding.
- Acceptance: `V1_SCOPE.md` and `OUT_OF_SCOPE.md` approved.

## Ticket 5 - Define data spine and module map

- Module: Product / Data
- Goal: lock architecture.
- Acceptance: `DATA_SPINE.md` and `MODULE_MAP.md` approved.

## Ticket 6 - Define initial role matrix

- Module: Security
- Goal: define user roles and permissions.
- Acceptance: `ROLE_PERMISSION_MATRIX.md` approved for v1.

## Ticket 7 - Define document classes and access matrix

- Module: Documents / Security
- Goal: define document class, sensitivity, release rules.
- Acceptance: `DOCUMENT_ACCESS_MATRIX.md` approved.

## Ticket 8 - Define request and document state machines

- Module: Workflows
- Goal: define controlled states.
- Acceptance: request and document workflows approved.

## Ticket 9 - Define initial Supabase schema registry

- Module: Data
- Goal: document domains and first tables.
- Acceptance: `SCHEMA_REGISTRY.md` lists domains and first-slice tables.

## Ticket 10 - Define RLS policy matrix

- Module: Security / Supabase
- Goal: specify access rules before implementation.
- Acceptance: RLS matrix includes test users and denial cases.

## Ticket 11 - Create GitHub issue templates

- Module: Workflow
- Goal: standardize ticketing.
- Acceptance: feature, schema, RLS, UI, test, docs, decision templates exist.

## Ticket 12 - Create PR template

- Module: Workflow
- Goal: standardize review.
- Acceptance: PR template includes RLS, document, scope, tests, risks.

## Ticket 13 - Add Cursor rules

- Module: AI / Developer Environment
- Goal: persistent Cursor instructions.
- Acceptance: product, security, supabase, testing, document-control rules exist.

## Ticket 14 - Add Lovable project knowledge

- Module: AI / Lovable
- Goal: prevent Lovable drift.
- Acceptance: `LOVABLE_KNOWLEDGE.md` ready to paste into Lovable.

## Ticket 15 - Add Supabase environment plan

- Module: Supabase / Deployment
- Goal: dev/staging/prod separation.
- Acceptance: environment plan and data rules documented.

## Ticket 16 - Add first test user matrix

- Module: Security / Testing
- Goal: define test identities.
- Acceptance: test users and expected permissions documented.

## Ticket 17 - Add first Playwright test plan

- Module: Testing
- Goal: define browser tests.
- Acceptance: first 7 test flows documented.

## Ticket 18 - Add first RLS/database test plan

- Module: Testing / Supabase
- Goal: define database tests.
- Acceptance: first RLS test scenarios documented.

## Ticket 19 - Create backup and rollback runbooks

- Module: Release / Safety
- Goal: prevent data/project loss.
- Acceptance: backup and rollback plans documented.

## Ticket 20 - Build first vertical-slice feature spec

- Module: Product / Build
- Goal: specify Account -> Facility -> Incident -> Document Release -> Audit slice.
- Acceptance: spec includes objects, roles, states, acceptance criteria, tests.

---

# Part 19 - First vertical slice specification outline

This is the first feature spec to create after prep.

## 19.1 Feature name

Foundation Vertical Slice: Enterprise Incident + Document Release

## 19.2 Objective

Prove the core AuxiliumOS loop by allowing an authorized client user to submit a facility incident/request, allowing Auxilium to review it in an admin queue, allowing a document to be uploaded and released through a controlled workflow, and logging audit events.

## 19.3 Objects involved

- account
- user profile
- account membership
- role assignment
- asset/facility
- incident/request
- document
- document version
- document release decision
- message or notification placeholder
- audit event

## 19.4 User roles involved

- Client Site Champion
- Client Executive Viewer
- Auxilium Intake Admin
- Auxilium Project Manager
- Auxilium Document Controller
- Removed User

## 19.5 Required behavior

- [ ] Site champion can see assigned facility.
- [ ] Site champion can submit an incident/request.
- [ ] Site champion can upload photos/documents into staging.
- [ ] Auxilium admin can see the request in intake queue.
- [ ] Auxilium admin can assign PM.
- [ ] Draft document is not visible to client.
- [ ] Document controller can release approved final document.
- [ ] Client can see released document.
- [ ] Wrong client cannot see released document.
- [ ] Audit events are created.

## 19.6 Must not do

- [ ] Must not create full ROM engine.
- [ ] Must not create full sampling engine.
- [ ] Must not create final MSA agreement engine.
- [ ] Must not allow message-based scope changes.
- [ ] Must not expose unreleased documents.
- [ ] Must not use production data.

## 19.7 Acceptance tests

- [ ] Site champion happy path works.
- [ ] Wrong user denial works.
- [ ] Draft document hidden.
- [ ] Released document visible only to authorized user.
- [ ] Removed user denied.
- [ ] Admin queue receives request.
- [ ] Audit events are written.

---

# Part 20 - Noob-safe commands and actions

This section is intentionally simple. If you are unfamiliar with command-line work, use it as a concept guide and ask an AI coding agent or technical helper to execute the exact commands in your environment.

## 20.1 Basic local workflow

Conceptual flow:

```text
1. Open project folder.
2. Pull latest changes from GitHub.
3. Create a branch for one ticket.
4. Let AI implement the ticket.
5. Run tests.
6. Commit changes.
7. Push branch.
8. Open pull request.
9. Review and merge when safe.
```

Why: this prevents unmanaged changes.

## 20.2 Branch naming examples

```text
feature/foundation-vertical-slice
schema/initial-account-asset-docs
rls/account-asset-document-access
test/document-release-flow
docs/ai-control-files
```

Why: branch names should reveal purpose.

## 20.3 Commit message examples

```text
Add project control docs
Define initial role permission matrix
Add document release workflow draft
Add Lovable project knowledge
Implement foundation incident request slice
```

Why: commit messages become project history.

---

# Part 21 - Tool-specific operating rules

## 21.1 ChatGPT Project rules

Use ChatGPT for:

- strategy;
- architecture review;
- logic review;
- creating tickets;
- evaluating risks;
- reviewing PR summaries;
- improving workflow docs.

Do not use ChatGPT alone as:

- the code source of truth;
- the decision log;
- the project state file;
- the production approval system.

## 21.2 Lovable rules

Use Lovable for:

- fast UI screens;
- portal flows;
- app shell;
- admin dashboard layouts;
- forms;
- status cards.

Do not use Lovable for:

- final data model decisions;
- professional boundary decisions;
- production security decisions;
- autonomous document release;
- scope approval logic without review.

## 21.3 Supabase rules

Use Supabase for:

- database;
- auth;
- RLS;
- storage;
- Edge Functions;
- migrations;
- local testing.

Do not use Supabase incorrectly by:

- leaving client tables public;
- relying on UI filters for security;
- exposing service-role key;
- editing production manually without migration plan;
- storing secrets in regular tables or code.

## 21.4 Cursor rules

Use Cursor for:

- code inspection;
- targeted edits;
- repo-aware AI questions;
- reviewing changes;
- applying project rules.

Do not use Cursor to bypass:

- issue tickets;
- branch workflow;
- PR review;
- tests;
- documentation updates.

## 21.5 Claude Code rules

Use Claude Code for:

- implementing tickets;
- refactoring;
- writing tests;
- updating docs;
- debugging.

Require Claude to:

- read `AGENTS.md`;
- read `CLAUDE.md`;
- summarize the ticket;
- identify files changed;
- run tests where possible;
- provide closeout.

## 21.6 Codex rules

Use Codex for:

- local implementation;
- cloud issue work;
- test writing;
- PR review;
- CI fixes;
- codebase analysis.

Require Codex to:

- read `AGENTS.md`;
- stay within ticket scope;
- avoid production secrets;
- update docs when behavior changes.

## 21.7 GitHub Copilot agent rules

Use Copilot agent only for bounded GitHub issues.

Good tasks:

- add tests;
- fix a small bug;
- update documentation;
- refactor one component;
- add one UI component.

Bad tasks:

- redesign database;
- change permission model;
- build whole portal;
- update professional boundaries;
- deploy production.

## 21.8 n8n and LangGraph later

Add n8n later for:

- approval queues;
- daily summaries;
- human-in-the-loop workflows;
- notification workflows.

Add LangGraph later for:

- durable multi-agent orchestration;
- planner/worker/judge loops;
- complex agent workflow state.

Do not start with these. Get the repo workflow working first.

---

# Part 22 - The exact restart protocol

When you open a new AI chat or tool session, use this sequence.

## 22.1 For ChatGPT

Paste or attach:

1. Current `PROJECT_STATE.md`.
2. Current `NEXT_ACTIONS.md`.
3. The specific ticket/spec.
4. Any relevant file snippets.

Prompt:

```text
You are working on AuxiliumOS. The repository is the source of truth. Read the project state and ticket. Do not rely on prior chat memory. Confirm the goal, list assumptions, and propose the next safe action.
```

## 22.2 For Claude Code

Prompt:

```text
Read AGENTS.md, CLAUDE.md, PROJECT_STATE.md, and this ticket. Do not edit yet. Summarize the objective, affected files, tests required, risks, and any missing decisions.
```

## 22.3 For Codex

Prompt:

```text
Read AGENTS.md and PROJECT_STATE.md. Work only on issue #[number]. Do not change unrelated files. Do not alter RLS or schema unless the issue explicitly requires it. Provide a closeout when finished.
```

## 22.4 For Lovable

Prompt:

```text
Use the Lovable project knowledge and AuxiliumOS data spine. Build only this specific screen/flow: [describe]. Do not invent new core objects or bypass document release, RLS, scope, or authorization rules. List assumptions before making broad changes.
```

Why: every session begins by grounding the tool in the same project state.

---

# Part 23 - Beginner explanation of why this is not overkill

This setup may feel like a lot before code exists. It is not overkill because the app you are building is not a simple website.

AuxiliumOS will handle:

- client account records;
- enterprise facility data;
- site passports;
- project requests;
- sensitive documents;
- scope records;
- sampling authorizations;
- financial approvals;
- vendor assignments;
- QBR reporting;
- legal/professional boundaries;
- incident workflows;
- audit history.

The danger is not that AI cannot generate screens. The danger is that it can generate the wrong structure very quickly.

The prep system prevents that by making the correct structure unavoidable.

---

# Part 24 - What not to do

Do not:

- [ ] Ask Lovable to build the whole app in one prompt.
- [ ] Start with production data.
- [ ] Give AI production write access.
- [ ] Skip RLS.
- [ ] Let chat messages change project scope.
- [ ] Allow document release without approval.
- [ ] Store secrets in the repo.
- [ ] Build custom accounting first.
- [ ] Build every module horizontally before a vertical slice works.
- [ ] Create one giant `projects` table with everything in it.
- [ ] Create random tables because a tool suggests them.
- [ ] Let AI invent professional/legal boundaries.
- [ ] Merge code without review.
- [ ] Keep important decisions only in chat.

---

# Part 25 - Prep completion checklist

You are ready to begin app build only when this is complete.

## 25.1 Repository readiness

- [ ] Private GitHub repo exists.
- [ ] Branch protection exists.
- [ ] Repo skeleton exists.
- [ ] Root AI instruction files exist.
- [ ] Control docs exist.
- [ ] Issue templates exist.
- [ ] PR template exists.
- [ ] Project board exists.
- [ ] Labels exist.

## 25.2 Product readiness

- [ ] Data spine documented.
- [ ] Module map documented.
- [ ] V1 scope documented.
- [ ] Out-of-scope list documented.
- [ ] First vertical slice spec documented.
- [ ] First 20 tickets created.

## 25.3 Security readiness

- [ ] Role matrix documented.
- [ ] RLS matrix documented.
- [ ] Test users documented.
- [ ] Document access matrix documented.
- [ ] Secrets policy documented.
- [ ] Data classification policy documented.

## 25.4 Workflow readiness

- [ ] Request state machine documented.
- [ ] Document release workflow documented.
- [ ] Scope state machine documented.
- [ ] Change authorization workflow documented.
- [ ] Emergency exception workflow documented.

## 25.5 AI readiness

- [ ] ChatGPT Project created.
- [ ] Lovable project knowledge prepared.
- [ ] Cursor rules prepared.
- [ ] Claude instructions prepared.
- [ ] Codex instructions prepared.
- [ ] Session closeout template documented.

## 25.6 Build readiness

- [ ] Supabase dev/staging/prod plan exists.
- [ ] Lovable connected to GitHub plan exists.
- [ ] Lovable connected only to dev Supabase initially.
- [ ] Playwright plan exists.
- [ ] RLS test plan exists.
- [ ] CI skeleton plan exists.
- [ ] Backup and rollback plans exist.

If every box above is checked, the prep phase is complete and the build can begin.

---

# Part 26 - References and tool documentation consulted

Use official documentation as the authority when the UI changes or a tool behaves differently.

- Supabase Row Level Security documentation.
- Supabase local development and database testing documentation.
- Supabase MCP documentation.
- Lovable Supabase integration documentation.
- Lovable GitHub integration documentation.
- Lovable Knowledge documentation.
- Claude Code memory and best-practices documentation.
- OpenAI Codex AGENTS.md and CLI documentation.
- Cursor Rules and MCP documentation.
- GitHub Actions and GitHub Copilot documentation.
- Playwright testing documentation.
- ChatGPT Projects documentation.
- n8n human-in-the-loop documentation.
- LangGraph orchestration documentation.

---

# Final instruction

Do not start app construction until the prep checklist is complete.

The fastest path is not skipping prep. The fastest path is making prep so strong that every AI agent can move quickly without rethinking the architecture or creating hidden failures.
