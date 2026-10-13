import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { applyCommands, buildScene, pathPoint, roomBoundary, signedArea, validateDocument, WalkNavigation, wallPath } from '../../src/core';
import { SpatialWebStore } from '../../src/data/store';
import { freshDocument } from '../../src/ui/geometry';
import { rectangleCorners, rectangleRoomCommands } from '../../src/ui/roomDrawing';
import type { Floor, Point2, SpatialDocument } from '../../src/types';

const p = (x: number, z: number): Point2 => ({ x, z });
function add(document: SpatialDocument, a: Point2, b: Point2, floorID = document.floors[0].id) {
  const packet = rectangleRoomCommands(document.floors.find(floor => floor.id === floorID)!, a, b);
  return { ...applyCommands(document, packet.commands, document.revision), ...packet };
}
function base() { return add(freshDocument('Connected rectangle synthetic tests'), p(0, 0), p(4, 4)).document; }
function wallBetween(floor: Floor, a: Point2, b: Point2) {
  return floor.walls.find(wall => { const path = wallPath(floor, wall); return JSON.stringify(path[0]) === JSON.stringify(a) && JSON.stringify(path.at(-1)) === JSON.stringify(b); })!;
}
function openingPoints(document: SpatialDocument) {
  const floor = document.floors[0];
  return floor.openings.map(opening => { const path = wallPath(floor, floor.walls.find(wall => wall.id === opening.wallID)!); return { id: opening.id, a: pathPoint(path, opening.offset), b: pathPoint(path, opening.offset + opening.width), kind: opening.kind, bottom: opening.bottom, height: opening.height, provenance: opening.provenance }; });
}
function sameScene(document: SpatialDocument) {
  const floor = document.floors[0], scene = buildScene(document, floor.id);
  assert.deepEqual(validateDocument(document), []);
  for (const room of floor.rooms) assert.deepEqual(scene.faces.find(face => face.role === 'floor' && face.objectID === room.id)?.vertices.map(({ x, z }) => ({ x, z })), roomBoundary(floor, room));
  assert.deepEqual(new Set(scene.faces.filter(face => face.role === 'wall').map(face => face.objectID)), new Set(floor.walls.map(wall => wall.id)));
}
function rejectsUnchanged(document: SpatialDocument, a: Point2, b: Point2, message = /existing|room|corner|Split|opening|boundary|height|wall|Invalid|bound/i) {
  const before = structuredClone(document); assert.throws(() => rectangleRoomCommands(document.floors[0], a, b), message); assert.deepEqual(document, before);
}

test('clear rectangle retains four canonical walls, assumed heights and shared 2D/3D IDs', () => {
  const source = freshDocument('Clear rectangle'), result = add(source, p(5, 3), p(1, 1)), floor = result.document.floors[0];
  assert.deepEqual(rectangleCorners(p(5, 3), p(1, 1)), [p(1, 1), p(5, 1), p(5, 3), p(1, 3)]);
  assert.equal(floor.walls.length, 4); assert.equal(floor.nodes.length, 4); assert.equal(result.commands.length, 5);
  assert.equal(source.revision, 1); assert.equal(source.floors[0].walls.length, 0);
  assert.ok(floor.walls.every(wall => wall.heightBasis === 'assumed' && wall.provenance.origin === 'edited')); sameScene(result.document);
});
for (const [label, a, b] of [
  ['right', p(4, 0), p(7, 4)], ['left', p(-3, 0), p(0, 4)], ['above', p(0, -3), p(4, 0)], ['below', p(0, 4), p(4, 7)],
] as const) test(`whole ${label} shared boundary is reused without duplicating or splitting the saved wall`, () => {
  const source = base(), before = structuredClone(source), result = add(source, a, b), floor = result.document.floors[0];
  assert.equal(result.commands.filter(command => command.type === 'splitWall').length, 0); assert.equal(result.commands.filter(command => command.type === 'addWall').length, 3);
  assert.equal(floor.walls.length, 7); assert.equal(floor.nodes.length, 6); assert.equal(floor.rooms.length, 2);
  assert.deepEqual(floor.walls.slice(0, 4), source.floors[0].walls); assert.deepEqual(source, before);
  const common = floor.rooms[0].boundary.filter(ref => floor.rooms[1].boundary.some(other => other.wallID === ref.wallID));
  assert.equal(common.length, 1); assert.notEqual(common[0].reversed, floor.rooms[1].boundary.find(ref => ref.wallID === common[0].wallID)?.reversed);
  assert.equal(new WalkNavigation(result.document, floor.id).portals.length, 0); sameScene(result.document);
});

