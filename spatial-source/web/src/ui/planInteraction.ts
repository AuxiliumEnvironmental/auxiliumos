import type { Floor, Point2 } from '../types';
import { distance, EPSILON, finitePoint, FloorGeometryIndex } from '../core/geometry';
import { boundaryTargets, magneticTargets, SNAP } from './authoringSnap';

export type DrawPoint = Point2 & { nodeID: string };
export type DrawingSnap = {
  point: Point2 & { nodeID?: string };
  kind: 'free' | 'corner' | 'boundary' | 'horizontal' | 'vertical' | 'ambiguous';
  corners: DrawPoint[];
  targetKey?: string;
  message?: string;
};

/** Snap candidates retain identities. Coincident corners must never be merged by distance. */
export function drawingSnap(floor: Floor, draft: DrawPoint[], point: Point2, units: number, modifiers: { shift: boolean; alt: boolean; enabled?: boolean; cornersOnly?: boolean; previous?: DrawingSnap | null }, geometryIndex?: FloorGeometryIndex): DrawingSnap {
  const free: DrawingSnap = { point, kind: 'free', corners: [] };
  if (modifiers.alt || modifiers.enabled === false || !finitePoint(point) || !Number.isFinite(units) || units <= 0) return free;
  const known = new Map(floor.nodes.map(node => [node.id, { ...node.point, nodeID: node.id }]));
  for (const item of draft) if (!known.has(item.nodeID)) known.set(item.nodeID, item);
  // The segment's own start is not a destination. Excluding it permits fine
  // short segments instead of sticking in a zero-length snap around the finger.
  const targets = magneticTargets([...known.values()].filter(candidate => candidate.nodeID !== draft.at(-1)?.nodeID).map(candidate => ({ key: `node:${candidate.nodeID}`, point: candidate })), point, units, SNAP.corner, modifiers.previous?.targetKey);
  const corners = targets.map(target => target.point);
  if (corners.length > 1) return { point, kind: 'ambiguous', corners };
  if (corners.length === 1) return { point: corners[0], kind: 'corner', corners, targetKey: targets[0].key };
  if (modifiers.cornersOnly) return free;
  const anchor = draft.at(-1);
  const boundaries = boundaryTargets(floor, point, geometryIndex ?? new FloorGeometryIndex(floor)).filter(target => !anchor || distance(target.point, anchor) > EPSILON);
  const edges = magneticTargets(boundaries, point, units, SNAP.boundary, modifiers.previous?.targetKey);
  if (edges.length > 1) return { ...free, kind: 'ambiguous', message: 'Several walls are equally close. Move closer to one wall, zoom in, or turn snaps off.' };
  if (edges.length === 1) return { point: edges[0].point, kind: 'boundary', corners: [], targetKey: edges[0].key };
  const previous = draft.at(-1);
  if (previous && !modifiers.alt) {
    const dx = Math.abs(point.x - previous.x), dz = Math.abs(point.z - previous.z);
    const horizontal = units * (SNAP.alignment + (modifiers.previous?.kind === 'horizontal' ? SNAP.release : 0));
    const vertical = units * (SNAP.alignment + (modifiers.previous?.kind === 'vertical' ? SNAP.release : 0));
    if (dx > units * SNAP.minimumSegment && (modifiers.shift ? dx >= dz : dz <= horizontal)) return { point: { x: point.x, z: previous.z }, kind: 'horizontal', corners: [] };
    if (dz > units * SNAP.minimumSegment && (modifiers.shift ? dz > dx : dx <= vertical)) return { point: { x: previous.x, z: point.z }, kind: 'vertical', corners: [] };
  }
  return free;
}

export type PlanView = { x: number; z: number; width: number; height: number };
/** Reject duplicate physical spans, including partial retraces. Endpoint-only contact is allowed. */
export function overlappingSpan(a: Point2, b: Point2, c: Point2, d: Point2): boolean {
  const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
  if (length <= EPSILON) return false;
  const distance = (point: Point2) => Math.abs(dx * (point.z - a.z) - dz * (point.x - a.x)) / length;
  if (distance(c) > EPSILON || distance(d) > EPSILON) return false;
  const projection = (point: Point2) => ((point.x - a.x) * dx + (point.z - a.z) * dz) / length;
  const from = projection(c), to = projection(d);
  return Math.min(length, Math.max(from, to)) - Math.max(0, Math.min(from, to)) > EPSILON;
}

export function zoomAt(view: PlanView, factor: number, anchor: { x: number; y: number }, aspect: number): PlanView {
  const width = Math.min(40000, Math.max(0.25, view.width * factor)), height = width * aspect;
  return { x: view.x + anchor.x * (view.width - width), z: view.z + anchor.y * (view.height - height), width, height };
}
