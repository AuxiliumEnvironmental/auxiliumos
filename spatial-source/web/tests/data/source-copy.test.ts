import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { SpatialWebStore, exportRevision, importDocument, importWorkspace } from '../../src/data';
import { concatenate, crc32, jsonBytes, sha256, strictJSON, utf8 } from '../../src/data/bytes';
import { buildScene } from '../../src/core';
import { pdfDrawing, svgDrawing } from '../../src/data/drawing';
import { readZIP, writeZIP } from '../../src/data/zip';
import { zlibSync } from 'fflate';
import type { SpatialDocument } from '../../src/types';

async function source(): Promise<SpatialDocument> { return JSON.parse(await readFile(new URL('../../../fixtures/geometry.json', import.meta.url), 'utf8')); }
async function mutate(store: SpatialWebStore, id: string, change: (row: any) => void) {
  await store.transaction(['drafts'], 'readwrite', tx => new Promise<void>((resolve, reject) => {
    const table = tx.objectStore('drafts'), get = table.get(id); get.onerror = () => reject(get.error); get.onsuccess = () => { const row = get.result; change(row); table.put(row); resolve(); };
  }));
}
test('explicit native recovery copy preserves corrected original and exact source identity without guessing a merge', async () => {
  const store = new SpatialWebStore(crypto.randomUUID()), original = await source(); await store.create(original);
  const corrected = await store.apply(original.documentID, 1, [{ type: 'renameRoom', floorID: 'floor-1', roomID: 'room-a', label: 'Existing web correction' }]);
  const recovered = structuredClone(original); recovered.revision = 3; recovered.parentRevision = 2; recovered.floors[0].rooms[0].label = 'Recovered native room';
  await assert.rejects(store.create(recovered), /document-already-exists/);
  const copy = await store.createCopy(recovered, 'native-recovery');
  assert.notEqual(copy.document.documentID, original.documentID); assert.equal(copy.document.revision, 1); assert.equal(copy.document.parentRevision, undefined);
  assert.deepEqual(copy.document.floors, recovered.floors); assert.deepEqual(copy.sourceIdentity, { documentID: recovered.documentID, revision: 3, sha256: await sha256(jsonBytes(recovered)), reason: 'native-recovery' });
  assert.deepEqual((await store.open(original.documentID)).document, corrected.document);
  const exported = await exportRevision(await store.freeze(copy.document.documentID, 1), 'bundle'), roundtrip = await importDocument(exported.bytes, exported.filename);
  assert.equal(roundtrip.documentID, copy.document.documentID); assert.equal(roundtrip.revision, 1); assert.equal('sourceIdentity' in roundtrip, false);
  store.close();
});
test('copy sidecar and original source digest survive edits, undo, freeze, restore and a real store reopen', async () => {
  const store = new SpatialWebStore(crypto.randomUUID()), original = await source(), copy = await store.createCopy(original), id = copy.document.documentID;
  await store.freeze(id, 1); await store.apply(id, 1, [{ type: 'renameRoom', floorID: 'floor-1', roomID: 'room-a', label: 'Copy correction' }]);
  assert.deepEqual((await store.undo(id, 2)).sourceIdentity, copy.sourceIdentity);
  assert.deepEqual((await store.restore(id, 1, 3)).sourceIdentity, copy.sourceIdentity);
  const namespace = store.namespace; store.close(); const reopened = new SpatialWebStore(namespace);
  assert.deepEqual((await reopened.open(id)).sourceIdentity, copy.sourceIdentity); assert.equal((await reopened.open(id)).document.revision, 4); reopened.close();
});
test('concurrent exact-source retries reuse one copy and retain later corrections', async () => {
  const store = new SpatialWebStore(crypto.randomUUID()), second = new SpatialWebStore(store.namespace), original = await source();
  const [first, again] = await Promise.all([store.createCopy(original, 'native-recovery'), second.createCopy(original, 'explicit-import')]);
  assert.equal(first.document.documentID, again.document.documentID); assert.equal((await store.list()).length, 1);
  const corrected = await store.apply(first.document.documentID, 1, [{ type: 'renameRoom', floorID: 'floor-1', roomID: 'room-a', label: 'Later correction' }]);
  assert.deepEqual((await second.createCopy(original)).document, corrected.document);
  const other = structuredClone(original); other.floors[0].rooms[0].label = 'Different bytes at same claimed identity';
  assert.notEqual((await store.createCopy(other)).document.documentID, first.document.documentID); assert.equal((await store.list()).length, 2);
  store.close(); second.close();
});
test('copy snapshots caller input before asynchronous hashing and returns isolated sidecar values', async () => {
  const store = new SpatialWebStore(crypto.randomUUID()), original = await source(), preserved = structuredClone(original), pending = store.createCopy(original);
  original.documentID = 'mutated'; original.floors[0].rooms[0].label = 'mutated'; const copy = await pending;
  assert.deepEqual(copy.document.floors, preserved.floors); assert.equal(copy.sourceIdentity!.sha256, await sha256(jsonBytes(preserved)));
  copy.sourceIdentity!.sha256 = '0'.repeat(64); assert.notEqual((await store.open(copy.document.documentID)).sourceIdentity!.sha256, copy.sourceIdentity!.sha256); store.close();
});
test('corrupt copy source bytes or misassociated sidecar identity cannot reopen or be reused', async () => {
  for (const corruption of [(row: any) => { row.sourceBytes[10] ^= 1; }, (row: any) => { row.sourceIdentity.documentID = 'foreign'; }, (row: any) => { delete row.sourceBytes; }, (row: any) => { row.sourceIdentity.extra = true; }]) {
    const store = new SpatialWebStore(crypto.randomUUID()), original = await source(), copy = await store.createCopy(original); await mutate(store, copy.document.documentID, corruption);
    await assert.rejects(store.open(copy.document.documentID), /corrupt-local-source-identity|corrupt-local-history/); store.close();
  }
  const store = new SpatialWebStore(crypto.randomUUID()), original = await source(), copy = await store.createCopy(original); await mutate(store, copy.document.documentID, row => { row.sourceBytes[10] ^= 1; });
  await assert.rejects(store.createCopy(original), /corrupt-local-source-identity/); assert.equal((await store.list()).length, 1); store.close();
});
test('invalid copy reason is rejected and an interrupted copy commits neither geometry nor sidecar', async () => {
  const store = new SpatialWebStore(crypto.randomUUID()), original = await source();
  for (const reason of ['', ' ', 'x'.repeat(257), 'bad\nreason']) await assert.rejects(store.createCopy(original, reason), /invalid-copy-reason/);
  const transaction = store.transaction.bind(store); (store as any).transaction = (tables: string[], mode: IDBTransactionMode, action: (tx: IDBTransaction) => Promise<unknown>) => transaction(tables, mode, async tx => { const result = await action(tx); if (mode === 'readwrite') tx.abort(); return result; });
  await assert.rejects(store.createCopy(original), /storage-transaction-aborted/); assert.deepEqual(await store.list(), []); store.close();
});

