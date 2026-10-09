# Support Runbook

Status: Proposed operating design under the 2026-10-08 development mandate. No staffed response commitment or production readiness is claimed. Authority: [OWNER_DECISIONS.json](../../OWNER_DECISIONS.json), OD-001, OD-011 through OD-015 and OD-017. Evidence and unresolved coverage: [REQUIREMENTS.json](../../REQUIREMENTS.json).

## Intake and ownership

Every support incident has an ID, affected environment/commit, account/object references, severity, owner, impact, next action and timestamps. Capture reproducible steps and redacted diagnostics, not passwords, tokens, real sensitive documents or PHI in issue/chat content. System incidents remain distinct from client environmental Incidents and Project Requests.

| Severity | Typical trigger | Proposed response |
|---|---|---|
| Critical | Unauthorized disclosure, lost authorization integrity, destructive data failure | Contain affected access/writes and notify designated incident authority |
| High | Core operational workflow unavailable or records not saving | Assign owner, identify safe workaround, prioritize recovery |
| Normal | Limited functional defect or confusing interface | Reproduce and link to a bounded fix with acceptance criteria |
| Request | Product improvement or policy question | Record requirement/owner decision without treating it as approved behavior |

Response-time commitments and actual on-call contacts require owner confirmation; do not invent service guarantees.

## Diagnose, recover, communicate

Check actual source records, authorization decisions and queue/provider state before repeating an action. After repeated failure without new evidence, change the diagnostic approach and record the block. Do not grant broad permissions, disable RLS, impersonate a client silently or bypass document/scientific review to make a ticket disappear.

For suspected PHI: stop processing, exclude AI access, restrict/quarantine and route to designated security authority under OD-013. Preservation and deletion decisions remain explicit. For withdrawn reports or authorization errors, preserve exact versions and audit history; retention hold is separate from audience restriction.

Use `ROLLBACK_PLAN.md` and `BACKUP_RECOVERY_PLAN.md` when appropriate. Outbound incident messages require approved channels/recipients under OD-017; record what was sent and actual delivery state. A notification alone does not transfer ownership of an unresolved issue.

## Closeout and acceptance

Close only with a recorded fix/workaround, affected-version verification, relevant regression check and residual risk. Update the handoff and requirement/task evidence so the next chat does not repeat diagnosis. Verify suspension denial independently from roles. Moldo integration incidents must identify which system owns the record; OS support does not grant Moldo-only staff OS access. Companion work remains deferred.
