import type { Floor, GeometryIDMapping, Point2, Point3, ResolvedSurface, Room, SpatialDocument, SurfaceDomain, SurfacePoint, SurfacePolygon, SurfaceRef, SurfaceRemap, SurfaceRemapReceipt, SurfaceTransform, Wall } from '../types';
import { contains, distance, EPSILON, pathLength, roomBoundary, signedArea, triangulate, wallPath } from './geometry';
import { materialPolygons, profileRing } from './cutoutGeometry';

export const IDENTITY_SURFACE_TRANSFORM: SurfaceTransform = Object.freeze([1, 0, 0, 1, 0, 0]);
const MAX_DOMAIN_POLYGONS = 200000, MAX_DOMAIN_WORK = 2000000;
const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,96}$/.test(value);
const point = (p: Point2): SurfacePoint => ({ u: p.x, v: p.z });
const planPoint = (p: SurfacePoint): Point2 => ({ x: p.u, z: p.v });
const polygon = (outer: SurfacePoint[]): SurfacePolygon => ({ outer, holes: [] });
const rectangle = (left: number, bottom: number, right: number, top: number): SurfacePolygon => polygon([{ u: left, v: bottom }, { u: right, v: bottom }, { u: right, v: top }, { u: left, v: top }]);
const validRef = (ref: SurfaceRef): boolean => !!ref && id(ref.floorID) && (ref.kind === 'wall' ? id(ref.wallID) && (ref.side === 'positive' || ref.side === 'negative') : (ref.kind === 'floor' || ref.kind === 'ceiling') && id(ref.roomID) && (ref.kind !== 'ceiling' || id(ref.ceilingID)));
function floorFor(document: SpatialDocument, ref: SurfaceRef): Floor | undefined {
  if (!validRef(ref) || !Array.isArray(document.floors) || document.floors.length > 100) return;
  const floor = document.floors.find(item => item.id === ref.floorID);
  if (!floor || floor.nodes.length > 100000 || floor.walls.length > 50000 || floor.rooms.length > 10000 || floor.openings.length > 10000 || (floor.cutouts?.length ?? 0) > 128) return;
  return floor;
}

/** Uncut bounds are separate from material subtraction so a later cutout validator cannot recurse. */
export function resolveUncutSurface(document: SpatialDocument, ref: SurfaceRef): ResolvedSurface | null {
  const floor = floorFor(document, ref); if (!floor) return null;
  try {
    let outer: SurfacePoint[];
    if (ref.kind === 'wall') {
      const wall = floor.walls.find(item => item.id === ref.wallID); if (!wall || wall.nodeIDs.length < 2 || wall.nodeIDs.length > 1000 || !Number.isFinite(wall.height) || wall.height <= 0 || wall.height > 100) return null;
      const length = pathLength(wallPath(floor, wall)); if (!Number.isFinite(length) || length <= EPSILON) return null;
      outer = rectangle(0, 0, length, wall.height).outer;
    } else {
      const room = floor.rooms.find(item => item.id === ref.roomID); if (!room || room.boundary.length > 1000) return null;
      if (ref.kind === 'ceiling' && (!room.ceiling || room.ceiling.id !== ref.ceilingID)) return null;
      const ring = roomBoundary(floor, room); if (ring.length < 3 || ring.length > 1000) return null;
      outer = ring.map(point);
    }
    if (!outer.every(p => Number.isFinite(p.u) && Number.isFinite(p.v))) return null;
    return { ref: structuredClone(ref), sourceRevision: document.revision, domain: { polygons: [polygon(outer)] } };
  } catch { return null; }
}

