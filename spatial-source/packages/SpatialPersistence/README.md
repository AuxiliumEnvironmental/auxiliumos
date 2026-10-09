# SpatialPersistence

Local Swift actor repository for SpatialCore. SQLite is a platform library, not a
new backend. The package contains no network, credential, company-membership, or
business-release operation. This implements part of SP-04, not complete product
or physical-device acceptance.

## App integration

Construct one `SpatialStore(root:protectedDataAvailable:)` for the app's private
Application Support directory. The root is trusted application configuration;
it is not taken from imported files, labels, document IDs, or launch links.
The iOS shell must supply the actual initial protected-data state and call
`setProtectedDataAvailable` when it changes. Hide sensitive UI and discard or
seal in-memory views on lock separately. A Boolean gate is not encryption.

`create`, `save`, `undo`, and `redo` return only after their local file/DB commit.
Pass `EditorSession.lastReceipt` to `save(_:expectedRevision:command:receipt:)`
for explicit split/join lineage. Omitted receipts get conservative restoration
mappings, which require overlay review. Receipt, immutable revision reference,
current draft, and bounded undo/redo metadata commit in one SQLite transaction.
The revision must advance exactly by one with the actual saved parent. Opening
a second store cannot bypass the expected-revision check inside the transaction.

Use `listDrafts`, `open(documentID:)`, and `editReceipt(documentID:revision:)`
after reopen. Undo/redo history retains up to 100 revision references and
survives process restart. Raw files, frozen versions, recovery sources and
publication bytes are retained. Old unpinned geometry snapshots can be removed
only through the explicit preview/confirmation workflow described below.

`archiveCapture(_:sourceID:kind:)` accepts original raw, processed, world-map,
normalization-report, and native-capture-metadata bytes before a draft exists.
Capture metadata records frame/generation and original SDK context before raw
capture; missing metadata must remain explicitly unknown in recovery.
A source/kind pair is
immutable. An exact repeat is idempotent; different bytes fail explicitly.
Use `listCaptureArtifacts` and `readCapture` for normal reprocessing.

`recoverableCaptures` lists verified uncommitted capture candidates, including
source identity, kind, length, and digest from a protected intent written before
the payload. An explicit `recoverCapture(artifactID:)` registers those exact
bytes. It does not invent alignment, normalize capture, or create a saved draft.
The UI can then invoke the real capture processor separately. Hash/length,
generated filename, version, source ID, and duplicate JSON keys are checked.
Conflicting identities fail without deleting retained data. Matching redundant
captures reconcile without continuing to offer the same recovery action.

`recoveryArtifacts` reports staged/unreferenced files and unknown, unsafe,
partial, or corrupt recovery intents. These files are retained for managed
recovery. An intent without complete payload is not recoverable content.
Automatic recovery of an uncommitted geometry edit is not implemented; the
last committed draft remains authoritative and its partial candidate is retained.

`freeze(documentID:revision:)` pins an exact, already-saved local revision.
`readFrozen(snapshotID:)` verifies bytes and document/revision identity. Neither
method sends data, grants export permission, authenticates a receiver, queues
delivery, marks content synced, or releases a client report. Do not label it
"Published" or "Synced" in UI. A hash proves byte identity, not authority.

## Commit and recovery protocol

1. Validate/bound the candidate and its receipt. Capture operations first write
   and synchronize a protected, bounded `.intent` with source/kind/digest/size.
2. Exclusively create a protected `.stage` file using generated UUID names;
   synchronize file and staging directory.
3. Promote without replacement via a same-volume hard link, synchronize the
   immutable directory, unlink the stage, and synchronize staging again.
4. SQLite `BEGIN IMMEDIATE` rechecks expected revision/source identity; metadata,
   current draft, history, and edit receipt commit under WAL / `synchronous=FULL`.
5. Only then acknowledge local save. Registered capture intents are removed;
   an interrupted cleanup is safe and idempotent. Duplicate bytes remain retained.

An interruption before step 4 leaves no DB pointer to an absent final artifact.
An interruption after COMMIT but before acknowledgement may have saved the new
revision. The caller must reopen/reconcile instead of assuming a thrown error
means nothing committed. Recovery never silently replaces a newer draft.
The tests do not claim survival of every storage-controller or hardware failure.

