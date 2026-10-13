# F01 | Surface contrast

Work only on F01 when the master activates it. Complete F00 source reconciliation first. Use the current accepted source commit, not the frozen archive as an overwrite. `source:` resolves to the Spatial source root identified in the package instructions. Follow the shared control, gesture, evidence and delivery protocols instead of creating parallel versions of them.

## Outcome and exact requirements

In 3D, make walls extremely light gray, floors a darker gray and visible ceilings a gray between those two. Use category-based contrast, not different colors for individual walls. Small-screen walkthroughs must make the surface categories readily distinguishable. Preserve fluid movement, the existing layout and ceiling visibility controls. This is the first visible feature, not a geometry redesign.

Exact hex values were not specified. Proposed starting tokens are wall `#F2F3F5`, floor `#B8BDC4`, ceiling `#D5D9DE`, with a restrained architectural edge such as `#68717C`. The master may accept or adjust these after the focused visual review. Do not represent these exact values as owner instructions.

## Current source and gaps

`source:web/src/ui/sceneBatches.ts` batches faces as either floor or wall. Every non-floor role falls into the wall group, so current display ceilings inherit the wall material. Materials are unlit and blue-tinted. Preserve the existing batching and per-triangle ownership; three grays do not require dynamic lighting, textures or new dependencies.

`source:web/src/ui/ModelViewport.tsx` adds display ceilings separately and retains event-driven rendering. Floor and ceiling selection share a room ID. Selection must retain the intended relative contrast rather than turning all selected categories into the same blue. Preserve the explicit fill-disabled view and the current visibility/cutaway behavior.

`source:web/src/data/glb.ts` uses its own blue transparent material values. Updating only the viewport would leave a visibly inconsistent exported model. `source:web/src/core/scene.ts` currently omits display ceilings from `buildScene`; `displayCeilings` only exists for rooms with matching wall tops. F01 must not invent authoritative ceiling geometry to recolor an export. That authority/export decision belongs to F03.

## Read set and candidate write scope

Read `source:AGENTS.md`, `source:RESUME.md`, `source:web/IMPLEMENTATION_CONTRACT.md`, then the four source files above and relevant rows in `source:web/tests/ui/helpers.test.ts`.

Candidate writes are `web/src/ui/sceneBatches.ts`, the material/selection portions of `web/src/ui/ModelViewport.tsx`, `web/src/data/glb.ts`, and one dependency-light shared palette module whose exact path the master assigns. A new module is a proposal, not a claim that it already exists. Extend the relevant helper/export check and add one focused visual scenario only if existing coverage cannot exercise it. Shared contracts and release files remain master-owned. No document schema, storage, capture, OS authorization or native-editor rewrite is required for this material change.

## Implementation sequence

1. Confirm the activated source hash and whether a newer palette or surface-role change already exists. Integrate with that work instead of replacing it.
2. Define explicit material-role resolution for wall, floor and ceiling. Avoid a default that silently treats every future fixture or damage face as a wall. Keep palette code independent of React so exports can use it.
3. Apply the approved palette and selection treatment to current rendering. Preserve semantic triangle ownership, batching, ceiling toggles, cut clipping and existing resource disposal.
4. Apply the same intended colors to supported GLB surface roles. Account for color-space conversion in the exporter; copying raw numeric values between representations without understanding their encoding is insufficient. Do not falsely claim that display-only ceilings have become an authoritative export feature.
5. Validate the focused acceptance rows below, then provide the common feature receipt with exact source/host/package status. An already installed Apple app requires a new package; the web deployment alone does not update it.

## Minimal acceptance rows

- **F01-A01:** One representative room viewed on a small viewport distinguishes wall, floor and visible ceiling by the agreed luminance order, including the selected state. Review orbit and walkthrough without changing geometry.
- **F01-A02:** Ceiling visibility, fill-disabled mode and cutaway retain their existing behavior. Picking still resolves the correct object ownership.
- **F01-A03:** UI and GLB wall/floor material roles share the approved intended colors. Document the current display-ceiling export boundary for F03 instead of manufacturing missing geometry.
- **F01-A04:** Existing idle rendering and batch grouping are preserved. No animation loop, per-wall material explosion or added work on unchanged/hidden views appears. Reuse current renderer instrumentation.
- **F01-A05:** The common delivery receipt identifies source commit, transferred host hashes, deployed web status and prepared/built/device-tested Apple status separately.

Do not rerun broad topology, persistence, capture or offline suites for unchanged inputs. If a focused check exposes a real regression, fix that regression and rerun only affected evidence.

## Downstream handoff

Give F02/F03/F04/F05 the material-role API and accepted tokens. F03 adds authoritative ceiling behavior; F04 adds white objects with blue feature edges; F05 adds translucent moisture/fire surfaces. These later roles must use the same presentation system while preserving the neutral structural contrast established here. Stop after this feature is integrated; do not begin openings work in this chat.
