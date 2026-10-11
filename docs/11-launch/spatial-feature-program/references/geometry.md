# Openings and ceiling editing: source reconciliation

Review scope: read-only inspection of the frozen source at `baseline/Auxilium_Spatial_Developer_Package`. No application changes or test runs were made for this planning review. Paths below are relative to that package. The master supplied archive checkpoint `eebd27f8` and runtime checkpoint `b64448ea`; a future worker must reconcile newer source before editing.

## Architecture correction that every feature prompt needs

`AGENTS.md`, `RESUME.md`, `web/IMPLEMENTATION_CONTRACT.md`, and `capacitor/README.md` establish one maintained React/TypeScript authoring workspace in `web/`, shared with the browser and installed Capacitor host. The retained Swift authoring code is a compatibility/reference implementation, not a second editor to extend. Native capture and bridge compatibility still matter. Older prose in `docs/04_UI_AND_3D.md` describing native RealityKit authoring is superseded by the shared-workspace contract.

The owner’s newest requests supersede the old visual/no-furniture scope where they conflict. Preserve unverified measurement status, geometry provenance, exact-revision exports, standalone operation, and authenticated OS adapter boundaries.

## Current source facts and actual feature gaps

| Area | Present in inspected source | Remaining gap for these features |
|---|---|---|
| Coordinate model | `web/src/types.ts`: meters, right-handed, Y-up, horizontal X/Z; floors have elevation. Walls have polyline node IDs, baseY, constant height, heightBasis. | No new coordinate system is needed. New gesture adapters must use existing wall arclength and `floor.elevation + wall.baseY + opening.bottom`. |
| Opening geometry | `Opening` has stable id, wallID, kind, offset, width, bottom, height, provenance. Kinds are only door/window/passage. | No catalog type ID, hinge orientation, facing/swing, per-type capabilities, or associated 3D leaf/frame representation. |
| Existing plan manipulation | `web/src/ui/openingManipulation.ts` implements move/start/end, preserved grab offset, whole polyline arclength, continuity protection near adjacent branches, width bounds and overlap rejection. `openingResizeHandles` separates 44px targets from the opening body. | Extend this work. Do not rebuild it. It currently edits horizontal offset/width only. |
| Existing plan gestures | `FloorplanCanvas.tsx` selects first on touch, gives selected opening handles/body priority, previews without saving, commits one move/update command on release, and cancels on pinch, disabled state, selection change, blur, visibility loss, resize and stale geometry. | Add height-capable 2D elevation interaction if desired; preserve the existing plan gesture/recovery behavior. Avoid adding a second transaction implementation. |
| Opening details | `Inspector.tsx` changes kind and adjusts width, height, bottom and offset by 0.05m buttons; explicit host selection exists. | No exact dimension entry, door flip controls, richer catalog, or wall-elevation editor. |
| 2D symbols | `PlanGeometry.tsx` renders a generic door arc, a window stroke, and opening strokes from existing geometry. | No semantic flip or catalog rendering. The generic arc is not type-specific geometry. |
| 3D geometry | `core/scene.ts::buildScene` produces actual missing wall triangles for apertures. `ModelViewport.tsx` creates non-rendered semantic opening hit meshes, including along bent hosts. | No 3D edit handles, dimension preview, edge translation, resize command delivery, or opening type geometry. Preserve actual voids. |
| 3D input | `ModelViewport` props expose selection and view memory, but no edit callback or editing-disabled authority state. Current pointer handling selects on clicks, orbits normally and navigates in walk mode. | Add controlled editing through the existing workspace commit/authority path. Camera/edit ownership, cancellation and stale release fencing are required additions. |
| Ceiling model | `Room` has id/label/boundary only. `displayCeilings` derives a presentation face only if every boundary wall has the same world top. | No persisted room ceiling elevation/height or ceiling command. A room with unequal wall tops gets no display ceiling. |
| Height authoring | `EditCommand` includes no wall-height or room-height update. The cutaway height slider in `ModelViewport` only clips presentation. | Ceiling dragging cannot be implemented correctly as a slider relabel or direct mesh scaling. It needs an explicit canonical height/surface contract and atomic commands. |
| Save/history | `SpatialWorkspace.tsx::commitEdit` validates commands, retains a pending preview after save failure, and uses the existing authorized store. `core/editor.ts::applyCommands` validates a cloned before/after snapshot and increments one revision per batch. | Reuse these paths for 3D and ceiling edits. Do not write directly from a viewport or persist pointer-move events. |

