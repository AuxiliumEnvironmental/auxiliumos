# Surface appearance, fixtures and affected-area planning review

Planning only. No application code, external service or source archive was changed during this review. Source root inspected: `baseline/Auxilium_Spatial_Developer_Package/`. The parent's reconciled checkpoint identifies archive `eebd27f8`, runtime `b64448ea`, and Lovable host `467221a`; this review itself inspected the extracted archive, not the live host.

## 1. Verified source facts and implications

| Current source | Verified behavior | Implication for the next work |
| --- | --- | --- |
| `AGENTS.md`, `RESUME.md`, `web/IMPLEMENTATION_CONTRACT.md` | The maintained authoring workspace is React/TypeScript. The archived native-only editor is retained reference. Lead owns shared types/contracts; commands, data and UI have separate ownership. | Implement features once in `web/`, then integrate/package that exact source for browser, OS and Capacitor. Do not launch a second Swift authoring implementation. |
| `web/src/types.ts` | Document schema versions are 1.0/1.1; coordinates are meters, Y-up, right-handed. Objects are nodes, walls, openings, rooms and optional semantic areas. No fixture or damage entity exists. `SemanticArea` is an X/Z polygon with a label and provenance. | Fixtures and surface-attached damage require explicit new contracts. Reusing semantic areas would lose wall height, surface type, wall side and damage meaning. |
| `web/src/types.ts`, `web/src/core/validation.ts` | `measurementStatus` is `unverified`; validation rejects unknown fields and versions. | Preserve unverified measurement status. A harmless-looking extra field still requires a versioned migration and corresponding readers/writers. |
| `web/src/core/scene.ts` | `buildScene` makes actual holes for openings, floor faces for rooms, and only outline edges for semantic areas. Walls are planar surface meshes. `displayCeilings` emits a ceiling only when all room-boundary wall tops match. | Surface records must distinguish the two wall faces. Ceiling damage needs an authoritative ceiling contract, not guessed maximum/minimum wall height. Do not turn the semantic-area outline into a damage surface. |
| `web/src/ui/sceneBatches.ts` | Faces are grouped as floor or wall; every non-floor face uses wall color. Current material is unlit `MeshBasicMaterial`; material colors are blue-tinted. Ownership is retained per triangle for picking. | Ceiling color needs an explicit role. Retain batching and semantic ownership. Do not introduce expensive lighting merely to achieve three different grays. |
| `web/src/ui/ModelViewport.tsx` | Display ceilings are added separately from `buildScene`; floor and ceiling hits both become selection kind `room`. Opening hit targets are pick-only voids. Rendering is invalidation-driven; hidden/unchanged models schedule no work. | Surface picking must retain floor versus ceiling versus wall side. Damage cannot attach to whichever room face happens to share an ID. Inactive damage overlays must not intercept floor-tap walking. |
| `web/src/ui/ModelViewport.tsx` | Geometry/renderer setup is revision-derived. Selection colors can affect floor and ceiling sharing a room ID. Current 3D view is orbit/selection plus walk navigation, not a general 3D transform editor. | Drag previews must not save revisions on every pointer move or recreate a renderer every frame. Feature 1 should preserve role contrast when selected. Later editing must arbitrate object handles against orbit/walk explicitly. |
| `web/src/ui/PlanGeometry.tsx` | Plan drawing has room fills, semantic area outlines, walls, openings and nodes. It does not have damage layers, fixture projections or ceiling hatching. | Build a documented layer order and a bounded hit-testing path, rather than adding many incidental SVG fragments. |
| `web/src/core/editor.ts` | Edits are atomic expected-revision command batches. Split/join and restore create geometry ID mappings, including `requiresOverlayReview`. Current mappings contain IDs, not surface-side/coordinate transformations. | The master must approve attachment remapping rules before surface records are implemented. Preserve one drag as one command transaction and one undo step. |
| `web/src/data/store.ts`, `web/src/data/exports.ts` | Local drafts/history/frozen revisions have identity and hashes; exports derive from frozen revisions. | New entities must survive undo, redo, reopen and export from the exact frozen revision. No untracked view-state-only damage or object dimensions. |
| `web/src/data/glb.ts` | GLB uses separate blue transparent materials and scene roles. It calls `buildScene`, which does not currently include display ceilings. | A 3D UI recolor alone does not establish export consistency. Define canonical versus display ceiling export deliberately, then update material roles in GLB. |
| `web/src/data/drawing.ts` | Drawing polygons have no per-polygon material or hatch properties; SVG/PDF room fills are hardcoded. PNG comes from the SVG drawing path. | Share one presentation description for floor fills, ceiling patterns and damage lines across SVG/PDF/PNG; do not implement three independent damage geometries. |
| `contracts/COMPATIBILITY.md` | Original 1.0 contracts remain immutable. Readers reject unsupported versions. Publication transport is disabled and its limits are distinct from local exports. | Add a new explicit contract version. Do not silently broaden the OS/publication wire profile or assume a receiver accepts new records. |
| `web/src/library.ts`, `web/src/types.ts`, `web/src/ui/SpatialWorkspace.tsx` | OS embeds the same workspace through an authenticated scoped context; standalone has its own namespace. | New tools must work offline/standalone without requiring an OS account. OS adaptation must preserve authorized scope and the existing namespace. |
| `capacitor/README.md`, `capacitor/prepare.py` | Installed app bundles the `web/` build; prepare records packaged asset hashes. Native capture and file delivery use retained Swift source. | Browser deployment does not update an already installed Apple bundle. Package the exact new web assets and distinguish packaged/build-tested/device-tested status. |

