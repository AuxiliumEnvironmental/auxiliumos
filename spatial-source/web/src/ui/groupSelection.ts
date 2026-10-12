import { wallRunBounds } from '../core/surfaces';
import { fixtureFootprint } from '../core/fixtures';
import { worldToSurfaceChart } from './cutoutManipulation';
import { surfacePointToWorld } from '../core/surfaces';
import { profileRing } from '../core/cutoutGeometry';
import { applyCommands, roomBoundary, wallPath } from '../core';
import { EPSILON, FloorGeometryIndex, cross, intersects, signedArea, triangulate } from '../core/geometry';
import type { EditCommand, Floor, Point2, Selection, SpatialDocument } from '../types';
import { openingPath } from './geometry';

export const selectionKey = (value: Selection): string => JSON.stringify([value.floorID, value.kind, value.objectID]);
export type SelectionBounds = { minX: number; minZ: number; maxX: number; maxZ: number };
export function containedSelections(floor: Floor, bounds: SelectionBounds, kinds: Selection['kind'][] = ['wall', 'area']): Selection[] {
  if (!Object.values(bounds).every(Number.isFinite) || bounds.maxX <= bounds.minX || bounds.maxZ <= bounds.minZ) return [];
  const inside = (point: Point2) => point.x >= bounds.minX && point.x <= bounds.maxX && point.z >= bounds.minZ && point.z <= bounds.maxZ;
  const contained = (points: Point2[]) => points.length > 0 && points.every(inside);
  const result: Selection[] = [];
  const add = (kind: Selection['kind'], objectID: string, points: Point2[]) => { if (kinds.includes(kind) && contained(points)) result.push({ floorID: floor.id, kind, objectID }); };
  for (const node of floor.nodes) add('node', node.id, [node.point]);
  for (const wall of floor.walls) add('wall', wall.id, wallPath(floor, wall));
  for (const opening of floor.openings) { const host = floor.walls.find(wall => wall.id === opening.wallID); if (host) add('opening', opening.id, openingPath(wallPath(floor, host), opening.offset, opening.width)); }
  for (const room of floor.rooms) add('room', room.id, roomBoundary(floor, room));
  for (const area of floor.areas ?? []) add('area', area.id, area.polygon);
  // Feature containment is exposed through workspace selection; charts need document input.
  return result;
}