/** Exact wall material partition, including floor-level doors and boundary-touching apertures. */
function resolveOpeningSurface(document: SpatialDocument, ref: SurfaceRef): ResolvedSurface | null {
  const resolved = resolveUncutSurface(document, ref); if (!resolved || ref.kind !== 'wall') return resolved;
  const floor = floorFor(document, ref)!, wall = floor.walls.find(item => item.id === ref.wallID)!;
  const length = resolved.domain.polygons[0].outer[1].u;
  const holes = floor.openings.filter(opening => opening.wallID === wall.id);
  if (!holes.length) return resolved;
  if (holes.some(hole => ![hole.offset, hole.width, hole.bottom, hole.height].every(Number.isFinite) || hole.width <= 0 || hole.height <= 0 || hole.offset < 0 || hole.bottom < 0 || hole.offset + hole.width > length + EPSILON || hole.bottom + hole.height > wall.height + EPSILON)) return null;
  const events = new Map<number, { start: typeof holes; end: typeof holes }>();
  const event = (u: number) => { const existing = events.get(u); if (existing) return existing; const created = { start: [] as typeof holes, end: [] as typeof holes }; events.set(u, created); return created; };
  event(0); event(length);
  for (const hole of holes) { event(hole.offset).start.push(hole); event(Math.min(length, hole.offset + hole.width)).end.push(hole); }
  const breaks = [...events.keys()].sort((a, b) => a - b), active = new Map<string, typeof holes[number]>(), polygons: SurfacePolygon[] = [];
  let work = 0;
  const add = (left: number, bottom: number, right: number, top: number) => { if (top - bottom > EPSILON && right - left > EPSILON) { if (polygons.length >= MAX_DOMAIN_POLYGONS) throw new Error('Surface material exceeds the bounded polygon count.'); polygons.push(rectangle(left, bottom, right, top)); } };
  for (let i = 0; i + 1 < breaks.length; i++) {
    const left = breaks[i], right = breaks[i + 1], current = events.get(left)!;
    for (const hole of current.end) active.delete(hole.id); for (const hole of current.start) active.set(hole.id, hole);
    work += active.size + 1; if (work > MAX_DOMAIN_WORK) throw new Error('Surface material exceeds the bounded work limit.');
    let bottom = 0;
    for (const hole of [...active.values()].sort((a, b) => a.bottom - b.bottom)) { add(left, bottom, right, Math.min(wall.height, hole.bottom)); bottom = Math.max(bottom, hole.bottom + hole.height); }
    add(left, bottom, right, wall.height);
  }
  return { ...resolved, domain: { polygons } };
}

/** Validation keeps existing aperture voids but deliberately excludes F04 cutouts. */
export function uncutSurfaceDomain(document: SpatialDocument, ref: SurfaceRef): SurfaceDomain | null {
  const resolved = resolveUncutSurface(document, ref); if (!resolved) return null;
  if (ref.kind === 'wall') {
    const floor = floorFor(document, ref)!, wall = floor.walls.find(item => item.id === ref.wallID)!, length = resolved.domain.polygons[0].outer[1].u;
    const openings = floor.openings.filter(opening => opening.wallID === wall.id);
    if (openings.some(hole => ![hole.offset, hole.width, hole.bottom, hole.height].every(Number.isFinite) || hole.width <= 0 || hole.height <= 0 || hole.offset < 0 || hole.bottom < 0 || hole.offset + hole.width > length + EPSILON || hole.bottom + hole.height > wall.height + EPSILON)) return null;
    resolved.domain.polygons[0].holes = openings.map(hole => rectangle(hole.offset, hole.bottom, hole.offset + hole.width, hole.bottom + hole.height).outer);
  }
  return resolved.domain;
}
export const samePhysicalSurface = (a: SurfaceRef, b: SurfaceRef): boolean => a.floorID === b.floorID && a.kind === b.kind && (a.kind === 'wall' && b.kind === 'wall' ? a.wallID === b.wallID : a.kind !== 'wall' && b.kind !== 'wall' && a.roomID === b.roomID && (a.kind !== 'ceiling' || b.kind === 'ceiling' && a.ceilingID === b.ceilingID));
export function surfaceKey(ref: SurfaceRef): string { return JSON.stringify(ref.kind === 'wall' ? [ref.floorID, ref.kind, ref.wallID, ref.side] : ref.kind === 'ceiling' ? [ref.floorID, ref.kind, ref.roomID, ref.ceilingID] : [ref.floorID, ref.kind, ref.roomID]); }
/** Through-holes share one material domain on both physical wall sides. */
export function resolveSurface(document: SpatialDocument, ref: SurfaceRef): ResolvedSurface | null {
  const floor = floorFor(document, ref); if (!floor) return null;
  const cutouts = (floor.cutouts ?? []).filter(cutout => samePhysicalSurface(cutout.surface, ref));
  if (!cutouts.length) return resolveOpeningSurface(document, ref);
  const domain = uncutSurfaceDomain(document, ref); if (!domain) return null;
  for (const cutout of cutouts) {
    const ring = profileRing(cutout.profile);
    if (!ring.every(p => Number.isFinite(p.u) && Number.isFinite(p.v))) return null;
    domain.polygons[0].holes.push(ring);
  }
  return { ref: structuredClone(ref), sourceRevision: document.revision, domain };
}
export function surfaceNormal(document: SpatialDocument, ref: SurfaceRef, u = 0): Point3 | null {
  if (!resolveUncutSurface(document, ref)) return null;
  if (ref.kind !== 'wall') return { x: 0, y: ref.kind === 'floor' ? 1 : -1, z: 0 };
  const normal = wallSurfaceFrame(document, ref, u)?.normal;
  return normal ? { x: normal.x || 0, y: normal.y || 0, z: normal.z || 0 } : null;
}

