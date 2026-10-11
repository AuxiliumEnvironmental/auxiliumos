# Shared implementation contract for F00 acceptance

This document separates verified invariants from proposed engineering decisions. F00 preparation proposes revision 2 in `DECISIONS.json`; only the master may mark it accepted before dependent implementation. It is not a new geometry schema and must not be copied into code as unreviewed fields.

## Verified invariants to retain

- Canonical coordinates are meters, right-handed, Y-up; plan is X/Z. Walls use full polyline arclength, floor elevation, wall baseY and height. Preserve doubles and format/round only at presentation boundaries.
- Current old document schemas are strict 1.0/1.1. New fields require explicit supported-version admission and migration, not weakened unknown-field validation.
- Shared commands validate a transaction; store commits expected revision and owns save/undo/reopen. Viewports must not write storage directly. Preserve pending-save recovery, authority fencing and exact frozen revision exports.
- Bent-host openings and raised legacy apertures are real supported data. Their rendering and traversal capabilities differ; do not flatten or silently remove them.
- Retained Swift capture returns older compatible geometry through a versioned bridge. New web features must accept that input intentionally without treating every Swift reference exporter as a second editor.

## Gesture contract

One owner per gesture: handle resize, opening-edge translation, object movement, surface drawing, or camera navigation. Selection reveals handles; selected visible handles outrank edges, then bodies, then underlying geometry. Hit targets remain touch-sized in screen space. Preserve the finger grab offset.

Use the original model snapshot and stable local plane/chart for each preview. Keep continuous coordinates and existing snap release/override behavior. Handle overlap, near-parallel rays, camera movement, second touch, pointer cancel, blur/background, selection/tool change, authority loss and stale geometry deliberately. Cancel means no durable edit. A completed drag is one command batch/revision/undo item; structure edits undo atomically.

Walkthrough stays navigation-only unless explicitly entering edit mode. Empty-space orbit/pinch/pan must remain available. Exact numeric controls use the same commands as drag and provide an accessible alternative. Preserve mobile safe areas, large text and the current map-first layout.

Frame-coalesce previews; no persistence, network calls, whole-scene topology rebuild, export or new renderer instance on each pointer move. Commit expensive derived work once, fence asynchronous results by revision, and preserve view memory. No perpetual idle render loop, per-face material explosion or unbounded retained caches.

## Surface and attachment contract

Introduce only the representations needed by the active feature. F00 approves the shared design; each feature implements its own schema delta when consumed. Do not front-load empty fixture/damage infrastructure.

Surface identity must distinguish wall ID and physical side, floor face and authored ceiling face. Render triangle indices and undifferentiated room IDs are not durable hosts. Use wall arclength plus height relative to the wall base; use an explicit stable local frame for horizontal surfaces. Zero-thickness walls still have distinct sides; no wall-thickness rewrite is required just to tint one side.

Host edits must return meaningful attachment remapping, including side/orientation/coordinate transforms where required. IDs alone are insufficient. Exact remaps preserve physical geometry; ambiguous split/join/delete cases retain recoverable data and require review/reattachment. No nearest-surface guessing, silent dropping or percent-based stretch of recorded affected areas.

F03 must create explicit room-ceiling intent with provenance and stable identity, preserve old unequal-height captures, and keep room-only edits independent of a neighbor sharing a wall. The wall-span/enclosure policy must be frozen before coding. Floors in separate horizontal frames must not be presumed aligned. Structural edit outcomes, selection, scene, clipping, exports and navigation must consume the same accepted revision.

## Proposed defaults, to be ratified in F00

