// Independent review reproductions. Run from web with: node --import tsx tests/core/data-review-probes.mjs
// Source under review is read-only; all database writes target fresh fake-indexeddb namespaces.
import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { zipSync, zlibSync } from 'fflate';
import { SpatialWebStore } from '../../src/data/store.ts';
import { SpatialOutbox } from '../../src/data/outbox.ts';
import { exportRevision } from '../../src/data/exports.ts';
import { importDocument, validateSVG, validatePDF, validatePNG } from '../../src/data/imports.ts';
import { readZIP, writeZIP } from '../../src/data/zip.ts';
import { buildScene } from '../../src/core/index.ts';
import { concatenate, crc32, jsonBytes, sha256, utf8 } from '../../src/data/bytes.ts';

const base=JSON.parse(readFileSync(new URL('../../../fixtures/geometry.json',import.meta.url),'utf8'));
const outcomes=[];
const probe=async(name,run)=>{await run();outcomes.push({name,passed:true});};
const setup=async()=>{const store=new SpatialWebStore(`independent-review-${crypto.randomUUID()}`),a={...structuredClone(base),documentID:'review-a'},b={...structuredClone(base),documentID:'review-b'};await store.create(a);await store.create(b);return{store,a,b};};
const change=async(store,table,key,edit)=>store.transaction([table],'readwrite',tx=>new Promise((resolve,reject)=>{const objectStore=tx.objectStore(table),r=objectStore.get(key);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const row=r.result;edit(row);objectStore.put(row);resolve();};}));

