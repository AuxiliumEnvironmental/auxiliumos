# AuxiliumOS Master Map, Guardrails, and Development Roadmap

## Document purpose

This document is the controlling overview for the AuxiliumOS platform initiative. It is intended to be used before coding, during AI-assisted development, during future handoffs between AI chats, and during internal decision-making. It defines the platform end state, the one-data-spine architecture, module boundaries, workflow rules, object relationships, control gates, and development discipline required to prevent the project from becoming a fragile, overbuilt, ungoverned system.

The goal is not to build one giant app. The goal is to build one perfect data spine with separate purpose-built modules. A client should experience one clean portal. Auxilium should operate a modular suite. The data, audit, access, document, scope, and authorization logic must remain unified.

## North star

AuxiliumOS is the future operating platform for Auxilium Environmental. It should become the controlled system for client intake, project scoping, account data, asset intelligence, incident coordination, document control, communication routing, vendor governance, agreement authorization, ROM assumptions, change control, and executive reporting.

The platform should make complex consulting work structured, teachable, auditable, and repeatable without pretending professional judgment can be replaced by automation.

The system should make every important decision answerable later:

- Who requested the work?
- What account, asset, area, project, and incident was involved?
- What issue did the client think they had?
- What did they want Auxilium to do?
- What facts, unknowns, safety issues, and documents were submitted?
- What did the system suggest?
- What did Auxilium suggest?
- What did the client accept, decline, or defer?
- What was included, excluded, limited, and authorized?
- Who was allowed to sign, approve cost, approve sampling, approve changes, and view documents?
- What deliverables were promised?
- What documents were released, to whom, and when?
- What changed after approval?
- What final work was performed?
- What actuals should improve future ROMs?

## Non-negotiable architecture decision

Build a modular operating suite, not a monolithic mega-app and not disconnected mini-apps.

Correct structure:

- One shared identity and access model.
- One shared account/client master record.
- One shared object graph for account, program, portfolio, asset, zone, incident, project request, scope, authorization, project, document, communication, vendor, invoice, report, and audit event.
- One shared audit/event log.
- One shared document-control policy.
- Separate modules with strict responsibilities.
- Account-specific client portal experiences.
- Internal admin command center with stronger controls than the client portal.

Incorrect structure:

- Separate apps with separate databases and duplicated client/project/document records.
- One giant screen where every client sees every feature.
- Generic chat or email threads that can change scope.
- A file drive masquerading as a document-management system.
- AI-generated code added directly into production without tests and review.
- A system where business rules are hidden inside code and cannot be inspected or versioned.

## Master object chain

Everything in AuxiliumOS should hang from this chain:

Account -> Program/MSA -> Portfolio -> Asset -> Zone/Area -> Incident -> Project Request -> Scope Record -> Authorization -> Project -> Work Orders/Tasks -> Deliverables -> Documents -> Communications -> Invoices/Costs -> Reports -> Audit Events

Not every client will use every object. A simple public-adjuster client may use Account -> Project Request -> Scope -> Authorization -> Project -> Documents -> Messages -> Invoice -> Audit Events. A Nutex-style enterprise client may use the full chain.

The chain is still the controlling model. Simple clients use a simplified view of the same system, not a separate system.

## Source-of-truth hierarchy

When two records conflict, the system should resolve truth in this order:

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

Client chat never outranks signed scope. Uploaded contractor documents never become Auxilium’s position until reviewed. AI summaries are never authoritative.

## Canonical terms

Use these names consistently across specifications, code, AI prompts, tickets, database labels, and UI copy.

### Account

The company, firm, organization, or person Auxilium serves. An account owns users, permissions, agreements, pricing rules, request templates, documents, projects, and business settings.

### Program / MSA

A commercial operating framework that applies to an account, portfolio, or asset group. Examples include a national healthcare MSA, property-management MSA, public-adjuster project agreement, attorney expert agreement, or preferred services arrangement.

### Portfolio

A grouping of assets under an account or program. A portfolio may be regional, operational, ownership-based, client-defined, or program-defined.

### Asset

A property, facility, site, building, or client-managed location. Enterprise clients may have extensive asset records. One-off clients may have a simple property record.

### Zone / Area

A subpart of an asset: room, unit, wing, floor, department, containment zone, roof area, mechanical room, or affected work area.

### Incident

An event or condition that may generate one or more projects. Examples: water intrusion, fire/smoke event, odor complaint, sewage event, chemical spill, construction containment breach, or IAQ complaint.

### Project Request

