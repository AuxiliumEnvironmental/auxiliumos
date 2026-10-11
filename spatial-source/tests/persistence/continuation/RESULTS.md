# Continuation persistence verification

Latest input-stable accepted run: `run-20261009T073840100850Z/verification.json`.
The recorded source snapshot passed 59 XCTest cases and 20 real-process exit/reopen
scenarios: 8 original draft/raw checks, 4 outbox checks, 4 explicit orphan-copy
recovery checks and 4 confirmed-history-cleanup checks. All build/test/process
commands exited successfully; source hashes were unchanged during that run.

Earlier accepted run: `run-20261009T072306954290Z/verification.json`.
That distinct source snapshot passed 50 XCTest cases and 16 real-process exit/reopen
scenarios: 8 original draft/raw checks, 4 outbox checks, and 4 explicit orphan-copy
recovery checks. Exact commands, input hashes, executable hashes, runtime environment,
and per-process start/exit traces are retained beside each report. Intermediate
58-test and 4-history-process successes are also retained, not overwritten. Later
shared-core changes require consumer verification; evidence must not be reused when its
relevant source/dependency hashes no longer match.

This is Linux Swift 6.2.1 synthetic portable evidence. There was no Apple SDK build,
simulator interaction, physical capture, iOS file-protection/lock acceptance, live
account authorization, network publication, app distribution, or release.

## Behaviors exercised

- Exact saved-revision outbox bytes survive edits, restarts and retry; reused IDs
  cannot change source, destination, expected destination revision, or content.
- Default publisher remains disconnected; no upload means no receiver confirmation.
- Receiver reconciliation precedes uncertain retry; exact accepted retry does not
  duplicate a document or upload. Pending is not accepted; internal draft is not released.
- Authentication expiry, cross-business/project/source denial, revocation during
  upload, stale expected revisions, out-of-order source edits and forged receipt proof
  remain blocked without destroying local work.
- Two coordinators share one durable attempt lease. Expired leases are reclaimable;
  a stale worker cannot acknowledge a later attempt.
- Managed root identity is persisted and cannot be reopened under local defaults.
  Absent issuer, wrong account/tenant/scope, expired/future/overlong leases, missing
  operation permission, sign-out and clock rollback deny access. Unsynced bytes remain.
- A deterministic two-store blocked-authority test proves admission bookkeeping cannot
  overwrite concurrent durable suspension after the SQLite transaction fix.
- Strictly readable orphaned edits recover only into an explicit new needs-review
  document. Original bytes, identity and latest acknowledged draft are retained.
  Raw capture intents, corrupt candidates and FIFO entries are not admitted as drafts.
- Semantic-area source mappings persist through actual create/update/elevation/delete,
  save/reopen/undo/redo. New objects do not invent predecessor lineage.
- Explicit preview/confirmation removes only eligible old geometry snapshots, keeping
  the current and original draft, undo/redo, frozen/outbox sources, raw/recovery content,
  all lineage receipts and at least 100 further unpinned versions.
  A freeze or correction invalidates an old preview. A committed retirement blocks
  a later freeze even before unlink; repeat/resume does not widen the confirmed scope.
- All four cleanup boundaries survive deterministic process termination and reopen:
  before intent commit, after intent commit, after unlink, and after acknowledgement.
  Current draft, raw bytes, exact frozen/outbox bytes and lineage remain intact.
- Cleanup rejects corrupt bytes, symlinks, FIFO targets, wrong-store previews, device
  lock and corrupt SQLite counts. Batches cannot exceed 100 snapshots or 256 MiB.

## Independent review corrections

QA independently reviewed the publication boundary, local gate and recovery copy.
The local gate's initial nontransactional last-observed-time write could overwrite
a concurrent suspension. It is now serialized with suspension in BEGIN IMMEDIATE;
the deterministic race test passes. QA also found the receipt object-kind allowlist
omitted the new `area` kind, blocking actual area edits. The allowlist and integrated
save lifecycle regression were corrected. Receiver byte identity was clarified by
renaming the client-local frozen-file audit digest to `localSnapshotSHA256`; it is
not a receiver byte attestation or proposed wire-contract field.

QA also reviewed the history journal, protection recomputation, freeze/write-lock race,
exact-byte unlink and orphan exclusion. The review found unvalidated SQLite counts
could overflow cleanup preview/result arithmetic. Counts now validate before bounded
arithmetic; a regression corrupts artifact and journal counts to `Int.max`, asserts
failure and verifies retained files. This is corruption handling, not a claim of
protection against an attacker controlling the application's database and filesystem.

## Earlier failures and environment alternative

Earlier timestamped runs retain compiler/test failures and intermittent SIGILL exits
from the original Linux process helper. Those failures were not erased or counted
as successful fault-injection exits. Current crash stack reproduction was not obtained:
12 isolated seed diagnostics with Swift backtracing enabled completed, while syscall
tracing was denied by PTRACE_TRACEME permissions and was stopped without a workaround.
The older handoff describes a libdispatch `/proc` failure; that history is distinct
from the fresh signal-only observations.

One scoped alternative was implemented only in the Linux Swift-6 test executable:
Swift's public TaskExecutor preference runs the serial process-death probe on one
dedicated Foundation thread. Production SpatialStore code, actor isolation, the
SQLite/file protocol, fault boundaries and normal-executor concurrency XCTest tests
were unchanged by this scheduling adaptation. The subsequent complete process batch
passed. It does not prove that the container runtime is repaired or waive device tests.

## Remaining deployment and retention limits

No company issuer or server adapter exists or is enabled. Company-managed deployment
needs an authorized identity integration and verified device lifecycle. Offline leases
rely on OS clock/sandbox integrity across reboot and cannot provide immediate remote
revocation or offline remote wipe. Physical lock, low-disk, background, force-kill,
and user interaction remain device gates.

Undo/redo metadata is bounded, no persistent derivative cache is created, and storage
inventory is non-destructive. Raw captures, publication artifacts, frozen source and
unacknowledged work are never automatically evicted. Explicit, irreversible history
cleanup now has a durable preview/confirmation/resume workflow; native interaction
and filesystem protection still require Apple/device verification. Each confirmed
batch retains the latest 100 additional unpinned snapshots per document, and all
issued/frozen/source material remains protected. The small revision/lineage ledger
and protected artifacts can grow. No total-store quota, automatic garbage collection,
or permission to delete protected work is claimed. Only temporary synthetic fixtures
were removed in verification; original source and user material were not cleaned.
