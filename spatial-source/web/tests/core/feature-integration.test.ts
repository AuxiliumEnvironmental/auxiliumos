import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, provenance, emptyFloor } from './fixtures';
import { applyCommands } from '../../src/core/editor';
import { validateDocument } from '../../src/core/validation';
import { buildScene } from '../../src/core/scene';
import { resolveSurface, surfacePointToWorld } from '../../src/core/surfaces';
import { visibleAffectedAreas } from '../../src/core/affectedAreas';
import { domainArea, rectangle } from '../../src/core/affectedAreaGeometry';
import { WalkNavigation } from '../../src/core/navigation';
import { SpatialWebStore } from '../../src/data/store';
import { exportRevision } from '../../src/data/exports';
import { importDocument } from '../../src/data/imports';
import { jsonBytes, sha256 } from '../../src/data/bytes';
import type { Cutout, EditCommand, Fixture, SceneFace, SpatialDocument, SurfaceRef } from '../../src/types';

const floorID = 'floor-1';
const edit = (document: SpatialDocument, ...commands: EditCommand[]) => applyCommands(document, commands, document.revision).document;
const floorSurface: SurfaceRef = { floorID, kind: 'floor', roomID: 'room-a' };
const wallSurface: Extract<SurfaceRef, { kind: 'wall' }> = { floorID, kind: 'wall', wallID: 'w0', side: 'positive' };
const coverage = (document: SpatialDocument, id: string) => visibleAffectedAreas(document, floorID, false).filter(p => p.areaID === id).reduce((sum, p) => sum + domainArea(p.domain), 0);
const ceilingSurface = (document: SpatialDocument): SurfaceRef => ({ floorID, kind: 'ceiling', roomID: 'room-a', ceilingID: document.floors[0].rooms[0].ceiling!.id });

function combined() {
  const original = fixture();
  original.floors[0].elevation = 5;
  original.floors[0].walls[0].baseY = .2;
  original.floors[0].walls[0].height = 2.4;
  const untouched = structuredClone(original);
  const opened = edit(original,
    { type: 'setOpeningStyle', floorID, openingID: 'door-a', styleID: 'door_single' },
    { type: 'flipOpening', floorID, openingID: 'door-a', axis: 'horizontal' });
  const ceiling = edit(opened, { type: 'setCeilingHeights', targets: [{ floorID, roomID: 'room-a' }], mode: 'absolute', value: 3.2 });
  const fixtures: Fixture[] = [
    { id: 'tall-fixture', catalog: { id: 'built-in-shelves', version: 1 }, dimensions: { width: .8, depth: .35, height: 2.8 }, mount: { kind: 'floor', position: { x: .8, z: 2.8 }, yaw: .2, baseOffset: 0 }, provenance: provenance() },
    { id: 'mounted-fixture', catalog: { id: 'upper-cabinet', version: 1 }, dimensions: { width: .6, depth: .3, height: .6 }, mount: { kind: 'wall', surface: wallSurface, u: .8, v: 1.4 }, provenance: provenance() },
  ];
  const cuts: Cutout[] = [
    { id: 'floor-hole', kind: 'cutout', surface: floorSurface, profile: { shape: 'circle', center: { u: 2, v: 2 }, diameter: .6 }, provenance: provenance() },
    { id: 'ceiling-hole', kind: 'penetration', surface: ceilingSurface(ceiling), profile: { shape: 'circle', center: { u: 2.5, v: 2.5 }, diameter: .4 }, provenance: provenance() },
    { id: 'wall-hole', kind: 'penetration', surface: wallSurface, profile: { shape: 'rectangle', center: { u: 2, v: 1 }, width: .4, height: .4, rotation: 0 }, provenance: provenance() },
  ];
  const furnished = edit(ceiling, ...fixtures.map(fixture => ({ type: 'setFixture' as const, floorID, fixture })), ...cuts.map(cutout => ({ type: 'setCutout' as const, floorID, cutout })));
  const observed = edit(furnished,
    { type: 'recordAffectedArea', areaID: 'floor-moisture', kind: 'moisture', surface: floorSurface, footprint: rectangle(.2, .2, 3.8, 3.8) },
    { type: 'recordAffectedArea', areaID: 'ceiling-fire', kind: 'fire', surface: ceilingSurface(furnished), footprint: rectangle(.2, .2, 3.8, 3.8) },
    { type: 'recordAffectedArea', areaID: 'wall-moisture', kind: 'moisture', surface: wallSurface, footprint: rectangle(.2, .2, 3.8, 2.3) },
    { type: 'recordAffectedArea', areaID: 'window-fire', kind: 'fire', surface: { floorID, kind: 'wall', wallID: 'w4', side: 'positive' }, footprint: rectangle(.1, .1, 3.9, 2.5) });
  assert.deepEqual(original, untouched, 'earlier legacy input remains untouched');
  return { original, opened, ceiling, furnished, observed };
}