/** The ordered wall chart has one outgoing tangent at an exact internal vertex. */
export function wallSurfaceFrame(document: SpatialDocument, ref: Extract<SurfaceRef, { kind: 'wall' }>, u: number): { origin: Point3; tangent: Point3; normal: Point3 } | null {
  const floor = floorFor(document, ref), wall = floor?.walls.find(item => item.id === ref.wallID);
  if (!floor || !wall || !Number.isFinite(u) || wall.nodeIDs.length > 1000) return null;
  const path = wallPath(floor, wall), length = pathLength(path); if (u < 0 || u > length || !Number.isFinite(length)) return null;
  let cursor = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], span = distance(a, b), end = cursor + span;
    if (span <= EPSILON) return null;
    if (u < end || i === path.length - 1) {
      const tx = (b.x - a.x) / span, tz = (b.z - a.z) / span, side = ref.side === 'positive' ? 1 : -1;
      return { origin: { x: a.x + tx * (u - cursor), y: floor.elevation + wall.baseY, z: a.z + tz * (u - cursor) }, tangent: { x: tx, y: 0, z: tz }, normal: { x: -tz * side, y: 0, z: tx * side } };
    }
    cursor = end;
  }
  return null;
}

/** Chart mapping is separate from material membership, retaining coordinates over a hole for review. */
export function surfacePointToWorld(document: SpatialDocument, ref: SurfaceRef, value: SurfacePoint): Point3 | null {
  if (!value || !Number.isFinite(value.u) || !Number.isFinite(value.v)) return null;
  const floor = floorFor(document, ref); if (!floor) return null;
  if (ref.kind === 'wall') {
    const wall = floor.walls.find(item => item.id === ref.wallID); if (!wall || value.v < 0 || value.v > wall.height) return null;
    const frame = wallSurfaceFrame(document, ref, value.u); return frame ? { ...frame.origin, y: frame.origin.y + value.v } : null;
  }
  const room = floor.rooms.find(item => item.id === ref.roomID);
  if (!room || Math.abs(value.u) > 10000 || Math.abs(value.v) > 10000 || (ref.kind === 'ceiling' && (!room.ceiling || room.ceiling.id !== ref.ceilingID))) return null;
  return { x: value.u, y: floor.elevation + (ref.kind === 'ceiling' ? room.ceiling!.height : 0), z: value.v };
}

