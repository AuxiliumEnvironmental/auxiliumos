> 2026-10-08 clarification: the spine is a relational domain map, not a mandatory wizard. Program/MSA and Portfolio are optional; Incident and Project Request remain distinct. Effective approved amendments govern their domain. Independent Moldo ownership and cross-system projections are specified in docs/03-data/ADR-001-DOMAIN-AND-MOLDO-BOUNDARIES.md. Preserve the original detailed model below.

# AuxiliumOS Data Spine

Last updated: 2026-06-22

## Purpose

This file defines the canonical AuxiliumOS data spine.

The data spine is the permanent structure that every future module, portal, workflow, database table, document, dashboard, message, project, agreement, and AI-assisted build task must connect to.

If a future feature does not attach to this spine, one of four things must be true:

1. It is a global reference/configuration object.

2. It is a reusable rule/template.

3. It is an integration/system record.

4. It does not belong in AuxiliumOS yet.

The data spine prevents AuxiliumOS from becoming one giant messy app or several disconnected mini-apps.

---

## Permanent Rule

Every future AuxiliumOS feature must answer:

- What account does this belong to?

- What asset, project, incident, document, agreement, or workflow does this connect to?

- Who can see it?

- Who can act on it?

- What state is it in?

- What audit event is created?

- What source-of-truth record controls it?

If those questions cannot be answered, the feature is not ready to build.

---

## Canonical Data Spine

Client Account

→ Program / MSA

→ Portfolio

→ Asset / Facility / Property

→ Zone / Area

→ Incident

→ Project Request

→ Scope Record

→ Authorization

→ Project

→ Tasks / Work Orders

→ Deliverables

→ Documents

→ Communications

→ Financial Records

→ Reports / Dashboards

→ Audit Events

---

# 1. Client Account

## Meaning

A Client Account is the top-level customer, company, firm, owner, operator, or organization using AuxiliumOS.

Examples:

- Public adjusting firm

- Property management company

- Healthcare company

- Restoration contractor

- Attorney/law firm

- Industrial/manufacturing client

- Individual property owner

- Enterprise MSA client such as a Nutex-style healthcare platform

## What it owns or controls

- Account profile

- Client type(s)

- Account users

- Account roles

- Billing profile

- Authorized signers

- Approval thresholds

- Enabled modules

- Dashboard configuration

- Default request templates

- Account-specific terminology

- Account-specific agreements or MSA terms

- Account-level document rules

- Account-specific safety/access instructions

## What it must not become

The Client Account should not become a dumping ground for project-specific details.

Project details belong under Project Requests, Scope Records, Projects, Documents, or Incidents.

---

# 2. Program / MSA

## Meaning

A Program or MSA is the commercial and operational framework for a larger client relationship.

Examples:

- National Facility Protection & Environmental Readiness MSA

- Property management portfolio agreement

- Public adjuster preferred-services agreement

- Enterprise healthcare program

- Multi-site facility support agreement

## What it owns or controls

- Contract term

- Covered assets/facilities

- Included services

- Billable services

- Rate cards

- Site activation rules

- Response rules

- Emergency rules

- Program-level dashboards

- Program-specific approval rules

- Reporting requirements

- QBR requirements

- Service boundary matrix

## Relationship to Client Account

A Client Account may have zero, one, or multiple Programs/MSAs.

Small clients may not have a Program/MSA.

Enterprise clients may rely heavily on this layer.

## What it must not become

A Program/MSA should not replace individual project scopes.

Even if a service is covered under an MSA, each incident/project still needs the correct request, scope, authorization, task, document, and audit records.

---

# 3. Portfolio

## Meaning

A Portfolio is a group of assets/properties/facilities under an account or program.

Examples:

- All Nutex facilities

- Texas region facilities

- Gulf Coast properties

- A multifamily portfolio

- Commercial real estate portfolio

- Properties managed by a property management company

## What it owns or controls

- Grouping of assets

- Regional reporting

- Portfolio-level dashboards

- Portfolio-level risks

- Portfolio managers

- Portfolio-level documents

- Portfolio-level project history

## Relationship to Assets

A Portfolio contains one or more Assets.