Existing focused tests worth extending rather than duplicating: `web/tests/core/editor.test.ts`, `web/tests/core/scene.test.ts`, `web/tests/core/validation.test.ts`, `web/tests/ui/helpers.test.ts`, `web/tests/ui/warm-switch.spec.ts`, and the relevant persistence/import/export tests under `web/tests/data/`. No tests were rerun for this planning review.

## 2. Dependency order

1. Reconcile source and approve the narrow shared contracts: semantic surface identity; model/selection roles; one preview/commit gesture contract; versioned fixture and damage admission; attachment effects of host edits. Specify contracts now, implement only what the next slice needs.
2. Surface contrast can ship first after that source reconciliation. It provides immediate visible value and does not require persistent damage or fixture data.
3. Opening manipulation/types and authoritative ceiling-height editing must land before affected-area completion. Both can change damage hosts.
4. Fixtures and genuine cutouts follow. Ordinary furniture does not geometrically remove wall/floor damage; actual cutouts do. Structural cutout semantics must be settled before the affected-area host-edit acceptance gate.
5. Affected-area records, editing and consistent derivatives follow stable surfaces/openings/heights/cutouts.

If the broad fixture catalog would stall the priority damage workflow, the master can separate actual cutout/attachment support from catalog breadth. Do not claim fixtures are complete while requested families are missing. Only one feature chat writes at a time. Supporting agents inside that chat may read/review or own explicitly nonoverlapping files.

## 3. Feature 1: surface contrast

### Exact owner requirements

- Walls, floors and ceilings have distinct shades by surface category, not random colors per wall.
- Use extremely light gray walls, darker gray floors and a ceiling shade between them.
- Contrast must make small-screen walkthroughs understandable.
- Preserve smooth movement, current structure and ceiling visibility controls.

### Proposed defaults, not owner-specified values

Candidate tokens: wall `#F2F3F5`, floor `#B8BDC4`, ceiling `#D5D9DE`, architectural edge `#68717C`. These are a starting palette to validate in the existing renderer, not a claim that exact hex values were requested. Preserve the intended luminance order under selection. Keep the existing explicit fill-disabled view usable.

Place material role tokens in one dependency-light shared module chosen by the master. Both UI batching and GLB use those tokens; do not make the export layer import React. A new module path is a proposal, not a verified existing file. No texture downloads, dynamic shadows or new continuous animation loop are needed for this feature.

### Completion and focused verification

- Correct explicit wall/floor/ceiling roles in batching; adding later object/damage roles cannot fall through to wall by accident.
- Review one representative small-screen room from orbit and walkthrough with ceilings both visible and hidden, including a selected surface.
- Check material mappings in the UI and a generated GLB from the same revision. No broad topology or storage rerun is justified for a material-only change.
- Confirm idle frame scheduling and draw-call grouping are unchanged; use existing instrumentation.

