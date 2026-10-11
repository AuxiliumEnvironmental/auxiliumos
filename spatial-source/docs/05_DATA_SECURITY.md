# Local data, privacy and security

## Default operating model

Local-first capture/authoring; no cloud required for v1 field editing or exports.
Use an actor-owned transactional local store (SQLite or a carefully verified
Apple persistence layer) and an application-support file archive. Bound draft
history and derivative caches separately; never evict irreplaceable raw captures
or unacknowledged drafts just to reclaim cache space.

The portable EditorSession is a command engine, not a persistence implementation.
The retained native capture composition now compiles with the Apple SDK; this is
not a durability guarantee. The shared workspace uses transactional IndexedDB,
with independent process-death/reopen evidence; physical WebKit data protection
and installed recovery remain explicit acceptance gates.
Persist the command, new revision and pending publication metadata consistently.
A document file and DB row need staged writes and recovery so one cannot point to
a missing final file after interruption. Use unique immutable artifact names and
hashes. Avoid overwriting approved revisions in place.

## Save-state semantics

"Editing" means an uncommitted candidate. "Saved on device" means the configured
local transaction/file protocol succeeded. "Pending delivery" means persisted
outbox state. "Synced" means the receiver acknowledged the exact artifact/revision.
"Released" is a separate authorized business workflow outside this tool.
A durable local save test does not prove survival of every hardware failure.

## Data protection and privacy

Protect captures, geometry, world maps and project references as sensitive property
information. Use appropriate iOS file protection; the initial preference is complete
protection while locked [A12]. Handle protected-data-unavailable errors explicitly:
retain honest pending state and resume after unlock, rather than silently lowering
protection. Use device-bound Keychain protection for any future credentials.

Do not store API tokens in ordinary preferences, geometry files, logs or link URLs.
No service-role keys in native/web clients. No PHI, person identity inference,
face recognition, audio recording, screenshot telemetry or broad camera archives.
RGB imagery is not retained by default beyond what Apple encodes in the chosen raw
representation; do not claim that opaque framework data contains no imagery.
Describe captured data accurately in the app's privacy disclosures.

No training-data or cloud AI transfer of property content. Diagnostic logs contain
bounded error codes, timings and anonymous/test identifiers rather than full scans,
addresses, room photos or access tokens. Redact before crash/log export. App-switcher
privacy and local-data access after sign-out are tested, not assumed.

## Offline identity and revocation

An offline device cannot receive immediate remote revocation. Define an explicit
local access policy and lease for real company data before deployment. New data
can remain local while offline; destination authorization is rechecked at delivery.
Offline capture is not permission to upload elsewhere. Unsynced work must not be
silently destroyed on logout. Provide a managed recovery path that does not grant
a removed user new access. Do not promise remote wipe while disconnected.

## Import and file handling

Treat every imported bundle and label as untrusted. Bound file size, expanded size,
member count, nesting, coordinates, array counts and decode time. Reject absolute
paths, traversal, symlinks, duplicate names/JSON keys, nonfinite numbers, schema
mismatches, scripts and external-resource references. Validate geometry semantics
in addition to JSON shape. Safe transport parsing is not permission to publish.

The baseline four-file validator remains a constrained synthetic example. The
current shared importer also validates exact-version geometry, exchange and local
backup profiles with bounded ZIP decoding and strict document/provenance checks.
Its SVG vocabulary permits only safe emitted primitives. Do not render arbitrary
third-party SVG in a privileged web view. Maintain adversarial importer checks
when these contracts or dependencies change.
Validate all render indices and object references before allocating GPU buffers.

## Publication authority

Only a verified user and authorized destination receive upload reservations.
Credentials/tickets are limited to the intended operation and private object paths.
On finalization, verify bytes from storage, sizes, content types, checksums, schema,
source revision, active membership and destination rights. Client-supplied review
status, timestamps, destination fields and hashes do not establish authority.

Source permissions are checked on read as well as sync. A Moldo origin does not
create OS membership. No broad database connector credentials. No public exports
unless the business workflow explicitly authorizes them. Deleted/revoked targets,
expired sessions and changed permissions must not be bypassed by a queued upload.

## Minimum threat exercises

Cross-project and cross-business access; denied export; delayed revocation; duplicate
and reordered delivery; stale source edits; corrupt geometry; malicious labels;
SVG/ZIP abuse; forged finalization; object overwrite; leaked logs; lock/relaunch;
low disk; capture callback races; older native client schemas. Each has an expected
failure behavior in the release checklist. Measure denial behavior with ordinary
roles, not only an administrator/service key.
