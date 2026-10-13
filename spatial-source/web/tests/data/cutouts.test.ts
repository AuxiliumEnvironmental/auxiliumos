import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, provenance } from '../core/fixtures';
import { SpatialWebStore, exportRevision } from '../../src/data';
import { buildScene, resolveSurface } from '../../src/core';
import type { Cutout, SurfaceRef } from '../../src/types';
test('wall/floor/ceiling holes retain exact profiles, domains and scene through frozen export and atomic history restore',async()=>{
 for(const kind of ['wall','floor','ceiling'] as const){const doc=fixture(),f=doc.floors[0];if(kind==='ceiling'){doc.schemaVersion='1.4.0';f.rooms[0].ceiling={id:'ceiling',height:2.6,heightBasis:'synthetic',provenance:provenance()};}const store=new SpatialWebStore(crypto.randomUUID());await store.create(doc);const ref:SurfaceRef=kind==='wall'?{floorID:f.id,kind,wallID:'w0',side:'negative'}:kind==='ceiling'?{floorID:f.id,kind,roomID:'room-a',ceilingID:'ceiling'}:{floorID:f.id,kind,roomID:'room-a'},value:Cutout={id:'hole',kind:'penetration',surface:ref,profile:{shape:'circle',center:{u:2,v:kind==='wall'?1:2},diameter:.4},provenance:provenance()};const edited=await store.apply(doc.documentID,1,[{type:'setCutout',floorID:f.id,cutout:value}]),frozen=await store.freeze(doc.documentID,2),scene=await exportRevision(frozen,'scene',f.id);assert.deepEqual(JSON.parse(new TextDecoder().decode(scene.bytes)),buildScene(edited.document,f.id));assert.ok(resolveSurface(edited.document,ref)!.domain.polygons[0].holes.length);
  await store.undo(doc.documentID,2);const restored=await store.redo(doc.documentID,3);assert.deepEqual(restored.document.floors[0].cutouts,edited.document.floors[0].cutouts);assert.deepEqual(resolveSurface(restored.document,ref)!.domain,resolveSurface(edited.document,ref)!.domain);store.close();
 }
});