The client’s structured pre-acceptance submission. It records what the client thinks the issue is, what they want Auxilium to do, what is known, what is unknown, what is urgent, who is paying, who can approve, and what safety/document/access conditions exist.

### Scope Record

The approved truth of what Auxilium agreed to do and not do. It records included modules, exclusions, limitations, assumptions, sampling status, deliverables, approved areas, ROM basis, and change authorization rules.

### Authorization

The commercial permission to proceed. It may be a signed agreement, service authorization, emergency authorization, change authorization, sampling authorization, cap approval, or MSA authorization event.

### Project

An accepted Auxilium engagement with assigned team, tasks, schedule, documents, deliverables, costs, status, and closeout.

### Service Module

A unit of internal technical work. Client-facing wording may be simple; internal modules must remain precise.

### Technical Method

How work is performed. Examples: visual observation, moisture meter, thermal imaging, borescope, tape lift, surface wipe, bulk sample, personal air sample, direct-reading instrument, or chain of custody.

### Sampling Module

A structured testing object with sample type, analyte, method, media, lab fee, turnaround, QA/QC, interpretation, scaling basis, authorization status, and limitation if declined.

### Deliverable

A work product: report, summary, protocol, PRV report, lab summary, expert narrative, 3D walkthrough, floor plan, measurement package, QBR packet, site passport, or addendum.

### Document

A controlled file with owner, object links, version, status, access class, release state, view/download audit, expiration, retention, and legal hold status.

### Communication Thread

A controlled message thread linked to an account, asset, incident, project, document, invoice, request, agreement, or task. No orphan messages.

### Vendor

A third-party entity with service category, region, licenses, insurance, rates, approval status, restrictions, performance scorecard, assignments, and documents.

### Audit Event

An immutable record of an important action, decision, change, approval, view, download, release, status change, permission change, or system event.

## Module map

### Module 0: Core

Owns:

- Identity.
- Authentication.
- Account isolation.
- Role and permission engine.
- Event/audit log.
- Object IDs.
- Notification bus.
- Global search indexing.
- System settings.
- Integration registry.

Does not own:

- Business-specific scoping logic.
- Project technical decisions.
- Document release decisions.
- Finance/accounting rules beyond shared infrastructure.

Connects to:

- Every module.

Forbidden:

- Hard-coding client-specific business logic directly into Core.
- Allowing frontend-only permission enforcement.
- Allowing important actions without audit events.

### Module 1: Accounts

Owns:

- Client master profile.
- Client type tags.
- Account tier.
- MSA/program links.
- Authorized users.
- Authorized signers.
- Billing contacts.
- Approval thresholds.
- Rate schedules.
- Account-specific terminology.
- Enabled modules.
- Hidden or deprioritized modules.
- Default request templates.
- Custom request templates.
- Preferred deliverables.
- Safety/access instructions.
- Document retention defaults.
- Internal account owner.

Does not own:

- Deep facility details.
- Project execution.
- Report release.
- Vendor performance scoring.

Connects to:

- Programs, portfolios, assets, requests, projects, documents, finance, messages, reports, and rules.

Forbidden:

- Using client type as a hard limitation. Client type influences what is shown first, not what is possible.

### Module 2: Programs / MSA

Owns:

- National or account-specific operating frameworks.
- Covered services.
- Covered assets.
- Commercial term.
- Site activation logic.
- Response rules.
- Rate cards.
- Included vs billable classification.
- Readiness reserve rules.
- QBR obligations.
- Data export/transition terms.
- Professional boundary statements.

Does not own:

- The actual technical scope of a specific project.
- Detailed facility records.
- Document release decisions.

Connects to:

- Accounts, portfolios, assets, requests, finance, reports, vendors, and rules.

Forbidden:

- Letting broad MSA language become unlimited field work.
- Allowing local users to authorize spend outside their authority because the account has an MSA.

### Module 3: Portfolio / Assets / Site Passport

Owns:

- Asset list.
- Facility/property profile.
- Site contacts.
- Access rules.
- Sensitive areas.
- Critical operations.
- Floor plans and maps.
- Utility/shutoff references.
- Critical asset registry.
- Response maps.
- Site cache inventory.
- Vendor matrix.
- Site incident history.
- Site project history.
- Site readiness score.
- Site passport.
- Compliance-support calendar for enterprise accounts.

Does not own:

- Technical scope acceptance.
- Sampling decisions.
- Report opinions.
- Vendor contract liability.

Connects to:

- Accounts, programs, incidents, projects, documents, vendors, readiness, QBR, and messages.

