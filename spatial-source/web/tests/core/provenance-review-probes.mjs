// Independent, read-only-source review of the approved recoverable copy profile.
// Run from web: node --import tsx tests/core/provenance-review-probes.mjs
import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SpatialWebStore } from '../../src/data/store.ts';
import { exportRevision } from '../../src/data/exports.ts';
import { importWorkspace, validatePDF } from '../../src/data/imports.ts';
import { validateSourceProvenance } from '../../src/data/provenance.ts';
import { jsonBytes, sha256, strictJSON } from '../../src/data/bytes.ts';
import { readZIP, writeZIP } from '../../src/data/zip.ts';

const original=JSON.parse(readFileSync(new URL('../../../fixtures/geometry.json',import.meta.url),'utf8'));
const readArtifact=name=>new Uint8Array(readFileSync(new URL(`../data/generated/browser/${name}`,import.meta.url)));
const copiedArchive=readArtifact('copied-all-floor.spatial.zip');
const results=[];
const probe=async(name,run)=>{await run();results.push({name,passed:true});};
const store=()=>new SpatialWebStore(`provenance-independent-${crypto.randomUUID()}`);
const edit=async(db,table,key,change)=>db.transaction([table],'readwrite',tx=>new Promise((resolve,reject)=>{const s=tx.objectStore(table),r=s.get(key);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const row=r.result;change(row);s.put(row);resolve();};}));
const rename=(label)=>[{type:'renameRoom',floorID:'floor-1',roomID:'room-a',label}];