export function transformSurfacePoint(value: SurfacePoint, transform: SurfaceTransform): SurfacePoint {
  const [a, b, c, d, e, f] = transform; return { u: a * value.u + c * value.v + e, v: b * value.u + d * value.v + f };
}
export function transformSurfaceDomain(domain: SurfaceDomain, transform: SurfaceTransform): SurfaceDomain {
  return { polygons: domain.polygons.map(p => ({ outer: p.outer.map(value => transformSurfacePoint(value, transform)), holes: p.holes.map(ring => ring.map(value => transformSurfacePoint(value, transform))) })) };
}
export function composeSurfaceTransforms(first: SurfaceTransform, second: SurfaceTransform): SurfaceTransform {
  const [a, b, c, d, e, f] = first, [g, h, i, j, k, l] = second;
  return [g * a + i * b, h * a + j * b, g * c + i * d, h * c + j * d, g * e + i * f + k, h * e + j * f + l];
}
function inverse(transform: SurfaceTransform): SurfaceTransform | null {
  const [a, b, c, d, e, f] = transform, det = a * d - b * c;
  return Math.abs(det) < 1e-12 ? null : [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}
const same = (a: Point2, b: Point2) => distance(a, b) <= EPSILON;
function sameRing(a: Point2[], b: Point2[]): boolean {
  if (a.length !== b.length) return false;
  for (let start = 0; start < b.length; start++) if (same(a[0], b[start])) for (const direction of [1, -1]) if (a.every((p, i) => same(p, b[(start + direction * i + b.length) % b.length]))) return true;
  return false;
}
/** Known node identity, not nearest-face matching, determines a rigid host transform. */
function rigidFrame(source: Floor, next: Floor, nodeIDs: string[]): SurfaceTransform | null {
  const from = new Map(source.nodes.map(node => [node.id, node.point])), to = new Map(next.nodes.map(node => [node.id, node.point]));
  const ids = [...new Set(nodeIDs)]; if (ids.length < 2 || ids.some(id => !from.has(id) || !to.has(id))) return null;
  const a = from.get(ids[0])!, c = to.get(ids[0])!;
  const other = ids.find(id => distance(a, from.get(id)!) > EPSILON); if (!other) return null;
  const b = from.get(other)!, d = to.get(other)!, length = distance(a, b);
  if (Math.abs(distance(c, d) - length) > EPSILON) return null;
  const ux = (b.x - a.x) / length, uz = (b.z - a.z) / length, vx = (d.x - c.x) / length, vz = (d.z - c.z) / length;
  const cos = ux * vx + uz * vz, sin = ux * vz - uz * vx;
  const transform: SurfaceTransform = [cos, sin || 0, -sin || 0, cos, c.x - cos * a.x + sin * a.z, c.z - sin * a.x - cos * a.z];
  return ids.every(id => same(planPoint(transformSurfacePoint(point(from.get(id)!), transform)), to.get(id)!)) ? transform : null;
}
function clipHalfPlane(ring: SurfacePoint[], signed: (point: SurfacePoint) => number): SurfacePoint[] {
  const result: SurfacePoint[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], da = signed(a), db = signed(b), insideA = da >= -1e-10, insideB = db >= -1e-10;
    if (insideA) result.push(a);
    if (insideA !== insideB) { const t = da / (da - db); result.push({ u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t }); }
  }
  return result;
}
function clippedWallDomain(domain: SurfaceDomain, lo: number, hi: number): SurfaceDomain {
  const polygons: SurfacePolygon[] = [];
  const regions = domain.polygons.some(region => region.holes.length) ? materialPolygons(domain) : domain.polygons.map(region => region.outer);
  for (const region of regions) {
    const outer = clipHalfPlane(clipHalfPlane(region, p => p.u - lo), p => hi - p.u);
    if (outer.length >= 3 && Math.abs(signedArea(outer.map(planPoint))) > EPSILON * EPSILON) polygons.push(polygon(outer));
  }
  return { polygons };
}
/** Split-room receipts retain source material, including holes deleted in the same edit. */
function clippedRoomDomain(domain: SurfaceDomain, ring: Point2[]): SurfaceDomain {
  if (!domain.polygons.some(region => region.holes.length)) return { polygons: [polygon(ring.map(point))] };
  const cells = materialPolygons(domain), triangles = triangulate(ring), polygons: SurfacePolygon[] = [];
  if (cells.length * triangles.length > MAX_DOMAIN_WORK) throw new Error('Surface remapping exceeds the bounded intersection work limit.');
  for (const cell of cells) for (const indices of triangles) {
    const triangle = indices.map(i => ring[i]), sign = signedArea(triangle) >= 0 ? 1 : -1; let clipped = cell;
    for (let i = 0; i < 3 && clipped.length; i++) { const p = triangle[i], q = triangle[(i + 1) % 3]; clipped = clipHalfPlane(clipped, value => sign * ((q.x - p.x) * (value.v - p.z) - (q.z - p.z) * (value.u - p.x))); }
    if (clipped.length >= 3 && Math.abs(signedArea(clipped.map(planPoint))) > EPSILON * EPSILON) polygons.push(polygon(clipped));
    if (polygons.length > MAX_DOMAIN_POLYGONS) throw new Error('Surface remapping exceeds the bounded polygon count.');
  }
  return { polygons };
}
/** Area coverage is exact triangle clipping, with a work bound before cross-allocation. */
function coveredBy(ring: Point2[], container: Point2[]): boolean {
  if (sameRing(ring, container)) return true;
  if (!ring.every(p => contains(p, container))) return false;
  const a = triangulate(ring), b = triangulate(container);
  if (a.length * b.length > MAX_DOMAIN_WORK) throw new Error('Surface remapping exceeds the bounded intersection work limit.');
  let covered = 0;
  for (const left of a) for (const right of b) {
    const triangle = right.map(i => container[i]), sign = signedArea(triangle) >= 0 ? 1 : -1;
    let clipped = left.map(i => point(ring[i]));
    for (let i = 0; i < 3 && clipped.length; i++) { const p = triangle[i], q = triangle[(i + 1) % 3]; clipped = clipHalfPlane(clipped, value => sign * ((q.x - p.x) * (value.v - p.z) - (q.z - p.z) * (value.u - p.x))); }
    if (clipped.length >= 3) covered += Math.abs(signedArea(clipped.map(planPoint)));
  }
  const area = Math.abs(signedArea(ring)); return Math.abs(covered - area) <= Math.max(EPSILON, area * 1e-8);
}
function exactCoordinate(path: Point2[], p: Point2): number | null {
  const found: number[] = []; let cursor = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], length = distance(a, b), u = ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / length;
    if (u >= -EPSILON && u <= length + EPSILON && Math.abs((p.x - a.x) * (b.z - a.z) - (p.z - a.z) * (b.x - a.x)) <= EPSILON * length) found.push(cursor + Math.max(0, Math.min(length, u)));
    cursor += length;
  }
  if (!found.length || found.some(value => Math.abs(value - found[0]) > EPSILON)) return null;
  return found[0];
}
function chartInterval(source: Point2[], next: Point2[]): { lo: number; hi: number; start: number; direction: number } | null {
  const sourceLength = pathLength(source), targetLength = pathLength(next);
  const a = exactCoordinate(next, source[0]), b = exactCoordinate(next, source.at(-1)!);
  if (a !== null && b !== null && Math.abs(Math.abs(b - a) - sourceLength) <= EPSILON && source.every(p => exactCoordinate(next, p) !== null)) return { lo: 0, hi: sourceLength, start: a, direction: b >= a ? 1 : -1 };
  const c = exactCoordinate(source, next[0]), d = exactCoordinate(source, next.at(-1)!);
  if (c !== null && d !== null && Math.abs(Math.abs(d - c) - targetLength) <= EPSILON && next.every(p => exactCoordinate(source, p) !== null)) return { lo: Math.min(c, d), hi: Math.max(c, d), start: d >= c ? -c : c, direction: d >= c ? 1 : -1 };
  return null;
}

