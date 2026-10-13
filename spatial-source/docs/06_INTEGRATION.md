# Integration without coupling the product to the OS build

## Initial delivery boundary

The initial application must capture, edit, save and export independently. It does
not write live AuxiliumOS/Moldo tables. contracts/publication.openapi.json is a
proposed interface only. There is no live URL, deployed endpoint, configured auth
or automatically trusted user in this ZIP. Expose "Not connected" honestly.

Preserve the OS canonical web/ application and ADR-001 operating boundary [R01].
When integration is authorized, inspect current OS storage reservation/finalization
contracts and adapt to them. Do not introduce a competing document/release system,
copy an old migration, or reset a current backend to match this package.

## Launch context

An OS project may launch the native tool through a verified Universal Link with
an opaque, short-lived, single-use handoff reference. The tool resolves it through
an authenticated exchange; the receiver checks user, intended application, target,
expiry, replay and current membership. Never put reusable bearer tokens, client
names or signed permanent object URLs in the link. Without a connection, choose a
local workspace and assign a target later through an authorized picker.

## Publish contract

1. Freeze a local source revision and create a stable clientRequestID.
2. Generate immutable artifacts and a manifest. Hash the exact bytes of each file.
   Hash the exact UTF-8 manifest bytes separately; don't pretend JSON key order is
   a cross-language canonicalization or put a self-hash inside the manifest.
3. Reserve with destination context, source revision, digest and expected target
   revision. Server determines object paths and audience, not the client.
4. Upload to private quarantine using resumable/streamed transfer appropriate to
   native iOS. Supabase supports TUS resumable upload [S01]; select and validate a
   maintained native client or an appropriate background-transfer approach later.
   Do not assume a browser TUS example implements native background uploading.
5. Finalize by verifying actual stored bytes, schemas, current permissions and
   expected revision. A 202/pending response is not accepted delivery.
6. Record an authenticated receipt for the exact source revision, destination and
   digest. Keep the same request ID on uncertain retry; reconcile status first.
   Same ID/different content must fail. Duplicate exact delivery must not duplicate
   OS documents. Out-of-order delivery must not replace a newer accepted revision.
7. OS accepts an internal draft/document version. Client release remains a separate
   exact-version approval. Source release can restrict, never silently broaden,
   receiver visibility. Integration rollback disables a connector, not its records.

No clock-based last-write-wins for geometry or release authority. Keep local user
edit time and server receipt time distinct. A stale dashboard is not approval.

## File contract now and later

The tested exchange fixture contains geometry.json, scene.json, floorplan.svg and
manifest.json. scene.json is a portable intermediate graphic scene, not a GLB.
The full product must additionally support polished PDF and PNG output, and a
portable 3D export (GLB is the recommended target), with native USDZ export optional.
Add these MIME/path profiles through a versioned contract and tests; do not widen
the strict fixture importer to arbitrary content to make an export pass.

Raw Apple captures/world maps stay private on-device unless explicit retention
and export authorization adds them. No global public links or hidden photo uploads.
For multi-floor export, use a manifest profile with per-floor artifacts and
explicit floor IDs. Do not reuse the single-floor fixture format ambiguously.

## Future web and Moldo consumption

OS may render a lightweight read-only scene from validated geometry or GLB without
loading the capture engine. Editing opens the same maintained authoring workflow,
not a copied editor. Shared native/web contract tests compare asymmetric geometry,
opening locations, floor orientation and version identity.

Moldo can consume selected views/features through its own context. A Moldo account
ID is not an OS account ID. Explicit mappings and independent access checks are
required. Financial/operational projections belong to their existing systems;
this spatial tool does not invent invoices, rates, staff roles or project state.

## Storage and version evolution

Portable export is a recovery path, not the only backup plan. Back up metadata
and actual object bytes separately; Supabase DB backups do not include Storage
object contents [S03]. Readable older records remain supported through explicit
migrations. Lock down server-to-server adapters and keep authentication secrets
out of client code. No automatic schema migration in production on app launch.
