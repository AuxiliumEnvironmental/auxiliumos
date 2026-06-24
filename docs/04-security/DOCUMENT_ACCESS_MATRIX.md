# Document Access Matrix

## Purpose

This file defines the initial AuxiliumOS document classes, document visibility expectations, release requirements, download rules, and document-control authority boundaries.

It is a planning document for future Supabase Storage policies, RLS policies, document metadata, client document portals, admin document release workflows, and audit events.

## Decision Status

Status:
Draft / Founder review required / Not implementation-approved

Important note:
This matrix is a planning draft. It does not implement storage buckets, RLS policies, production access, client document visibility, or final document release authority.

Any unresolved document release or access decisions must remain marked as TBD or listed under Open Decisions until founder/legal/security review is complete.

---

# Permanent Rules

- No document is client-visible by default.
- Folder location does not determine access.
- Document metadata determines access.
- Draft reports are internal by default.
- Internal notes are never client-visible by default.
- Client uploads are not automatically accepted as technical truth.
- Vendor uploads are not automatically client-visible.
- Released documents require classification, versioning, release approval, permission check, and audit event.
- Download and view events should be auditable.
- Legal/dispute-sensitive documents require special restrictions.
- Superseded documents must remain traceable.
- Storage paths are not security.
- Future Supabase RLS and Storage policies must enforce access at the backend level.

---

# Document States

## uploaded_unclassified

Meaning:
A document exists in the system but has not yet been fully classified.

Client-visible by default:
No.

---

## internal_draft

Meaning:
A working document, draft report, internal note, or pre-release file.

Client-visible by default:
No.

---

## under_review

Meaning:
A document is under technical, project, legal, admin, or document-control review.

Client-visible by default:
No.

---

## approved_internal

Meaning:
A document has been internally approved but has not yet been released to the client.

Client-visible by default:
No.

---

## release_requested

Meaning:
A release has been requested but not yet completed.

Client-visible by default:
No.

---

## client_visible_released

Meaning:
A document has been approved for release and is visible to authorized client users.

Client-visible by default:
Only after explicit release and permission check.

---

## superseded

Meaning:
A document has been replaced by a newer version.

Client-visible by default:
No, unless a policy intentionally allows released historical versions.

---

## archived

Meaning:
A document is retained but no longer active.

Client-visible by default:
No.

---

## restricted

Meaning:
A document has special access restrictions due to sensitivity, legal/dispute status, error, risk, or other control reason.

Client-visible by default:
No.

---

## withdrawn

Meaning:
A document was removed from active release or distribution.

Client-visible by default:
No.

---

# Document Classes

| Document Class | Description | Client-visible by default? | Release required? | View/download audit? |
|---|---|---:|---:|---:|
| Internal Note | Internal Auxilium note or project comment | No | N/A | Yes if accessed |
| Client Upload | Client-submitted file, photo, video, or document | No | Yes if later shared/released | Yes |
| Field Photo | Auxilium field photo or site image | No | Yes | Yes |
| Draft Report | Draft report or deliverable | No | Cannot be released as draft | Yes |
| Final Report | Final reviewed report | No | Yes | Yes |
| Lab Report | Laboratory analytical result/report | No | Yes | Yes |
| Agreement | Draft/generated agreement or service authorization | Limited | Yes if client-facing | Yes |
| Signed Authorization | Signed approval, agreement, or authorization | Yes for authorized parties | Yes/status-based | Yes |
| Invoice | Billing document | Billing users only | Yes | Yes |
| Site Passport | Site/facility passport document | No by default | Yes | Yes |
| Critical Asset Registry | Facility critical asset list | No by default | Yes | Yes |
| Vendor Document | Vendor COI, license, closeout, or credential document | No by default | Yes if shared | Yes |
| QBR Packet | Quarterly/executive reporting packet | Executive only | Yes | Yes |
| Executive Document | Executive-sensitive account/program document | No by default | Yes | Yes |
| Legal/Dispute Sensitive | Legal, dispute, rebuttal, expert, or claim-sensitive file | No | Special approval | Yes |
| Archive/Superseded | Old/replaced document | No by default | Controlled | Yes |

---

# Access Matrix

