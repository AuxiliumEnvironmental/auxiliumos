import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, provenance } from '../core/fixtures';
import { SpatialWebStore, exportRevision, importWorkspace } from '../../src/data';
import { validateSVG } from '../../src/data/imports';
import { drawings } from '../../src/data/drawing';
import { fixtureFootprint } from '../../src/core';
import type { Fixture } from '../../src/types';
test('fixture-only/off-structure floors retain catalog/mount/provenance through durable undo/redo/reopen, JSON/scene/GLB and drawing extents',async()=>{
 const doc=fixture(),f=doc.floors[0];f.nodes=[];f.walls=[];f.openings=[];f.rooms=[];doc.title='Fixture only';const store=new SpatialWebStore(crypto.randomUUID());await store.create(doc);
 const value:Fixture={id:'island',catalog:{id:'kitchen-island',version:1},dimensions:{width:2,depth:1,height:.9},mount:{kind:'floor',position:{x:50,z:-23},yaw:.4,baseOffset:.1},provenance:provenance()};
 const edited=await store.apply(doc.documentID,1,[{type:'setFixture',floorID:f.id,fixture:value}]);assert.equal(edited.document.schemaVersion,'1.4.0');const frozen=await store.freeze(doc.documentID,2),pages=drawings(frozen,frozen.document.floors[0]);assert.ok(!pages[0].labels.some(l=>l.text.includes('No captured')));assert.ok(pages[0].lines.every(l=>l.a.x>=0&&l.a.x<=1200&&l.a.z>=0&&l.a.z<=900));assert.equal(fixtureFootprint(frozen.document,value,f.id).length,4);
 for(const format of ['geometry','scene','svg','glb'] as const){const a=await exportRevision(frozen,format,f.id);assert.ok(a.bytes.length);if(format==='scene')assert.deepEqual(JSON.parse(new TextDecoder().decode(a.bytes)).fixtures,edited.document.floors[0].fixtures);if(format==='glb'){const view=new DataView(a.bytes.buffer),length=view.getUint32(12,true),gltf=JSON.parse(new TextDecoder().decode(a.bytes.subarray(20,20+length)));assert.deepEqual(gltf.nodes.find((n:{extras?:{fixture?:Fixture}})=>n.extras?.fixture)?.extras.fixture,edited.document.floors[0].fixtures![0]);}if(format==='svg')validateSVG(a.bytes,'drawing');if(format==='geometry')assert.deepEqual((await importWorkspace(a.bytes,a.filename)).document,edited.document);}
 await assert.rejects(()=>exportRevision(frozen,'bundle',f.id),/legacy-exchange/);
 const undo=await store.undo(doc.documentID,2);assert.equal(undo.document.schemaVersion,'1.0.0');const redo=await store.redo(doc.documentID,3);assert.deepEqual(redo.document.floors[0].fixtures,edited.document.floors[0].fixtures);const namespace=store.namespace;store.close();const reopened=new SpatialWebStore(namespace);assert.deepEqual((await reopened.open(doc.documentID)).document,redo.document);reopened.close();
});
