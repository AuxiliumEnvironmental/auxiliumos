# Shared implementation contract for F00 acceptance

This document separates verified invariants from proposed engineering decisions. F00 must record the accepted revisions in `DECISIONS.json` before dependent implementation. It is not a new geometry schema and must not be copied into code as unreviewed fields.

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