## 4. Feature 4A: fixtures, objects and actual cutouts

### Exact requested catalog coverage

| Requested family | Required distinction |
| --- | --- |
| Toilets | Recognizable placed fixture with editable dimensions. |
| Appliances | Exact available types must be inventoried, not invented from memory. |
| Showers and baths | Walk-in shower; tub with shower; garden tub. |
| Sinks and vanities | Single/double sink; standalone/no cabinet; cabinet/vanity. |
| Built-in furniture | A supported actual object family, not only a label. |
| Chimneys/fireplaces | Recognizable objects; a solid fixture must not silently imply a structural void. |
| Kitchen islands | Editable floor-placed object. |
| Cabinets | Upper and lower families; upper mounting height is explicit. |
| Cutouts | Genuine removal of supported host geometry, not a white decal pretending to be a hole. Exact cutout host/type scope needs the master's decision. |

All requested objects can be placed quickly, resized in 2D and 3D, and render white with blue feature edges. The word "etc." should become an explicit bounded catalog checklist as source is inventoried, not an unlimited completeness claim.

### Proposed implementation contract

- A stable fixture ID, versioned catalog/type ID, dimensions in canonical meters, transform/orientation, mount/host relation when needed, and provenance belong in the saved model. Keep record geometry separate from renderer meshes.
- Parametric archetypes generate recognizable geometry from dimensions. Stretching one textured rectangle is not acceptable 3D support. Reject nonfinite/zero dimensions. Any dimensional limits need an explicit geometric reason, not hidden arbitrary ranges.
- A plan corner resize changes width/depth in the plan plane; 3D handles expose the relevant width/depth/height axes. Exact numeric entry remains available for precision and accessibility. Maintain the initial finger grab offset and one commit per completed gesture.
- Floor objects stay anchored to the floor elevation; upper cabinets retain explicit height and wall attachment. A floor move should not leave a toilet floating. A wall move should not silently detach a wall-mounted cabinet.
- Selection, move, rotate, resize, duplicate/delete if already supported, undo/redo and persistence must operate on the same entity. Do not let a camera drag resize an object.
- Batch or instance repeated archetypes while retaining semantic IDs. Render blue feature edges, not every triangle edge. Depth-test object outlines by default so hidden fixtures do not show through walls. Selected handles can use the existing deliberate overlay behavior.
- Furniture must not subtract affected-area geometry. It can occlude the view naturally; moving furniture must reveal the same retained damage behind it.
- The current walking model knows walls/portals, not object obstacles. The master must explicitly choose the fixture collision policy. Do not silently add collision that traps a previously valid walkthrough, and do not claim collision-aware furniture avoidance unless implemented. If solid-obstacle navigation is included, define recovery when an object overlaps the current camera position.

### Cutout boundary requiring an explicit decision

"Cutout" in the requested object list does not establish whether it means a wall through-opening, a shallow recess, a ceiling/floor void, or all of these. Do not assume these are equivalent. At minimum, the chosen cutout type must change the actual host mesh and derivative exports consistently. A hole must remain visually empty with a blue edge; filling it white would contradict the geometry.

Current source has real rectangular wall apertures but no floor/ceiling polygon-with-hole contract. A wall aperture can reuse the hole kernel after an approved semantic extension. It must not be reclassified as a traversable passage merely to avoid adding its proper type. Floor/ceiling holes, volumetric recesses and a multi-floor chimney shaft need separate scope and geometry decisions. Keep an unresolved cutout row open rather than substituting a cosmetic placeholder.

### Focused acceptance

- One representative per distinct parametric archetype, with a data-driven catalog coverage check. Do not duplicate every test for every display name sharing one kernel.
- Floor and wall-mounted placement, anisotropic resize and rotation persist through 2D/3D switching and reopen; one undo reverses a whole drag.
- A genuine cutout has missing host geometry in 3D, plan representation and exports, with no invented traversal permission.
- One case for host move/height edit and one invalid dimension case establishes attachment and atomic rejection.
- One populated scene assesses active drag responsiveness and idle work. Record real target-device status separately from desktop/synthetic results.