## Important source-specific risks

1. **Versioned fields cannot be slipped into existing documents.** `core/validation.ts` rejects unknown fields and supports only geometry 1.0/1.1. `contracts/geometry.schema.json`, `geometry-v1.1.schema.json`, and `COMPATIBILITY.md` freeze old contract meanings. Door types/orientation and authored ceiling data require a lead-owned versioning/migration decision, corresponding TS admission, import/export updates, and old-document preservation. Do not remove strict admission or teach an old version to mean something different. Native capture may continue producing its known older geometry envelope; new readers should admit it deliberately. Do not require a duplicate Swift authoring feature to achieve shared UI parity.

2. **Bend-spanning openings already exist.** Plan manipulation deliberately supports openings across polyline vertices. `core/navigation.ts` blocks a traversable opening that spans a wall bend, while `core/scene.ts` still renders the aperture. Do not replace wall arclength with a straight endpoint projection, reject old valid documents, or pretend a rigid door leaf can bend. Define richer catalog capabilities separately from the preserved generic aperture. A 3D manipulator needs an explicit stable wall chart/segment policy for this case.

3. **Wall joining reverses opening coordinates today.** `core/editor.ts::join` remaps `offset` when the second wall reverses; `split` rehosts openings and preserves room directions. New hinge/swing semantics must be transformed through these operations so physical orientation does not change. Stable object IDs alone do not protect orientation.

4. **Room-height edits cannot update boundary walls blindly.** Two rooms may share one Wall. Changing all of one room’s boundary wall heights could invalidate or remove the neighbor’s derived ceiling. The lead must choose an explicit room-ceiling/surface representation that supports independent room heights and a documented wall-span policy. Do not make isolated ceiling meshes the second geometric truth. Preserve floor elevation, baseY, opening bottom elevation and unrelated room heights unless the selected action explicitly includes them.

5. **Floor alignment is not inferred.** `docs/03_GEOMETRY.md` says floor horizontal frames are independent unless explicitly aligned. Multi-floor collision or story propagation cannot be invented from matching X/Z positions. Structure-wide height edits need a visible scope and must not silently reposition other floors. Known alignment may enable additional checks; absent alignment must remain an explicit limitation.

6. **Current selection loses surface identity.** `Selection` identifies object kind/id. A floor and its display ceiling both resolve to the room ID in `ModelViewport`; wall side is not retained. Shared surface selection for ceiling editing and future affected-area placement needs role/side/local-coordinate identity, preferably an additive selection contract rather than unstable mesh indexes.

7. **Renderer lifecycle must be respected.** `ModelViewport` creates and disposes the renderer, scene and navigation in an effect keyed to document ID/revision/floor. Existing idle rendering is event-driven and frame-coalesced, and warm view switching retains a renderer. Committing on every drag event would repeatedly rebuild it. Feed cheap transient geometry to a local preview path, commit once, and preserve camera/view state. Do not broaden this into an unrelated renderer rewrite.

8. **Traversal has existing semantics.** `core/navigation.ts` admits floor-level door/passage portals only with unambiguous shared rooms, body clearance and sufficient width; windows never become portals. A raised door is currently permitted geometry but not necessarily traversable. Do not globally impose floor anchoring without a deliberate catalog rule. New door leaf graphics must not invisibly alter portal eligibility or block an otherwise admitted path without an explicit interaction decision.

9. **Derived ceilings are absent from canonical scene export.** `buildScene` emits wall/floor faces and optional area edges. `displayCeilings` is called separately by the viewport. If authored ceilings or richer opening graphics must be transferred/exported, reconcile the scene schema and `data/exports.ts`, `data/drawing.ts`, `data/glb.ts`, and `data/imports.ts`; adding them only to the viewport would not establish parity.

10. **Lineage is deliberately conservative.** `core/editor.ts::restorationMappings` flags changed walls, dependent openings/rooms and geometry restoration with `requiresOverlayReview`. New height/surface changes must participate. Future damage records must not be silently stretched, rehosted or discarded after an edit.

## Proposed feature-specific decisions for the master to freeze

For openings, preserve the existing plan width/move behavior. In 3D edit mode, tapping an edge or corner selects and reveals corner handles; a selected edge translates only along the host; selected corner handles resize. Dragging must preserve the grab offset and an opposite-corner anchor. Walk mode never edits. Explicit numeric dimensions are an alternative to precision dragging. A compact wall elevation inside the existing Details interaction can expose height/bottom dragging in 2D without pretending top-down coordinates encode height.

