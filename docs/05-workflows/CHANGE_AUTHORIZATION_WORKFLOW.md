# Change Authorization Workflow

## Purpose

This file defines how AuxiliumOS handles changes after a scope, authorization, cap, deliverable, sampling decision, project area, or project assumption has already been approved.

The purpose is to prevent scope creep, billing disputes, undocumented client expectations, unauthorized sampling, unauthorized deliverables, and uncontrolled project expansion.

This workflow is a planning document for future scope records, authorization records, project actions, client approvals, admin actions, and audit events.

## Decision Status

Status:
Draft / Founder review required / Not implementation-approved

This file does not implement change authorization behavior. It defines the workflow that future implementation must follow.

---

# Permanent Rules

- Approved scope cannot be changed by chat.
- Approved scope cannot be changed by informal note.
- Approved scope cannot be changed by field observation alone.
- Approved scope cannot be changed by uploaded client document.
- Approved scope cannot be changed by AI summary.
- Approved scope changes require change authorization workflow.
- Change authorization must record what changed, why it changed, who approved it, and what effect it has on scope, ROM, cap, schedule, deliverables, sampling, or limitations.
- Declined changes must be recorded and may require limitation language.
- Emergency work does not automatically authorize all follow-up work.

---

# Change Trigger Categories

Change authorization may be required when any of the following occur.

## New affected area

Examples:
- Additional room
- Additional unit
- Additional building
- Additional floor
- Additional HVAC zone
- Additional facility/site

## New issue or contaminant concern

Examples:
- Fire request reveals chemical/drug residue concern.
- Mold request reveals active water intrusion.
- IAQ request reveals worker exposure concern.
- Water request reveals sewage/contaminated water.
- Repair work reveals asbestos/lead concern.

## New technical module

Examples:
- Add moisture mapping.
- Add HVAC pathway review.
- Add asbestos testing.
- Add lead assessment.
- Add protocol development.
- Add post-work verification.
- Add 3D documentation.
- Add expert/dispute-level review.

## New sampling/testing

Examples:
- Additional samples needed.
- Different sample type needed.
- Rush lab turnaround requested.
- Field conditions require sample count change.
- Client requests sampling after initially declining.

## New deliverable

Examples:
- Formal report
- Protocol/scope document
- PRV report
- Expert narrative report
- Rebuttal letter
- QBR packet
- Measurement package
- Photo log

## Authorization cap issue

Examples:
- Cap too low.
- Work approaching cap.
- Lab/direct costs exceed assumptions.
- Travel/schedule changes increase cost.
- Additional site visit needed.

## Schedule or turnaround change

Examples:
- Rush report requested.
- Weekend/after-hours requested.
- Lab rush requested.
- Out-of-state travel added.
- Client deadline changes.

## Safety/access change

Examples:
- Area becomes unsafe.
- PPE requirements change.
- Structural/electrical concern appears.
- Access delay adds cost/time.
- Healthcare-sensitive area involvement changes scope.

## Professional boundary change

Examples:
- Engineering needed.
- Legal/coverage opinion requested.
- Medical opinion requested.
- Licensed/specialty vendor needed.
- Abatement/remediation contracting required.

---

# Change Request States

## change_draft

Change request is being prepared.

## change_review_pending

Auxilium internal review required.

## change_client_decision_pending

Client must accept, decline, or ask for clarification.

## change_approved

Change is approved.

## change_declined

Client declined the change.

## change_cancelled

Change request cancelled before decision.

## change_expired

Change request expired.

## change_implemented

Approved change has been applied to scope/project.

## change_superseded

Change request was replaced by a newer change request.

---

# Change Request Required Fields

Every change request should record:

- Account
- Project/request
- Existing scope record
- Requested change
- Reason for change
- Trigger category
- Requested by
- Prepared by
- Internal reviewer if required
- Client approver
- Effect on scope
- Effect on deliverables
- Effect on sampling/testing
- Effect on ROM/cap
- Effect on schedule
- Effect on limitations
- Acceptance/declination decision
- Audit events

---

# Change Approval Authority

Draft recommendation:

## Internal Auxilium side

- PM may draft change request.
- Technical Reviewer may review technical changes.
- Account Manager or authorized internal role may review client/account effects.
- Finance/Admin may review cap/billing effects.
- Founder/senior approval may be required for high-risk, legal, emergency, or professional-boundary changes.

## Client side

- Project Approver may approve scope/cap changes within authority.
- Agreement Signer may approve commercial authorization if required.
- Billing Contact may approve billing-only items only if assigned authority.
- Site Champion may request change but does not approve by default.
- Client Executive may approve if assigned authority.

Status:
Founder/legal/security review required.

---

# Change Approval Flow

1. Change trigger identified.
2. PM/admin creates change draft.
3. Change category selected.
4. Internal review performed if required.
5. Scope/ROM/schedule/limitation impacts documented.
6. Client decision request sent to authorized approver.
7. Client accepts, declines, asks clarification, or cancels.
8. If approved, scope record or authorization is updated through approved workflow.
9. If declined, limitation language is applied where needed.
10. Audit event is created.
11. Project team notified.

---

# Declined Change Rule

If client declines recommended change, record:

- Recommendation
- Reason for recommendation
- Client decision
- Date/time
- Decision maker
- Scope limitation
- Effect on conclusions/deliverables
- Whether Auxilium can continue limited scope

Examples:
- Client declines sampling but wants strong conclusions.
- Client declines asbestos testing before material disturbance.
- Client declines additional affected-area review.
- Client declines cap increase.
- Client declines return visit.

---

# Chat/Message Rule

A chat/message may create:

- Clarification
- Task
- Change request draft
- Review request
- Client question

A chat/message cannot directly:

- Change approved scope
- Increase cap
- Add sampling
- Add deliverable
- Add site visit
- Change document release state
- Modify signed authorization

---

# Emergency Follow-Up Rule

Emergency work may create a required follow-up change/scope request.

Emergency authorization does not automatically authorize:

- Full report
- Sampling
- Protocol
- PRV
- Return visit
- Expert report
- Additional areas
- Vendor pass-throughs
- Major direct costs

Those require separate change or project authorization unless already included.

---

# Required Audit Events

- change_request_created
- change_review_started
- change_review_completed
- change_sent_to_client
- change_approved
- change_declined
- change_cancelled
- change_expired
- change_implemented
- change_superseded
- limitation_added_after_decline
- cap_increase_requested
- cap_increase_approved
- sampling_change_requested
- deliverable_change_requested

---

# Open Decisions

The following require founder/legal/security/operations review:

- Which internal roles can approve changes before sending to client.
- Which client roles can approve change authorizations.
- Whether Project Approver can approve cap increases.
- Whether Agreement Signer must approve all cap increases.
- Whether Site Champion can approve any low-level change.
- Whether certain MSA clients have pre-approved change thresholds.
- Whether sampling changes require separate approval every time.
- Whether declined changes automatically generate limitation language.
- Whether change authorizations expire after a set number of days.

---

# Implementation Notes for Later

- Change authorization must link to the prior scope record.
- Approved change should not erase original scope history.
- Declined change should be preserved.
- Scope ledger should show accepted and declined changes.
- Change approval must create audit events.
- Change request UI should be simple for client but detailed internally.
- Change authorization must integrate with ROM/cap logic later.