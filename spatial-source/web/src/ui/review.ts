import { WalkNavigation } from '../core';
import type { Floor, Selection, SpatialDocument } from '../types';

export interface ReviewItem { id: string; severity: 'connection' | 'boundary' | 'source'; title: string; detail: string; selection?: Selection }
/** These are facts about the current graph, not a claim to diagnose the property. */
export function reviewItems(document: SpatialDocument, floor: Floor): ReviewItem[] {
  const result: ReviewItem[] = [], members = new Map<string, number>();
  const select = (kind: Selection['kind'], objectID: string): Selection => ({ floorID: floor.id, kind, objectID });
  for (const wall of floor.walls) for (const nodeID of [wall.nodeIDs[0], wall.nodeIDs.at(-1)!]) members.set(nodeID, (members.get(nodeID) ?? 0) + 1);
  for (const node of floor.nodes) if (members.get(node.id) === 1) result.push({ id: `end-${node.id}`, severity: 'connection', title: 'A wall ends without a shared connection', detail: 'Select this corner to connect it explicitly, continue the wall, or confirm that it is an intended incomplete boundary.', selection: select('node', node.id) });
  const referenced = new Set(floor.rooms.flatMap(room => room.boundary.map(w => w.wallID)));
  for (const wall of floor.walls) {
    if (!referenced.has(wall.id)) result.push({ id: `boundary-${wall.id}`, severity: 'boundary', title: 'Wall outside a closed room region', detail: 'This wall is drawn but belongs to no modeled room boundary. Complete the boundary or use it as a deliberate partition.', selection: select('wall', wall.id) });
    if (wall.provenance.origin === 'inferred') result.push({ id: `source-${wall.id}`, severity: 'source', title: 'Inferred boundary needs checking', detail: 'This surface was inferred. Check it against the property before relying on the layout.', selection: select('wall', wall.id) });
  }
  if (!floor.rooms.length) result.push({ id: 'no-room', severity: 'boundary', title: 'No closed room regions on this floor', detail: 'Draw connected boundary walls and create a room. Empty space is not silently treated as captured floor.' });
  try {
    const navigation = new WalkNavigation(document, floor.id);
    for (const restriction of navigation.restrictions) {
      const opening = floor.openings.find(o => o.id === restriction.openingID);
      if (!opening || opening.kind === 'window') continue;
      result.push({ id: `portal-${opening.id}`, severity: 'connection', title: 'Opening has no traversable room connection', detail: `${restriction.reason}. Walking remains blocked until its boundary and clearance are compatible.`, selection: select('opening', opening.id) });
    }
  } catch {
    result.push({ id: 'navigation', severity: 'boundary', title: 'Walking needs a valid room layout', detail: 'Correct the room geometry before using movement through the model.' });
  }
  return result.sort((a, b) => ['connection', 'boundary', 'source'].indexOf(a.severity) - ['connection', 'boundary', 'source'].indexOf(b.severity));
}