test('cumulative versions preserve opening intent, independent ceiling heights, real holes and observations', () => {
  const stages = combined();
  assert.deepEqual(Object.values(stages).map(d => d.schemaVersion), ['1.0.0', '1.2.0', '1.3.0', '1.4.0', '1.5.0']);
  for (const document of Object.values(stages)) assert.deepEqual(validateDocument(document), []);
  const document = stages.observed, floor = document.floors[0];
  assert.deepEqual(floor.nodes, stages.original.floors[0].nodes);
  assert.equal(floor.elevation, 5);
  assert.equal(floor.rooms[0].ceiling!.height, 3.2);
  assert.equal(floor.rooms[1].ceiling!.height, 2.6);
  assert.deepEqual(floor.openings, stages.opened.floors[0].openings);
  assert.equal(surfacePointToWorld(document, ceilingSurface(document), { u: 1, v: 1 })!.y, 8.2);
  const later = edit(document,
    { type: 'flipOpening', floorID, openingID: 'door-a', axis: 'horizontal' },
    { type: 'setCeilingHeights', targets: floor.rooms.map(r => ({ floorID, roomID: r.id })), mode: 'delta', value: .1 },
    { type: 'setFixture', floorID, fixture: structuredClone(floor.fixtures![0]) },
    { type: 'setCutout', floorID, cutout: structuredClone(floor.cutouts![0]) },
    { type: 'setArea', floorID, area: { id: 'semantic-label', label: 'Separate room label', polygon: [{ x: 5, z: 1 }, { x: 6, z: 1 }, { x: 6, z: 2 }, { x: 5, z: 2 }], provenance: provenance() } },
    { type: 'addFloor', floor: emptyFloor('second-floor') });
  assert.equal(later.schemaVersion, '1.5.0', 'earlier feature commands cannot downgrade the document');
  assert.deepEqual(validateDocument(later), []);
  assert.equal(later.affectedAreas!.length, 4);
  assert.ok(Math.abs(later.floors[0].rooms[0].ceiling!.height - later.floors[0].rooms[1].ceiling!.height - .6) < 1e-9);
});

test('real moved and removed holes never manufacture recorded moisture or fire coverage', () => {
  const { observed } = combined(), before = structuredClone(observed.affectedAreas);
  const originalCoverage = coverage(observed, 'floor-moisture');
  const movedCut = structuredClone(observed.floors[0].cutouts!.find(c => c.id === 'floor-hole')!);
  movedCut.profile.center.u = 3;
  const moved = edit(observed, { type: 'setCutout', floorID, cutout: movedCut });
  assert.ok(coverage(moved, 'floor-moisture') < originalCoverage - .1);
  const removed = edit(moved, { type: 'deleteCutout', floorID, cutoutID: movedCut.id });
  assert.ok(Math.abs(coverage(removed, 'floor-moisture') - originalCoverage) < 1e-7);
  const windowBefore = coverage(removed, 'window-fire');
  const shifted = edit(removed, { type: 'moveOpening', floorID, openingID: 'window-a', offset: 2 });
  assert.ok(coverage(shifted, 'window-fire') < windowBefore);
  const raised = edit(shifted,
    { type: 'deleteOpening', floorID, openingID: 'window-a' },
    { type: 'setCeilingHeights', targets: [{ floorID, roomID: 'room-a' }], mode: 'delta', value: .3 });
  assert.ok(Math.abs(coverage(raised, 'window-fire') - windowBefore) < 1e-7);
  assert.equal(surfacePointToWorld(raised, ceilingSurface(raised), { u: 1, v: 1 })!.y, 8.5);
  assert.deepEqual(raised.affectedAreas!.map(a => [a.footprint, a.recordedSupport]), before!.map(a => [a.footprint, a.recordedSupport]));
  assert.deepEqual(validateDocument(raised), []);
});

test('ceiling conflicts reject atomically with F04 fixtures while explicit same-batch resolution succeeds', () => {
  const { observed } = combined(), bytes = JSON.stringify(observed);
  const lower: EditCommand = { type: 'setCeilingHeights', targets: [{ floorID, roomID: 'room-a' }], mode: 'absolute', value: 2.4 };
  assert.throws(() => edit(observed, lower), /ceiling/i);
  assert.equal(JSON.stringify(observed), bytes);
  const resolved = edit(observed, { type: 'deleteFixture', floorID, fixtureID: 'tall-fixture' }, lower);
  assert.equal(resolved.floors[0].rooms[0].ceiling!.height, 2.4);
  assert.equal(resolved.floors[0].rooms[1].ceiling!.height, 2.6);
  assert.deepEqual(resolved.floors[0].openings, observed.floors[0].openings);
  assert.deepEqual(resolved.affectedAreas!.map(a => a.recordedSupport), observed.affectedAreas!.map(a => a.recordedSupport));
});

