# Backup and Recovery Plan

Status: Proposed operating design under the 2026-10-08 development mandate. No backup destination, schedule, restoration or production approval is claimed. Authority: [OWNER_DECISIONS.json](../../OWNER_DECISIONS.json), OD-011 and OD-015; evidence: [REQUIREMENTS.json](../../REQUIREMENTS.json).

## Recovery inventory

| Asset | Required durable record |
|---|---|
| Source/configuration | Git commits, migrations, lockfiles, build/deployment instructions and redacted config inventory |
| Work history | Issues/task records, decisions, requirements, test evidence references and current handoff |
| Database | Consistent backup, migration level, timestamp, integrity metadata and restoration procedure |
| Files | Private object versions, checksums and links to document/version records |
| Identity/integrations | Provider configuration/recovery ownership and credential-vault references, never secrets in Git |

Git is not an operational database/file backup. Cursor is a checkout of source, not an independent source of truth. Chat artifacts are recoverable context; they do not prove a GitHub push succeeded. Record remote commit verification separately from local commit creation.

## Implementation contract

Use owner-controlled access and a separately protected recovery destination. Encrypt sensitive backups and restrict restore/download actions. Define frequency, retention, recovery-point and recovery-time objectives under OD-015; do not invent approved numbers. Monitor backup success, completeness, age and failed jobs. No PHI is permitted in this OS; do not send restored client content to development agents.

## Restore procedure

1. Identify incident scope and chosen consistent database/file recovery point. Preserve current evidence before replacement.
2. Restore into an isolated environment with outbound notifications, signing, payments and integrations disabled.
3. Match application/migration/config versions; verify counts, references and representative file checksums.
4. Reapply current revocations, restrictions and membership state from independently retained security evidence. An old backup must not restore access for removed users.
5. Reconcile signed authorizations, released document versions, integration offsets and queued jobs. Do not replay external effects blindly.
6. Run focused permission, document access, workflow and integrity checks. Record measured recovery results and unresolved gaps before authorized cutover.

## Acceptance and recovery evidence

Demonstrate restoration using synthetic fixtures, including missing objects, corrupted backup rejection and revoked-user denial after restore. Keep a drill record with commit/config, timestamps, backup IDs, verified scope and outcome. Retention hold prevents destruction; it is separate from visibility restriction. Never call a backup recoverable solely because an upload job succeeded.
