import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommands, buildScene, resolveSurface, surfacePointToWorld, WalkNavigation } from '../../src/core';
import { segmentTriangleHit } from '../../src/core/scene';
import { profileRing } from '../../src/core/cutoutGeometry';
import { fixture, provenance } from './fixtures';
import type { Cutout, SurfaceRef, EditCommand } from '../../src/types';

test('rectangle/circle on wall/floor/established ceiling subtract shared real material; opposite wall side agrees',()=>{
 for(const kind of ['wall','floor','ceiling'] as const)for(const shape of ['rectangle','circle'] as const){const d=fixture(),f=d.floors[0];d.schemaVersion='1.4.0';f.rooms[0].ceiling={id:'ceiling-a',height:2.6,heightBasis:'synthetic',provenance:provenance()};const ref:SurfaceRef=kind==='wall'?{floorID:f.id,kind,wallID:'w0',side:'positive'}:kind==='ceiling'?{floorID:f.id,kind,roomID:'room-a',ceilingID:'ceiling-a'}:{floorID:f.id,kind,roomID:'room-a'};
  const cutout:Cutout={id:'hole',kind:'penetration',surface:ref,profile:shape==='circle'?{shape,center:{u:2,v:kind==='wall'?1:2},diameter:.5}:{shape,center:{u:2,v:kind==='wall'?1:2},width:.5,height:.7,rotation:.2},provenance:provenance()};
  const next=applyCommands(d,[{type:'setCutout',floorID:f.id,cutout}],1).document,domain=resolveSurface(next,ref)!;assert.deepEqual(domain.domain.polygons[0].holes.at(-1),profileRing(cutout.profile));
  if(ref.kind==='wall')assert.deepEqual(resolveSurface(next,{...ref,side:'negative'})!.domain,domain.domain);
  const center=surfacePointToWorld(next,ref,cutout.profile.center)!,a=kind==='wall'?{...center,z:center.z-1}:{...center,y:center.y-1},b=kind==='wall'?{...center,z:center.z+1}:{...center,y:center.y+1},faces=buildScene(next,f.id).faces.filter(face=>face.role===kind&&face.objectID===(ref.kind==='wall'?ref.wallID:ref.roomID));assert.ok(faces.length);assert.ok(!faces.some(face=>face.triangles.some(t=>segmentTriangleHit(a,b,...t.map(i=>face.vertices[i]) as [typeof a,typeof a,typeof a])!==undefined)));
 }
});
test('touching/overlap, absent ceiling, nonfinite/inverted profile and crossing wall split reject atomically',()=>{
 const d=fixture(),f=d.floors[0],c:Cutout={id:'hole',kind:'cutout',surface:{floorID:f.id,kind:'wall',wallID:'w0',side:'positive'},profile:{shape:'circle',center:{u:2,v:1},diameter:.5},provenance:provenance()};const next=applyCommands(d,[{type:'setCutout',floorID:f.id,cutout:c}],1).document,before=structuredClone(next);
 assert.throws(()=>applyCommands(next,[{type:'setCutout',floorID:f.id,cutout:{...c,id:'other',surface:{...c.surface as Extract<SurfaceRef,{kind:'wall'}>,side:'negative'}}}],2),/disjoint/);
 for(const diameter of [0,-1,NaN,Infinity])assert.throws(()=>applyCommands(next,[{type:'setCutout',floorID:f.id,cutout:{...c,profile:{shape:'circle',center:{u:2,v:1},diameter}}}],2));
 assert.throws(()=>applyCommands(next,[{type:'setCutout',floorID:f.id,cutout:{...c,profile:{shape:'circle',center:{u:.25,v:1},diameter:.5}}}],2),/strictly/);
 assert.throws(()=>applyCommands(next,[{type:'setCutout',floorID:f.id,cutout:{...c,surface:{floorID:f.id,kind:'ceiling',roomID:'room-a',ceilingID:'missing'}}}],2),/existing surface/);
 const split:EditCommand={type:'splitWall',floorID:f.id,wallID:'w0',offset:2,newWallID:'right',newNodeID:'cut'};assert.throws(()=>applyCommands(next,[split],2),/splitting/);
 assert.equal(applyCommands(next,[split,{type:'deleteCutout',floorID:f.id,cutoutID:'hole'}],2).document.floors[0].cutouts!.length,0);assert.deepEqual(next,before);
});
test('floor holes block placement and continuous walk paths; fixtures and wall holes never gain portal permission',()=>{
 const d=fixture(),f=d.floors[0],c:Cutout={id:'void',kind:'cutout',surface:{floorID:f.id,kind:'floor',roomID:'room-a'},profile:{shape:'rectangle',center:{u:2,v:2},width:1,height:1,rotation:0},provenance:provenance()},next=applyCommands(d,[{type:'setCutout',floorID:f.id,cutout:c}],1).document,nav=new WalkNavigation(next,f.id);
 assert.throws(()=>nav.place({x:2,z:2}),/clear/);const start=nav.place({x:1,z:2}),move=nav.move(start,{x:3,z:2});assert.equal(move.reachedTarget,false);assert.equal(move.stop,'floorVoid');assert.ok(move.position.point.x<1.5);const begun=nav.start('room-a');assert.ok(Math.hypot(begun.point.x-2,begun.point.z-2)>.5);
 assert.deepEqual(nav.portals,new WalkNavigation(d,f.id).portals);
});
