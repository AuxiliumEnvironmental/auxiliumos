import 'fake-indexeddb/auto';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import { zipSync, zlibSync } from 'fflate';
import { exportRevision, SpatialOutbox, SpatialWebStore } from '../../src/data';
import { concatenate, crc32, jsonBytes, sha256, utf8 } from '../../src/data/bytes';
import { validatePDF, validatePNG, validateSVG } from '../../src/data/imports';
import { readZIP } from '../../src/data/zip';
import type { ScopedPublicationTransport } from '../../src/data';
import type { SpatialDocument } from '../../src/types';

async function setup() {
  const source: SpatialDocument = JSON.parse(await readFile(new URL('../../../fixtures/geometry.json', import.meta.url), 'utf8'));
  const store = new SpatialWebStore(crypto.randomUUID()); source.documentID = 'review-a'; await store.create(source); const a = await store.freeze(source.documentID, 1);
  const other = structuredClone(source); other.documentID = 'review-b'; other.title = 'Separate source'; await store.create(other); const b = await store.freeze(other.documentID, 1);
  return { store, source, other, a, b };
}
async function mutateRow(store: SpatialWebStore, table: string, key: string, mutate: (value: any) => void) {
  await store.transaction([table], 'readwrite', tx => new Promise<void>((resolve, reject) => {
    const rows = tx.objectStore(table), get = rows.get(key); get.onerror = () => reject(get.error); get.onsuccess = () => { const row = get.result; mutate(row); rows.put(row); resolve(); };
  }));
}
test('review: foreign frozen row cannot load, list, refreeze, or corrupt a restored draft', async () => {
  const { store, source, b } = await setup(); await mutateRow(store, 'revisions', 'review-a:1', row => { row.frozen = b; });
  await assert.rejects(store.loadFrozen('review-a', 1), /frozen-record-identity/);
  await assert.rejects(store.revisions('review-a'), /frozen-record-identity/);
  await assert.rejects(store.freeze('review-a', 1), /frozen-record-identity/);
  await assert.rejects(store.restore('review-a', 1, 1), /frozen-record-identity/);
  assert.deepEqual((await store.open('review-a')).document, source); store.close();
});
test('review: freeze rejects corrupt retained bytes and preserves original timestamp on idempotent reuse', async () => {
  const { store, a } = await setup(); assert.equal((await store.freeze('review-a', 1)).createdAt, a.createdAt);
  await mutateRow(store, 'revisions', 'review-a:1', row => { row.frozen.bytes[0] ^= 1; });
  await assert.rejects(store.freeze('review-a', 1), /frozen-revision-mismatch/); await assert.rejects(store.loadFrozen('review-a', 1), /frozen-revision-mismatch/); store.close();
});
test('review: frozen revision directory binds the persisted key as well as claimed document metadata', async () => {
  const { store, b } = await setup(); await mutateRow(store, 'revisions', 'review-a:1', row => { row.documentID = 'review-b'; row.frozen = b; });
  await assert.rejects(store.revisions('review-a'), /frozen-record-identity/); store.close();
});
test('review: raw DEFLATE trailing bytes are rejected despite consistent ZIP sizes and CRC', () => {
  const original = zipSync({ 'example.json': utf8.encode('portable-compatible data') }, { level: 6 });
  const old = new DataView(original.buffer), oldEnd = original.length - 22, central = old.getUint32(oldEnd + 16, true);
  assert.equal(old.getUint16(8, true), 8);
  const altered = new Uint8Array(original.length + 4); altered.set(original.subarray(0, central)); altered.set(utf8.encode('JUNK'), central); altered.set(original.subarray(central), central + 4);
  const view = new DataView(altered.buffer); view.setUint32(18, old.getUint32(18, true) + 4, true); view.setUint32(central + 4 + 20, old.getUint32(central + 20, true) + 4, true); view.setUint32(altered.length - 22 + 16, central + 4, true);
  assert.throws(() => readZIP(altered), /zip-deflate-trailing/); assert.deepEqual(readZIP(original)['example.json'], utf8.encode('portable-compatible data'));
});
test('review: ordinary stored, fixed/dynamic compressed streams of varying lengths remain supported', () => {
  for (const level of [0, 1, 6, 9] as const) for (const length of [1, 2, 7, 32, 255, 1024, 10_000]) {
    const data = Uint8Array.from({ length }, (_, index) => (index * 77 + (index >> 4) * 131) % 256);
    assert.deepEqual(readZIP(zipSync({ 'example.json': data }, { level }))['example.json'], data);
  }
});
test('review: native drawing profile SVG pages import without widening the original exchange profile', async () => {
  for (const name of ['floorplan-0.svg', 'floorplan-1.svg']) {
    const bytes = new Uint8Array(await readFile(new URL(`../../../tests/exports/continuation/fixtures/${name}`, import.meta.url)));
    validateSVG(bytes, 'drawing'); assert.throws(() => validateSVG(bytes, 'exchange'));
  }
  for (const malicious of ['<tspan x="0" dy="1">nested</tspan>', '<text x="0" y="0"><tspan x="0" dy="0" onclick="x">bad</tspan></text>', '<circle cx="1" cy="1" r="2" fill="url(https://example.invalid)"/>']) {
    assert.throws(() => validateSVG(utf8.encode(`<svg xmlns="http://www.w3.org/2000/svg">${malicious}</svg>`), 'drawing'));
  }
});
test('review: PDF action, attachment, encrypted and object-stream names include hex-escaped forms', () => {
  for (const name of ['J#53', 'JavaScript', 'AA', 'U#52I', 'ObjStm', 'XRef', 'Encrypt', 'Filespec', 'GoToR', 'SubmitForm']) assert.throws(() => validatePDF(utf8.encode(`%PDF-1.4\n/${name} (payload)\n%%EOF`)), /unsupported-pdf-active-name/);
  validatePDF(utf8.encode('%PDF-1.4\n/Type /Catalog\n%%EOF'));
});
function pngChunk(type: string, data: Uint8Array) { const body = concatenate([utf8.encode(type), data]), chunk = new Uint8Array(data.length + 12), view = new DataView(chunk.buffer); view.setUint32(0, data.length); chunk.set(body, 4); view.setUint32(data.length + 8, crc32(body)); return chunk; }
function png(header: Uint8Array) { return concatenate([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header), pngChunk('IDAT', zlibSync(new Uint8Array([0, 0, 0, 0, 255]))), pngChunk('IEND', new Uint8Array())]); }
test('review: PNG format and16M-pixel ceiling match the retained native admission contract', () => {
  const header = new Uint8Array(13), view = new DataView(header.buffer); view.setUint32(0, 1); view.setUint32(4, 1); header[8] = 8; header[9] = 6; validatePNG(png(header));
  for (const index of [8, 9, 10, 11, 12]) { const altered = header.slice(); altered[index] = 99; assert.throws(() => validatePNG(png(altered)), /png-dimension-or-format-limit/); }
  view.setUint32(0, 5000); view.setUint32(4, 5000); assert.throws(() => validatePNG(png(header)), /png-dimension-or-format-limit/);
});
test('review: queued source and archive identity cannot be swapped by updating envelope hashes', async () => {
  const { store, a, b } = await setup(); let authorizationCalls = 0;
  const transport: ScopedPublicationTransport = { connected: true, authorize: async () => { authorizationCalls++; throw new Error('should-not-contact'); }, assertAuthority: async () => {}, status: async () => ({ state: 'absent' }), reserve: async () => { throw new Error('unexpected'); }, upload: async () => {}, finalize: async () => ({ state: 'absent' }), authenticateReceipt: async () => false };
  const outbox = new SpatialOutbox(store, transport); await outbox.enqueue(a, { system: 'auxiliumos', contextID: 'synthetic-project' }, 'review-request');
  const wrong = await exportRevision(b, 'bundle'), members = readZIP(wrong.bytes), manifestHash = await sha256(members['manifest.json']);
  await mutateRow(store, 'outbox', 'review-request', row => { row.archive = wrong.bytes; row.summary.request.archiveSHA256 = wrong.hash; row.summary.request.archiveByteCount = wrong.bytes.length; row.summary.request.manifestSHA256 = manifestHash; });
  assert.deepEqual(await outbox.deliver('review-request'), { state: 'blocked', failure: 'corrupt-outbox' }); assert.equal(authorizationCalls, 0); store.close();
});
