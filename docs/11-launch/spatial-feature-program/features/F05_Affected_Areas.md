# F05 | Moisture and fire affected areas

Work only on F05 after the master accepts F00-F04. Start from its current source commit. `source:` resolves to the reconciled Spatial source root. Follow shared gesture, storage, ownership and delivery rules; do not reimplement them.

## Exact outcome

Tapping a wall, floor or ceiling in editing context opens a compact menu with one initial choice: **Affected area**. Its submenu offers **Record moisture** and **Record fire damage**, with no additional record types. Quickly draw, move and resize a general affected region on that surface.

In 3D, moisture is translucent light blue and fire damage translucent red. In 2D, walls use an adjustable dark blue two-endpoint line; ceilings use crosshatched lines in both directions forming a grid; floors use a blue filled region. Fire repeats these encodings in red. Preserve vertical extent when adjusting a wall region in plan.

The screenshots establish the wall-elevation/affected-region interaction intent, not implementation or calculation rules. Their single-direction hatch does not override the requested ceiling grid. Do not copy their entire screen layout.

## Current gaps and read set

`source:web/src/types.ts` has no damage records. `SemanticArea` is only a labeled X/Z polygon. `source:web/src/core/scene.ts` has planar walls and opening holes; display ceilings are conditional and separate from exported scenes. `source:web/src/ui/ModelViewport.tsx` maps both floor and ceiling hits to room selection. F00/F03 must provide explicit authoritative surface identity before implementation.

Read the approved surface/schema/attachment contracts and F02-F04 receipts, then `source:AGENTS.md`, `source:web/IMPLEMENTATION_CONTRACT.md`, `web/src/core/editor.ts`, `web/src/core/validation.ts`, `web/src/core/scene.ts`, `web/src/ui/PlanGeometry.tsx`, `web/src/ui/ModelViewport.tsx`, `web/src/ui/Inspector.tsx`, `web/src/data/drawing.ts`, `web/src/data/glb.ts`, and `web/src/data/exports.ts`.

Candidate writes are assigned damage/surface modules under `web/src/core/` and `web/src/ui/`, those rendering/export integrations, and focused tests. Shared types, schema versions, import/store admission and release controls require master coordination. Read persistence internals only for the relevant new admission/round-trip dependency.

## Canonical meaning and implementation

1. Store dedicated versioned affected-area records with stable IDs, moisture/fire kind, explicit surface reference, footprint, provenance and review state. Keep them separate from instrument moisture readings. A sketch does not establish measured moisture, cause or verified quantity; retain `measurementStatus: unverified`.
2. Reference wall ID **and side**, or authoritative floor/ceiling surface identity. Never attach by triangle index or undifferentiated room ID. A zero-thickness wall still has two semantic faces; a patch on one side must not tint the opposite room.
3. Store wall coordinates as physical distance along its canonical path and physical height above its base. Floor/ceiling footprints use a stable in-surface frame. Bent-wall patches follow real segments rather than bridging interior space. Do not infer a ceiling from unequal wall tops.
4. Use the shared fast rectangle/shape preview and commit contract. Plan wall-length edits retain height. New wall regions started in plan require an explicit visible height default or elevation range approved by the master, never an invented observed height. Keep numeric adjustment available.
5. Preserve walkthrough floor-tap movement. Recording requires editing context or explicit tool entry; inactive overlays cannot intercept navigation. Surface picking respects depth, clipping, side and visible geometry.
6. Reuse canonical derived geometry for UI and frozen exports. Update drawing primitives to support per-region fills/hatches once, so SVG/PDF/PNG share the same interpretation. Update scene/GLB material roles and versioned import admission.

## Host changes and overlap

- Clip visible regions to real host material, excluding opening/cutout holes. Furniture can occlude a patch but never subtract its recorded extent.
- Retain authored footprint and relevant prior host-domain information. Removing an old opening must not manufacture recorded damage on newly created material. Mark structural changes for review under the approved policy.
- Preserve physical size rather than scaling by host percentages. Raising a wall does not enlarge damage; shrinking it does not silently erase the stored original. Render clipped geometry and retain recoverable data where the approved contract allows it.
- Reversal, split/join and room boundary changes require exact coordinate/side remapping. Existing ID mappings alone are insufficient. If remapping is ambiguous, retain the record for explicit reattachment/review rather than attaching it to the nearest surface. Undo restores host and records coherently.
- Keep moisture and fire as independent records. Do not overwrite one or invent a mixed condition. Proposed overlap display: alternating blue/red marks rather than unexplained purple blending. Same-kind unions can avoid visual overdraw while retaining editable source records.
- Affected-area totals were not explicitly requested. If the master includes them, label geometric estimates appropriately and prevent overlap double-counting; do not imply verified quantities.

## Appearance

Use F01/F04 material roles. Proposed 3D starting colors are light blue `#4FA9E8` and red `#EB5757`, each around 0.24 alpha. Exact tokens remain a master-approved design choice. In plan, use light solid floor fills, clipped ceiling grid above them, then structure/affected-wall lines and readable labels/handles. Keep opposite wall-side records distinguishable. Avoid z-fighting without changing stored dimensions. Fixture outlines, selection and moisture must remain distinguishable by form and context as well as color.

## Minimal acceptance rows

- **F05-A01:** Exact two-stage menu and all three surface encodings work for moisture/fire. Floor and ceiling selection cannot be confused.
- **F05-A02:** One analytical geometry table covers wall sides, bent/concave hosts, hole subtraction and overlapping kinds. Parameterize shared geometry instead of duplicating complete workflows by color.
- **F05-A03:** A host-change table proves no silent damage expansion/loss through height changes, opening movement/removal and wall reversal/split/join.
- **F05-A04:** One golden workflow draws in 3D, changes length in plan without changing height, cancels, undoes/redoes, saves/reopens and exports the exact frozen revision.
- **F05-A05:** One pointer/navigation and populated-scene check proves camera gestures remain usable, previews are frame-coalesced and idle work does not grow. Separate desktop/synthetic results from actual iPhone evidence.
- **F05-A06:** Shared drawing output, scene/GLB, migrations and the common platform delivery receipt preserve record identity and meaning.

Return accepted rows, unresolved rows, commit/hashes and real platform limits to the master. Stop; the master owns overall integration and release acceptance.