/** Final-revision receipts compose the actual retained ID lineage and exact host frames. */
export function surfaceRemapReceipt(source: SpatialDocument, next: SpatialDocument, mappings?: readonly GeometryIDMapping[]): SurfaceRemapReceipt {
  const result: SurfaceRemap[] = [];
  const destinations = (floorID: string, kind: string, sourceID: string): string[] | undefined => mappings?.find(mapping => mapping.floorID === floorID && mapping.objectKind === kind && mapping.sourceID === sourceID)?.resultingIDs;
  const unresolved = (from: SurfaceRef, domain: SurfaceDomain, _candidate: SurfaceRef | null = null) => result.push({ from, to: null, sourceDomain: domain, transform: null, outcome: 'unresolved' });
  for (const floor of source.floors) {
    const targetFloor = next.floors.find(item => item.id === floor.id), floorChanged = !targetFloor || floor.elevation !== targetFloor.elevation || destinations(floor.id, 'floor', floor.id) !== undefined;
    const sourceCutouts = cutoutSignatures(floor), targetCutouts = targetFloor ? cutoutSignatures(targetFloor) : new Map<string, string>();
    const cutoutsChanged = (from: SurfaceRef, to: SurfaceRef = from) => sourceCutouts.get(physicalKey(from)) !== targetCutouts.get(physicalKey(to));
    for (const room of floor.rooms) {
      const ids = destinations(floor.id, 'room', room.id);
      const refs: SurfaceRef[] = [{ floorID: floor.id, kind: 'floor', roomID: room.id }];
      if (room.ceiling) refs.push({ floorID: floor.id, kind: 'ceiling', roomID: room.id, ceilingID: room.ceiling.id });
      if (mappings && !floorChanged && ids === undefined && !refs.some(ref => cutoutsChanged(ref))) continue;
      const nodeIDs = room.boundary.flatMap(ref => floor.walls.find(wall => wall.id === ref.wallID)?.nodeIDs ?? []), frame = targetFloor ? rigidFrame(floor, targetFloor, nodeIDs) : null;
      for (const ref of refs) {
        if (mappings && !floorChanged && ids === undefined && !cutoutsChanged(ref)) continue;
        const resolved = resolveSurface(source, ref); if (!resolved) continue;
        const targets = targetFloor ? (ids ?? [room.id]).map(id => targetFloor.rooms.find(item => item.id === id)).filter((room): room is Room => !!room) : [];
        if (!targets.length || !frame) { unresolved(ref, resolved.domain); continue; }
        const inv = inverse(frame)!; let emitted = false;
        for (const target of targets) {
          const to: SurfaceRef | null = ref.kind === 'floor' ? { floorID: floor.id, kind: 'floor', roomID: target.id } : target.ceiling ? { floorID: floor.id, kind: 'ceiling', roomID: target.id, ceilingID: target.ceiling.id } : null;
          if (!to) { unresolved(ref, resolved.domain); emitted = true; continue; }
          if (ref.kind === 'ceiling' && to.kind === 'ceiling' && ref.ceilingID !== to.ceilingID && target.id === room.id && (!ids || ids.length === 1 && !mappings?.some(mapping => mapping.objectKind === 'room' && mapping.sourceID !== room.id && mapping.resultingIDs.includes(target.id)))) { unresolved(ref, resolved.domain); emitted = true; continue; }
          const before = roomBoundary(floor, room), after = roomBoundary(targetFloor!, target).map(p => planPoint(transformSurfacePoint(point(p), inv)));
          const outcome = cutoutsChanged(ref, to) ? 'clipped_needs_review' as const : 'exact' as const;
          if (sameRing(before, after)) { result.push({ from: ref, to, sourceDomain: resolved.domain, transform: frame, outcome }); emitted = true; }
          else if (ids && (ids.length > 1 || target.id !== room.id || mappings?.some(mapping => mapping.objectKind === 'room' && mapping.sourceID !== room.id && mapping.resultingIDs.includes(target.id)))) {
            if (coveredBy(after, before)) { result.push({ from: ref, to, sourceDomain: clippedRoomDomain(resolved.domain, after), transform: frame, outcome }); emitted = true; }
            else if (coveredBy(before, after)) { result.push({ from: ref, to, sourceDomain: resolved.domain, transform: frame, outcome }); emitted = true; }
            else { unresolved(ref, resolved.domain, to); emitted = true; }
          } else { unresolved(ref, resolved.domain, to); emitted = true; }
        }
        if (!emitted) unresolved(ref, resolved.domain);
      }
    }
    const sourceOpenings = openingSignatures(floor), targetOpenings = targetFloor ? openingSignatures(targetFloor) : new Map<string, string>();
    for (const wall of floor.walls) {
      const ids = destinations(floor.id, 'wall', wall.id);
      const apertureChanged=!!targetFloor&&(sourceOpenings.get(wall.id)!==targetOpenings.get(wall.id)||cutoutsChanged({floorID:floor.id,kind:'wall',wallID:wall.id,side:'positive'}));
      if (mappings && !floorChanged && ids === undefined && !apertureChanged) continue;
      const targets = targetFloor ? (ids ?? [wall.id]).map(id => targetFloor.walls.find(item => item.id === id)).filter((wall): wall is Wall => !!wall) : [];
      const frame = targetFloor ? rigidFrame(floor, targetFloor, wall.nodeIDs) : null;
      for (const side of ['positive', 'negative'] as const) {
        const from: SurfaceRef = { floorID: floor.id, kind: 'wall', wallID: wall.id, side }, resolved = resolveSurface(source, from); if (!resolved) continue;
        if (!targets.length || !frame) { unresolved(from, resolved.domain); continue; }
        const path = wallPath(floor, wall).map(p => planPoint(transformSurfacePoint(point(p), frame)));
        for (const target of targets) {
          const interval = chartInterval(path, wallPath(targetFloor!, target));
          if (!interval) { unresolved(from, resolved.domain, { ...from, wallID: target.id }); continue; }
          const to: SurfaceRef = { ...from, wallID: target.id, side: interval.direction < 0 ? side === 'positive' ? 'negative' : 'positive' : side };
          const transform: SurfaceTransform = [interval.direction, 0, 0, 1, interval.start, wall.baseY - target.baseY];
          const changedDomain = Math.abs(wall.height - target.height) > EPSILON || sourceOpenings.get(wall.id) !== targetOpenings.get(target.id) || cutoutsChanged(from, to);
          result.push({ from, to, sourceDomain: clippedWallDomain(resolved.domain, interval.lo, interval.hi), transform, outcome: changedDomain ? 'clipped_needs_review' : 'exact' });
        }
      }
    }
  }
  return { sourceRevision: source.revision, resultingRevision: next.revision, mappings: result };
}
const physicalKey = (ref: SurfaceRef): string => surfaceKey(ref.kind === 'wall' ? { ...ref, side: 'positive' } : ref);
function cutoutSignatures(floor: Floor): Map<string, string> {
  const groups = new Map<string, string[]>();
  for (const cutout of floor.cutouts ?? []) {
    const key = physicalKey(cutout.surface), group = groups.get(key) ?? [];
    group.push(JSON.stringify(profileRing(cutout.profile))); groups.set(key, group);
  }
  return new Map([...groups].map(([key, profiles]) => [key, JSON.stringify(profiles.sort())]));
}
function openingSignatures(floor: Floor): Map<string, string> {
  const groups = new Map<string, unknown[][]>();
  for (const opening of floor.openings) {
    const group = groups.get(opening.wallID) ?? [];
    group.push([opening.id, opening.offset, opening.width, opening.bottom, opening.height]); groups.set(opening.wallID, group);
  }
  return new Map([...groups].map(([id, openings]) => [id, JSON.stringify(openings)]));
}

