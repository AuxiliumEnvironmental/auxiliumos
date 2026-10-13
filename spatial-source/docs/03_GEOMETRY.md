# Geometry, editing and source integrity

## Canonical coordinate contract

geometry.schema.json (1.0) and geometry-v1.1.schema.json are the transport shapes; SpatialCore enforces additional
semantics. Units are internal meters. Right-handed world: +Y up, horizontal X/Z.
For top-down display, screen-right is +X and screen-down is +Z. Each floor owns its
local horizontal frame and explicit elevation. Do not assume two different floors
or scan sessions are automatically aligned. Store alignment transforms separately
with method, input IDs, reviewer, version and uncertainty.

Transform Apple surface-local vertices into world coordinates using the complete
4x4 transform. Do not treat translation plus dimensions as axis-aligned geometry.
Surface polygonCorners are local-plane coordinates [A05]. Handle the plane's
orientation explicitly. Confirm convention with asymmetric rotated fixture rooms;
a symmetric rectangle cannot reveal reflection or swapped axes.

## Normalization algorithm requirements

1. Preserve original CapturedRoom/CapturedStructure payloads, SDK version, source
   IDs, capture timestamps and coordinate-frame/session identifiers.
2. Read floors, walls, doors, windows and openings. Ignore furniture for the
   structural model without deleting the source archive.
3. Preserve analytic curves/nonuniform heights in an extension or source record.
   A reviewed polyline approximation may render a curve, but its tolerance and
   source lineage must be recorded. Current core only extrudes constant-height
   polylines: nonuniform surface support is a required implementation task, not
   a claimed feature of that starter library.
4. Resolve wall and opening relationships using source parent IDs where valid,
   then explicit geometric association when needed. Ambiguous hosts remain
   unresolved. Do not attach an opening to a merely nearby wall across a corridor.
5. Propose node/wall merging only within documented tolerances and compatible
   frames. Keep candidate source IDs and a reversible operation. Do not treat
   classification confidence as a dimensional tolerance. No invisible global
   Manhattan snapping, scale stretching, hull closure, or whole-floor squaring.
6. Construct room boundaries from observed/accepted connected walls. Distinguish
   wall paths from semantic open-plan area boundaries. Reject bowties, dangling
   references, zero length, nonmanifold joins and impossible opening geometry.
7. Reconcile stable IDs across rescans, splitting/merging and corrections with an
   explicit mapping. A new scan ID is not automatically the same old room ID.
   Keep review-needed mappings rather than silently relocating annotations.
8. Save a new normalized draft and a change log. Repeated import of the same source
   should not duplicate all geometry. Reprocessing creates a new candidate revision.

## Current implemented core

Floors contain nodes, polyline walls, hosted openings and room boundary references.
Schema 1.1 adds optional semantic area polygons with stable IDs, labels and source
provenance. These dashed nonphysical boundaries never become walls or walk portals.
The set-area command explicitly upgrades the document; old 1.0 encodings omit the
new field. Readers select a pinned schema and reject unsupported future versions.
The wall path is the source of horizontal geometry. The room boundary references
walls in an ordered direction, including shared walls. Openings use distance along
the host path and a vertical rectangle relative to wall base. Display quantities
are disabled regardless of the internal coordinate representation.

The supplied core validates structure, references, simple room polygons, opening
bounds/overlap, shared-boundary direction and edit revision preconditions. It
provides ear-clipped floor triangulation, planar wall panels with genuine opening
cutouts, semantic edges, SVG exports, structural command batches, validated room
split/merge, floor/area corrections and composed lineage. Normalization preserves
raw transformed observations and flags unresolved hosts, analytic curves and
nonuniform surfaces in source reports rather than inventing a shape. It does not
claim analytic curved-wall or nonuniform wall-profile editing, inferred closure,
automatic room-overlap solving or a general geometry solver. Ambiguous navigation
regions fail closed. SQLite-backed persistence is in SpatialPersistence, not the
in-memory command engine.

FloorGeometryIndex is a read-only per-operation lookup for a floor value. It does
not validate input or retain mutable truth. Scene, SVG, drawing and navigation
builders validate the document before using it; the native editor uses admitted
drafts. Build a new index when geometry changes. Schema, coordinates, object IDs,
polygon ordering and resulting bytes do not depend on dictionary iteration order.

## Editing requirements

Support select/move a corner or whole wall, draw/split/join/delete walls, insert/
move/resize/change a door/window/opening, room labels, room split/merge where valid,
floor management, and manual area boundaries separate from physical walls.
All operations are commands with validated before/after states and undo/redo.
A rejected operation leaves the document intact and explains the local reason.

Dragging previews a cheap local candidate. On completion, validate and persist the
command. Do not run the entire geometry pipeline or write to cloud on every pointer
move. Apply intended constraints only: dragging a shared corner updates connected
walls; a user can deliberately disconnect it through an explicit operation.

Changing wall length must preserve hosted opening placement under a documented
policy (absolute path offset by default) or flag an out-of-bounds opening. Never
silently clamp, drop or stretch a door to fit. Numeric correction is optional
and labeled diagrammatic; dimensions/areas are not presented as verified.

## Revisions and future field overlays

A published revision is immutable. An edit or undo after publication creates a
new draft. Source readings/photos/sample pins are separate overlay records tied
to stable objects plus a base geometry revision and local position. Relinking
an affected overlay requires a deliberate mapping and review. A new layout must
not mutate a previously issued report or unreviewed annotation location.

The portable snapshot engine increments revisions on undo as well as redo. The
production local repository must store the command and resulting snapshot in a
transaction. In-memory history is not crash-safe; snapshots alone are not an
unlimited collaboration solution. Keep one active geometry writer per draft in v1.
