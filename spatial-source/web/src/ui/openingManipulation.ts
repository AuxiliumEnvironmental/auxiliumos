import type { Floor, Opening, Point2 } from '../types';
import { distance, EPSILON, finitePoint, pathLength, pathPoint, wallPath } from '../core/geometry';

export type OpeningDragMode = 'move' | 'start' | 'end';
export type OpeningDrag = { mode: OpeningDragMode; original: Opening; path: Point2[]; pointerOffset: Point2; grabAlong: number; lastAlong: number; lastPoint: Point2 };
export type OpeningPreview = { opening: Opening; error?: string };

/** Closest point on the complete host path, retaining arc length through bends. */
function projection(path: Point2[], point: Point2, preferred = 0, minimum = 0, maximum = Infinity): { along: number; segment: number } {
  if (!finitePoint(point) || path.length < 2 || !path.every(finitePoint)) throw new Error('The opening needs a valid host wall.');
  let along = 0, nearest = Infinity, result = { along: 0, segment: 0 };
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], length = distance(a, b);
    if (length <= EPSILON) throw new Error('The host wall is too short to adjust this opening.');
    if (along + length < minimum || along > maximum) { along += length; continue; }
    const low = Math.max(0, (minimum - along) / length), high = Math.min(1, (maximum - along) / length);
    const t = Math.max(low, Math.min(high, ((point.x - a.x) * (b.x - a.x) + (point.z - a.z) * (b.z - a.z)) / (length * length)));
    const projected = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    const separation = distance(point, projected), candidate = along + t * length;
    if (separation < nearest - EPSILON || Math.abs(separation - nearest) <= EPSILON && Math.abs(candidate - preferred) < Math.abs(result.along - preferred)) {
      nearest = separation; result = { along: candidate, segment: i - 1 };
    }
    along += length;
  }
  return result;
}
export const projectToWall = (path: Point2[], point: Point2, preferred = 0): number => projection(path, point, preferred).along;

export function beginOpeningDrag(floor: Floor, opening: Opening, mode: OpeningDragMode, point: Point2): OpeningDrag {
  const host = floor.walls.find(wall => wall.id === opening.wallID);
  if (!host) throw new Error('The opening needs an existing host wall.');
  const path = wallPath(floor, host), length = pathLength(path);
  if (length <= EPSILON || opening.width > length + EPSILON || opening.offset + opening.width > length + EPSILON) throw new Error('The host wall is too short for this opening. Use Details to correct its shape first.');
  const anchorAlong = mode === 'end' ? opening.offset + opening.width : opening.offset;
  const anchor = pathPoint(path, anchorAlong);
  const initial = mode === 'move' ? projection(path, point, opening.offset + opening.width / 2, opening.offset, opening.offset + opening.width) : projection(path, anchor, anchorAlong);
  const grabbed = mode === 'move' ? pathPoint(path, initial.along) : anchor;
  return {
    mode, original: structuredClone(opening), path,
    pointerOffset: { x: point.x - grabbed.x, z: point.z - grabbed.z },
    grabAlong: mode === 'move' ? initial.along - opening.offset : 0,
    lastAlong: initial.along, lastPoint: grabbed,
  };
}

/** A preview never mutates the floor. Existing command validation remains the save gate. */
export function openingDragPreview(floor: Floor, drag: OpeningDrag, point: Point2): OpeningPreview {
  const original = drag.original, length = pathLength(drag.path), end = original.offset + original.width;
  const current = { x: point.x - drag.pointerOffset.x, z: point.z - drag.pointerOffset.z };
  // Consider a continuous interval of host arclength, including as many vertices
  // as a fast gesture reaches. Bound its travel so a nearby distant branch cannot
  // capture a small adjustment; identical preview/release coordinates are stable.
  const travel = distance(current, drag.lastPoint) * 2;
  const next = projection(drag.path, current, drag.lastAlong, Math.max(0, drag.lastAlong - travel), Math.min(length, drag.lastAlong + travel));
  const along = next.along; drag.lastAlong = along; drag.lastPoint = current;
  let offset = original.offset, width = original.width;
  if (drag.mode === 'move') offset = Math.max(0, Math.min(length - width, along - drag.grabAlong));
  else if (drag.mode === 'start') { offset = Math.max(0, Math.min(length, along)); width = end - offset; }
  else width = Math.max(0, Math.min(length, along)) - offset;
  if (width <= EPSILON) return { opening: original, error: 'Keep the two opening ends apart. Drag back before the other end, or use Details to adjust the shape.' };
  const opening = { ...original, offset, width };
  const host = floor.walls.find(wall => wall.id === original.wallID);
  if (!host || offset < 0 || offset + width > length + EPSILON || opening.bottom + opening.height > host.height + EPSILON) return { opening, error: 'The opening must fit inside its host wall.' };
  const overlapping = floor.openings.some(other => other.id !== opening.id && other.wallID === opening.wallID &&
    Math.min(opening.offset + opening.width, other.offset + other.width) - Math.max(opening.offset, other.offset) > EPSILON &&
    Math.min(opening.bottom + opening.height, other.bottom + other.height) - Math.max(opening.bottom, other.bottom) > EPSILON);
  return overlapping ? { opening, error: 'This opening overlaps another opening. Drag to a clear span; no correction will be saved here.' } : { opening };
}

/** Separate 44px hit targets from the opening body, even when the opening is small on screen. */
export function openingResizeHandles(floor: Floor, opening: Opening, units: number): Array<{ mode: 'start' | 'end'; anchor: Point2; center: Point2 }> {
  const host = floor.walls.find(wall => wall.id === opening.wallID);
  if (!host) return [];
  const path = wallPath(floor, host), a = pathPoint(path, opening.offset), b = pathPoint(path, opening.offset + opening.width);
  const separation = distance(a, b), fallback = path[1], fallbackLength = distance(path[0], fallback);
  const axis = separation > EPSILON ? { x: (b.x - a.x) / separation, z: (b.z - a.z) / separation } : { x: (fallback.x - path[0].x) / fallbackLength, z: (fallback.z - path[0].z) / fallbackLength };
  const center = { x: (a.x + b.x) / 2 - axis.z * units * 36, z: (a.z + b.z) / 2 + axis.x * units * 36 };
  const halfSpan = Math.max(separation, units * 56) / 2;
  return [
    { mode: 'start', anchor: a, center: { x: center.x - axis.x * halfSpan, z: center.z - axis.z * halfSpan } },
    { mode: 'end', anchor: b, center: { x: center.x + axis.x * halfSpan, z: center.z + axis.z * halfSpan } },
  ];
}
