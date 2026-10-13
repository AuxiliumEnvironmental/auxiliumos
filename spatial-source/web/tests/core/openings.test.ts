import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommands, buildScene, requireValidDocument, validateDocument, WalkNavigation } from '../../src/core';
import { openingHostPreview } from '../../src/core/scene';
import { beginOpeningChartDrag, openingGeometryError, openingHasRigidHost, openingPlanLines, openingScenePrimitives, OPENING_CATALOG, previewOpeningChartDrag, sameOpeningGeometry, wallChartAt } from '../../src/core/openings';
import { beginOpeningModelDrag, openingModelCorners, openingModelDragPreview, openingModelEdges, type OpeningRay } from '../../src/ui/openingModelManipulation';
import { glbDrawing } from '../../src/data/glb';
import { spatialFaceLinearRGB, surfaceLinearRGB, SURFACE_COLORS } from '../../src/surfacePalette';
import { emptyFloor, fixture, provenance } from './fixtures';
import type { EditCommand, Floor, Opening, OpeningStyleID, SpatialDocument } from '../../src/types';
const edit = (d: SpatialDocument, ...commands: EditCommand[]) => applyCommands(d, commands, d.revision).document;
const near = (a: number, b: number) => assert(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
function single(): SpatialDocument {
  const d = fixture(), f = emptyFloor('floor-1'); f.elevation = 6;
  f.nodes = [{ id: 'a', point: { x: 10, z: -3 } }, { id: 'b', point: { x: 14.8, z: .6 } }];
  f.walls = [{ id: 'wall', nodeIDs: ['a', 'b'], baseY: .4, height: 3.8, heightBasis: 'captured', provenance: provenance() }];
  f.openings = [{ id: 'opening', wallID: 'wall', kind: 'door', offset: 1, width: 1.3, bottom: .3, height: 2.2, provenance: { origin: 'inferred', sourceIDs: ['source-aperture'], classificationConfidence: 'low' } }];
  d.floors = [f]; return d;
}
function styled(id: OpeningStyleID): SpatialDocument {
  const d = single(); d.floors[0].openings[0].kind = OPENING_CATALOG.find(p => p.id === id)!.kind;
  return edit(d, { type: 'setOpeningStyle', floorID: 'floor-1', openingID: 'opening', styleID: id });
}
const encoded = (p: object) => Object.entries(p).sort().map(([k, v]) => `${k}:${Math.round(v * 1e8)}`).join(',');
const worldLines = (f: Floor, o: Opening) => openingPlanLines(f, o).map(l => [encoded(l.a), encoded(l.b)].sort().join('|')).sort();
const worldFaces = (f: Floor, o: Opening) => openingScenePrimitives(f, o).faces.map(face => face.vertices.map(encoded).sort().join('|')).sort();

for (const p of OPENING_CATALOG) test(`F02 catalog ${p.id}: capability, physical geometry and provenance`, () => {
  const d = styled(p.id), f = d.floors[0], o = f.openings[0];
  assert.equal(d.schemaVersion, '1.2.0'); assert.deepEqual(validateDocument(d), []);
  assert.deepEqual(o.provenance, single().floors[0].openings[0].provenance); assert.equal(o.style!.provenance.origin, 'edited');
  assert.equal(o.height, 2.2); assert.notEqual(o.height, p.symbolDepth);
  assert.equal(!!o.style!.end, p.horizontal); assert.equal(!!o.style!.side, p.vertical);
  const scene = buildScene(d, f.id); assert.equal(scene.schemaVersion, '1.2.0'); assert(scene.faces.some(face => face.role === 'opening' && face.objectID === o.id));
  assert(openingPlanLines(f, o).length > 0); assert.deepEqual(requireValidDocument(JSON.parse(JSON.stringify(d))), d);
  for (const [axis, supported] of [['horizontal', p.horizontal], ['vertical', p.vertical]] as const) {
    const c: EditCommand = { type: 'flipOpening', floorID: f.id, openingID: o.id, axis };
    if (!supported) { assert.throws(() => edit(d, c), /does not apply/); continue; }
    const flipped = edit(d, c), fo = flipped.floors[0].openings[0];
    assert(sameOpeningGeometry(fo, o)); assert.deepEqual(fo.provenance, o.provenance);
    assert.notDeepEqual(worldLines(flipped.floors[0], fo), worldLines(f, o)); assert.deepEqual(edit(flipped, c).floors[0].openings[0], o);
  }
  const generic = edit(d, { type: 'setOpeningStyle', floorID: f.id, openingID: o.id, styleID: null });
  assert.equal(generic.schemaVersion, '1.2.0'); assert.equal(generic.floors[0].openings[0].style, undefined); assert.deepEqual(generic.floors[0].openings[0].provenance, o.provenance);
});

test('F02 strict admission preserves old documents and rejects unsupported versions/orientation without mutation', () => {
  const d = styled('door_single'), before = JSON.stringify(d);
  for (const v of ['1.0.0', '1.1.0', '1.3.0', '9.0.0']) { const bad = structuredClone(d); (bad as any).schemaVersion = v; assert(validateDocument(bad).length > 0); }
  for (const mutate of [(o: any) => o.style.side = 'camera-left', (o: any) => delete o.style.end, (o: any) => o.style.extra = 1, (o: any) => o.style.id = 'invented', (o: any) => o.style.provenance.origin = 'captured', (o: any) => o.kind = 'window']) {
    const bad = structuredClone(d); mutate(bad.floors[0].openings[0]); assert(validateDocument(bad).length > 0);
  }
  assert.equal(JSON.stringify(d), before);
  for (const v of ['1.0.0', '1.1.0'] as const) { const old = single(); old.schemaVersion = v; old.floors[0].openings[0].width = .000001; assert.deepEqual(validateDocument(old), []); assert.equal(requireValidDocument(old).floors[0].openings[0].style, undefined); }
});

for (const mode of ['start-bottom', 'start-top', 'end-bottom', 'end-top', 'move'] as const) test(`F02 ${mode} retains finger offset, opposite corner and wall-relative dimensions`, () => {
  const d = styled('door_single'), f = d.floors[0], o = f.openings[0], before = JSON.stringify(d), grab = { u: 1.137, v: .449 }, drag = beginOpeningChartDrag(o, mode, grab);
  assert.deepEqual(previewOpeningChartDrag(f, drag, grab).opening, o);
  const result = previewOpeningChartDrag(f, drag, { u: grab.u + .171, v: grab.v + .233 }); assert.equal(result.error, undefined); const p = result.opening;
  if (mode === 'move') { near(p.offset, o.offset + .171); near(p.width, o.width); near(p.height, o.height); near(p.bottom, o.bottom); }
  else { if (mode.startsWith('start')) near(p.offset + p.width, o.offset + o.width); else near(p.offset, o.offset); if (mode.endsWith('bottom')) near(p.bottom + p.height, o.bottom + o.height); else near(p.bottom, o.bottom); }
  const first = openingModelCorners(f, p).find(c => c.corner === 'start-bottom')!.point;
  near(first.y, 6 + .4 + p.bottom); near(first.x, 10 + .8 * p.offset); near(first.z, -3 + .6 * p.offset);
  const committed = edit(d, { type: 'updateOpening', floorID: f.id, opening: p }); assert.equal(committed.revision, d.revision + 1); assert.equal(committed.floors[0].openings[0].provenance.origin, 'edited'); assert.deepEqual(committed.floors[0].openings[0].style, o.style); assert.equal(JSON.stringify(d), before);
});

test('F02 invalid resize, overlap and stale release reject atomically', () => {
  const d = styled('door_single'), f = d.floors[0], o = f.openings[0];
  for (const bad of [{ ...o, width: 0 }, { ...o, bottom: -1 }, { ...o, height: 4 }, { ...o, offset: 5 }, { ...o, width: NaN }]) { assert(openingGeometryError(f, bad)); assert.throws(() => edit(d, { type: 'updateOpening', floorID: f.id, opening: bad })); }
  assert.match(previewOpeningChartDrag(f, beginOpeningChartDrag(o, 'start-bottom', { u: 1, v: .3 }), { u: 3, v: 3 }).error!, /cannot cross/);
  const overlap = structuredClone(f); overlap.openings.push({ ...structuredClone(o), id: 'other', offset: 2.7 }); assert.match(openingGeometryError(overlap, { ...o, offset: 2 })!, /overlap/);
  const original = JSON.stringify(d); assert.throws(() => applyCommands(d, [{ type: 'moveOpening', floorID: f.id, openingID: o.id, offset: 1.1 }], d.revision - 1)); assert.equal(JSON.stringify(d), original);
});

for (const p of OPENING_CATALOG) for (const reverseA of [false, true]) for (const reverseB of [false, true]) test(`F02 ${p.id} split/join world preservation ${reverseA}/${reverseB}`, () => {
  const d = styled(p.id), f = d.floors[0]; f.nodes = [{ id: 'a', point: { x: 0, z: 0 } }, { id: 'b', point: { x: 2.4, z: 1.8 } }, { id: 'c', point: { x: 4.8, z: 3.6 } }];
  f.walls = [{ ...f.walls[0], id: 'first', nodeIDs: reverseA ? ['b', 'a'] : ['a', 'b'] }, { ...structuredClone(f.walls[0]), id: 'second', nodeIDs: reverseB ? ['c', 'b'] : ['b', 'c'] }];
  const o = f.openings[0]; o.wallID = 'second'; o.offset = .6; o.width = 1.1;
  const beforeLines = worldLines(f, o), beforeFaces = worldFaces(f, o), beforeProvenance = structuredClone(o.provenance), beforeStyleProvenance = structuredClone(o.style!.provenance);
  const joined = edit(d, { type: 'joinWalls', floorID: f.id, firstWallID: 'first', secondWallID: 'second' }), jf = joined.floors[0], jo = jf.openings[0];
  assert.deepEqual(worldLines(jf, jo), beforeLines); assert.deepEqual(worldFaces(jf, jo), beforeFaces); assert.deepEqual(jo.provenance, beforeProvenance); assert.deepEqual(jo.style!.provenance, beforeStyleProvenance);
  const split = edit(joined, { type: 'splitWall', floorID: f.id, wallID: 'first', offset: 3, newWallID: 'split' }), sf = split.floors[0];
  assert.deepEqual(worldLines(sf, sf.openings[0]), beforeLines); assert.deepEqual(worldFaces(sf, sf.openings[0]), beforeFaces); assert.deepEqual(requireValidDocument(JSON.parse(JSON.stringify(split))), split);
});

test('F02 legacy generic bend is preserved; rigid styles reject without flattening it', () => {
  const d = single(), f = d.floors[0]; f.nodes = [{ id: 'a', point: { x: 0, z: 0 } }, { id: 'bend', point: { x: 2, z: 0 } }, { id: 'b', point: { x: 2, z: 4 } }]; f.walls[0].nodeIDs = ['a', 'bend', 'b'];
  const o = f.openings[0]; o.offset = 1.5; o.width = 1.5;
  assert.deepEqual(validateDocument(d), []); assert.equal(openingHasRigidHost(f, o), false); assert.equal(openingModelEdges(f, o).length, 6);
  const end = openingModelCorners(f, o).find(c => c.corner === 'end-top')!.point; near(end.x, 2); near(end.z, 1);
  const before = JSON.stringify(d); assert.throws(() => edit(d, { type: 'setOpeningStyle', floorID: f.id, openingID: o.id, styleID: 'door_single' })); assert.equal(JSON.stringify(d), before);
  assert.equal(previewOpeningChartDrag(f, beginOpeningChartDrag(o, 'move', { u: 1.7, v: 1 }), { u: 1.8, v: 1 }).error, undefined);
  o.width = .4; const s = edit(d, { type: 'setOpeningStyle', floorID: f.id, openingID: o.id, styleID: 'door_single' }); assert.throws(() => edit(s, { type: 'moveOpening', floorID: f.id, openingID: o.id, offset: 1.8 }));
  const frame = wallChartAt(f, f.walls[0], 2); assert.equal(frame.segment, 1); near(frame.normal.x, -1);
});

function ray(f: Floor, u: number, v: number): OpeningRay {
  const frame = wallChartAt(f, f.walls[0], u, v), p = frame.point;
  return { origin: { x: p.x + frame.normal.x * 8, y: p.y + 4, z: p.z + frame.normal.z * 8 }, direction: { x: -frame.normal.x, y: -.5, z: -frame.normal.z } };
}
test('F02 frozen 3D plane agrees with elevation, retains off-corner grab and holds near-parallel rays', () => {
  const d = styled('door_bifold'), f = d.floors[0], o = f.openings[0], contact = { u: o.offset + .067, v: o.bottom + .089 };
  const drag = beginOpeningModelDrag(f, o, 'start-bottom', ray(f, contact.u, contact.v), o.offset)!; assert(drag);
  const result = openingModelDragPreview(f, drag, ray(f, contact.u + .127, contact.v + .211)); assert.equal(result.error, undefined);
  const expected = previewOpeningChartDrag(f, beginOpeningChartDrag(o, 'start-bottom', contact), { u: contact.u + .127, v: contact.v + .211 }).opening;
  for (const field of ['offset', 'width', 'bottom', 'height'] as const) near(result.opening[field], expected[field]);
  const parallel = { origin: { x: 0, y: 10, z: 0 }, direction: { x: .8, y: 0, z: .6 } }, held = openingModelDragPreview(f, drag, parallel);
  assert.equal(held.held, true); assert.deepEqual(held.opening, result.opening); assert.equal(beginOpeningModelDrag(f, o, 'move', parallel), null);
});

test('F02 focused host preview equals committed wall/opening scene and leaves source immutable', () => {
  const d = styled('door_single'), f = d.floors[0], o = { ...f.openings[0], offset: 1.2, width: 1.1 }, before = JSON.stringify(d);
  const preview = openingHostPreview(f, o), full = buildScene(edit(d, { type: 'updateOpening', floorID: f.id, opening: o }), f.id);
  assert.deepEqual(preview.faces, full.faces); assert.deepEqual(preview.edges, full.edges); assert.equal(JSON.stringify(d), before);
});

test('F02 area/room/wall edits retain geometry and scene 1.2 and styled fields', () => {
  let d = edit(fixture(), { type: 'setOpeningStyle', floorID: 'floor-1', openingID: 'door-a', styleID: 'door_single' }); const style = structuredClone(d.floors[0].openings[0].style);
  d = edit(d, { type: 'setArea', floorID: 'floor-1', area: { id: 'area', label: 'Observation', polygon: [{ x: 1, z: 1 }, { x: 2, z: 1 }, { x: 1, z: 2 }], provenance: provenance() } }, { type: 'renameRoom', floorID: 'floor-1', roomID: 'room-a', label: 'Renamed' }, { type: 'moveNode', floorID: 'floor-1', nodeID: 'n0', point: { x: -.1, z: 0 } });
  assert.equal(d.schemaVersion, '1.2.0'); assert.equal(buildScene(d, 'floor-1').schemaVersion, '1.2.0'); assert.deepEqual(d.floors[0].openings[0].style, style);
});

for (const kind of ['door', 'passage', 'window'] as const) test(`F02 ${kind} styling/flip never grants inferred or raised navigation`, () => {
  for (const restriction of ['none', 'inferred', 'raised', 'narrow'] as const) {
    let d = fixture(), o = d.floors[0].openings[0]; o.kind = kind;
    if (restriction === 'inferred') o.provenance.origin = 'inferred'; if (restriction === 'raised') o.bottom = .1; if (restriction === 'narrow') o.width = .3;
    const id = kind === 'door' ? 'door_single' : kind === 'passage' ? 'doorway_open' : 'window';
    d = edit(d, { type: 'setOpeningStyle', floorID: 'floor-1', openingID: o.id, styleID: id });
    if (kind === 'door') d = edit(d, { type: 'flipOpening', floorID: 'floor-1', openingID: o.id, axis: 'horizontal' }, { type: 'flipOpening', floorID: 'floor-1', openingID: o.id, axis: 'vertical' });
    assert.equal(new WalkNavigation(d, 'floor-1').portals.length, restriction === 'none' && kind !== 'window' ? 1 : 0);
  }
});

test('F02 GLB explicit opening material/ownership preserves F01 palette and frozen source', () => {
  const document = styled('door_double'), original = JSON.stringify(document), bytes = glbDrawing({ document, bytes: new TextEncoder().encode(original), hash: 'f'.repeat(64), createdAt: '2026-10-11T00:00:00Z' }, 'floor-1');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), gltf = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + view.getUint32(12, true))));
  assert.equal(gltf.materials.length, 5); assert.deepEqual(gltf.materials[4].pbrMetallicRoughness.baseColorFactor, [...spatialFaceLinearRGB('opening'), 1]); assert.deepEqual(gltf.materials[0].pbrMetallicRoughness.baseColorFactor, [...surfaceLinearRGB('wall'), 1]);
  assert.deepEqual(SURFACE_COLORS, { wall: '#F2F3F5', floor: '#B8BDC4', ceiling: '#D5D9DE' }); assert(gltf.meshes.some((m: any) => m.extras.objectID === 'opening' && m.extras.role === 'opening' && m.primitives[0].material === 4)); assert.equal(JSON.stringify(document), original);
});

