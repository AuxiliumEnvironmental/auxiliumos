# # AuxiliumOS Module Map

Last updated: 2026-06-22

## Purpose

This file defines the major AuxiliumOS modules.

The module map explains what each module does, what it must not do, what it connects to, and why it exists.

AuxiliumOS is not one giant app and not a group of disconnected mini-apps.

AuxiliumOS is a modular operating suite with one shared data spine.

The canonical data spine is:

Client Account → Program/MSA → Portfolio → Asset/Facility → Zone/Area → Incident → Project Request → Scope Record → Authorization → Project → Tasks/Work Orders → Deliverables → Documents → Communications → Financial Records → Reports/Dashboards → Audit Events.

Every module must attach to that spine.

---

## Permanent Module Rule

Each module must have:

- A clear job

- A clear source-of-truth responsibility

- Clear boundaries

- Clear permission expectations

- Clear links to the data spine

- Clear audit expectations

- Clear “must not do” rules

No module may silently override:

- Approved scope

- Signed authorization

- Document release rules

- Role/permission rules

- Sampling authorization

- Financial approval

- Professional/legal boundaries

---

# 1. Core Module

## What it does

The Core module provides the shared platform foundation.

It owns shared platform concepts such as:

- Platform modules

- Feature flags

- Object types

- Global tags

- Shared checklists

- Shared notes

- Sequence numbers

- System settings

- Cross-object links

- Common platform utilities

## What it connects to

Core supports every other module.

## What it must not do

Core must not become the place where project-specific, client-specific, or service-specific logic is dumped.

If logic belongs to intake, scope, documents, agreements, assets, vendors, or reporting, it should live in that module.

## Why it matters

Core keeps the platform organized and prevents every module from inventing its own version of basic platform behavior.

---

# 2. Accounts Module

## What it does

The Accounts module owns client account truth.

It manages:

- Client account record

- Account profile

- Client type(s)

- Account contacts

- Account users

- Account dashboard defaults

- Enabled modules

- Account-specific terminology

- Default request templates

- Billing profile

- Authorized signers

- Approval rules

- Account-level access expectations

- Account-level safety/access instructions

## What it connects to

Accounts connect to:

- Programs/MSAs

- Portfolios

- Assets

- Users

- Requests

- Projects

- Documents

- Agreements

- Financial records

- Reports

- Audit events

## What it must not do

The Accounts module must not store detailed project facts, field observations, document versions, scope decisions, or incident timelines directly inside the account record.

Those belong in their own modules.

## Why it matters

Every record in AuxiliumOS should ultimately connect to an account or to global configuration.

---

# 3. Programs / MSA Module

## What it does

The Programs/MSA module manages enterprise commercial and operating frameworks.

It supports:

- Master service agreements

- National or portfolio programs

- Covered facilities

- Site activation rules

- Included services

- Billable services

- Rate card links

- Emergency rules

- Response expectations

- QBR requirements

- Program dashboards

- Scope boundary matrix

- Program-level approval rules

## What it connects to

Programs/MSAs connect to:

- Client account

- Portfolio

- Assets/facilities

- Incidents

- Project requests

- Authorizations

- Financial records

- Reports/QBRs

- Vendor programs

- Audit events

## What it must not do

A Program/MSA must not act like unlimited approval for every service.

An MSA may define the relationship, but individual incidents/projects still need scope, authorization, and audit records.

## Why it matters

Enterprise clients such as a Nutex-style healthcare platform need national/portfolio-level structure without pretending every site is fully activated on day one.

---

# 4. Portfolio Module

## What it does

The Portfolio module groups assets/properties/facilities.

It supports:

- Regional groupings

- Multi-property clients

- Portfolio dashboards

- Portfolio-level risk views

- Portfolio-level document references

- Portfolio-level executive summaries

- Portfolio manager assignments

## What it connects to

Portfolios connect to:

- Client account

- Program/MSA

- Assets

- Reports

- Financial rollups

