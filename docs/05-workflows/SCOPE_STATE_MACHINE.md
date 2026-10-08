# Scope State Machine

Status: Proposed implementation design under the 2026-10-08 development mandate. This specification does not claim runtime implementation or final business-policy approval.

Authority: [OWNER_DECISIONS.json](../../OWNER_DECISIONS.json), OD-005, OD-006 and OD-009. Trace delivery and evidence in [REQUIREMENTS.json](../../REQUIREMENTS.json). Pending decisions gate the affected live approval, not reversible development of the workflow.

## Record contract

A scope revision links its account, request, applicable incident/facility/areas, services, exclusions, deliverables, sampling decision, accepted/declined recommendations, assumptions, limitations, ROM revision and reviewers. Preserve original request wording. An Incident can generate multiple Requests; scope belongs to the specific engagement, not every request from the incident.

Every revision has a stable ID, parent revision, content fingerprint, status and actor/time evidence. Approved or accepted revisions are immutable. Changes create a proposed revision through `CHANGE_AUTHORIZATION_WORKFLOW.md`; chat, uploads and AI may draft a proposal but never alter approved scope.

## Allowed transitions

| From | Action and destination | Required evidence |
|---|---|---|
| draft | Submit to review_pending | Complete inclusion, exclusion, sampling and deliverable fields |
| review_pending | Return to revision_required | Reviewer comments; no client acceptance implied |
| revision_required | Resubmit to review_pending | New candidate revision and resolved comments |
| review_pending | Approve to approved_internal | Qualified assigned reviewer approves exact revision |
| approved_internal | Present as client_decision_pending | Authorized audience; commercial impacts disclosed |
| client_decision_pending | Record accepted or declined | Identified authorized decision maker, exact revision and decision |
| accepted | Mark active_authorized | Effective authorization references this revision and required gates pass |
| active_authorized | Mark superseded | Replacement revision has completed its required approval/authorization |
| Unactivated revision | Cancel | Authorized actor and reason; retain record |

New candidate edits invalidate approvals of that candidate. They do not replace or unlock the currently authorized revision. An acceptance alone is not permission to mobilize. A declined recommendation requires a recorded limitation and human determination whether limited work can continue; no automated scientific conclusion.

## Acceptance and recovery

Test authorized transitions and reject skipped review, stale approval, changed content, wrong account, inactive membership despite another role, and chat-triggered mutation. Concurrent/retried approvals must create one decision with audit evidence. An interrupted save leaves the existing authorized revision intact and offers safe retry; never report success before persistence. No PHI or live binding decisions in fixtures.
