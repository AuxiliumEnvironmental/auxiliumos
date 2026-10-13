import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyCommands, buildScene, signedArea} from '../../src/core';
import {establishCeilingSchema} from '../../src/core/ceilings';
import {resolveSurface, resolveUncutSurface, surfacePointToWorld, wallSurfaceFrame, surfaceRemapReceipt, transformSurfacePoint, composeSurfaceTransforms} from '../../src/core/surfaces';
import type {SurfaceDomain, SurfaceRef} from '../../src/types';
import {fixture, emptyFloor, provenance} from './fixtures';
const wallRef=(side:'positive'|'negative'='positive'):SurfaceRef=>({floorID:'floor-1',kind:'wall',wallID:'w6',side});
const area=(domain:SurfaceDomain)=>domain.polygons.reduce((sum,p)=>sum+Math.abs(signedArea(p.outer.map(v=>({x:v.u,z:v.v}))))-p.holes.reduce((a,h)=>a+Math.abs(signedArea(h.map(v=>({x:v.u,z:v.v})))),0),0);

test('F03-A04 real material domain equals wall aperture subtraction on both physical sides',()=>{
  const d=fixture(),f=d.floors[0],wall=f.walls.find(w=>w.id==='w6')!,opening=f.openings.find(o=>o.wallID==='w6')!;
  const positive=resolveSurface(d,wallRef())!,negative=resolveSurface(d,wallRef('negative'))!;
  assert.deepEqual(positive.domain,negative.domain);assert(Math.abs(area(positive.domain)-(4*wall.height-opening.width*opening.height))<1e-9);
  assert.equal(area(resolveUncutSurface(d,wallRef())!.domain),4*wall.height);
  const scene=buildScene(d,'floor-1');const triangles=scene.faces.filter(face=>face.objectID==='w6');let sum=0;for(const face of triangles)for(const t of face.triangles){const [a,b,c]=t.map(i=>face.vertices[i]);const u={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},v={x:c.x-a.x,y:c.y-a.y,z:c.z-a.z};sum+=Math.hypot(u.y*v.z-u.z*v.y,u.z*v.x-u.x*v.z,u.x*v.y-u.y*v.x)/2;}assert(Math.abs(sum-area(positive.domain))<1e-9);
});
test('wall charts follow a bend, choose outgoing vertex tangent, and include floor/base offsets',()=>{
  const d=fixture(),f=emptyFloor('bent');f.elevation=8;f.nodes=[{id:'a',point:{x:0,z:0}},{id:'b',point:{x:2,z:0}},{id:'c',point:{x:2,z:3}}];f.walls=[{id:'wall',nodeIDs:['a','b','c'],baseY:.6,height:3,heightBasis:'assumed',provenance:provenance()}];d.floors=[f];const ref:Extract<SurfaceRef,{kind:'wall'}>={floorID:f.id,kind:'wall',wallID:'wall',side:'positive'};
  assert.deepEqual(surfacePointToWorld(d,ref,{u:3,v:1}),{x:2,y:9.6,z:1});assert.deepEqual(wallSurfaceFrame(d,ref,2)!.tangent,{x:0,y:0,z:1});assert.deepEqual(wallSurfaceFrame(d,ref,2)!.normal,{x:-1,y:0,z:0});assert.deepEqual(wallSurfaceFrame(d,{...ref,side:'negative'},2)!.normal,{x:1,y:0,z:-0});assert.equal(surfacePointToWorld(d,ref,{u:6,v:1}),null);
});
test('horizontal references use independent floor frames and only stable established ceiling IDs',()=>{
  const d=fixture(),ref:SurfaceRef={floorID:'floor-1',kind:'ceiling',roomID:'room-a',ceilingID:'invented'};assert.equal(resolveSurface(d,ref),null);establishCeilingSchema(d);const f=d.floors[0];f.elevation=12;const actual={...ref,ceilingID:f.rooms[0].ceiling!.id};assert.equal(resolveSurface(d,actual)!.sourceRevision,d.revision);assert.deepEqual(surfacePointToWorld(d,actual,{u:2,v:3}),{x:2,y:12+f.rooms[0].ceiling!.height,z:3});assert.equal(resolveSurface(d,ref),null);f.rooms[0].ceiling=null;assert.equal(resolveSurface(d,actual),null);
});
test('F03-A04 ceiling height receipt retains chart footprint and stable host IDs',()=>{
  const d=fixture();establishCeilingSchema(d);const before=d.floors[0].rooms[0].ceiling!,result=applyCommands(d,[{type:'setCeilingHeights',targets:[{floorID:'floor-1',roomID:'room-a'}],mode:'delta',value:.5}],d.revision);const receipt=result.receipt.surfaceRemaps!;assert.equal(receipt.sourceRevision,d.revision);assert.equal(receipt.resultingRevision,result.document.revision);const ceiling=receipt.mappings.find(m=>m.from.kind==='ceiling'&&m.from.ceilingID===before.id)!;assert.equal(ceiling.outcome,'exact');assert.deepEqual(ceiling.from,ceiling.to);assert.deepEqual(ceiling.transform,[1,0,0,1,0,0]);assert.equal(area(ceiling.sourceDomain),16);assert(receipt.mappings.some(m=>m.from.kind==='wall'&&m.outcome==='clipped_needs_review'));
});
test('F03-A04 split/merge domain receipts never use triangle identities or nearest hosts',()=>{
  const source=fixture();establishCeilingSchema(source);const merged=applyCommands(source,[{type:'mergeRooms',floorID:'floor-1',firstRoomID:'room-a',secondRoomID:'room-b'}],source.revision);const mappings=merged.receipt.surfaceRemaps!.mappings.filter(m=>m.from.kind==='ceiling');assert.equal(mappings.length,2);assert(mappings.every(m=>m.outcome==='exact'));assert(mappings.every(m=>area(m.sourceDomain)===16));
  const split=applyCommands(merged.document,[{type:'addWall',floorID:'floor-1',wall:source.floors[0].walls.find(w=>w.id==='w6')!,newNodes:[]},{type:'splitRoom',floorID:'floor-1',roomID:'room-a',dividerWallID:'w6',newRoomID:'room-new',newLabel:'New'}],merged.document.revision);const ceiling=split.receipt.surfaceRemaps!.mappings.filter(m=>m.from.kind==='ceiling');assert.equal(ceiling.length,2);assert(ceiling.every(m=>m.outcome==='exact'));assert.equal(ceiling.reduce((sum,m)=>sum+area(m.sourceDomain),0),32);
  const changed=applyCommands(source,[{type:'moveNode',floorID:'floor-1',nodeID:'n0',point:{x:-.3,z:0}}],source.revision);assert(changed.receipt.surfaceRemaps!.mappings.some(m=>m.from.kind==='ceiling'&&m.outcome==='unresolved'&&m.transform===null));
});
test('exact wall split coordinates and reversed join side transformations compose',()=>{
  const d=fixture();establishCeilingSchema(d);const split=applyCommands(d,[{type:'splitWall',floorID:'floor-1',wallID:'w6',offset:.5,newWallID:'right',newNodeID:'cut'}],d.revision);const mapping=split.receipt.surfaceRemaps!.mappings.find(m=>m.from.kind==='wall'&&m.from.wallID==='w6'&&m.from.side==='positive'&&m.to?.kind==='wall'&&m.to.wallID==='right')!;assert.deepEqual(transformSurfacePoint({u:2,v:1},mapping.transform!),{u:1.5,v:1});assert.deepEqual(surfacePointToWorld(d,mapping.from,{u:2,v:1}),surfacePointToWorld(split.document,mapping.to!,{u:1.5,v:1}));
  const reversed=structuredClone(d);const wall=reversed.floors[0].walls.find(w=>w.id==='w6')!;wall.nodeIDs.reverse();for(const room of reversed.floors[0].rooms)for(const ref of room.boundary)if(ref.wallID==='w6')ref.reversed=!ref.reversed;for(const o of reversed.floors[0].openings)if(o.wallID==='w6')o.offset=4-o.offset-o.width;reversed.revision++;
  const remap=surfaceRemapReceipt(d,reversed).mappings.find(m=>m.from.kind==='wall'&&m.from.wallID==='w6'&&m.from.side==='positive')!;assert.equal((remap.to as Extract<SurfaceRef,{kind:'wall'}>).side,'negative');assert.deepEqual(transformSurfacePoint({u:1,v:2},remap.transform!),{u:3,v:2});assert.deepEqual(composeSurfaceTransforms(remap.transform!,remap.transform!),[1,0,0,1,0,0]);
});
test('bounded invalid surface references and null ceilings never resolve',()=>{
  const d=fixture();for(const ref of [{...wallRef(),wallID:'missing'},{floorID:'floor-1',kind:'floor',roomID:'missing'},{floorID:'absent',kind:'wall',wallID:'w6',side:'positive'}] as SurfaceRef[])assert.equal(resolveSurface(d,ref),null);
  assert.equal(surfacePointToWorld(d,wallRef(),{u:NaN,v:1}),null);
});

test('F03 opening-only material changes issue both-side review receipts without a wall-ID mutation',()=>{
  const source=fixture();establishCeilingSchema(source);
  const opening=source.floors[0].openings[0];
  const result=applyCommands(source,[{type:'moveOpening',floorID:'floor-1',openingID:opening.id,offset:opening.offset+.1}],source.revision);
  const remaps=result.receipt.surfaceRemaps!.mappings.filter(mapping=>mapping.from.kind==='wall'&&mapping.from.wallID===opening.wallID);
  assert.equal(remaps.length,2);assert(remaps.every(mapping=>mapping.outcome==='clipped_needs_review'));
  assert.deepEqual(remaps.map(mapping=>mapping.from.kind==='wall'&&mapping.from.side).sort(),['negative','positive']);
});
