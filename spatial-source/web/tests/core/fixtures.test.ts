import test from 'node:test';
import assert from 'node:assert/strict';
import { FIXTURE_CATALOG } from '../../src/core/fixtureCatalog';
import { fixtureGeometry, fixtureFrame, fixtureFootprint } from '../../src/core/fixtures';
import { applyCommands, buildScene, validateDocument } from '../../src/core';
import { fixture, provenance } from './fixtures';
import type { Fixture } from '../../src/types';
import { establishCeilingSchema } from '../../src/core/ceilings';

test('all named families and every parametric archetype generate owned white-face/blue-edge roles with actual dimensions',()=>{
 const doc=fixture(),floor=doc.floors[0];assert.equal(FIXTURE_CATALOG.length,20);assert.equal(new Set(FIXTURE_CATALOG.map(p=>p.archetype)).size,10);
 for(const preset of FIXTURE_CATALOG){const value:Fixture={id:'fixture-'+preset.id,catalog:{id:preset.id,version:1},dimensions:{width:preset.width,depth:preset.depth,height:preset.height},mount:preset.mount==='floor'?{kind:'floor',position:{x:2,z:2},yaw:.4,baseOffset:.2}:{kind:'wall',surface:{floorID:floor.id,kind:'wall',wallID:'w0',side:'positive'},u:2,v:1.4},provenance:provenance()};
  const result=applyCommands(doc,[{type:'setFixture',floorID:floor.id,fixture:value}],doc.revision).document;assert.deepEqual(validateDocument(result),[]);const geometry=fixtureGeometry(result,value,floor.id);assert.ok(geometry.faces.length&&geometry.edges.length);assert.ok(geometry.faces.every(f=>f.role==='fixture'&&f.objectID===value.id));const frame=fixtureFrame(result,value,floor.id),ys=geometry.faces.flatMap(f=>f.vertices.map(p=>p.y));assert.ok(Math.abs(Math.max(...ys)-frame.origin.y-value.dimensions.height)<1e-9);
  const resized={...value,dimensions:{...value.dimensions,width:value.dimensions.width*1.2}};assert.notDeepEqual(fixtureFootprint(result,value,floor.id),fixtureFootprint(result,resized,floor.id));assert.ok(buildScene(result,floor.id).faces.some(f=>f.objectID===value.id));
 }
});
test('fixture validation is atomic for nonfinite, inversion, catalog, mount, ceiling and extent conflicts',()=>{
 const doc=fixture(),floor=doc.floors[0],value:Fixture={id:'item',catalog:{id:'toilet',version:1},dimensions:{width:.5,depth:.7,height:.8},mount:{kind:'floor',position:{x:2,z:2},yaw:0,baseOffset:0},provenance:provenance()};const before=structuredClone(doc);
 for(const height of [NaN,Infinity,0,-1])assert.throws(()=>applyCommands(doc,[{type:'setFixture',floorID:floor.id,fixture:{...value,dimensions:{...value.dimensions,height}}}],1));
 assert.deepEqual(doc,before);establishCeilingSchema(doc);assert.throws(()=>applyCommands(doc,[{type:'setFixture',floorID:floor.id,fixture:{...value,dimensions:{...value.dimensions,height:3}}}],1),/ceiling/);
});
