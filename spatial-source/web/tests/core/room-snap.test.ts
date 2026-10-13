import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roomSnap } from '../../src/ui/roomSnap';
import { rectangleRoomCommands } from '../../src/ui/roomDrawing';
import { applyCommands, WalkNavigation } from '../../src/core';
import { freshDocument } from '../../src/ui/geometry';
import type { Floor, Point2 } from '../../src/types';

function fixture() {
  const document = freshDocument('Synthetic room snapping');
  const packet = rectangleRoomCommands(document.floors[0], { x: 0, z: 0 }, { x: 4, z: 4 });
  return applyCommands(document, packet.commands, 1).document;
}
const snap = (floor: Floor, point: Point2, anchor?: Point2) => roomSnap(floor, point, .01, { enabled: true, alt: false, anchor });

test('room snapping exposes one exact saved corner and projected boundary without changing source', () => {
  const floor = fixture().floors[0], original = structuredClone(floor);
  const corner = snap(floor, { x: 4.05, z: .06 });
  assert.equal(corner.kind, 'corner'); assert.deepEqual(corner.point, { ...floor.nodes[1].point, nodeID: floor.nodes[1].id });
  const boundary = snap(floor, { x: 4.06, z: 2 });
  assert.equal(boundary.kind, 'boundary'); assert.deepEqual(boundary.point, { x: 4, z: 2 }); assert.equal(boundary.guides.length, 1);
  assert.equal(snap(floor, { x: 4.1, z: 2 }).kind, 'free');
  assert.deepEqual(floor, original);
});

test('opposite room corner visibly aligns to the boundary incident to its explicit starting corner', () => {
  const document = fixture(), floor = document.floors[0];
  const first = snap(floor, { x: 4.04, z: .02 }), opposite = snap(floor, { x: 7, z: 3.96 }, first.point);
  assert.equal(opposite.kind, 'alignment'); assert.deepEqual(opposite.point, { x: 7, z: 4 });
  assert.deepEqual(opposite.guides, [{ from: { x: 4, z: 4 }, to: { x: 7, z: 4 } }]);
  const result = applyCommands(document, rectangleRoomCommands(floor, first.point, opposite.point).commands, document.revision).document;
  assert.equal(result.floors[0].walls.length, 7); assert.equal(result.floors[0].nodes.length, 6); assert.equal(result.floors[0].rooms.length, 2);
  assert.deepEqual(result.floors[0].walls.slice(0, 4), floor.walls); assert.equal(new WalkNavigation(result, floor.id).portals.length, 0);
});

test('free placement and Alt bypass snapping without silently changing contact validation', () => {
  const floor = fixture().floors[0], point = { x: 4.06, z: .03 };
  for (const options of [{ enabled: false, alt: false }, { enabled: true, alt: true }]) assert.deepEqual(roomSnap(floor, point, .01, options), { point, kind: 'free', guides: [] });
  const noIncidentWall = snap(floor, { x: 7, z: 3.98 }, { x: 5, z: 1 });
  assert.equal(noIncidentWall.kind, 'free'); assert.deepEqual(noIncidentWall.point, { x: 7, z: 3.98 });
});

test('competing near corners, duplicate boundaries and unsplit crossings fail closed independent of identifier order', () => {
  const base = fixture().floors[0];
  const duplicate = structuredClone(base); duplicate.nodes.push({ id: 'unconnected', point: { x: 4, z: 0 } });
  const corner = snap(duplicate, { x: 4.04, z: .03 }); assert.equal(corner.kind, 'ambiguous'); assert.match(corner.message!, /unconnected corners/);
  duplicate.nodes.reverse(); assert.deepEqual(snap(duplicate, { x: 4.04, z: .03 }), corner);
  const boundary = structuredClone(base); boundary.walls.push({ ...structuredClone(boundary.walls[1]), id: 'duplicate-wall' });
  assert.equal(snap(boundary, { x: 4.05, z: 2 }).kind, 'ambiguous');
  const close = structuredClone(base); close.nodes.push({ id: 'near', point: { x: 4.08, z: .03 } }); assert.equal(snap(close, { x: 4.04, z: .03 }).kind, 'ambiguous');
  const crossing = structuredClone(base); crossing.nodes.push({ id: 'cross-a', point: { x: 3, z: 2 } }, { id: 'cross-b', point: { x: 5, z: 2 } }); crossing.walls.push({ ...structuredClone(base.walls[0]), id: 'cross', nodeIDs: ['cross-a', 'cross-b'] });
  assert.equal(snap(crossing, { x: 4.03, z: 2.02 }).kind, 'ambiguous');
});

test('partial spans snap to a host arclength point while nonincident axes cannot move the opposite corner', () => {
  const document = fixture(), floor = document.floors[0];
  const first = snap(floor, { x: 4.05, z: 1 }), second = snap(floor, { x: 7, z: 3 }, first.point);
  assert.deepEqual(first.point, { x: 4, z: 1 }); assert.equal(second.kind, 'free');
  const result = applyCommands(document, rectangleRoomCommands(floor, first.point, second.point).commands, document.revision).document;
  assert.equal(result.floors[0].walls.length, 9); assert.equal(result.floors[0].rooms[0].boundary.length, 6); assert.equal(result.floors[0].rooms.length, 2);
  const internal = structuredClone(floor); internal.nodes.push({ id: 'intermediate', point: { x: 4, z: 2 } }); internal.walls[1].nodeIDs.splice(1, 0, 'intermediate');
  assert.deepEqual(snap(internal, { x: 4.06, z: 2.03 }).point, { x: 4, z: 2, nodeID: 'intermediate' });
});

test('invalid view scales never manufacture a snapped target', () => {
  const floor = fixture().floors[0], point = { x: 4.05, z: .05 };
  for (const units of [0, -1, Infinity, NaN]) assert.deepEqual(roomSnap(floor, point, units, { enabled: true, alt: false }), { point, kind: 'free', guides: [] });
});