function testPNG(): Uint8Array {
  const chunk = (name: string, data: Uint8Array) => { const bytes = new Uint8Array(data.length + 12), view = new DataView(bytes.buffer); view.setUint32(0, data.length); bytes.set(utf8.encode(name), 4); bytes.set(data, 8); view.setUint32(data.length + 8, crc32(bytes.subarray(4, data.length + 8))); return bytes; };
  const header = new Uint8Array(13), view = new DataView(header.buffer); view.setUint32(0, 1); view.setUint32(4, 1); header[8] = 8; header[9] = 6;
  return concatenate([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlibSync(new Uint8Array([0, 255, 255, 255, 255]))), chunk('IEND', new Uint8Array())]);
}
/** Tiny admission fixture only; actual rendered copy backups are exercised in Chromium. */
async function backupFixture() {
  const store = new SpatialWebStore(crypto.randomUUID()), original = await source(), copy = await store.createCopy(original, 'native-recovery'), frozen = await store.freeze(copy.document.documentID, 1), floor = frozen.document.floors[0];
  const files: Record<string, Uint8Array> = {
    'geometry.json': frozen.bytes, 'source/geometry.json': frozen.sourceBytes!,
    'source/identity.json': jsonBytes({ profileVersion: 'auxilium-spatial-source-provenance/1.0.0', documentID: copy.document.documentID, revision: 1, sourceIdentity: frozen.sourceIdentity }),
    'floors/0000/scene.json': jsonBytes(buildScene(copy.document, floor.id)), 'floors/0000/floorplan-0000.svg': svgDrawing(frozen, floor), 'floors/0000/floorplan-0000.png': testPNG(), 'floors/0000/floorplan.pdf': await pdfDrawing(frozen, [floor]),
  };
  const entries = await Promise.all(Object.keys(files).map(async path => ({ path, bytes: files[path].length, sha256: await sha256(files[path]), mimeType: path.endsWith('.svg') ? 'image/svg+xml' : path.endsWith('.png') ? 'image/png' : path.endsWith('.pdf') ? 'application/pdf' : 'application/json', ...(path.startsWith('floors/') ? { floorID: floor.id, ...(path.includes('0000.') ? { pageIndex: 0 } : {}) } : {}) })));
  files['manifest.json'] = jsonBytes({ profileVersion: 'auxilium-spatial-local-document/1.1.0', documentID: copy.document.documentID, revision: 1, measurementStatus: 'unverified', coordinateSystem: copy.document.coordinateSystem, floors: [{ floorID: floor.id, label: floor.label, elevation: floor.elevation, index: 0, pageCount: 1, representationStatus: 'geometry' }], files: entries });
  return { store, original, copy, frozen, files };
}
async function changeMember(files: Record<string, Uint8Array>, path: string, value: unknown) {
  files[path] = jsonBytes(value); const manifest = strictJSON(files['manifest.json']) as any, member = manifest.files.find((file: any) => file.path === path); member.bytes = files[path].length; member.sha256 = await sha256(files[path]); files['manifest.json'] = jsonBytes(manifest);
}
test('versioned complete copy backup imports exact original bytes and persists provenance across reopening', async () => {
  const fixture = await backupFixture(), imported = await importWorkspace(writeZIP(fixture.files), 'complete.zip'), destination = new SpatialWebStore(crypto.randomUUID());
  assert.deepEqual(imported.document, fixture.copy.document); assert.deepEqual(imported.sourceIdentity, fixture.copy.sourceIdentity); assert.deepEqual(imported.sourceBytes, jsonBytes(fixture.original));
  const saved = await destination.createImported(imported); assert.deepEqual(saved.sourceIdentity, fixture.copy.sourceIdentity);
  const frozen = await destination.freeze(saved.document.documentID, 1); assert.deepEqual(frozen.sourceBytes, imported.sourceBytes);
  const ns = destination.namespace; destination.close(); const reopened = new SpatialWebStore(ns); assert.deepEqual((await reopened.open(saved.document.documentID)).sourceIdentity, imported.sourceIdentity); reopened.close(); fixture.store.close();
});
test('copying an imported copy retains original provenance but deduplicates the exact immediate input separately', async () => {
  const fixture = await backupFixture(), imported = await importWorkspace(writeZIP(fixture.files), 'complete.zip');
  const copy = await fixture.store.createCopy(imported.document, 'explicit-backup-copy', imported);
  assert.notEqual(copy.document.documentID, fixture.copy.document.documentID); assert.deepEqual(copy.sourceIdentity, fixture.copy.sourceIdentity); assert.deepEqual(copy.document.floors, fixture.copy.document.floors);
  assert.equal((await fixture.store.createCopy(imported.document, 'retry', imported)).document.documentID, copy.document.documentID);
  const frozen = await fixture.store.freeze(copy.document.documentID, 1); assert.deepEqual(frozen.sourceBytes, jsonBytes(fixture.original)); fixture.store.close();
});
test('backup provenance rejects mismatched copy identity, altered original bytes, missing pairs, old profile and unknown descriptor fields', async () => {
  const fixture = await backupFixture();
  for (const mutate of [
    async (files: Record<string, Uint8Array>) => { const descriptor = strictJSON(files['source/identity.json']) as any; descriptor.documentID = 'foreign-copy'; await changeMember(files, 'source/identity.json', descriptor); },
    async (files: Record<string, Uint8Array>) => { const document = strictJSON(files['source/geometry.json']) as any; document.title = 'Different original'; await changeMember(files, 'source/geometry.json', document); },
    async (files: Record<string, Uint8Array>) => { const manifest = strictJSON(files['manifest.json']) as any; manifest.files = manifest.files.filter((file: any) => file.path !== 'source/geometry.json'); delete files['source/geometry.json']; files['manifest.json'] = jsonBytes(manifest); },
    async (files: Record<string, Uint8Array>) => { const manifest = strictJSON(files['manifest.json']) as any; manifest.profileVersion = 'auxilium-spatial-local-document/1.0.0'; files['manifest.json'] = jsonBytes(manifest); },
    async (files: Record<string, Uint8Array>) => { const descriptor = strictJSON(files['source/identity.json']) as any; descriptor.sourceIdentity.grantsPublication = true; await changeMember(files, 'source/identity.json', descriptor); },
  ]) { const files = structuredClone(fixture.files); await mutate(files); await assert.rejects(importWorkspace(writeZIP(files), 'invalid-copy.zip')); }
  fixture.store.close();
});
test('createImported rejects partial and mutated provenance before any record is written', async () => {
  const fixture = await backupFixture(), destination = new SpatialWebStore(crypto.randomUUID());
  await assert.rejects(destination.createImported({ document: fixture.copy.document, sourceIdentity: fixture.copy.sourceIdentity }), /source-byte-identity/);
  const wrong = fixture.frozen.sourceBytes!.slice(); wrong[10] ^= 1;
  await assert.rejects(destination.createImported({ document: fixture.copy.document, sourceIdentity: fixture.copy.sourceIdentity, sourceBytes: wrong }), /source-byte-identity/);
  assert.deepEqual(await destination.list(), []); destination.close(); fixture.store.close();
});
test('retained frozen provenance metadata is immutable and corrupted metadata cannot be refrozen', async () => {
  const fixture = await backupFixture(), id = fixture.copy.document.documentID;
  await fixture.store.transaction(['revisions'], 'readwrite', tx => new Promise<void>((resolve, reject) => {
    const table = tx.objectStore('revisions'), get = table.get(`${id}:1`); get.onerror = () => reject(get.error); get.onsuccess = () => { const row = get.result; row.frozen.sourceIdentity.reason = 'corrupt-change'; table.put(row); resolve(); };
  }));
  await assert.rejects(fixture.store.loadFrozen(id, 1), /frozen-source-provenance-mismatch/); await assert.rejects(fixture.store.freeze(id, 1), /frozen-source-provenance-mismatch/); fixture.store.close();
});

