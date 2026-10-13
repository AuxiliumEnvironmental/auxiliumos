# F02: Openings, direct manipulation and door orientation

**October 11 owner override:** Development is authorized concurrently on the exact isolated branch in ACTIVE_TASKS.json. Earlier statements below requiring predecessor completion apply to integration acceptance, not starting this branch. Read PARALLEL_DEVELOPMENT.md and preserve all predecessor behavior when the master composes the result.

## Prompt for the feature chat

You implement F02 only when the Astra master activates it after F00 shared contracts and F01 surface presentation are accepted. Follow the master’s shared operating policy and current task assignment. This packet describes requested work, not an implementation already completed. `source:` resolves to `spatial-source/` in GitHub or `Auxilium_Spatial_Developer_Package/` in the archive. Reconcile newer source before editing.

Deliver consistent opening behavior in the one maintained React/TypeScript workspace used by browser, Lovable hosting, OS embedding and Capacitor. Do not build a second Swift editing UI. Preserve native capture compatibility and record actual packaged-app evidence separately.

## Required result

The user can select doors, windows and passages and resize them accurately in 2D and 3D. In 3D editing, tapping an opening edge or corner reveals its corner handles. Only dragging a displayed corner handle resizes. Dragging an edge moves the entire opening along its existing wall without changing width, height or bottom elevation. Walkthrough never edits.

Retain plan-view width handles and body movement. Add a compact wall-elevation interaction within the existing Details flow for height/bottom manipulation in 2D; top-down symbol depth must not masquerade as physical height. Provide exact dimension entry using the same commands as dragging. Preserve grab offset, the approved resize anchor, precision, accessible targets and unambiguous camera/edit ownership.

Selected and newly placed doors expose **Flip horizontally** and **Flip vertically**. Use F00’s persisted wall-local orientation semantics: horizontal swaps the hinge/end, vertical reverses facing/swing. Do not mirror arbitrary scene coordinates or make the meaning camera-dependent. Type-specific nonapplicable actions must be clear rather than corrupt geometry.

Integrate these verified companion presets:

| Preset ID | Label |
|---|---|
| `door_single` | Single swing door |
| `door_double` | Double swing door |
| `door_sliding` | Sliding door |
| `door_pocket` | Pocket door |
| `door_bifold` | Bifold door |
| `doorway_open` | Open doorway |
| `window` | Window |

The companion’s `defaultHeight` is the 2D symbol extent, **not physical opening height**. Read the master-supplied `presets.ts` reference and its manifest. Implement appropriate symbols and diagrammatic 3D frames/leaves/panels within real wall apertures. Keep passage/window navigation semantics. Legacy generic captured openings retain their geometry and uncertainty; do not invent captured hinges, subtype or verified dimensions.

## Existing foundation and gaps

At the reviewed baseline, `openingManipulation.ts` already handles move/start/end, complete polyline arclength, grab offsets, branch-jump protection, overlap guards and separate 44px targets. `FloorplanCanvas.tsx` already owns touch selection, cancellation and one-command release. Extend these foundations.

`Opening` currently has only kind, offset, width, bottom, height, host and provenance. `Inspector` provides 0.05m nudges. `ModelViewport` selects openings but has no edit callback. `PlanGeometry` has a generic door arc. F00 must supply the versioned subtype/orientation and manipulation contracts; strict 1.0/1.1 admission cannot accept ad hoc fields.

## Targeted reads and candidate files

Read `source:AGENTS.md`, `source:RESUME.md`, `source:web/IMPLEMENTATION_CONTRACT.md`, the current master record and F00/F01 outputs. Then read:

- `source:web/src/ui/openingManipulation.ts`, `openingPlacement.ts`, `FloorplanCanvas.tsx`, `Inspector.tsx`, `PlanGeometry.tsx`, `ModelViewport.tsx`, and `SpatialWorkspace.tsx` commit/authority sections.
- `source:web/src/core/editor.ts` opening/split/join paths; `geometry.ts`, `validation.ts`, `scene.ts`, and `navigation.ts` relevant sections.
- Approved `source:web/src/types.ts`, `source:contracts/COMPATIBILITY.md`, evolved schemas and companion reference.

Candidate edit ownership is those UI/core files and focused tests. Include `source:web/src/data/drawing.ts`, `exports.ts`, `glb.ts`, `imports.ts` when the new representation crosses export/import boundaries. Request a master contract adjustment rather than silently changing F00. Installed packaging follows `source:capacitor/README.md`; do not edit legacy native authoring.

## Implementation sequence

1. Confirm contracts and type capability mapping. Preserve meters/Y-up, floor elevation and wall-base relationships. Define floor/threshold behavior from the approved type policy; raised legacy doors are currently valid geometry even when nontraversable.
2. Extend canonical commands, admission and semantic rendering. Preserve genuine aperture cutouts, identity, provenance, old document behavior, and orientation through reversed wall joins/splits. Existing bend-spanning apertures must not be flattened or lost; implement the approved bent-host policy.
3. Wire 2D elevation/numeric controls and 3D corner/edge manipulation through `SpatialWorkspace.commitEdit`. One completed gesture yields one revision/undo item. Cancellation or invalid geometry saves nothing. Respect pending-save recovery, access revocation and stale revision fencing.
4. Keep previews local and frame-coalesced. `ModelViewport` rebuilds on committed revision, so never persist every pointer event. Preserve camera and warm-view behavior. Update committed scene/navigation coherently.
5. Verify changed risks, transfer matching source to the authorized host and package the shared build as required by the master. Record unavailable device checks honestly.

## Minimal acceptance and handoff

| ID | Required evidence |
|---|---|
| F02-A01 | Selected 3D corner resizes; edge translates only; orbit and walkthrough remain usable. |
| F02-A02 | Plan/elevation/numeric edits agree, including angled host, nonzero elevation and preserved grab offset. |
| F02-A03 | All seven catalog entries render appropriately; flips survive reversed join/split and reload. |
| F02-A04 | Bounds, overlap, bend policy, cancellation, authority loss and stale release cannot save invalid changes. |
| F02-A05 | One gesture/undo, redo, reopen and export/import preserve geometry, type and orientation. |
| F02-A06 | Updated door/passage navigation works; windows stay non-portals; preview does not recreate renderer each move. |

Extend relevant cases in `source:web/tests/ui/direct-openings.spec.ts` and core editor/scene/navigation tests; reuse unaffected evidence. One asymmetric combined gesture journey can cover several rows. Handoff actual commit/base IDs, changed paths, schema/capability decisions, evidence by ID, platform delivery status and remaining limits. F03 consumes the manipulation contract; fixtures and damage consume opening bounds, surface attachment and orientation mappings.
