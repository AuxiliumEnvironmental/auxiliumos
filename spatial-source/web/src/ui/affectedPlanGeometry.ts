import { affectedPlanPrimitives } from '../core/affectedAreas';
import type { Floor, SpatialDocument } from '../types';

type Primitives = ReturnType<typeof affectedPlanPrimitives>;
const snapshots = new WeakMap<SpatialDocument, Map<string, { floor: Floor; revision: number; primitives: Primitives }>>();

/** UI snapshots and gesture previews replace their document/floor objects.
 * Reuse only that exact snapshot across plan remounts. Weak keys release the
 * derived geometry when closing the document; mutable core drafts never use it.
 */
export function affectedPlanGeometry(document: SpatialDocument, floor: Floor): Primitives {
  let floors = snapshots.get(document);
  if (!floors) { floors = new Map(); snapshots.set(document, floors); }
  const previous = floors.get(floor.id);
  if (previous?.floor === floor && previous.revision === document.revision) return previous.primitives;
  const primitives = affectedPlanPrimitives(document, floor.id);
  floors.set(floor.id, { floor, revision: document.revision, primitives });
  return primitives;
}
