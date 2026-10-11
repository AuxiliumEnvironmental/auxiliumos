import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { applyCommands, buildScene, roomBoundary, wallPath, pathPoint } from '../../src/core';
import { SpatialWebStore } from '../../src/data/store';
import { syntheticDocument } from '../../src/ui/geometry';
import { containedSelections, groupTranslation, prepareGroupTranslation, selectionKey } from '../../src/ui/groupSelection';
import type { Selection } from '../../src/types';
import { Color, Plane, Vector3 } from 'three';
import { batchSceneFaces } from '../../src/ui/sceneBatches';
import { rectangleRoomCommands } from '../../src/ui/roomDrawing';

test('group correction moves a shared corner once and preserves all opening identities and exact translated positions', () => {
  const document = syntheticDocument(), floor = document.floors[0], original = structuredClone(document);
  const selected: Selection[] = floor.walls.map(wall => ({ floorID: floor.id, kind: 'wall', objectID: wall.id }));
  selected.push({ floorID: floor.id, kind: 'room', objectID: 'room-a' }, selected[0], { floorID: floor.id, kind: 'node', objectID: 'n1' });
  const moved = groupTranslation(document, floor.id, selected, { x: 2, z: -1 }), result = moved.preview.floors[0];
  assert.equal(moved.commands.length, floor.nodes.length);
  assert.deepEqual(result.nodes, floor.nodes.map(node => ({ ...node, point: { x: node.point.x + 2, z: node.point.z - 1 } })));
  assert.deepEqual(result.openings, floor.openings); assert.deepEqual(result.rooms, floor.rooms);
  for (const opening of floor.openings) {
    const before = wallPath(floor, floor.walls.find(wall => wall.id === opening.wallID)!);
    const after = wallPath(result, result.walls.find(wall => wall.id === opening.wallID)!);
    for (const offset of [opening.offset, opening.offset + opening.width]) {
      const a = pathPoint(before, offset), b = pathPoint(after, offset); assert.deepEqual(b, { x: a.x + 2, z: a.z - 1 });
    }
  }
  const scene = buildScene(moved.preview, floor.id);
  for (const room of result.rooms) assert.deepEqual(scene.faces.find(face => face.role === 'floor' && face.objectID === room.id)!.vertices.map(({ x, z }) => ({ x, z })), roomBoundary(result, room));
  assert.deepEqual(document, original);
});

test('room group correction names affected neighbors and cannot silently move an opening without its whole host', () => {
  const document = syntheticDocument(), floor = document.floors[0];
  const moved = groupTranslation(document, floor.id, [{ floorID: floor.id, kind: 'room', objectID: 'room-a' }], { x: -.5, z: 0 });
  assert.deepEqual(new Set(moved.affectedRoomIDs), new Set(['room-a', 'room-b']));
  assert.deepEqual(moved.preview.floors[0].nodes.find(node => node.id === 'n2'), floor.nodes.find(node => node.id === 'n2'));
  const door: Selection = { floorID: floor.id, kind: 'opening', objectID: 'door-a' };
  assert.throws(() => groupTranslation(document, floor.id, [door], { x: 1, z: 0 }), /whole host/);
  assert.doesNotThrow(() => groupTranslation(document, floor.id, [door, { floorID: floor.id, kind: 'wall', objectID: 'w6' }], { x: .1, z: 0 }));
});

test('marquee admits fully contained geometry only, including the interior bends of an opening', () => {
  const document = syntheticDocument(), floor = document.floors[0];
  const selected = containedSelections(floor, { minX: -.1, minZ: -.1, maxX: 4.1, maxZ: 4.1 });
  assert.deepEqual(selected.map(selectionKey).sort(), ['w0', 'w4', 'w5', 'w6'].map(objectID => selectionKey({ floorID: floor.id, kind: 'wall', objectID })).sort());
  assert.equal(containedSelections(floor, { minX: 1, minZ: 1, maxX: 3, maxZ: 3 }).length, 0);
  floor.nodes.push({ id: 'bend', point: { x: 5, z: 2 } }); floor.walls[6].nodeIDs = ['n1', 'bend', 'n4'];
  floor.openings[0].offset = 0; floor.openings[0].width = Math.sqrt(5) * 2;
  assert.equal(containedSelections(floor, { minX: 3.9, minZ: -.1, maxX: 4.1, maxZ: 4.1 }, ['opening']).length, 0);
  assert.equal(containedSelections(floor, { minX: NaN, minZ: 0, maxX: 8, maxZ: 4 }).length, 0);
});

test('group corrections reject stale identities, cross-floor and invalid geometry atomically', () => {
  const document = syntheticDocument(), floor = document.floors[0], before = structuredClone(document);
  const wall: Selection = { floorID: floor.id, kind: 'wall', objectID: 'w6' };
  for (const selection of [[{ ...wall, floorID: 'another-floor' }], [{ ...wall, objectID: 'missing-wall' }]]) assert.throws(() => groupTranslation(document, floor.id, selection, { x: 1, z: 0 }));
  for (const delta of [{ x: NaN, z: 1 }, { x: 0, z: 0 }, { x: 20000, z: 0 }, { x: 4, z: 0 }]) assert.throws(() => groupTranslation(document, floor.id, [wall], delta));
  assert.deepEqual(document, before);
});

