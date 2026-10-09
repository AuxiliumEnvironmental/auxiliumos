# Auxilium Spatial native application

The actual SwiftUI/UIKit iPhone target composes RoomPlan/ARKit, RealityKit,
SpatialCore, CaptureKit, SpatialPersistence and SpatialInterop. Source is
implemented; Apple SDK compilation and physical acceptance are **not established**.
The continuation environment is Linux Swift 6.2.1. It has no authorized Mac/Xcode
runner, simulator, signing identity or connected supported iPhone.

## Application paths

- Device-owner authentication opens the private local workspace. A separate
  privacy window covers presented capture/editor/export screens on interruption;
  complete file protection is retained. This is not company-account authority.
- Guided RoomPlan capture retains one ARSession across completed rooms, saves
  raw and processed captures before normalization, and passes only recorded
  compatible rooms to StructureBuilder. Generation-bound callbacks and optimistic
  revision checks prevent a late room from overwriting corrected work.
- Identified world-map recovery requires an observed relocalizing-to-normal
  transition. Lost alignment, changed drafts, incompatible inputs and mixed-level
  structure floors fail closed. Explicit separate recovery is available both
  during capture and after reopening. No visual-proximity stitching is performed.
- A shared geometry graph drives direct 2D corrections, rooms/floors/semantic
  areas, undo/redo, RealityKit and exports. Openings preserve their IDs through
  resize/type/host correction. Invalid room/topology changes reject as a batch.
- RealityKit provides orbit/pan/zoom, true view-dependent cutaway, explicit
  assumed display ceilings and movement through justified door/passage portals.
  Windows, walls and unknown boundaries block movement. Exit and Reset stay
  visible; visible-floor/room placement and accessible step/look controls coexist.
- The workspace offers original capture recovery, unacknowledged geometry recovery
  into a new review-required copy, storage inventory, confirmed old-history
  cleanup, and honest disabled-delivery status. Current/first, undo/redo, frozen,
  capture, outbox and recovery files are protected from history cleanup.
- Exact frozen-revision outputs include JSON, four-file exchange ZIP, GLB,
  paginated SVG/PDF/PNG and a versioned all-floor local archive. The Apple drawing
  renderer uses CoreGraphics/CoreText/ImageIO, not a web wrapper or raster mock.
  Imported derivatives are untrusted; presentation is regenerated from admitted
  canonical geometry. Original Apple captures/world maps are excluded from export.
- The publisher remains disabled. There is no configured network receiver,
  destination picker, credential, upload, client release or live OS/Moldo write.

No verified dimensions, area quantities, pricing quantities, furniture, video,
panoramas, textures, SceneKit or custom SLAM are added.

## Apple build, separately from signing

On an already authorized Mac, use Xcode supporting the iOS 17+ target. No remote
package download, hosted backend or paid service provisioning is required.

From the repository root:

~~~sh
python3 ios/generate_project.py
xcodebuild -version
xcodebuild -project ios/AuxiliumSpatial.xcodeproj -scheme AuxiliumSpatial -showdestinations
xcodebuild -project ios/AuxiliumSpatial.xcodeproj -scheme AuxiliumSpatial \
  -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build
~~~

Record source/dependency/config hashes, Xcode/SDK versions and complete diagnostics.
Resolve actual compiler/linker errors before marking the Apple build gate passed.
Linux swiftc -frontend -parse is syntax-only, not SDK typechecking.

For native synthetic composition/journal tests, use an actual simulator ID from
-showdestinations with xcodebuild test -destination 'id=ACTUAL_ID'. Do not
substitute a made-up device ID. Simulator success does not establish LiDAR.

On the same Mac run swift test --package-path packages/SpatialInterop so the
conditional Apple PDF/PNG tests decode actual outputs. Set
SPATIAL_DRAWING_FIXTURE_DIR to a fresh synthetic-output directory when running
the drawing tests to retain PDFs and PNGs for orientation/text/page inspection.
The equivalent Linux branch only verifies an explicit renderer-unavailable error.

Physical installation is a separate gate: use an authorized development team,
provisioning and a supported LiDAR iPhone Pro. No accounts, entitlements, signing
permissions or distribution were provisioned in this workspace. Execute
tests/native/DEVICE_ACCEPTANCE.md with synthetic/consented spaces before claiming
capture, lock/recovery, field usability, accessibility or performance acceptance.

## Source and privacy configuration

The Xcode project and Info.plist are deterministic generated source. After adding
or removing app/native-test Swift files, run python3 ios/generate_project.py and
review the diff. Edit Info.plist's generation input, not its output alone.

The privacy manifest declares app-container metadata (C617.1), user-selected file
metadata (3B52.1), low-disk write admission (E174.1), and elapsed event/timer use of
system uptime (35F9.1). It declares no tracking or collected off-device data.
These declarations match the source intent; distribution/privacy approval and
actual runtime behavior are not claimed. Apple source references:

- https://developer.apple.com/documentation/roomplan/roomcaptureview/init(frame:arsession:)
- https://developer.apple.com/documentation/roomplan/structurebuilder
- https://developer.apple.com/documentation/arkit/arworldtrackingconfiguration/initialworldmap
- https://developer.apple.com/documentation/realitykit/perspectivecamera
- https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitype

Hash-bound independent source reviews are in evidence/continuation/. Source
review is distinct from Apple compilation, native output inspection, physical
acceptance, live integration and release.
