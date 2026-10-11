import test from 'node:test';
import assert from 'node:assert/strict';
import { closedBoundary, freshDocument, syntheticDocument, openingPath, distanceToPath } from '../../src/ui/geometry';
import { applyCommands, buildScene, displayCeilings, requireValidDocument } from '../../src/core';
import { reviewItems } from '../../src/ui/review';
import { batchSceneFaces } from '../../src/ui/sceneBatches';
import { Color, Plane, Vector3, type BufferAttribute } from 'three';
import { hexToLinearRGB, SELECTED_SURFACE_FACTOR, srgbToLinear, STRUCTURAL_EDGE_COLOR, structuralSurfaceRole, surfaceLinearRGB, SURFACE_COLORS } from '../../src/surfacePalette';

test('blank and synthetic UI entry paths create valid canonical documents with honest provenance', () => {
  const blank = freshDocument('Field correction');
  assert.equal(requireValidDocument(blank).floors[0].rooms.length, 0);
  const example = syntheticDocument();
  assert.equal(requireValidDocument(example).measurementStatus, 'unverified');
  assert(example.floors[0].walls.every(wall => wall.provenance.origin === 'synthetic'));
  assert.notEqual(example.documentID, syntheticDocument().documentID);
});

test('surface palette matches pinned Three sRGB conversion and preserves selected category contrast', () => {
  assert.deepEqual(SURFACE_COLORS, { wall: '#F2F3F5', floor: '#B8BDC4', ceiling: '#D5D9DE' });
  assert.equal(STRUCTURAL_EDGE_COLOR, '#68717C'); assert.equal(SELECTED_SURFACE_FACTOR, 0.92);
  for (const [input, expected] of [[0, 0], [0.04, 0.04 / 12.92], [0.5, 0.21404114048223255], [1, 1]]) assert(Math.abs(srgbToLinear(input) - expected) < 1e-12);
  for (const [name, hex] of Object.entries(SURFACE_COLORS)) {
    const role = structuralSurfaceRole(name), expected = new Color(hex).toArray();
    for (const selected of [false, true]) surfaceLinearRGB(role, selected).forEach((channel, i) => assert(Math.abs(channel - expected[i] * (selected ? 0.92 : 1)) < 1e-7));
  }
  const luminance = (name: string, selected: boolean) => surfaceLinearRGB(structuralSurfaceRole(name), selected).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
  // Even mixed selected/unselected states keep the intended luminance ordering.
  assert(luminance('wall', true) > luminance('ceiling', false)); assert(luminance('ceiling', true) > luminance('floor', false));
  for (const role of ['fixture', 'damage', 'Wall', '', 'toString']) assert.throws(() => structuralSurfaceRole(role), /Unsupported structural surface role/);
  assert.throws(() => hexToLinearRGB('#fff'), /six-digit/);
});