## Validation and protection

Immutable files are opened without following symlinks, must be regular files,
and must match their stored exact length and SHA-256. Names are generated UUIDs;
untrusted source/document IDs are bounded ASCII and never used as paths. Root,
subdirectories, DB/WAL/SHM and files receive private POSIX permissions. iOS files
and directories request `NSFileProtectionComplete`. The local archive is excluded
from system backup. Actual iOS lock/protection behavior remains a device gate.

`SpatialDocumentReader` checks byte size, nesting, per-array/global value counts,
escaped duplicate keys, bounded strings/numbers, finite numeric tokens, unknown
properties, schema version, graph references and geometry semantics. It is a
geometry JSON reader. ZIP/SVG exchange validation lives in SpatialInterop.
It does not render arbitrary imported SVG or load external resources.

## Verification and remaining gates

Run `swift test --package-path packages/SpatialPersistence --jobs 1`, then
`python3 tests/persistence/process_death.py packages/SpatialPersistence/.build/debug/spatialstorecheck`.
The process-death helper calls `_exit(86)` so destructors/rollback cleanup cannot
hide interruptions. It covers draft file/transaction boundaries, retained raw
source identity, explicit raw registration and a separate synthetic reprocessing
step. Its payload is generated SpatialCore data, not Apple RoomPlan output.

The supplied Linux environment uses Swift 6.2.1 with `SWIFT_USE_OLD_DRIVER=1`.
Historical logs record container-specific driver/helper SIGILL failures. The
Linux Swift-6 CLI test helper now uses a public TaskExecutor preference and one
dedicated Foundation thread; production store scheduling is unchanged. Failed
attempts and later successful runs remain separate evidence. These are portable
implementation tests, not Xcode, LiDAR, iOS file-protection or device acceptance.

Still required: device lock/relaunch and real raw reprocessing; genuine low-disk
and interrupted-write system errors; storage-cleanup interaction on a device;
further importer fuzzing; an authorized managed identity issuer and receiver adapter.
No live deployment, remote resource, or real-data upload was performed.

## Continued publication and local-access implementation

The store now has additive SQLite v3 through v6 migrations. It preserves existing drafts,
capture artifacts, edit receipts, and frozen revisions. Existing local stores
remain local; they are not silently converted into company-managed stores.

`enqueuePublication(snapshotID:destination:expectedPublishedRevision:clientRequestID:)`
is an explicit operation, not a side effect of viewing or freezing. It constructs
and strictly validates the existing four-file, single-floor exchange from the
chosen immutable saved snapshot. It atomically commits a durable outbox record
and a separately fsynced immutable ZIP. It never queues raw RoomPlan/world-map
captures. The independent multi-floor local-document profile is not automatically
admitted into the narrower publication contract.

`PublicationCoordinator` uses `DisabledPublicationTransport` unless a transport
is explicitly injected. The production package includes no network transport,
server endpoint, credential, membership grant, upload ticket, release action, or
background job. The synthetic receiver lives exclusively in the XCTest target.
A future authorized adapter must translate the request to the inspected current
server contract, authenticate replies and recheck current source and destination
rights. `localSnapshotSHA256` is client-local audit metadata for the stored
pretty-printed source file, not a proposed wire request field or receiver byte
attestation. The manifest and archive digests identify the actual transmitted
bytes. Neither type of digest grants authorization.

Each delivery attempt obtains a durable bounded lease and reconciles receiver
status before reserve/upload/finalize. Timeouts/restarts preserve the same request
ID and bytes. An authenticated receipt must bind the complete exact request and
`internal-draft` disposition; `202`/pending, upload completion, and an unsigned
matching hash never become receiver-confirmed. Expiry, revocation, forged receipt,
reused identity, and stale expected revision retain local work and expose a
blocked state. Conflict resolution creates a new explicit intent. Cancellation
stops local retries only and cannot recall an uncertain remote acceptance.

