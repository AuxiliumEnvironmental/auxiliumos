# Role Permission Matrix

## Purpose

This file defines the initial AuxiliumOS user roles, authority boundaries, and permission expectations.

It is a planning document for future application permissions, Supabase RLS policies, UI access controls, document visibility, approval workflows, and audit requirements.

## Decision Status

Status:
Draft / Founder review required / Not implementation-approved

Important note:
This matrix is a planning draft. It defines proposed roles, authority boundaries, and permission expectations for AuxiliumOS v1.

This file does not implement permissions, RLS policies, production access, client access, document release authority, financial authority, or professional/legal authority.

Any unresolved authority decisions must remain marked as TBD or listed under Open Decisions until founder/legal/security review is complete.

---

# Permanent Rules

- Role names do not equal unlimited permission.
- Permissions must be action-based.
- Client-side users cannot see records only because they belong to the same company.
- Facility/site access may be narrower than account access.
- Document access is separate from project access.
- Financial access is separate from document access.
- Agreement signing is separate from request submission.
- Admin access is not automatically technical approval.
- Technical review authority is separate from commercial/signature authority.
- UI hiding is not security.
- Future Supabase RLS must enforce these boundaries at the backend/database level.

---

# Role Scopes

Roles and permissions may apply at different scopes.

## Global

Applies across the platform.

Example:
System Administrator.

## Account

Applies to a specific client account.

Example:
Client Executive for one client account.

## Program / MSA

Applies to a specific enterprise program or MSA.

Example:
Nutex national program manager.

## Portfolio

Applies to a group of assets/properties/facilities.

Example:
Regional property portfolio manager.

## Asset / Facility

Applies to one facility/property/site.

Example:
Site Champion for one healthcare facility.

## Zone / Area

Applies to one area within a facility/property.

Example:
Department, unit, floor, room, or affected area.

## Incident

Applies to one incident.

Example:
Water intrusion incident at one facility.

## Project Request

Applies to one submitted request before it becomes a project.

Example:
Client request awaiting Auxilium review.

## Project

Applies to one accepted project.

Example:
Fire/smoke assessment project.

## Document

Applies to one document or document package.

Example:
Released report, invoice, lab result, QBR packet.

## Vendor

Applies to vendor records or assigned vendor work.

Example:
Vendor user assigned to one work order.

## Financial Record

Applies to billing, invoices, caps, reserves, and pass-throughs.

Example:
Billing Contact viewing invoices only.

---

# Auxilium Internal Roles

## System Admin

Purpose:
Manages system configuration, platform-level settings, users, integrations, and emergency technical administration.

May:
- Manage platform configuration.
- Manage internal users.
- Manage system settings.
- View system audit records.
- Support integrations after approval.
- Troubleshoot technical system issues.

Must not:
- Approve technical scope by default.
- Release technical reports by default.
- Override professional/legal boundaries without proper authority.
- Use admin access as a substitute for business approval.

Decision status:
Draft / founder review required.

---

## Account Manager

Purpose:
Owns client/account relationship, account-level coordination, and client success.

May:
- View assigned accounts.
- Manage account-level contacts.
- Coordinate client communication.
- Review account status.
- Assist with account-level approvals.
- Participate in QBR/client reporting workflows.

Must not:
- Release documents unless separately authorized.
- Approve technical conclusions unless qualified and assigned.
- Override technical reviewer requirements.
- Override financial/cap approval rules.

Decision status:
Draft / founder review required.

---

## Intake Admin

Purpose:
Reviews incoming requests for completeness, routing, and missing information.

May:
- View submitted requests.
- Request missing information.
- Assign or route requests to PM/reviewer.
- Update intake status.
- Identify obvious missing payer/signer/access details.

Must not:
- Approve final scope.
- Release reports.
- Make technical conclusions.
- Accept work as approved without required review/authorization.

Decision status:
Draft / founder review required.

---

## Project Manager

Purpose:
Manages accepted project work and coordinates execution of approved scope.

