# AuxiliumOS AI Context Packet

Use this file at the start of any new AI chat about the AuxiliumOS project. Paste it first, then add the specific task.

## Current mission
Build AuxiliumOS: a modular operating suite for Auxilium Environmental that manages client accounts, assets/facilities, project requests, scope records, authorizations, documents, messages, vendors, financial controls, reporting, and audit history through one shared data spine.

## North star
One perfect data spine with separate, purpose-built modules. Not one giant app. Not disconnected mini-apps.

Client users experience one clean portal. Internally, Auxilium runs a modular suite with strict permissions, document control, audit events, professional review, and state machines.

## Canonical data spine
Client Account → Program / MSA → Portfolio → Asset / Facility / Property → Zone / Area → Incident → Project Request → Scope Record → Authorization → Project → Work Orders / Tasks → Deliverables → Documents → Communications → Financial Records → Reports / Dashboards → Audit Events

Every feature must attach to this chain or clearly explain why it is outside the product.

## Modules
1. Core — identity, roles, permissions, global IDs, audit, notifications.
2. Accounts — client profile, module access, rates, signers, approvals, client-specific terminology.
3. Assets — facilities/properties, site passports, zones, contacts, maps, critical assets, readiness.
4. Requests — issue × intent intake, dynamic questions, smart prompts, sampling authorization, deliverables, Auxilium review.
5. Projects / Incident Command — accepted work, tasks, schedule, PM assignment, field updates, change requests, closeout.
6. Documents — canonical vault, versions, release states, access classes, view/download audit.
7. Messages — context-linked communications, routing, review gates, no chat-based scope changes.
8. Finance / Authorization — ROM assumptions, caps, agreements, signers, invoices, pass-throughs, readiness reserve ledger.
9. Vendors — vendor profiles, licenses, insurance, rates, territories, assignments, scorecards.
10. Reports — dashboards, QBRs, value ledgers, readiness scores, risk rollups.
11. Rules / Ontology — service families, templates, trigger rules, sampling modules, limitation language, state machines.

## Truth hierarchy
1. Signed agreement / authorization
2. Approved scope record
3. Approved change authorization
4. Final released deliverable
5. Auxilium internal technical review
6. Project manager notes
7. Client-submitted request
8. Client chat messages
9. Uploaded third-party documents
10. Unreviewed AI summaries or drafts

Never let a lower-level source override a higher-level source.

## Non-negotiable guardrails
- Every request requires Auxilium review before acceptance.
- Every scope has included items, excluded items, assumptions, limitations, deliverables, sampling status, payer, signer, and change approver.
- Chat cannot change scope. Chat can create a task or change request only.
- Documents use one canonical file record with version, release state, access class, and audit trail.
- No client-visible technical opinion, report release, sampling decision, or professional conclusion is AI-final.
- No production use with sensitive client data until permissions, document control, backups, and security checks are tested.
- Do not build custom accounting first. Track ROM/caps/invoice status and integrate/export later.
- Do not build microservices first. Use a modular monolith with strict domain boundaries.
- No feature can ship without tests, especially permission tests.
- No licensed/specialty role is implied unless Auxilium is properly licensed/engaged or a qualified partner is clearly responsible.

## Known AI failure risks to prevent
Overbuilding; weak permissions; bad document control; no audit trail; replacing licensed specialists; letting chat change scope; custom accounting too early; AI-generated code without tests; one giant app; complicated UI; no professional review; ambiguous domain names; unclear workflows; vague edge cases; hidden business rules; security assumptions; document release mistakes; compliance-sensitive boundary failures; large unstructured codebase.

## Required durable docs
Keep these in `/docs` and update them after significant work:
- PROJECT_BRIEF.md
- ROADMAP.md
- DECISION_LOG.md
- GLOSSARY.md
- RULE_REGISTRY.md
- PERMISSIONS_MATRIX.md
- DOCUMENT_CONTROL.md
- TEST_SCENARIOS.md
- AI_HANDOFF.md

## Chat handoff protocol
At the end of a long AI session, ask the model to produce:
1. Decisions made
2. Files changed
3. New or modified rules
4. New or modified object definitions
5. Tests added or still needed
6. Open risks
7. Unresolved homework questions
8. Next 3 tickets
9. Updated paste-in context for the next chat

## Feature ticket template
Use this before asking an AI coding agent to build anything:

**Feature name:**
**Purpose:**
**User role(s):**
**Objects affected:**
**Workflow state(s):**
**Permissions:**
**Client-visible behavior:**
**Internal behavior:**
**Data created/changed:**
**Audit events:**
**Document-control effects:**
**Professional-review gates:**
**Out of scope:**
**Acceptance criteria:**
**Tests required:**
**Rollback plan:**

## Current recommended build sequence
Phase 0 — Logic foundation
Phase 1 — Core Project Portal
Phase 2 — Scoping / ROM / Authorization Engine
Phase 3 — Asset / Portfolio Lite
Phase 4 — Enterprise Asset / Site Passport
Phase 5 — Vendor / Finance / QBR
Phase 6 — AI-assisted operations

## Default instruction for a new AI chat
You are continuing the AuxiliumOS project. Follow the canonical data spine, modules, truth hierarchy, and non-negotiable guardrails in this context packet. Do not invent business rules. If internal information is missing, mark it as a homework question instead of assuming it. Build or reason in small, testable increments. Do not let chat change scope, do not weaken permissions, and do not create client-visible technical conclusions without professional review gates.
