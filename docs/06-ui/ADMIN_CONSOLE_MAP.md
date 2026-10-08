# Admin Console Map

Status: Proposed final-system design under the 2026-10-08 development mandate; not implemented or finally policy-approved. [OWNER_DECISIONS.json](../../OWNER_DECISIONS.json) governs authority. [REQUIREMENTS.json](../../REQUIREMENTS.json) tracks coverage and evidence.

## Primary surfaces

| Surface | Primary job and record |
|---|---|
| Today / My Work | Assigned actions, overdue items, blocked work, next responsible person |
| Intake | Original Requests, linked Incidents, missing information, urgency and review routing |
| Projects | Authorized scope, visits/tasks, working/waiting time, deliverables and changes |
| Accounts / Facilities | Contacts, Programs/MSAs, Portfolios, site history, readiness and open actions |
| Review / Release | Technical review, exact-version approvals, audience preview and release queue |
| Authorization / Finance | Signer/payer/cap exceptions, ROM, costs, invoices and exports within permission |
| Vendors | Assigned work, credentials, closeout and review status |
| Reports / QBR | Source-linked performance and executive action preparation |
| Administration | Scoped memberships, policy configuration, integration health and audit |

Queues are projections of canonical records, not competing data stores. Distinguish Incident from Request and connect all requests arising from one incident. Every attention item links directly to the relevant record/action with filters preserved.

## Interaction and controls

Show the user's next action and the blocking reason before secondary metadata. Restrict bulk actions to operations with item-by-item authorization and partial-failure reporting. Approval screens show exact revision, material changes and intended audience. Keep the current released document while a replacement draft is prepared. Retention hold and visibility restriction have separate controls.

Permission checks use independent active membership/status and action/scope grants; System Admin is not automatic technical approval. Restrict finance separately. No PHI; messages create follow-up work rather than approved scope changes. Owner decisions OD-001 through OD-011 gate corresponding live actions only.

Moldo oversight is visible only to authorized Auxilium management under OD-016. Show source system and synchronization time; Moldo-only users gain no OS membership. Companion work is deferred.

## Acceptance and recovery

Test direct links, empty queues, pagination, denied actions, revoked membership, concurrent edits and bulk partial failures. A failed action retains input and shows retry/reconciliation state. Phone layouts must support the primary task without clipped controls or horizontal page scrolling. No dashboard badge may claim successful work before the source record confirms it.