Forbidden:

- Storing patient data as a normal facility record.
- Treating asset profile data as a technical conclusion.
- Becoming a full CMMS before the core platform is mature.

### Module 4: Requests / Scoping Engine

Owns:

- Client-facing request tiles.
- Project issue.
- Service intent.
- Dynamic questions.
- Event facts.
- Area/unit/building selection.
- Safety/access flags.
- Prior work.
- Document upload request.
- Sampling authorization preference.
- Deliverable selection.
- Smart prompt logic.
- Triggered recommendations.
- Auxilium review workflow.
- Reclassification.
- ROM assumptions.
- Scope limitation assembly.
- Scope record generation.

Does not own:

- Execution after approval.
- Final report authorship.
- Accounting system.
- Vendor network management.

Connects to:

- Accounts, assets, incidents, projects, documents, finance, agreements, messages, and rules.

Forbidden:

- Submitting a free-text request without issue, intent, site, payer, signer, and scope context.
- Treating sampling as automatically included.
- Treating suggestions as approved scope.
- Allowing automation to final-approve high-risk projects.

### Module 5: Projects / Work Command

Owns:

- Accepted project records.
- Project status.
- PM assignment.
- Field staff assignment.
- Reviewer assignment.
- Site visit schedule.
- Task lists.
- Work orders.
- Field updates.
- Client-visible status updates.
- Internal notes.
- Change request initiation.
- Closeout checklist.
- Project actuals.

Does not own:

- Original scope truth.
- Document release authorization.
- Rate card governance.
- Client account settings.

Connects to:

- Scope records, documents, messages, vendors, invoices, reports, and audit events.

Forbidden:

- Expanding scope through PM notes or field updates without change authorization.
- Releasing unrevised technical opinions directly from the field.

### Module 6: Documents

Owns:

- File storage references.
- Document classes.
- Versioning.
- Draft/final status.
- Internal/external visibility.
- Release workflow.
- Superseded/replaced status.
- Legal hold.
- Retention.
- Download packages.
- View/download audit.
- Document-to-object links.

Does not own:

- Whether technical conclusions are correct.
- Project scope.
- Billing rates.

Connects to:

- Accounts, assets, incidents, projects, deliverables, agreements, invoices, messages, QBRs, and audit events.

Forbidden:

- Duplicating the same file in multiple folders as separate uncontrolled copies.
- Allowing client-visible documents without release approval.
- Allowing document access based only on folder location.

### Module 7: Messages / Request Desk

Owns:

- Context-linked communication threads.
- Message classification.
- Routing.
- Admin triage.
- Technical-review flags.
- Message-to-task conversion.
- Message-to-change-request conversion.
- Message-to-document-request conversion.
- Client-visible responses.
- Internal-only notes.

Does not own:

- Scope changes.
- Technical signoff.
- Document release.
- Agreement execution.

Connects to:

- Accounts, assets, projects, documents, invoices, agreements, tasks, and audit events.

Forbidden:

- Orphan chat.
- Scope changes by message.
- Technical opinions sent without required review.
- Vendor/client side conversations outside controlled visibility when Auxilium is coordinating.

### Module 8: Agreements / Finance Control

Owns:

- Agreements.
- Service authorizations.
- Change authorizations.
- Sampling authorizations.
- Rate cards.
- ROM assumptions.
- Authorization caps.
- Payment terms.
- PO requirements.
- Billing contacts.
- Invoice records.
- Reserve ledger.
- Pass-through rules.
- Vendor management fees.

Does not own:

- Full accounting/general ledger in early phases.
- Technical scope logic.
- Report conclusions.

Connects to:

- Accounts, programs, requests, projects, documents, vendors, reports, and audit events.

Forbidden:

- Becoming a custom accounting platform too early.
- Allowing work to proceed without agreement/cap/payment terms unless an emergency exception is approved.
- Floating major vendor costs without prepayment or direct contract rules.

### Module 9: Vendors

Owns:

- Vendor profiles.
- Service categories.
- Territories.
- Licenses.
- Insurance.
- Rate cards.
- Approval status.
- Restrictions.
- Healthcare experience.
- Documentation standards.
- Assignments.
- Scorecards.
- Vendor documents.

Does not own:

- Auxilium technical conclusions.
- Licensed/specialty work that the vendor performs.
- Client direct vendor contract terms unless tracked for reporting.

Connects to:

- Accounts, assets, incidents, projects, documents, finance, and reports.

Forbidden:

- Making Auxilium appear to self-perform licensed engineering, abatement, fire/life-safety, generator, HVAC/TAB, hazmat, or medical physicist work when it does not.

### Module 10: Reports / Executive Intelligence

Owns:

- Executive dashboards.
- Portfolio rollups.
- Active incident rollups.
- Open risk rollups.
- Site readiness scorecards.
- Vendor performance dashboards.
- Financial ledgers.
- QBR packets.
- Program value ledger.
- Aging issue reports.

Does not own:

- Source data.
- Scope truth.
- Document release.

Connects to:

- All modules as a read/reporting layer.

Forbidden:

- Creating alternate source-of-truth data inside dashboards.
- Vanity metrics without action paths.

### Module 11: Rules / Ontology / Template Admin

Owns:

- Service families.
- Request templates.
- Client-facing request tiles.
- Project issues.
- Service intents.
- Question banks.
- Trigger rules.
- Smart prompt cards.
- Relationship taxonomy.
- Sampling modules.
- Deliverable modules.
- ROM variables.
- Agreement blocks.
- Limitation blocks.
- Review gates.
- Routing rules.
- Dashboard configuration.
- Workflow state machines.
- Rule versions.

Does not own:

- Individual project facts after approval.
- Client account profile data.

Connects to:

- Requests, accounts, projects, finance, documents, messages, and reports.

Forbidden:

- Allowing uncontrolled edits by ordinary users.
- Changing rules without versioning.
- Applying new rules retroactively to old approved scopes unless explicitly migrated.

## Universal data-spine relationships

### Account relationships

- Account has many users.
- Account has many programs/MSAs.
- Account has many portfolios.
- Account has many assets.
- Account has many project requests.
- Account has many projects.
- Account has many documents.
- Account has many messages.
- Account has many invoices.
- Account has many audit events.

### Program relationships

- Program belongs to account.
- Program may cover many portfolios and assets.
- Program defines service eligibility, rate cards, response rules, report obligations, authorization rules, reserve rules, and boundary language.
- Program should not override project-specific scope records.

### Asset relationships

- Asset belongs to account and optionally to portfolio/program.
- Asset has many zones/areas.
- Asset has many documents.
- Asset has many incidents.
- Asset has many projects.
- Asset has site contacts and site-specific access rules.
- Asset has readiness records if the module is enabled.

### Incident relationships

- Incident belongs to account and usually to asset.
- Incident may spawn one or more project requests.
- Incident may have vendors, tasks, documents, and messages.
- Incident may produce one or more projects.

### Project request relationships

- Project request belongs to account and may link to asset, zone, incident, documents, messages, and user roles.
- Project request produces a proposed scope.
- Project request does not become a project until reviewed and authorized.

### Scope record relationships

- Scope record belongs to project request and final project.
- Scope record links included modules, excluded modules, limitations, sampling status, deliverables, ROM assumptions, cap, and authorizations.
- Scope record is immutable except through change authorization.

### Project relationships

- Project belongs to account and may link to asset, incident, scope record, authorization, tasks, vendors, documents, messages, costs, deliverables, and closeout.

### Document relationships

- Document belongs to account and may link to multiple objects.
- One canonical file can appear in account, asset, project, invoice, agreement, incident, QBR, and message views through controlled references.
- The document itself is not duplicated.

### Audit relationships

- Every important object should have audit events.
- Audit event records actor, action, object, timestamp, old value, new value where applicable, source system, and reason/comment where applicable.

## Client portal model

The client portal should use account-specific module visibility.

Small/simple client default navigation:

- Dashboard.
- Submit Request.
- Projects.
- Documents.
- Messages.
- Agreements / Invoices.
- Account.

Public adjuster default navigation:

- Projects.
- New Request.
- Project Documents.
- Reports.
- Messages.
- Agreements / Invoices if permitted.
- Account Users.

Property manager default navigation:

- Properties.
- Tenant/Unit Requests.
- Water/Mold/IAQ Requests.
- Documents.
- Messages.
- Approvals.
- Agreements / Invoices.

Enterprise/Nutex-style default navigation:

- Executive Dashboard.
- Facilities.
- Active Incidents.
- Project Requests.
- Site Passports.
- Documents.
- Readiness.
- Vendors.
- QBR.
- Financial Ledger.
- Messages.
- Account / Users.

Rule: clients see the simplest portal that fits their account. They should not see the entire suite unless they need it.

## Internal Auxilium command center

Internal navigation:

- Command Center.
- Intake Queue.
- High-Risk Review Queue.
- Projects.
- Clients.
- Assets.
- Documents.
- Messages.
- Agreements / Finance.
- Vendors.
- Reports.
- Rules / Templates.
- Admin.

