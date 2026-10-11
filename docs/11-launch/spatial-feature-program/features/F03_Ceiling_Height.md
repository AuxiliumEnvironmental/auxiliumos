# F03: Direct ceiling-height editing

**October 11 owner override:** Development is authorized concurrently on the exact isolated branch in ACTIVE_TASKS.json. Earlier statements below requiring predecessor completion apply to integration acceptance, not starting this branch. Read PARALLEL_DEVELOPMENT.md and preserve all predecessor behavior when the master composes the result.

## Prompt for the feature chat

Implement F03 only after the Astra master accepts F00 shared contracts, F01 surface presentation and F02 opening manipulation. Follow the master’s shared operating policy and active assignment. This is a future implementation packet, not a claim that height editing exists. `source:` resolves to `spatial-source/` in GitHub or `Auxilium_Spatial_Developer_Package/` in the archive. Start from the reconciled current source, preserving newer work.

Deliver smooth direct room/structure ceiling-height manipulation in 3D editing mode using the existing shared React/TypeScript workspace. Browser, Lovable, OS embedding and Capacitor must use the same saved geometry and behavior. Walkthrough remains navigation-only. Native capture stays compatible; do not add another Swift editor.

## Exact result and approved scope

Selecting the relevant room/ceiling exposes a clear vertical manipulation handle, live height feedback and an exact value alternative. The gesture adjusts vertical clearance relative to the floor datum. It must not shift room footprint, floor elevation or unrelated geometry. Reuse F02’s gesture ownership, selection, preview, cancellation and commit behavior.

Room is the default scope. An explicit structure action must show exactly which rooms/levels it includes. Apply F00’s frozen semantics for mixed room heights. Recommended structure dragging uses a common delta to preserve existing differences; absolute assignment must be explicitly labeled. Do not invent this decision during implementation if the master contract differs.

Keep ceilings readable in F01’s neutral surface palette. Editing must remain discoverable when display ceilings are hidden, using a selected room height control or a temporary edit outline. Opening the edit must not silently change stored visibility preferences. Preserve orbit, pinch, pan, cutaway and view memory; never interpret the existing cutaway slider as geometry authoring.

Every accepted edit persists through undo/redo, reopening and required export/import paths. Updated heights retain edited basis/provenance and unverified measurement status. Do not infer structural engineering constraints or claim verified quantities.

## Baseline facts that determine the implementation

At the inspected baseline, `Room` contains only id, label and boundary references. `Wall` carries `baseY`, constant `height` and `heightBasis`. There is no room-height or wall-height mutation in `EditCommand`.

`source:web/src/core/scene.ts::displayCeilings` derives a display face only when every boundary wall has the same world top. These faces are supplied separately to `ModelViewport`; they are absent from canonical `buildScene` output. A ceiling and floor both resolve to their room ID when selected. F00 must therefore provide authored ceiling/surface identity and versioned storage semantics before this feature can claim independent room-height editing.

Rooms may share the same wall. Updating all boundary walls indiscriminately can change a neighbor’s ceiling or make it disappear. Floors have independent horizontal frames unless explicitly aligned. Matching X/Z positions do not establish inter-floor alignment.

## Targeted reads and candidate files

Read `source:AGENTS.md`, `source:RESUME.md`, `source:web/IMPLEMENTATION_CONTRACT.md`, master state and the accepted F00–F02 handoffs. Then inspect:

- `source:web/src/types.ts`: approved room/ceiling, wall, surface selection and edit commands.
- `source:web/src/core/scene.ts`, `editor.ts` and restoration mappings, `validation.ts`, plus relevant `geometry.ts` and `navigation.ts` assumptions.
- `source:web/src/ui/ModelViewport.tsx`, `sceneBatches.ts`, room sections of `Inspector.tsx`, and commit/authority/view wiring in `SpatialWorkspace.tsx`.
- `source:docs/03_GEOMETRY.md`, relevant visual requirements and `source:contracts/COMPATIBILITY.md`; use the newer shared-workspace contract over stale native UI prose.

Those core/UI paths and focused tests are candidate edits. Include `source:web/src/data/drawing.ts`, `exports.ts`, `glb.ts`, `imports.ts`, and approved versioned schemas where persisted ceiling geometry changes output/admission. `source:capacitor/README.md` defines packaging. Contract changes remain master-owned; unrelated app structure, capture behavior and OS business workflows are outside this feature.

## Implementation sequence and invariants

1. Confirm F00’s explicit room-ceiling representation, legacy migration, scope semantics, wall-span policy and attachment rules. Preserve old uniform-height documents without fabricated ceiling observations. Do not hide authored height solely in viewport state.
2. Implement an atomic canonical height command. Room-only edits must leave neighboring room intent intact, including shared partitions and different heights. Preserve opening width, height, bottom, type and orientation. Lowering through an opening must reject with its specific conflict or use an explicitly approved resolution; never shrink/delete/rehost it silently.
3. Keep floor elevations fixed. Structure scope must neither move other floors nor assume shared frames. Apply only constraints supported by actual alignment/model data. Slopes and nonuniform captured profiles remain preserved source information unless F00 explicitly supports authoring them; do not flatten them implicitly.
4. Add stable 3D vertical dragging and exact entry through the shared command path. Avoid ray-plane singularities or jumps at oblique views. Handle grip offsets, pointer capture, second-touch takeover, Escape/cancel, blur/backgrounding, selection/scope changes, revocation and stale releases consistently with F02.
5. Preview only affected geometry at the render cadence. Commit once; recalculate dependent scene/navigation and lineage coherently. Preserve camera and idle rendering. Respect pending-save recovery and one undo unit for a structure-wide batch.
6. Carry authored height through required exports and rebuilt host/package outputs. Ceiling-bound attachments follow their declared anchor; floor-bound objects retain theirs. Wall observations must not silently stretch or disappear when the surface changes. Emit the approved review mapping for downstream reconciliation.

## Minimal acceptance and handoff

| ID | Required evidence |
|---|---|
| F03-A01 | Drag/numeric height agree at nonzero floor/base elevation; no footprint or floor shift. |
| F03-A02 | Room-only edit preserves a differently sized neighbor and shared-wall integrity. |
| F03-A03 | Structure scope affects exactly its shown set; one undo restores every included height. |
| F03-A04 | Opening/attachment conflicts reject atomically; cancellation and interrupted gestures save nothing. |
| F03-A05 | Reopen, undo/redo and required export/import retain authored ceiling identity, height and basis. |
| F03-A06 | Handles stay usable through orbit/cutaway; walkthrough cannot edit; frame/renderer behavior does not regress. |

Extend relevant scene/editor/validation tests with one asymmetric adjoining-room fixture and one combined gesture journey. Reuse F02 cancellation and persistence evidence where unchanged. Run a required build and a narrow installed WebKit check when available; record missing device evidence as open. Handoff base/result commits, touched paths, height policy, schema/output changes, evidence IDs and platform delivery status. Fixtures consume height/attachment limits; affected areas consume stable ceiling/wall surface identity and explicit remapping receipts.
