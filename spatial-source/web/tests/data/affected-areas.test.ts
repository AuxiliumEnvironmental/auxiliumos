import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fixture, provenance } from '../core/fixtures';
import { applyCommands, buildScene, requireValidDocument } from '../../src/core';
import { rectangle } from '../../src/core/affectedAreaGeometry';
import { affectedPlanPrimitives } from '../../src/core/affectedAreas';
import { glbDrawing } from '../../src/data/glb';
import { jsonBytes, sha256, strictJSON } from '../../src/data/bytes';
import { readZIP } from '../../src/data/zip';
import { AFFECTED_COLORS } from '../../src/affectedAreaPalette';
import type { FrozenRevision, SpatialDocument } from '../../src/types';
function observed(): SpatialDocument {
  let d=fixture();
  d=applyCommands(d,[{type:'recordAffectedArea',areaID:'wall-moisture',kind:'moisture',surface:{floorID:'floor-1',kind:'wall',wallID:'w4',side:'negative'},footprint:rectangle(.1,.2,3.8,2.4)}],d.revision).document;
  d=applyCommands(d,[{type:'recordAffectedArea',areaID:'floor-fire',kind:'fire',surface:{floorID:'floor-1',kind:'floor',roomID:'room-a'},footprint:rectangle(.5,.5,2.5,2)}],d.revision).document;
  // Synthetic established-ceiling interface fixture, not F03 acceptance.
  d.floors[0].rooms[0].ceiling={id:'ceiling-a',height:2.6,heightBasis:'synthetic',provenance:provenance()};
  return applyCommands(d,[{type:'recordAffectedArea',areaID:'ceiling-moisture',kind:'moisture',surface:{floorID:'floor-1',kind:'ceiling',roomID:'room-a',ceilingID:'ceiling-a'},footprint:rectangle(.6,.7,2.8,2.4)}],d.revision).document;
}
async function frozen(document=observed()):Promise<FrozenRevision>{const bytes=jsonBytes(document);return{document,bytes,hash:await sha256(bytes),createdAt:'2026-10-11T16:18:04Z'};}
function parseGLB(bytes:Uint8Array){const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);assert.equal(view.getUint32(0,true),0x46546c67);assert.equal(view.getUint32(8,true),bytes.length);return JSON.parse(new TextDecoder().decode(bytes.slice(20,20+view.getUint32(12,true))));}
test('F05 geometry JSON preserves identity, support, revision and derived scene on strict re-admission',async()=>{
  const f=await frozen(),again=requireValidDocument(strictJSON(f.bytes));assert.deepEqual(again,f.document);assert.equal(await sha256(jsonBytes(again)),f.hash);
  assert.deepEqual(buildScene(again,'floor-1'),buildScene(f.document,'floor-1'));
  assert.deepEqual(again.affectedAreas!.map(a=>[a.id,a.sourceRevision,a.recordedSupport,a.measurementStatus]),f.document.affectedAreas!.map(a=>[a.id,a.sourceRevision,a.recordedSupport,'unverified']));
  const before=f.bytes.slice();applyCommands(again,[{type:'deleteOpening',floorID:'floor-1',openingID:'window-a'}],again.revision);assert.deepEqual(f.bytes,before);
});
test('GLB carries exact frozen identity, explicit surfaces, sided alpha materials and preserved F01 structural colors',async()=>{
  const f=await frozen(),bytes=glbDrawing(f,'floor-1'),g=parseGLB(bytes);
  assert.deepEqual(glbDrawing(f,'floor-1'),bytes);assert.equal(g.asset.extras.sourceSHA256,f.hash);assert.equal(g.asset.extras.geometrySchemaVersion,'1.5.0');assert.equal(g.asset.extras.revision,f.document.revision);
  const overlays=g.meshes.filter((m:any)=>m.extras.role.startsWith('affected-'));assert.ok(overlays.length>=3);
  for(const mesh of overlays){assert.equal(mesh.extras.measurementStatus,'unverified');assert.ok(['wall','floor','ceiling'].includes(mesh.extras.surface.kind));const m=g.materials[mesh.primitives[0].material];assert.equal(m.doubleSided,false);assert.equal(m.alphaMode,'BLEND');assert.equal(m.pbrMetallicRoughness.baseColorFactor[3],.24);}
  assert.equal(overlays.find((m:any)=>m.extras.objectID==='wall-moisture').extras.surface.side,'negative');
  assert.equal(g.materials[0].alphaMode,'OPAQUE');assert.equal(g.materials[1].alphaMode,'OPAQUE');assert.ok(g.materials[0].pbrMetallicRoughness.baseColorFactor[0]>g.materials[1].pbrMetallicRoughness.baseColorFactor[0]);
});
test('one canonical plan generator emits floor fills, two-direction ceiling grid, and wall-side lines',()=>{
  const d=observed(),p=affectedPlanPrimitives(d,'floor-1');assert.ok(p.polygons.length);assert.ok(p.polygons.every(x=>x.color===AFFECTED_COLORS.fire.fill));
  const grid=p.lines.filter(x=>x.surface.kind==='ceiling');assert.ok(grid.some(l=>l.a.x===l.b.x));assert.ok(grid.some(l=>l.a.z===l.b.z));assert.ok(p.lines.some(x=>x.wall&&x.color===AFFECTED_COLORS.moisture.line));assert.deepEqual(affectedPlanPrimitives(d,'floor-1'),p);
});
const require=createRequire(import.meta.url);let dependencyReason:string|false=false;
try{for(const name of ['fake-indexeddb/auto','jspdf','fflate'])require.resolve(name);}catch{dependencyReason='Requires the locked fake-indexeddb, jspdf and fflate packages. Not executed without them.';}
test('real store undo/redo/reopen and export admission retain F05 records',{skip:dependencyReason},async()=>{
  require('fake-indexeddb/auto');const {SpatialWebStore}=await import('../../src/data/store');const {exportRevision}=await import('../../src/data/exports');const {importDocument,validateSVG,validatePDF}=await import('../../src/data/imports');
  const namespace=`f05-${crypto.randomUUID()}`,store=new SpatialWebStore(namespace),d=observed();
  try{
    await store.create(d);const next=await store.apply(d.documentID,d.revision,[{type:'deleteOpening',floorID:'floor-1',openingID:'window-a'}]);
    const undone=await store.undo(d.documentID,next.document.revision);assert.deepEqual(undone.document.affectedAreas,d.affectedAreas);assert.deepEqual(undone.document.floors,d.floors);
    const redone=await store.redo(d.documentID,undone.document.revision);assert.deepEqual(redone.document.affectedAreas,next.document.affectedAreas);
    const f=await store.freeze(d.documentID,redone.document.revision),svg=await exportRevision(f,'svg','floor-1'),pdf=await exportRevision(f,'pdf','floor-1');
    if(svg.mimeType==='application/zip'){
      const files=readZIP(svg.bytes),manifest=strictJSON(files['manifest.json']) as {files:{path:string;sha256:string}[]};
      assert.ok(manifest.files.length>1);
      for(const member of manifest.files){validateSVG(files[member.path]);assert.equal(await sha256(files[member.path]),member.sha256);}
    }else validateSVG(svg.bytes);
    validatePDF(pdf.bytes);
    await assert.rejects(exportRevision(f,'bundle','floor-1'),/complete-local-document/);
    const json=await exportRevision(f,'geometry');assert.deepEqual(await importDocument(json.bytes,json.filename),redone.document);
    store.close();const reopened=new SpatialWebStore(namespace);try{assert.deepEqual((await reopened.open(d.documentID)).document,redone.document);assert.equal((await reopened.loadFrozen(d.documentID,redone.document.revision)).hash,f.hash);}finally{reopened.close();}
  }finally{store.close();}
});
// Complete local-document archives include PNG and are tested in the browser spec,
// never replaced with a mocked PNG or geometry-only backup in this unit test.
