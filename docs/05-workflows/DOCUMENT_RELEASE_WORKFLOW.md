> 2026-10-08 refinement: approval binds to exact immutable version/checksum. A replacement draft does not supersede the current release. Preservation hold blocks destruction separately from visibility restrictions. OWNER_DECISIONS.json OD-002/003/004/011 tracks proposed live policies.

# Document Release Workflow

## Purpose

This file defines how documents move from upload to internal review to client-visible release, restriction, supersession, withdrawal, or archive.

It is a planning document for future document metadata, Supabase Storage, RLS policies, UI document lists, admin release workflows, and audit events.

## Decision Status

Status:
Draft / Founder review required / Not implementation-approved

This file does not implement document release behavior. It defines the workflow that future implementation must follow.

---

# Permanent Rules

- No document is client-visible by default.
- Draft reports are internal.
- Internal notes are internal.
- Client uploads are not automatically approved or accepted as truth.
- Vendor uploads are not automatically client-visible.
- Release requires metadata, approval, permission, and audit.
- Folder path is not security.
- Download/view events should be auditable.
- Superseded documents must remain traceable.
- Restricted documents must not be visible unless specially granted.

---

# Document Release States

## uploaded_unclassified

Document exists but class/release status is not finalized.

Client-visible:
No.

---

## internal_draft

Document is a draft, working file, internal note, or pre-release item.

Client-visible:
No.

---

## under_review

Document is being reviewed for technical, project, admin, legal, or document-control readiness.

Client-visible:
No.

---

## approved_internal

Document has internal approval but is not yet released.

Client-visible:
No.

---

## release_requested

Release has been requested and is waiting for required approval or final release action.

Client-visible:
No.

---

## client_visible_released

Document has been released and is visible to authorized client users.

Client-visible:
Yes, only for permitted users.

---

## superseded

Document has been replaced by a newer version.

Client-visible:
Controlled by policy.

---

## archived

Document is retained but inactive.

Client-visible:
No by default.

---

## restricted

Document is restricted due to sensitivity, legal/dispute issue, error, or risk.

Client-visible:
No unless special grant exists.

---

## withdrawn

Document was removed from active release.

Client-visible:
No.

---

# Standard Release Flow

1. Document uploaded.
2. Document class assigned.
3. Linked object confirmed.
4. Version created.
5. Sensitivity assigned.
6. Draft/final status confirmed.
7. Internal review completed if required.
8. Release requested.
9. Release authority verifies approval.
10. Permission rules checked.
11. Document state changes to client_visible_released.
12. Audit event created.
13. Client notification created if needed.

---

# Release Authority Draft

## Final Report

Draft recommendation:
Technical Reviewer approves readiness. Document Controller releases.

Status:
Founder/legal/security review required.

## Lab Report

Draft recommendation:
PM or Technical Reviewer approves release context. Document Controller releases.

Status:
Founder/legal/security review required.

## Signed Authorization

Draft recommendation:
Agreement/signature workflow releases to authorized parties.

Status:
Founder/legal/security review required.

## Invoice

Draft recommendation:
Finance/Admin releases to authorized billing users.

Status:
Founder/legal/security review required.

## Site Passport

Draft recommendation:
Account Manager/PM approves. Document Controller releases to authorized enterprise users.

Status:
Founder/legal/security review required.

## QBR Packet

Draft recommendation:
Account Manager/executive review. Document Controller releases to executive-authorized users.

Status:
Founder/legal/security review required.

## Vendor Document

Draft recommendation:
Vendor Coordinator approves context. Document Controller releases if client-visible.

Status:
Founder/legal/security review required.

## Legal/Dispute Sensitive Document

Draft recommendation:
Founder/legal/senior approval required before release.

Status:
Founder/legal/security review required.

---

# Supersession Flow

1. New version created.
2. New version linked to original document.
3. Prior released version remains current while the replacement is drafted and reviewed. Mark it superseded only when the replacement is validly released through the controlled transition.
4. Active version clearly identified.
5. Client visibility of prior version follows policy.
6. Audit event records supersession.

---

# Restriction Flow

1. Authorized internal user flags document for restriction.
2. Reason is recorded.
3. Document state changes to restricted.
4. Client visibility is suspended if required.
5. Audit event is created.
6. Review/approval required before re-release.

---

# Withdrawal Flow

1. Release problem or business reason is identified.
2. Authorized internal user requests withdrawal.
3. Reviewer/Document Controller confirms action.
4. Document state changes to withdrawn.
5. Client visibility is removed.
6. Audit event is created.
7. Follow-up communication/task created if needed.

---

# Archive Flow

1. Document is no longer active.
2. Retention/archive status is assigned.
3. Client visibility follows archive policy.
4. Audit event is created if visibility changes.

---

# Required Audit Events

- document_uploaded
- document_classified
- document_review_started
- document_review_completed
- document_release_requested
- document_release_approved
- document_released
- document_viewed
- document_downloaded
- document_superseded
- document_restricted
- document_withdrawn
- document_archived

---

# Release Blocking Conditions

A document must not be released if:

- Document class is missing.
- Linked account/object is missing.
- Version is missing.
- It is a draft report.
- It is an internal note.
- Required technical review is missing.
- Required legal/founder approval is missing.
- It is restricted or withdrawn.
- User access rules are unresolved.
- The release would expose PHI or real sensitive data improperly.
- The release would conflict with approved scope or authorization.

---

# Open Decisions

The following require founder/legal/security review:

- Whether PM can release any routine non-technical documents.
- Whether final reports always require Technical Reviewer approval.
- Whether QBR packets require executive approval.
- Whether client uploads stay visible to original uploader by default.
- Whether superseded documents remain visible to clients.
- Whether legal/dispute-sensitive documents require separate legal approval.
- Whether document release approval and release action must always be two separate users.

---

# Implementation Notes for Later

- This workflow must be reflected in future document tables.
- Supabase Storage buckets must respect document release status.
- RLS policies must enforce document visibility.
- UI must not show draft/internal documents to clients.
- Direct URL access must not bypass release rules.
- Every release/restriction/supersession action must be auditable.
