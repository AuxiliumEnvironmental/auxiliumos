import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommands, requireValidDocument, validateDocument } from '../../src/core';
import { exportRevision, importDocument, SpatialWebStore } from '../../src/data';
import { jsonBytes, strictJSON } from '../../src/data/bytes';
import type { EditCommand, SpatialDocument } from '../../src/types';
import { emptyFloor, fixture, provenance } from './fixtures';

const textDocument = (): SpatialDocument => {
  const document = fixture();
  document.schemaVersion = '1.1.0';
  document.floors[0].areas = [{ id:'zone', label:'Work zone', polygon:[{x:1,z:1},{x:2,z:1},{x:1,z:2}], provenance:provenance() }];
  return document;
};
const fields = [
  { path:'title', set:(d:SpatialDocument,s:string)=>{ d.title=s; } },
  { path:'floors[0].label', set:(d:SpatialDocument,s:string)=>{ d.floors[0].label=s; } },
  { path:'floors[0].rooms[0].label', set:(d:SpatialDocument,s:string)=>{ d.floors[0].rooms[0].label=s; } },
  { path:'floors[0].areas[0].label', set:(d:SpatialDocument,s:string)=>{ d.floors[0].areas![0].label=s; } },
];
const malformed = ['\uD800','\uDBFF','\uDC00','\uDFFF','\uDC00\uD800','A\uD800B','😀\uDC00','\uD800😀'];

test('all text fields reject unpaired surrogates at the geometry admission boundary',()=>{
  for (const field of fields) for (const text of malformed) {
    const document=textDocument();field.set(document,text);
    assert.ok(validateDocument(document).some(i=>i.code==='invalid_text'&&i.path===field.path),`${field.path}: ${JSON.stringify(text)}`);
    assert.throws(()=>requireValidDocument(document));
    assert.throws(()=>strictJSON(jsonBytes(document)));
  }
});

test('paired astral characters and decomposed labels retain exact Unicode through strict JSON',()=>{
  const text='Studio 😀 𐐀 𐀀 􏿿 e\u0301\nUpper level';
  const document=textDocument();for (const field of fields)field.set(document,text);
  assert.deepEqual(validateDocument(document),[]);
  assert.deepEqual(requireValidDocument(strictJSON(jsonBytes(document))),document);
});

test('all text fields keep the 256 code-point limit rather than a UTF-16-unit limit',()=>{
  for (const field of fields) {
    const document=textDocument();field.set(document,'😀'.repeat(256));
    assert.deepEqual(validateDocument(document),[]);
    field.set(document,'😀'.repeat(257));
    assert.ok(validateDocument(document).some(i=>i.code==='invalid_text'&&i.path===field.path));
  }
});

test('malformed room, floor, and semantic-area edits reject the complete batch atomically',()=>{
  const document=textDocument(),before=structuredClone(document);
  const commands:EditCommand[]=[
    {type:'renameRoom',floorID:'floor-1',roomID:'room-a',label:'\uD800'},
    {type:'updateFloor',floorID:'floor-1',label:'\uDC00',elevation:0},
    {type:'addFloor',floor:{...emptyFloor('upper'),label:'A\uD800B'}},
    {type:'setArea',floorID:'floor-1',area:{...document.floors[0].areas![0],label:'\uDFFF'}},
  ];
  for (const command of commands) {
    assert.throws(()=>applyCommands(document,[{type:'renameRoom',floorID:'floor-1',roomID:'room-b',label:'Would be changed'},command],1));
    assert.deepEqual(document,before);
  }
});

test('rejected Unicode edits leave durable saved revision and reopened text intact',async()=>{
  const namespace=`core-unicode-${crypto.randomUUID()}`,store=new SpatialWebStore(namespace),document=textDocument();
  try {
    await store.create(document);
    await assert.rejects(store.apply(document.documentID,1,[{type:'renameRoom',floorID:'floor-1',roomID:'room-b',label:'Would be changed'},{type:'renameRoom',floorID:'floor-1',roomID:'room-a',label:'\uD800'}]));
    assert.deepEqual((await store.open(document.documentID)).document,document);
    assert.equal((await store.freeze(document.documentID,1)).document.revision,1);
  } finally { store.close(); }
  const reopened=new SpatialWebStore(namespace);
  try { assert.deepEqual((await reopened.open(document.documentID)).document,document); }
  finally { reopened.close(); }
});

test('actual geometry and exchange exports strictly reopen valid Unicode labels unchanged',async()=>{
  const store=new SpatialWebStore(`core-unicode-export-${crypto.randomUUID()}`),document=textDocument();
  for (const field of fields)field.set(document,'Étage 😀 𐐀 e\u0301');
  document.title='😀'.repeat(256);
  try {
    await store.create(document);const frozen=await store.freeze(document.documentID,1);
    for (const format of ['geometry','bundle'] as const) {
      const artifact=await exportRevision(frozen,format);
      assert.deepEqual(await importDocument(artifact.bytes,artifact.filename),document);
    }
    const invalid=textDocument();invalid.documentID='malformed';invalid.title='\uD800';
    await assert.rejects(store.create(invalid));
    assert.equal((await store.list()).length,1);
  } finally { store.close(); }
});
