import type { Floor, Opening, OpeningKind, OpeningStyleID, Point2 } from '../types';
import { authoredOpeningStyle, openingGeometryError, openingPreset } from '../core/openings';
import { EPSILON, finitePoint, pathLength, wallPath } from '../core/geometry';
import { editedProvenance } from './geometry';
import { projectToWall } from './openingManipulation';

export type OpeningPlacement = { opening: Opening; point: Point2; error?: string };

/**
 * A direct placement is an unsaved starter shape on one explicitly chosen wall.
 * Its offset follows the full host arclength, including intermediate vertices.
 * Shape defaults are authoring conveniences, never captured measurements.
 */
export function previewOpeningPlacement(floor: Floor, wallID: string, kind: OpeningKind, point: Point2, id: string, styleID?: OpeningStyleID): OpeningPlacement {
  const wall = floor.walls.find(item => item.id === wallID);
  if (!wall || !finitePoint(point)) throw new Error('Choose an existing wall for this opening.');
  const path = wallPath(floor, wall), length = pathLength(path), width = styleID ? openingPreset(styleID)!.width : .9;
  const opening: Opening = {
    id, wallID, kind, offset: projectToWall(path, point) - width / 2, width,
    bottom: kind === 'window' ? .9 : Math.max(0, -wall.baseY), height: kind === 'window' ? 1.2 : 2.1,
    provenance: editedProvenance(),
  };
  if (styleID) opening.style = authoredOpeningStyle(styleID, opening);
  const result = { opening, point: { ...point } };
  if (opening.offset < 0 || opening.offset + width > length + EPSILON) return { ...result, error: 'Keep the whole opening inside its wall. Choose a point farther from the wall ends.' };
  if (opening.offset > 10000) return { ...result, error: 'This position is outside the supported opening range. Split the host wall before placing here.' };
  if (opening.bottom + opening.height > wall.height + EPSILON) return { ...result, error: 'This wall is too low for the starter shape. Use wall Details to create a shorter opening.' };
  if (floor.openings.length >= 10000) return { ...result, error: 'This floor has reached its opening limit. Remove an unused opening before adding another.' };
  const overlaps = floor.openings.some(other => other.wallID === wallID &&
    Math.min(opening.offset + opening.width, other.offset + other.width) - Math.max(opening.offset, other.offset) > EPSILON &&
    Math.min(opening.bottom + opening.height, other.bottom + other.height) - Math.max(opening.bottom, other.bottom) > EPSILON);
  return overlaps ? { ...result, error: 'This opening overlaps another opening. Choose a clear span of the wall.' } : { ...result, error: openingGeometryError(floor, opening) };
}