- Audit events

## What it must not do

A Portfolio must not replace the Asset/Facility record.

Specific site data belongs under Assets.

## Why it matters

Portfolio clients need higher-level visibility without losing site-level detail.

---

# 5. Assets / Facilities Module

## What it does

The Assets module owns physical site truth.

It manages:

- Facilities

- Properties

- Buildings

- Units

- Floors

- Zones/areas

- Site contacts

- Access rules

- Property type

- Occupancy type

- Site-specific users

- Site history

- Site-specific document links

- Site-specific incident and project history

## What it connects to

Assets connect to:

- Account

- Program/MSA

- Portfolio

- Zones/areas

- Incidents

- Project requests

- Projects

- Documents

- Vendors

- Reports

- Audit events

## What it must not do

Assets must not become a dumping ground for all incident notes, project notes, reports, and invoices.

Those belong in Incident, Project, Document, Communication, Financial, and Audit modules.

## Why it matters

AuxiliumOS must support both simple one-off property projects and enterprise facility/site-passport clients.

---

# 6. Readiness / Site Passport Module

## What it does

The Readiness/Site Passport module manages enterprise site readiness and facility-protection information.

It supports:

- Site passports

- Site champion records

- Site champion training

- Response maps

- Critical asset registries

- Site cache plans

- Site readiness reviews

- Open deficiencies

- Site risk registers

- Compliance-support schedules

- Tabletop/drill tracking

- Site activation checklists

## What it connects to

Readiness connects to:

- Account

- Program/MSA

- Asset/facility

- Zone/area

- Vendors

- Documents

- Reports/QBRs

- Incidents

- Audit events

## What it must not do

Readiness must not become a replacement for a client’s CMMS, licensed engineering records, or regulated healthcare compliance system.

It is a facility-protection and environmental-readiness operating layer.

## Why it matters

Enterprise clients need site memory, response maps, critical asset documentation, readiness tracking, and executive visibility.

---

# 7. Intake Module

## What it does

The Intake module manages client-submitted project requests before Auxilium accepts, revises, limits, declines, or converts them into projects.

It supports:

- Request creation

- Issue selection

- Service intent selection

- Dynamic questions

- Affected areas

- Project narrative

- Prior work

- Safety/access flags

- Uploads

- Sampling preference

- Deliverable preference

- Urgency

- Payer/signer inputs

- Triggered smart prompts

- Missing information

- Admin review queue

## What it connects to

Intake connects to:

- Account

- Asset/facility

- Zone/area

- Incident

- Scope

- Sampling

- ROM

- Agreement/authorization

- Documents

- Communications

- Audit events

## What it must not do

A submitted request must not be treated as accepted work.

A project request is not a signed agreement, not an approved scope, and not authorization to mobilize.

## Why it matters

Intake protects Auxilium from unclear client expectations and forces enough structure before work begins.

---

# 8. Scope Module

## What it does

The Scope module manages what Auxilium is actually being asked, authorized, and limited to do.

It supports:

- Scope records

- Included modules

- Excluded modules

- Scope areas

- Deliverables

- Sampling authorization status

- Recommendations

- Accepted recommendations

- Declined recommendations

- Limitations

- Assumptions

- Human review notes

- Scope locks

- Change requests

- Change decisions

## What it connects to

Scope connects to:

- Project request

- Authorization

- Project

- Sampling

- Deliverables

- Documents

- Agreements

- Communications

- Audit events

## What it must not do

Scope cannot be changed by casual chat, admin notes, or unreviewed AI summaries.

Approved scope changes require change authorization.

## Why it matters

Scope is one of the strongest legal and expectation-control layers in AuxiliumOS.

---

# 9. Sampling Module

## What it does

The Sampling module manages sampling/testing logic and authorization.

It supports:

- Sample types

- Analyte groups

- Analytical methods

- Sample media

- Sampling modules

- Sampling recommendations

- Sampling authorization

- Sampling declinations