Every queue item should show:

- Account.
- Asset/project/request.
- Status.
- Priority.
- Owner.
- Required next action.
- Due date.
- Blocker.
- Reviewer required.
- Client-facing status.
- Last activity.

## Core workflows

### Workflow 1: Universal client project request

1. Client logs in.
2. System applies account-specific dashboard visibility.
3. Client selects request tile, saved template, repeat prior request, search more services, or help classify.
4. Client selects issue.
5. Client selects service intent.
6. Client confirms account/property/asset/site.
7. Client identifies affected areas, units, buildings, materials, occupants, or systems.
8. Client provides event facts and timeline.
9. Client answers progressive safety/access questions.
10. Client uploads documents/photos/videos if available.
11. Client selects sampling authorization preference.
12. Client selects desired deliverable level.
13. Client provides urgency/timeline.
14. Client identifies payer, signer, and change approver.
15. System displays smart prompt cards only when triggered.
16. Client accepts, declines, defers, or asks Auxilium about prompted add-ons.
17. System generates request summary with included/excluded/pending items.
18. Client submits for Auxilium review.
19. Auxilium reviews, revises, accepts, limits, requests information, or declines.
20. If revised, client accepts/rejects revised scope.
21. Agreement/authorization is generated.
22. Authorized signer signs.
23. Payment terms/cap are confirmed.
24. Scheduling is released.
25. Project is created.
26. All later changes require change authorization.

### Workflow 2: Enterprise incident report

1. Site user logs in or uses QR/hotline plus portal intake.
2. System identifies account, program, asset, site status, user role, and approval authority.
3. User selects incident type.
4. User answers short P0/P1/P2/P3/P4 triage questions.
5. P0 logic instructs client to use emergency services/facility emergency procedures first.
6. P1 logic alerts Auxilium command center and creates incident.
7. Incident links to asset, zone, contacts, response map, site passport, vendor matrix, and MSA rules.
8. Project request is generated if Auxilium work is needed.
9. Scoping engine determines whether work is included, in-scope billable, vendor-managed, licensed/specialist-only, engineering-required, legal/claim issue, out of scope, or emergency exception.
10. Authorization/cap workflow runs if required.
11. Work command creates tasks and assignments.
12. Vendor module suggests approved vendors where appropriate.
13. Document vault collects photos, field notes, vendor docs, and reports.
14. Finance module tracks rates, reserves, pass-throughs, and direct-vendor spend.
15. Reports module updates dashboard and QBR.

### Workflow 3: Client asks a question about a project document

1. Client opens project document.
2. Client clicks “Ask about this document.”
3. Message auto-links to account, project, document, deliverable, PM, report author, scope record, and document version.
4. System classifies message: admin, technical, scope, billing, scheduling, legal/dispute, or change request.
5. Admin answers only if within allowed category.
6. Technical questions route to PM/reviewer.
7. Scope expansion requests convert to change request.
8. Response becomes part of project communication history.
9. Audit records message, routing, response, and any change request.

### Workflow 4: Document release

1. Deliverable created or uploaded.
2. Document class assigned.
3. Draft/final status assigned.
4. Internal reviewer approval required if class demands it.
5. PM or document controller approves release.
6. Release audience is selected by account/project/asset/document permissions.
7. Client notification is sent.
8. View/download events are audited.
9. Superseded versions remain archived but are not client-default visible unless permitted.

### Workflow 5: Scope change authorization

1. Field finding, client request, PM decision, lab result, access issue, or safety issue creates potential change.
2. Project remains under original scope until approved.
3. Change request records what changed, why it matters, ROM effect, schedule effect, and limitation if declined.
4. Required reviewer approves proposed change.
5. Client approver accepts, declines, or asks clarification.
6. If accepted, scope record receives linked approved change authorization.
7. If declined, limitation language is recorded.
8. Work command updates tasks only after approval.

### Workflow 6: Emergency exception

1. Client selects emergency or Auxilium flags emergency.
2. System collects minimum emergency fields: account, requester, signer, payer, site address, access contact, immediate hazard, affected area, occupancy, safety flags, requested action, cap.
3. System blocks nonessential features and routes to emergency review.
4. Senior Auxilium approval required.
5. Emergency conditional authorization is generated.
6. Client signs emergency authorization or MSA emergency provision is verified.
7. Work is limited to emergency purpose.
8. Sampling, formal report, protocol, PRV, extended consulting, and additional services require follow-up authorization unless already included.
9. Full scope/ROM/agreement follows after immediate control phase.

