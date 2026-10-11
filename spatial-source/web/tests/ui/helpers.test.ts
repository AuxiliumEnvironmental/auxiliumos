import test from 'node:test';
import assert from 'node:assert/strict';
import { closedBoundary, freshDocument, syntheticDocument, openingPath, distanceToPath } from '../../src/ui/geometry';
import { applyCommands, buildScene, requireValidDocument } from '../../src/core';
import { reviewItems } from '../../src/ui/review';
import { batchSceneFaces } from '../../src/ui/sceneBatches';
import { Plane, Vector3 } from 'three';

test('blank and synthetic UI entry paths create valid canonical documents with honest provenance', () => {
  const blank = freshDocument('Field correction');
  assert.equal(requireValidDocument(blank).floors[0].rooms.length, 0);
  const example = syntheticDocument();
  assert.equal(requireValidDocument(example).measurementStatus, 'unverified');
  assert(example.floors[0].walls.every(wall => wall.provenance.origin === 'synthetic'));
  assert.notEqual(example.documentID, syntheticDocument().documentID);
});

test('batched rendering retains exact triangle ownership without changing canonical geometry',()=>{
  const document=syntheticDocument(),scene=buildScene(document,document.floors[0].id),source=JSON.stringify(scene),batches=batchSceneFaces(scene,new Plane(new Vector3(0,-1,0),100));assert.equal(batches.length,2);
  assert.equal(batches.reduce((sum,b)=>sum+b.mesh.geometry.getIndex()!.count/3,0),scene.faces.reduce((sum,f)=>sum+f.triangles.length,0));
  for(const face of scene.faces){const count=batches.flatMap(b=>b.mesh.userData.triangleOwners as string[]).filter(id=>id===face.objectID).length;assert.equal(count,scene.faces.filter(f=>f.objectID===face.objectID).reduce((sum,f)=>sum+f.triangles.length,0));}
  for(const batch of batches){batch.updateColors('w6',true);batch.updateColors(undefined,false);batch.mesh.geometry.dispose();batch.mesh.material.dispose();}assert.equal(JSON.stringify(scene),source);
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