test('F02 physical starters honor base elevation and retain catalog dimensions independent of symbol depth', async () => {
  const { previewOpeningPlacement } = await import('../../src/ui/openingPlacement');
  const d = single(), f = d.floors[0]; f.openings = [];
  for (const baseY of [-.5, 0, .4]) for (const preset of OPENING_CATALOG) {
    f.walls[0].baseY = baseY;
    const result = previewOpeningPlacement(f, 'wall', preset.kind, { x: 12.4, z: -1.2 }, 'new', preset.id);
    assert.equal(result.error, undefined); near(result.opening.width, preset.width);
    assert.equal(result.opening.height, preset.kind === 'window' ? 1.2 : 2.1);
    if (preset.kind !== 'window') near(baseY + result.opening.bottom, Math.max(0, baseY));
    assert.equal(edit(d, { type: 'addOpening', floorID: f.id, opening: result.opening }).schemaVersion, '1.2.0');
  }
});

test('F02 rectangle/wall preflight and addFloor retain the new schema and styles', async () => {
  const { rectangleRoomCommands } = await import('../../src/ui/roomDrawing'), { wallDrawingCommands } = await import('../../src/ui/wallDrawing');
  let d = styled('door_single'), style = structuredClone(d.floors[0].openings[0].style);
  const room = rectangleRoomCommands(d.floors[0], { x: -6, z: -4 }, { x: -2, z: -1 }, d.schemaVersion); d = edit(d, ...room.commands);
  const wall = wallDrawingCommands(d.floors[0], [{ x: -10, z: -10, nodeID: 'new-a' }, { x: -8, z: -10, nodeID: 'new-b' }], d.schemaVersion); d = edit(d, ...wall.commands);
  assert.equal(d.schemaVersion, '1.2.0'); assert.deepEqual(d.floors[0].openings[0].style, style);
  const added = structuredClone(d.floors[0]); added.id = 'upper';
  assert.equal(edit(fixture(), { type: 'addFloor', floor: added }).schemaVersion, '1.2.0');
});

test('F02 strict recovery payload retains style, physical dimensions and orientation without default regeneration', async () => {
  const { validateDrawingRecoveryPayload } = await import('../../src/data/drawingRecovery');
  for (const preset of OPENING_CATALOG) {
    const o = styled(preset.id).floors[0].openings[0]; if (o.style!.end) o.style!.end = 'end'; if (o.style!.side) o.style!.side = 'negative';
    const payload = { tool: 'opening', opening: o, point: { x: 12, z: -1 } };
    const admitted = validateDrawingRecoveryPayload(payload); assert.deepEqual(admitted, payload); assert.notEqual(admitted, payload);
    assert.throws(() => validateDrawingRecoveryPayload({ ...payload, opening: { ...o, style: { ...o.style, unexpected: true } } }));
  }
});