## Relationship taxonomy

Every module, method, deliverable, and add-on must carry one relationship type.

- Always included: part of the selected scope by definition.
- Normally included: usually included when conditions support it.
- Often recommended: frequently relevant but not automatic.
- Sometimes recommended: useful in certain cases.
- Conditional add-on: triggered by facts.
- Client-requested add-on: available by selection.
- Auxilium-review add-on: requires internal approval before acceptance.
- Prerequisite: must happen before another activity or opinion.
- Separate service: related but not included.
- Separate specialist referral: outside Auxilium role or licensed/specialist boundary.
- Incompatible with selected scope: cannot be supported under current facts.
- Not included unless authorized: explicit approval needed.
- Methodology, not service: how work is done.
- Deliverable, not service: work product.
- Scope depth level, not service: limited/standard/enhanced/expert/dispute-sensitive mode.
- Safety/risk modifier: changes review/PPE/access/safety logic.
- Pricing modifier: changes ROM assumptions.
- Turnaround modifier: changes schedule expectation.

## Guardrail system

### Guardrail A: Anti-overbuilding

Rules:

- Build in phases.
- Every module must have one owner and one reason to exist.
- Do not build enterprise-only features into the small-client default portal.
- Do not build custom accounting in Phase 1.
- Do not build CMMS replacement functionality before account, project, document, and scope controls are mature.

Checks:

- Does this feature serve Phase 1, Phase 2, or a contracted enterprise client?
- Can it be represented as configuration instead of code?
- Does it duplicate an existing module’s responsibility?

### Guardrail B: Permission discipline

Rules:

- Enforce permissions at the backend/database level, not only in the UI.
- Every object must have account isolation.
- Asset, project, document, and action permissions must be separate.
- Sensitive documents require document-class access, not just project access.
- Admin impersonation, permission changes, and document downloads are audited.

Checks:

- Can user X access account Y?
- Can user X access asset Y?
- Can user X access project Y?
- Can user X view document Y?
- Can user X download document Y?
- Can user X approve cost/change/sampling/signature?

### Guardrail C: Document control

Rules:

- One canonical document record, many references.
- Every document has class, version, status, release state, owner, linked objects, and audit.
- Drafts are internal only unless explicitly released.
- Superseded documents remain archived but visually marked.
- Downloads are audited.

Checks:

- Is this final or draft?
- Who approved release?
- Who can see it?
- Who can download it?
- What document does it replace?
- Is there a legal hold or retention requirement?

### Guardrail D: Audit trail

Rules:

- Every important action creates an audit event.
- Audit events are immutable to normal users.
- Audit records actor, action, object, timestamp, before/after values where applicable, and source.

Required audit events:

- Request submitted.
- Scope revised.
- Sampling declined.
- Sampling authorized.
- Add-on accepted/declined.
- Agreement signed.
- Cap approved/increased.
- Project scheduled.
- Document released.
- Document viewed/downloaded.
- User permission changed.
- Vendor assigned.
- Rule/template changed.
- Report delivered.
- Change request accepted/declined.

### Guardrail E: Professional boundaries

Rules:

- AI and the app may recommend review; they do not replace licensed professionals.
- Engineering, abatement, public adjusting, legal, medical, fire/life-safety certification, generator service, HVAC/TAB certification, and hazmat emergency response must be clearly separated where applicable.
- The system must record referrals and exclusions.

Checks:

- Is this within Auxilium’s role?
- Is a licensed/specialist vendor required?
- Is a conflict created by performing assessment and remediation?
- Does the client need a referral rather than Auxilium self-performing?

### Guardrail F: No chat-driven scope changes

Rules:

- Messages can ask questions.
- Messages can start a change request.
- Messages cannot approve scope changes.
- A change authorization must be linked to the scope record.

Checks:

- Did the client ask for additional work?
- Is this just clarification or a new service?
- Has the correct approver accepted ROM/cap effects?

### Guardrail G: No custom accounting too early

Rules:

- Track operational financial records, ROMs, caps, invoices, pass-throughs, and reserves.
- Export or integrate with accounting.
- Do not rebuild general ledger, payroll, tax, bank reconciliation, or full AR/AP in early phases.

### Guardrail H: Tests before trust

Rules:

- Every permission rule must have automated tests.
- Every workflow state transition must have tests.
- Every document release path must have tests.
- Every scope/change authorization path must have tests.
- Every high-risk smart prompt must have tests.