await probe('concurrent copy retries retain one independent draft and later corrections',async()=>{
  const a=store(),b=new SpatialWebStore(a.namespace);try{await a.create(original);await a.apply(original.documentID,1,rename('Original correction'));const copies=await Promise.all([a.createCopy(original,'native-recovery'),b.createCopy(original,'native-recovery')]);assert.equal(copies[0].document.documentID,copies[1].document.documentID);const id=copies[0].document.documentID;assert.notEqual(id,original.documentID);assert.equal(copies[0].document.revision,1);assert.deepEqual(copies[0].document.floors,original.floors);await a.apply(id,1,rename('Copy correction'));assert.equal((await b.createCopy(original,'native-recovery')).document.revision,2);assert.equal((await a.open(original.documentID)).document.floors[0].rooms[0].label,'Original correction');assert.equal((await a.open(id)).document.floors[0].rooms[0].label,'Copy correction');const frozen=await a.freeze(id,2);assert.deepEqual(frozen.sourceBytes,jsonBytes(original));assert.equal(frozen.sourceIdentity.sha256,await sha256(frozen.sourceBytes));assert.equal((await a.list()).length,2);}finally{a.close();b.close();}
});
await probe('copy source association survives undo, redo, frozen restoration, and reopening',async()=>{
  const db=store();let ns,id,identity;try{const copy=await db.createCopy(original,'native-recovery');id=copy.document.documentID;identity=copy.sourceIdentity;ns=db.namespace;await db.freeze(id,1);await db.apply(id,1,rename('Changed'));await db.undo(id,2);await db.redo(id,3);await db.restore(id,1,4);assert.equal((await db.open(id)).document.revision,5);assert.deepEqual((await db.open(id)).sourceIdentity,identity);}finally{db.close();}const reopened=new SpatialWebStore(ns);try{assert.deepEqual((await reopened.open(id)).sourceIdentity,identity);assert.deepEqual((await reopened.freeze(id,5)).sourceBytes,jsonBytes(original));}finally{reopened.close();}
});
await probe('draft and immutable source-sidecar misassociation fail before restored writes',async()=>{
  for(const table of ['drafts','revisions']){const db=store();try{const a=await db.createCopy(original),other={...structuredClone(original),documentID:'different-origin'},b=await db.createCopy(other),af=await db.freeze(a.document.documentID,1),bf=await db.freeze(b.document.documentID,1);await edit(db,table,table==='drafts'?a.document.documentID:`${a.document.documentID}:1`,row=>{const target=table==='drafts'?row:row.frozen;target.sourceIdentity=bf.sourceIdentity;target.sourceBytes=bf.sourceBytes;});if(table==='drafts')await assert.rejects(db.open(a.document.documentID),/corrupt-local-history/);else{await assert.rejects(db.loadFrozen(a.document.documentID,1),/frozen-source-provenance-mismatch/);await assert.rejects(db.restore(a.document.documentID,1,1),/frozen-source-provenance-mismatch/);assert.deepEqual((await db.open(a.document.documentID)).document,af.document);}}finally{db.close();}}
});
await probe('actual browser-produced copy archive binds all floors and exact original source',async()=>{
  const members=readZIP(copiedArchive),manifest=strictJSON(members['manifest.json']),descriptor=strictJSON(members['source/identity.json']),imported=await importWorkspace(copiedArchive,'copied.spatial.zip');assert.equal(manifest.profileVersion,'auxilium-spatial-local-document/1.1.0');assert.equal(descriptor.documentID,imported.document.documentID);assert.equal(descriptor.revision,imported.document.revision);assert.equal(manifest.floors.length,imported.document.floors.length);assert.deepEqual(imported.sourceBytes,members['source/geometry.json']);assert.equal(await sha256(imported.sourceBytes),imported.sourceIdentity.sha256);assert.notEqual(imported.sourceIdentity.documentID,imported.document.documentID);const db=store();try{const saved=await db.createImported(imported),frozen=await db.freeze(saved.document.documentID,saved.document.revision);assert.deepEqual(frozen.sourceBytes,imported.sourceBytes);assert.deepEqual(frozen.sourceIdentity,imported.sourceIdentity);}finally{db.close();}
});
async function mutatedArchive(change){const files=readZIP(copiedArchive);await change(files);const manifest=strictJSON(files['manifest.json']);for(const record of manifest.files){if(files[record.path]){record.sha256=await sha256(files[record.path]);record.bytes=files[record.path].length;}}files['manifest.json']=jsonBytes(manifest);return writeZIP(files);}
await probe('strict 1.1 admission rejects reassigned copy/source identities even with fresh member hashes',async()=>{
  const mutations=[
    files=>{const d=strictJSON(files['source/identity.json']);d.documentID='other-copy';files['source/identity.json']=jsonBytes(d);},
    files=>{const d=strictJSON(files['source/identity.json']);d.revision++;files['source/identity.json']=jsonBytes(d);},
    files=>{const d=strictJSON(files['source/identity.json']);d.sourceIdentity.revision++;files['source/identity.json']=jsonBytes(d);},
    files=>{const d=strictJSON(files['source/identity.json']);d.sourceIdentity.documentID=d.documentID;files['source/identity.json']=jsonBytes(d);},
    files=>{const d=strictJSON(files['source/identity.json']);d.sourceIdentity.authorized=true;files['source/identity.json']=jsonBytes(d);},
    files=>{const d=strictJSON(files['source/geometry.json']);d.title='Wrong retained source';files['source/geometry.json']=jsonBytes(d);},
    files=>{const m=strictJSON(files['manifest.json']);m.profileVersion='auxilium-spatial-local-document/1.0.0';files['manifest.json']=jsonBytes(m);},
    ...['source/geometry.json','source/identity.json'].map(path=>files=>{delete files[path];const m=strictJSON(files['manifest.json']);m.files=m.files.filter(f=>f.path!==path);files['manifest.json']=jsonBytes(m);}),
  ];for(const change of mutations)await assert.rejects(importWorkspace(await mutatedArchive(change),'tampered.spatial.zip'));
});
await probe('source bytes are paired, canonical, schema-valid, and independent of copied document identity',async()=>{
  const db=store();try{const copy=await db.createCopy(original),frozen=await db.freeze(copy.document.documentID,1);await assert.rejects(validateSourceProvenance({sourceIdentity:frozen.sourceIdentity},copy.document.documentID));await assert.rejects(validateSourceProvenance({sourceBytes:frozen.sourceBytes},copy.document.documentID));await assert.rejects(validateSourceProvenance(frozen,original.documentID));const noncanonical=new TextEncoder().encode(JSON.stringify(original,null,2));await assert.rejects(validateSourceProvenance({sourceIdentity:{...frozen.sourceIdentity,sha256:await sha256(noncanonical)},sourceBytes:noncanonical},copy.document.documentID),/source-document-identity/);const bad=structuredClone(original);bad.floors[0].walls[0].nodeIDs[0]='missing';const bytes=jsonBytes(bad);await assert.rejects(validateSourceProvenance({sourceIdentity:{...frozen.sourceIdentity,sha256:await sha256(bytes)},sourceBytes:bytes},copy.document.documentID));}finally{db.close();}
});
await probe('Unicode reason limits permit 256 scalar values and reject overflow or lone surrogates',async()=>{
  const db=store();try{const reason='😀'.repeat(256),copy=await db.createCopy(original,reason),frozen=await db.freeze(copy.document.documentID,1);assert.equal([...copy.sourceIdentity.reason].length,256);await validateSourceProvenance(frozen,copy.document.documentID);assert.equal(strictJSON(jsonBytes({sourceIdentity:frozen.sourceIdentity})).sourceIdentity.reason,reason);for(const invalid of ['😀'.repeat(257),'\uD800','\uDC00']){await assert.rejects(db.createCopy(original,invalid),/invalid-copy-reason/);await assert.rejects(validateSourceProvenance({...frozen,sourceIdentity:{...frozen.sourceIdentity,reason:invalid}},copy.document.documentID),/invalid-source-identity/);}}finally{db.close();}
});
await probe('ordinary local 1.0 and original exchange import retain their original profile behavior',async()=>{
  const ordinary=await importWorkspace(readArtifact('all-floor.spatial.zip'),'ordinary.spatial.zip');assert.equal(ordinary.sourceIdentity,undefined);assert.equal(ordinary.sourceBytes,undefined);const legacy=await importWorkspace(new Uint8Array(readFileSync(new URL('../../../fixtures/synthetic_exchange.zip',import.meta.url))),'legacy.zip');assert.deepEqual(legacy.document,original);assert.equal(legacy.sourceIdentity,undefined);
});
function verifyPDFOffsets(bytes){const text=new TextDecoder('latin1').decode(bytes);validatePDF(bytes);assert.ok(!text.includes('/OpenAction'));const startxref=/startxref\s+(\d+)\s+%%EOF\s*$/.exec(text);assert.ok(startxref);const offset=Number(startxref[1]);assert.equal(text.slice(offset,offset+5),'xref\n');const match=/^xref\n0 (\d+)\n/.exec(text.slice(offset));assert.ok(match);const entries=text.slice(offset+match[0].length).split('\n');for(let i=1;i<Number(match[1]);i++){const entry=/^(\d{10}) (\d{5}) n /.exec(entries[i]);assert.ok(entry,`xref entry ${i}`);assert.ok(text.slice(Number(entry[1])).startsWith(`${i} ${Number(entry[2])} obj\n`),`xref offset ${i}`);}}
await probe('generated PDF catalog correction preserves every byte-indexed cross-reference',async()=>{
  const db=store();try{await db.create(original);const frozen=await db.freeze(original.documentID,1),pdf=await exportRevision(frozen,'pdf');verifyPDFOffsets(pdf.bytes);verifyPDFOffsets(readArtifact('unicode-corrected.pdf'));}finally{db.close();}
});
console.log(JSON.stringify({reviewer:'web_core; independent of data author',scope:'copy provenance, immutable saving, strict backup admission, PDF offsets',portableChecksOnly:true,passed:results.length,results},null,2));
