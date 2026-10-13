import type { Ceiling, CeilingHeightEdit, CeilingTarget, Floor, HeightBasis, Provenance, Room, SpatialDocument } from '../types';
import { EPSILON } from './geometry';

export const CEILING_SCHEMA_VERSION = '1.3.0' as const;
export const MAX_CEILING_HEIGHT = 100;
export const MAX_CEILING_TARGETS = 1000;
const identifier = /^[A-Za-z0-9_-]{1,96}$/;
const key = (target: CeilingTarget): string => JSON.stringify([target.floorID, target.roomID]);

/** Unknown is deliberate. A wall capture is not a captured ceiling measurement. */
export function legacyCeiling(floor: Floor, room: Room, walls: ReadonlyMap<string, Floor['walls'][number]> = new Map(floor.walls.map(wall => [wall.id, wall]))): Omit<Ceiling, 'id'> | null {
  if (!room.boundary.length || room.boundary.length > 1000) return null;
  const sources = new Set<string>(); let height: number | undefined;
  for (const reference of room.boundary) {
    const wall = walls.get(reference.wallID); if (!wall) return null;
    const top = wall.baseY + wall.height;
    if (!Number.isFinite(top) || top <= 0 || top > MAX_CEILING_HEIGHT || Math.abs(floor.elevation + top) > 10000 || (height !== undefined && Math.abs(top - height) > EPSILON)) return null;
    height ??= top; sources.add(wall.id);
    for (const id of wall.provenance.sourceIDs) sources.add(id);
    // Do not truncate lineage to manufacture an admissible inferred record.
    if (sources.size > 1000) return null;
  }
  return height === undefined ? null : { height, heightBasis: 'assumed', provenance: { origin: 'inferred', sourceIDs: [...sources].sort(), classificationConfidence: 'unknown' } };
}

/** Explicit null never becomes a guessed ceiling after a later wall edit. */
export function resolvedCeilingHeight(floor: Floor, room: Room): number | null {
  return room.ceiling === undefined ? legacyCeiling(floor, room)?.height ?? null : room.ceiling?.height ?? null;
}

export function allocateCeilingID(floor: Floor, roomID: string): string {
  const used = new Set([...floor.walls, ...floor.openings, ...floor.rooms, ...(floor.areas ?? [])].map(item => item.id));
  for (const room of floor.rooms) if (room.ceiling) used.add(room.ceiling.id);
  return allocateFromUsed(used, roomID);
}
function allocateFromUsed(used: ReadonlySet<string>, roomID: string): string {
  const stem = `ceiling-${roomID}`.slice(0, 88);
  for (let suffix = 0; suffix <= used.size; suffix++) {
    const id = suffix ? `${stem}-${suffix}` : stem;
    if (identifier.test(id) && !used.has(id)) return id;
  }
  throw new Error('No unique ceiling identifier is available.');
}

/** Only call on the transaction's owned clone, never during open, display or export. */
export function establishCeilingSchema(document: SpatialDocument): void {
  if (document.schemaVersion === CEILING_SCHEMA_VERSION) return;
  if (document.schemaVersion !== '1.0.0' && document.schemaVersion !== '1.1.0') throw new Error('This ceiling adapter needs the accepted predecessor schema before migration.');
  for (const floor of document.floors) {
    const walls = new Map(floor.walls.map(wall => [wall.id, wall]));
    const used = new Set([...floor.walls, ...floor.openings, ...floor.rooms, ...(floor.areas ?? [])].map(item => item.id));
    for (const room of floor.rooms) {
      const inferred = legacyCeiling(floor, room, walls);
      room.ceiling = inferred ? { id: allocateFromUsed(used, room.id), ...inferred } : null;
      if (room.ceiling) used.add(room.ceiling.id);
    }
  }
  document.schemaVersion = CEILING_SCHEMA_VERSION;
}

interface TargetPlan extends CeilingTarget {
  label: string;
  height: number | null;
  authored: boolean;
  minimumOpeningHeight: number;
  limitingOpeningID?: string;
  maximumHeight: number;
}
interface WallPlan {
  floorID: string;
  wallID: string;
  baseY: number;
  height: number;
  floorElevation: number;
  incident: { key: string; height: number | null }[];
}
export interface CeilingEditPlan {
  documentID: string;
  revision: number;
  targets: readonly TargetPlan[];
  walls: readonly WallPlan[];
}
export interface CeilingHeightPreview {
  heights: { floorID: string; roomID: string; height: number }[];
  extensions: { floorID: string; wallID: string; height: number; previousHeight: number }[];
  changed: boolean;
}

