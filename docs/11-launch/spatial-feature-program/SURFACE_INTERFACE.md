# Shared surface interface for parallel branches

Master-approved interface revision 1, contract revision 3. These are implementation contracts, not a claim that the module already exists. Canonical implementation path: `source:web/src/core/surfaces.ts`, first owned by F03. Shared public types live in `source:web/src/types.ts`. F04/F05 consume or propose compatible extensions to that module on their isolated branches; the master composes the result. Feature-specific fixture/affected-area modules must not create a second surface identity or coordinate convention.

## Required types

```ts
type SurfaceRef =
  | { floorID: string; kind: 'wall'; wallID: string; side: 'positive' | 'negative' }
  | { floorID: string; kind: 'floor'; roomID: string }
  | { floorID: string; kind: 'ceiling'; roomID: string; ceilingID: string };
type SurfacePoint = { u: number; v: number };
type SurfacePolygon = { outer: SurfacePoint[]; holes: SurfacePoint[][] };
type SurfaceDomain = { polygons: SurfacePolygon[] };
type SurfaceTransform = readonly [number, number, number, number, number, number];
// [a,b,c,d,e,f]: u' = a*u + c*v + e; v' = b*u + d*v + f.
interface ResolvedSurface {
  ref: SurfaceRef;
  sourceRevision: number;
  domain: SurfaceDomain;
}
interface SurfaceRemap {
  from: SurfaceRef;
  to: SurfaceRef | null;
  sourceDomain: SurfaceDomain;
  transform: SurfaceTransform | null;
  outcome: 'exact' | 'clipped_needs_review' | 'unresolved';
}
interface SurfaceRemapReceipt {
  sourceRevision: number;
  resultingRevision: number;
  mappings: SurfaceRemap[];
}
```

These shapes are additive to the existing object-ID mapping receipt, never a replacement that breaks old consumers. A wall split can produce multiple remap entries over distinct retained source domains. Null destination/transform denotes unresolved mapping and never grants automatic attachment. Compose exact domains/transforms across a command batch; original records and references must remain recoverable on undo.

## Required resolver entry points

```ts
resolveSurface(document: SpatialDocument, ref: SurfaceRef): ResolvedSurface | null;
surfacePointToWorld(document: SpatialDocument, ref: SurfaceRef, point: SurfacePoint): Point3 | null;
```

Resolve only actual model surfaces. Walls follow every segment of ordered host arclength; `u` is meters along the host, `v` is height above its base. World Y is floor elevation plus wall baseY plus v. Positive side normal is `(-tz,0,tx)` for tangent `(tx,0,tz)`. At exact path vertices use the outgoing segment except the final endpoint. Gesture projection retains contiguous segment/grab-offset ownership under D07; it must not jump across a bend or use a chord.

Floor and ceiling charts use `(u,v)=(x,z)` in the existing independent floor frame. An authored/inferred ceiling resolves only when its stable `Room.ceiling` exists with the requested ID. Null or display-only legacy ceilings cannot host persisted observations. Domain polygons are bounded actual material with real opening/cutout holes. Canonical units remain meters and finite doubles. Validation must bound domain size before expensive allocation.

`SurfaceDomain` is a chart region, not a world-space mesh or verified quantity. No surface triangle index, mesh UUID, changing centroid or nearest-face guess is a persistent anchor. Group movement of a host plus its attached item must not apply an exact transform twice.

## Fixtures

Add `Floor.fixtures?: Fixture[]` only when F04 consumes it. A record has stable ID, `catalog:{id,version}`, finite positive `dimensions:{width,depth,height}`, `mount` and existing Provenance. A floor mount is `{kind:'floor', position:Point2, yaw:number, baseOffset:number}` with bottom-center anchor and radians about +Y. A wall mount is `{kind:'wall', surface: wall SurfaceRef, u:number, v:number}` with bottom-center anchor, width along arclength, height +Y and depth along outward side. The enclosing floor and mount floorID must agree. Exact field unions are implemented in shared types, with strict validation.

Rigid mounts cannot span a noncollinear bend. Preserve physical dimensions and transform anchors exactly. Reject unresolved/nonrigid host changes unless the same transaction explicitly moves/deletes the fixture. A ceiling conflict rejects; it never resizes a fixture silently. Fixtures remain nonblocking in walkthrough and only occlude observations visually.

## Observations and support

An F05 observation retains stable ID, moisture/fire kind, explicit SurfaceRef, authored footprint, provenance, recorded source revision/material support and review status. Visible geometry is authored footprint intersected with recorded support and current material domain. Removing/moving a hole or enlarging a wall must never manufacture recorded damage. Remap records physically; do not proportionally stretch them. Clipped/unresolved observations remain recoverable and visible in review. A null ceiling cannot receive a saved record.

Only actual agreed cutouts subtract material; furniture never subtracts observation support. Q01 remains open and is not resolved by this interface. Moisture/fire remain separate records, including overlaps. Do not create verified totals, instrument readings, scientific conclusions or scope authorization from these shapes.

## Integration checks

F03 proves resolver domains/IDs and ceiling transitions. F04 proves rigid attachment outcomes. F05 proves retained support, clipping and exact/unresolved remaps. A synthetic domain fixture establishes helper behavior only. Integrated acceptance requires the actual composed editor receipt and undo/reopen path, with source/result revisions and all predecessor schemas preserved.