test('partial shared span composes canonical split lineage, keeps source IDs and rehosts every opening without movement', () => {
  const source = base(), floor = source.floors[0], host = wallBetween(floor, p(4, 0), p(4, 4));
  host.heightBasis = 'captured'; host.provenance = { origin: 'captured', sourceIDs: ['apple-observation-1'], classificationConfidence: 'high' };
  floor.openings = [.1, 1.3, 3.5].map((offset, i) => ({ id: `opening-${i}`, wallID: host.id, kind: i === 1 ? 'door' : 'window', offset, width: .35, bottom: i === 1 ? 0 : .8, height: i === 1 ? 2 : 1, provenance: structuredClone(host.provenance) }));
  const before = structuredClone(source), world = openingPoints(source), result = add(source, p(4, 1), p(7, 3)), out = result.document.floors[0];
  assert.equal(result.commands.filter(command => command.type === 'splitWall').length, 2);
  assert.equal(out.walls.length, 9); assert.equal(out.rooms[0].boundary.length, 6); assert.equal(out.rooms[1].boundary.length, 4);
  assert.deepEqual(openingPoints(result.document), world); assert.deepEqual(source, before);
  const lineage = result.receipt.mappings.find(mapping => mapping.objectKind === 'wall' && mapping.sourceID === host.id)!;
  assert.equal(lineage.resultingIDs.length, 3); assert.ok(lineage.resultingIDs.includes(host.id)); assert.equal(lineage.requiresOverlayReview, true);
  for (const id of lineage.resultingIDs) { const wall = out.walls.find(wall => wall.id === id)!; assert.deepEqual(wall.provenance.sourceIDs, ['apple-observation-1']); assert.equal(wall.provenance.origin, 'edited'); assert.equal(wall.heightBasis, 'captured'); }
  assert.equal(signedArea(roomBoundary(out, out.rooms[0])), 16); assert.equal(signedArea(roomBoundary(out, out.rooms[1])), 6); sameScene(result.document);
});

test('collinear captured path nodes survive whole-wall reuse without unnecessary splits', () => {
  const source = base(), floor = source.floors[0], host = wallBetween(floor, p(4, 0), p(4, 4));
  floor.nodes.push({ id: 'captured-middle', point: p(4, 2) }); host.nodeIDs.splice(1, 0, 'captured-middle');
  const result = add(source, p(4, 0), p(7, 4)); assert.ok(!result.commands.some(command => command.type === 'splitWall'));
  assert.deepEqual(result.document.floors[0].walls.find(wall => wall.id === host.id), host); sameScene(result.document);
});

test('partial sharing splits at an existing internal path node and preserves its identity', () => {
  const source = base(), floor = source.floors[0], host = wallBetween(floor, p(4, 0), p(4, 4));
  floor.nodes.push({ id: 'captured-middle', point: p(4, 2) }); host.nodeIDs.splice(1, 0, 'captured-middle');
  const result = add(source, p(4, 2), p(7, 4)), out = result.document.floors[0], splits = result.commands.filter(command => command.type === 'splitWall');
  assert.equal(splits.length, 1); assert.equal(splits[0].newNodeID, undefined);
  assert.equal(out.nodes.filter(node => node.point.x === 4 && node.point.z === 2).length, 1); assert.equal(out.nodes.length, 7); sameScene(result.document);
});

test('bent source wall splits at its explicit corner so only its matching branch becomes a shared boundary', () => {
  let source = base(); const floor = source.floors[0]; const first = wallBetween(floor, p(0, 0), p(4, 0)), second = wallBetween(floor, p(4, 0), p(4, 4));
  source = applyCommands(source, [{ type: 'joinWalls', floorID: floor.id, firstWallID: first.id, secondWallID: second.id }], source.revision).document;
  const result = add(source, p(4, 0), p(7, 4)), out = result.document.floors[0]; assert.equal(result.commands.filter(command => command.type === 'splitWall').length, 1);
  assert.deepEqual(wallPath(out, out.walls.find(wall => wall.id === first.id)!), [p(0, 0), p(4, 0)]);
  assert.equal(result.receipt.mappings.find(mapping => mapping.sourceID === first.id)?.resultingIDs.length, 2); sameScene(result.document);
});

