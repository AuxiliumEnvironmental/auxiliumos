# Project State Machine

Status: Proposed implementation design under the 2026-10-08 development mandate. No runtime behavior or final business-policy approval is claimed.

Authority: [OWNER_DECISIONS.json](../../OWNER_DECISIONS.json), OD-001, OD-005 through OD-010 and OD-016. Track implementation/evidence in [REQUIREMENTS.json](../../REQUIREMENTS.json). Unconfirmed live authority blocks that action, not unrelated development.

## Project contract

A Project is accepted work linked to its account, source Request, applicable Incident/facility, exact authorized scope, authorization, responsible PM, qualified reviewer, staff, tasks, visits, deliverables and financial records. Incident and Request remain distinct: one incident may generate several requests and engagements. An MSA is not unlimited work authorization.

Create a project only through accepted-request conversion or a recorded approved internal/emergency path. Retries must return the same project rather than duplicate it. Use the same workflow engine for simple and enterprise clients; portfolios and MSAs are optional context for simple jobs.

## Operational stages

| Stage | Entry condition | Next normal stage |
|---|---|---|
| ready_for_schedule | Required scope, authorization, payer, access and safety checks passed | scheduled |
| scheduled | Assigned eligible staff and recorded visit/task schedule | active |
| active | Authorized work started | technical_review |
| technical_review | Required field/lab inputs available or documented limitations accepted for review | deliverables_ready |
| deliverables_ready | Required exact-version review complete | delivered |
| delivered | Required deliverables released to correct audiences or recorded disposition | closed |
| closed | Tasks, unresolved recommendations and closeout dispositions reconciled | Reopen by authorized action with reason |

Record holds, waiting reason, responsible person and next action independently from stage. Distinguish waiting for access, lab, client, authorization or internal review from active work. On hold, block only affected work; resume after its recorded condition resolves. Cancellation retains performed work, costs, authorization and document history. Closeout does not erase unresolved facility recommendations or assert payment/compliance.

## Controls and acceptance

Backend checks enforce active identity/membership, scope assignment and action permission at every mutation. A role label does not override suspension or technical qualifications. Cap/scope/sampling changes use the change workflow; emergency scope remains limited. No PHI or chat-driven scope changes.

Verify request conversion is idempotent, out-of-scope work is blocked, hold/resume retains stage, missing lab inputs cannot masquerade as results, and release cannot skip exact-revision approval. Create a replacement draft without withdrawing the current released report. Reopening a project must not unlock released files.

Moldo-operated projects use explicit external IDs and ownership under OD-016. Moldo-only staff receive no OS access; stale integration data is labeled. Companion functionality is deferred. Failed integration or document jobs retain a retryable queue entry and truthful status, not a fabricated completion.
