import 'fake-indexeddb/auto';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import { zipSync } from 'fflate';
import type { FrozenRevision, SpatialDocument } from '../../src/types';
import { exportRevision, importDocument, SpatialWebStore } from '../../src/data';
import { jsonBytes, sha256, strictJSON, utf8 } from '../../src/data/bytes';
import { validatePDF, validateSVG } from '../../src/data/imports';
import { readZIP, writeZIP } from '../../src/data/zip';

async function document(): Promise<SpatialDocument> { return JSON.parse(await readFile(new URL('../../../fixtures/geometry.json', import.meta.url), 'utf8')); }
async function setup() { const store = new SpatialWebStore(crypto.randomUUID()), doc = await document(); await store.create(doc); return { store, doc }; }
async function frozen(doc?: SpatialDocument): Promise<FrozenRevision> { doc ??= await document(); const bytes = jsonBytes(doc); return { document: doc, bytes, hash: await sha256(bytes), createdAt: '2026-10-09T00:00:00Z' }; }

test('new TypeScript JSON reader preserves the original geometry contract', async () => {
  const doc = await document(), imported = await importDocument(jsonBytes(doc), 'geometry.json'); assert.deepEqual(imported, doc);
});
test('original and Swift-generated exchange fixtures import through the new TypeScript implementation', async () => {
  for (const path of ['../../../fixtures/synthetic_exchange.zip', '../../../tests/import/generated/native_exchange.zip']) {
    const bytes = new Uint8Array(await readFile(new URL(path, import.meta.url)));
    const result = await importDocument(bytes, 'existing-native-exchange.zip'); assert.equal(result.documentID, 'synthetic-two-rooms'); assert.equal(result.floors[0].openings.length, 3);
  }
});
test('duplicate JSON keys including escaped duplicates are rejected before graph decoding', () => {
  for (const input of ['{"revision":1,"revision":2}', '{"a":1,"\\u0061":2}', '{"__proto__":{}}', '{"constructor":{}}']) assert.throws(() => strictJSON(utf8.encode(input)), /duplicate-or-unsafe/);
});
test('JSON parser rejects nonfinite values, malformed UTF8, trailing text and excessive depth', () => {
  for (const value of ['{"x":1e999}', '[] false', '[01]', '"\\uD800"', '['.repeat(34) + '0' + ']'.repeat(34)]) assert.throws(() => strictJSON(utf8.encode(value)));
  assert.throws(() => strictJSON(new Uint8Array([0xc0, 0xaf])));
});
test('unknown contract properties and invalid graph references fail strict import', async () => {
  const d = await document(); await assert.rejects(importDocument(jsonBytes({ ...d, admin: true }), 'a.json'));
  d.floors[0].walls[0].nodeIDs[0] = 'absent'; await assert.rejects(importDocument(jsonBytes(d), 'a.json'));
});
test('transactional edits survive close/reopen with undo and monotonically increasing revision', async () => {
  const { store, doc } = await setup(), ns = store.namespace;
  const edited = await store.apply(doc.documentID, 1, [{ type: 'renameRoom', floorID: 'floor-1', roomID: 'room-a', label: 'Corrected' }]);
  assert.equal(edited.document.revision, 2); store.close();
  const reopened = new SpatialWebStore(ns); assert.equal((await reopened.open(doc.documentID)).document.floors[0].rooms[0].label, 'Corrected');
  const undone = await reopened.undo(doc.documentID, 2); assert.equal(undone.document.revision, 3); assert.equal(undone.document.floors[0].rooms[0].label, doc.floors[0].rooms[0].label); assert.ok(undone.canRedo);
  const redone = await reopened.redo(doc.documentID, 3); assert.equal(redone.document.revision, 4); assert.equal(redone.document.floors[0].rooms[0].label, 'Corrected'); reopened.close();
});
test('concurrent tabs use optimistic comparison and cannot lose a committed edit', async () => {
  const { store, doc } = await setup(), second = new SpatialWebStore(store.namespace);
  const result = await Promise.allSettled([store.apply(doc.documentID, 1, [{ type: 'renameRoom', floorID: 'floor-1', roomID: 'room-a', label: 'A' }]), second.apply(doc.documentID, 1, [{ type: 'renameRoom', floorID: 'floor-1', roomID: 'room-a', label: 'B' }])]);
  assert.equal(result.filter(r => r.status === 'fulfilled').length, 1); assert.equal(result.filter(r => r.status === 'rejected').length, 1); assert.equal((await store.open(doc.documentID)).document.revision, 2); store.close(); second.close();
});
test('invalid edit transaction does not change graph, history, or saved revision', async () => {
  const { store, doc } = await setup(); await assert.rejects(store.apply(doc.documentID, 1, [{ type: 'moveNode', floorID: 'floor-1', nodeID: 'n0', point: { x: Infinity, z: 0 } }]));
  const saved = await store.open(doc.documentID); assert.deepEqual(saved.document, doc); assert.equal(saved.canUndo, false); store.close();
});
test('create never overwrites existing document and namespaces remain isolated', async () => {
  const { store, doc } = await setup(); await assert.rejects(store.create(doc), /already-exists/);
  const other = new SpatialWebStore(crypto.randomUUID()); assert.deepEqual(await other.list(), []); await assert.rejects(other.open(doc.documentID), /not-found/); store.close(); other.close();
});
test('frozen revision is immutable across edits, caller mutation and restore-as-new', async () => {
  const { store, doc } = await setup(), first = await store.freeze(doc.documentID, 1), oldHash = first.hash;
  await store.apply(doc.documentID, 1, [{ type: 'renameRoom', floorID: 'floor-1', roomID: 'room-a', label: 'New name' }]);
  first.document.title = 'Caller changed'; first.bytes[0] = 0;
  const retained = await store.loadFrozen(doc.documentID, 1); assert.equal(retained.hash, oldHash); assert.equal(retained.document.title, doc.title);
  const restored = await store.restore(doc.documentID, 1, 2); assert.equal(restored.document.revision, 3); assert.equal(restored.document.parentRevision, 2); assert.equal(restored.document.floors[0].rooms[0].label, doc.floors[0].rooms[0].label); assert.ok(restored.canUndo);
  assert.equal((await store.listRevisions(doc.documentID)).length, 1); store.close();
});
test('explicit transaction abort preserves the previous durable record', async () => {
  const { store, doc } = await setup();
  await assert.rejects(store.transaction(['drafts'], 'readwrite', async tx => { tx.objectStore('drafts').clear(); tx.abort(); return undefined; }));
  assert.deepEqual((await store.open(doc.documentID)).document, doc); store.close();
});
test('canonical document corruption is detected during reopen', async () => {
  const { store, doc } = await setup();
  await store.transaction(['drafts'], 'readwrite', tx => new Promise<void>((resolve, reject) => {
    const table = tx.objectStore('drafts'), get = table.get(doc.documentID); get.onerror = () => reject(get.error); get.onsuccess = () => { const row = get.result; row.document.title = 'Corrupted'; table.put(row); resolve(); };
  }));
  await assert.rejects(store.open(doc.documentID), /corrupt-local-document/); store.close();
});
test('exchange is deterministic, strict-importable and bound to exact frozen version', async () => {
  const f = await frozen(), a = await exportRevision(f, 'bundle'), b = await exportRevision(f, 'bundle'); assert.deepEqual(a.bytes, b.bytes); assert.equal(a.hash, b.hash);
  const restored = await importDocument(a.bytes, a.filename); assert.deepEqual(restored, f.document);
  const members = readZIP(a.bytes), manifest = strictJSON(members['manifest.json']) as { revision: number; files: { path: string; sha256: string; bytes: number }[] };
  assert.equal(manifest.revision, f.document.revision);
  for (const file of manifest.files) { assert.equal(await sha256(members[file.path]), file.sha256); assert.equal(members[file.path].length, file.bytes); }
});
test('tampered frozen bytes and modified snapshot cannot be exported', async () => {
  const f = await frozen(); f.document.title = 'Changed after freeze'; await assert.rejects(exportRevision(f, 'geometry'), /frozen-revision-mismatch/);
});
test('async export takes a value snapshot before caller mutation during hashing', async () => {
  const f = await frozen(), original = f.bytes.slice(); const pending = exportRevision(f, 'geometry');
  f.document.title = 'Changed while hashing'; f.bytes.fill(0); f.hash = '0'.repeat(64);
  const result = await pending; assert.deepEqual(result.bytes, original); assert.equal(result.hash, await sha256(original));
});
test('async edit snapshots command input before IndexedDB yields', async () => {
  const { store, doc } = await setup();
  const command = { type: 'renameRoom' as const, floorID: 'floor-1', roomID: 'room-a', label: 'Intended correction' };
  const saving = store.apply(doc.documentID, 1, [command]); command.label = 'Changed while saving';
  assert.equal((await saving).document.floors[0].rooms[0].label, 'Intended correction'); store.close();
});
test('archive hashes and derivatives cannot override canonical geometry', async () => {
  const f = await frozen(), artifact = await exportRevision(f, 'bundle'), members = readZIP(artifact.bytes);
  const scene = strictJSON(members['scene.json']) as { revision: number }; scene.revision = 999; members['scene.json'] = jsonBytes(scene);
  const manifest = strictJSON(members['manifest.json']) as { files: { path: string; sha256: string; bytes: number }[] };
  for (const entry of manifest.files) { entry.sha256 = await sha256(members[entry.path]); entry.bytes = members[entry.path].length; } members['manifest.json'] = jsonBytes(manifest);
  await assert.rejects(importDocument(writeZIP(members), 'mutated.zip'), /scene-geometry-mismatch/);
});
test('strict ZIP rejects traversal, hidden extra members, CRC mismatch and archive overlays', async () => {
  assert.throws(() => writeZIP({ '../geometry.json': utf8.encode('{}') }), /invalid-zip-member/);
  const archive = (await exportRevision(await frozen(), 'bundle')).bytes;
  const badCRC = archive.slice(); badCRC[45] ^= 1; assert.throws(() => readZIP(badCRC));
  const overlay = new Uint8Array(archive.length + 1); overlay.set(archive); assert.throws(() => readZIP(overlay));
  const extra = readZIP(archive); extra['surprise.json'] = utf8.encode('{}'); await assert.rejects(importDocument(writeZIP(extra), 'extra.zip'));
});
test('bounded raw DEFLATE imports ordinary compressed members and rejects extreme ratio', () => {
  const text = utf8.encode('portable-compatible data'); assert.deepEqual(readZIP(zipSync({ 'example.json': text }, { level: 6 }))['example.json'], text);
  assert.throws(() => readZIP(zipSync({ 'bomb.json': new Uint8Array(500_000).fill(32) }, { level: 9 })), /expansion-limit/);
});
test('SVG admission rejects active resources, duplicate attributes, malformed markup and nonfinite numbers', () => {
  for (const source of [
    '<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><text onclick="x">a</text></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" x="1"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><line x1="1e999"/></svg>',
    '<!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg"/>',
    '<svg xmlns="http://www.w3.org/2000/svg"><text>&evil;</text></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><text fill="url(https://x)">A</text></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><text font-family="custom-font">A</text></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="red"/></svg>',
  ]) assert.throws(() => validateSVG(utf8.encode(source)));
});
test('SVG preserves escaped labels and passes the constrained export vocabulary', async () => {
  const d = await document(); d.title = '<Kitchen & living>'; const result = await exportRevision(await frozen(d), 'svg', 'floor-1'); validateSVG(result.bytes);
  assert.ok(new TextDecoder().decode(result.bytes).includes('&lt;Kitchen &amp; living&gt;'));
});
test('PDF is generated as a genuine document with exact revision metadata', async () => {
  const result = await exportRevision(await frozen(), 'pdf'); const data = new TextDecoder('latin1').decode(result.bytes);
  assert.ok(data.startsWith('%PDF-1.')); assert.match(data, /Source revision 1/); assert.ok(data.includes('%%EOF')); validatePDF(result.bytes); assert.ok(!data.includes('/OpenAction'));
  const offset = Number(/startxref\s+(\d+)/.exec(data)?.[1]); assert.equal(data.slice(offset, offset + 4), 'xref');
});
test('GLB contains canonical cutout triangles, semantic lines, no resources and exact identity', async () => {
  const f = await frozen(), artifact = await exportRevision(f, 'glb', 'floor-1'), view = new DataView(artifact.bytes.buffer);
  assert.equal(view.getUint32(0, true), 0x46546c67); assert.equal(view.getUint32(8, true), artifact.bytes.length);
  const gltf = strictJSON(artifact.bytes.subarray(20, 20 + view.getUint32(12, true))) as any;
  assert.equal(gltf.asset.extras.sourceSHA256, f.hash); assert.equal(gltf.asset.extras.revision, 1); assert.ok(gltf.meshes.some((m: any) => m.primitives[0].mode === 1)); assert.ok(gltf.meshes.some((m: any) => m.primitives[0].mode === 4)); assert.equal(gltf.images, undefined);
});
test('multi-floor exports do not silently drop a floor and PDF includes every floor', async () => {
  const doc = await document(), upper = structuredClone(doc.floors[0]); upper.id = 'upper'; upper.elevation = 3; upper.label = 'Upper floor'; doc.floors.push(upper);
  const f = await frozen(doc); await assert.rejects(exportRevision(f, 'bundle', 'floor-1'), /single-floor-exchange/); await assert.rejects(exportRevision(f, 'scene'), /choose-floor/);
  const pdf = new TextDecoder('latin1').decode((await exportRevision(f, 'pdf')).bytes); assert.match(pdf, /\/Count 2/);
});
test('portable PNG call reports absent browser renderer rather than returning fabricated output', async () => {
  await assert.rejects(exportRevision(await frozen(), 'png', 'floor-1'), /png-requires-browser-renderer/);
});
test('long labels generate complete drawing-page profiles instead of clipped or missing text', async () => {
  const doc = await document(); doc.floors[0].rooms[0].label = 'A'.repeat(256);
  const f = await frozen(doc), svg = await exportRevision(f, 'svg', 'floor-1'); assert.equal(svg.mimeType, 'application/zip');
  const files = readZIP(svg.bytes), manifest = strictJSON(files['manifest.json']) as { profileVersion: string; pageCount: number; files: { path: string; sha256: string; bytes: number; pageIndex: number }[] };
  assert.equal(manifest.profileVersion, 'auxilium-spatial-drawing-pages/1.0.0'); assert.equal(manifest.pageCount, 2);
  const directory = new TextDecoder().decode(files['floorplan-0001.svg']); assert.match(directory, /Label directory/);
  const content = [...directory.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(match => match[1]).join(''); assert.ok(content.includes('A'.repeat(256)));
  for (const record of manifest.files) { validateSVG(files[record.path]); assert.equal(await sha256(files[record.path]), record.sha256); }
  assert.match(new TextDecoder('latin1').decode((await exportRevision(f, 'pdf')).bytes), /\/Count 2/);
  const exchange = await exportRevision(f, 'bundle'); assert.equal((await importDocument(exchange.bytes, exchange.filename)).floors[0].rooms[0].label, 'A'.repeat(256));
});
test('semantic-area directory retains labels without introducing physical wall geometry', async () => {
  const doc = await document(); doc.schemaVersion = '1.1.0';
  doc.floors[0].areas = [{ id: 'semantic-zone', label: 'Work area', polygon: [{ x: 1, z: 1 }, { x: 2, z: 1 }, { x: 2, z: 2 }], provenance: { origin: 'synthetic', sourceIDs: [], classificationConfidence: 'unknown' } }];
  const f = await frozen(doc), output = await exportRevision(f, 'svg', 'floor-1'); assert.equal(output.mimeType, 'application/zip');
  assert.match(new TextDecoder().decode(readZIP(output.bytes)['floorplan-0001.svg']), /semantic area: Work area/);
  const exchange = await exportRevision(f, 'bundle'); const imported = await importDocument(exchange.bytes, exchange.filename); assert.equal(imported.floors[0].areas![0].label, 'Work area'); assert.equal(imported.floors[0].walls.length, doc.floors[0].walls.length);
});