test('compatible saved heights extend as explicit assumptions while captured walls retain their metadata', () => {
  const source = base(); for (const wall of source.floors[0].walls) { wall.height = 3.15; wall.heightBasis = 'captured'; wall.provenance.sourceIDs = ['captured-profile']; }
  const result = add(source, p(4, 0), p(7, 4)); assert.deepEqual(result.document.floors[0].walls.slice(0, 4), source.floors[0].walls);
  for (const wall of result.document.floors[0].walls.slice(4)) { assert.equal(wall.height, 3.15); assert.equal(wall.heightBasis, 'assumed'); assert.deepEqual(wall.provenance.sourceIDs, []); }
});

test('clockwise saved room winding is retained and the new room traverses its partition oppositely', () => {
  const source = base(), room = source.floors[0].rooms[0]; room.boundary.reverse(); for (const ref of room.boundary) ref.reversed = !ref.reversed;
  const result = add(source, p(4, 1), p(7, 3)), out = result.document.floors[0]; assert.ok(out.rooms.every(room => signedArea(roomBoundary(out, room)) < 0)); sameScene(result.document);
});

test('adjacent rooms gain navigation only through an existing explicit floor-level door', () => {
  const source = base(), floor = source.floors[0], host = wallBetween(floor, p(4, 0), p(4, 4));
  floor.openings = [{ id: 'explicit-door', wallID: host.id, kind: 'door', offset: 1, width: 1, bottom: 0, height: 2.1, provenance: { origin: 'edited', sourceIDs: [], classificationConfidence: 'unknown' } }];
  const result = add(source, p(4, 0), p(7, 4)), nav = new WalkNavigation(result.document, floor.id);
  assert.equal(result.document.floors[0].openings.length, 1); assert.deepEqual(result.document.floors[0].openings, floor.openings); assert.deepEqual(nav.portals.map(portal => portal.openingID), ['explicit-door']);
  assert.equal(nav.move(nav.place(p(2, 1.5)), p(6, 1.5)).reachedTarget, true);
  const window = structuredClone(result.document); window.floors[0].openings[0].kind = 'window'; const blocked = new WalkNavigation(window, floor.id);
  assert.equal(blocked.portals.length, 0); assert.equal(blocked.move(blocked.place(p(2, 1.5)), p(6, 1.5)).stop, 'wall'); sameScene(result.document);
});

test('corner-only room contact reuses one explicit node but does not imply a passage', () => {
  const source = base(), result = add(source, p(4, 4), p(7, 7)), floor = result.document.floors[0];
  assert.equal(floor.nodes.length, 7); assert.equal(floor.walls.length, 8); assert.equal(floor.nodes.filter(node => node.point.x === 4 && node.point.z === 4).length, 1);
  assert.equal(new WalkNavigation(result.document, floor.id).portals.length, 0); sameScene(result.document);
});

test('an outside T endpoint divides the new edge using the saved endpoint identity without altering its host', () => {
  const source = freshDocument('Explicit T endpoint'), floor = source.floors[0]; floor.nodes = [{ id: 'outside', point: p(2, -2) }, { id: 'contact', point: p(2, 0) }];
  floor.walls = [{ id: 'outside-wall', nodeIDs: ['outside', 'contact'], baseY: 0, height: 2.6, heightBasis: 'assumed', provenance: { origin: 'edited', sourceIDs: [], classificationConfidence: 'unknown' } }];
  const result = add(source, p(0, 0), p(4, 3)), out = result.document.floors[0]; assert.deepEqual(out.walls[0], floor.walls[0]); assert.equal(out.rooms[0].boundary.length, 5);
  assert.equal(out.walls.filter(wall => wall.nodeIDs.includes('contact')).length, 3); sameScene(result.document);
});

test('a partial standalone wall becomes one room boundary without losing either outside segment', () => {
  const source = freshDocument('Standalone shared segment'), floor = source.floors[0]; floor.nodes = [{ id: 'left', point: p(-2, 0) }, { id: 'right', point: p(6, 0) }];
  floor.walls = [{ id: 'long-wall', nodeIDs: ['left', 'right'], baseY: 0, height: 2.6, heightBasis: 'assumed', provenance: { origin: 'edited', sourceIDs: [], classificationConfidence: 'unknown' } }];
  const result = add(source, p(0, 0), p(4, 3)), out = result.document.floors[0]; assert.equal(out.walls.length, 6); assert.equal(result.commands.filter(command => command.type === 'splitWall').length, 2);
  assert.deepEqual(wallPath(out, out.walls[0]), [p(-2, 0), p(0, 0)]); assert.ok(out.walls.some(wall => JSON.stringify(wallPath(out, wall)) === JSON.stringify([p(4, 0), p(6, 0)]))); sameScene(result.document);
});