An Asset may belong to one or more Portfolios when needed.

## What it must not become

A Portfolio is not a substitute for a specific Facility/Asset record. Specific building, site, incident, document, and project data belongs under the Asset or Project layer.

---

# 4. Asset / Facility / Property

## Meaning

An Asset is a physical site, property, facility, building, or location where work, incidents, documents, and site history may occur.

Examples:

- Hospital facility

- Micro-hospital

- Apartment complex

- Commercial building

- Warehouse

- Industrial plant

- Individual insured property

- Office building

- Retail property

## What it owns or controls

- Site profile

- Address

- Property type

- Occupancy type

- Site contacts

- Site access instructions

- Site-specific users

- Facility documents

- Site passport

- Site-specific vendor matrix

- Critical asset registry

- Response maps

- Incident history

- Project history

- Open risks

- Readiness status

## Relationship to Account

Every Asset must belong to a Client Account.

For enterprise clients, every Asset may also belong to a Program/MSA and Portfolio.

## What it must not become

An Asset should not contain all project-specific notes in one unstructured field.

Specific project work belongs in Incident, Project Request, Scope Record, Project, Document, Communication, and Audit records.

---

# 5. Zone / Area

## Meaning

A Zone or Area is a smaller physical area inside an Asset.

Examples:

- ER

- Imaging

- Pharmacy

- Lab

- Mechanical room

- Roof

- Unit 1204

- Building B

- Third floor

- Attic

- Crawlspace

- Containment zone

- Production line

- Patient care area

- Electrical room

## What it owns or controls

- Area name

- Area type

- Parent asset

- Parent building/floor if applicable

- Sensitivity level

- Access notes

- Related incidents

- Related documents

- Related observations

- Related project scope boundaries

## Why this matters

Many Auxilium projects are not whole-building projects.

A request may involve one unit, one department, one floor, one room, one building, or one affected pathway.

Zone/Area records help prevent unclear scope.

## What it must not become

Zones should not be used casually as generic tags. They represent real physical areas when area-level tracking matters.

---

# 6. Incident

## Meaning

An Incident is an event, condition, or problem occurrence that may generate one or more project requests or projects.

Examples:

- Water intrusion

- Fire/smoke event

- Sewage event

- Odor/IAQ complaint

- Mold concern

- Chemical spill

- BBP/OPIM concern

- Contractor containment breach

- HVAC/pressure issue

- Generator/emergency-power concern

- Storm-related damage

- Unknown contamination concern

## What it owns or controls

- Incident number

- Account

- Asset/facility

- Zone/area

- Priority level

- Event type

- Timeline

- Safety flags

- Submitted photos/documents

- Initial triage

- Related project requests

- Related projects

- Related vendors

- Incident closeout

- Lessons learned

## Relationship to Project Request

An Incident may create one or more Project Requests.

Example:

A water intrusion incident could generate:

- Emergency triage request

- Moisture assessment

- Regulated materials testing

- Remediation protocol

- Post-work verification

- Vendor documentation review

## What it must not become

An Incident is not automatically an approved project.

Incident reporting starts the process. Scope and authorization still control work.

---

# 7. Project Request

## Meaning

A Project Request is the client’s submitted request before Auxilium accepts, revises, reclassifies, limits, declines, or converts it into an approved project.

## What it owns or controls

- Original client request

- Requester

- Account

- Asset/facility

- Affected zones/areas

- Issue type

- Service intent

- Event facts

- Prior work

- Uploaded documents/photos

- Safety/access flags

- Sampling preference

- Deliverable preference

- Urgency

- Payer information

- Signer/approver information

- Triggered smart prompts

- Missing information

- Auxilium review status

## What it must preserve

The original client-submitted language should be preserved even if Auxilium reclassifies the request.

## What it must not become

A Project Request is not an agreement.

A submitted request does not mean Auxilium accepted the scope or agreed to perform work.

---

# 8. Scope Record

## Meaning

A Scope Record is the approved or proposed truth of what Auxilium is being asked and authorized to do.

This is one of the most important records in AuxiliumOS.

## What it owns or controls

- Included modules

- Excluded modules