- Field sample plans

- Sample locations

- Lab orders

- Lab results

- Chain of custody links

- Interpretation records

- Sampling limitations

## What it connects to

Sampling connects to:

- Intake

- Scope

- ROM

- Agreements

- Projects

- Documents

- Deliverables

- Audit events

## What it must not do

Sampling must not be treated as a random add-on checkbox.

Sampling decisions must be structured, authorized, and recorded.

## Why it matters

Sampling affects cost, schedule, lab turnaround, interpretation, PPE, scope limitations, and professional conclusions.

---

# 10. ROM Module

## What it does

The ROM module manages rough-order-of-magnitude time-and-materials estimate logic.

It supports:

- ROM models

- Estimate assumptions

- Field labor ranges

- Reporting/review ranges

- Travel/mobilization ranges

- Lab/direct-cost ranges

- Equipment/PPE ranges

- Rate cards

- Authorization cap recommendations

- ROM confidence level

- Historical calibration

- Actual-to-ROM comparison

## What it connects to

ROM connects to:

- Intake

- Scope

- Sampling

- Agreement/authorization

- Finance

- Projects

- Audit events

## What it must not do

ROM must not become fixed-price service quoting unless Auxilium intentionally creates a separate fixed-price workflow.

AuxiliumOS’s default logic is T&M with transparent assumptions.

## Why it matters

Auxilium needs cost transparency without creating unrealistic fixed-price expectations.

---

# 11. Agreements / Authorization Module

## What it does

The Agreements/Authorization module manages commercial permission to proceed.

It supports:

- Agreements

- Service authorizations

- Emergency authorizations

- Cap approvals

- Sampling authorization

- Change authorization

- Signature requests

- Signature events

- Payment term confirmations

- Agreement document links

- Authorization state history

## What it connects to

Agreements/Authorization connects to:

- Account

- Program/MSA

- Project request

- Scope

- ROM

- Project

- Financial records

- Documents

- Audit events

## What it must not do

Authorization cannot be implied by a casual message unless a formal approved emergency or authorization workflow explicitly records it.

## Why it matters

Work should not proceed without clear authority, except under controlled emergency exception logic.

---

# 12. Operations / Projects Module

## What it does

The Operations/Projects module manages accepted work after intake, scope, and authorization.

It supports:

- Incidents

- Projects

- Project team assignments

- Work orders

- Tasks

- Schedules

- Site visits

- Field logs

- Observations

- Issue logs

- Closeout checklists

- Lessons learned

## What it connects to

Operations connects to:

- Account

- Asset/facility

- Incident

- Project request

- Scope

- Authorization

- Documents

- Communications

- Vendors

- Financial records

- Reports

- Audit events

## What it must not do

Operations must not silently expand the approved scope.

If field conditions require expanded work, the Operations module should trigger a change request, not mutate scope.

## Why it matters

Operations converts approved scope into managed work without losing control of authority, documents, or client expectations.

---

# 13. Documents Module

## What it does

The Documents module manages controlled document metadata, versions, release states, access, packages, and audits.

It supports:

- Document records

- Document classes

- Versions

- Sensitivity levels

- Storage object references

- Release requests

- Release decisions

- Access grants

- View/download audit

- Document packages

- Supersession/replacement

- Retention/legal hold

- Document review assignments

## What it connects to

Documents connect to:

- Account

- Program/MSA

- Asset/facility

- Incident

- Project request

- Scope

- Project

- Deliverable

- Agreement

- Invoice

- Vendor

- QBR

- Audit events

## What it must not do

Documents must not be controlled only by folders or file paths.

No document becomes client-visible by default.

## Why it matters

Document control protects Auxilium and clients from accidental releases, draft confusion, version chaos, and access failures.

---

# 14. Communications Module

## What it does

The Communications module manages messages, threads, routing, review requests, notifications, and client questions.

It supports:

- Message threads

- Message participants

- Linked objects

- Message classifications

- Routing

- Review requests

