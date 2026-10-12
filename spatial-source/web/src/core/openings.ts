import type { Floor, Opening, OpeningKind, OpeningStyle, OpeningStyleID, Point2, Point3, SceneEdge, SceneFace, Wall } from '../types';
import { EPSILON, distance, pathLength, wallPath } from './geometry';

export interface OpeningPreset {
  id: OpeningStyleID; label: string; kind: OpeningKind;
  horizontal: boolean; vertical: boolean; width: number; symbolDepth: number;
}
// Companion widths/extents are inches. Symbol depth is never aperture height.
export const OPENING_CATALOG: readonly OpeningPreset[] = Object.freeze([
  { id: 'door_single', label: 'Single swing door', kind: 'door', horizontal: true, vertical: true, width: 36 * .0254, symbolDepth: 36 * .0254 },
  { id: 'door_double', label: 'Double swing door', kind: 'door', horizontal: false, vertical: true, width: 72 * .0254, symbolDepth: 36 * .0254 },
  { id: 'door_sliding', label: 'Sliding door', kind: 'door', horizontal: true, vertical: false, width: 72 * .0254, symbolDepth: 8 * .0254 },
  { id: 'door_pocket', label: 'Pocket door', kind: 'door', horizontal: true, vertical: false, width: 36 * .0254, symbolDepth: 8 * .0254 },
  { id: 'door_bifold', label: 'Bifold door', kind: 'door', horizontal: true, vertical: true, width: 48 * .0254, symbolDepth: 24 * .0254 },
  { id: 'doorway_open', label: 'Open doorway', kind: 'passage', horizontal: false, vertical: false, width: 36 * .0254, symbolDepth: 6 * .0254 },
  { id: 'window', label: 'Window', kind: 'window', horizontal: false, vertical: false, width: 36 * .0254, symbolDepth: 6 * .0254 },
].map(p => Object.freeze(p as OpeningPreset)));
export function openingPreset(id: string): OpeningPreset | undefined { return OPENING_CATALOG.find(p => p.id === id); }
export function authoredOpeningStyle(id: OpeningStyleID, opening: Opening): OpeningStyle {
  const preset = openingPreset(id);
  if (!preset || preset.kind !== opening.kind) throw new Error('Choose a style matching the aperture kind');
  return { id, ...(preset.horizontal ? { end: 'start' as const } : {}), ...(preset.vertical ? { side: 'positive' as const } : {}), provenance: { origin: 'edited', sourceIDs: [...opening.provenance.sourceIDs], classificationConfidence: 'unknown' } };
}
export function reversedOpeningStyle(style: OpeningStyle): OpeningStyle {
  return { ...structuredClone(style), ...(style.end ? { end: style.end === 'start' ? 'end' as const : 'start' as const } : {}), ...(style.side ? { side: style.side === 'positive' ? 'negative' as const : 'positive' as const } : {}) };
}
export function openingStyleError(opening: Opening): string | undefined {
  const style = opening.style; if (!style) return;
  const preset = openingPreset(style.id);
  if (!preset || preset.kind !== opening.kind) return 'Opening style must match its aperture kind';
  if (preset.horizontal !== (style.end !== undefined) || preset.vertical !== (style.side !== undefined)) return 'Opening orientation must contain exactly the dimensions applicable to its style';
  if (style.provenance.origin !== 'edited') return 'Catalog style is an authored choice, not a captured subtype';
  return undefined;
}
export interface WallChartFrame { point: Point3; tangent: Point2; normal: Point2; segment: number; start: number; length: number }
/** Physical ordered wall chart. A vertex belongs to the outgoing segment. */
export function wallChartAt(floor: Floor, wall: Wall, u: number, v = 0, knownPath?: Point2[]): WallChartFrame {
  const path = knownPath ?? wallPath(floor, wall); let cursor = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], length = distance(a, b);
    if (u < cursor + length - 1e-10 || i === path.length - 1) {
      const tangent = { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
      return { point: { x: a.x + tangent.x * (u - cursor), y: floor.elevation + wall.baseY + v, z: a.z + tangent.z * (u - cursor) }, tangent, normal: { x: -tangent.z, z: tangent.x }, segment: i - 1, start: cursor, length };
    }
    cursor += length;
  }
  throw new Error('Opening host has no usable segment');
}
export function openingHasRigidHost(floor: Floor, opening: Opening, knownPath?: Point2[]): boolean {
  const wall = floor.walls.find(w => w.id === opening.wallID); if (!wall) return false;
  const path = knownPath ?? wallPath(floor, wall); let cursor = 0, first: Point2 | undefined;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], length = distance(a, b), end = cursor + length;
    if (end > opening.offset + EPSILON && cursor < opening.offset + opening.width - EPSILON) {
      const tangent = { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
      if (first && (Math.abs(first.x * tangent.z - first.z * tangent.x) > 1e-8 || first.x * tangent.x + first.z * tangent.z < 1 - 1e-8)) return false;
      first = tangent;
    }
    cursor = end;
  }
  return first !== undefined;
}
/** Bounded preview validation; final commands still validate the complete transaction. */
export function openingGeometryError(floor: Floor, opening: Opening): string | undefined {
  const wall = floor.walls.find(w => w.id === opening.wallID);
  if (!wall) return 'The opening host no longer exists';
  if (![opening.offset, opening.width, opening.bottom, opening.height].every(Number.isFinite) || opening.width <= EPSILON || opening.height <= EPSILON) return 'Opening dimensions must be positive; corners cannot cross';
  if (opening.offset < 0 || opening.bottom < 0 || opening.offset + opening.width > pathLength(wallPath(floor, wall)) + EPSILON || opening.bottom + opening.height > wall.height + EPSILON || opening.width > 10000 || opening.height > 100 || opening.bottom > 100) return 'Opening must fit inside its host wall';
  const styleError = openingStyleError(opening); if (styleError) return styleError;
  if (opening.style && !openingHasRigidHost(floor, opening)) return 'This style needs one straight wall run. Use a generic aperture to span a bend';
  if (floor.openings.some(o => o.id !== opening.id && o.wallID === opening.wallID && Math.min(o.offset + o.width, opening.offset + opening.width) - Math.max(o.offset, opening.offset) > EPSILON && Math.min(o.bottom + o.height, opening.bottom + opening.height) - Math.max(o.bottom, opening.bottom) > EPSILON)) return 'Openings cannot overlap';
  if (opening.style && openingPlanLines(floor, opening).some(line => [line.a.x, line.a.z, line.b.x, line.b.z].some(n => !Number.isFinite(n) || Math.abs(n) > 10000))) return 'Opening diagram exceeds world coordinate bounds';
  return undefined;
}
export type OpeningCorner = 'start-bottom' | 'start-top' | 'end-bottom' | 'end-top';
export type OpeningEditMode = OpeningCorner | 'move';
export interface OpeningChartPoint { u: number; v: number }
export interface OpeningChartDrag { original: Opening; mode: OpeningEditMode; grab: OpeningChartPoint }
export function beginOpeningChartDrag(opening: Opening, mode: OpeningEditMode, point: OpeningChartPoint): OpeningChartDrag {
  return { original: structuredClone(opening), mode, grab: { ...point } };
}
/** Delta from the original finger contact retains grab offset and opposite corner. */
export function previewOpeningChartDrag(floor: Floor, drag: OpeningChartDrag, point: OpeningChartPoint): { opening: Opening; error?: string } {
  const o = drag.original, du = point.u - drag.grab.u, dv = point.v - drag.grab.v;
  let opening = { ...o };
  if (drag.mode === 'move') opening.offset += du;
  else {
    if (drag.mode.startsWith('start')) { opening.offset += du; opening.width -= du; } else opening.width += du;
    if (drag.mode.endsWith('bottom')) { opening.bottom += dv; opening.height -= dv; } else opening.height += dv;
  }
  return { opening, error: openingGeometryError(floor, opening) };
}
export function sameOpeningGeometry(a: Opening, b: Opening): boolean { return a.wallID === b.wallID && a.kind === b.kind && a.offset === b.offset && a.width === b.width && a.bottom === b.bottom && a.height === b.height; }