- Included areas

- Excluded areas

- Approved deliverables

- Sampling authorization status

- Accepted recommendations

- Declined recommendations

- Scope assumptions

- Scope limitations

- ROM assumptions

- Human review notes

- Scope approval status

- Scope lock status

- Change authorization requirements

## Relationship to Project Request

The Project Request captures what the client asked for.

The Scope Record captures what Auxilium reviewed, revised, limited, and approved.

## What it outranks

The Scope Record outranks:

- Client chat messages

- Uploaded third-party documents

- Unreviewed AI summaries

- Informal notes

- Assumptions

- Original unclear request wording

## What it must not become

A Scope Record cannot be casually changed by chat, email, or admin note.

Any change after approval requires change authorization logic.

---

# 9. Authorization

## Meaning

An Authorization is the commercial/legal permission to proceed.

Examples:

- Service authorization

- Emergency authorization

- Agreement

- MSA authorization

- Cap approval

- Sampling authorization

- Change authorization

- Signed approval

- Payment/cap confirmation

## What it owns or controls

- Authorized scope

- Signer

- Payer

- Authorization cap

- Rate basis

- Terms

- Sampling decision

- Change rules

- Emergency conditions

- Signature status

- Payment terms

- Expiration/supersession

## Relationship to Scope Record

A Scope Record defines the work.

Authorization gives permission to proceed.

## What it must not become

Authorization cannot be implied by a message saying “go ahead” unless the authorized workflow explicitly allows that and records it.

---

# 10. Project

## Meaning

A Project is the accepted Auxilium work engagement after request review and authorization.

## What it owns or controls

- Project number

- Account

- Asset/facility

- Related incident

- Approved scope record

- Authorization

- Project manager

- Technical reviewer

- Field staff

- Status

- Tasks

- Site visits

- Deliverables

- Documents

- Messages

- Financial records

- Change requests

- Closeout

## Relationship to Project Request

A Project should be created only after a Project Request is reviewed and accepted or after an approved internal/emergency workflow creates one.

## What it must not become

A Project should not contain every raw document, message, invoice, and scope decision as unstructured notes.

Those belong in their own linked records.

---

# 11. Tasks / Work Orders

## Meaning

Tasks and Work Orders are actionable units of work under a Project, Incident, Asset, Program, or internal workflow.

Examples:

- Review submitted request

- Request missing site photos

- Assign PM

- Schedule site visit

- Review document

- Release report

- Send authorization

- Approve cap

- Upload lab result

- Complete site passport section

- Review vendor closeout package

- Prepare QBR item

## What they own or control

- Assigned user/team/vendor

- Due date

- Status

- Priority

- Related object

- Completion record

- Notes

- Audit events

## What they must not become

Tasks should not replace scope records, approvals, authorizations, or project documents.

Tasks track action. They do not define authority.

---

# 12. Deliverables

## Meaning

A Deliverable is a work product Auxilium provides or tracks.

Examples:

- Standard assessment report

- Formal written report

- Lab summary

- Protocol/scope document

- Post-remediation verification report

- Clearance-type report where applicable

- Moisture verification report

- Expert-level narrative report

- Rebuttal/response letter

- 3D walkthrough

- Floor plan

- Measurement package

- Photo log

- Site passport

- Critical asset registry

- QBR packet

## What it owns or controls

- Deliverable type

- Related project/scope

- Status

- Assigned preparer

- Reviewer

- Due date

- Document links

- Release status

- Version

## Relationship to Documents

The Deliverable is the work product record.

The Document is the file/version that represents it.

## What it must not become

A Deliverable is not the same thing as a service module or field task.

Field work, technical methods, and deliverables must remain distinct.

---

# 13. Documents

## Meaning

Documents are controlled records/files linked to the account, asset, project, incident, deliverable, agreement, vendor, or report package.

Examples:

- Uploaded photos

- Field photos

- Draft report

- Final report

- Lab result

- Agreement

- Signed authorization

- Invoice

- Site passport

- Vendor COI

- QBR packet

- Legal/dispute-sensitive file

- Superseded document

## What they own or control

- Document class

- Version

- Sensitivity

