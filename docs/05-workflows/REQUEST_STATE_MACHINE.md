# Project Request State Machine

## Purpose

This file defines how a client-submitted project request moves through Auxilium review before it becomes an approved project, is revised, is declined, or expires.

The state machine protects Auxilium from unclear expectations, premature scheduling, missing payer/signer information, undocumented sampling assumptions, missing safety information, and scope disputes.

## Decision Status

Status:
Draft / Founder review required / Not implementation-approved

This file does not implement request workflow behavior. It defines the workflow that future implementation must follow.

---

# Permanent Rules

- A submitted request is not accepted work.
- A request is not a signed agreement.
- A request is not authorization to mobilize.
- Auxilium may accept, revise, reclassify, limit, request more information, or decline a request.
- No scheduling release before required authorization unless emergency exception applies.
- Client messages cannot directly change approved scope.
- Sampling is not assumed unless authorized.
- Deliverables are not assumed unless included.
- Missing payer/signer/access/safety details may block progress.

---

# Request States

## draft

Meaning:
Client is preparing request.

Allowed actions:
- Client edits request.
- Client uploads supporting information.
- Client saves draft.

Not allowed:
- Auxilium treats request as accepted work.

---

## submitted

Meaning:
Client submitted request.

Allowed actions:
- Auxilium receives request.
- Intake review begins.

Not allowed:
- Automatic project creation without review.
- Automatic scheduling.
- Automatic agreement generation unless workflow supports it.

---

## intake_completeness_review

Meaning:
Auxilium checks whether required information exists.

Check for:
- Account
- Requester
- Property/facility
- Affected area
- Issue/intent
- Urgency
- Site contact/access
- Payer/billing
- Signer/approver
- Safety flags
- Uploads if required

---

## needs_client_information

Meaning:
Client must provide missing or clarifying information.

Examples:
- Missing site contact
- Missing payer
- Missing signer
- Missing affected areas
- Missing photos/documents
- Missing safety information
- Missing access instructions

---

## classification_review

Meaning:
Auxilium reviews whether the request was classified correctly.

Examples:
- “Mold inspection” may become moisture/source/extent review.
- “IAQ complaint” may become worker exposure review.
- “Clearance” may require baseline/protocol review.
- “Fire assessment” may trigger regulated-material or contamination review.

---

## technical_review

Meaning:
Technical reviewer evaluates technical complexity, risk, sampling, deliverables, limitations, and professional boundaries.

Required when:
- Complex scope
- Sampling/testing
- Healthcare/sensitive occupancy
- Worker exposure/IH
- Asbestos/lead
- Chemical/drug contamination
- Legal/dispute sensitivity
- Client requests strong opinions with limited scope

---

## safety_review

Meaning:
Safety or high-risk review is required.

Required when:
- Chemical hazard
- Suspected drug contamination
- Sewage/Category 3 water
- Structural/electrical hazard
- Healthcare active occupancy
- Confined/restricted access
- Demolition/material disturbance
- Unknown residue
- Emergency response

---

## rom_preparation

Meaning:
Auxilium prepares T&M ROM assumptions, labor ranges, direct-cost ranges, sampling assumptions, travel, turnaround, and authorization cap recommendation.

---

## revision_proposed

Meaning:
Auxilium proposes revised scope, reclassification, recommended add-ons, sampling, limitations, or changed ROM.

---

## client_revision_pending

Meaning:
Client must accept, decline, or ask about Auxilium’s proposed revision.

Possible client responses:
- Accept revision
- Decline recommendation
- Ask clarification
- Keep limited scope
- Cancel request

---

## approved_for_agreement

Meaning:
Scope/ROM is ready for agreement or service authorization.

---

## agreement_pending

Meaning:
Agreement or service authorization is being generated/prepared.

---

## signature_pending

Meaning:
Authorized signer must sign.

---

## payment_or_cap_pending

Meaning:
Payment method, PO, deposit, authorization cap, or financial approval is required.

---

## scheduling_released

Meaning:
Scheduling may occur because minimum authorization gates are satisfied.

---

## converted_to_project

Meaning:
Request became an accepted project.

---

## declined

Meaning:
Auxilium declined the request.

---

## cancelled

Meaning:
Client or Auxilium cancelled the request.

---

## expired

Meaning:
Request, ROM, agreement, or authorization expired.

---

# Invalid Transitions

Invalid or blocked transitions include:

- submitted directly to converted_to_project without review/authorization.
- submitted directly to scheduling_released without agreement/cap/emergency authorization.
- needs_client_information directly to scheduling_released.
- chat message directly to approved scope change.
- draft document directly to client-visible release.
- declined directly to active project without new approval.
- sampling declined but report assumes sampling-supported conclusions.
- emergency request directly to unlimited project scope.

---

# Human Review Gates

Human review is required for:

- Asbestos/lead triggers
- Healthcare/sensitive occupancy
- Suspected chemical/drug contamination
- Worker exposure/IH
- Emergency/out-of-state mobilization
- Legal/dispute-sensitive work
- Sampling declined but strong opinions requested
- Demolition/material disturbance
- Unclear payer/signer
- Unsafe access
- PRV requested without baseline/protocol
- Mold/IAQ request that appears to be moisture/source/extent
- IAQ request that appears to be worker exposure/compliance

---

# Required Audit Events

- request_created
- request_submitted
- intake_review_started
- missing_information_requested
- missing_information_received
- request_reclassified
- technical_review_required
- safety_review_required
- rom_preparation_started
- revision_proposed
- client_revision_accepted
- client_revision_declined
- request_approved_for_agreement
- agreement_generated
- agreement_sent
- agreement_signed
- payment_or_cap_confirmed
- scheduling_released
- request_converted_to_project
- request_declined
- request_cancelled
- request_expired

---

# Required Request Controls

Before scheduling release, the request must have:

- Approved scope or emergency exception
- Required signer/authorization
- Payer/payment/cap path
- Site access information
- Minimum safety information
- Deliverable expectations
- Sampling authorization status
- Any required limitations

---

# Open Decisions

The following require founder/legal/security/operations review:

- Which request types can bypass technical review.
- Who can approve scheduling release.
- Who can approve emergency exception.
- Which clients can submit rush requests.
- Whether some MSA requests can auto-enter triage.
- How long ROMs remain valid before expiring.
- Which client roles can accept revised scope.
- Which client roles can decline recommended sampling.
- Whether admin can request missing information without PM review.

---

# Implementation Notes for Later

- Request state transitions should be controlled.
- State changes should create audit events.
- Client UI should show simple statuses, not every internal state.
- Admin UI should show detailed states.
- Emergency exception workflow must be separate and controlled.
- Request conversion to project must preserve original request language.