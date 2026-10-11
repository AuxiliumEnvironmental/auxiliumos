import type { EditCommand, Floor, Node } from '../types';
import { distance, EPSILON, FloorGeometryIndex, pathLength } from '../core/geometry';
import { applyCommands } from '../core/editor';
import { boundaryTargets } from './authoringSnap';
import { editedProvenance, freshDocument, uid } from './geometry';
import { overlappingSpan, type DrawPoint } from './planInteraction';

/** Resolve explicit endpoint contacts through existing canonical split commands.
 * The entire drawing stays one transaction. No schema or recovery fields change:
 * exact endpoint coordinates reconstruct contacts after reopening a draft too. */
export function wallDrawingCommands(floor: Floor, draft: DrawPoint[]): { commands: EditCommand[]; submittedIDs: string[] } {
  if (draft.length < 2) throw new Error('Choose at least two corners for the wall.');
  const index = new FloorGeometryIndex(floor);
  const cuts = new Map<string, Array<{ offset: number; node: Node; existing: boolean; wallID: string }>>();
  const resolved = new Map<string, Node>(), planned: Node[] = [];
  for (const point of draft) {
    if (resolved.has(point.nodeID)) continue;
    const existing = floor.nodes.filter(node => distance(node.point, point) <= EPSILON);
    // Identity is explicit when a saved corner was selected. Free contacts must
    // not silently merge two coincident, unconnected saved corners.
    const selected = existing.find(node => node.id === point.nodeID);
    if (existing.length > 1 && !selected) throw new Error('Several unconnected corners coincide here. Choose the intended corner before finishing.');
    let node = selected ?? existing[0] ?? planned.find(node => distance(node.point, point) <= EPSILON);
    const contacts = boundaryTargets(floor, point, index).filter(target => distance(target.point, point) <= EPSILON);
    const interiors = contacts.filter(target => target.offset > EPSILON && target.offset < pathLength(index.path(floor.walls.find(wall => wall.id === target.wallID)!)) - EPSILON);
    if (!node && interiors.length > 1) throw new Error('Several walls cross at this point without a shared corner. Choose a clear part of one wall.');
    node ??= { id: point.nodeID, point: { x: point.x, z: point.z } };
    for (const contact of interiors) {
      const host = floor.walls.find(wall => wall.id === contact.wallID)!;
      const position = host.nodeIDs.indexOf(node.id);
      if (floor.nodes.some(saved => saved.id === node.id) && position < 0) throw new Error('These existing walls meet without a shared corner. Connect that junction in Details first.');
      const offset = position >= 0 ? pathLength(index.path(host).slice(0, position + 1)) : contact.offset;
      const previous = cuts.get(host.id) ?? [];
      if (!previous.some(cut => Math.abs(cut.offset - offset) <= EPSILON)) previous.push({ offset, node, existing: position >= 0, wallID: uid() });
      cuts.set(host.id, previous);
    }
    resolved.set(point.nodeID, node); planned.push(node);
  }
  const commands: EditCommand[] = [], submittedIDs: string[] = [];
  const known = new Set(floor.nodes.map(node => node.id));
  for (const [hostID, contacts] of cuts) for (const cut of contacts.sort((a, b) => b.offset - a.offset)) {
    commands.push({ type: 'splitWall', floorID: floor.id, wallID: hostID, offset: cut.offset, newWallID: cut.wallID, ...(cut.existing ? {} : { newNodeID: cut.node.id }) });
    known.add(cut.node.id); submittedIDs.push(cut.wallID);
  }
  const points = draft.map(point => resolved.get(point.nodeID)!);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (distance(a.point, b.point) <= EPSILON) throw new Error('Choose different start and end corners.');
    if (floor.walls.some(wall => index.path(wall).some((point, n, path) => n > 0 && overlappingSpan(a.point, b.point, path[n - 1], point))) ||
      points.slice(0, i - 1).some((point, n) => overlappingSpan(a.point, b.point, point.point, points[n + 1].point))) {
      throw new Error('A wall already follows that span. Adjust the draft before finishing.');
    }
    const newNodes: Node[] = [];
    for (const node of [a, b]) if (!known.has(node.id)) { known.add(node.id); newNodes.push(node); }
    const id = uid(); submittedIDs.push(id);
    commands.push({ type: 'addWall', floorID: floor.id, newNodes, wall: { id, nodeIDs: [a.id, b.id], baseY: 0, height: 2.6, heightBasis: 'assumed', provenance: editedProvenance() } });
  }
  // Validation owns opening-safe splits, room winding, lineage, and durability.
  applyCommands({ ...freshDocument('Wall drawing validation'), schemaVersion: floor.areas === undefined ? '1.0.0' : '1.1.0', floors: [floor] }, commands, 1);
  return { commands, submittedIDs };
}