test('an existing closed unassigned ring becomes a room without duplicating walls', () => {
  const source = base(); source.floors[0].rooms = []; const result = add(source, p(0, 0), p(4, 4));
  assert.equal(result.commands.length, 1); assert.equal(result.commands[0].type, 'addRoom'); assert.deepEqual(result.document.floors[0].walls, source.floors[0].walls); sameScene(result.document);
});

test('crossings, nested interiors, duplicate rooms and inside orphan nodes reject atomically', () => {
  const source = base(); for (const [a, b] of [[p(2, -1), p(6, 2)], [p(1, 1), p(3, 3)], [p(-1, -1), p(5, 5)], [p(0, 0), p(4, 4)], [p(3.99, 0), p(8, 4)]]) rejectsUnchanged(source, a, b);
  const lone = freshDocument('Inside orphan'); lone.floors[0].nodes.push({ id: 'orphan', point: p(2, 2) }); rejectsUnchanged(lone, p(0, 0), p(4, 4));
  const crossing = freshDocument('Crossing wall'); crossing.floors[0].nodes = [{ id: 'a', point: p(-1, 2) }, { id: 'b', point: p(5, 2) }];
  crossing.floors[0].walls = [{ id: 'crossing', nodeIDs: ['a', 'b'], baseY: 0, height: 2.6, heightBasis: 'assumed', provenance: { origin: 'edited', sourceIDs: [], classificationConfidence: 'unknown' } }]; rejectsUnchanged(crossing, p(0, 0), p(4, 4));
});

test('coincident disconnected nodes and duplicate walls remain errors instead of silent merges', () => {
  const nodes = base(); nodes.floors[0].nodes.push({ id: 'disconnected', point: p(4, 0) }); rejectsUnchanged(nodes, p(4, 0), p(7, 4), /corners coincide/);
  const walls = base(), floor = walls.floors[0], wall = wallBetween(floor, p(4, 0), p(4, 4)); floor.walls.push({ ...structuredClone(wall), id: 'duplicate-wall' }); rejectsUnchanged(walls, p(4, 0), p(7, 4), /walls overlap/);
});

test('preexisting T contact without a shared corner requires an explicit correction before reuse', () => {
  const source = base(), floor = source.floors[0]; floor.nodes.push({ id: 'unshared-t', point: p(4, 2) }, { id: 'outside-t', point: p(7, 2) });
  floor.walls.push({ id: 'unshared-t-wall', nodeIDs: ['unshared-t', 'outside-t'], baseY: 0, height: 2.6, heightBasis: 'assumed', provenance: { origin: 'edited', sourceIDs: [], classificationConfidence: 'unknown' } });
  rejectsUnchanged(source, p(4, 0), p(7, 2), /without a shared corner/);
});

test('incompatible touched heights or a raised wall base cannot silently determine the new profile', () => {
  for (const key of ['height', 'baseY'] as const) { const source = base(), wall = wallBetween(source.floors[0], p(4, 0), p(4, 4)); wall[key] = key === 'height' ? 3 : .2; rejectsUnchanged(source, p(4, 0), p(7, 4), /incompatible floor bases or heights/); }
});

test('a split through an opening rejects while splits at its exact ends retain the complete opening', () => {
  const source = base(), floor = source.floors[0], host = wallBetween(floor, p(4, 0), p(4, 4));
  floor.openings = [{ id: 'door', wallID: host.id, kind: 'door', offset: 1, width: 2, bottom: 0, height: 2.1, provenance: { origin: 'edited', sourceIDs: ['accepted-door'], classificationConfidence: 'unknown' } }];
  rejectsUnchanged(source, p(4, 2), p(7, 4), /outside the opening/); const result = add(source, p(4, 1), p(7, 3));
  assert.deepEqual(openingPoints(result.document), openingPoints(source)); assert.equal(result.document.floors[0].openings[0].offset, 0); sameScene(result.document);
});

test('inconsistent neighboring room winding rejects without changing either existing room', () => {
  let source = add(freshDocument('Separated neighbors'), p(0, 0), p(2, 2)).document; source = add(source, p(4, 0), p(6, 2)).document;
  const room = source.floors[0].rooms[1]; room.boundary.reverse(); for (const ref of room.boundary) ref.reversed = !ref.reversed;
  assert.deepEqual(validateDocument(source), []); rejectsUnchanged(source, p(0, 2), p(6, 5), /incompatible boundary directions/);
});

