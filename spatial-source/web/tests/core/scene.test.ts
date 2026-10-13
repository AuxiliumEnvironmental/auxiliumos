import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildScene,displayCeilings,evaluateCutaway,nearestSceneHit,signedArea,triangulate } from '../../src/core';
import { emptyFloor,fixture,provenance } from './fixtures';

test('TypeScript scene equals existing Swift-generated canonical scene fixture',()=>{
  const golden=JSON.parse(readFileSync(new URL('../../../fixtures/scene.json',import.meta.url),'utf8'));assert.deepEqual(buildScene(fixture(),'floor-1'),golden);
});
test('door/window void rays miss hosts while solid walls remain selectable',()=>{const scene=buildScene(fixture(),'floor-1');const throughDoor=nearestSceneHit(scene,{x:2,y:1,z:1.45},{x:1,y:0,z:0});assert.equal(throughDoor?.objectID,'w2');const solid=nearestSceneHit(scene,{x:2,y:1,z:3},{x:1,y:0,z:0});assert.equal(solid?.objectID,'w6');const window=nearestSceneHit(scene,{x:2,y:1.4,z:2},{x:0,y:0,z:1});assert.equal(window,undefined);});
test('actual cutaway responds to viewpoint and does not edit canonical geometry',()=>{const d=fixture(),before=structuredClone(d),scene=buildScene(d,'floor-1');const left=evaluateCutaway(scene,{x:-3,y:1.5,z:2},{x:2,y:1.5,z:2},0);assert.ok(left.hiddenWallIDs.has('w5'));assert.ok(!left.hiddenWallIDs.has('w2'));const right=evaluateCutaway(scene,{x:11,y:1.5,z:2},{x:6,y:1.5,z:2},0);assert.ok(right.hiddenWallIDs.has('w2'));assert.ok(!right.hiddenWallIDs.has('w5'));assert.deepEqual(d,before);});
test('cutaway intersects real door and window holes instead of wall rectangles',()=>{const scene=buildScene(fixture(),'floor-1');assert.ok(!evaluateCutaway(scene,{x:2,y:1,z:1.45},{x:6,y:1,z:1.45},0).hiddenWallIDs.has('w6'));assert.ok(!evaluateCutaway(scene,{x:2,y:1.4,z:6},{x:2,y:1.4,z:2},0).hiddenWallIDs.has('w4'));});
test('top view retains walls and invalid viewpoints hide nothing',()=>{const scene=buildScene(fixture(),'floor-1');assert.equal(evaluateCutaway(scene,{x:2,y:20,z:2},{x:2,y:0,z:2},0).hiddenWallIDs.size,0);assert.equal(evaluateCutaway(scene,{x:NaN,y:0,z:0},{x:2,y:1,z:2}).hiddenWallIDs.size,0);});
test('ceiling uses actual polygon and rejects inconsistent wall tops',()=>{const d=fixture();assert.equal(displayCeilings(d,'floor-1').length,2);d.floors[0].walls[0].height=3;assert.deepEqual(displayCeilings(d,'floor-1').map(f=>f.objectID),['room-b']);});
test('semantic areas create only semantic edges and explicit scene 1.1',()=>{const d=fixture();d.schemaVersion='1.1.0';d.floors[0].areas=[{id:'drying',label:'Drying',polygon:[{x:1,z:1},{x:2,z:1},{x:1,z:2}],provenance:provenance()}];const scene=buildScene(d,'floor-1');assert.equal(scene.schemaVersion,'1.1.0');assert.equal(scene.edges.filter(e=>e.objectID==='drying').length,3);assert.equal(scene.faces.filter(f=>f.objectID==='drying').length,0);});
test('concave triangulation preserves area in both orientations and omits missing corner',()=>{const p=[{x:0,z:0},{x:4,z:0},{x:4,z:1},{x:1,z:1},{x:1,z:4},{x:0,z:4}];for(const ring of [p,[...p].reverse()]){const triangles=triangulate(ring);assert.equal(triangles.reduce((a,t)=>a+Math.abs(signedArea(t.map(i=>ring[i]))),0),7);assert.equal(triangles.length,4);}});
test('unsafe triangle indices cannot crash presentation',()=>{const scene=buildScene(fixture(),'floor-1');scene.faces[0].triangles=[[0,1,999],[-1,0,1],[0,1,1.5]];assert.doesNotThrow(()=>evaluateCutaway(scene,{x:-2,y:2,z:2},{x:2,y:1,z:2}));assert.doesNotThrow(()=>nearestSceneHit(scene,{x:2,y:1,z:2},{x:1,y:0,z:0}));});

function repeatedWalls(count:number,segments:number,fullOpening=false){
  const d=fixture(),f=emptyFloor('bounded');
  f.nodes=Array.from({length:segments+1},(_,i)=>({id:`n-${i}`,point:{x:i,z:0}}));
  const nodeIDs=f.nodes.map(n=>n.id);
  for(let i=0;i<count;i++){
    f.walls.push({id:`wall-${i}`,nodeIDs:[...nodeIDs],baseY:0,height:3,heightBasis:'synthetic',provenance:provenance()});
    if(fullOpening)f.openings.push({id:`opening-${i}`,wallID:`wall-${i}`,kind:'passage',offset:0,width:segments,bottom:0,height:3,provenance:provenance()});
  }
  d.floors=[f];return d;
}
test('legal canonical geometry that would exceed scene total capacity rejects before mesh generation',()=>{
  // 10,000 valid polylines would generate 210,000 wall faces and 440,000 edges.
  const d=repeatedWalls(10_000,21);assert.throws(()=>buildScene(d,'bounded'),/Scene exceeds the .* transport limit/);
});
test('edge-only output is preflighted independently of face count',()=>{
  // Full-height apertures leave no wall triangles but retain 404,000 real outlines.
  const d=repeatedWalls(2_000,100,true);assert.throws(()=>buildScene(d,'bounded'),/400000 edge transport limit/);
});
test('existing 400,000 edge limit is preserved rather than silently lowered to 200,000',()=>{
  const scene=buildScene(repeatedWalls(1_001,100,true),'bounded');assert.equal(scene.faces.length,0);assert.equal(scene.edges.length,202_202);
});
function ringDocument(count:number){
  const d=fixture(),f=emptyFloor('ring');f.nodes=Array.from({length:count},(_,i)=>({id:`n-${i}`,point:{x:5*Math.cos(i*Math.PI*2/count),z:5*Math.sin(i*Math.PI*2/count)}}));
  const cut1=Math.floor(count/3),cut2=Math.floor(count*2/3),ids=f.nodes.map(n=>n.id);
  f.walls=[ids.slice(0,cut1+1),ids.slice(cut1,cut2+1),[...ids.slice(cut2),ids[0]]].map((nodeIDs,i)=>({id:`wall-${i}`,nodeIDs,baseY:0,height:3,heightBasis:'synthetic',provenance:provenance()}));
  f.rooms=[{id:'room',label:'Bounded ring',boundary:f.walls.map(w=>({wallID:w.id,reversed:false}))}];d.floors=[f];return d;
}
test('the maximum room ring produces an admissible face and one extra vertex rejects',()=>{
  const face=buildScene(ringDocument(1000),'ring').faces.find(f=>f.role==='floor')!;assert.equal(face.vertices.length,1000);assert.equal(face.triangles.length,998);assert.ok(face.triangles.flat().every(i=>i<=999));assert.throws(()=>buildScene(ringDocument(1001),'ring'),/bounded simple nonzero polygon/);
});
