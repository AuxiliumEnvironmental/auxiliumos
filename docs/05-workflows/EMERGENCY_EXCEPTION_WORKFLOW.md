# Emergency Exception Workflow

## Purpose

This file defines the emergency exception workflow for AuxiliumOS.

The emergency workflow exists because some incidents require fast action, but fast action must not destroy scope control, authorization control, safety review, document control, or billing authority.

This workflow is a planning document for future request intake, incident command, authorization, scheduling, and audit behavior.

## Decision Status

Status:
Draft / Founder review required / Not implementation-approved

This file does not implement emergency workflow behavior. It defines the workflow that future implementation must follow.

---

# Permanent Rules

- Emergency does not mean unlimited scope.
- Emergency does not mean undocumented work.
- Emergency does not bypass safety review.
- Emergency does not automatically authorize sampling, reports, protocols, or post-work verification.
- Emergency does not bypass payer/signer/cap logic unless an approved emergency authorization rule exists.
- Emergency work must still create audit events.
- Emergency work must still be converted into formal project/scope/authorization records as soon as practical.
- If safety conditions are unclear, Auxilium may stop or limit work.

---

# Emergency Priority Levels

## P0 — Life safety / external emergency response first

Meaning:
A situation may require emergency services, 911, fire department, EMS, utility shutoff, police, hazmat response, or facility emergency protocols before Auxilium work.

Examples:
- Active fire
- Active life safety threat
- Structural collapse concern
- Active major chemical release
- Immediate electrical/gas hazard
- Unsafe building entry

AuxiliumOS behavior:
- Display warning that emergency responders or facility emergency protocols may be required.
- Allow incident recording.
- Do not imply Auxilium is the first responder for life-safety emergencies.
- Require human review before Auxilium mobilization.

---

## P1 — Immediate Auxilium triage

Meaning:
Urgent incident requiring immediate Auxilium review and possible rapid response.

Examples:
- Active water intrusion in critical area
- Fire/smoke/odor event affecting operations
- Sewage/contaminated water concern
- Healthcare-sensitive occupied area affected
- Suspected contamination or unknown residue
- Imminent demolition/material disturbance with environmental concern

AuxiliumOS behavior:
- Route to urgent queue.
- Notify assigned internal emergency reviewers.
- Require minimum emergency information.
- Determine whether emergency authorization is available or required.

---

## P2 — Environmental/compliance concern

Meaning:
Important issue requiring prompt review, but not necessarily immediate emergency mobilization.

Examples:
- Mold/IAQ complaint
- Odor complaint
- Regulated-material concern before repair
- Contractor containment concern
- Worker exposure concern
- Delayed water/storm issue

AuxiliumOS behavior:
- Route to review queue.
- Require issue/intent/facility/affected-area information.
- Allow Auxilium to reclassify or request more information.

---

## P3 — Scheduled readiness/compliance-support work

Meaning:
Non-emergency scheduled support.

Examples:
- Site readiness review
- Site passport update
- Vendor documentation review
- Planned training/tabletop
- Planned inspection/assessment

AuxiliumOS behavior:
- Route to normal scheduling workflow.

---

## P4 — Admin/documentation/vendor support

Meaning:
Administrative support, document request, vendor issue, billing support, or general account question.

Examples:
- Upload vendor document
- Ask for report copy
- Update contact
- Ask billing question
- Request QBR document

AuxiliumOS behavior:
- Route to administrative queue.

---

# Minimum Emergency Intake Fields

Before emergency review, collect:

- Account
- Facility/asset
- Requester
- Requester contact
- Site contact
- Emergency contact
- Incident type
- Date/time discovered
- Active condition yes/no/unknown
- Affected area
- Occupancy status
- Sensitive area yes/no/unknown
- Safety hazards yes/no/unknown
- Photos/documents if available
- Payer/authorization path
- Existing MSA/emergency clause if applicable
- Requested response timing
- No-PHI warning for healthcare/facility uploads

---

# Emergency Review Gate

Human review is required before emergency mobilization when any of these apply:

- P0 or P1 priority
- Healthcare/sensitive occupancy
- Suspected chemical/drug contamination
- Sewage/contaminated water
- Fire/smoke/unknown residue
- Worker exposure/IH concern
- Asbestos/lead/material disturbance
- Structural/electrical/gas hazard
- Out-of-state mobilization
- After-hours/weekend/holiday response
- Unclear payer/signer
- Unclear site access
- Missing safety information