test('copy reasons honor the profile Unicode code-point limit rather than UTF-16 storage units', async () => {
  const store = new SpatialWebStore(crypto.randomUUID()), original = await source(), reason = '😀'.repeat(256), saved = await store.createCopy(original, reason);
  assert.equal(saved.sourceIdentity!.reason, reason); const frozen = await store.freeze(saved.document.documentID, 1);
  const imported = new SpatialWebStore(crypto.randomUUID()); assert.equal((await imported.createImported({ document: frozen.document, sourceIdentity: frozen.sourceIdentity, sourceBytes: frozen.sourceBytes })).sourceIdentity!.reason, reason);
  await assert.rejects(store.createCopy(original, '😀'.repeat(257)), /invalid-copy-reason/);
  const rejected = new SpatialWebStore(crypto.randomUUID());
  await assert.rejects(rejected.createImported({ document: frozen.document, sourceIdentity: { ...frozen.sourceIdentity!, reason: '😀'.repeat(257) }, sourceBytes: frozen.sourceBytes }), /invalid-source-identity/);
  for (const invalid of ['\uD800', '\uDC00', 'start\uD800end']) {
    await assert.rejects(store.createCopy(original, invalid), /invalid-copy-reason/);
    await assert.rejects(rejected.createImported({ document: frozen.document, sourceIdentity: { ...frozen.sourceIdentity!, reason: invalid }, sourceBytes: frozen.sourceBytes }), /invalid-source-identity/);
  }
  assert.deepEqual(await rejected.list(), []); store.close(); imported.close(); rejected.close();
});