export interface GroupTranslation {
  commands: EditCommand[];
  preview: SpatialDocument;
  nodeIDs: string[];
  affectedWallIDs: string[];
  affectedRoomIDs: string[];
}
export interface GroupTranslationDraft extends Omit<GroupTranslation, 'preview'> {
  /** Display-only, unvalidated geometry. Never save, export or navigate it. */
  uncheckedFloor: Floor;
}
const boundsOf = (points: Point2[]): SelectionBounds => ({ minX: Math.min(...points.map(p => p.x)), minZ: Math.min(...points.map(p => p.z)), maxX: Math.max(...points.map(p => p.x)), maxZ: Math.max(...points.map(p => p.z)) });
const boundsTouch = (a: SelectionBounds, b: SelectionBounds, margin = EPSILON) => a.maxX + margin >= b.minX && b.maxX + margin >= a.minX && a.maxZ + margin >= b.minZ && b.maxZ + margin >= a.minZ;
/** Strict triangle SAT: common boundary lines/points have no overlapping area. */
function triangleInteriorsOverlap(a: Point2[], b: Point2[]): boolean {
  for (const polygon of [a, b]) for (let i = 0; i < polygon.length; i++) {
    const start = polygon[i], end = polygon[(i + 1) % polygon.length], length = Math.hypot(end.x - start.x, end.z - start.z);
    const normal = { x: -(end.z - start.z) / length, z: (end.x - start.x) / length };
    const pa = a.map(p => p.x * normal.x + p.z * normal.z), pb = b.map(p => p.x * normal.x + p.z * normal.z);
    if (Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) <= EPSILON) return false;
  }
  return true;
}
function segmentCollision(p: Point2, q: Point2, r: Point2, s: Point2, shared: boolean): { kind: number; span: number } {
  if (!boundsTouch(boundsOf([p, q]), boundsOf([r, s])) || !intersects(p, q, r, s)) return { kind: 0, span: 0 };
  const a = cross(p, q, r), b = cross(p, q, s), c = cross(r, s, p), d = cross(r, s, q);
  if (Math.abs(a) <= EPSILON && Math.abs(b) <= EPSILON) {
    const length = Math.hypot(q.x - p.x, q.z - p.z), along = (v: Point2) => ((v.x - p.x) * (q.x - p.x) + (v.z - p.z) * (q.z - p.z)) / length;
    const span = Math.min(length, Math.max(along(r), along(s))) - Math.max(0, Math.min(along(r), along(s)));
    if (span > EPSILON) return { kind: 3, span };
  }
  if (shared) return { kind: 0, span: 0 };
  const opposite = (x: number, y: number) => x > EPSILON && y < -EPSILON || y > EPSILON && x < -EPSILON;
  return { kind: opposite(a, b) && opposite(c, d) ? 2 : 1, span: 0 };
}
function newWallCollision(before: FloorGeometryIndex, after: FloorGeometryIndex, a: Floor['walls'][number], b: Floor['walls'][number]): boolean {
  const left = after.path(a), right = after.path(b), oldLeft = before.path(before.walls.get(a.id)!), oldRight = before.path(before.walls.get(b.id)!);
  // Group translations retain node sequences. Compare each exact segment pair:
  // an old crossing must not exempt a new crossing elsewhere on a bent wall.
  for (let i = 1; i < left.length; i++) for (let j = 1; j < right.length; j++) {
    const shared = [a.nodeIDs[i - 1], a.nodeIDs[i]].some(id => id === b.nodeIDs[j - 1] || id === b.nodeIDs[j]);
    const next = segmentCollision(left[i - 1], left[i], right[j - 1], right[j], shared); if (!next.kind) continue;
    const old = segmentCollision(oldLeft[i - 1], oldLeft[i], oldRight[j - 1], oldRight[j], shared);
    if (next.kind > old.kind || next.kind === 3 && next.span > old.span + EPSILON) return true;
  }
  return false;
}
/** Group movement cannot guess a new junction or fold a neighbouring room over
 * a shared boundary. Semantic areas may intentionally overlap rooms. */
function assertGroupTopology(before: Floor, after: Floor, affectedWalls: Set<string>, affectedRooms: Set<string>): void {
  if (!affectedWalls.size) return;
  const oldIndex = new FloorGeometryIndex(before), nextIndex = new FloorGeometryIndex(after);
  const rooms = after.rooms.map(room => { const points = nextIndex.boundary(room); return { id: room.id, points, bounds: boundsOf(points), triangles: undefined as Point2[][] | undefined }; });
  for (const room of rooms) if (affectedRooms.has(room.id)) {
    const original = before.rooms.find(value => value.id === room.id)!;
    if (signedArea(oldIndex.boundary(original)) * signedArea(room.points) <= 0) throw new Error('This move would turn a connected room inside out. Move the shared boundary a shorter distance.');
  }
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    const a = rooms[i], b = rooms[j];
    if ((!affectedRooms.has(a.id) && !affectedRooms.has(b.id)) || !boundsTouch(a.bounds, b.bounds, -EPSILON)) continue;
    a.triangles ??= triangulate(a.points).map(triangle => triangle.map(k => a.points[k])); b.triangles ??= triangulate(b.points).map(triangle => triangle.map(k => b.points[k]));
    if (a.triangles.some(left => b.triangles!.some(right => boundsTouch(boundsOf(left), boundsOf(right), -EPSILON) && triangleInteriorsOverlap(left, right)))) throw new Error('This move would overlap room interiors. Move the group into clear space or correct the shared boundary.');
  }
  const wallBounds = new Map(after.walls.map(wall => [wall.id, boundsOf(nextIndex.path(wall))]));
  for (let i = 0; i < after.walls.length; i++) for (let j = i + 1; j < after.walls.length; j++) {
    const a = after.walls[i], b = after.walls[j];
    if ((!affectedWalls.has(a.id) && !affectedWalls.has(b.id)) || !boundsTouch(wallBounds.get(a.id)!, wallBounds.get(b.id)!)) continue;
    if (newWallCollision(oldIndex, nextIndex, a, b)) throw new Error('This move would cross or overlap another wall without a shared junction. Use explicit wall corrections to connect them.');
  }
}
/** Expand a selected room/wall only through its explicit canonical references.
 * Shared corners move once. Openings retain their host and arclength, including
 * unselected openings carried by a wall. No copy, detached graph or auto rehost. */
