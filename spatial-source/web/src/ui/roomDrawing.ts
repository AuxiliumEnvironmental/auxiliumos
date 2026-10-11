import type { EditCommand, Floor, Node, Point2, SpatialDocument, WallReference } from '../types';
import { distance, EPSILON, finitePoint, FloorGeometryIndex, interpolate, intersects, isSimplePolygon, pathLength, pathPoint, strictlyContains } from '../core/geometry';
import { applyCommands } from '../core/editor';
import { editedProvenance, uid } from './geometry';

/** Axis-aligned room corners in canonical boundary order, independent of drag direction. */
export function rectangleCorners(a: Point2, b: Point2): Point2[] {
  const left = Math.min(a.x, b.x), right = Math.max(a.x, b.x);
  const top = Math.min(a.z, b.z), bottom = Math.max(a.z, b.z);
  return [{ x: left, z: top }, { x: right, z: top }, { x: right, z: bottom }, { x: left, z: bottom }];
}

type Side = { a: Point2; b: Point2; length: number; stops: number[] };
type Span = { wallID: string; side: number; from: number; to: number };
type Contact = { node: Node; offset: number; wallID: string };
type Cut = Contact & { newWallID: string; existingNode: boolean };
type Piece = { from: number; to: number; wallID: string };
const near = (a: number, b: number) => Math.abs(a - b) <= EPSILON;
const along = (side: Side, p: Point2) => ((p.x - side.a.x) * (side.b.x - side.a.x) + (p.z - side.a.z) * (side.b.z - side.a.z)) / side.length;
const sidePoint = (side: Side, offset: number) => interpolate(side.a, side.b, offset / side.length);
const onLine = (side: Side, p: Point2) => Math.abs((side.b.x - side.a.x) * (p.z - side.a.z) - (side.b.z - side.a.z) * (p.x - side.a.x)) / side.length <= EPSILON;
const onSide = (side: Side, p: Point2) => onLine(side, p) && along(side, p) >= -EPSILON && along(side, p) <= side.length + EPSILON;
const clamp = (n: number, length: number) => Math.max(0, Math.min(length, n));

/** A closed rectangle clip, used only to reject walls that pass through its interior. */
function interiorCrossing(a: Point2, b: Point2, corners: Point2[]): boolean {
  let from = 0, to = 1;
  for (const [start, delta, low, high] of [[a.x, b.x - a.x, corners[0].x, corners[2].x], [a.z, b.z - a.z, corners[0].z, corners[2].z]]) {
    if (delta === 0) { if (start < low || start > high) return false; continue; }
    const first = (low - start) / delta, last = (high - start) / delta;
    from = Math.max(from, Math.min(first, last)); to = Math.min(to, Math.max(first, last));
    if (from > to) return false;
  }
  return strictlyContains(interpolate(a, b, (from + to) / 2), corners);
}

/** Numerical coincidence is EPSILON only, never an invisible visual snapping distance. */
function offsetAt(points: Point2[], p: Point2): number | undefined {
  let cursor = 0, match: number | undefined;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], length = distance(a, b);
    const t = clamp(((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / (length * length), 1);
    if (distance(p, interpolate(a, b, t)) <= EPSILON) {
      const candidate = cursor + t * length;
      if (match !== undefined && !near(match, candidate)) throw new Error('An existing wall has an ambiguous contact. Correct that wall before drawing this room.');
      match = candidate;
    }
    cursor += length;
  }
  return match;
}

/**
 * Manual rectangles reuse explicitly contacted, compatible boundary walls. Partial
 * spans use the canonical splitWall command, preserving source lineage, openings
 * and adjacent room winding. Contact never creates a door or a guessed passage.
 * The complete batch is one validated, undoable editor transaction.
 */
