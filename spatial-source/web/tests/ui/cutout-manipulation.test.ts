import test from 'node:test';
import assert from 'node:assert/strict';
import { resizeCutout, moveCutout } from '../../src/ui/cutoutManipulation';
import type { Cutout } from '../../src/types';
import { fixture, provenance } from '../core/fixtures';
import { applyCommands } from '../../src/core';
import { groupTranslation } from '../../src/ui/groupSelection';
test('rotated cutout resize uses its chart basis and moves retain dimensions and authored side',()=>{
 const c:Cutout={id:'hole',kind:'cutout',surface:{floorID:'floor',kind:'wall',wallID:'wall',side:'negative'},profile:{shape:'rectangle',center:{u:2,v:2},width:1,height:.5,rotation:Math.PI/2},provenance:provenance()},next=resizeCutout(c,0,.2);assert.equal(next.profile.shape,'rectangle');if(next.profile.shape==='rectangle'){assert.ok(Math.abs(next.profile.width-1.4)<1e-9);assert.ok(Math.abs(next.profile.height-.5)<1e-9);}const moved=moveCutout(c,{u:0,v:0},{u:.1,v:.2});assert.deepEqual(moved.surface,c.surface);assert.deepEqual(c.profile.center,{u:2,v:2});assert.deepEqual(moved.profile.center,{u:2.1,v:2.2});
});
test('group cutout movement cannot jump to a later straight wall run',()=>{
 const d=fixture(),floor=d.floors[0];floor.rooms=[];floor.openings=[];floor.nodes=[{id:'a',point:{x:0,z:0}},{id:'b',point:{x:3,z:0}},{id:'c',point:{x:3,z:3}},{id:'e',point:{x:6,z:3}}];floor.walls=[{id:'bent',nodeIDs:['a','b','c','e'],baseY:0,height:3,heightBasis:'synthetic',provenance:provenance()}];
 const cutout:Cutout={id:'hole',kind:'penetration',surface:{floorID:floor.id,kind:'wall',wallID:'bent',side:'positive'},profile:{shape:'circle',center:{u:1,v:1},diameter:.4},provenance:provenance()},document=applyCommands(d,[{type:'setCutout',floorID:floor.id,cutout}],d.revision).document;
 assert.throws(()=>groupTranslation(document,floor.id,[{floorID:floor.id,kind:'cutout',objectID:cutout.id}],{x:3,z:3}),/original straight/);
 const moved=groupTranslation(document,floor.id,[{floorID:floor.id,kind:'cutout',objectID:cutout.id}],{x:.2,z:0}).preview;
 assert.ok(Math.abs(moved.floors[0].cutouts![0].profile.center.u-1.2)<1e-9);
});
