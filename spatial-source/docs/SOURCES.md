# Research and source register

Primary sources checked during package preparation. Recheck current API availability
against the actual installed stable Apple SDK before compiling native work. These
sources support platform facts, not claims that the whole product already exists.
All UI choices, numerical performance budgets and algorithm policies are proposed
engineering requirements unless explicitly identified as observed results.

## A01 | Apple: RoomPlan overview
https://developer.apple.com/augmented-reality/roomplan/

RoomPlan uses camera/LiDAR inputs and exposes parametric room output; it permits customized capture UI.

## A02 | Apple: WWDC23: Explore enhancements to RoomPlan
https://developer.apple.com/videos/play/wwdc2023/10192/

Historical guidance on continuous sessions, MultiRoom and residential capture size. The 2023 guidance is not a universal current hard limit.

## A03 | Apple: StructureBuilder.capturedStructure(from:)
https://developer.apple.com/documentation/roomplan/structurebuilder/capturedstructure(from:)

Rooms require compatible world space; persistent ARSession or successful world-map relocalization supports alignment.

## A04 | Apple: Scanning the rooms of a single structure
https://developer.apple.com/documentation/roomplan/scanning-the-rooms-of-a-single-structure

Room-by-room capture, guidance, and keeping the AR session alive between compatible scans.

## A05 | Apple: CapturedRoom.Surface.polygonCorners
https://developer.apple.com/documentation/roomplan/capturedroom/surface/polygoncorners

Polygon corner data is in local plane coordinates and represents nonuniform walls/floors.

## A06 | Apple: CapturedRoom.Confidence
https://developer.apple.com/documentation/roomplan/capturedroom/confidence

Confidence denotes certainty of feature classification; it is not a survey accuracy certificate.

## A07 | Apple: ARDepthData.confidenceMap
https://developer.apple.com/documentation/arkit/ardepthdata/confidencemap

Depth confidence is a different signal; reflective/absorbing surfaces can reduce confidence.

## A08 | Apple: CapturedRoom.Surface.Curve
https://developer.apple.com/documentation/roomplan/capturedroom/surface/curve-swift.struct

Curved-surface metadata includes angles, radius and local center.

## A09 | Apple: Bringing SceneKit projects to RealityKit
https://developer.apple.com/documentation/realitykit/bringing-your-scenekit-projects-to-realitykit

Apple describes SceneKit as soft-deprecated and recommends a newer native framework such as RealityKit for long-term work.

## A10 | Apple: ProcessInfo thermal state
https://developer.apple.com/documentation/foundation/processinfo/thermalstate-swift.enum/nominal

Thermal states include nominal, fair, serious and critical.

## A11 | Apple: UI Design Dos and Don'ts
https://developer.apple.com/design/tips/

Guidance includes at least 44-by-44-point hit targets, readable content and clear alignment.

## A12 | Apple: Complete file protection
https://developer.apple.com/documentation/foundation/nsdata/writingoptions/completefileprotection

Protected files cannot be read/written while locked; the app must handle unavailable protected data.

## A13 | Apple: RoomCaptureView init(frame:arSession:)
https://developer.apple.com/documentation/roomplan/roomcaptureview/init(frame:arsession:)

A custom world-tracking session can be used and its configuration preserved.

## A14 | Apple: StructureBuilder.ConfigurationOptions
https://developer.apple.com/documentation/roomplan/structurebuilder/configurationoptions

Current symbol reference uses init(options:), unlike some historical presentation code.

## A15 | Apple: UnlitMaterial
https://developer.apple.com/documentation/realitykit/unlitmaterial

A material not responding to scene lighting; translucent output requires explicit blending configuration.

## A16 | Apple: RoomBuilder.init(options:)
https://developer.apple.com/documentation/roomplan/roombuilder/init(options:)

RoomBuilder accepts an explicit configuration option set.

## S01 | Supabase: Resumable uploads
https://supabase.com/docs/guides/storage/uploads/resumable-uploads

TUS resumable upload support. Native implementation and background-transfer behavior still need validation.

## S02 | Supabase: Row level security
https://supabase.com/docs/guides/database/postgres/row-level-security

Server-side access rules and key handling are necessary; authentication alone is not per-project authorization.

## S03 | Supabase: Database backups
https://supabase.com/docs/guides/platform/backups

Database backups do not include actual Storage object contents.

## S04 | Supabase: Changelog
https://supabase.com/changelog

Reviewed current change index before integration planning. No Supabase SDK/schema/server is deployed here.

## R01 | User repository: AuxiliumOS ADR-001 at observed newer PR head
https://github.com/AuxiliumEnvironmental/auxiliumos/blob/a749b7d67d177c02f557b02e305598dfd2fee78c/docs/03-data/ADR-001-DOMAIN-AND-MOLDO-BOUNDARIES.md

OS/Moldo ownership, scoped integration and exact-version rules. Read via connected GitHub. This is architectural context, not proof of deployed integration.

## R02 | User repository: AuxiliumOS draft PR 84
https://github.com/AuxiliumEnvironmental/auxiliumos/pull/84

Current read reported head a749b7d67d177c02f557b02e305598dfd2fee78c. Preserve newer changes; PR body can lag source.

## Retrieval limits
The Supabase Markdown changelog fetch failed with an unsupported content-type;
the official HTML changelog was retrieved instead. No live Supabase user data was
read or changed. Apple symbol pages sometimes require JavaScript; indexed official
symbol text and Apple session transcripts supplemented those pages. Native build
evidence is still mandatory. No competitor hands-on benchmark was performed.
