import test from 'node:test';
import assert from 'node:assert/strict';
import { resizeCutout, moveCutout } from '../../src/ui/cutoutManipulation';
import type { Cutout } from '../../src/types';
import { provenance } from '../core/fixtures';
test('rotated cutout resize uses its chart basis and moves retain dimensions and authored side',()=>{
 const c:Cutout={id:'hole',kind:'cutout',surface:{floorID:'floor',kind:'wall',wallID:'wall',side:'negative'},profile:{shape:'rectangle',center:{u:2,v:2},width:1,height:.5,rotation:Math.PI/2},provenance:provenance()},next=resizeCutout(c,0,.2);assert.equal(next.profile.shape,'rectangle');if(next.profile.shape==='rectangle'){assert.ok(Math.abs(next.profile.width-1.4)<1e-9);assert.ok(Math.abs(next.profile.height-.5)<1e-9);}const moved=moveCutout(c,{u:0,v:0},{u:.1,v:.2});assert.deepEqual(moved.surface,c.surface);assert.deepEqual(c.profile.center,{u:2,v:2});assert.deepEqual(moved.profile.center,{u:2.1,v:2.2});
});