- Client questions

- Admin responses

- Notifications

- Call logs

- Email/SMS event records where applicable

## What it connects to

Communications connect to:

- Account

- Asset/facility

- Incident

- Project request

- Scope

- Project

- Document

- Agreement

- Invoice

- Vendor

- Audit events

## What it must not do

Communications cannot directly change scope, cap, sampling authorization, signed agreement, or document release state.

Messages may create tasks, clarifications, review requests, or change request drafts only.

## Why it matters

Client communication must be easy but must not accidentally create scope, billing, or technical-authority changes.

---

# 15. Vendors Module

## What it does

The Vendors module manages vendor network records, credentials, assignments, scorecards, and program/vendor relationships.

It supports:

- Vendor profiles

- Vendor contacts

- Vendor service categories

- Geographic coverage

- Licenses

- Insurance records

- Vendor rate cards

- Program-approved vendors

- Asset-specific vendors

- Project assignments

- Vendor document requirements

- Vendor scorecards

- Vendor restrictions

- Vendor training records

## What it connects to

Vendors connect to:

- Account

- Program/MSA

- Asset/facility

- Incident

- Project

- Documents

- Financial records

- Reports

- Audit events

## What it must not do

The Vendors module must not imply Auxilium is self-performing licensed/specialty work it is not qualified or contracted to perform.

Vendor-managed work must preserve professional, contractual, licensing, and payment boundaries.

## Why it matters

Auxilium can manage vendor standards, routing, documentation, and scorecards without becoming every vendor.

---

# 16. Finance Module

## What it does

The Finance module manages operational financial records.

It supports:

- Billing profiles

- Invoices

- Invoice line items

- Cost records

- Pass-throughs

- Purchase requests

- Purchase approvals

- Reserve accounts

- Reserve transactions

- Payment status

- Purchase orders

- Budget caps

- Spend authorizations

- Accounting exports

## What it connects to

Finance connects to:

- Account

- Program/MSA

- Project request

- Scope

- Authorization

- Project

- Vendor

- Reports

- Audit events

## What it must not do

Finance should not try to replace full accounting software in v1.

It should track operational financial truth and support exports/integrations.

## Why it matters

AuxiliumOS must control caps, pass-throughs, reserves, invoices, project costs, and reporting without becoming accounting chaos.

---

# 17. Reporting / QBR Module

## What it does

The Reporting/QBR module manages dashboards, metrics, QBR packets, executive action lists, and reporting snapshots.

It supports:

- Dashboard configurations

- Dashboard widgets

- Metric definitions

- Metric snapshots

- Facility dashboards

- Executive dashboards

- Incident dashboards

- Vendor scorecards

- QBR packets

- QBR sections

- Executive action items

- Value ledgers

- Risk scoring

## What it connects to

Reporting connects to:

- Account

- Program/MSA

- Portfolio

- Asset/facility

- Incident

- Project

- Documents

- Vendors

- Finance

- Readiness

- Audit events

## What it must not do

Dashboards must not become the source of truth.

Dashboards read from source records and snapshots.

## Why it matters

Reporting keeps enterprise clients aware of incidents, risks, vendors, spend, reserve use, readiness, and value.

---

# 18. AI Module

## What it does

The AI module manages AI jobs, prompts, outputs, classifications, summaries, risk flags, and human review decisions.

It supports:

- AI job records

- Prompt templates

- Prompt versions

- AI summaries

- AI classifications

- AI extracted fields

- AI risk flags

- AI review decisions

- AI feedback

- AI prohibited actions

- AI audit events

## What it connects to

AI connects to:

- Intake

- Documents

- Communications

- Scope

- Reporting

- Audit

- Rules/configuration

- Project records

## What it must not do

AI must not be the final authority for:

- Scope approval

- Sampling strategy approval

- Document release

- Legal/professional boundaries

- Agreement approval

- Cap approval

- Production deployment

- Technical conclusions sent to clients

## Why it matters