May:
- View assigned projects.
- Coordinate tasks.
- Prepare scope drafts.
- Communicate project status.
- Request document release.
- Create change request drafts.
- Assign internal tasks where permitted.
- Coordinate client/project communications.

Must not:
- Change locked scope without change authorization.
- Release final reports alone unless policy later allows.
- Override technical reviewer requirements.
- Approve client cap increases unless separately authorized.
- Act outside approved professional boundaries.

Decision status:
Draft / founder review required.

---

## Technical Reviewer

Purpose:
Reviews technical scope, high-risk requests, sampling logic, report readiness, and professional conclusions.

May:
- Review technical scope.
- Approve technical deliverable readiness.
- Flag limitations.
- Require changes before release.
- Require sampling/scope limitations when appropriate.
- Review high-risk requests.

Must not:
- Sign commercial agreements unless separately authorized.
- Override client financial approval.
- Release documents unless also assigned document-release role.
- Create client-facing legal/coverage opinions unless separately authorized and appropriate.

Decision status:
Draft / founder review required.

---

## Document Controller

Purpose:
Controls document classification, versioning, release state, supersession, restrictions, and client visibility.

May:
- Classify documents.
- Verify document metadata.
- Release documents when approval requirements are satisfied.
- Supersede documents.
- Restrict documents when required.
- Confirm document visibility rules.

Must not:
- Create technical conclusions.
- Release documents without required approval.
- Override legal/technical restrictions.
- Treat folder location as access permission.

Decision status:
Draft / founder review required.

---

## Finance/Admin

Purpose:
Manages invoice, cap, payment, purchase order, and billing workflows.

May:
- View billing records.
- Manage invoices.
- Track payment/cap status.
- Request billing information.
- Support purchase order/payment workflows.
- Prepare financial exports where approved.

Must not:
- Approve technical scope.
- Release technical documents.
- View technical documents by default unless needed.
- Approve project work without authorization authority.

Decision status:
Draft / founder review required.

---

## Vendor Coordinator

Purpose:
Manages vendor records, credentials, assignments, documents, and closeout package coordination.

May:
- View vendor records.
- Request vendor documentation.
- Track COIs/licenses.
- Assign vendors where approved.
- Review vendor closeout documentation.
- Maintain vendor scorecard inputs.

Must not:
- Give vendors access to unrelated client records.
- Approve licensed/specialist work outside authority.
- Blur Auxilium/vendor professional boundaries.
- Treat vendor upload as automatically client-visible.

Decision status:
Draft / founder review required.

---

## Executive Viewer

Purpose:
Provides internal leadership visibility.

May:
- View executive dashboards.
- View assigned high-level reports.
- View risk summaries.
- View program/account summaries.

Must not:
- Perform operational actions unless separately assigned.
- Override review, release, scope, or financial workflows.

Decision status:
Draft / founder review required.

---

# Client-Side Roles

## Client Executive

Purpose:
Executive-level client visibility.

May:
- View account/program dashboards.
- View executive reports/QBRs.
- View facilities within assigned scope.
- View released executive documents.
- View open executive action items where permitted.

Must not:
- View internal Auxilium notes.
- Automatically see every document unless granted.
- Submit operational site details unless also assigned requester role.
- Approve scope/caps unless assigned authority.

Decision status:
Draft / founder review required.

---

## Portfolio Manager

Purpose:
Client manager over multiple assets, properties, or facilities.

May:
- View assigned portfolios.
- View assigned facilities.
- View open incidents/projects for assigned assets.
- View released documents within assigned scope.
- Submit requests if assigned.

Must not:
- View unrelated portfolios.
- Release documents.
- Override signer authority.
- View billing unless separately assigned.

Decision status:
Draft / founder review required.

---

## Regional Manager

Purpose:
Client user with regional facility/property oversight.

May:
- View assigned regional facilities.
- View assigned incidents/projects.
- Submit regional requests if permitted.
- View released documents for assigned region.

Must not:
- View unrelated regions.
- View executive-only documents unless granted.
- Approve caps/signatures unless assigned.

Decision status:
Draft / founder review required.

---

## Site Champion

Purpose:
Local facility contact trained to submit incidents, provide site information, and support response workflow.