Store door flips as physical hinge/end and facing/swing semantics in the host frame. Proposed labels match the owner: **Flip horizontally** swaps the end/hinge, **Flip vertically** reverses facing/swing. The meaning must not rotate with the camera. Map richer catalog capabilities only after the companion inventory is available; do not invent a catalog or claim captured hinge knowledge that source does not contain.

For height editing, persist explicit room-ceiling intent with basis/provenance under the lead-approved evolved contract. A selected room height handle should edit that room without changing another room. Structure scope should preview exactly the included set. For mixed heights, a common delta preserves differences during a structure drag; exact absolute setting can be explicit. The lead should freeze this choice before the feature worker writes UI. Lowering through an opening must reject or offer a deliberate resolution, never shrink/delete it silently. Ceiling-bound future objects may follow their declared attachment; floor-bound objects and wall observations retain their documented physical coordinates.

## Exact reading/edit boundaries for future feature chats

Common required first reads: `AGENTS.md`, `RESUME.md`, `web/IMPLEMENTATION_CONTRACT.md`, current build state/queue, and the master’s active feature record. Read only relevant sections of `docs/03_GEOMETRY.md`, `docs/04_UI_AND_3D.md`, and `contracts/COMPATIBILITY.md` after reconciling stale native prose.

**Opening worker:** `web/src/ui/openingManipulation.ts`, `openingPlacement.ts`, relevant opening gesture sections in `FloorplanCanvas.tsx`, `Inspector.tsx`, `PlanGeometry.tsx`, `ModelViewport.tsx`, and relevant `SpatialWorkspace.tsx` commit/authority wiring. Read `core/editor.ts` split/join/updateOpening, `core/validation.ts`, `core/scene.ts` aperture generation and `core/navigation.ts` eligibility. Lead-owned `types.ts` and versioned schemas change only through the approved contract task. Data export/import files are included when the approved richer opening representation changes their output.

**Ceiling worker:** `web/src/types.ts` Room/Wall/EditCommand/Selection, `core/scene.ts::displayCeilings`, `core/editor.ts` and restoration mappings, `core/validation.ts`, `ModelViewport.tsx`, the room section of `Inspector.tsx`, and `SpatialWorkspace.tsx`. Include `sceneBatches.ts` to preserve role/color/triangle ownership. Read aligned-floor/height semantics before defining whole-structure behavior. Include data exporters and native bridge readers only where the changed contract actually crosses those boundaries.

**Installed delivery:** `capacitor/README.md` and `capacitor/prepare.py` define packaging of the actual `web/` build. The source change alone is not evidence of a rebuilt installed app. Record packaged asset identity and build/device evidence honestly. Do not modify the legacy Swift editing UI to simulate parity.

## Focused acceptance without a broad rerun

No tests were run for this review. Existing test source is useful coverage, not proof of current device behavior.

- Opening tests already live in `web/tests/ui/direct-openings.spec.ts` for grab offsets, arclength, width handles, touch selection, narrow targets, cancellation, revocation, undo/reopen and windows staying non-portals. Extend changed-path coverage rather than duplicating it under a new suite.
- Reuse relevant cases in `web/tests/core/editor.test.ts`, `scene.test.ts`, and `navigation.test.ts`. Add only new risks: 3D edge versus corner ownership; both flips through reversed join/split; ceiling/shared-wall isolation; evolved-schema and export roundtrip. One asymmetric fixture can cover these semantics.
- For the 3D gesture path, one end-to-end sequence should select, translate, resize, flip, cancel one drag, commit, undo/redo, reopen and traverse the resulting doorway. Instrument renderer creation/frame scheduling during the gesture to catch accidental full rebuilds. Use existing `rendererDiagnostics.ts` and `warm-switch.spec.ts` where relevant; do not run unrelated large-load/native suites for a cosmetic change.
- Ceiling acceptance should include unequal adjoining room heights, an opening near the new ceiling limit, a nonzero floor/base elevation, and structure-scope undo. It must show the saved result in both plan/details and 3D plus the required export path.
- Shared web code avoids duplicate implementation tests, but it does not replace a narrow installed WebKit gesture/persistence check after packaging. An unavailable Apple/device check must remain an explicit open evidence row, never be represented by a browser screenshot or old Swift tests.

Remaining externally sourced fact: the companion app’s exact door/window type inventory and its true behavioral capabilities. The master is fetching that source. No statement in this review assumes those types exist in Spatial today.
