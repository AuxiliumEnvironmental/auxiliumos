import type { Floor, Point2 } from '../types';
import { distance, EPSILON, FloorGeometryIndex, interpolate } from '../core/geometry';

// Screen-space magnets stay predictable at every zoom. The small release band
// prevents flicker without trapping the pointer. Free coordinates are never rounded.
export const SNAP = { corner: 12, boundary: 8, alignment: 5, release: 4, competition: 3, minimumSegment: 5, dragThreshold: 2.5 } as const;
export type SnapTarget = { key: string; point: Point2 };
export type BoundaryTarget = SnapTarget & { wallID: string; offset: number };

/** Prefer a clearly closer target, but never choose between coincident identities. */
export function magneticTargets<T extends SnapTarget>(targets: T[], point: Point2, units: number, radius: number, previousKey?: string): T[] {
  const near = targets.map(target => ({ target, distance: distance(target.point, point) }))
    .filter(item => item.distance <= units * (radius + (item.target.key === previousKey ? SNAP.release : 0)))
    .sort((a, b) => a.distance - b.distance);
  if (!near.length) return [];
  const best = near[0];
  const competing = near.filter(item => item.distance - best.distance <= units * SNAP.competition || distance(item.target.point, best.target.point) <= EPSILON);
  return competing.length > 1 ? competing.map(item => item.target) : [best.target];
}

/** Project onto actual polylines, retaining host identity and arclength. */
export function boundaryTargets(floor: Floor, point: Point2, index: FloorGeometryIndex): BoundaryTarget[] {
  const targets: BoundaryTarget[] = [];
  for (const wall of floor.walls) {
    const path = index.path(wall);
    let offset = 0;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
      if (length <= EPSILON) continue;
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (length * length)));
      const projected = interpolate(a, b, t), along = offset + t * length;
      const previous = targets.at(-1);
      if (!previous || previous.wallID !== wall.id || Math.abs(previous.offset - along) > EPSILON) {
        targets.push({ key: `wall:${wall.id}:${i}`, wallID: wall.id, point: projected, offset: along });
      }
      offset += length;
    }
  }
  return targets;
}
