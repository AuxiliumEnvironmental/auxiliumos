import test from 'node:test';
import assert from 'node:assert/strict';
import { beginFixtureDrag, fixtureDragPreview } from '../../src/ui/fixtureManipulation';
import { fixtureFootprint } from '../../src/core/fixtures';
import type { Fixture } from '../../src/types';
import { fixture, provenance } from '../core/fixtures';
test('floor corner resize preserves opposite corner, yaw and finger offset; one source snapshot drives all previews',()=>{
 const d=fixture(),floorID=d.floors[0].id,f:Fixture={id:'test',catalog:{id:'toilet',version:1},dimensions:{width:1,depth:2,height:1},mount:{kind:'floor',position:{x:2,z:2},yaw:.7,baseOffset:.2},provenance:provenance()},before=fixtureFootprint(d,f,floorID),grab={x:2.4,y:.2,z:3.1},drag=beginFixtureDrag(d,floorID,f,'corner2',grab),next=fixtureDragPreview(drag,{x:grab.x+.2,y:grab.y,z:grab.z+.2}),after=fixtureFootprint(d,next,floorID);assert.ok(Math.hypot(after[0].x-before[0].x,after[0].z-before[0].z)<1e-9);assert.deepEqual(f,drag.original);assert.equal(next.mount.kind==='floor'?next.mount.yaw:0,.7);assert.throws(()=>fixtureDragPreview(drag,{x:grab.x-20,y:grab.y,z:grab.z-20}),/invert/);
});
test('wall fixture drag rejects jumping beyond original contiguous run even if a later run would fit',()=>{
 const d=fixture(),floor=d.floors[0];floor.rooms=[];floor.openings=[];floor.nodes=[{id:'a',point:{x:0,z:0}},{id:'b',point:{x:3,z:0}},{id:'c',point:{x:3,z:3}},{id:'e',point:{x:6,z:3}}];floor.walls=[{id:'bent',nodeIDs:['a','b','c','e'],baseY:0,height:3,heightBasis:'synthetic',provenance:provenance()}];const f:Fixture={id:'test',catalog:{id:'upper-cabinet',version:1},dimensions:{width:.5,depth:.3,height:.5},mount:{kind:'wall',surface:{floorID:floor.id,kind:'wall',wallID:'bent',side:'positive'},u:1,v:1},provenance:provenance()},drag=beginFixtureDrag(d,floor.id,f,'move',{x:1,y:1,z:0});assert.throws(()=>fixtureDragPreview(drag,{x:7,y:1,z:0}),/original straight/);
});