function projectedArea(face: SceneFace) {
  return face.triangles.reduce((sum, triangle) => {
    const [a, b, c] = triangle.map(i => face.vertices[i]);
    return sum + Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) / 2;
  }, 0);
}
test('canonical scene contains each real ceiling once and navigation retains doors and floor-void restrictions', () => {
  const { observed } = combined(), scene = buildScene(observed, floorID);
  assert.equal(scene.schemaVersion, '1.5.0');
  for (const role of ['opening', 'fixture', 'affected-moisture', 'affected-fire']) assert.ok(scene.faces.some(f => f.role === role), `missing ${role}`);
  for (const room of observed.floors[0].rooms) {
    const ref: SurfaceRef = { floorID, kind: 'ceiling', roomID: room.id, ceilingID: room.ceiling!.id };
    const faces = scene.faces.filter(f => f.role === 'ceiling' && f.objectID === room.ceiling!.id);
    assert.ok(faces.length);
    assert.ok(Math.abs(faces.reduce((n, f) => n + projectedArea(f), 0) - domainArea(resolveSurface(observed, ref)!.domain)) < 1e-7, 'canonical ceiling area must not be duplicated or fill a penetration');
  }
  const nav = new WalkNavigation(observed, floorID);
  const through = nav.move(nav.place({ x: 2, z: 1.4 }), { x: 6, z: 1.4 });
  assert.equal(through.reachedTarget, true);
  assert.deepEqual(through.crossedPortalIDs, ['door-a']);
  assert.throws(() => nav.place({ x: 2, z: 2 }), /floor|cutout|support|position|void/i);
});

test('one structure edit, undo/redo, frozen restore and reopened export retain all feature state and ceiling remaps', async () => {
  const { observed } = combined(), namespace = `features-${crypto.randomUUID()}`;
  let store = new SpatialWebStore(namespace);
  try {
    await store.create(observed);
    const frozen = await store.freeze(observed.documentID, observed.revision);
    const targets = observed.floors[0].rooms.map(r => ({ floorID, roomID: r.id }));
    const changed = await store.apply(observed.documentID, observed.revision, [{ type: 'setCeilingHeights', targets, mode: 'delta', value: .2 }]);
    for (let i = 0; i < 2; i++) assert.ok(Math.abs(changed.document.floors[0].rooms[i].ceiling!.height - observed.floors[0].rooms[i].ceiling!.height - .2) < 1e-9);
    const undone = await store.undo(observed.documentID, changed.document.revision);
    assert.deepEqual(undone.document.floors, observed.floors);
    assert.deepEqual(undone.document.affectedAreas, observed.affectedAreas);
    assert.equal(undone.receipt!.surfaceRemaps!.sourceRevision, changed.document.revision);
    assert.equal(undone.receipt!.surfaceRemaps!.resultingRevision, undone.document.revision);
    assert.ok(undone.receipt!.surfaceRemaps!.mappings.some(m => m.from.kind === 'ceiling' && m.to?.kind === 'ceiling'));
    const redone = await store.redo(observed.documentID, undone.document.revision);
    assert.deepEqual(redone.document.floors, changed.document.floors);
    const restored = await store.restore(observed.documentID, frozen.document.revision, redone.document.revision);
    assert.deepEqual(restored.document.floors, observed.floors);
    assert.deepEqual(restored.document.affectedAreas, observed.affectedAreas);
    assert.equal(restored.receipt!.surfaceRemaps!.resultingRevision, restored.document.revision);
    assert.equal(await sha256(frozen.bytes), frozen.hash);
    assert.deepEqual(frozen.bytes, jsonBytes(observed));
    store.close(); store = new SpatialWebStore(namespace);
    assert.deepEqual((await store.open(observed.documentID)).document, restored.document);
    const final = await store.freeze(observed.documentID, restored.document.revision);
    const geometry = await exportRevision(final, 'geometry');
    assert.deepEqual(await importDocument(geometry.bytes, geometry.filename), restored.document);
    const scene = await exportRevision(final, 'scene', floorID);
    assert.deepEqual(JSON.parse(new TextDecoder().decode(scene.bytes)), buildScene(restored.document, floorID));
    await assert.rejects(exportRevision(final, 'bundle', floorID), /complete-local-document/);
  } finally { store.close(); }
});
