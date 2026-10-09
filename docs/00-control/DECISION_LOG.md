# Decision Log

This file records important AuxiliumOS decisions. If a decision is not recorded here or in another source-of-truth repo file, it does not count.

## Decision 001 — GitHub is the source of truth

Date: 2026-06-22

Decision:
The GitHub repository is the permanent source of truth for AuxiliumOS. ChatGPT, Lovable, Cursor, Claude Code, Codex, and other tools are workers that must follow the repository.

Reason:
Long chats can drift or lose context. The repository preserves decisions, files, tickets, workflows, and history.

Status:
Approved

## Decision 002 — AuxiliumOS uses one canonical data spine

Date: 2026-06-22

Decision:
AuxiliumOS follows this data spine:

Client Account → Program/MSA → Portfolio → Asset/Facility → Zone/Area → Incident → Project Request → Scope Record → Authorization → Project → Tasks/Work Orders -> Deliverables → Documents → Communications → Financial Records -> Reports/Dashboards -> Audit Events.

Reason:
Every module must connect to the same operating truth so the system can support both simple clients and Nutex-style enterprise clients.

Status:
Approved

## Decision 003 — AuxiliumOS is a modular suite

Date: 2026-06-22

Decision:
AuxiliumOS will be a modular suite with one shared data spine, not one giant app and not disconnected apps.

Reason:
Small clients need simplicity. Enterprise clients need assets, site passports, incident workflows, vendors, QBRs, dashboards, and MSA logic. Modular design supports both without forcing every client into the same portal complexity.

Status:
Approved

## Decision 004 — Client-facing simplicity and internal technical truth are separate

Date: 2026-06-22

Decision:
Clients see simple request tiles and guided forms. Internally, AuxiliumOS maps those requests to issue, intent, modules, sampling, deliverables, scope limitations, ROM variables, and review gates.

Reason:
Clients should not need to understand Auxilium's full technical service ontology before asking for help.

Status:
Approved

## Decision 005 — Client type influences what appears first, not what is possible

Date: 2026-06-22

Decision:
Client type may control dashboard defaults, terminology, favorite templates, and visible shortcuts, but it should not permanently trap a client inside a narrow service category.

Reason:
Public adjusters, property managers, healthcare systems, contractors, attorneys, industrial clients, and property owners can all have overlapping needs. AuxiliumOS must guide without over-restricting.

Status:
Approved

## Decision 006 — Chat messages cannot change scope

Date: 2026-06-22

Decision:
A message or chat thread can create a task, question, clarification, or change request draft. It cannot directly change approved scope.

Reason:
Scope changes require review, authorization, limitation updates, ROM/cap review, and audit trail.

Status:
Approved

## Decision 007 — Client-visible documents require release workflow

Date: 2026-06-22

Decision:
No document becomes client-visible by default. Client-visible documents require classification, versioning, release approval, permission check, and audit event.

Reason:
Document control is one of the core risk protections in AuxiliumOS.

Status:
Approved

## Decision 008 — AI may draft and build, but not decide business authority

Date: 2026-06-22

Decision:
AI may propose, draft, build, review, summarize, test, and flag issues. AI may not silently decide legal, professional, financial, scope, sampling, agreement, document-release, or production authority.

Reason:
Those decisions create business and professional liability and require founder or qualified human approval.

Status:
Approved

## Decision 009 — No real client data during prep

Date: 2026-06-22

Decision:
No real client-sensitive data, PHI, API keys, service-role keys, passwords, or live private client documents may be placed in GitHub, ChatGPT, Lovable, screenshots, Cursor prompts, Claude Code prompts, Codex prompts, or other AI chats during prep.

Reason:
Security and data governance must exist before real client data is used.

Status:
Approved

## Decision 010 — No client-data table without RLS

Date: 2026-06-22

Decision:
Any future Supabase table containing client, account, asset, project, document, message, financial, or user access data must have Row Level Security planned, tested, and documented before production use.

Reason:
AuxiliumOS will contain sensitive client and project information. Access must be enforced by backend security, not just UI hiding.

Status:
Approved

## Decision 011 — Work happens through issue, branch, PR, and merge

Date: 2026-06-22

