import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommands, pathPoint, validateDocument, wallPath } from '../../src/core';
import { freshDocument } from '../../src/ui/geometry';
import { wallDrawingCommands } from '../../src/ui/wallDrawing';
import { drawingSnap } from '../../src/ui/planInteraction';

function fixture() {
  const document = freshDocument('Synthetic bent wall junctions'), floor = document.floors[0];
  floor.nodes = [{ id: 'a', point: { x: 0, z: 0 } }, { id: 'b', point: { x: 0, z: 4 } }, { id: 'c', point: { x: 4, z: 4 } }, { id: 'd', point: { x: 4, z: 0 } }];
  const provenance = { origin: 'synthetic' as const, sourceIDs: ['fixture'], classificationConfidence: 'unknown' as const };
  floor.walls = [{ id: 'host', nodeIDs: ['a', 'b', 'c', 'd'], baseY: 0, height: 2.6, heightBasis: 'synthetic', provenance }];
  floor.openings = [{ id: 'window', wallID: 'host', kind: 'window', offset: 5.5, width: .6, bottom: .9, height: 1.2, provenance }];
  return document;
}

test('both ends on one bent host split in one batch and preserve exact window geometry and source lineage', () => {
  const document = fixture(), floor = document.floors[0], before = structuredClone(document);
  const draft = [{ x: 0, z: 1, nodeID: 'start' }, { x: 4, z: 3, nodeID: 'end' }];
  // Recovered drafts retain only coordinates and node identities.
  const result = wallDrawingCommands(floor, JSON.parse(JSON.stringify(draft)));
  const saved = applyCommands(document, result.commands, document.revision).document, next = saved.floors[0];
  assert.deepEqual(validateDocument(saved), []); assert.equal(saved.revision, 2);
  assert.equal(next.walls.length, 4); assert.equal(next.nodes.length, 6);
  for (const nodeID of ['start', 'end']) assert.equal(next.walls.filter(wall => wall.nodeIDs.includes(nodeID)).length, 3);
  const opening = next.openings[0], host = next.walls.find(wall => wall.id === opening.wallID)!;
  assert.deepEqual(pathPoint(wallPath(next, host), opening.offset), pathPoint(wallPath(floor, floor.walls[0]), floor.openings[0].offset));
  assert.deepEqual(pathPoint(wallPath(next, host), opening.offset + opening.width), pathPoint(wallPath(floor, floor.walls[0]), floor.openings[0].offset + floor.openings[0].width));
  assert.deepEqual(next.walls.slice(0, 3).map(wall => wall.provenance.sourceIDs), [['fixture'], ['fixture'], ['fixture']]);
  assert.deepEqual(document, before);
});

test('contact with an internal saved path corner reuses its identity and creates a proper junction', () => {
  const document = fixture(), before = structuredClone(document);
  const packet = wallDrawingCommands(document.floors[0], [{ x: 0, z: 4, nodeID: 'b' }, { x: -2, z: 5, nodeID: 'outside' }]);
  const next = applyCommands(document, packet.commands, 1).document.floors[0];
  assert.equal(next.nodes.filter(node => node.id === 'b').length, 1);
  assert.equal(next.walls.filter(wall => wall.nodeIDs[0] === 'b' || wall.nodeIDs.at(-1) === 'b').length, 3);
  assert.deepEqual(document, before);
});

test('a snapped endpoint inside an opening rejects the whole transaction without altering the source', () => {
  const document = fixture(), before = structuredClone(document);
  assert.throws(() => wallDrawingCommands(document.floors[0], [{ x: 1.7, z: 4, nodeID: 'bad' }, { x: 1.7, z: 6, nodeID: 'outside' }]), /opening/i);
  assert.deepEqual(document, before);
});

test('corner acquisition favors clear proximity, preserves ambiguous identities, and releases without grid rounding', () => {
  const floor = fixture().floors[0]; floor.walls = []; floor.openings = [];
  floor.nodes.push({ id: 'nearby', point: { x: .16, z: 0 } });
  const options = { shift: false, alt: false };
  const near = drawingSnap(floor, [], { x: .02, z: .02 }, .01, options);
  assert.equal(near.kind, 'corner'); assert.equal(near.point.nodeID, 'a');
  const held = drawingSnap(floor, [], { x: -.14, z: 0 }, .01, { ...options, previous: near });
  assert.equal(held.kind, 'corner');
  const free = { x: -.1731, z: .0273 };
  assert.deepEqual(drawingSnap(floor, [], free, .01, { ...options, previous: held }).point, free);
  assert.equal(drawingSnap(floor, [], { x: .08, z: 0 }, .01, options).kind, 'ambiguous');
  floor.nodes.push({ id: 'coincident', point: { x: 0, z: 0 } });
  assert.equal(drawingSnap(floor, [], { x: .001, z: .001 }, .01, { ...options, previous: near }).kind, 'ambiguous');
  assert.deepEqual(drawingSnap(floor, [], free, .01, { ...options, alt: true }).point, free);
});

test('a short new segment can leave its own anchor and free mode bypasses all magnets', () => {
  const floor = freshDocument('Synthetic fine placement').floors[0], draft = [{ x: 1, z: 1, nodeID: 'start' }];
  const point = { x: 1.063, z: 1.061 };
  assert.equal(drawingSnap(floor, draft, point, .01, { shift: false, alt: false }).kind, 'free');
  const next = applyCommands({ ...freshDocument('Short wall'), floors: [floor] }, wallDrawingCommands(floor, [...draft, { ...point, nodeID: 'end' }]).commands, 1).document;
  assert.deepEqual(next.floors[0].nodes[1].point, point);
});