- Linked objects

- Draft/final state

- Release status

- Client visibility

- Download permissions

- View/download audit

- Supersession/replacement

- Retention/legal-hold status

## Permanent rule

No document is client-visible by default.

Client-visible documents require:

- Classification

- Versioning

- Release approval

- Permission check

- Audit event

## What they must not become

Documents should not be controlled only by folder path.

Folder location is helpful organization, but access must be controlled by document metadata and permissions.

---

# 14. Communications

## Meaning

Communications are messages, threads, comments, calls, emails, or questions linked to a specific object.

Examples:

- Project message

- Document question

- Scope clarification

- Billing question

- Vendor communication

- Internal routing note

- Client support question

- Admin response

- Technical-review-needed message

## What they own or control

- Thread

- Participants

- Linked account/asset/project/document

- Message classification

- Routing

- Review requirement

- Response status

- Related task/change request if created

## Permanent rule

No orphan messages.

Every communication must link to something:

- Account

- Asset

- Incident

- Project Request

- Scope Record

- Project

- Document

- Agreement

- Invoice

- Vendor record

## Scope rule

A communication can create:

- Task

- Clarification

- Document request

- Change request draft

- Review request

A communication cannot directly change:

- Approved scope

- Authorization cap

- Sampling authorization

- Signed agreement

- Released document

- Deliverable requirement

---

# 15. Financial Records

## Meaning

Financial Records track money, estimates, authorizations, caps, invoices, pass-throughs, reserves, vendor costs, and exports.

Examples:

- ROM estimate

- Authorization cap

- Invoice

- Invoice line item

- Lab pass-through

- Vendor pass-through

- Readiness reserve transaction

- Project cost record

- Payment status

- Purchase approval

- Accounting export

## What they own or control

- Account

- Program/MSA

- Project

- Authorization

- Cost category

- Amount

- Status

- Approval

- Export/sync status

- Audit trail

## What they must not become

AuxiliumOS should not try to replace full accounting software at the beginning.

It should track operational financial truth and support export/integration.

---

# 16. Reports / Dashboards

## Meaning

Reports and Dashboards show project, asset, account, program, vendor, financial, risk, readiness, and executive information.

Examples:

- Client dashboard

- Admin command center

- Executive dashboard

- Facility status dashboard

- Incident dashboard

- QBR packet

- Vendor scorecard

- Readiness dashboard

- Financial/reserve ledger

- Open risk report

## What they own or control

- Report definition

- Dashboard widget

- Metric snapshot

- Visibility rules

- QBR section

- Executive action item

- Rollup logic

## Permanent rule

Dashboards are not the source of truth.

Dashboards read from source records.

## What they must not become

Dashboards should not create separate competing versions of project, financial, document, or scope data.

---

# 17. Audit Events

## Meaning

Audit Events record meaningful actions, decisions, access, changes, approvals, releases, denials, and system events.

## Examples

- Request submitted

- Prompt shown

- Sampling declined

- Scope approved

- Scope locked

- Agreement sent

- Agreement signed

- Cap approved

- Document uploaded

- Document release requested

- Document released

- Document downloaded

- User invited

- User role changed

- Access denied

- Project converted

- Change authorization approved

- AI summary accepted/rejected

- Rule version changed

## What they own or control

- Actor

- Action

- Timestamp

- Object affected

- Before/after values where needed

- Account context

- Result

- Reason

- Related workflow state

## Permanent rule

Every meaningful action should create an audit event.

If a future feature affects scope, documents, money, permissions, agreements, client access, safety, sampling, or professional risk, it must have an audit event.

## What they must not become

Audit Events should not be edited casually.

They exist to preserve history.

---

# Source-of-Truth Hierarchy

When records conflict, AuxiliumOS should treat the following as the hierarchy of truth:

1. Signed agreement / authorization

2. Approved scope record

3. Approved change authorization

4. Final released deliverable

5. Auxilium technical review

6. Project manager notes

7. Client-submitted request

8. Client messages

9. Uploaded third-party documents

10. Unreviewed AI summaries

This prevents informal messages or AI summaries from overriding approved scope or signed authorization.

