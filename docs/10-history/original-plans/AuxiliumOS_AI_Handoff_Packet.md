# AuxiliumOS AI Handoff Packet

Paste this into any new AI chat before continuing work on AuxiliumOS.

## Project identity

Project name: AuxiliumOS.

Purpose: Build a modular operating suite for Auxilium Environmental with one shared data spine and separate purpose-built modules for account management, project intake, scoping, scope control, asset/site passport management, document control, project execution, communication routing, finance/authorization, vendor governance, reporting, rules/templates, and AI-assisted operations.

Primary rule: Do not treat this as one giant app. Do not treat modules as disconnected apps. Use one shared data spine with strict module boundaries.

## North star

AuxiliumOS must make complex environmental consulting, industrial hygiene, property assessment, restoration consulting, technical documentation, and enterprise facility-protection workflows structured, auditable, teachable, and repeatable without replacing professional judgment.

Automation may classify, prompt, draft, summarize, estimate, and route. Auxilium must approve, revise, limit, decline, sign, release, and professionally review.

## Canonical object chain

Account -> Program/MSA -> Portfolio -> Asset -> Zone/Area -> Incident -> Project Request -> Scope Record -> Authorization -> Project -> Work Orders/Tasks -> Deliverables -> Documents -> Communications -> Invoices/Costs -> Reports -> Audit Events

Do not rename these objects without explicit approval.

## Source-of-truth hierarchy

1. Signed agreement / authorization.
2. Approved scope record.
3. Approved change authorization.
4. Final released deliverable.
5. Auxilium internal technical review.
6. Project manager notes.
7. Client-submitted request.
8. Client chat/messages.
9. Uploaded third-party documents.
10. Unreviewed AI summaries.

Client messages do not change scope. Uploaded documents do not become Auxilium opinions until reviewed. AI summaries are not authoritative.

## Core modules

1. Core: identity, access, audit, object IDs, notifications.
2. Accounts: client profile, users, signers, billing, approvals, account settings.
3. Programs/MSA: commercial framework, covered services/assets, rates, response rules.
4. Assets/Site Passport: facilities, properties, zones, critical assets, response maps, readiness.
5. Requests/Scoping: issue x intent intake, dynamic questions, smart prompts, sampling authorization, scope record.
6. Projects/Work Command: execution, tasks, PMs, field work, change request initiation.
7. Documents: vault, classes, versions, release control, audit.
8. Messages: context-linked communication, routing, technical review gates.
9. Agreements/Finance: ROMs, caps, authorizations, invoices, reserves, pass-through controls.
10. Vendors: vendor profiles, documents, licenses, territories, scorecards.
11. Reports: dashboards, QBRs, value ledgers, executive reporting.
12. Rules/Ontology: service families, templates, triggers, limitations, agreement blocks, versions.

## Non-negotiable guardrails

- Backend/database permissions are mandatory; UI hiding is not security.
- Every important action creates an audit event.
- Every document has class, version, status, release state, and access rules.
- No client-visible document is released without approval.
- No field work starts without authorization unless emergency exception is approved.
- No chat/message can approve a scope change.
- Sampling/testing is never assumed; it has explicit authorization status.
- Asbestos, lead, HVAC, engineering, legal, medical, claim/coverage, fire origin/cause, abatement, hazmat, and other specialist boundaries must be explicit.
- AI must not invent internal rates, signers, legal terms, sample averages, approval thresholds, client permissions, or professional conclusions.
- Build one small testable ticket at a time.
- No code merge without tests.
- No permission feature without permission tests.
- No document feature without release/audit tests.
- No workflow feature without state-transition tests.

## AI behavior rules

When helping with planning:

- Use the canonical terms.
- Identify unresolved business decisions as TODO.
- Do not flatten Auxilium’s services into a generic menu.
- Preserve module boundaries.
- Make assumptions explicit.
- Prefer structured specs, checklists, workflows, acceptance criteria, and test cases.

When helping with coding:

- Work only on the requested ticket/module.
- Do not rename canonical objects.
- Do not change database structure without explaining migration impact.
- Do not add broad features outside the ticket.
- Include tests.
- Include audit events where required.
- Include server-side permission checks.
- Update documentation.
- At the end, provide files changed, tests run, risks, and next steps.

## Standard AI coding ticket format

Objective:

Module:

Objects touched:

User roles involved:

Permissions required:

Audit events required:

Workflow states involved:

Document classes involved:

UI behavior:

Backend behavior:

Validation rules:

Tests required:

Data migration impact:

What not to change:

Definition of done:

Open TODOs:

## Session closeout format

At the end of each AI session, produce:

1. What was completed.
2. Files created/changed.
3. Tests added/run.
4. Business assumptions made.
5. Open TODOs.
6. Risks introduced.
7. Next recommended ticket.
8. Status ledger update text.

## Current status fields to update before each new chat

Current phase: ______________________________
Current module: ______________________________
Current branch/repo: ______________________________
Last completed ticket: ______________________________
Files changed last session: ______________________________
Tests currently passing: ______________________________
Open blocker: ______________________________
Next ticket: ______________________________
Current unanswered business questions: ______________________________
Current architecture version: ______________________________
