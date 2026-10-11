import type { Floor, Point2 } from '../types';
import { EPSILON, finitePoint, FloorGeometryIndex, onSegment } from '../core/geometry';
import { boundaryTargets, magneticTargets, SNAP } from './authoringSnap';

export type RoomSnap = {
  point: Point2 & { nodeID?: string };
  kind: 'free' | 'corner' | 'boundary' | 'alignment' | 'ambiguous';
  guides: Array<{ from: Point2; to: Point2 }>;
  message?: string;
  targetKey?: string;
  axes?: { x?: number; z?: number };
};
const ambiguity = 'Several boundary targets are close. Zoom in or use Free placement. Coincident, unconnected corners must be connected in Details first.';

/**
 * Room snapping is visible authoring assistance, separate from topology admission.
 * It never selects a nearest identity among competing targets. The room builder
 * still validates every actual contact and owns all canonical splits and reuse.
 */
export function roomSnap(floor: Floor, point: Point2, units: number, options: { enabled: boolean; alt: boolean; anchor?: Point2; previous?: RoomSnap | null }, geometryIndex?: FloorGeometryIndex): RoomSnap {
  const free: RoomSnap = { point: { ...point }, kind: 'free', guides: [] };
  if (!options.enabled || options.alt || !finitePoint(point) || !Number.isFinite(units) || units <= 0) return free;
  const corners = magneticTargets(floor.nodes.map(node => ({ key: `node:${node.id}`, point: node.point, id: node.id })), point, units, SNAP.corner, options.previous?.targetKey);
  if (corners.length > 1) return { ...free, kind: 'ambiguous', message: ambiguity };
  if (corners.length === 1) return { point: { ...corners[0].point, nodeID: corners[0].id }, kind: 'corner', targetKey: corners[0].key, guides: [{ from: point, to: corners[0].point }] };

  const index = geometryIndex ?? new FloorGeometryIndex(floor);
  const edges = magneticTargets(boundaryTargets(floor, point, index), point, units, SNAP.boundary, options.previous?.targetKey);
  if (edges.length > 1) return { ...free, kind: 'ambiguous', message: ambiguity };
  if (edges.length === 1) return { point: edges[0].point, kind: 'boundary', targetKey: edges[0].key, guides: [{ from: point, to: edges[0].point }] };

  const attached: Point2[] = [];
  for (const wall of floor.walls) {
    const path = index.path(wall);
    let touchesAnchor = false;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      if (options.anchor && onSegment(options.anchor, a, b)) touchesAnchor = true;
    }
    if (touchesAnchor) attached.push(...path);
  }
  // For an adjoining rectangle, align the opposite corner to the far end of
  // the boundary where its first corner was explicitly placed. This gives a
  // visible exact shared span without requiring a lucky pixel-perfect release.
  const axis = (key: 'x' | 'z') => {
    const values: Array<{ value: number; source: Point2 }> = [];
    for (const source of attached) if (!values.some(candidate => Math.abs(candidate.value - source[key]) <= EPSILON)) values.push({ value: source[key], source });
    const previous = options.previous?.axes?.[key];
    return magneticTargets(values.map(candidate => ({ ...candidate, key: `${key}:${candidate.value}`, point: { ...point, [key]: candidate.value } })), point, units, SNAP.alignment, previous === undefined ? undefined : `${key}:${previous}`);
  };
  const xs = axis('x'), zs = axis('z');
  if (xs.length > 1 || zs.length > 1) return { ...free, kind: 'ambiguous', message: ambiguity };
  if (xs.length || zs.length) {
    const snapped = { x: xs[0]?.value ?? point.x, z: zs[0]?.value ?? point.z };
    return { point: snapped, kind: 'alignment', axes: { x: xs[0]?.value, z: zs[0]?.value }, guides: [...xs, ...zs].map(candidate => ({ from: candidate.source, to: snapped })) };
  }
  return free;
}