| Decision | Proposed default | Boundary |
|---|---|---|
| Neutral materials | walls #F2F3F5; floors #B8BDC4; ceilings #D5D9DE | Visual starting values, not owner-specified hex codes |
| Opening resize | opposite-corner anchoring, free aspect ratio, no inversion; explicit type/bottom policy | Reuse valid raised legacy apertures; never silently reinterpret a bottom-corner drag |
| Door flips | horizontal changes hinge/end; vertical reverses facing/swing in wall-local frame | Catalog capabilities determine meaningful action; never camera-relative negative scale |
| Structure height drag | explicit selected room set, common delta preserves differences | Absolute assignment separately labeled; no automatic floor movement |
| Fixtures | parametric diagrammatic geometry; white faces/blue feature edges | Proposed floor fixtures initially do not alter walk collision; do not claim obstacle avoidance |
| Damage overlap | separate moisture/fire records; readable dual marks in overlaps | No unexplained purple/mixed diagnosis; retain independent records |
| Damage size after host change | retain authored physical footprint, clip derived display, mark changed host for review | Removing a hole must not fabricate new recorded damage |
| 2D new wall damage | show an explicit editable vertical range in a compact elevation control | Never infer a measured height from a plan line |
| Damage totals | omit new totals unless deliberately accepted; if included, geometric/unverified and overlap-aware | Screenshots are not a mandate for verified quantities |

Open product question before F04: does “cutouts” include wall openings, recesses, room-boundary notches, floor/ceiling voids, or all? Default recommendation is genuine wall through-cutouts first; retain other interpretations as open scope, not silently complete. The master may gather this one targeted clarification while earlier features progress. Do not invent volumetric recess depth in a zero-thickness model.

## Persistence, output and security

Use explicit, versioned records for opening subtype/orientation, authored ceiling, fixture, and affected area as each feature arrives. Store geometry/provenance, not just renderer state. Old documents migrate without fabricated measurements or captured subtype. New data survives undo/reopen/backup/export/import. Unsupported readers reject intact or open an explicit read-only supported projection; they must not strip fields and overwrite the file.

Define export support by profile. Native geometry-only readers may not support later objects/overlays; that limitation cannot be hidden. Shared SVG/PDF/PNG primitives and scene/GLB output must derive from the frozen revision and preserve agreed material/surface meanings. Capture input adapters may remain old-version producers while new authoring export encoders evolve.

Affected-area sketches are user-recorded observations, separate from numeric moisture readings, scientific conclusions, verified quantity, estimate or scope authorization. Keep measurement status unverified. Cosmetic fixtures never erase evidence. Only actual host cutouts change visible material; historical observation coverage remains recoverable.

No new business database, access expansion or live publication is implied. OS accepts an immutable revision through its scoped adapter and separately owns audience/release. Standalone remains functional without that receiver. Versioned capability negotiation and one maintained source support future updates without speculative plugins.

## F00 concrete rules: revision 2 proposal, awaiting master acceptance

Inspected program/source snapshot: `141a4cd756751c437e4ecdde07a1db9703588687`.
The following are engineering proposals, not implemented behavior or master approval.
Names below fix semantics for review; only introduce fields when their feature consumes them.
No shared-code prerequisite is needed for F01.

### Verified reuse points and limits

| Concern | Inspected implementation | Consequence |
|---|---|---|
| Saved graph | `source:web/src/types.ts`, `core/validation.ts` | Strict geometry 1.0.0/1.1.0. Room has no ceiling; no fixture/damage entities. |
| Surface geometry | `core/scene.ts::buildScene`, `displayCeilings` | Actual wall aperture triangles; only uniform wall tops produce display ceilings. `buildScene` excludes those ceilings. |
| Ownership/materials | `ui/sceneBatches.ts`, `ModelViewport.tsx` | Per-triangle object ownership exists. Non-floor faces fall into wall batches; floor/ceiling clicks become the same room selection. No 3D edit callback. |
| Opening gestures | `ui/openingManipulation.ts`, `FloorplanCanvas.tsx` | Full path arclength, grab offset, branch continuity, 44px targets and ordered samples already exist. Reuse them. |
| Save boundary | `SpatialWorkspace.commitEdit`, `core/editor.ts::applyCommands`, `data/store.ts` | One validated batch, expected revision, one stored undo snapshot; failed save retains a pending preview. Undo/redo restore content as a new monotonically increasing revision. |
| Host changes | `core/editor.ts::splitWall`, `joinWalls`, `restorationMappings` | Existing mappings contain IDs and a review flag, not attachment coordinate transforms. Split through an aperture already rejects. |
| Output/admission | `data/exports.ts`, `imports.ts`, `glb.ts`, `drawing.ts` | Exports use a frozen revision; imports compare scene to regenerated geometry. Local-document profiles include 1.0.0 and source-provenance 1.1.0. Old native compatibility prose alone is incomplete for current web profiles. |

