# Optional cutouts and penetrations: F04 scope amendment

Accepted owner scope on October 11, 2026 (America/Chicago); contract revision 4, decision D18. The owner said: "We can implement cutouts to ceilings/floors and penetrations if possible just as an option to the user."

This resolves Q01 for the first implementation. It authorizes implementation, not a claim that cutouts already work or are deployed. All named fixtures remain required. Existing independent feature work continues; only F04 implements these holes, with F03/F05 consuming the shared interface at integration.

## User-facing scope

- Provide an explicit optional Cutout / penetration tool for walls, room floors and established room ceilings. Existing documents remain unchanged until the user adds one. No required setup, automatic scan inference or automatic hole creation from a fixture.
- Support rectangular cutouts and circular penetrations first. Both labels may use either profile through the same geometry path. Rectangle width/height and circle diameter are exact editable model dimensions, not verified field measurements. In horizontal charts, height means the second in-plane dimension, not recess depth.
- A penetration represents an opening for a service such as a pipe, duct or cable. It does not model a service network, certify firestopping, or imply structural/code approval.
- Choose the host explicitly, then place, move, resize and delete through canonical commands. Use the existing 2D/3D editor, plan surface selector/elevation controls where needed, numeric fallback, preview/cancel and one undo per committed edit. Ceiling selection must be explicit, never guessed from a coincident floor projection.
- Recesses, room-boundary notches, arbitrary profiles, material thickness, automated shafts and multi-level service routing are outside this first scope. No chimney/fireplace object silently cuts another surface. Matching floor/ceiling or inter-level holes require separate explicit placement on each host.

## Shared record and geometry contract

Add optional Floor.cutouts in cumulative geometry 1.4.0. Each record uses a stable id, kind ('cutout' or 'penetration'), surface (the existing SurfaceRef), profile and existing Provenance. A rectangle profile is {shape:'rectangle',center:SurfacePoint,width:number,height:number,rotation:number}; a circle is {shape:'circle',center:SurfacePoint,diameter:number}. Rotation is radians in the host chart. This is an additive contract; no competing surface model and no saved mesh/triangle IDs.

The enclosing floor and SurfaceRef.floorID must agree. A ceiling host requires an established Room.ceiling with the same ceilingID; never fabricate a ceiling to accept a hole. Wall references retain their authored side, but a through-hole removes material from both sides of that wall. Do not duplicate it as two independently editable holes. Existing F02 openings remain separate, and a cutout must never be encoded as a door/passage or gain portal authority.

Use meters and the common wall arclength/height or floor X/Z chart. First-version profiles must be strictly contained in their host's uncut boundary and disjoint from existing openings/other cutouts, including coincident wall holes authored from the opposite side. Reject touching/overlapping/out-of-bounds/degenerate/nonfinite cases atomically with an actionable message. This intentionally defers notches and overlap unions. A rigid profile spanning a noncollinear wall bend rejects. Bound profile counts and tessellation before allocation.

Scene triangles, cutaway/hit testing, plan projections, SVG/PDF/PNG, scene/GLB export and resolveSurface material domains must derive the same real subtraction from the same frozen revision. A hole stays empty with a blue feature edge, never a white filled rectangle or cosmetic circle. Circular tessellation must be deterministic and shared by consumers, with its approximation documented. No invented sidewalls/depth in the existing zero-thickness surface model; penetration means through the modeled surface, not surveyed construction thickness. Do not add packages or relax old schema admission without a separate master grant.

Keep uncut-host lookup separate from final-domain subtraction so validation and resolveSurface cannot recurse through each other. F03 still owns the initial core/surfaces.ts implementation; F04 adds cutout subtraction in identifiable adapter commits. F05 consumes the resulting material domain, not an independently reconstructed hole model.

## Host changes and navigation

Preserve dimensions and exactly transform anchors under supported host movement, reversal, floor elevation and ceiling-height changes. Apply selected-host plus selected-hole transforms once. Ambiguous deletion/split/merge/nonrigid changes reject unless the same transaction explicitly rehosts or deletes the cutout; never silently drop or guess a host. Undo restores geometry, references and provenance together. Persist and reopen both profiles; unsupported readers reject intact.

Wall holes never create walk portals. Floor holes remove walkable support: start/place/move must respect the resulting floor domain and current navigation clearance, including paths crossing a void. No falling, jumping or inter-level travel is added. If an edit invalidates a current walk position, leave walkthrough with an explanation and require valid placement; never teleport or trap the camera. Ceiling holes grant no access to another level. Fixtures keep their accepted diagrammatic nonblocking policy.

Actual holes subtract current material for F05. Removing or moving a hole later must not manufacture damage: authored footprint intersects recorded support and current domain. Furniture only occludes. No verified areas, volumes or quantities are introduced.

## Focused acceptance and delivery

F04-A04 is now implementation-authorized, no longer scope-blocked. Use a parameterized host/profile table for real wall/floor/ceiling subtraction, opposite-wall-side consistency and invalid-profile rejection; verify one canonical save/undo/reopen/export path per distinct host role. Include a ceiling-height/host-remap case and floor start/place/move across a void. Check the F05 recorded-support seam after actual predecessor integration. A shared helper fixture alone does not prove integrated behavior.

Use the live ACTIVE_TASKS.json F04 assignment for exact added paths. Keep fixture and cutout work in identifiable commits. If a geometry limitation remains, report the precise unsupported case and preserve the successful fixture work; do not substitute a painted hole or mark all of F04 complete. Other feature chats continue. One final candidate build and focused changed-risk checks, not another full platform suite.

Only the master composes F02 -> F03 -> F04 -> F05 and performs host/Apple/OS delivery. This amendment does not change a worker branch head or start a worker process. Existing F04 chat must refresh the live program-branch ledger and this file before its next edit/push; F03/F05 must read the additive contract before integration. One writer per feature branch remains mandatory.