/** Capture only the affected constraint data once, not a full graph per pointer sample. */
export function prepareCeilingEdit(document: SpatialDocument, targets: readonly CeilingTarget[]): CeilingEditPlan {
  if (!Array.isArray(targets) || !targets.length || targets.length > MAX_CEILING_TARGETS) throw new Error(`Choose 1 to ${MAX_CEILING_TARGETS} explicit rooms.`);
  const seen = new Set<string>(), selectedWalls = new Map<string, Set<string>>(), result: TargetPlan[] = [];
  // One source lookup per included floor, retained only for this command/gesture.
  const resolved = new Map<string, Map<string, number | null>>();
  const heightsFor = (floor: Floor) => {
    let heights = resolved.get(floor.id);
    if (!heights) {
      const walls = new Map(floor.walls.map(wall => [wall.id, wall]));
      heights = new Map(floor.rooms.map(room => [room.id, room.ceiling === undefined ? legacyCeiling(floor, room, walls)?.height ?? null : room.ceiling?.height ?? null]));
      resolved.set(floor.id, heights);
    }
    return heights;
  };
  for (const target of targets) {
    if (!target || typeof target.floorID!=='string' || typeof target.roomID!=='string' || !identifier.test(target.floorID) || !identifier.test(target.roomID) || seen.has(key(target))) throw new Error('The ceiling room set contains an invalid or duplicate member.');
    seen.add(key(target));
    const floor = document.floors.find(item => item.id === target.floorID), room = floor?.rooms.find(item => item.id === target.roomID);
    if (!floor || !room) throw new Error(`Missing ceiling room ${target.floorID}/${target.roomID}.`);
    const boundary = new Set(room.boundary.map(reference => reference.wallID));
    const walls = floor.walls.filter(wall => boundary.has(wall.id));
    if (walls.length !== boundary.size) throw new Error(`Room ${room.label} has a missing boundary wall.`);
    const openings = floor.openings.filter(opening => boundary.has(opening.wallID));
    let minimumOpeningHeight = 0, limitingOpeningID: string | undefined;
    const byID = new Map(walls.map(wall => [wall.id, wall]));
    for (const opening of openings) {
      const top = byID.get(opening.wallID)!.baseY + opening.bottom + opening.height;
      if (top > minimumOpeningHeight) { minimumOpeningHeight = top; limitingOpeningID = opening.id; }
    }
    result.push({ ...target, label: room.label, height: heightsFor(floor).get(room.id) ?? null, authored: room.ceiling?.heightBasis === 'edited' && room.ceiling.provenance.origin === 'edited', minimumOpeningHeight, limitingOpeningID,
      maximumHeight: Math.min(MAX_CEILING_HEIGHT, 10000 - floor.elevation, ...walls.map(wall => wall.baseY + 100)) });
    const affected = selectedWalls.get(floor.id) ?? new Set<string>(); for (const id of boundary) affected.add(id); selectedWalls.set(floor.id, affected);
  }
  const walls: WallPlan[] = [];
  for (const [floorID, ids] of selectedWalls) {
    const floor = document.floors.find(item => item.id === floorID)!;
    const heights = heightsFor(floor);
    const incidents = new Map<string, WallPlan['incident']>();
    for (const room of floor.rooms) for (const ref of room.boundary) if (ids.has(ref.wallID)) {
      const members = incidents.get(ref.wallID) ?? []; members.push({ key: key({ floorID, roomID: room.id }), height: heights.get(room.id)! }); incidents.set(ref.wallID, members);
    }
    for (const wall of floor.walls) if (ids.has(wall.id)) walls.push({ floorID, wallID: wall.id, baseY: wall.baseY, height: wall.height, floorElevation: floor.elevation, incident: incidents.get(wall.id) ?? [] });
  }
  return { documentID: document.documentID, revision: document.revision, targets: result, walls };
}

/** Pure bounded preview shared by direct manipulation and exact numeric entry. */
export function previewCeilingHeights(plan: CeilingEditPlan, mode: CeilingHeightEdit['mode'], value: number): CeilingHeightPreview {
  if ((mode !== 'delta' && mode !== 'absolute') || !Number.isFinite(value)) throw new Error('Enter a finite ceiling height or height change in meters.');
  const unknown = plan.targets.filter(target => target.height === null);
  if (mode === 'delta' && unknown.length) throw new Error(`Set an absolute starting height first for: ${unknown.map(target => target.label).join(', ')}.`);
  const heights = plan.targets.map(target => {
    const height = mode === 'absolute' ? value : target.height! + value;
    if (!Number.isFinite(height) || height <= 0 || height > target.maximumHeight) throw new Error(`Ceiling for ${target.label} must be above zero and no higher than ${target.maximumHeight} m.`);
    if (height + EPSILON < target.minimumOpeningHeight) throw new Error(`Ceiling for ${target.label} conflicts with opening ${target.limitingOpeningID}. It must be at least ${target.minimumOpeningHeight} m; the opening will not be resized.`);
    return { floorID: target.floorID, roomID: target.roomID, height };
  });
  const proposed = new Map(heights.map(target => [key(target), target.height]));
  const extensions: CeilingHeightPreview['extensions'] = [];
  for (const wall of plan.walls) {
    const top = Math.max(wall.baseY + wall.height, ...wall.incident.map(member => proposed.get(member.key) ?? member.height ?? -Infinity));
    const height = top - wall.baseY;
    if (!Number.isFinite(height) || height <= 0 || height > 100 || Math.abs(wall.floorElevation + top) > 10000) throw new Error(`Required extension for wall ${wall.wallID} exceeds the model bounds.`);
    if (height > wall.height + EPSILON) extensions.push({ floorID: wall.floorID, wallID: wall.wallID, height, previousHeight: wall.height });
  }
  const changed = heights.some((target, index) => target.height !== plan.targets[index].height || (mode === 'absolute' && !plan.targets[index].authored));
  return { heights, extensions, changed };
}