---

# Emergency Authorization Requirements

Before emergency field work, one of the following must exist:

1. Active MSA emergency clause that clearly authorizes the work.
2. Signed emergency authorization.
3. Written emergency conditional authorization approved by authorized client role and Auxilium approver.
4. Internal senior approval for limited emergency triage where allowed by policy.

The authorization must record:

- Authorized requester
- Payer or billing path
- Authorization cap or emergency cap rule
- Limited emergency purpose
- Scope limitations
- Safety/access conditions
- Sampling status
- Deliverables included or excluded
- Follow-up formal authorization requirement

---

# Emergency Scope Limits

Emergency authorization may include:

- Initial triage
- Site communication
- Immediate assessment
- Limited documentation
- Initial safety/access review
- Emergency recommendations
- Vendor coordination where authorized

Emergency authorization does not automatically include:

- Full assessment report
- Sampling/testing
- Lab fees
- Protocol development
- Post-work verification
- Clearance-type assessment
- Expert/dispute report
- Asbestos/lead testing
- Engineering
- Remediation contracting
- Legal/coverage opinions
- Additional site visits
- Long-term project management

Those require separate scope/authorization unless explicitly included.

---

# Emergency Workflow States

## emergency_reported

Incident/request has been submitted as urgent or emergency.

## emergency_triage_pending

Auxilium has not yet completed triage.

## emergency_triage_active

Auxilium is reviewing incident facts, safety, access, payer, and authorization.

## emergency_information_needed

Minimum emergency information is missing.

## emergency_authorization_pending

Emergency authorization, cap, MSA clause, or payer approval is missing.

## emergency_authorized_limited

Limited emergency work is authorized.

## emergency_mobilization_released

Emergency scheduling/mobilization may proceed.

## emergency_response_active

Emergency work is active.

## emergency_follow_up_required

Emergency work occurred and formal follow-up scope/authorization is needed.

## emergency_converted_to_project

Emergency incident became a formal project.

## emergency_closed

Emergency workflow closed.

## emergency_declined

Auxilium declined emergency work or referred elsewhere.

---

# Emergency Workflow Steps

1. Client/site user submits emergency incident.
2. System records incident and priority.
3. System checks required emergency fields.
4. System triggers urgent internal notification.
5. Auxilium performs emergency triage.
6. Auxilium determines whether P0 external response is needed.
7. Auxilium reviews safety/access/payer/signer/cap.
8. Auxilium confirms emergency authorization path.
9. Auxilium approves limited emergency scope or requests missing information.
10. Emergency mobilization is released only if minimum gates are satisfied.
11. Work is performed within limited emergency scope.
12. Follow-up scope is created if additional work is needed.
13. Emergency incident is converted to project or closed.
14. Audit events are recorded.

---

# Emergency Audit Events

- emergency_incident_submitted
- emergency_priority_assigned
- emergency_triage_started
- emergency_information_requested
- emergency_safety_flag_added
- emergency_authorization_requested
- emergency_authorization_approved
- emergency_authorization_declined
- emergency_mobilization_released
- emergency_response_started
- emergency_response_completed
- emergency_follow_up_required
- emergency_converted_to_project
- emergency_closed
- emergency_declined

---

# Open Decisions

The following require founder/legal/security/operations review:

- Who can approve emergency conditional authorization internally.
- Which client roles can approve emergency authorization.
- Whether specific MSAs allow automatic emergency triage.
- Default emergency cap amounts by client/account type.
- Whether after-hours/weekend rates require separate acceptance.
- Whether site champions can trigger P1 alerts directly.
- Whether emergency work can begin before signed authorization under any circumstance.
- Which emergency situations require senior management approval.
- Which emergency categories require specialist referral rather than Auxilium response.

---

# Implementation Notes for Later

- Emergency workflow must integrate with project request state machine.
- Emergency workflow must preserve scope limits.
- Emergency workflow must create audit events.
- Emergency workflow must not imply Auxilium is a life-safety first responder.
- Emergency workflow must not bypass document release or reporting rules.
- Emergency follow-up work must use normal scope/authorization process.
- Emergency UI should be simple but must collect minimum required fields.
- Emergency work must remain facility/project/account-linked.