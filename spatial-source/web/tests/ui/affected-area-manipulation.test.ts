import test from 'node:test';
import assert from 'node:assert/strict';
import { affectedDragPreview, AffectedPreviewQueue, affectedFenceMatches, projectAffectedRay } from '../../src/ui/affectedAreaManipulation';
import { rectangle } from '../../src/core/affectedAreaGeometry';
import { fixture } from '../core/fixtures';
test('plan length endpoints preserve every vertical coordinate and finger offset',()=>{
  const original=rectangle(1,.4,3,1.8),drag={original,start:{u:1.1,v:0},handle:'start' as const,planWall:true};
  const preview=affectedDragPreview(drag,{u:1.6,v:99})!;assert.equal(preview.outer[0].u,1.5);assert.deepEqual(preview.outer.map(p=>p.v),original.outer.map(p=>p.v));assert.equal(preview.outer[1].u,3);assert.deepEqual(original,rectangle(1,.4,3,1.8));assert.equal(affectedDragPreview(drag,{u:4,v:0}),null);
});
test('corner resize fixes the opposite corner and body move preserves dimensions',()=>{
  const original=rectangle(1,.4,3,1.8),drag={original,start:{u:1.1,v:.5},handle:0 as const,planWall:false};const preview=affectedDragPreview(drag,{u:1.6,v:.6})!;
  assert.deepEqual(preview.outer[2],original.outer[2]);assert.equal(preview.outer[0].u,1.5);assert.ok(Math.abs(preview.outer[0].v-.5)<1e-8);
  const moved=affectedDragPreview({...drag,handle:'body'},{u:2.1,v:1.5})!;assert.ok(Math.abs(moved.outer[1].u-moved.outer[0].u-2)<1e-8);
});
test('120 samples coalesce to one frame; terminal sample replaces pending preview; cancel has no publish',()=>{
  let next=0;const tasks=new Map<number,()=>void>(),published:number[]=[];
  const queue=new AffectedPreviewQueue<number>(v=>published.push(v),cb=>{tasks.set(++next,cb);return next;},id=>{tasks.delete(id);});
  for(let i=0;i<120;i++)queue.move(i);assert.equal(tasks.size,1);assert.equal(published.length,0);
  queue.release(120.125);assert.deepEqual(published,[120.125]);assert.equal(tasks.size,0);
  queue.move(200);queue.cancel();assert.equal(tasks.size,0);assert.deepEqual(published,[120.125]);
});
test('revision/context fences and near-parallel rays fail closed',()=>{
  const a={documentID:'a',revision:4,contextKey:'scope1'};for(const b of [{...a,revision:5},{...a,documentID:'b'},{...a,contextKey:'scope2'}])assert.equal(affectedFenceMatches(a,b),false);
  const document=fixture();assert.equal(projectAffectedRay(document,{floorID:'floor-1',kind:'wall',wallID:'w0',side:'positive'},{origin:{x:1,y:1,z:1},direction:{x:1,y:0,z:0}},1),null);
  assert.deepEqual(projectAffectedRay(document,{floorID:'floor-1',kind:'wall',wallID:'w0',side:'positive'},{origin:{x:1,y:1,z:1},direction:{x:0,y:0,z:-1}},1),{u:1,v:1});
});
