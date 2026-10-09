# Rollback Plan

Status: Proposed recovery design under the 2026-10-08 development mandate. No rollback capability or recovery drill has been proven by this file. Authority: [OWNER_DECISIONS.json](../../OWNER_DECISIONS.json), OD-011, OD-015 and OD-017; evidence: [REQUIREMENTS.json](../../REQUIREMENTS.json).

## Select the recovery path

Use the last known compatible application artifact when the prior version can read the current schema and records safely. Use a forward correction when reverting would corrupt current writes, authorizations or document history. A database restore is a separate reviewed recovery operation, not the default response to a UI defect.

| Failure | Initial containment |
|---|---|
| UI or app regression | Disable affected feature or return to compatible artifact |
| Data-access exposure | Restrict affected access immediately, revoke compromised credentials/sessions as applicable, preserve evidence |
| Migration failure | Halt promotion; inspect transaction/history and partial effects before retry |
| Data corruption | Stop affected writes; preserve current snapshot; restore/reconcile in isolation |
| Duplicate external effects | Pause queue/connector; reconcile provider transaction IDs before resumption |

## Controlled procedure

1. Record incident, target environment, affected commit/config and recovery owner. Prevent overlapping deploys or competing recovery writers.
2. Preserve logs, current data and security events without leaking secrets/client contents into prompts.
3. Identify the exact compatible artifact and migration history. Do not blindly reverse migrations or reset an uncertain database.
4. Pause affected outbound jobs; deploy recovery artifact or reviewed forward correction.
5. Verify permissions, current membership revocations, document access and integrity of affected records before reopening the feature.
6. Reconcile queues/integration offsets, then resume approved effects with duplicate protection. Record result and remaining work in the handoff.

Signed agreements and previously released documents remain immutable historical evidence. Correct them through appropriate supersession/withdrawal workflows; code rollback does not undo a signature or retract a downloaded report. Retention holds preserve records separately from access restrictions.

## Acceptance and boundaries

Rehearse app rollback against a compatible migrated schema with synthetic data. Include queued retries, suspended membership and a current released report with a pending replacement. A restored old policy cannot regrant revoked access. No PHI fixtures. Recover OS without altering Moldo's independent database; pause its connector if consistency is uncertain. Companion is deferred. If compatibility is not proven, keep only the affected live path contained while preparing the safe fix.