## 5. Feature 4B: affected-area moisture and fire mapping

### Exact owner requirements

- A user taps a wall, floor or ceiling, then a compact contextual menu offers `Affected area`.
- Its next menu has only the two initial choices, moisture and fire damage. A possible literal presentation is `Affected area` -> `Moisture` / `Fire damage`; do not add unrelated record categories.
- Users rapidly draw, move and reshape a general affected region on the selected physical surface.
- In 3D, moisture is translucent light blue and fire damage is translucent red.
- In 2D, affected wall length is an easily adjusted two-endpoint dark blue line; floor damage is a blue filled region; ceiling damage uses crosshatched lines in both directions forming a grid. Fire uses the same three encodings in red.
- Preserve physical dimensions/height across views, even though wall height is not visible directly in the plan.

The screenshots show a selected wall, a highlighted vertical affected region, drag handles and a wall elevation panel; one image includes an opening over the affected region. They illustrate interaction intent, not a source implementation or contractual calculation algorithm. The screenshots' single-direction hatching does not override the user's explicit request for a two-direction ceiling grid.

### Data and surface identity contract

Use a dedicated versioned affected-area record, separate from both `SemanticArea` and instrument moisture readings. A manually sketched extent does not establish a moisture value, material condition, cause, verified quantity or measured limit. Retain the document's unverified measurement status.

Required concepts, with exact field names owned by the master:

- Stable record ID, kind (`moisture` or `fire`), host surface reference, geometric footprint, provenance and review state.
- Surface reference includes floor ID; wall ID plus an explicit side, or room/surface ID plus `floor` versus `ceiling`.
- A wall footprint uses physical distance along the canonical wall path and physical vertical distance above its base. A room-side label is helpful UI context but is not a stable replacement for wall-side identity.
- Floor/ceiling footprints use a stable in-surface frame. Floor and ceiling cannot share one undifferentiated selection identity.
- Preserve record identity when geometry is split into multiple rendered pieces. Do not store a mesh/triangle index as the attachment.
- A wall path may be bent in this source. A footprint spanning a bend must follow the actual segments. Never draw a flat rectangle across interior space. If an operation cannot safely map the ray to the selected host, retain the draft and show a precise constraint instead of guessing coordinates.
- A zero-thickness wall can still have two semantic faces. Render the patch only on its recorded side; do not tint the opposite room. This does not require a speculative rewrite to thick walls.
- A ceiling must be defined by the accepted ceiling contract. Do not create one from an average, maximum or minimum of mismatched wall tops just to permit damage placement.

### Interaction contract

- Reuse shared frame-coalesced preview and snapping helpers where semantically valid. Pointer movement changes a transient preview; completion validates and commits once. Cancel/pointer loss/floor switch never saves a half-gesture as if complete.
- Rectangle tap-drag is the minimum fast path. Reuse existing polygon affordances if approved and already suitable; do not expand this into an unrelated drawing application.
- Selected region handles are screen-sized and touch-friendly without making visual dots enormous. Correct for finger grab offset, camera perspective and zoom.
- The active gesture owns the pointer until finish/cancel. A handle drag cannot orbit the camera; orbit cannot accidentally move a region. A second-finger gesture follows the shared gesture policy.
- In walkthrough, ordinary floor tapping continues to move the camera. The affected-area operation must be explicitly entered or performed in edit mode; do not make every walking tap open a recording menu.
- Unselected overlays do not consume pointer events needed for selection/navigation. Hit testing respects visibility, clipping, depth and wall side.
- Wall editing from 2D must retain its stored vertical interval. For a newly drawn wall segment, the height must be an explicit, visible tool default or user-set elevation range. Never silently invent a observed damage height from a plan line. The master must choose this initial-height UX before implementation; it can reuse a compact elevation inspector.
- Width/height/position numeric corrections should remain available without displacing the fast drag workflow.

### Proposed rendering defaults and layer order

