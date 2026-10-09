import type { Floor, Point2, Selection, SpatialDocument, WallReference } from '../types';
import { closedRoomBoundary } from '../core';

export const uid = () => crypto.randomUUID();
export const editedProvenance = () => ({ origin: 'edited' as const, sourceIDs: [], classificationConfidence: 'unknown' as const });
export function pathLength(points: Point2[]) { return points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.z - points[i].z), 0); }
export function pointAlong(points: Point2[], offset: number): Point2 {
  if (!points.length) return { x: 0, z: 0 };
  let remaining = offset;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], length = Math.hypot(b.x - a.x, b.z - a.z);
    if (remaining <= length && length > 0) { const t = Math.max(0, remaining / length); return { x: a.x + t * (b.x - a.x), z: a.z + t * (b.z - a.z) }; }
    remaining -= length;
  }
  return { ...points[points.length - 1] };
}
export function pointInPolygon(p: Point2, points: Point2[]) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
export function distanceToPath(p: Point2, points: Point2[]) {
  let minimum = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
    minimum = Math.min(minimum, Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz));
  }
  return minimum;
}
export function closedBoundary(floor: Floor, wallIDs: string[]): WallReference[] {
  try { return closedRoomBoundary(floor, wallIDs); }
  catch { throw new Error('These walls do not form one closed boundary with shared corners. Connect the corners or choose a different boundary.'); }
}
export function objectLabel(floor: Floor, selection: Selection) {
  const index = (ids: { id: string }[]) => ids.findIndex(item => item.id === selection.objectID) + 1;
  if (selection.kind === 'room') return floor.rooms.find(r => r.id === selection.objectID)?.label ?? 'Room';
  if (selection.kind === 'area') return floor.areas?.find(a => a.id === selection.objectID)?.label ?? 'Area';
  if (selection.kind === 'opening') { const opening = floor.openings.find(o => o.id === selection.objectID); return opening ? `${opening.kind[0].toUpperCase()}${opening.kind.slice(1)} ${index(floor.openings)}` : 'Opening'; }
  return `${selection.kind === 'node' ? 'Corner' : 'Wall'} ${index(selection.kind === 'node' ? floor.nodes : floor.walls)}`;
}
export function freshDocument(title: string): SpatialDocument {
  return { schemaVersion: '1.0.0', documentID: uid(), revision: 1, title: title.trim() || 'Untitled layout', coordinateSystem: 'meters_y_up_right_handed', measurementStatus: 'unverified', reviewState: 'needsReview', floors: [{ id: uid(), label: 'Ground floor', elevation: 0, nodes: [], walls: [], openings: [], rooms: [] }] };
}
export function syntheticDocument(): SpatialDocument {
  const document = freshDocument('Courtyard study · synthetic example');
  const provenance = { origin: 'synthetic' as const, sourceIDs: [], classificationConfidence: 'unknown' as const };
  const floor = document.floors[0];
  floor.nodes = [[0,0],[4,0],[8,0],[8,4],[4,4],[0,4]].map(([x,z], i) => ({ id: `n${i}`, point: {x,z} }));
  floor.walls = [[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[1,4]].map(([a,b],i) => ({ id:`w${i}`, nodeIDs:[`n${a}`,`n${b}`], baseY:0,height:2.6,heightBasis:'synthetic',provenance: structuredClone(provenance) }));
  floor.openings = [
    {id:'door-a',wallID:'w6',kind:'door',offset:1,width:0.9,bottom:0,height:2.05,provenance:structuredClone(provenance)},
    {id:'window-a',wallID:'w4',kind:'window',offset:1,width:1.4,bottom:0.9,height:1.1,provenance:structuredClone(provenance)},
    {id:'entry',wallID:'w1',kind:'passage',offset:1.5,width:0.9,bottom:0,height:2.05,provenance:structuredClone(provenance)},
  ];
  floor.rooms = [
    {id:'room-a',label:'Living room',boundary:['w0','w6','w4','w5'].map(wallID=>({wallID,reversed:false}))},
    {id:'room-b',label:'Studio',boundary:[...['w1','w2','w3'].map(wallID=>({wallID,reversed:false})),{wallID:'w6',reversed:true}]},
  ];
  return document;
}