test('finite geometry, coordinate bounds and nondegenerate dimensions are enforced before returning commands', () => {
  const source = freshDocument('Invalid rectangle');
  for (const [a, b] of [[p(0, 0), p(0, 4)], [p(0, 0), p(.0000005, 4)], [p(NaN, 0), p(4, 4)], [p(0, 0), p(Infinity, 4)], [p(10001, 0), p(10004, 4)]]) rejectsUnchanged(source, a, b, /Choose opposite|bound|Invalid/);
});

test('a selected elevated floor remains separate from a different floor at matching horizontal coordinates', () => {
  const source = base(), untouched = structuredClone(source.floors[0]); const upper = structuredClone(source.floors[0]); upper.id = 'upper'; upper.elevation = 3; source.floors.push(upper);
  const result = add(source, p(4, 0), p(7, 4), upper.id); assert.deepEqual(result.document.floors[0], untouched); assert.equal(result.document.floors[1].rooms.length, 2);
  const scene = buildScene(result.document, upper.id); assert.ok(scene.faces.filter(face => face.role === 'floor').every(face => face.vertices.every(vertex => vertex.y === 3)));
});

test('forty deterministic partial spans preserve room areas and share one real wall each', () => {
  for (let i = 0; i < 40; i++) { const source = base(), from = .2 + (i % 8) * .08, to = 3.8 - Math.floor(i / 8) * .08;
    const result = add(source, p(4, from), p(5 + i / 50, to)), floor = result.document.floors[0]; assert.equal(signedArea(roomBoundary(floor, floor.rooms[0])), 16);
    assert.ok(Math.abs(signedArea(roomBoundary(floor, floor.rooms[1])) - (1 + i / 50) * (to - from)) < 1e-10);
    assert.equal(floor.rooms[0].boundary.filter(ref => floor.rooms[1].boundary.some(other => other.wallID === ref.wallID)).length, 1); sameScene(result.document);
  }
});

test('the fourth room in a grid reuses both neighboring partitions and the explicit four-way corner', () => {
  let source = base(); source = add(source, p(4, 0), p(8, 4)).document; source = add(source, p(0, 4), p(4, 8)).document;
  const result = add(source, p(4, 4), p(8, 8)), floor = result.document.floors[0], room = floor.rooms.at(-1)!;
  assert.equal(floor.nodes.length, 9); assert.equal(floor.walls.length, 12); assert.equal(floor.rooms.length, 4);
  assert.equal(result.commands.filter(command => command.type === 'addWall').length, 2);
  assert.equal(room.boundary.filter(ref => source.floors[0].walls.some(wall => wall.id === ref.wallID)).length, 2);
  assert.equal(new WalkNavigation(result.document, floor.id).portals.length, 0); sameScene(result.document);
});

test('several consecutive saved walls may form one shared side without joining or replacing them', () => {
  let source = add(freshDocument('Multiple shared walls'), p(0, 0), p(2, 2)).document; source = add(source, p(2, 0), p(4, 2)).document;
  const result = add(source, p(0, 2), p(4, 4)), floor = result.document.floors[0];
  assert.equal(result.commands.length, 4); assert.equal(floor.rooms.at(-1)?.boundary.length, 5);
  assert.deepEqual(floor.walls.slice(0, source.floors[0].walls.length), source.floors[0].walls); sameScene(result.document);
});

test('reversed saved host direction preserves partial-span opening position and canonical lineage', () => {
  const source = base(), floor = source.floors[0], host = wallBetween(floor, p(4, 0), p(4, 4));
  host.nodeIDs.reverse(); floor.rooms[0].boundary.find(ref => ref.wallID === host.id)!.reversed = true;
  floor.openings = [{ id: 'reverse-door', wallID: host.id, kind: 'door', offset: 1.5, width: 1, bottom: 0, height: 2, provenance: { origin: 'captured', sourceIDs: ['reverse-source'], classificationConfidence: 'high' } }];
  const result = add(source, p(4, 1), p(7, 3)); assert.deepEqual(openingPoints(result.document), openingPoints(source));
  assert.equal(result.receipt.mappings.find(mapping => mapping.sourceID === host.id)?.resultingIDs.length, 3);
  const nav = new WalkNavigation(result.document, floor.id); assert.equal(nav.move(nav.place(p(2, 2)), p(6, 2)).reachedTarget, true); sameScene(result.document);
});