AI can accelerate work, but AuxiliumOS must preserve human authority where risk, liability, client trust, and professional judgment matter.

---

# 19. Audit Module

## What it does

The Audit module records meaningful actions, decisions, access, approvals, denials, changes, releases, and system events.

It supports:

- Business audit events

- Actor context

- Object affected

- Before/after changes

- Access decisions

- Security events

- Rule changes

- Document release audit

- Signature audit

- Data export logs

- AI adoption/rejection audit

## What it connects to

Audit connects to every module.

## What it must not do

Audit events should not be casually edited or erased.

They exist to preserve history.

## Why it matters

Audit is the historical record that protects Auxilium, clients, scope decisions, document releases, permissions, and approvals.

---

# 20. Integrations Module

## What it does

The Integrations module manages external system connections.

It may eventually support:

- E-signature systems

- Accounting software

- Email/SMS systems

- Calendar systems

- CMMS systems

- Document storage integrations

- Lab/vendor integrations

- Webhooks

- Sync jobs

- External object IDs

## What it connects to

Integrations connect to:

- Agreements

- Finance

- Documents

- Communications

- Vendors

- Projects

- Reports

- Audit events

## What it must not do

Integrations must not become uncontrolled side doors that bypass AuxiliumOS permissions, audit, release, or scope controls.

## Why it matters

External tools may be necessary, but AuxiliumOS must remain the operational source of truth.

---

# Client Portal Surfaces

AuxiliumOS may eventually have multiple user-facing surfaces.

## Simple Project Portal

For smaller clients such as PA firms, attorneys, restoration contractors, and one-off project clients.

Primary functions:

- Submit request

- View project status

- View released documents

- Ask project-linked questions

- View agreements/invoices if permitted

## Enterprise Facility Portal

For MSA, portfolio, property management, healthcare, industrial, or multi-site clients.

Primary functions:

- View facilities/assets

- View site passports

- Submit incidents/requests

- View site documents

- View open risks

- View site readiness

- View executive dashboards where permitted

- View QBRs where permitted

## Internal Admin Command Center

For Auxilium internal users.

Primary functions:

- Intake queue

- Project queue

- Document release queue

- Missing information queue

- Scope review queue

- Agreement/authorization queue

- Vendor queue

- QBR prep queue

- Risk/exception queue

## Vendor Portal

For vendors where needed.

Primary functions:

- View assigned work only

- Upload vendor documents

- Upload closeout packages

- View limited instructions

- Maintain credentials if permitted

---

# Module Relationship Rules

Modules are separate, but they are not isolated.

Important rules:

1. Accounts own client context.

2. Programs/MSAs define enterprise relationship rules.

3. Assets define physical site context.

4. Intake captures what was requested.

5. Scope controls what is approved or limited.

6. Authorization gives permission to proceed.

7. Operations executes approved work.

8. Documents control files and release.

9. Communications route questions but cannot change scope.

10. Finance tracks operational money and caps.

11. Reporting displays source-truth records.

12. AI assists but does not decide.

13. Audit records meaningful actions.

---

# First Build Slice

The first build slice after prep remains:

Account

→ User Role

→ Facility

→ Incident Request

→ Admin Queue

→ Document Upload

→ Document Release

→ Client View

→ Audit Event

This slice involves the following modules:

- Accounts

- Assets

- Intake

- Operations

- Documents

- Communications if status questions are included later

- Audit

- Security/permissions

- Reporting only as a simple dashboard/status view

This slice intentionally does not yet include the full service ontology, ROM engine, sampling engine, agreement automation, vendor scorecards, or QBR system.

---

# Final Rule

No future module may bypass the data spine.

No future module may bypass:

- Role permissions

- RLS or backend access control

- Document release rules

- Scope approval rules

- Authorization/cap rules

- Audit event requirements

- Professional/legal boundaries

A module is only useful if it makes AuxiliumOS easier to understand, safer to operate, easier to train, and more future-proof.