Decision:
After the starter setup, project work should happen through a GitHub issue, a dedicated branch, a commit, a push, a pull request, review, merge, and board/status update.

Reason:
This creates traceability and prevents AI tools or humans from making uncontrolled changes directly to main.

Status:
Approved

## Decision 012 — The first build slice is the foundation vertical slice

Date: 2026-06-22

Decision:
The first app build slice after prep will be:

Account → User Role → Facility → Incident Request → Admin Queue → Document Upload → Document Release → Client View → Audit Event.

Reason:
This proves the operating model before attempting the full enterprise platform or project-scoping engine.

Status:
Approved

## Decision 013 — Playwright, GitHub Actions, Supabase CLI, Claude Code, and Codex are later-stage tools

Date: 2026-06-22

Decision:
These tools should not be rushed before the control docs, repo workflow, and first issue process are understood. Playwright and CI come after there is an app/testable workflow. Supabase CLI comes when migrations are ready. Claude Code and Codex come after issue discipline is working.

Reason:
Adding too many tools before the control layer is stable increases confusion and risk.

Status:
Approved

## Decision 014 — The no-PHI posture is the default until formally changed

Date: 2026-06-22

Decision:
AuxiliumOS v1 should be designed around facility, environmental, project, asset, document, and operational data — not patient medical data. Any PHI-capable workflow requires separate legal, security, contractual, and platform review.

Reason:
Healthcare clients may be part of the future system, but the safest v1 posture is facility data only.

Status:
Approved


---

# Minimum Schema Blocker Decisions — 2026-07-10

Source issue: #72 — Minimum schema blocker decisions for foundation slice

Decision scope:

Dev-schema planning only.

Decisions recorded:

1. Account membership model for dev schema: account-scoped membership concept may be planned for fake/dev schema only.
2. Minimum static roles for fake/dev testing: System Admin, Intake Admin, Document Controller, Site Champion, Project Requester, Document Viewer, Removed/Suspended User.
3. Document grant model for first slice: document access must not rely on account membership alone; explicit document grants deferred.
4. Document release authority stance: release state may be represented for schema planning only; final release authority deferred.
5. Audit event visibility: internal-only for now; client-visible audit deferred.
6. Auth identity linkage: future auth identity linkage may be planned; auth setup deferred.
7. Storage: deferred.
8. RLS helper design: deferred.
9. No-PHI: confirmed.
10. Fake/demo seed data only: confirmed.

Decision status:

Approved for dev-schema planning only / Not production-approved / Not final business authority.

Next safe issue:

Foundation migration control packet

Not authorized:

- Migrations
- Supabase tables
- Auth
- Storage
- RLS
- Production
- Real client data
- PHI
- Secrets

## Decision 015: full-system development and nonblocking recommendations
Date: 2026-10-08. Source: current explicit owner instructions.
The destination remains all 20 modules. Build recommended reversible defaults and record owner-only choices without stopping unrelated development. Existing preparation-only restrictions and tool phasing in Decision 013 are historical; the foundation in Decision 012 is a milestone, not final scope. Decision 008 continues to prohibit silently fabricating final business/professional approval. Current execution: AGENTS.md and EXECUTION_PROTOCOL.md. Status: owner-directed development mandate, not blanket production authorization.

## Decision 016: independent Moldo integration; companion deferred
Date: 2026-10-08. Source: current explicit owner direction.
Moldo runs its own daily operation. OS serves enterprise/portfolio customers and authorized Auxilium executives/managers through scoped Moldo integration; Moldo-only users have no OS visibility. Software boundaries preserve optional future separation. Companion redesign is deferred. Technical contract: ADR-001-DOMAIN-AND-MOLDO-BOUNDARIES.md. Legal entity/IP/sale terms are not decided by this record.

## Decision 017: evidence-based continuation and minimal owner interruption
Date: 2026-10-08. Source: current explicit owner instructions.
Meaningful source changes, decisions, tests and handoffs belong in GitHub with verified push when available. Cursor opens that same repository. Use bounded specialist agents, one integration lead, current evidence and compact checkpoints. Never claim every inaccessible conversation was reviewed, a static test proved production, or the repository was pushed without observation. Platform access gaps block only the affected external step.