Standalone mode remains `StoreAccessConfiguration.localDeviceOnly`: OS device
authentication and protected-data availability gate the native app. Managed mode
requires an immutable authority/account/tenant/workspace binding persisted in
the store and a trusted injected `ManagedStoreAuthority`. It fails closed without
that authority. Every read, edit, export and delivery checks an operation-scoped
lease; viewing is not export permission. A caller cannot reopen managed data
with the local default or another account. `suspendManagedAccess()` persists a
sign-out/revocation lock without destroying unsynced work. Resume requires a new
verified lease issued after suspension. All admission bookkeeping and suspension
changes are serialized across store instances in SQLite transactions.

Managed lease duration must be explicitly configured, between 1 second and
24 hours. No deployment default, issuer integration, or company access approval
is supplied. Wall-clock rollback is denied; monotonic process time prevents
freezing a running process's expiry clock. Across reboot, OS clock integrity,
device protection, and sandbox integrity remain trust assumptions. An offline
device cannot learn immediate remote revocation or promise remote wipe. Actual
company authentication and iOS locked-device testing remain deployment gates.

`recoverableDrafts()` lists strictly readable unacknowledged geometry candidates,
excluding retained raw-capture intents. `recoverDraftCopy(artifactID:newDocumentID:)`
explicitly creates a new revision-1, review-required copy without overwriting the
last acknowledged draft. The original candidate bytes and identity are retained
in the same transaction as the recovered copy. A candidate hash identifies the
bytes present during recovery, not a previously acknowledged save or approval.
Interrupted recovery is safely retryable with the same artifact and destination
identity. `recoveredDraftSource(documentID:)` exposes its durable origin metadata.

`storageInventory()` is non-destructive. Undo/redo references remain bounded by
the configured maximum of 100 entries; no persistent derivative cache is created.
Raw captures, recovered source bytes, frozen versions, revision history and
unacknowledged publications are never automatically evicted. Inventory separates
retired historical snapshot counts from revision records and reports pending
cleanup bytes conservatively until each removal is acknowledged.
Low-disk native admission must stop new capture/save work and preserve recovery
state rather than silently erase source. Only generated test fixtures were
removed during implementation verification; existing user/source data was not cleaned.

## Explicit historical snapshot cleanup

`previewHistoryCleanup(documentID:)` is read-only. Display the exact candidate
count and bytes, explain that removal is irreversible, and call
`applyHistoryCleanup(_:)` only after the user confirms that same preview. A save,
freeze or other relevant source change rejects the stale preview. There is no
automatic cleanup on launch, save, capture or storage pressure.

The policy preserves revision 1, the current draft, undo/redo targets, every
frozen revision, every publication artifact, all raw capture material, recovered
originals, unknown/orphan files and reviewed local content. It retains at least
the latest 100 additional unpinned snapshots per document. Each confirmation is
bounded to 100 candidates and 256 MiB; additional eligible history requires a
new preview and confirmation. Revision identities and command receipts remain
for provenance even when their old geometry snapshot is retired. Consequently
the small lineage ledger, protected source and issued versions can still grow;
this is not a total-store quota or a permission to discard protected work.

SQLite v6 durably commits the exact retirement intent and revision tombstones
under the same write lock as the fresh protection check. Only then are the
verified, generated geometry files unlinked and the artifact directory synced.
Each removal acknowledgement is transactional. Frozen reads and later freeze
requests reject retired snapshots explicitly with `revisionRetired`; required
draft, undo and publication references are never redirected to absent content.
`pendingHistoryCleanups()` lists previously confirmed unfinished operations;
`resumeHistoryCleanup(operationID:)` only resumes their original candidate set.
Interruption between unlink and acknowledgement is idempotent on reopen. Missing
files before a durable retirement, mismatched bytes, symlinks, FIFOs and corrupt
metadata fail closed. No path supplied by the user becomes a deletion target.

Changed-source verification is in `tests/persistence/continuation/`. Timestamped
logs preserve failed runs separately. The runner records exact commands, runtime,
source hashes and compiled binary hashes. These Linux synthetic XCTest and real
process-exit checks are not Apple SDK compilation or physical-device acceptance.