test('three structural batches retain exact triangle ownership, selection and geometry without idle uploads',()=>{
  const document=syntheticDocument(),scene=buildScene(document,document.floors[0].id);
  scene.faces.push(...displayCeilings(document,document.floors[0].id));
  const source=JSON.stringify(scene),clipping=new Plane(new Vector3(0,-1,0),100),batches=batchSceneFaces(scene,clipping);
  assert.equal(batches.length,3); assert.deepEqual(batches.map(b=>b.mesh.userData.role).sort(),['ceiling','floor','wall']);
  for(const batch of batches){
    const role=structuralSurfaceRole(batch.mesh.userData.role),faces=scene.faces.filter(face=>face.role===role),geometry=batch.mesh.geometry,colors=geometry.getAttribute('color') as BufferAttribute;
    const positions=faces.flatMap(face=>face.vertices.flatMap(p=>[p.x,p.y,p.z])).map(Math.fround);
    assert.deepEqual(Array.from(geometry.getAttribute('position').array),positions);
    assert.deepEqual(batch.mesh.userData.triangleOwners,faces.flatMap(face=>face.triangles.map(()=>face.objectID)));
    let offset=0;const indices=faces.flatMap(face=>{const result=face.triangles.flatMap(triangle=>triangle.map(i=>i+offset));offset+=face.vertices.length;return result;});
    assert.deepEqual(Array.from(geometry.getIndex()!.array),indices);assert.equal(batch.mesh.material.clippingPlanes![0],clipping);
    assert.equal(batch.mesh.material.type,'MeshBasicMaterial');assert.equal(batch.mesh.material.transparent,false);
    for(const selection of [undefined,'room-a','w6',new Set(faces.map(face=>face.objectID)),undefined])for(const fills of [true,false]){
      batch.updateColors(selection,fills);let vertex=0;
      for(const face of faces){const selected=typeof selection==='string'?selection===face.objectID:selection?.has(face.objectID)??false;
        const expected=fills?surfaceLinearRGB(role,selected):new Color(selected?'#a5cee4':'#fff').toArray();
        for(const _ of face.vertices){[colors.getX(vertex),colors.getY(vertex),colors.getZ(vertex)].forEach((channel,i)=>assert(Math.abs(channel-expected[i])<1e-7));vertex++;}
      }
      const version=colors.version;batch.updateColors(selection,fills);assert.equal(colors.version,version);
    }
    geometry.dispose();batch.mesh.material.dispose();
  }
  assert.equal(JSON.stringify(scene),source);
  assert.throws(()=>batchSceneFaces({...scene,faces:[{...scene.faces[0],role:'fixture'}]},clipping),/Unsupported structural surface role/);
});

test('consequence review points to incomplete boundaries without merging coincident corners', () => {
  const document = freshDocument('Incomplete boundary'), floor = document.floors[0];
  floor.nodes = [{id:'a',point:{x:0,z:0}},{id:'b',point:{x:2,z:0}}];
  floor.walls = [{id:'wall',nodeIDs:['a','b'],baseY:0,height:2.6,heightBasis:'assumed',provenance:{origin:'inferred',sourceIDs:[],classificationConfidence:'low'}}];
  const source = JSON.stringify(document), issues = reviewItems(document, floor);
  assert(issues.some(item=>item.selection?.kind==='node'&&item.selection.objectID==='a'));
  assert(issues.some(item=>item.severity==='boundary'&&item.selection?.objectID==='wall'));
  assert(issues.some(item=>item.severity==='source'&&item.selection?.objectID==='wall'));
  assert.equal(JSON.stringify(document),source);
});

test('boundary selection orders walls through shared IDs and refuses disconnected guesses', () => {
  const document = syntheticDocument(), floor = document.floors[0];
  const boundary = closedBoundary(floor, ['w4', 'w0', 'w5', 'w6']);
  const result = applyCommands(document, [{ type: 'setRoomBoundary', floorID: floor.id, roomID: 'room-a', boundary }], 1);
  assert.equal(result.document.revision, 2);
  assert.throws(() => closedBoundary(floor, ['w4', 'w0', 'w2']), /closed boundary/);
  const broken = structuredClone(floor); broken.nodes.push({ id: 'same-position-different-identity', point: { ...broken.nodes[0].point } }); broken.walls.find(wall => wall.id === 'w5')!.nodeIDs[1] = 'same-position-different-identity';
  assert.throws(() => closedBoundary(broken, ['w4', 'w0', 'w5', 'w6']), /closed boundary/);
});

test('opening ink and hit paths preserve bends instead of drawing a chord through the room',()=>{
  const points=[{x:0,z:0},{x:2,z:0},{x:2,z:2}],path=openingPath(points,1,2);
  assert.deepEqual(path,[{x:1,z:0},{x:2,z:0},{x:2,z:1}]);assert.equal(distanceToPath({x:2,z:0},path),0);assert.equal(distanceToPath({x:1.5,z:.5},path),.5);
});