May:
- View assigned facility.
- Submit incident/request.
- Upload photos/documents.
- View released facility/project documents if permitted.
- View assigned site tasks.
- Update limited site contact/access information if permitted.

Must not:
- View other facilities by default.
- View invoices by default.
- Approve caps by default.
- Sign agreements by default.
- View executive/QBR documents by default.
- Change scope by message.

Decision status:
Draft / founder review required.

---

## Project Requester

Purpose:
Client user who may submit project requests.

May:
- Submit requests.
- Upload supporting documents/photos.
- View own submitted requests if permitted.
- Respond to missing-information requests.

Must not:
- Approve final scope unless also Project Approver.
- Sign agreements unless also Agreement Signer.
- View unrelated projects.
- Change approved scope through messages.

Decision status:
Draft / founder review required.

---

## Project Approver

Purpose:
Client user who may approve project scope or changes within assigned limits.

May:
- Approve scope where assigned.
- Approve change requests within threshold.
- Approve sampling/cap changes if permitted.
- Approve limited-scope decisions if authorized.

Must not:
- Sign agreements unless also Agreement Signer.
- View unrelated assets/projects.
- Release documents.
- Override internal Auxilium technical review.

Decision status:
Draft / founder review required.

---

## Agreement Signer

Purpose:
Authorized client signer for agreements and authorizations.

May:
- Sign agreements/authorizations.
- Approve commercial terms where assigned.
- Accept authorization cap where assigned.

Must not:
- Automatically view all technical documents unless separately granted.
- Automatically submit operational requests unless also requester.
- Override internal Auxilium review requirements.

Decision status:
Draft / founder review required.

---

## Billing Contact

Purpose:
Client user responsible for invoices, payment status, and purchase order workflows.

May:
- View invoices.
- Receive billing notices.
- Upload PO/payment documentation.
- Communicate on billing matters.

Must not:
- View technical reports by default.
- Approve scope unless also Project Approver.
- Sign agreements unless also Agreement Signer.
- View unrelated project documents.

Decision status:
Draft / founder review required.

---

## Document Viewer

Purpose:
Read-only client document access.

May:
- View/download released documents within assigned scope.

Must not:
- Submit requests by default.
- Upload documents by default.
- View drafts/internal notes.
- View unreleased or restricted documents.
- Approve scope/caps/agreements.

Decision status:
Draft / founder review required.

---

## Vendor User

Purpose:
External vendor with limited assigned work access.

May:
- View assigned work only.
- Upload vendor documents.
- Upload closeout packages.
- Maintain credential documents if permitted.

Must not:
- View unrelated projects.
- View invoices unless specifically permitted.
- View internal notes.
- View executive/QBR documents.
- View other vendors’ records.
- Access client documents unless explicitly released.

Decision status:
Draft / founder review required.

---

# Permission Groups

## Account permissions

- view_account
- edit_account_profile
- manage_account_users
- view_account_dashboard

## Asset / facility permissions

- view_asset
- edit_asset_profile
- view_site_passport
- edit_site_passport
- view_asset_documents
- submit_asset_incident

## Intake / project request permissions

- submit_request
- view_request
- review_request
- request_missing_information
- reclassify_request

## Scope permissions

- prepare_scope
- review_scope
- approve_scope
- lock_scope
- request_scope_change
- approve_scope_change

## Document permissions

- upload_document
- classify_document
- view_internal_document
- view_released_document
- download_released_document
- request_document_release
- approve_document_release
- release_document
- supersede_document
- restrict_document

## Agreement / authorization permissions

- generate_authorization
- send_authorization
- sign_authorization
- approve_cap
- approve_change_authorization

## Finance permissions

- view_invoice
- create_invoice
- approve_spend
- view_financial_dashboard
- export_financial_records

## Vendor permissions

- view_vendor
- edit_vendor
- assign_vendor
- upload_vendor_document
- view_vendor_scorecard

## Admin / system permissions

- manage_roles
- manage_permissions
- manage_integrations
- view_audit_events
- manage_environment_settings

---