### Guardrail I: UI simplicity

Rules:

- Client UI uses progressive disclosure.
- Small clients do not see enterprise modules.
- Enterprise local users do not see CFO-only dashboards.
- Every page must show status, next action, and context.
- Walls of technical text should be replaced with short cards, expandable detail, and plain language.

### Guardrail J: Human review preservation

Rules:

- Automation can classify, prompt, draft, summarize, route, estimate, and flag.
- Auxilium approves, revises, limits, declines, releases, and signs off.
- High-risk projects require human review.

High-risk triggers:

- Healthcare/sensitive occupancy.
- Suspected chemical/drug contamination.
- Active demolition/material disturbance.
- Asbestos/lead triggers.
- Worker exposure monitoring.
- Legal/dispute/expert support.
- Emergency/out-of-state mobilization.
- Large/multi-unit/multi-building losses.
- Sampling declined but strong opinion requested.

## AI development discipline

### Project rule

Never ask an AI coding tool to “build AuxiliumOS.” Ask it to build one small, testable, documented piece of a defined module.

### Required artifacts before coding

- Master Map.
- Founder Homework Workbook answers for the module being built.
- Current Project Status Ledger.
- Data object definitions.
- User roles and permission matrix.
- Workflow states and transitions.
- Acceptance criteria.
- Test scenarios.
- No-go rules.

### Ticket format

Every AI coding task should use this structure:

1. Objective.
2. Module.
3. Objects touched.
4. Files likely affected.
5. Constraints.
6. Permission rules.
7. Audit events required.
8. UI behavior.
9. Backend behavior.
10. Tests required.
11. Data migration impact.
12. What not to change.
13. Definition of done.

### Session protocol

At the start of every AI development chat:

- Paste the AI handoff packet.
- Paste the current status ledger.
- Paste only the module/ticket being worked on.
- State whether the AI may code, plan only, review only, or test only.
- Tell the AI not to rename canonical terms.
- Tell the AI to mark unknown business decisions as TODO rather than inventing them.

At the end of every AI development chat:

- Request a session closeout.
- Update the Project Status Ledger.
- Record files changed.
- Record tests run.
- Record open issues.
- Record next recommended ticket.
- Save the chat summary outside the chat.

### AI cannot decide

AI must not invent:

- Legal entity structures.
- Real rates.
- Insurance requirements.
- MSA terms.
- Authorized signers.
- Actual sample count averages.
- Internal labor assumptions.
- Client-specific approval thresholds.
- Licensed-professional boundaries for a jurisdiction.
- Data retention obligations.
- Security risk acceptance.
- Which clients can see sensitive documents.
- Final professional opinions.

AI may propose placeholders and questions.

## Roadmap

### Phase 0: Logic foundation

Goal: prevent model failure before code begins.

Build/finish:

- Master Map.
- Founder Homework Workbook.
- Canonical glossary.
- Object map.
- Role matrix.
- Document class matrix.
- Workflow state machines.
- Service ontology v1.
- Request templates v1.
- Smart prompt rules v1.
- Agreement/limitation block library v1.
- Security baseline.
- Testing baseline.
- AI handoff packet.

Exit criteria:

- Phase 1 can be built without inventing business logic.

### Phase 1: Core Project Portal

Goal: usable PA/small-client portal and internal intake/document foundation.

Build:

- Auth/login.
- Account profile.
- User roles.
- Project list.
- Basic request submission.
- Basic project dashboard.
- Document vault with release control.
- Context-linked messages.
- Agreement/invoice status references.
- Admin intake queue.
- Audit log.

Exit criteria:

- A PA firm can log in, submit a request, see projects, download released reports, ask project-linked questions, and Auxilium can control document release and basic scope status.

### Phase 2: Scoping / ROM / Authorization Engine

Goal: professional intake and scope-control engine.

Build:

- Issue x intent logic.
- Dynamic questions.
- Safety/access flags.
- Sampling authorization layer.
- Deliverable selection.
- Smart prompts.
- Auxilium review workflow.
- Scope ledger.
- Limitation language.
- ROM assumption engine.
- Agreement generation support.
- Change authorization.

Exit criteria:

- Auxilium can accept/revise/reclassify/limit/decline project requests before agreement and preserve selected/declined/excluded scope.

### Phase 3: Asset / Portfolio Lite

Goal: support property managers and multi-site clients.

Build:

- Asset records.
- Asset users.
- Projects by asset.
- Documents by asset.
- Basic portfolio dashboard.
- Asset-level request creation.