- 3D candidates: moisture `#4FA9E8` at approximately 0.24 alpha; fire `#EB5757` at approximately 0.24 alpha. These are draft tokens for visual review, not prescribed values from the owner.
- The user's reduced-opacity direction is explicit for 3D. The requested opaque 2D floor region can use a light solid blue/red so labels remain readable. Do not erase its semantics by applying one blanket opacity to all views.
- 2D order: neutral room fill; affected floor fills; ceiling crosshatching; structural walls/openings; affected wall lines; fixture projections where appropriate; dimensions/labels; selected handles. Clip patterns to the true affected footprint and host domain.
- Display both wall sides distinctly when both contain records, using a small screen-space offset toward the corresponding side and clear selected labels. This is a display affordance, not invented wall thickness.
- Floor fill and ceiling grid remain distinguishable when they overlap in plan. A selected record identifies both surface and damage kind.
- Maintain a visible distinction between blue fixture outlines, selection feedback and blue moisture regions. Shape, pattern and contextual labels carry meaning as well as color.
- Apply controlled surface offset/depth settings to avoid z-fighting. A small render offset does not change stored geometry or quantities.

### Overlap, holes and host-change behavior

1. Different damage kinds on the same surface are independent records. Never overwrite moisture with fire or collapse them into an invented "mixed" condition. A proposed overlap display uses alternating blue/red strokes or another explicit two-kind pattern rather than unexplained purple from alpha blending.
2. Same-kind overlaps may be rendered/aggregated as a union while retaining separate source records for editing and undo. If quantities are displayed, same-kind overlaps cannot be double-counted; cross-kind totals must say whether they represent per-kind or physical union area. New quantity displays are not demanded by this request and must not claim verification.
3. Draw and export only the portion that belongs to the actual host surface. Door/window/cutout voids are not affected wall material. Clip against the canonical holes, not their 2D bounding boxes.
4. Preserve an authored footprint and the applicable host-domain evidence instead of destructively replacing the stored record every time clipping changes. Closing an old opening must not silently manufacture recorded damage on newly exposed material. This requires a documented policy for the footprint's prior hole/domain mask and `needsReview` after structural changes.
5. A higher wall or ceiling must not automatically increase recorded damage. Preserve physical coordinates, not normalized percentages. A shorter host may yield a clipped display and `needsReview` while retaining recoverable authored geometry; it must not silently erase it.
6. Surface translation/rotation should retain the corresponding attachment using the command's explicit transform. Floor elevation moves its attachments consistently. A ceiling-bound patch follows the ceiling correction without changing its in-surface size; a wall patch retains its measured vertical interval relative to its defined base.
7. Wall reversal, split/join, room split/merge and boundary changes need exact remapping when unambiguous. Preserve the proper wall side and physical location. Use existing ID lineage plus an approved surface transform/remapping result. An ID list alone is insufficient.
8. Where remapping is ambiguous, retain the record and mark it for explicit reattachment/review. Do not attach it to the nearest wall or delete it. Host deletion must identify dependent records as part of the existing coherent transaction behavior; undo restores host and records together.
9. A fixture's presence never subtracts recorded damage. Its mesh may occlude the view but does not alter the host's semantic area.

### Minimal, high-value acceptance set

- One geometry table exercises wall side, floor and ceiling; concave boundary; real hole subtraction; same-kind overlap; moisture/fire co-existence. Colors can be parameterized over the same geometry kernel instead of running identical full workflows twice.
- One host-edit table covers height growth, shrink, reversed wall/split/join and opening move/remove. Expected physical coordinates and retained records are exact. Choose small analytical examples for clipping, not screenshot-pixel guesses.
- One end-to-end golden workflow creates a wall region in 3D, adjusts length in plan without changing height, exercises cancel and undo/redo, saves/reopens and exports from one frozen revision. Include floor/ceiling distinction in that same scenario.
- Verify SVG/PDF/PNG through their shared drawing representation; perform a representative rendered artifact check rather than separate duplicated geometry tests for each format. Verify GLB/scene role and material consistency plus authoritative geometry retention.
- A focused pointer/navigation test establishes that inactive overlays do not steal floor-tap walking, resize does not orbit and a rapid pointer burst schedules at most one pending frame while terminal coordinates remain exact.
- One representative combined scene checks wall contrast, fixture edges, overlapping damage and ceiling hatching together. Record tested platform/device and untested boundaries. Do not convert desktop timings into an iPhone claim.

