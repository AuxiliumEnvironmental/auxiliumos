# Deployment Runbook

Status: Proposed operating design under the 2026-10-08 development mandate. No deployment, cloud connection or final policy approval is claimed. [OWNER_DECISIONS.json](../../OWNER_DECISIONS.json), OD-015 and OD-017, governs live activation. [REQUIREMENTS.json](../../REQUIREMENTS.json) supplies scope/evidence.

## Prepare a concrete candidate

1. Identify repository, branch, exact commit, build artifact, target environment and active deployment owner. Verify current remote state and preserve other writers' work.
2. Reconcile migrations and environment configuration. Never infer a cloud schema from the existence of a SQL file. Use secret-manager references; no credentials in source, logs or prompts.
3. Build from committed dependency locks. Record targeted tests for changes and shared invariants; retain evidence with its commit/config. Source-text checks do not prove running database security.
4. Describe schema compatibility, backup/restore evidence, rollback/forward-fix path and affected owner-policy gates. Produce the reviewable candidate before requesting any necessary live approval.

## Promote safely

Use separate development, staging and production environments. Apply reviewed migrations through the recorded migration process; compare actual history and stop only the affected deployment if drift is unexplained. Prefer backward-compatible expansion before removing old fields.

Keep unapproved binding functions and outbound integrations disabled in production configuration; continue their development with synthetic data. Do not expose unfinished actions as working. Verify artifact/config identity after deployment, then exercise representative permitted and denied workflows using the approved test method. Avoid synthetic destructive actions in real client records.

## Release contract

A release record includes commit/artifact, environment, migration level, policy versions, approvals, tests, deployment result and recovery instructions. Production activation requires OD-015 evidence and recorded authorization. Notification/signature/payment jobs require OD-017 settings; no test deployment sends to real recipients by accident.

Full AuxiliumOS completion is assessed against the full requirements register. Delivering a foundation increment never closes the final-system scope. Moldo retains independent deployment/data ownership; OS deployment cannot implicitly deploy or migrate Moldo. Companion work stays deferred.

## Failure handling

On migration or health failure, halt promotion, preserve diagnostic evidence and use `ROLLBACK_PLAN.md`. Reconcile partially completed jobs before retrying; never run destructive reset commands against an uncertain target. Record actual success/failure and update the handoff. A local passing build is not evidence of a successful remote deployment.