### D01: presentation consumed by F01

Use one dependency-light module at `source:web/src/surfacePalette.ts`. It owns explicit structural roles `wall`, `floor`, `ceiling`, sRGB tokens and the conversion needed for export; no React, DOM or new package dependency. Do not add unused fixture/damage roles yet. An unknown face role must be explicitly unsupported, never silently colored as wall.

Rename the current `ModelViewport` control label from "Light blue fills" to "Surface fills" in the same presentation change. Retain the toggle's behavior and any other color labels that still describe distinct semantic marks accurately.

Proposed normal tokens remain wall `#F2F3F5`, ceiling `#D5D9DE`, floor `#B8BDC4`, structural edge `#68717C`. For selected fills, apply the same modest darkening factor (starting at 0.92 in linear RGB) to each category; retain blue selection outlines/handles. This preserves wall > ceiling > floor luminance, including when the legacy room selection highlights both floor and ceiling. Exact visual values remain a focused F01 review result. Fill-disabled mode keeps its existing white-body/selection affordance contract and is exempt from the normal-fill contrast requirement.

Keep the current unlit batched viewport. Encode GLB structural faces as opaque neutral colors using linear RGB baseColorFactor values with alpha 1, metallicFactor 0 and roughnessFactor 1. Do not add lighting, textures or unlit extensions in F01. A viewer's lighting can alter apparent brightness; material-role equivalence is the acceptance claim. Keep semantic opening/window/inferred edge meanings. Shared scene JSON remains geometry/roles, not a new material schema. Plan SVG/PDF/PNG appearance is unchanged by this 3D feature. GLB still contains only the authoritative faces emitted by `buildScene`; do not export invented ceilings.