## 6. Cross-platform delivery and integration contract

Every feature receipt should have separate fields for:

1. Source implementation commit and changed paths.
2. Source build/focused validation evidence with hashes and why each check was necessary.
3. Exact transferred Lovable source/hash and protected-host-file reconciliation.
4. Public web deployment verification, if deployed.
5. Capacitor preparation/asset manifest and Apple build/device evidence, if available.
6. OS embedding/adapter compatibility and receiver version support, without assuming automatic transport access.
7. Export/import contract versions, migration behavior, unsupported older-reader behavior and rollback/recovery notes.

"Implemented across the board" must mean a single maintained implementation plus verified delivery through each host, not matching independent rewrites. A prepared Apple bundle is not an installed, tested application. An older client must reject an unsupported new document intact rather than silently strip fixtures or damage and save it back.

The OS's authorized project/profile context remains external to the spatial domain model. Standalone users retain full local editing and transfer artifacts. Do not introduce new Supabase dependencies or enable publication just for these tools. Preserve source IDs, document ID, revision and hash in transferable packages. Raw scans and signing credentials do not belong in the development ZIP.

## 7. Decisions the master must freeze, with no inferred source claims

- Approved exact material/selection palette after the small visual review.
- Fixture catalog inventory, including actual companion door/window types provided by a separate source review. No fixture catalog was found in this shared workspace.
- Meaning and host scope of the first cutout feature, including traversal policy.
- Authoritative ceiling identity/height contract for unequal-height room boundaries.
- Initial height UX when a new affected-wall segment originates in 2D.
- Mixed-damage overlap rendering and whether any quantity readout is in this release.
- Attachment policy for host shortening, replacement, reversal and split/merge; explicit recovery when unmappable.
- Whether fixtures affect walk navigation, and how that preserves smooth movement.
- Exact new schema/scene/profile versions and the authorized OS receiver's supported capabilities.

These decisions can be made as labeled product/engineering defaults by the master within the owner's scope. They must not be reported as features already present or user-approved exact details. If a choice materially changes the meaning of recorded evidence or the requested geometry, isolate that row for clarification while continuing independent work.

## 8. Suggested feature-chat instructions

### Surface contrast chat

Read the current master state and your active task ticket, then `AGENTS.md`, `RESUME.md`, `web/IMPLEMENTATION_CONTRACT.md`. Read only `sceneBatches.ts`, relevant `ModelViewport.tsx` material/selection code, `core/scene.ts` ceiling derivation, `data/glb.ts` and the selected acceptance rows. Implement role-based grays through shared tokens; preserve batching, event-driven rendering and actual voids. Do not change document geometry, navigation, ceiling interpretation or native authoring architecture. Include the exact browser/installed/export delivery status in your receipt. Stop after this feature is integrated and the minimal acceptance rows pass.

### Fixtures/cutouts chat

Start from the master's current accepted commit, not the frozen source archive. Read the approved schema/surface/gesture contracts and verified catalog inventory. Implement the complete bounded catalog checklist, saved parametric entities, fast placement and 2D/3D resize using the existing command/store pipeline. Distinguish solid fixtures from genuine cutouts. Preserve attachment behavior, offline access, frozen exports and current camera movement. Update only your assigned paths; submit lead-owned type/contract changes for the active master's integration. Never claim a fake rectangle is a working appliance or a white face is a hole. Return evidence by acceptance row, changed paths and exact delivery hashes.

### Affected-area chat

Start only after the master accepts surface identity, opening behavior, ceiling authority and cutout attachment rules. Read the exact owner requirements and this feature's source/read list. Implement moisture/fire records separate from semantic areas, with surface-local geometry and explicit wall sides. Add the two-choice contextual flow, fluid preview/commit manipulation, correct three-way 2D encoding and translucent 3D display. Preserve record identity and original extent through host edits; never fabricate damage height, spread damage onto new material, infer instrument readings or mark quantities verified. Reuse shared render/export geometry and gesture machinery. Prove the geometry/host-change table and one golden cross-view workflow, then stop. Return every pending platform limitation honestly instead of declaring complete from a web preview alone.