test('group correction is one durable revision with one undo and redo after reopening', async () => {
  const namespace = `group-${crypto.randomUUID()}`, document = syntheticDocument(), floor = document.floors[0];
  const store = new SpatialWebStore(namespace); await store.create(document);
  const group = groupTranslation(document, floor.id, floor.walls.map(wall => ({ floorID: floor.id, kind: 'wall', objectID: wall.id })), { x: 1, z: 2 });
  const saved = await store.apply(document.documentID, 1, group.commands); assert.equal(saved.document.revision, 2); store.close();
  const reopened = new SpatialWebStore(namespace);
  assert.deepEqual((await reopened.open(document.documentID)).document.floors, group.preview.floors);
  assert.deepEqual((await reopened.undo(document.documentID, 2)).document.floors, document.floors);
  assert.deepEqual((await reopened.redo(document.documentID, 3)).document.floors, group.preview.floors); reopened.close();
});

test('moving a detached room cannot overlap or contain another room and leaves the source unchanged', () => {
  let document = syntheticDocument(); const floorID = document.floors[0].id;
  document.floors[0] = { id: floorID, label: 'Synthetic rooms', elevation: 0, nodes: [], walls: [], rooms: [], openings: [] };
  const first = rectangleRoomCommands(document.floors[0], { x: 0, z: 0 }, { x: 4, z: 4 }); document = applyCommands(document, first.commands, document.revision).document;
  const second = rectangleRoomCommands(document.floors[0], { x: 8, z: 0 }, { x: 12, z: 4 }); document = applyCommands(document, second.commands, document.revision).document;
  const original = structuredClone(document), selection: Selection[] = [{ floorID, kind: 'room', objectID: first.roomID }];
  for (const delta of [{ x: 7, z: 0 }, { x: 8, z: 0 }]) assert.throws(() => groupTranslation(document, floorID, selection, delta), /overlap room interiors/);
  assert.doesNotThrow(() => groupTranslation(document, floorID, selection, { x: 0, z: -2 })); assert.deepEqual(document, original);
});

test('group correction cannot fold a neighboring room across its shared wall', () => {
  const document = syntheticDocument(), floor = document.floors[0], original = structuredClone(document);
  assert.throws(() => groupTranslation(document, floor.id, [{ floorID: floor.id, kind: 'room', objectID: 'room-a' }], { x: 7, z: 0 }), /inside out/);
  assert.deepEqual(document, original);
});

test('lightweight group preview preserves source and is explicitly separate from final validation', () => {
  const document = syntheticDocument(), floor = document.floors[0], original = structuredClone(document), selected: Selection[] = [{ floorID: floor.id, kind: 'room', objectID: 'room-a' }];
  const draft = prepareGroupTranslation(document, floor.id, selected, { x: 7, z: 0 });
  assert.equal(draft.commands.length, draft.nodeIDs.length); assert.notDeepEqual(draft.uncheckedFloor.nodes, floor.nodes); assert.equal('preview' in draft, false);
  assert.throws(() => groupTranslation(document, floor.id, selected, { x: 7, z: 0 }), /inside out/); assert.deepEqual(document, original);
  const valid = prepareGroupTranslation(document, floor.id, selected, { x: -.5, z: 0 }), checked = groupTranslation(document, floor.id, selected, { x: -.5, z: 0 });
  assert.deepEqual(valid.commands, checked.commands); assert.deepEqual(valid.uncheckedFloor.nodes, checked.preview.floors[0].nodes);
});

test('group correction refuses a new unconnected wall crossing or coincident junction', () => {
  const document = syntheticDocument(), floor = document.floors[0]; floor.rooms = []; floor.openings = []; floor.walls = [floor.walls[0]]; floor.nodes = floor.nodes.filter(node => floor.walls[0].nodeIDs.includes(node.id));
  floor.nodes.push({ id: 'loose-a', point: { x: 1, z: 2 } }, { id: 'loose-b', point: { x: 1, z: 4 } });
  floor.walls.push({ ...structuredClone(floor.walls[0]), id: 'loose-wall', nodeIDs: ['loose-a', 'loose-b'] });
  const selection: Selection[] = [{ floorID: floor.id, kind: 'wall', objectID: 'loose-wall' }];
  for (const z of [-2, -3]) assert.throws(() => groupTranslation(document, floor.id, selection, { x: 0, z }), /without a shared junction/);
  assert.doesNotThrow(() => groupTranslation(document, floor.id, selection, { x: 1, z: 1 }));
});

test('3D grouped face colors select every canonical ID and clear prior selection even when a caller reuses its set', () => {
  const document = syntheticDocument(), graphic = buildScene(document, document.floors[0].id), batches = batchSceneFaces(graphic, new Plane(new Vector3(0, -1, 0), 100));
  const selected = new Set(['room-a', 'w0', 'w6']);
  const check = (expected: Set<string>, fills: boolean) => {
    for (const batch of batches) {
      const indices = batch.mesh.geometry.index!, colors = batch.mesh.geometry.getAttribute('color'), owners = batch.mesh.userData.triangleOwners as string[];
      for (let triangle = 0; triangle < owners.length; triangle++) {
        const color = new Color(expected.has(owners[triangle]) ? '#a5cee4' : !fills ? '#fff' : batch.mesh.userData.role === 'floor' ? '#e0ebf0' : '#edf3f6');
        const vertex = indices.getX(triangle * 3);
        for (const [actual, target] of [[colors.getX(vertex), color.r], [colors.getY(vertex), color.g], [colors.getZ(vertex), color.b]]) assert.ok(Math.abs(actual - target) < 1e-6);
      }
    }
  };
  try {
    for (const batch of batches) batch.updateColors(selected, true); check(selected, true);
    selected.clear(); selected.add('room-b'); for (const batch of batches) batch.updateColors(selected, true); check(selected, true);
    for (const batch of batches) batch.updateColors(undefined, false); check(new Set(), false);
  } finally { for (const batch of batches) { batch.mesh.geometry.dispose(); batch.mesh.material.dispose(); } }
});