---

# Feature Attachment Test

Before building any feature, answer these questions:

1. What data-spine object does this feature belong to?

2. What account owns it?

3. Is it account-level, program-level, asset-level, incident-level, project-level, document-level, or global configuration?

4. Who can see it?

5. Who can create it?

6. Who can update it?

7. Who can delete/archive it?

8. What workflow state does it use?

9. What audit event is created?

10. Does it affect scope?

11. Does it affect document release?

12. Does it affect financial authorization?

13. Does it affect client visibility?

14. Does it affect professional/legal boundaries?

15. Does it require RLS or another backend permission rule?

16. Does it belong in v1 or backlog?

If these questions cannot be answered, the feature is not ready.

---

# Global Configuration and Reference Objects

Some important records do not sit directly inside the operational data spine because they are reusable configuration.

Examples:

- Roles

- Permissions

- Service families

- Project issues

- Service intents

- Technical modules

- Sampling modules

- Deliverable templates

- Request templates

- Smart prompts

- Rule sets

- Agreement blocks

- Rate cards

- Workflow states

- Document classes

- AI prompt templates

- Integration settings

These records are still part of AuxiliumOS, but they are configuration objects rather than client-specific transaction records.

They must be versioned or controlled when they affect project scope, client visibility, pricing, document release, or authorization.

---

# Client Examples

## Simple PA / Project Client

A simple client may mainly use:

Client Account

→ Project Request

→ Scope Record

→ Authorization

→ Project

→ Deliverables

→ Documents

→ Communications

→ Financial Records

→ Audit Events

They may not need Portfolio, Site Passport, Vendor Matrix, Readiness Reserve, or QBR dashboards.

## Property Management Client

A property management client may use:

Client Account

→ Portfolio

→ Asset / Property

→ Zone / Unit

→ Incident

→ Project Request

→ Scope Record

→ Authorization

→ Project

→ Documents

→ Communications

→ Financial Records

→ Reports

→ Audit Events

They may need property-level history and tenant-complaint tracking.

## Enterprise / Nutex-Style Client

An enterprise healthcare client may use the full spine:

Client Account

→ Program / MSA

→ Portfolio

→ Asset / Facility

→ Zone / Department

→ Incident

→ Project Request

→ Scope Record

→ Authorization

→ Project

→ Tasks / Work Orders

→ Deliverables

→ Documents

→ Communications

→ Financial Records

→ Reports / Dashboards

→ Audit Events

They may also use site passports, critical asset registries, response maps, readiness reserves, vendor matrices, facility coordinators, QBR packets, and executive dashboards.

---

# Things AuxiliumOS Must Not Do

AuxiliumOS must not:

- Create one table or workflow per client.

- Create one disconnected app per service line.

- Allow chat/messages to change scope.

- Make draft documents client-visible by default.

- Treat dashboards as the source of truth.

- Treat uploaded files as approved scope.

- Treat AI summaries as approved technical conclusions.

- Treat a submitted request as an accepted project.

- Treat an MSA as unlimited authorization.

- Treat UI hiding as security.

- Store sensitive client access logic only in front-end code.

- Allow project records without account ownership.

- Allow documents without classification and object linkage.

- Allow financial approvals without authority records.

- Allow production client data before access control is tested.

---

# First Build Slice

The first build slice after prep is:

Account

→ User Role

→ Facility

→ Incident Request

→ Admin Queue

→ Document Upload

→ Document Release

→ Client View

→ Audit Event

This slice proves the core operating model before building the full project-scoping engine or enterprise platform.

It proves:

- An account can exist.

- A user can belong to an account.

- A user can have a role.

- A facility can belong to an account.

- A site user can submit an incident/request.

- An admin can review it.

- A document can be uploaded but not automatically released.

- A document can be released only through a controlled workflow.

- A client can see only released documents they are permitted to see.

- Every meaningful action creates an audit event.

---

# Final Rule

The data spine is not a feature list.

It is the structure that keeps every feature organized.

Every future AuxiliumOS module must connect to the spine, respect the source-of-truth hierarchy, enforce role/document/scope controls, and create audit events when meaningful actions occur.
