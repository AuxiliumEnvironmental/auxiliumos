import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommands } from '../../src/core/editor';
import { visibleAffectedAreas } from '../../src/core/affectedAreas';
import { domainArea, rectangle } from '../../src/core/affectedAreaGeometry';
import { validateDocument } from '../../src/core/validation';
import { fixture, provenance } from './fixtures';
import type { Cutout, EditCommand, SpatialDocument, SurfaceRef } from '../../src/types';

const floorID = 'floor-1';
const edit = (document: SpatialDocument, commands: EditCommand[]) => applyCommands(document, commands, document.revision);
const coverage = (document: SpatialDocument) => visibleAffectedAreas(document, floorID, false).reduce((sum, piece) => sum + domainArea(piece.domain), 0);
function ceilingDocument(): SpatialDocument {
  return edit(fixture(), [{ type: 'setCeilingHeights', targets: [{ floorID, roomID: 'room-a' }], mode: 'absolute', value: 2.8 }]).document;
}
function hole(surface: SurfaceRef): Cutout {
  return { id: 'support-hole', kind: 'cutout', surface, profile: { shape: 'rectangle', center: { u: 1, v: 1.2 }, width: .4, height: .4, rotation: 0 }, provenance: provenance() };
}

test('real cutout move and deletion preserve recorded material on both wall sides, floor and ceiling', () => {
  for (const kind of ['wall-positive', 'wall-negative', 'floor', 'ceiling'] as const) {
    const source = ceilingDocument();
    const surface: SurfaceRef = kind.startsWith('wall') ? { floorID, kind: 'wall', wallID: 'w0', side: kind === 'wall-positive' ? 'positive' : 'negative' } : kind === 'ceiling' ? { floorID, kind, roomID: 'room-a', ceilingID: source.floors[0].rooms[0].ceiling!.id } : { floorID, kind: 'floor', roomID: 'room-a' };
    // A through-hole authored from the positive side also removes the negative face.
    const cutout = hole(surface.kind === 'wall' ? { ...surface, side: 'positive' } : surface);
    const perforated = edit(source, [{ type: 'setCutout', floorID, cutout }]).document;
    const recorded = edit(perforated, [{ type: 'recordAffectedArea', areaID: 'observation', kind: 'moisture', surface, footprint: rectangle(.2, .2, 3.7, 2.4) }]).document;
    const reviewed = edit(recorded, [{ type: 'reviewAffectedArea', areaID: 'observation' }]).document;
    const original = structuredClone(reviewed.affectedAreas![0]), initial = coverage(reviewed);
    const moved = edit(reviewed, [{ type: 'setCutout', floorID, cutout: { ...cutout, profile: { ...cutout.profile, center: { u: 2, v: 1.2 } } } }]).document;
    assert.ok(coverage(moved) < initial - .15, kind);
    assert.equal(moved.affectedAreas![0].reviewState, 'needsReview', kind);
    const removed = edit(moved, [{ type: 'deleteCutout', floorID, cutoutID: cutout.id }]).document;
    assert.ok(Math.abs(coverage(removed) - initial) < 1e-7, kind);
    assert.equal(removed.affectedAreas![0].id, original.id);
    assert.deepEqual(removed.affectedAreas![0].recordedSupport, original.recordedSupport);
    assert.deepEqual(removed.affectedAreas![0].footprint, original.footprint);
    assert.deepEqual(validateDocument(removed), []);
  }
});

test('ceiling edits retain stable observation identity and source support while unrelated fixtures preserve review', () => {
  const source = ceilingDocument(), ceilingID = source.floors[0].rooms[0].ceiling!.id;
  const recorded = edit(source, [{ type: 'recordAffectedArea', areaID: 'ceiling-observation', kind: 'fire', surface: { floorID, kind: 'ceiling', roomID: 'room-a', ceilingID }, footprint: rectangle(.2, .2, 3.7, 2.4) }]).document;
  const reviewed = edit(recorded, [{ type: 'reviewAffectedArea', areaID: 'ceiling-observation' }]).document;
  const furnished = edit(reviewed, [{ type: 'setFixture', floorID, fixture: { id: 'cabinet', catalog: { id: 'upper-cabinet', version: 1 }, dimensions: { width: .9, depth: .35, height: .75 }, mount: { kind: 'wall', surface: { floorID, kind: 'wall', wallID: 'w0', side: 'positive' }, u: 2, v: 1.2 }, provenance: provenance() } }]).document;
  assert.deepEqual(furnished.affectedAreas, reviewed.affectedAreas);
  const raised = edit(furnished, [{ type: 'setCeilingHeights', targets: [{ floorID, roomID: 'room-a' }], mode: 'absolute', value: 3.2 }]).document;
  assert.equal(raised.floors[0].rooms[0].ceiling!.id, ceilingID);
  assert.equal(raised.affectedAreas![0].id, 'ceiling-observation');
  assert.equal(raised.affectedAreas![0].reviewState, 'needsReview');
  assert.deepEqual(raised.affectedAreas![0].recordedSupport, reviewed.affectedAreas![0].recordedSupport);
  assert.ok(Math.abs(coverage(raised) - coverage(reviewed)) < 1e-7);
});

test('real cutout and observation charts survive split/join and a coherent whole-floor translation', () => {
  const surface: SurfaceRef = { floorID, kind: 'wall', wallID: 'w0', side: 'positive' };
  const perforated = edit(fixture(), [{ type: 'setCutout', floorID, cutout: hole(surface) }]).document;
  const recorded = edit(perforated, [{ type: 'recordAffectedArea', areaID: 'observation', kind: 'moisture', surface, footprint: rectangle(.1, .1, 3.9, 2.5) }]).document;
  const topology = edit(recorded, [{ type: 'splitWall', floorID, wallID: 'w0', offset: 1.6, newWallID: 'temporary-wall', newNodeID: 'temporary-node' }, { type: 'joinWalls', floorID, firstWallID: 'w0', secondWallID: 'temporary-wall' }]);
  assert.ok(topology.receipt.surfaceRemaps?.mappings.every(mapping => mapping.from.kind !== 'wall' || recorded.floors[0].walls.some(wall => mapping.from.kind === 'wall' && wall.id === mapping.from.wallID)));
  assert.ok(Math.abs(coverage(topology.document) - coverage(recorded)) < 1e-7);
  const translated = edit(topology.document, topology.document.floors[0].nodes.map(node => ({ type: 'moveNode', floorID, nodeID: node.id, point: { x: node.point.x + 2, z: node.point.z + 3 } }))).document;
  assert.ok(Math.abs(coverage(translated) - coverage(recorded)) < 1e-7);
  assert.deepEqual(translated.affectedAreas![0].recordedSupport, recorded.affectedAreas![0].recordedSupport);
  assert.deepEqual(translated.affectedAreas![0].attachments[0].transform, [1, 0, 0, 1, 0, 0]);
  assert.equal(translated.affectedAreas![0].reviewState, 'needsReview');
  assert.deepEqual(validateDocument(translated), []);
});