export function wallRun(document:SpatialDocument,ref:Extract<SurfaceRef,{kind:'wall'}>,lo:number,hi:number):{tx:number;tz:number}|null{
 const f=document.floors.find(f=>f.id===ref.floorID),w=f?.walls.find(w=>w.id===ref.wallID);if(!f||!w)return null;
 const path=wallPath(f,w);let cursor=0,run:{tx:number;tz:number}|null=null;
 for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],length=Math.hypot(b.x-a.x,b.z-a.z);if(hi>cursor+1e-6&&lo<cursor+length-1e-6){const next={tx:(b.x-a.x)/length,tz:(b.z-a.z)/length};if(run&&Math.hypot(run.tx-next.tx,run.tz-next.tz)>1e-6)return null;run=next;}cursor+=length;}
 return lo>=-1e-6&&hi<=cursor+1e-6?run:null;
}
/** Maximal contiguous collinear run containing u. Rigid gestures cannot jump runs. */
export function wallRunBounds(document:SpatialDocument,ref:Extract<SurfaceRef,{kind:'wall'}>,u:number):{lo:number;hi:number;tx:number;tz:number}|null{
 const f=document.floors.find(f=>f.id===ref.floorID),w=f?.walls.find(w=>w.id===ref.wallID);if(!f||!w)return null;const path=wallPath(f,w),segments:{lo:number;hi:number;tx:number;tz:number}[]=[];let cursor=0;
 for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],length=Math.hypot(b.x-a.x,b.z-a.z);segments.push({lo:cursor,hi:cursor+length,tx:(b.x-a.x)/length,tz:(b.z-a.z)/length});cursor+=length;}
 const index=segments.findIndex(s=>u>=s.lo-1e-6&&u<s.hi-1e-6);const i=index<0&&Math.abs(u-cursor)<1e-6?segments.length-1:index;if(i<0)return null;const basis=segments[i];let lo=i,hi=i;
 const same=(s:typeof basis)=>Math.hypot(s.tx-basis.tx,s.tz-basis.tz)<1e-6;while(lo>0&&same(segments[lo-1]))lo--;while(hi<segments.length-1&&same(segments[hi+1]))hi++;return{...basis,lo:segments[lo].lo,hi:segments[hi].hi};
}
