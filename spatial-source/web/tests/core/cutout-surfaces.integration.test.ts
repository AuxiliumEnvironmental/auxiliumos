import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommands, buildScene } from '../../src/core';
import { establishCeilingSchema } from '../../src/core/ceilings';
import { signedArea } from '../../src/core/geometry';
import { resolveSurface, surfaceKey, surfaceNormal } from '../../src/core/surfaces';
import { fixture, provenance } from './fixtures';
import type { Cutout, SpatialDocument, SurfaceDomain, SurfaceRef } from '../../src/types';

const area = (domain: SurfaceDomain) => domain.polygons.reduce((sum, polygon) => sum + Math.abs(signedArea(polygon.outer.map(p => ({ x: p.u, z: p.v })))) - polygon.holes.reduce((holes, ring) => holes + Math.abs(signedArea(ring.map(p => ({ x: p.u, z: p.v })))), 0), 0);
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} differs from ${expected}`);
function cutout(document: SpatialDocument, kind: SurfaceRef['kind']): Cutout {
  const floor = document.floors[0], room = floor.rooms[0];
  const surface: SurfaceRef = kind === 'wall' ? { floorID: floor.id, kind, wallID: 'w0', side: 'positive' } : kind === 'ceiling' ? { floorID: floor.id, kind, roomID: room.id, ceilingID: room.ceiling!.id } : { floorID: floor.id, kind, roomID: room.id };
  return { id: 'seam-hole', kind: 'cutout', surface, profile: { shape: 'rectangle', center: { u: 1, v: 1 }, width: .5, height: .5, rotation: 0 }, provenance: provenance() };
}

test('cutout add, move and removal issue material-change receipts with original support on every host and both wall sides', () => {
  for (const kind of ['wall', 'floor', 'ceiling'] as const) {
    let source = fixture(); establishCeilingSchema(source); const value = cutout(source, kind), floorID = source.floors[0].id;
    const commands = [
      { type: 'setCutout', floorID, cutout: value } as const,
      { type: 'setCutout', floorID, cutout: { ...value, profile: { ...value.profile, center: { u: 2, v: 1 } } } } as const,
      { type: 'deleteCutout', floorID, cutoutID: value.id } as const,
    ];
    for (const command of commands) {
      const previous = resolveSurface(source, value.surface)!, result = applyCommands(source, [command], source.revision), receipt = result.receipt.surfaceRemaps!;
      assert.equal(receipt.sourceRevision, source.revision); assert.equal(receipt.resultingRevision, result.document.revision);
      const mappings = receipt.mappings.filter(mapping => kind === 'wall' ? mapping.from.kind === 'wall' && mapping.from.wallID === 'w0' : surfaceKey(mapping.from) === surfaceKey(value.surface));
      assert.equal(mappings.length, kind === 'wall' ? 2 : 1);
      for (const mapping of mappings) { assert.equal(mapping.outcome, 'clipped_needs_review'); assert.deepEqual(mapping.transform, [1, 0, 0, 1, 0, 0]); near(area(mapping.sourceDomain), area(previous.domain)); }
      source = result.document;
    }
    assert.deepEqual(surfaceNormal(source, value.surface), kind === 'wall' ? { x: 0, y: 0, z: 1 } : { x: 0, y: kind === 'floor' ? 1 : -1, z: 0 });
  }
});

test('split receipts retain cutout subtraction even when the same transaction removes the hole', () => {
  const initial = fixture(), value = cutout(initial, 'wall'), floorID = initial.floors[0].id;
  const source = applyCommands(initial, [{ type: 'setCutout', floorID, cutout: value }], initial.revision).document;
  const next = applyCommands(source, [{ type: 'splitWall', floorID, wallID: 'w0', offset: 2, newWallID: 'split-wall', newNodeID: 'split-node' }, { type: 'deleteCutout', floorID, cutoutID: value.id }], source.revision);
  for (const side of ['positive', 'negative'] as const) {
    const mappings = next.receipt.surfaceRemaps!.mappings.filter(mapping => mapping.from.kind === 'wall' && mapping.from.wallID === 'w0' && mapping.from.side === side);
    assert.equal(mappings.length, 2); near(mappings.reduce((sum, mapping) => sum + area(mapping.sourceDomain), 0), 4 * 2.6 - .25);
    assert.ok(mappings.every(mapping => mapping.outcome === 'clipped_needs_review'));
  }
});

test('canonical ceiling emits stable identity once with real subtraction through ceiling-height edits', () => {
  const initial = fixture(); establishCeilingSchema(initial); const value = cutout(initial, 'ceiling'), floorID = initial.floors[0].id;
  const source = applyCommands(initial, [{ type: 'setCutout', floorID, cutout: value }], initial.revision).document;
  const next = applyCommands(source, [{ type: 'setCeilingHeights', targets: [{ floorID, roomID: 'room-a' }], mode: 'absolute', value: 3 }], source.revision).document;
  assert.equal(value.surface.kind, 'ceiling'); if (value.surface.kind !== 'ceiling') return;
  const ceilingID = value.surface.ceilingID;
  const faces = buildScene(next, floorID).faces.filter(face => face.role === 'ceiling' && face.objectID === ceilingID);
  assert.ok(faces.length); assert.ok(faces.every(face => face.vertices.every(p => p.y === 3)));
  near(faces.reduce((sum, face) => sum + face.triangles.reduce((total, triangle) => total + Math.abs(signedArea(triangle.map(i => ({ x: face.vertices[i].x, z: face.vertices[i].z })))), 0), 0), 16 - .25);
  assert.ok(!buildScene(next, floorID).faces.some(face => face.role === 'ceiling' && face.objectID === 'room-a'));
});