test('a tangent diagonal wall can share an explicit new corner without becoming a wall of the new room', () => {
  const source = freshDocument('Tangent contact'), floor = source.floors[0];
  floor.nodes = [{ id: 'a', point: p(-1, 1) }, { id: 'b', point: p(1, -1) }];
  floor.walls = [{ id: 'diagonal', nodeIDs: ['a', 'b'], baseY: 0, height: 2.6, heightBasis: 'assumed', provenance: { origin: 'edited', sourceIDs: [], classificationConfidence: 'unknown' } }];
  const result = add(source, p(0, 0), p(3, 3)), out = result.document.floors[0];
  assert.equal(result.commands.filter(command => command.type === 'splitWall').length, 1);
  assert.ok(out.rooms[0].boundary.every(ref => !result.receipt.mappings.find(mapping => mapping.sourceID === 'diagonal')?.resultingIDs.includes(ref.wallID)));
  const cut = result.commands.find(command => command.type === 'splitWall')!;
  const node = out.nodes.find(node => node.id === cut.newNodeID)!;
  assert.deepEqual(node.point, pathPoint(wallPath(floor, floor.walls[0]), cut.offset));
  assert.ok(Math.hypot(node.point.x, node.point.z) < 1e-12);
  assert.equal(out.walls.filter(wall => wall.nodeIDs.includes(node.id)).length, 4); sameScene(result.document);
});

test('numerical corner coincidence uses only the existing epsilon and does not add a broad snapping tolerance', () => {
  const source = base(); const result = add(source, p(4 + 1e-8, 0), p(7, 4));
  assert.equal(result.document.floors[0].nodes.length, 6); assert.equal(result.document.floors[0].walls.length, 7); sameScene(result.document);
  const separated = add(source, p(4 + 1e-4, 0), p(7, 4));
  assert.equal(separated.document.floors[0].nodes.length, 8); assert.equal(separated.document.floors[0].walls.length, 8);
  assert.equal(separated.document.floors[0].rooms[1].boundary.filter(ref => source.floors[0].walls.some(wall => wall.id === ref.wallID)).length, 0);
});

test('numerical coincidence at saved path nodes uses their exact split offsets and never shifts retained openings', () => {
  const source = base(), floor = source.floors[0], host = wallBetween(floor, p(4, 0), p(4, 4));
  floor.nodes.push({ id: 'one', point: p(4, 1) }, { id: 'three', point: p(4, 3) }); host.nodeIDs.splice(1, 0, 'one', 'three');
  floor.openings = [{ id: 'retained-door', wallID: host.id, kind: 'door', offset: 1.3, width: .6, bottom: 0, height: 2, provenance: { origin: 'captured', sourceIDs: ['original-door'], classificationConfidence: 'high' } }];
  const before = structuredClone(source), result = add(source, p(4 + 1e-7, 1 + 5e-7), p(7, 3 + 5e-7));
  const splits = result.commands.filter(command => command.type === 'splitWall');
  assert.deepEqual(splits.map(command => command.offset), [3, 1]);
  assert.ok(splits.every(command => command.newNodeID === undefined));
  assert.deepEqual(openingPoints(result.document), openingPoints(source)); assert.deepEqual(source, before); sameScene(result.document);
});

test('connected-room transaction survives durable reopen, single undo/redo, frozen revision and stale-writer rejection', async () => {
  const source = base(), namespace = `connected-room-${crypto.randomUUID()}`; let store = new SpatialWebStore(namespace);
  try {
    await store.create(source); const frozen = await store.freeze(source.documentID, source.revision); const packet = rectangleRoomCommands(source.floors[0], p(4, 1), p(7, 3));
    const saved = await store.apply(source.documentID, source.revision, packet.commands); assert.equal(saved.document.revision, source.revision + 1); assert.equal(saved.canUndo, true); const graph = structuredClone(saved.document.floors);
    store.close(); store = new SpatialWebStore(namespace); assert.deepEqual((await store.open(source.documentID)).document.floors, graph);
    await assert.rejects(store.apply(source.documentID, source.revision, packet.commands), /revision-conflict/);
    const undone = await store.undo(source.documentID, saved.document.revision); assert.deepEqual(undone.document.floors, source.floors); assert.equal(undone.document.revision, saved.document.revision + 1);
    const redone = await store.redo(source.documentID, undone.document.revision); assert.deepEqual(redone.document.floors, graph); assert.equal(redone.document.revision, undone.document.revision + 1);
    assert.deepEqual(await store.loadFrozen(source.documentID, source.revision), frozen); sameScene(redone.document);
  } finally { store.close(); }
});