Color-space references: [Three Color](https://threejs.org/docs/pages/Color.html) describes CSS/hex input conversion to its linear working space; [glTF material definition](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#materials) defines base-color factors. F01 checks the pinned runtime and one exported material, not a broad exporter rewrite.

### D06: stable surface references and coordinates, first consumed by F02/F03

| Surface reference (within its document) | Canonical chart | Notes |
|---|---|---|
| `{floorID, kind: wall, wallID, side: positive or negative}` | `u` = meters along ordered `wall.nodeIDs`; `v` = meters above wall base. World Y = floor.elevation + wall.baseY + v. | For unit tangent `(tx,0,tz)`, positive normal is `(-tz,0,tx)`. Opposite side negates it. Not camera-left or room-boundary winding. |
| `{floorID, kind: floor, roomID}` | `u=x`, `v=z` in that floor's existing frame; origin `(0,0)`, axes +X/+Z, plane Y = floor.elevation. | Domain is the explicit room polygon, not the entire level. |
| `{floorID, kind: ceiling, roomID, ceilingID}` | Same floor X/Z chart; plane Y = floor.elevation + ceiling.height. | Stable authored/inferred ceiling record introduced in F03. Display-only legacy ceilings cannot host saved records before then. |

Do not duplicate a changeable centroid/bounding-box origin in saved horizontal attachments. Floors remain independent frames; matching coordinates do not align levels. Wall charts follow every segment of a bent host. At an exact path vertex use the outgoing segment, except at the final endpoint; the active gesture retains segment continuity to prevent branch jumps.

Extend existing `Selection` additively with a surface discriminator when a feature needs it; keep object selection and group editing intact. An opening remains an opening selection. Pick results may carry hit point, segment and revision transiently; neither mesh UUID nor triangle index is a persistent host. F01 retains existing ownership and defers this selection extension.

### D07: begin, preview, commit and cancel

Begin records immutable geometry, document/floor IDs, source revision, workspace generation/authority, selected target, pointer ID, grab offset, chart and camera basis. Ownership order is displayed selected handle, selected edge, selected body, then other visible geometry; ambiguous overlapping handles get separated screen-space targets or an explicit choice. Occluded/cut-away handles cannot capture through walls. Selection alone never edits. Walk mode only navigates; enter edit mode before showing active manipulators. Empty-space orbit/pinch/pan remains available.

Preview applies deltas to that initial snapshot. Reuse ordered arclength samples for bent hosts while publishing at most once per animation frame. For 3D openings use intersections with actual host-segment vertical planes, mapped into the continuous `(u,v)` chart; advance only to contiguous segments consistent with prior travel. Never use a chord through the bend. For a vertical ceiling drag freeze a camera-facing vertical plane containing the grab point and world Y axis. At a near-parallel ray, invalid intersection, or camera-basis change, hold the last valid preview and offer exact numeric entry; do not divide by a near-zero denominator or jump planes mid-drag.

Disable OrbitControls for an owned editing drag. A second touch cancels its edit preview before handing a fresh two-touch gesture to navigation. Cancel also covers Escape, pointercancel/lost capture, blur/background, view/tool/selection/scope/size change, authority loss and changed source revision. Clear queued frames and fence abandoned contacts until released. Re-entry requires a new pointerdown.

Release processes pending samples and the exact terminal coordinates, then submits one validated command batch via `SpatialWorkspace.commitEdit` with the captured expected revision/context. Its current signature does not accept a drag's base revision; F02 must add the smallest fence before delegation so a stale gesture cannot be applied to a newer stored revision. Revalidate authority before durable save. A no-op, invalid candidate or pre-submit cancellation submits nothing. After submission, preserve the existing pending-save/retry/conflict handling; do not pretend pointer cancellation can undo an already issued transaction. Undo after a successful drag restores the whole batch as a new revision. No view writes IndexedDB or maintains separate undo history.

Update only affected preview geometry; no storage, network, export, full topology rebuild or renderer construction on pointermove. Rebuild committed scene/navigation once from the accepted revision, retain camera memory, and use existing renderer diagnostics. Do not create a generic gesture framework ahead of F02's first concrete use.

### D02: openings and persisted orientation, consumed by F02

Preserve `kind` (door/window/passage), physical offset/width/bottom/height and provenance. Add an optional catalog style and only the applicable orientation dimensions: `end` = start/end along increasing u, `side` = positive/negative wall normal. Omitted values on legacy generic apertures mean unspecified; migration must not invent hinges or captured subtypes. Selecting a style records an edited author choice. Companion `defaultHeight` is symbol extent, never physical aperture height.

| Preset | Horizontal flip | Vertical flip | Diagrammatic behavior |
|---|---|---|---|
| door_single | Swap hinge end | Reverse swing side | Single leaf |
| door_double | Not applicable for symmetric leaves | Reverse swing side | Paired leaves; do not invent an active-leaf field |
| door_sliding | Swap leading/stack end | Not applicable for symmetric track | Sliding panels |
| door_pocket | Swap pocket end | Not applicable | Pocket direction; no claimed wall cavity |
| door_bifold | Swap stack end | Reverse fold side | Folding panels |
| doorway_open | Not applicable | Not applicable | Passage/frame |
| window | Not applicable for generic window | Not applicable | Window/frame; never a walk portal |

Nonapplicable flip controls explain why they have no effect. Generic doors first require an explicit style choice. A path reversal maps aperture `[u,u+w]` to `[L-u-w,L-u]`, swaps orientation end AND side to preserve its world appearance. Joins add the appropriate arclength translation; splits subtract it for the new host. These coordinate remaps are not user flip actions.

Corner resize fixes the diagonally opposite `(u,v)` corner, permits independent width/height and rejects inversion. Edge drag translates along u only, preserving bottom, height and width; no automatic rehosting. Top corners retain bottom; bottom corners adjust bottom and height while holding the top. Bottom is wall-relative: expose it in elevation/numeric controls. For doors/passages, changing bottom shows the resulting floor-relative threshold `wall.baseY + bottom`; raised legacy apertures stay valid, with traversal decided separately. A new door/passage may start at the floor only when nonnegative `bottom=-wall.baseY` fits the host; otherwise retain a visibly raised starter or reject placement, never move the wall to fake a floor-level opening. Windows keep explicit sill height. No automatic snapping of a raised existing opening to zero.

Preserve generic apertures and direct chart manipulation across bent walls. Rigid styled leaves/panels require the aperture interval to lie on one straight/collinear run. Reject a style placement or edit that would bend rigid geometry; leave the saved record intact and permit an explicit change back to generic. Do not straighten the host or replace a bent aperture with a chord. Existing navigation restrictions remain: window/inferred/raised/too-narrow/bend-spanning/ambiguous connections are not unlocked by a style or flip.

### D03: ceiling intent and shared-wall envelope, consumed by F03

Proposal: add explicit `Room.ceiling` in F03's new schema, either null (no established planar ceiling) or `{id, height, heightBasis, provenance}`. Height is clearance above that floor, not wall base or world elevation. One stable ID per ceiling survives height edits; a split/merge must give an explicit identity/remapping result. Migration resolves a uniform legacy wall-top plane once as **inferred**, with assumed height basis and its wall source IDs; unequal tops yield null. It does not label wall captures as captured ceiling measurements or normalize unequal walls. The original input and pre-migration revision remain recoverable. No ceiling record is written by F01.

Room-height edits change only the selected ceiling intent and necessary boundary envelope in one command. Preserve every nonselected room's resolved ceiling intent before changing any shared wall. A legacy null ceiling stays null, including if later wall edits happen to align its tops. A selected null ceiling requires an explicit numeric starting height before dragging; do not seed a guessed measured ceiling.

Room topology has explicit ceiling outcomes. Splitting a room with a ceiling retains that ceiling ID on the retained room and allocates a new ceiling ID for the new room, carrying the same height/basis and source lineage; its domain divides with the actual resulting room polygons. Splitting a null ceiling produces two null ceilings. Merging two established ceilings at the same elevation within EPSILON retains the first room/ceiling IDs and exactly remaps the second domain; merge provenance conservatively and retain both source lineages. Two null ceilings merge to null. Different heights, or one null and one established ceiling, reject unless the same explicit transaction supplies the resulting authored height. Never silently keep the first room's height. Revalidate openings, mounted fixtures and affected-area remaps for the entire resulting domain; undo restores both original room/ceiling identities. Existing splitRoom/mergeRooms helpers must be extended in F03 because their current field-copy behavior does not implement these rules.

Walls retain one constant structural span per polyline. For each affected boundary, proposed `newTop = max(oldTop, highest authored/inferred ceiling top among incident rooms in the resulting document)`, then `newHeight = newTop - floor.elevation - wall.baseY`. Only walls that must extend change height/basis/provenance. Lowering a ceiling does **not** shrink a structural wall: a lowered ceiling can sit below a taller partition. This is ceiling-clearance editing, not an undocumented wall-demolition command. The preview indicates necessary wall extensions; all changes undo together. Neighbor ceiling height, footprint, floor/base elevation and openings remain unchanged. Existing unequal spans survive migration and are changed only by explicit selected-room correction requiring extension. No per-side wall-height schema or wall-thickness rewrite is required.

Reject atomically if the proposed ceiling would cut any boundary opening (`wall.baseY + opening.bottom + opening.height > ceiling.height`, within the existing tolerance), exceed established bounds, or conflict with a fixture's accepted mount/extent. Never resize/delete the opening or fixture. Clippable observation regions instead retain their authored extent and gain host-change review under D05/D08. Navigation uses the same resolved ceiling intent for modeled display-head clearance, while preserving legacy unknown-height behavior without inventing clearance. Retain current floor-level portal and wall-base checks; a higher ceiling does not grant new portal authority.

Structure dragging names an explicit room set and applies one common delta to their established heights, preserving differences and floor elevations. If any selected room has null height, block that drag and identify it for numeric initialization; do not silently omit it. A separate absolute assignment may initialize all explicitly selected rooms. Invalid members reject the entire batch. No inter-floor movement, frame alignment, sloped-ceiling reconstruction or stair inference is implied.

### D04/D08: fixtures and attachment outcomes, consumed by F04/F05

Fixtures use stable ID, versioned catalog style, finite positive width/depth/height, placement/mount transform and provenance. Floor objects use their floor frame plus yaw and base offset; wall-mounted objects use surface side, u, v and explicit outward depth. Exact dimensions and handle drags issue the same commands. Reuse archetypes and batched/instanced feature edges. Do not use SemanticArea or nonuniform mesh scale as the saved fixture record. White solids/blue feature edges remain diagrammatic and initially nonblocking for walk navigation; do not claim obstacle avoidance. All explicitly requested families in F04 remain required. Unnamed appliance variants remain provisional catalog choices, not a discovered complete source catalog.

Extend the existing edit receipt only as needed by its first attachment consumer: source/result revisions, old/new surface refs, retained source-domain intervals, coordinate transform, and outcome `exact`, `clipped_needs_review`, or `unresolved`. Keep old ID mappings for current consumers. Compose transforms across a batch and regenerate coherent remaps for undo/redo; IDs alone never authorize reattachment.

| Host operation | Required attachment rule |
|---|---|
| Pure translation/rotation; floor elevation | Transform the surface anchor/frame explicitly, retain physical dimensions. |
| Wall reversal | `u'=L-u`, swap side; opening interval/orientation follow D02. |
| Split/join | Split or translate charts on exact source intervals, preserving record lineage; a region crossing a split may have linked pieces. Rigid fixtures cannot be cut into pieces. |
| Ceiling elevation | Ceiling-bound region follows the plane, footprint unchanged; floor fixtures remain floor-bound. |
| Shortened wall, changed hole/domain | Retain authored observation footprint and prior support mask; clip current display and flag review. Never stretch percentages or fill newly created material. |
| Nonrigid boundary edit, ambiguous topology, host deletion | Retain observation geometry/reference snapshot as unresolved for explicit reattachment; do not guess nearest surface. For a fixture without a defined valid remap, reject the structural transaction until an explicit move/delete resolution is included. |

### D05: affected-area meaning, consumed by F05

Store independent moisture/fire records with ID, surface reference, physical chart geometry, authoring provenance, source host revision/domain support and review status. Do not infer meter readings, scientific diagnosis, quantities or commercial scope. New plan wall areas require an explicitly visible/confirmed vertical range in the compact elevation control; plan-length changes retain that range. Floor is light fill; ceiling is clipped grid; wall is a side-specific line/face. Separate blue/red marks preserve both kinds in an overlap. No new quantity totals are proposed.

Clip against current true host material AND the recorded support mask. Removed/moved holes or enlarged surfaces never enlarge old observations without an explicit new recording. Ordinary furniture can occlude the view but never subtract the evidence footprint. A missing/null ceiling cannot silently receive a ceiling record. Real cutout geometry and its domains depend on Q01; F01-F03 do not wait for that answer.

### D09: feature-local schema evolution and delivery

F01 changes no geometry/scene/profile version. Proposed next geometry versions are 1.2.0 for F02 opening style/orientation, 1.3.0 for F03 ceiling intent, 1.4.0 for F04 fixtures/agreed cutouts and 1.5.0 for F05 observations, subject to a fresh collision check at each activation. These are reservations for review, not admitted formats today. Keep original schemas immutable; add a new strict schema and version dispatch only when consumed. Upgrade a mutable draft explicitly with the first feature edit, preserving IDs, old snapshots and source provenance; never rewrite a frozen revision on open.

Scene/profile versions change only when their admitted vocabulary changes. In particular, styled opening/fixture faces and authored ceilings require coordinated scene admission and import comparison changes, not just new strings in today's permissive TypeScript SceneFace.role. Update resource preflight and bounded-work limits with each new emitter. Preserve old fixtures/readers deliberately. Capability checks must reject unsupported transfers intact; a geometry-only projection is allowed only as an explicitly labeled derivative, never as a writable downgrade or full backup. Keep the disabled v1 publisher disabled; do not widen its four-file wire contract implicitly.

The installed shared workspace receives these web changes through actual regenerated bundled assets. `AuxiliumCapture`/`AuxiliumFiles` remain v1 bridges and retain originals. Old Swift capture input is admitted intentionally; the legacy Swift authoring target need not acquire duplicate features. Web IndexedDB records, history hashes, source-provenance packages, SVG/PDF/PNG primitives, scene/GLB and local import must each be covered when their data changes. No database, new origin, shared-account permission, service-worker takeover or OS publisher change is part of these features.

### Open product questions and master gate

Q01 remains unresolved: wall through-openings, recesses, boundary notches, floor/ceiling voids, or more than one? The wall-through-opening recommendation is not accepted scope. Resolve it before F04's cutout implementation; no blocker for F01-F03. F04 also finalizes a bounded variant checklist for unnamed appliance/built-in examples without dropping named families. No product clarification is needed to begin F01 after master contract acceptance and activation. This preparation grants no lease and records no accepted decision on the master's behalf.