await probe('saved revision row cannot substitute another document or corrupt a restore',async()=>{
  const{store}=await setup();try{await store.freeze('review-a',1);const b=await store.freeze('review-b',1);await change(store,'revisions','review-a:1',row=>row.frozen=b);await assert.rejects(store.loadFrozen('review-a',1),/identity-mismatch/);await assert.rejects(store.listRevisions('review-a'),/identity-mismatch/);await assert.rejects(store.restore('review-a',1,1),/identity-mismatch/);assert.equal((await store.open('review-a')).document.documentID,'review-a');assert.equal((await store.open('review-a')).document.revision,1);}finally{store.close();}
});
await probe('freeze cannot acknowledge already-corrupted retained bytes',async()=>{
  const{store}=await setup();try{await store.freeze('review-a',1);await change(store,'revisions','review-a:1',row=>row.frozen.bytes[0]=0);await assert.rejects(store.freeze('review-a',1),/frozen-revision-mismatch/);await assert.rejects(store.loadFrozen('review-a',1),/frozen-revision-mismatch/);assert.equal((await store.open('review-a')).document.revision,1);}finally{store.close();}
});
function trailingArchive(original,tail){
  const v=new DataView(original.buffer,original.byteOffset,original.byteLength),end=original.length-22,central=v.getUint32(end+16,true),result=new Uint8Array(original.length+tail.length);result.set(original.subarray(0,central));result.set(tail,central);result.set(original.subarray(central),central+tail.length);const out=new DataView(result.buffer);out.setUint32(18,v.getUint32(18,true)+tail.length,true);out.setUint32(central+tail.length+20,v.getUint32(central+20,true)+tail.length,true);out.setUint32(end+tail.length+16,central+tail.length,true);return result;
}
await probe('raw DEFLATE consumes every declared compressed byte',async()=>{
  const original=zipSync({'example.json':utf8.encode('portable-compatible data')},{level:6});
  for(const length of [1,4,255,256,257,1024])assert.throws(()=>readZIP(trailingArchive(original,new Uint8Array(length).fill(74))),/deflate|finished|stream|inflater/i);
});
await probe('pinned inflater consumption adapter retains ordinary multi-chunk compatibility',async()=>{
  for(const size of [1,257,4096,65536]){let state=12345;const bytes=Uint8Array.from({length:size},()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state&255;});for(const level of [1,6,9])assert.deepEqual(readZIP(zipSync({'ordinary.bin':bytes},{level}))['ordinary.bin'],bytes);}
});
await probe('preserved native drawing SVG fixtures remain importable only in their profile',async()=>{
  for(const name of ['floorplan-0.svg','floorplan-1.svg']){const bytes=new Uint8Array(readFileSync(new URL(`../../../tests/exports/continuation/fixtures/${name}`,import.meta.url)));validateSVG(bytes,'drawing');assert.throws(()=>validateSVG(bytes,'exchange'));}
});
function chunk(type,data){const out=new Uint8Array(data.length+12),v=new DataView(out.buffer);v.setUint32(0,data.length);out.set(utf8.encode(type),4);out.set(data,8);v.setUint32(8+data.length,crc32(out.subarray(4,8+data.length)));return out;}
function png({invalid=false,width=1,height=1}={}){const ihdr=new Uint8Array(13),v=new DataView(ihdr.buffer);v.setUint32(0,width);v.setUint32(4,height);ihdr.set(invalid?[0,99,99,99,99]:[8,6,0,0,0],8);return concatenate([new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlibSync(new Uint8Array([0,0,0,0,255]))),chunk('IEND',new Uint8Array())]);}
async function localArchive({image=png(),pdf=utf8.encode('%PDF-1.7\n%%EOF')}={}){
  const f='floors/0000/',files={'geometry.json':jsonBytes(base),[`${f}scene.json`]:jsonBytes(buildScene(base,'floor-1')),[`${f}floorplan-0000.svg`]:utf8.encode('<svg xmlns="http://www.w3.org/2000/svg"/>'),[`${f}floorplan-0000.png`]:image,[`${f}floorplan.pdf`]:pdf};
  const records=await Promise.all(Object.entries(files).map(async([path,bytes])=>({path,mimeType:path.endsWith('.json')?'application/json':path.endsWith('.svg')?'image/svg+xml':path.endsWith('.png')?'image/png':'application/pdf',sha256:await sha256(bytes),bytes:bytes.length,...(path==='geometry.json'?{}:{floorID:'floor-1'}),...(/\.(svg|png)$/.test(path)?{pageIndex:0}:{})})));
  files['manifest.json']=jsonBytes({profileVersion:'auxilium-spatial-local-document/1.0.0',documentID:base.documentID,revision:1,measurementStatus:'unverified',coordinateSystem:base.coordinateSystem,floors:[{floorID:'floor-1',label:base.floors[0].label,elevation:0,index:0,pageCount:1,representationStatus:'geometry'}],files:records});return writeZIP(files);
}
await probe('PDF name escaping cannot bypass native conservative admission',async()=>{
  for(const name of ['J#53','Java#53cript','A#41','U#52I','Obj#53tm','XR#65f','Encr#79pt','File#73pec'])assert.throws(()=>validatePDF(utf8.encode(`%PDF-1.7\n1 0 obj << /${name} (payload) >> endobj\n%%EOF`)),/pdf-active-name/);
  await assert.rejects(importDocument(await localArchive({pdf:utf8.encode('%PDF-1.7\n1 0 obj << /J#53 (payload) >> endobj\n%%EOF')}),'review.spatial.zip'),/pdf-active-name/);
});
await probe('PNG format and pixel budget preserve native constraints',async()=>{
  validatePNG(png());assert.throws(()=>validatePNG(png({invalid:true})),/format-limit/);assert.throws(()=>validatePNG(png({width:4096,height:4097})),/format-limit/);await assert.rejects(importDocument(await localArchive({image:png({invalid:true})}),'review.spatial.zip'),/format-limit/);
});
await probe('misassociated outbox archive is denied before authorization or upload',async()=>{
  const{store}=await setup();let authorizationCalls=0,uploads=0;try{const a=await store.freeze('review-a',1),b=await store.freeze('review-b',1);const transport={connected:true,authorize:async request=>{authorizationCalls++;return{handle:'synthetic-review',requestID:request.clientRequestID,destination:request.destination,expiresAt:Date.now()+120000};},assertAuthority:async()=>{},status:async()=>({state:'absent'}),reserve:async request=>({publicationID:'synthetic-review',request}),upload:async()=>{uploads++;},finalize:async reservation=>({state:'pending',reservation}),authenticateReceipt:async()=>false};const outbox=new SpatialOutbox(store,transport);await outbox.enqueue(a,{system:'auxiliumos',contextID:'synthetic-project'},'review-request');const artifact=await exportRevision(b,'bundle'),manifestHash=await sha256(readZIP(artifact.bytes)['manifest.json']);await change(store,'outbox','review-request',row=>{row.archive=artifact.bytes;Object.assign(row.summary.request,{archiveSHA256:artifact.hash,archiveByteCount:artifact.bytes.length,manifestSHA256:manifestHash});});assert.deepEqual(await outbox.deliver('review-request'),{state:'blocked',failure:'corrupt-outbox'});assert.equal(authorizationCalls,0);assert.equal(uploads,0);}finally{store.close();}
});
console.log(JSON.stringify({reviewer:'web_core; independent of data implementation',portableOnly:true,passed:outcomes.length,outcomes},null,2));