interface DiagramLine { a: Point2; b: Point2; leaf?: boolean }
/** Diagram in (x=local u,z=outward distance), not a measurement of the leaf. */
function diagram(opening: Opening): DiagramLine[] {
  if (!opening.style) return [];
  const style = opening.style, w = opening.width, side = style.side === 'negative' ? -1 : 1, end = style.end === 'end', lines: DiagramLine[] = [];
  const line = (ax: number, az: number, bx: number, bz: number, leaf = false) => lines.push({ a: { x: ax, z: az }, b: { x: bx, z: bz }, leaf });
  const swing = (hinge: number, toward: number, radius: number) => {
    line(hinge, 0, hinge, side * radius, true);
    for (let i = 1; i <= 16; i++) { const a = (i - 1) * Math.PI / 32, b = i * Math.PI / 32; line(hinge + toward * radius * Math.cos(a), side * radius * Math.sin(a), hinge + toward * radius * Math.cos(b), side * radius * Math.sin(b)); }
  };
  switch (style.id) {
    case 'door_single': swing(end ? w : 0, end ? -1 : 1, w); break;
    case 'door_double': swing(0, 1, w / 2); swing(w, -1, w / 2); break;
    case 'door_sliding': {
      // Symmetric track depth: reversing the host cannot invent a facing field.
      const x = end ? w : 0, direction = end ? -1 : 1;
      line(x, 0, x + direction * .58 * w, 0, true);
      line(x + direction * .18 * w, 0, x + direction * .76 * w, 0, true);
      for (const z of [-.025, .025]) { line(0, z, w, z); line(x + direction * .35 * w, z, x + direction * .65 * w, z); }
      break;
    }
    case 'door_pocket': {
      const x = end ? w : 0, direction = end ? 1 : -1;
      line(end ? .3 * w : 0, 0, end ? w : .7 * w, 0, true);
      line(x, 0, x + direction * .4 * w, 0);
      for (const z of [-.08 * w, .08 * w]) line(x + direction * .4 * w, 0, x + direction * .3 * w, z);
      break;
    }
    case 'door_bifold': {
      const x = end ? w : 0, direction = end ? -1 : 1;
      for (let i = 0; i < 4; i++) line(x + direction * i * w * .125, i % 2 ? side * w * .2 : 0, x + direction * (i + 1) * w * .125, (i + 1) % 2 ? side * w * .2 : 0, true);
      break;
    }
    case 'doorway_open': for (const x of [0, w]) line(x, -.06, x, .06); break;
    case 'window': for (const z of [-.045, .045]) line(0, z, w, z); line(w / 2, -.045, w / 2, .045); break;
  }
  return lines;
}
export function openingPlanLines(floor: Floor, opening: Opening, knownPath?: Point2[]): { a: Point2; b: Point2 }[] {
  const wall = floor.walls.find(w => w.id === opening.wallID); if (!wall || !opening.style || !openingHasRigidHost(floor, opening, knownPath)) return [];
  const frame = wallChartAt(floor, wall, opening.offset + opening.width / 2, 0, knownPath);
  const point = (p: Point2): Point2 => ({ x: frame.point.x + frame.tangent.x * (p.x - opening.width / 2) + frame.normal.x * p.z, z: frame.point.z + frame.tangent.z * (p.x - opening.width / 2) + frame.normal.z * p.z });
  return diagram(opening).map(l => ({ a: point(l.a), b: point(l.b) }));
}
/** Bounded diagrammatic frames/panels. Wall aperture triangles remain absent. */
export function openingScenePrimitives(floor: Floor, opening: Opening): { faces: SceneFace[]; edges: SceneEdge[] } {
  const faces: SceneFace[] = [], edges: SceneEdge[] = [], wall = floor.walls.find(w => w.id === opening.wallID);
  if (!wall || !opening.style || !openingHasRigidHost(floor, opening)) return { faces, edges };
  const frame = wallChartAt(floor, wall, opening.offset + opening.width / 2, opening.bottom), w = opening.width, h = opening.height, t = Math.min(.035, w / 8, h / 8);
  const point = (x: number, y: number, z = 0): Point3 => ({ x: frame.point.x + frame.tangent.x * (x - w / 2) + frame.normal.x * z, y: frame.point.y + y, z: frame.point.z + frame.tangent.z * (x - w / 2) + frame.normal.z * z });
  const quad = (vertices: Point3[]) => { faces.push({ objectID: opening.id, role: 'opening', vertices, triangles: [[0, 1, 2], [0, 2, 3]] }); for (let i = 0; i < 4; i++) edges.push({ objectID: opening.id, role: opening.kind, a: vertices[i], b: vertices[(i + 1) % 4] }); };
  quad([point(0, 0), point(t, 0), point(t, h), point(0, h)]);
  quad([point(w - t, 0), point(w, 0), point(w, h), point(w - t, h)]);
  quad([point(t, h - t), point(w - t, h - t), point(w - t, h), point(t, h)]);
  if (opening.kind === 'window') {
    quad([point(t, 0), point(w - t, 0), point(w - t, t), point(t, t)]);
    quad([point(w / 2 - t / 2, t), point(w / 2 + t / 2, t), point(w / 2 + t / 2, h - t), point(w / 2 - t / 2, h - t)]);
    quad([point(t, h / 2 - t / 2), point(w - t, h / 2 - t / 2), point(w - t, h / 2 + t / 2), point(t, h / 2 + t / 2)]);
  }
  for (const l of diagram(opening).filter(l => l.leaf)) quad([point(l.a.x, t, l.a.z), point(l.b.x, t, l.b.z), point(l.b.x, h - t, l.b.z), point(l.a.x, h - t, l.a.z)]);
  return { faces, edges };
}