| Document Class | Upload | Internal View | Client View | Download | Release Authority |
|---|---|---|---|---|---|
| Internal Note | Auxilium only | Assigned internal roles | No | Internal only | N/A |
| Client Upload | Client/Auxilium | Assigned internal roles | Original uploader or assigned users if permitted | Permission-based | Document Controller if re-released |
| Field Photo | Auxilium | Assigned internal roles | Only if released | Permission-based | PM/Reviewer readiness + Document Controller release |
| Draft Report | Auxilium | Assigned internal roles | No | Internal only | Cannot release while draft |
| Final Report | Auxilium | Assigned internal roles | Released users only | Permission-based | Technical Reviewer approves + Document Controller releases |
| Lab Report | Auxilium/Lab | Assigned internal roles | Released users only | Permission-based | PM/Reviewer approval + Document Controller releases |
| Agreement | Auxilium | Assigned internal/authorized client | Authorized parties only | Permission-based | Agreement workflow |
| Signed Authorization | E-sign workflow/Auxilium | Assigned internal/authorized client | Authorized parties only | Permission-based | Signature workflow |
| Invoice | Finance/Admin | Finance/Admin | Billing users only | Billing users only | Finance/Admin |
| Site Passport | Auxilium | Assigned internal roles | Assigned client roles if released | Permission-based | Account Manager/PM + Document Controller |
| Critical Asset Registry | Auxilium/client input | Assigned internal roles | Assigned enterprise roles if released | Permission-based | Account Manager/PM + Document Controller |
| Vendor Document | Vendor/Auxilium | Vendor Coordinator/internal | Limited if released | Permission-based | Vendor Coordinator/Document Controller |
| QBR Packet | Auxilium | Assigned internal roles | Executive/client approved roles | Permission-based | Account Manager/Executive review + Document Controller |
| Executive Document | Auxilium | Restricted internal roles | Executive-only if released | Permission-based | Executive/Internal approval + Document Controller |
| Legal/Dispute Sensitive | Auxilium/legal | Restricted internal roles | Special grant only | Restricted | Legal/founder approval + Document Controller |
| Archive/Superseded | System/Auxilium | Assigned internal roles | Usually hidden unless specifically released | Controlled | Document Controller |

---

# Release Requirements

Client-visible release requires:

1. Document class assigned.
2. Correct linked object exists.
3. Document version exists.
4. Draft/final/internal status is known.
5. Sensitivity level is assigned.
6. Technical/project approval is completed if required.
7. Release decision is recorded.
8. Permissions are checked.
9. Document state changes to client_visible_released.
10. Audit event is created.
11. Client notification is created if needed.

---

# Download Rule

A user may download a document only if:

- The document is released or otherwise explicitly granted.
- The user has account, asset, project, and/or document-level permission.
- The document class allows download for that user type.
- The document is not restricted, withdrawn, or blocked by legal hold.
- The download creates an audit event.

---

# View Rule

A user may view a document only if:

- The user has permission to the linked account/object.
- The document class permits visibility for that role.
- The document state permits visibility.
- The document is not restricted or withdrawn.
- The view event is audited where required.

---

# Supersession Rule

When a document is replaced:

- The old version must be marked superseded.
- The new version must be linked.
- The supersession must be auditable.
- Client access to the old version must follow policy.
- Users must not be confused about which version is active.

---

# Legal / Dispute Sensitive Rule

Legal/dispute-sensitive documents require special controls.

They may include:

- Expert reports
- Rebuttal letters
- Litigation-related files
- Attorney communications
- Claim-sensitive materials
- High-risk technical opinions
- Privileged or confidential materials where applicable

These documents should require founder/legal/project approval before client release.

---

# Vendor Document Rule

Vendor documents are not automatically client-visible.

Vendor documents may include:

- COI
- Licenses
- W-9
- Closeout documents
- Photos
- Vendor invoices
- Work summaries
- Safety documents

Vendor document visibility must be controlled by document class, project assignment, release decision, and permission.

---

# Client Upload Rule

Client uploads are supporting information.

Client uploads are not automatically:

- Approved scope
- Verified facts
- Final deliverables
- Technical conclusions
- Released documents
- Client-visible official records

Auxilium must review and classify client uploads before relying on or redistributing them.

---

# Open Decisions

The following items require founder/legal/security review before implementation:

- Whether PM can release routine non-technical documents without Document Controller.
- Whether final reports always require Technical Reviewer approval before release.
- Whether QBR packets require executive approval before release.
- Whether client uploads remain visible to original uploader by default.
- Whether invoices appear inside project pages or billing-only pages.
- Whether Site Champions can view final reports by default.
- Whether Executive Documents are visible to Client Executive by default or by explicit grant.
- Whether superseded released documents remain visible to clients.
- Whether Legal/Dispute Sensitive documents require separate legal approval before release.

---

# Implementation Notes for Later

- Supabase Storage buckets must not be created until this matrix is reviewed.
- Storage paths are not access control.
- RLS and Storage policies must enforce document access.
- Signed URLs and download URLs must respect document permissions.
- Draft/internal documents must not be exposed through UI or direct URL access.
- Document release actions must create audit events.
- Document access rules must be tested before real client data is used.
- This matrix is a planning draft and is not implementation-approved.