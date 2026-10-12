import test from 'node:test';
import assert from 'node:assert/strict';
import type { EditCommand, Fixture } from '../../src/types';
import { applyCommands, fixtureFrame } from '../../src/core';
import { fixture, provenance } from './fixtures';
import { groupTranslation } from '../../src/ui/groupSelection';
function mounted(){const d=fixture(),f=d.floors[0],value:Fixture={id:'upper',catalog:{id:'upper-cabinet',version:1},dimensions:{width:.9,depth:.35,height:.75},mount:{kind:'wall',surface:{floorID:f.id,kind:'wall',wallID:'w0',side:'positive'},u:2,v:1.2},provenance:provenance()};return applyCommands(d,[{type:'setFixture',floorID:f.id,fixture:value}],1).document;}
test('mounted fixture follows completed whole-host translation and floor elevation; bent edits reject atomically',()=>{
 const d=mounted(),f=d.floors[0],original=fixtureFrame(d,f.fixtures![0],f.id),before=structuredClone(d);
 const commands:EditCommand[]=['n0','n1'].map(nodeID=>{const n=f.nodes.find(n=>n.id===nodeID)!;return{type:'moveNode',floorID:f.id,nodeID,point:{x:n.point.x+.3,z:n.point.z+.2}};});
 const next=applyCommands(d,commands,d.revision).document,frame=fixtureFrame(next,next.floors[0].fixtures![0],f.id);assert.ok(Math.abs(frame.origin.x-original.origin.x-.3)<1e-9);assert.ok(Math.abs(frame.origin.z-original.origin.z-.2)<1e-9);
 assert.throws(()=>applyCommands(d,commands.slice(0,1),d.revision),/Nonrigid/);assert.deepEqual(d,before);
 const raised=applyCommands(d,[{type:'updateFloor',floorID:f.id,label:f.label,elevation:4}],d.revision).document;assert.equal(fixtureFrame(raised,raised.floors[0].fixtures![0],f.id).origin.y,original.origin.y+4);
});
test('split and reversed join preserve physical wall anchor and side; crossing split resolves within same batch regardless of delete order',()=>{
 const d=mounted(),f=d.floors[0],original=fixtureFrame(d,f.fixtures![0],f.id),split:EditCommand={type:'splitWall',floorID:f.id,wallID:'w0',offset:1,newWallID:'right',newNodeID:'cut'};
 const r=applyCommands(d,[split],d.revision).document;assert.deepEqual(fixtureFrame(r,r.floors[0].fixtures![0],f.id),original);
 const joined=applyCommands(r,[{type:'joinWalls',floorID:f.id,firstWallID:'right',secondWallID:'w0'}],r.revision).document;assert.deepEqual(fixtureFrame(joined,joined.floors[0].fixtures![0],f.id),original);
 const crossed={...split,offset:2} as EditCommand;assert.throws(()=>applyCommands(d,[crossed],d.revision),/splitting/);
 for(const commands of [[crossed,{type:'deleteFixture',floorID:f.id,fixtureID:'upper'}],[{type:'deleteFixture',floorID:f.id,fixtureID:'upper'},crossed]] as EditCommand[][])assert.equal(applyCommands(d,commands,d.revision).document.floors[0].fixtures!.length,0);
});
test('group host plus attached fixture moves exactly once; standalone floor fixture group moves explicitly',()=>{
 const d=mounted(),f=d.floors[0],before=fixtureFrame(d,f.fixtures![0],f.id),result=groupTranslation(d,f.id,[{floorID:f.id,kind:'wall',objectID:'w0'},{floorID:f.id,kind:'fixture',objectID:'upper'}],{x:.1,z:-.2});
 const after=fixtureFrame(result.preview,result.preview.floors[0].fixtures![0],f.id);assert.ok(Math.abs(after.origin.x-before.origin.x-.1)<1e-9);assert.ok(Math.abs(after.origin.z-before.origin.z+.2)<1e-9);
});
test('rigid host rotation maps mounted geometry exactly without changing physical dimensions',()=>{
 const d=mounted(),f=d.floors[0],before=fixtureFrame(d,f.fixtures![0],f.id),commands:EditCommand[]=f.nodes.map(n=>({type:'moveNode',floorID:f.id,nodeID:n.id,point:{x:-n.point.z,z:n.point.x}})),next=applyCommands(d,commands,d.revision).document,after=fixtureFrame(next,next.floors[0].fixtures![0],f.id);assert.ok(Math.abs(after.origin.x+before.origin.z)<1e-9);assert.ok(Math.abs(after.origin.z-before.origin.x)<1e-9);assert.deepEqual(next.floors[0].fixtures![0].dimensions,f.fixtures![0].dimensions);
});
test('mixed host deformation and split cannot bypass atomic attachment validation',()=>{
 const d=mounted(),f=d.floors[0],before=structuredClone(d),commands:EditCommand[]=[{type:'moveNode',floorID:f.id,nodeID:'n1',point:{x:4,z:.2}},{type:'splitWall',floorID:f.id,wallID:'w0',offset:1,newWallID:'right',newNodeID:'cut'}];assert.throws(()=>applyCommands(d,commands,d.revision),/Separate attached-host/);assert.deepEqual(d,before);
});
