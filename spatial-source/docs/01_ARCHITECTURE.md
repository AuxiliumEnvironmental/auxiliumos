# Architecture and ownership

## Chosen shape

Owner-approved correction, October 9, 2026: one maintained React/TypeScript
authoring workspace in `web/` runs independently in the browser, embedded in
the existing authorized AuxiliumOS development application, and inside the
installed Capacitor iPhone shell. It provides full 2D editing, geometric 3D
navigation, revisions, saving/reopening and exports in all three environments.
An OS viewer or launcher does not satisfy this requirement.

Independence includes a usable hosted entry point outside the OS application,
using the same maintained workspace. The owner purchased and selected
`spatialauxilium.io` on October 9, 2026. Its protected hosting target and DNS
still need to be connected; domain ownership is not a claim of deployment.
The existing `/spatial/standalone` route only hides OS navigation
and still depends on the OS runtime. It is not evidence that independent hosting
has been delivered. Shared sign-in is compatible with an independent application;
sign-in and a hostname do not establish project authority or data synchronization.
Authorized project exchange remains a separate scoped adapter, with live
publication disabled. Do not fork the editor or create a new business database
to obtain a separate address.

Owner clarification, October 9, 2026 (America/Chicago): retain the existing OS UI
for selecting Spatial. Complete and transfer the independent application first;
do not continue improving an OS-owned copy of its editor. Later full-workspace
embedding remains a scoped integration of this maintained source. Separation
must preserve current OS work and local drafts. The older generated editor and
adapter may be retired only through an explicit, reviewed cutover after the
independent protected destination works and existing work is recoverable.

The existing Swift RoomPlan/ARKit capture engine is retained behind the narrow
AuxiliumCapture 1.0.0 bridge. It owns compatible connected rooms, recovery and
protected raw captures. SwiftUI/UIKit remain appropriate for capture screens.
The prior native authoring UI is preserved as a compatibility reference, not a
second maintained product. The shared workspace uses Three.js with the existing
canonical geometry. RealityKit remains in the preserved native reference. No
SceneKit, custom SLAM, 360 pipeline or photorealistic renderer is introduced.

Logical ownership:

    Capacitor iOS shell / shared React workspace / authorized OS host
      capture adapter -> raw capture archive -> normalization -> SpatialCore
      editor commands -> validated draft -> local revision repository
      canonical graph -> shared 2D / Three.js geometry / exact-version exports
      publisher port -> disabled adapter -> future scoped OS or Moldo receiver

SpatialCore has no UI, RoomPlan, HTTP, login or OS table dependencies. The domain
model owns identifiers, graph connectivity, opening placement and source lineage.
Renderers consume geometry; they cannot silently change it. No render-only
approximation is written back as measured truth. Use Double for canonical
coordinates; render-relative Float conversion happens at the graphics boundary.

## Project ownership

- web/src/core/: TypeScript canonical model behavior, edits, scene and movement.
- web/src/data/: IndexedDB transactions, undo/revisions, strict imports, exports.
- web/src/ui/: one maintained React editor and graphic navigation workspace.
- capacitor/: installed shell and versioned native capture and file bridges.
- integration/: reproducible full-workspace module and authorized OS adapter.
- .github/workflows/apple-unsigned.yml: standalone, manually invoked unsigned
  Apple build workflow. Transferred from the verified isolated build workflow;
  adding this file has not created or run a new remote service.

The existing Swift packages below are retained as capture dependencies and
behavioral references. New TypeScript tests and common golden fixtures verify
adaptation; old Swift evidence never certifies a TypeScript implementation.

- ios/: real Xcode app, composition root, app lifecycle and native platform views.
- packages/SpatialCore/: model, constraints, edits, normalization-independent logic.
- packages/CaptureKit/: RoomPlan/ARKit adapter and native scan lifecycle.
- packages/SpatialPersistence/: local database, migrations, files and outbox.
- ios/SpatialApp/: preserved native capture and authoring compatibility reference.
- packages/SpatialInterop/: manifests, exports, launch context and publisher port.
- contracts/: externally consumed schemas; lead is the only schema writer.
- tests/: golden geometry, device journeys, importer abuse and integration fixtures.

Do not create all empty packages as busywork. Extract boundaries as the first
real implementations establish dependencies. Keep one authoritative geometry
engine. Current core is a tested foundation, not all future geometry behavior.

## Shared infrastructure without shared ownership confusion

AuxiliumOS keeps accounts, project membership, authorizations, releases and
management records. Spatial owns drafts/geometry. A source publication is an
immutable spatial revision; OS owns its audience and release decision. Moldo
keeps its own engagement workflow. Source access cannot be expanded at the receiver.

A shared deployment or database does not prove tenant isolation. Conversely,
a second database is not needed to achieve a focused user interface. Do not
create a new hosted project for this local-first build without a defined reason
and authorization. External integration is independently deployable later.

## Capture strategy

Use Apple's fused camera/motion/LiDAR result. Do not collect every sensor stream
merely because it exists. ARKit already handles motion-assisted world tracking.
Optional scene-depth checks are useful only when runtime-supported and measured;
do not create a competing camera session. CoreMotion, GPS, compass, audio,
continuous video recording and cloud AI are not mandatory capture dependencies.

The full shared authoring workspace and native capture bridge are required v1
deliverables. Browser capture fails explicitly outside installed supported iOS.
Native captures are returned only after durable saving, then validated against
the existing graph contract. A returned older capture cannot overwrite a newer
web correction. Native originals stay separately protected.

The OS adapter revalidates authenticated project access, namespaces local drafts
by profile/account/project and unmounts on sign-out or revocation. URL identifiers
are not authority. Generated OS modules record source hashes and are regenerated
from this workspace rather than maintained as another editor. Moldo is untouched.
IndexedDB save status follows transaction completion. Quota failure, concurrent
revision conflicts and failed imports cannot be displayed as saved. Browser
storage may be cleared by the browser; local-document backups remain available.
Development uses synthetic data. No new backend or live publisher is enabled.

Implemented source, portable tests, browser interaction, Apple SDK compilation,
simulator behavior, physical capture/accessibility/performance and release remain
separate evidence. Original budgets and physical acceptance are unchanged.

## Extension rules

Add a capture source by implementing a capture/normalization adapter, not changing
business tables. Add an overlay by referencing stable objects and a base revision,
not changing structural walls. Add an export with a versioned encoder. Add a new
opening/curve representation through an additive migration with old-fixture tests.
Unknown schema versions must not be guessed. Preserve original input and reject
or migrate with an explicit reader. Do not build speculative extension interfaces
for excluded products in v1.