Exit criteria:

- A client with multiple properties can manage project history and documents by property without enterprise complexity.

### Phase 4: Enterprise Site Passport / Incident Command

Goal: support Nutex-style programs.

Build:

- Site passports.
- Critical asset registry.
- Response maps.
- Site champion workflow.
- Incident severity P0/P1/P2/P3/P4.
- Site readiness status.
- Compliance-support calendar.
- Site cache records.
- Vendor matrix.

Exit criteria:

- Enterprise users can view facilities, report incidents, track readiness, and operate from standardized site memory.

### Phase 5: Vendor / Finance / QBR

Goal: enterprise value visibility.

Build:

- Vendor scorecards.
- Vendor approval records.
- Rate cards.
- Reserve ledger.
- Pass-through controls.
- QBR dashboards.
- Executive action lists.
- Program-level KPIs.

Exit criteria:

- Auxilium can show executive value, financial transparency, vendor performance, and site risk trends.

### Phase 6: AI-assisted operations

Goal: accelerate operations after structured data exists.

Build:

- AI request classification suggestions.
- AI missing-info detection.
- AI document summarization.
- AI message routing.
- AI QBR narrative drafting.
- AI internal search.
- AI field note structuring.

Exit criteria:

- AI improves speed without replacing review, authorization, or professional judgment.

## Realistic timing model

The timeline depends on decision speed, engineering skill, security expectations, design polish, integrations, and whether you hire technical help. With a disciplined AI-assisted workflow and a founder who supplies clear written specifications, a realistic path is:

- Phase 0 logic foundation: 2 to 6 weeks.
- Clickable prototype/UI concept: 1 to 3 weeks after Phase 0 basics.
- PA-usable Phase 1 internal pilot: 4 to 8 weeks if scope is controlled.
- PA-usable controlled client pilot with document release, messages, requests, and admin queue: 8 to 14 weeks.
- Robust Phase 1 plus Phase 2 scoping/authorization: 4 to 6 months.
- Portfolio Lite: 6 to 9 months from start if earlier phases are stable.
- Enterprise Site Passport/Incident Command: 9 to 18 months depending complexity.
- Mature enterprise suite with vendor/QBR/finance intelligence and rigorous security: 18 to 30+ months.

The fastest safe path is not to build the monster first. It is to build the correct spine, then let each module lock into the spine.

## Practical tool workflow

Recommended tool categories:

- Strategic/spec reasoning: ChatGPT/GPT-5.5 Pro or comparable frontier model for architecture, review, and business logic.
- Coding agent: Claude Code, OpenAI Codex CLI, Cursor Agent, GitHub Copilot coding agent.
- UI prototyping: v0 or similar React/UI generator for mockups and component ideas, not as unchecked production authority.
- Repository: private GitHub repository.
- Ticket/project tracking: GitHub Issues, Linear, or equivalent.
- Testing: unit tests, integration tests, Playwright end-to-end tests.
- Database/security: Postgres with row-level security or equivalent backend-enforced authorization.
- Authentication: managed auth provider or carefully configured platform auth.
- Storage: secure object storage with signed URLs and document metadata in the database.
- Monitoring: error tracking, logs, audit events, uptime monitoring.
- Backups: automated cloud backups plus your own offline exports/backups.

## Development rules for AI coding agents

1. Work in a private repository.
2. Use branches for every feature.
3. No direct commits to main.
4. No feature merges without tests.
5. No permission-related feature without permission tests.
6. No document feature without release/audit tests.
7. No workflow feature without state-transition tests.
8. No new object names unless added to glossary.
9. No database migration without migration notes and rollback thought.
10. No hidden business assumptions.
11. No large multi-module tickets.
12. No UI-only security.
13. No AI-generated code accepted without human review.
14. No production use until test users, fake data, and security checks pass.
15. No client PHI or sensitive real data in development/test environments.

## Definition of done for any feature

A feature is not done until:

- It matches the canonical glossary.
- It belongs to the correct module.
- It does not duplicate another module’s source of truth.
- It enforces permissions server-side.
- It creates required audit events.
- It handles error states.
- It has tests.
- It has seed/demo data if useful.
- It has user-facing copy that is clear and not overly technical.
- It has admin-facing details for review.
- It records open TODOs instead of hiding unresolved business questions.
- It updates the Project Status Ledger.

## Final operating principle

The app should never make complexity disappear. It should make complexity structured, routed, authorized, documented, and reviewable.

That is how AuxiliumOS becomes the central nervous system of Auxilium without becoming a liability machine.