export function applyCeilingHeightEdit(document: SpatialDocument, command: CeilingHeightEdit): void {
  const preview = previewCeilingHeights(prepareCeilingEdit(document, command.targets), command.mode, command.value);
  if (!preview.changed) return;
  // Resolve all neighboring legacy intent before extending even one shared wall.
  establishCeilingSchema(document);
  for (const target of preview.heights) {
    const floor = document.floors.find(item => item.id === target.floorID)!, room = floor.rooms.find(item => item.id === target.roomID)!;
    const previous = room.ceiling;
    room.ceiling = { id: previous?.id ?? allocateCeilingID(floor, room.id), height: target.height, heightBasis: 'edited', provenance: { origin: 'edited', sourceIDs: [...(previous?.provenance.sourceIDs ?? [room.id])], classificationConfidence: previous?.provenance.classificationConfidence ?? 'unknown' } };
  }
  for (const extension of preview.extensions) {
    const wall = document.floors.find(item => item.id === extension.floorID)!.walls.find(item => item.id === extension.wallID)!;
    wall.height = extension.height; wall.heightBasis = 'edited'; wall.provenance.origin = 'edited';
  }
}

function lineage(...values: string[][]): string[] {
  const result = [...new Set(values.flat())].sort();
  if (result.length > 1000) throw new Error('Ceiling lineage exceeds the supported source count; the original rooms were retained.');
  return result;
}
export function splitCeilingIntent(floor: Floor, original: Room, created: Room): void {
  if (original.ceiling === undefined) return;
  created.ceiling = original.ceiling ? { ...structuredClone(original.ceiling), id: allocateCeilingID(floor, created.id), provenance: { ...structuredClone(original.ceiling.provenance), sourceIDs: lineage(original.ceiling.provenance.sourceIDs, [original.ceiling.id]) } } : null;
}

export function mergedCeilingIntent(floor: Floor, first: Room, second: Room, explicitHeight?: number): Ceiling | null | undefined {
  if (first.ceiling === undefined && second.ceiling === undefined && explicitHeight === undefined) return undefined;
  const a = first.ceiling, b = second.ceiling;
  if (explicitHeight === undefined && ((!a !== !b) || (a && b && Math.abs(a.height - b.height) > EPSILON))) throw new Error('These rooms have different or unknown ceiling heights. Assign an explicit common height in the same transaction before merging, or supply the resulting ceilingHeight.');
  if (!a && !b && explicitHeight === undefined) return null;
  if (explicitHeight !== undefined && (!Number.isFinite(explicitHeight) || explicitHeight <= 0 || explicitHeight > MAX_CEILING_HEIGHT)) throw new Error('The resulting ceiling height must be finite, above zero and no higher than 100 m.');
  const confidence = ['unknown', 'low', 'medium', 'high'] as const;
  const provenance: Provenance = { origin: 'edited', classificationConfidence: confidence[Math.min(confidence.indexOf(a?.provenance.classificationConfidence ?? 'unknown'), confidence.indexOf(b?.provenance.classificationConfidence ?? 'unknown'))], sourceIDs: lineage(a?.provenance.sourceIDs ?? [], b?.provenance.sourceIDs ?? [], [a?.id ?? first.id, b?.id ?? second.id]) };
  const heightBasis: HeightBasis = explicitHeight !== undefined ? 'edited' : a?.heightBasis === b?.heightBasis ? a!.heightBasis : 'assumed';
  return { id: a?.id ?? allocateCeilingID(floor, first.id), height: explicitHeight ?? a!.height, heightBasis, provenance };
}

/** Final envelope check also covers a newly assigned boundary or explicit merge height. */
export function extendCeilingEnvelopes(document: SpatialDocument): void {
  if (document.schemaVersion !== CEILING_SCHEMA_VERSION) return;
  for (const floor of document.floors) {
    const required = new Map<string, number>();
    for (const room of floor.rooms) if (room.ceiling) for (const ref of room.boundary) required.set(ref.wallID, Math.max(required.get(ref.wallID) ?? -Infinity, room.ceiling.height));
    for (const wall of floor.walls) {
      const top = Math.max(wall.baseY + wall.height, required.get(wall.id) ?? -Infinity);
      if (top > wall.baseY + wall.height + EPSILON) { wall.height = top - wall.baseY; wall.heightBasis = 'edited'; wall.provenance.origin = 'edited'; }
    }
  }
}