export function prepareGroupTranslation(document: SpatialDocument, floorID: string, selected: Selection[], delta: Point2): GroupTranslationDraft {
  if (!Number.isFinite(delta.x) || !Number.isFinite(delta.z) || Math.abs(delta.x) > 10000 || Math.abs(delta.z) > 10000 || (delta.x === 0 && delta.z === 0)) throw new Error('Choose a finite, nonzero group adjustment.');
  const floor = document.floors.find(item => item.id === floorID); if (!floor) throw new Error('The selected floor is no longer available.');
  if (!selected.length || selected.length > 10000) throw new Error('Choose a smaller group to adjust.');
  const nodes = new Set<string>(), areas = new Set<string>(), openings = new Set<string>(), fixtures=new Set<string>(),cutouts=new Set<string>(), seen = new Set<string>();
  const requireWall = (id: string) => { const wall = floor.walls.find(item => item.id === id); if (!wall) throw new Error('A selected wall is no longer available.'); return wall; };
  for (const item of selected) {
    if (item.floorID !== floorID) throw new Error('Adjust objects on one floor at a time.');
    const key = selectionKey(item); if (seen.has(key)) continue; seen.add(key);
    if (item.kind === 'node') { if (!floor.nodes.some(node => node.id === item.objectID)) throw new Error('A selected corner is no longer available.'); nodes.add(item.objectID); }
    else if (item.kind === 'wall') for (const id of requireWall(item.objectID).nodeIDs) nodes.add(id);
    else if (item.kind === 'room') { const room = floor.rooms.find(room => room.id === item.objectID); if (!room) throw new Error('A selected room is no longer available.'); for (const ref of room.boundary) for (const id of requireWall(ref.wallID).nodeIDs) nodes.add(id); }
    else if (item.kind === 'area') { if (!floor.areas?.some(area => area.id === item.objectID)) throw new Error('A selected area is no longer available.'); areas.add(item.objectID); }
    else if (item.kind === 'opening') { if (!floor.openings.some(opening => opening.id === item.objectID)) throw new Error('A selected opening is no longer available.'); openings.add(item.objectID); }
    else if(item.kind==='fixture'){if(!floor.fixtures?.some(f=>f.id===item.objectID))throw new Error('Selected fixture is unavailable');fixtures.add(item.objectID);}
    else if(item.kind==='cutout'){if(!floor.cutouts?.some(c=>c.id===item.objectID))throw new Error('Selected cutout is unavailable');cutouts.add(item.objectID);}
    else throw new Error('Unsupported group selection.');
  }
  for (const id of openings) {
    const opening = floor.openings.find(item => item.id === id)!;
    if (!requireWall(opening.wallID).nodeIDs.every(id => nodes.has(id))) throw new Error('Select the whole host wall to move an opening with this group. Use the opening handles for movement along a wall.');
  }
  const commands: EditCommand[] = [];
  for (const node of floor.nodes) if (nodes.has(node.id)) commands.push({ type: 'moveNode', floorID, nodeID: node.id, point: { x: node.point.x + delta.x, z: node.point.z + delta.z } });
  for (const area of floor.areas ?? []) if (areas.has(area.id)) commands.push({ type: 'setArea', floorID, area: { ...area, polygon: area.polygon.map(point => ({ x: point.x + delta.x, z: point.z + delta.z })) } });
  const hostMoved=(ref:import('../types').SurfaceRef)=>ref.kind==='wall'?requireWall(ref.wallID).nodeIDs.every(id=>nodes.has(id)):floor.rooms.find(r=>r.id===ref.roomID)?.boundary.every(b=>requireWall(b.wallID).nodeIDs.every(id=>nodes.has(id)));
  for(const original of floor.fixtures??[])if(fixtures.has(original.id)){const fixture=structuredClone(original);if(fixture.mount.kind==='floor'){fixture.mount.position.x+=delta.x;fixture.mount.position.z+=delta.z;}else{if(hostMoved(fixture.mount.surface))continue;const frame=importFrame(document,fixture,floorID),normal=delta.x*frame.z.x+delta.z*frame.z.z;if(Math.abs(normal)>1e-6)throw new Error('Wall fixture group movement must follow its host tangent or include the whole host');fixture.mount.u+=delta.x*frame.x.x+delta.z*frame.x.z;const originalMount=original.mount;if(originalMount.kind==='wall'){const run=wallRunBounds(document,originalMount.surface,originalMount.u);if(!run||fixture.mount.u-fixture.dimensions.width/2<run.lo-1e-6||fixture.mount.u+fixture.dimensions.width/2>run.hi+1e-6)throw new Error('Rigid group movement must stay on the original straight host run');}}commands.push({type:'setFixture',floorID,fixture});}
  for(const original of floor.cutouts??[])if(cutouts.has(original.id)){if(hostMoved(original.surface))continue;const cutout=structuredClone(original);if(cutout.surface.kind==='wall'){const center=surfacePointToWorld(document,cutout.surface,cutout.profile.center)!,next=worldToSurfaceChart(document,cutout.surface,{x:center.x+delta.x,y:center.y,z:center.z+delta.z}),point=surfacePointToWorld(document,cutout.surface,next)!;if(Math.hypot(point.x-center.x-delta.x,point.z-center.z-delta.z)>1e-6)throw new Error('Wall cutout group movement must follow its host or include the whole host');cutout.profile.center=next;}else{cutout.profile.center.u+=delta.x;cutout.profile.center.v+=delta.z;}commands.push({type:'setCutout',floorID,cutout});}
  if (!commands.length || commands.length > 1000) throw new Error('Choose a smaller group to adjust in one correction.');
  const affectedWallIDs = floor.walls.filter(wall => wall.nodeIDs.some(id => nodes.has(id))).map(wall => wall.id);
  const affected = new Set(affectedWallIDs);
  const affectedRoomIDs = floor.rooms.filter(room => room.boundary.some(ref => affected.has(ref.wallID))).map(room => room.id);
  const uncheckedFloor: Floor = { ...floor, nodes: floor.nodes.map(node => nodes.has(node.id) ? { ...node, point: { x: node.point.x + delta.x, z: node.point.z + delta.z } } : node), ...(floor.areas ? { areas: floor.areas.map(area => areas.has(area.id) ? { ...area, polygon: area.polygon.map(point => ({ x: point.x + delta.x, z: point.z + delta.z })) } : area) } : {}) };
  if(floor.fixtures)uncheckedFloor.fixtures=floor.fixtures.map(f=>commands.find((c):c is Extract<EditCommand,{type:'setFixture'}>=>c.type==='setFixture'&&c.fixture.id===f.id)?.fixture??f);
  if(floor.cutouts)uncheckedFloor.cutouts=floor.cutouts.map(c=>{const explicit=commands.find((x):x is Extract<EditCommand,{type:'setCutout'}>=>x.type==='setCutout'&&x.cutout.id===c.id)?.cutout;if(explicit)return explicit;if(c.surface.kind!=='wall'&&hostMoved(c.surface)){const value=structuredClone(c);value.profile.center.u+=delta.x;value.profile.center.v+=delta.z;return value;}return c;});
  return { commands, uncheckedFloor, nodeIDs: [...nodes], affectedWallIDs, affectedRoomIDs };
}

/** One canonical validation on completed adjustment; draft display is no proof
 * that a correction is valid. All save paths must use this result. */
export function groupTranslation(document: SpatialDocument, floorID: string, selected: Selection[], delta: Point2): GroupTranslation {
  const draft = prepareGroupTranslation(document, floorID, selected, delta), floor = document.floors.find(value => value.id === floorID)!;
  const { commands, nodeIDs, affectedWallIDs, affectedRoomIDs } = draft;
  const preview = applyCommands(document, commands, document.revision).document;
  const affected = new Set(affectedWallIDs);
  assertGroupTopology(floor, preview.floors.find(value => value.id === floorID)!, affected, new Set(affectedRoomIDs));
  return { commands, preview, nodeIDs, affectedWallIDs, affectedRoomIDs };
}

import { fixtureFrame as importFrame } from "../core/fixtures";
