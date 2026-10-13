import type { Floor, Opening, Point2, Point3 } from '../types';
import { distance, wallPath } from '../core/geometry';
import { beginOpeningChartDrag, previewOpeningChartDrag, wallChartAt, type OpeningChartDrag, type OpeningChartPoint, type OpeningCorner, type OpeningEditMode } from '../core/openings';

export interface OpeningRay { origin: Point3; direction: Point3 }
interface Segment { a: Point2; tangent: Point2; start: number; length: number }
export interface OpeningModelDrag {
  chart: OpeningChartDrag; segments: Segment[]; baseY: number;
  segment: number; last: OpeningChartPoint; lastWorld: Point3; lastValid: OpeningChartPoint;
}
const finiteRay = (ray: OpeningRay) => [ray.origin.x, ray.origin.y, ray.origin.z, ray.direction.x, ray.direction.y, ray.direction.z].every(Number.isFinite);
function intersect(ray: OpeningRay, segment: Segment, baseY: number): { chart: OpeningChartPoint; world: Point3 } | null {
  if (!finiteRay(ray)) return null;
  const normal = { x: -segment.tangent.z, z: segment.tangent.x }, denominator = normal.x * ray.direction.x + normal.z * ray.direction.z;
  if (Math.abs(denominator) < 1e-7) return null;
  const t = (normal.x * (segment.a.x - ray.origin.x) + normal.z * (segment.a.z - ray.origin.z)) / denominator;
  if (!Number.isFinite(t) || t <= 0 || t > 100000) return null;
  const world = { x: ray.origin.x + ray.direction.x * t, y: ray.origin.y + ray.direction.y * t, z: ray.origin.z + ray.direction.z * t };
  return { world, chart: { u: segment.start + (world.x - segment.a.x) * segment.tangent.x + (world.z - segment.a.z) * segment.tangent.z, v: world.y - baseY } };
}
export function beginOpeningModelDrag(floor: Floor, opening: Opening, mode: OpeningEditMode, ray: OpeningRay, grabbedU?: number): OpeningModelDrag | null {
  const wall = floor.walls.find(w => w.id === opening.wallID); if (!wall) return null;
  const u = grabbedU ?? (mode.startsWith('end') ? opening.offset + opening.width : mode.startsWith('start') ? opening.offset : opening.offset + opening.width / 2);
  const frame = wallChartAt(floor, wall, u), path = wallPath(floor, wall), segments: Segment[] = []; let start = 0;
  for (let i = 1; i < path.length; i++) { const a = path[i - 1], b = path[i], length = distance(a, b); segments.push({ a: { ...a }, start, length, tangent: { x: (b.x - a.x) / length, z: (b.z - a.z) / length } }); start += length; }
  const baseY = floor.elevation + wall.baseY, hit = intersect(ray, segments[frame.segment], baseY); if (!hit) return null;
  return { chart: beginOpeningChartDrag(opening, mode, hit.chart), segments, baseY, segment: frame.segment, last: hit.chart, lastWorld: hit.world, lastValid: hit.chart };
}
/** Follow contiguous frozen host planes. No chord or distant-branch projection. */
export function openingModelDragPreview(floor: Floor, drag: OpeningModelDrag, ray: OpeningRay): { opening: Opening; error?: string; held?: boolean } {
  let segment = drag.segment, hit = intersect(ray, drag.segments[segment], drag.baseY);
  if (!hit) return { ...previewOpeningChartDrag(floor, drag.chart, drag.lastValid), held: true };
  const visited = new Set<number>();
  while (!visited.has(segment)) {
    visited.add(segment); const current = drag.segments[segment];
    const next = hit.chart.u < current.start - 1e-9 ? segment - 1 : hit.chart.u > current.start + current.length + 1e-9 ? segment + 1 : segment;
    if (next === segment || next < 0 || next >= drag.segments.length) break;
    if (visited.has(next)) return { ...previewOpeningChartDrag(floor, drag.chart, drag.lastValid), held: true };
    const adjacent = intersect(ray, drag.segments[next], drag.baseY);
    if (!adjacent) return { ...previewOpeningChartDrag(floor, drag.chart, drag.lastValid), held: true };
    segment = next; hit = adjacent;
  }
  const travel = Math.hypot(hit.world.x - drag.lastWorld.x, hit.world.z - drag.lastWorld.z);
  if (segment !== drag.segment && Math.abs(hit.chart.u - drag.last.u) > travel * 2 + 1e-7) return { ...previewOpeningChartDrag(floor, drag.chart, drag.lastValid), held: true };
  drag.segment = segment; drag.last = hit.chart; drag.lastWorld = hit.world;
  const result = previewOpeningChartDrag(floor, drag.chart, hit.chart);
  if (!result.error) drag.lastValid = { ...hit.chart };
  return result;
}
export function openingModelCorners(floor: Floor, opening: Opening): { corner: OpeningCorner; point: Point3 }[] {
  const wall = floor.walls.find(w => w.id === opening.wallID); if (!wall) return [];
  return (['start-bottom', 'start-top', 'end-bottom', 'end-top'] as const).map(corner => ({ corner, point: wallChartAt(floor, wall, opening.offset + (corner.startsWith('end') ? opening.width : 0), opening.bottom + (corner.endsWith('top') ? opening.height : 0)).point }));
}
export function openingModelEdges(floor: Floor, opening: Opening): { a: Point3; b: Point3; au: number; bu: number }[] {
  const wall = floor.walls.find(w => w.id === opening.wallID); if (!wall) return [];
  const path = wallPath(floor, wall), lo = opening.offset, hi = lo + opening.width, breaks = [lo]; let cursor = 0;
  for (let i = 1; i < path.length; i++) { cursor += distance(path[i - 1], path[i]); if (cursor > lo && cursor < hi) breaks.push(cursor); } breaks.push(hi);
  const point = (u: number, v: number) => wallChartAt(floor, wall, u, v).point;
  const result = [lo, hi].map(u => ({ a: point(u, opening.bottom), b: point(u, opening.bottom + opening.height), au: u, bu: u }));
  for (const v of [opening.bottom, opening.bottom + opening.height]) for (let i = 1; i < breaks.length; i++) result.push({ a: point(breaks[i - 1], v), b: point(breaks[i], v), au: breaks[i - 1], bu: breaks[i] });
  return result;
}
