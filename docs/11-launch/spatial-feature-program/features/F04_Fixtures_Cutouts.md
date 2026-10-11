# F04 | Fixtures, objects and cutouts

Work only on F04 when activated by the master, after F00-F03 are accepted. Use the latest accepted source commit and the master's approved catalog/surface contracts. `source:` means the reconciled Spatial source root. Follow the common gesture, ownership, evidence and delivery protocols; do not create a second native authoring implementation.

## Outcome and exact requirements

Quickly place and resize these objects in both 2D and 3D: toilets; appliances; walk-in showers; tubs with showers; garden tubs; single/double sinks; standalone sinks without cabinets; sinks with cabinets/vanities; built-in furniture; cutouts; chimneys/fireplaces; kitchen islands; upper cabinets; lower cabinets. Render placed objects white with blue feature edges, contrasting with gray structure. Dimensions must affect the actual shared geometry.

The exact appliance/built-in subtypes and the meaning of “etc.” are not specified. Inventory any verified source catalog, then maintain a bounded checklist. Refrigerator, range, dishwasher, washer and dryer would be **proposed** appliance variants, not established source facts or a user-approved exhaustive list. Do not report catalog completion while explicitly requested families are missing.

## Current gaps and prerequisites

`source:web/src/types.ts` currently contains no fixture entity or catalog. Its `SemanticArea` is a labeled plan polygon, not a suitable object model. `source:web/src/core/scene.ts` creates walls, floor faces and opening holes, with no fixture solids. The current wall-hole kernel supports rectangular apertures; it does not establish floor/ceiling holes or volumetric recesses.

`source:web/src/ui/ModelViewport.tsx` renders batched shared geometry; `source:web/src/ui/PlanGeometry.tsx` has no fixture projections. `source:web/src/core/navigation.ts` handles walls and portals, not furniture obstacles. The master must approve fixture collision policy explicitly; do not silently make walkthroughs stick or claim obstacle avoidance without implementation.

Use F00's approved entity/version contract, F01's materials, F02's aperture semantics and F03's host heights. Do not repurpose a passage solely to make a cutout render.

## Read set and candidate write scope

Read `source:AGENTS.md`, `source:web/IMPLEMENTATION_CONTRACT.md`, relevant F00-F03 receipts, then `web/src/types.ts`, `web/src/core/editor.ts`, `web/src/core/validation.ts`, `web/src/core/scene.ts`, `web/src/ui/PlanGeometry.tsx`, `web/src/ui/ModelViewport.tsx`, `web/src/ui/Inspector.tsx`, `web/src/data/drawing.ts`, `web/src/data/glb.ts`, and the approved fixture contract/catalog.

Candidate writes are master-assigned fixture modules under `web/src/core/` and `web/src/ui/`, the listed integration/render/export files, and focused tests in their existing test directories. Lead-owned `types.ts`, schema/profile changes, store admission, native packaging and release controls are coordinated with the master. Read additional files only when the selected implementation exposes a concrete dependency.

## Implementation sequence

1. Freeze the explicit catalog coverage table and cutout scope with the master. Record supported variants and unresolved requirements separately.
2. Add versioned fixture records with stable IDs, catalog/type versions, canonical dimensions, transform, appropriate host/mount relation and provenance. Parametric archetypes generate recognizable geometry; stretching a picture is not 3D support.
3. Implement placement and dimension changes through canonical edit commands. Floor objects follow floor elevation; wall-mounted uppers retain explicit mounting height. Use the shared preview/commit interaction so one finished drag makes one revision/undo step.
4. Expose plan width/depth and 3D width/depth/height adjustments with an exact numeric fallback. Preserve grab offset and orientation. Geometry validation must reject nonfinite or degenerate dimensions without losing the previous valid state.
5. Render white surfaces and blue feature edges. Batch/instance repeated archetypes while retaining semantic object ownership. Avoid every-triangle wireframes and outlines showing through unrelated walls.
6. Add consistent plan projections and frozen-revision SVG/PDF/PNG/scene/GLB output. Import/reopen must preserve dimensions, types and host attachment. Older readers must reject unsupported records intact rather than strip them and resave.

## Cutout decision boundary

The owner did not distinguish through-openings, recesses and floor/ceiling voids. The master must make that scope explicit. A proposed first type is a genuine wall through-opening with no automatic traversal permission; this is a proposal, not a claim that all requested cutouts mean wall openings.

For every accepted cutout type, subtract actual host geometry and export the same result. A hole stays empty with a blue edge, not a white rectangle. Floor/ceiling holes and volumetric recesses need their own valid geometry representation. A fireplace object cannot silently create a chimney shaft through other floors. Leave unresolved cutout rows open rather than substitute cosmetic placeholders.

Furniture may visually occlude damage but must not erase or subtract it. Actual cutouts alter the host domain, so publish that behavior to F05's attachment resolver. Host deletion/movement and invalid mounting need explicit canonical handling, not nearest-wall guesses.

## Minimal acceptance rows

- **F04-A01:** The bounded catalog checklist covers every named requested family. One geometry case per distinct parametric archetype plus a data-driven type/variant check avoids duplicated tests.
- **F04-A02:** A floor fixture and a wall-mounted fixture can be placed/resized in both views; dimensions/orientation persist after view switch and reopen. One undo reverses the completed drag; cancel leaves the saved revision unchanged.
- **F04-A03:** Representative host translation/elevation/height edits retain correct attachment. Invalid dimensions reject atomically.
- **F04-A04:** Each approved cutout type removes real host geometry in the scene and exports, without inventing portal permissions. Unresolved types remain visibly incomplete in the receipt.
- **F04-A05:** The explicit navigation policy does not trap an existing walk position or steal camera gestures. One populated scene establishes active responsiveness and no new idle work using current instrumentation.
- **F04-A06:** Frozen exports and migration/import checks retain the same catalog identity and geometry. Complete the common delivery receipt with separate web, OS and installed-app evidence.

## Downstream handoff

Supply F05 the approved object/host contract, cutout domain API, material roles and tested attachment cases. State clearly that movable solids do not subtract recorded affected area. Stop after F04 integration; only the master activates damage mapping.