# V1 Permission Matrix

| Role | Submit request | View assigned asset | View project | Upload docs | View released docs | Download docs | Approve scope | Sign agreement | Approve cap | Release docs | View invoice | Admin config |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| System Admin | Internal | Internal | Internal | Yes | Internal | Internal | No default | No default | No default | No default | Internal | Yes |
| Account Manager | No default | Assigned | Assigned | Yes | Assigned | Assigned | No default | No | No default | No | Assigned | No |
| Intake Admin | Review | Assigned | Limited | Yes | Limited | Limited | No | No | No | No | No | No |
| Project Manager | Internal | Assigned | Assigned | Yes | Assigned | Assigned | Draft only | No | Draft only | Request only | Limited | No |
| Technical Reviewer | No | Assigned | Assigned | Yes | Assigned | Assigned | Technical review | No | No | Approve readiness | No | No |
| Document Controller | No | Assigned | Assigned | Yes | Assigned | Assigned | No | No | No | Yes after approval | No | No |
| Finance/Admin | No | Limited | Limited | Billing docs | No default | No default | No | No | Finance only | No | Yes | No |
| Vendor Coordinator | No | Assigned | Assigned vendor scope | Vendor docs | Limited | Limited | No | No | No | No | No | No |
| Executive Viewer | No | All assigned | All assigned | No | Released only | Released only | No | No | No | No | Summary only | No |
| Client Executive | Optional | Assigned | Assigned | Optional | Released only | Released only | If assigned | If assigned | If assigned | No | If assigned | No |
| Portfolio Manager | Optional | Assigned portfolio | Assigned | Optional | Released only | Released only | If assigned | No default | If assigned | No | If assigned | No |
| Regional Manager | Optional | Assigned region | Assigned | Optional | Released only | Released only | If assigned | No default | If assigned | No | If assigned | No |
| Site Champion | Yes | Assigned facility only | Assigned facility only | Yes | Released assigned only | Released assigned only | No default | No | No default | No | No default | No |
| Project Requester | Yes | Assigned | Own/assigned | Yes | Released assigned only | Released assigned only | No default | No | No default | No | No default | No |
| Project Approver | Optional | Assigned | Assigned | Optional | Released assigned only | Released assigned only | Yes within authority | No default | Yes within authority | No | Maybe | No |
| Agreement Signer | No default | Assigned | Assigned | No default | Released assigned only | Released assigned only | Maybe | Yes | Maybe | No | Maybe | No |
| Billing Contact | No default | Limited | Limited | Billing docs | No default | No default | No | No | No default | No | Yes | No |
| Document Viewer | No | Assigned | Assigned | No | Released assigned only | Released assigned only | No | No | No | No | No | No |
| Vendor User | No | Assigned work only | Assigned work only | Vendor docs only | Vendor-released only | Vendor-released only | No | No | No | No | No | No |

---

# Open Decisions

The following items remain unresolved and require founder/legal/security review before implementation:

- Exact final document release authority.
- Exact final scope approval authority.
- Exact final cap/change authorization authority.
- Exact approval thresholds by client/account type.
- Whether Project Manager can release any non-technical document without Document Controller.
- Whether final reports always require Technical Reviewer approval.
- Whether Client Executive automatically sees all assigned account/facility records.
- Whether Billing Contact can see project status without technical reports.
- Whether Vendor User should exist in v1 or be deferred.
- Whether Agreement Signer can approve scope/caps or only sign agreements.
- Whether Project Approver can approve sampling authorization or only scope/cap changes.
- Whether Site Champion can view released final reports by default or only site-level documents.

---

# Implementation Notes for Later

- This matrix is a planning document, not an implemented permission system.
- Future Supabase RLS must enforce these boundaries.
- UI hiding is not sufficient security.
- Every permission that affects client data must be tested.
- Role logic must be reflected in future seed data and RLS tests.
- No real client users should be invited until this matrix is reviewed and implemented.
- No production access should be granted from this draft.
- Any role that affects document release, scope approval, cap approval, agreement signing, or client visibility requires founder/legal/security review before implementation.