export function rectangleRoomCommands(floor: Floor, a: Point2, b: Point2): { commands: EditCommand[]; roomID: string; submittedIDs: string[] } {
  const corners = rectangleCorners(a, b);
  if (!finitePoint(a) || !finitePoint(b) || Math.abs(a.x - b.x) <= EPSILON || Math.abs(a.z - b.z) <= EPSILON || !isSimplePolygon(corners)) {
    throw new Error('Choose opposite corners with space between them in both directions. The room draft is still editable.');
  }
  const index = new FloorGeometryIndex(floor);
  const sides: Side[] = corners.map((point, i) => ({ a: point, b: corners[(i + 1) % 4], length: distance(point, corners[(i + 1) % 4]), stops: [0, distance(point, corners[(i + 1) % 4])] }));
  const paths = new Map(floor.walls.map(wall => [wall.id, index.path(wall)]));
  const spans: Span[] = [], touched = new Set<string>();
  const crossingError = 'This rectangle touches or crosses an existing wall through its interior. Move the draft outside existing walls, or split the existing room explicitly.';
  for (const wall of floor.walls) {
    const path = paths.get(wall.id)!;
    const raw: Span[] = [];
    for (let i = 1; i < path.length; i++) {
      const start = path[i - 1], end = path[i];
      if (interiorCrossing(start, end, corners)) throw new Error(crossingError);
      for (const [sideNumber, side] of sides.entries()) {
        if (onLine(side, start) && onLine(side, end)) {
          const from = Math.max(0, Math.min(along(side, start), along(side, end))), to = Math.min(side.length, Math.max(along(side, start), along(side, end)));
          if (to - from > EPSILON) { raw.push({ wallID: wall.id, side: sideNumber, from, to }); touched.add(wall.id); }
          else if (to >= from - EPSILON) { side.stops.push(clamp((from + to) / 2, side.length)); touched.add(wall.id); }
        } else {
          let contact = false;
          for (const point of [start, end]) if (onSide(side, point)) { side.stops.push(clamp(along(side, point), side.length)); contact = true; }
          for (const point of [side.a, side.b]) if (offsetAt([start, end], point) !== undefined) contact = true;
          if (contact) touched.add(wall.id);
          else if (intersects(side.a, side.b, start, end)) throw new Error(crossingError);
        }
      }
    }
    // Keep a whole collinear polyline as one wall unless an actual junction or
    // rectangle corner requires splitting it. Redundant captured nodes survive.
    raw.sort((left, right) => left.side - right.side || left.from - right.from);
    const merged: Span[] = [];
    for (const span of raw) {
      const previous = merged.at(-1);
      if (previous?.side === span.side && near(previous.to, span.from)) previous.to = span.to;
      else merged.push({ ...span });
    }
    for (const span of merged) { spans.push(span); sides[span.side].stops.push(span.from, span.to); }
  }
  const center = interpolate(corners[0], corners[2], .5);
  if (floor.nodes.some(node => strictlyContains(node.point, corners)) || floor.rooms.some(room => [center, ...corners].some(point => strictlyContains(point, index.boundary(room))))) {
    throw new Error('This rectangle overlaps existing geometry. Move the draft outside the existing room, or split that room explicitly.');
  }
  const touchedWalls = floor.walls.filter(wall => touched.has(wall.id));
  const height = touchedWalls[0]?.height ?? 2.6;
  if (touchedWalls.some(wall => !near(wall.baseY, 0) || !near(wall.height, height))) {
    throw new Error('The existing boundary walls have incompatible floor bases or heights. Correct their profiles before connecting this room.');
  }
  for (const side of sides) {
    side.stops.sort((left, right) => left - right);
    const distinct: number[] = [];
    for (const stop of side.stops) if (!distinct.length || !near(stop, distinct.at(-1)!)) distinct.push(stop);
    side.stops = distinct;
    // Retain exact requested endpoints after a numerically coincident contact.
    side.stops[0] = 0; side.stops[side.stops.length - 1] = side.length;
  }
  if (sides.reduce((count, side) => count + side.stops.length - 1, 0) > 1000) throw new Error('This room boundary has too many junctions for one correction. Use smaller explicit edits.');

  const commands: EditCommand[] = [], newNodes: Node[] = [], plannedNodes: Node[] = [], cuts = new Map<string, Cut[]>();
  const nodeBins = new Map<string, Node[]>(), bin = (x: number, z: number) => `${x}:${z}`;
  for (const node of floor.nodes) {
    const key = bin(Math.floor(node.point.x / EPSILON), Math.floor(node.point.z / EPSILON));
    nodeBins.set(key, [...(nodeBins.get(key) ?? []), node]);
  }
  function boundaryNode(point: Point2): Node {
    const planned = plannedNodes.find(node => distance(node.point, point) <= EPSILON);
    if (planned) return planned;
    const nearby: Node[] = [], bx = Math.floor(point.x / EPSILON), bz = Math.floor(point.z / EPSILON);
    for (let x = bx - 1; x <= bx + 1; x++) for (let z = bz - 1; z <= bz + 1; z++) {
      nearby.push(...(nodeBins.get(bin(x, z)) ?? []).filter(node => distance(node.point, point) <= EPSILON));
    }
    if (nearby.length > 1) throw new Error('Several existing corners coincide here but are not connected. Connect them explicitly before drawing this room.');
    const contacts = touchedWalls.flatMap(wall => {
      const offset = offsetAt(paths.get(wall.id)!, point);
      return offset === undefined ? [] : [{ wall, offset }];
    });
    const interior = contacts.filter(({ wall, offset }) => offset > EPSILON && offset < pathLength(paths.get(wall.id)!) - EPSILON);
    let node = nearby[0];
    if (node && interior.some(({ wall }) => !wall.nodeIDs.includes(node.id))) {
      throw new Error('Existing walls meet here without a shared corner. Split and connect that junction explicitly before drawing this room.');
    }
    if (!node && interior.length > 1) throw new Error('Several existing walls meet at this unsplit point. Correct the ambiguous junction before drawing this room.');
    if (!node) {
      node = { id: uid(), point: interior.length ? pathPoint(paths.get(interior[0].wall.id)!, interior[0].offset) : { ...point } };
      if (!interior.length) newNodes.push(node);
    }
    for (const { wall, offset } of interior) {
      const existingNode = wall.nodeIDs.includes(node.id);
      // splitWall reuses a sufficiently close internal path node. Its opening
      // rehosting offset must be that exact node's arclength too; subtracting the
      // projected pointer offset would otherwise move openings by up to EPSILON.
      const exactOffset = existingNode ? pathLength(paths.get(wall.id)!.slice(0, wall.nodeIDs.indexOf(node.id) + 1)) : offset;
      const previous = cuts.get(wall.id) ?? [];
      if (!previous.some(cut => near(cut.offset, exactOffset))) previous.push({ wallID: wall.id, offset: exactOffset, node, existingNode, newWallID: uid() });
      cuts.set(wall.id, previous);
    }
    plannedNodes.push(node);
    return node;
  }
  const edgeNodes = sides.map(side => side.stops.map(stop => boundaryNode(sidePoint(side, stop))));
  const pieces = new Map<string, Piece[]>();
  for (const wall of touchedWalls) {
    const sorted = [...(cuts.get(wall.id) ?? [])].sort((left, right) => left.offset - right.offset);
    const length = pathLength(paths.get(wall.id)!);
    for (const cut of [...sorted].reverse()) {
      commands.push({ type: 'splitWall', floorID: floor.id, wallID: wall.id, offset: cut.offset, newWallID: cut.newWallID, ...(cut.existingNode ? {} : { newNodeID: cut.node.id }) });
    }
    pieces.set(wall.id, [0, ...sorted.map(cut => cut.offset)].map((from, i) => ({ from, to: sorted[i]?.offset ?? length, wallID: i === 0 ? wall.id : sorted[i - 1].newWallID })));
  }
  const boundary: WallReference[] = [];
  let reverseBoundary: boolean | undefined;
  for (const [sideNumber, side] of sides.entries()) for (let i = 1; i < side.stops.length; i++) {
    const from = side.stops[i - 1], to = side.stops[i], middle = (from + to) / 2;
    const owners = spans.filter(span => span.side === sideNumber && middle > span.from - EPSILON && middle < span.to + EPSILON);
    if (owners.length > 1) throw new Error('Several existing walls overlap this boundary. Resolve the duplicate walls before drawing this room.');
    if (owners.length) {
      const owner = owners[0], path = paths.get(owner.wallID)!;
      const first = offsetAt(path, edgeNodes[sideNumber][i - 1].point), last = offsetAt(path, edgeNodes[sideNumber][i].point);
      const piece = pieces.get(owner.wallID)?.find(candidate => first !== undefined && last !== undefined && near(candidate.from, Math.min(first, last)) && near(candidate.to, Math.max(first, last)));
      if (!piece || first === undefined || last === undefined) throw new Error('This existing wall cannot be shared without an ambiguous boundary. Split it explicitly first.');
      const reference = { wallID: piece.wallID, reversed: first > last };
      const uses = floor.rooms.flatMap(room => room.boundary.filter(ref => ref.wallID === owner.wallID));
      if (uses.length > 1) throw new Error('This existing boundary already belongs to two rooms. A third room cannot share the same wall.');
      if (uses.length) {
        const required = uses[0].reversed === reference.reversed;
        if (reverseBoundary !== undefined && reverseBoundary !== required) throw new Error('The existing rooms have incompatible boundary directions. Correct their winding before drawing this room.');
        reverseBoundary = required;
      }
      boundary.push(reference);
    } else {
      const id = uid();
      commands.push({ type: 'addWall', floorID: floor.id, newNodes: [], wall: { id, nodeIDs: [edgeNodes[sideNumber][i - 1].id, edgeNodes[sideNumber][i].id], baseY: 0, height, heightBasis: 'assumed', provenance: editedProvenance() } });
      boundary.push({ wallID: id, reversed: false });
    }
  }
  const firstWall = commands.find((command): command is Extract<EditCommand, { type: 'addWall' }> => command.type === 'addWall');
  if (newNodes.length && !firstWall) throw new Error('The existing room boundary is incomplete. Correct it before creating this room.');
  if (firstWall) firstWall.newNodes = newNodes;
  let number = 1;
  const labels = new Set(floor.rooms.map(room => room.label));
  while (labels.has(`Room ${number}`)) number++;
  const roomID = uid();
  const ordered = reverseBoundary ? [...boundary].reverse().map(reference => ({ ...reference, reversed: !reference.reversed })) : boundary;
  commands.push({ type: 'addRoom', floorID: floor.id, room: { id: roomID, label: `Room ${number}`, boundary: ordered } });
  // The actual editor remains the sole mutation authority. This dry run also
  // checks opening-safe splits and complete room rings before discarding a draft.
  const preview: SpatialDocument = { schemaVersion: floor.areas === undefined ? '1.0.0' : '1.1.0', documentID: 'rectangle-preflight', revision: 1, title: 'Rectangle preflight', coordinateSystem: 'meters_y_up_right_handed', measurementStatus: 'unverified', reviewState: 'needsReview', floors: [floor] };
  applyCommands(preview, commands, preview.revision);
  return { commands, roomID, submittedIDs: [...new Set([...boundary.map(reference => reference.wallID), ...commands.flatMap(command => command.type === 'splitWall' ? [command.newWallID] : []), roomID])] };
}
