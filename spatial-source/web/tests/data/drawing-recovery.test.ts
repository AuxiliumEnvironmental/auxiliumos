import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { SpatialWebStore } from '../../src/data/store';
import { DrawingRecoveryStore, DRAWING_RECOVERY_STORE, validateDrawingRecoveryPayload, type DrawingRecoveryAuthority, type DrawingRecoveryPayload, type DrawingRecoveryRecord } from '../../src/data/drawingRecovery';
import { jsonBytes, sha256 } from '../../src/data/bytes';
import { fixture } from '../core/fixtures';
import type { EditCommand, SpatialDocument } from '../../src/types';
const authority = (): DrawingRecoveryAuthority => ({ assertAccess: async () => {}, isCurrent: () => true });
const sample = (): DrawingRecoveryPayload => ({ tool: 'wall', points: [{ x: 0, z: 0, nodeID: 'n0' }, { x: -2, z: -2, nodeID: 'draft-new' }] });
const write = (expectedToken: string | null = null, writerID = 'writer-one') => ({ expectedToken, writerID });
const idb = <T>(req: IDBRequest<T>) => new Promise<T>((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
async function setup(guard = authority()) { const store = new SpatialWebStore(`drawing-test-${crypto.randomUUID()}`), document = fixture(); await store.create(document); return { store, document, recovery: new DrawingRecoveryStore(store, guard) }; }
async function mutate(store: SpatialWebStore, documentID: string, action: (row: DrawingRecoveryRecord) => void) { await store.transaction([DRAWING_RECOVERY_STORE], 'readwrite', async tx => { const table = tx.objectStore(DRAWING_RECOVERY_STORE), row = await idb(table.get(documentID)) as DrawingRecoveryRecord; action(row); await idb(table.put(row)); }); }
const addWall = (): EditCommand => ({ type: 'addWall', floorID: 'floor-1', newNodes: [{ id: 'draft-new', point: { x: -2, z: -2 } }], wall: { id: 'drawn-wall', nodeIDs: ['n0', 'draft-new'], baseY: 0, height: 2.6, heightBasis: 'assumed', provenance: { origin: 'edited', sourceIDs: [], classificationConfidence: 'unknown' } } });
const rename = (label = 'Changed elsewhere'): EditCommand => ({ type: 'renameRoom', floorID: 'floor-1', roomID: 'room-a', label });

for (const payload of [
  sample(), { tool: 'area', points: [{ x: 1, z: 1 }] }, { tool: 'room', points: [{ x: -1, z: -1 }, { x: -1, z: -1 }] },
  { tool: 'opening', point: { x: 4, z: 1.5 }, opening: { id: 'draft-door', wallID: 'w6', kind: 'door', offset: 1, width: .9, bottom: 0, height: 2, provenance: { origin: 'edited', sourceIDs: [], classificationConfidence: 'unknown' } } },
] as DrawingRecoveryPayload[]) test(`${payload.tool} completed samples survive reopening separately from unchanged saved geometry`, async () => {
  const { store, document, recovery } = await setup(); let reopened: SpatialWebStore | undefined;
  try {
    assert.deepEqual(await recovery.read(document), { state: 'none' }); const record = await recovery.save(document, 'floor-1', payload, write());
    assert.equal(record.baseRevision, document.revision); assert.equal(record.baseSHA256, await sha256(jsonBytes(document))); assert.equal(record.namespace, store.namespace);
    assert.deepEqual((await store.open(document.documentID)).document, document); const frozen = await store.freeze(document.documentID, document.revision);
    assert.deepEqual(frozen.document, document); assert.deepEqual(frozen.bytes, jsonBytes(document));
    store.close(); reopened = new SpatialWebStore(store.namespace); const recovered = await new DrawingRecoveryStore(reopened, authority()).read(document);
    assert.equal(recovered.state, 'ready'); assert.deepEqual(recovered.record.payload, payload); assert.equal(recovered.record.token, record.token);
  } finally { store.close(); reopened?.close(); }
});

test('write snapshots payload and source before asynchronous authorization, and returned records are detached', async () => {
  let release!: () => void; const wait = new Promise<void>(resolve => { release = resolve; }); let checks = 0;
  const { store, document, recovery } = await setup({ isCurrent: () => true, assertAccess: async () => { if (++checks === 1) await wait; } });
  try { const original = structuredClone(document), draft = sample(), saving = recovery.save(document, 'floor-1', draft, write());
    document.title = 'Mutated caller'; if (draft.tool !== 'opening') draft.points[1].x = -999; release(); const saved = await saving;
    if (saved.payload.tool !== 'opening') saved.payload.points[0].x = 999; const actual = await recovery.read(original); assert.equal(actual.state, 'ready');
    assert.deepEqual(actual.record.payload, sample());
  } finally { store.close(); }
});

test('two concurrent first writers cannot overwrite each other and the losing draft remains a visible conflict', async () => {
  const { store, document, recovery } = await setup(), second = new SpatialWebStore(store.namespace); const other = new DrawingRecoveryStore(second, authority());
  try { const results = await Promise.allSettled([recovery.save(document, 'floor-1', sample(), write(null, 'one')), other.save(document, 'floor-1', { tool: 'room', points: [{ x: -2, z: -2 }] }, write(null, 'two'))]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1); const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult; assert.match(String(rejected.reason), /drawing-recovery-conflict/);
    const found = await recovery.read(document); assert.equal(found.state, 'ready'); assert.deepEqual((await store.open(document.documentID)).document, document);
  } finally { store.close(); second.close(); }
});

test('exact CAS prevents stale checkpoint replacement, stale discard and delete/recreate ABA', async () => {
  const { store, document, recovery } = await setup();
  try { const first = await recovery.save(document, 'floor-1', sample(), write()); const second = await recovery.save(document, 'floor-1', { tool: 'room', points: [{ x: -4, z: 1 }] }, write(first.token));
    assert.notEqual(first.token, second.token); await assert.rejects(recovery.save(document, 'floor-1', sample(), write(first.token)), /drawing-recovery-conflict/);
    await assert.rejects(recovery.discard(document.documentID, first.token), /drawing-recovery-conflict/); await recovery.discard(document.documentID, second.token);
    const third = await recovery.save(document, 'floor-1', sample(), write()); assert.notEqual(third.token, first.token); await assert.rejects(recovery.discard(document.documentID, second.token), /drawing-recovery-conflict/);
    const found = await recovery.read(document); if (found.state === 'none') assert.fail(); assert.equal(found.record.token, third.token);
  } finally { store.close(); }
});

test('stale revision and same-revision different contents never silently rebase unfinished samples', async () => {
  const { store, document, recovery } = await setup();
  try { const record = await recovery.save(document, 'floor-1', sample(), write()); const changed = await store.apply(document.documentID, document.revision, [rename()]);
    const stale = await recovery.read(changed.document); assert.equal(stale.state, 'stale'); assert.equal(stale.record.token, record.token);
    await assert.rejects(recovery.save(changed.document, 'floor-1', sample(), write(record.token)), /drawing-recovery-stale-base/);
    const forged = structuredClone(document); forged.title = 'Different content at old revision'; await assert.rejects(recovery.save(forged, 'floor-1', sample(), write(record.token)), /drawing-recovery-stale-base/);
    await recovery.discard(document.documentID, record.token); assert.deepEqual(await recovery.read(changed.document), { state: 'none' });
  } finally { store.close(); }
});

test('a removed base floor is retained as a stale draft while the current valid layout still opens', async () => {
  const { store, document, recovery } = await setup();
  try { const record = await recovery.save(document, 'floor-1', sample(), write()); const changed = await store.apply(document.documentID, document.revision, [{ type: 'addFloor', floor: { id: 'new-floor', label: 'Replacement floor', elevation: 3, nodes: [], walls: [], openings: [], rooms: [] } }, { type: 'deleteFloor', floorID: 'floor-1' }]);
    const stale = await recovery.read(changed.document); assert.equal(stale.state, 'stale'); assert.equal(stale.record.floorID, 'floor-1'); assert.equal(stale.record.token, record.token);
    assert.equal((await store.open(document.documentID)).document.floors[0].id, 'new-floor');
  } finally { store.close(); }
});

test('successful geometry edit atomically removes exactly its drawing recovery checkpoint', async () => {
  const { store, document, recovery } = await setup();
  try { const record = await recovery.save(document, 'floor-1', sample(), write()); const result = await store.apply(document.documentID, document.revision, [addWall()], { token: record.token });
    assert.equal(result.document.revision, document.revision + 1); assert.ok(result.document.floors[0].walls.some(wall => wall.id === 'drawn-wall')); assert.deepEqual(await recovery.read(result.document), { state: 'none' });
    const undone = await store.undo(document.documentID, result.document.revision); assert.deepEqual(undone.document.floors, document.floors); assert.deepEqual(await recovery.read(undone.document), { state: 'none' });
  } finally { store.close(); }
});

test('invalid edit and wrong recovery token roll back geometry and retain the complete checkpoint', async () => {
  const { store, document, recovery } = await setup();
  try { const first = await recovery.save(document, 'floor-1', sample(), write()); const next = await recovery.save(document, 'floor-1', sample(), write(first.token));
    await assert.rejects(store.apply(document.documentID, document.revision, [rename()], { token: first.token }), /drawing-recovery-conflict/);
    await assert.rejects(store.apply(document.documentID, document.revision, [{ type: 'moveNode', floorID: 'floor-1', nodeID: 'n0', point: { x: Infinity, z: 0 } }], { token: next.token }));
    assert.deepEqual((await store.open(document.documentID)).document, document); const found = await recovery.read(document); if (found.state === 'none') assert.fail(); assert.equal(found.record.token, next.token);
  } finally { store.close(); }
});

test('a drawing from an old base cannot be consumed with a later geometry correction', async () => {
  const { store, document, recovery } = await setup();
  try { const record = await recovery.save(document, 'floor-1', sample(), write()); const changed = await store.apply(document.documentID, document.revision, [rename()]);
    await assert.rejects(store.apply(document.documentID, changed.document.revision, [rename('Attempt rebase')], { token: record.token }), /drawing-recovery-stale-base/);
    assert.deepEqual((await store.open(document.documentID)).document, changed.document); assert.equal((await recovery.read(changed.document)).state, 'stale');
  } finally { store.close(); }
});

test('a completed but invalid wall-end opening remains recoverable without entering canonical geometry', async () => {
  const { store, document, recovery } = await setup(); let reopened: SpatialWebStore | undefined;
  try {
    const payload: DrawingRecoveryPayload = { tool: 'opening', point: { x: 4, z: 0 }, opening: { id: 'invalid-end-door', wallID: 'w6', kind: 'door', offset: -.45, width: .9, bottom: 0, height: 2, provenance: { origin: 'edited', sourceIDs: [], classificationConfidence: 'unknown' } } };
    const record = await recovery.save(document, 'floor-1', payload, write()); store.close(); reopened = new SpatialWebStore(store.namespace);
    const restored = new DrawingRecoveryStore(reopened, authority()), found = await restored.read(document); assert.equal(found.state, 'ready'); assert.deepEqual(found.record.payload, payload);
    await assert.rejects(reopened.apply(document.documentID, document.revision, [{ type: 'addOpening', floorID: 'floor-1', opening: payload.opening }], { token: record.token }));
    assert.deepEqual((await reopened.open(document.documentID)).document, document); const retained = await restored.read(document); if (retained.state === 'none') assert.fail(); assert.equal(retained.record.token, record.token);
  } finally { store.close(); reopened?.close(); }
});

test('a blocked opening beyond the canonical offset limit on a long host remains exactly recoverable', async () => {
  const store = new SpatialWebStore(`long-opening-${crypto.randomUUID()}`), document = fixture(); let reopened: SpatialWebStore | undefined;
  document.floors = [{ id: 'long-floor', label: 'Long synthetic wall', elevation: 0, nodes: [{ id: 'long-a', point: { x: -9000, z: 0 } }, { id: 'long-b', point: { x: 9000, z: 0 } }], walls: [{ id: 'long-wall', nodeIDs: ['long-a', 'long-b'], baseY: 0, height: 3, heightBasis: 'assumed', provenance: { origin: 'edited', sourceIDs: [], classificationConfidence: 'unknown' } }], rooms: [], openings: [] }];
  const payload: DrawingRecoveryPayload = { tool: 'opening', point: { x: 6000, z: 0 }, opening: { id: 'long-preview', wallID: 'long-wall', kind: 'door', offset: 14999.55, width: .9, bottom: 0, height: 2, provenance: { origin: 'edited', sourceIDs: [], classificationConfidence: 'unknown' } } };
  try {
    await store.create(document); const record = await new DrawingRecoveryStore(store, authority()).save(document, 'long-floor', payload, write());
    store.close(); reopened = new SpatialWebStore(store.namespace); const recovery = new DrawingRecoveryStore(reopened, authority()), found = await recovery.read(document);
    assert.equal(found.state, 'ready'); assert.deepEqual(found.record.payload, payload);
    await assert.rejects(reopened.apply(document.documentID, document.revision, [{ type: 'addOpening', floorID: 'long-floor', opening: payload.opening }], { token: record.token }));
    assert.deepEqual((await reopened.open(document.documentID)).document, document); const retained = await recovery.read(document); if (retained.state === 'none') assert.fail(); assert.equal(retained.record.token, record.token);
  } finally { store.close(); reopened?.close(); }
});

test('opening recovery rejects offsets unrelated to its host, including excessive negative previews', async () => {
  const { store, document, recovery } = await setup();
  try {
    for (const offset of [-1, 10001]) {
      const payload: DrawingRecoveryPayload = { tool: 'opening', point: { x: 4, z: 1 }, opening: { id: 'beyond-host', wallID: 'w6', kind: 'door', offset, width: .9, bottom: 0, height: 2, provenance: { origin: 'edited', sourceIDs: [], classificationConfidence: 'unknown' } } };
      await assert.rejects(recovery.save(document, 'floor-1', payload, write()), /drawing-recovery-reference-mismatch/);
    }
    assert.deepEqual(await recovery.read(document), { state: 'none' }); assert.deepEqual((await store.open(document.documentID)).document, document);
  } finally { store.close(); }
});

test('unfinished opening envelope still rejects nonfinite and excessive arclength offsets', () => {
  for (const offset of [Infinity, NaN, 1000 * 20000 * Math.SQRT2 + 1, -10001]) {
    assert.throws(() => validateDrawingRecoveryPayload({ tool: 'opening', point: { x: 0, z: 0 }, opening: { id: 'excessive', wallID: 'w6', kind: 'door', offset, width: .9, bottom: 0, height: 2, provenance: { origin: 'edited', sourceIDs: [], classificationConfidence: 'unknown' } } }), /invalid-drawing-recovery-payload/);
  }
});

test('same-token checksum corruption cannot be consumed by Finish and both layout and damaged recovery remain intact', async () => {
  const { store, document, recovery } = await setup();
  try { const record = await recovery.save(document, 'floor-1', sample(), write()); await mutate(store, document.documentID, row => { if (row.payload.tool !== 'opening') row.payload.points[1].x = -99; });
    await assert.rejects(store.apply(document.documentID, document.revision, [addWall()], { token: record.token }), /corrupt-drawing-recovery/);
    assert.deepEqual((await store.open(document.documentID)).document, document); assert.ok(await store.transaction([DRAWING_RECOVERY_STORE], 'readonly', tx => idb(tx.objectStore(DRAWING_RECOVERY_STORE).get(document.documentID))));
  } finally { store.close(); }
});

test('same-token body replacement after digest preparation cannot pass the atomic clearing comparison', async () => {
  const { store, document, recovery } = await setup(), second = new SpatialWebStore(store.namespace);
  try { const record = await recovery.save(document, 'floor-1', sample(), write()), changed = structuredClone(record); if (changed.payload.tool !== 'opening') changed.payload.points[1].x = -99;
    const { recordSHA256: _old, ...body } = changed; changed.recordSHA256 = await sha256(jsonBytes(body));
    const original = store.transaction.bind(store); let changedBeforeTransaction = false;
    store.transaction = async (stores, mode, action) => { if (!changedBeforeTransaction && mode === 'readwrite' && stores.includes(DRAWING_RECOVERY_STORE)) { changedBeforeTransaction = true; await second.transaction([DRAWING_RECOVERY_STORE], 'readwrite', tx => idb(tx.objectStore(DRAWING_RECOVERY_STORE).put(changed))); } return original(stores, mode, action); };
    await assert.rejects(store.apply(document.documentID, document.revision, [addWall()], { token: record.token }), /drawing-recovery-conflict/); store.transaction = original;
    assert.ok(changedBeforeTransaction); assert.deepEqual((await store.open(document.documentID)).document, document); const found = await recovery.read(document); if (found.state === 'none') assert.fail(); assert.deepEqual(found.record, changed);
  } finally { store.close(); second.close(); }
});

test('a concurrent saved revision after clear preparation aborts Finish and preserves the stale recovery', async () => {
  const { store, document, recovery } = await setup(), second = new SpatialWebStore(store.namespace);
  try { const record = await recovery.save(document, 'floor-1', sample(), write()), original = store.transaction.bind(store); let changed: SpatialDocument | undefined;
    store.transaction = async (stores, mode, action) => { if (!changed && mode === 'readwrite' && stores.includes(DRAWING_RECOVERY_STORE)) changed = (await second.apply(document.documentID, document.revision, [rename('Other saved revision')])).document; return original(stores, mode, action); };
    await assert.rejects(store.apply(document.documentID, document.revision, [addWall()], { token: record.token }), /revision-conflict/); store.transaction = original;
    assert.ok(changed); assert.deepEqual((await store.open(document.documentID)).document, changed); const found = await recovery.read(changed); assert.equal(found.state, 'stale'); assert.equal(found.record.token, record.token);
  } finally { store.close(); second.close(); }
});

test('scope namespaces isolate the same document and reject a transplanted recovery envelope', async () => {
  const { store, document, recovery } = await setup(), other = new SpatialWebStore(`other-${crypto.randomUUID()}`); const second = new DrawingRecoveryStore(other, authority());
  try { const record = await recovery.save(document, 'floor-1', sample(), write()); await other.create(document); assert.deepEqual(await second.read(document), { state: 'none' });
    await other.transaction([DRAWING_RECOVERY_STORE], 'readwrite', tx => idb(tx.objectStore(DRAWING_RECOVERY_STORE).put(record)));
    await assert.rejects(second.read(document), /corrupt-drawing-recovery/); assert.equal((await recovery.read(document)).state, 'ready');
  } finally { store.close(); other.close(); }
});

test('authority denial and generation changes cannot write or expose a recovered checkpoint', async () => {
  const { store, document, recovery } = await setup();
  try { const record = await recovery.save(document, 'floor-1', sample(), write());
    const denied = new DrawingRecoveryStore(store, { isCurrent: () => true, assertAccess: async () => { throw new Error('scope-revoked'); } });
    await assert.rejects(denied.read(document), /scope-revoked/); await assert.rejects(denied.save(document, 'floor-1', sample(), write(record.token)), /scope-revoked/); await assert.rejects(denied.discard(document.documentID, record.token), /scope-revoked/);
    let current = true; const switched = new DrawingRecoveryStore(store, { isCurrent: () => current, assertAccess: async () => { current = false; } });
    await assert.rejects(switched.save(document, 'floor-1', sample(), write(record.token)), /authority-changed/);
    const retained = await recovery.read(document); if (retained.state === 'none') assert.fail(); assert.equal(retained.record.token, record.token);
  } finally { store.close(); }
});

test('read rechecks authority after hashing and never exposes a newly revoked record', async () => {
  const { store, document, recovery } = await setup();
  try { await recovery.save(document, 'floor-1', sample(), write()); let calls = 0;
    const revoked = new DrawingRecoveryStore(store, { isCurrent: () => true, assertAccess: async () => { if (++calls === 2) throw new Error('read-revoked-after-hashing'); } });
    await assert.rejects(revoked.read(document), /read-revoked-after-hashing/); assert.equal(calls, 2); assert.equal((await recovery.read(document)).state, 'ready');
  } finally { store.close(); }
});

test('authority change during a mutating transaction aborts its write', async () => {
  let current = true; const { store, document, recovery } = await setup({ assertAccess: async () => {}, isCurrent: () => current });
  try { const original = store.transaction.bind(store); store.transaction = async (stores, mode, action) => original(stores, mode, async tx => { const result = await action(tx); if (mode === 'readwrite' && stores.includes(DRAWING_RECOVERY_STORE)) { current = false; tx.abort(); throw new Error('drawing-recovery-authority-changed'); } return result; });
    await assert.rejects(recovery.save(document, 'floor-1', sample(), write()), /authority-changed/); current = true; store.transaction = original; assert.deepEqual(await recovery.read(document), { state: 'none' });
  } finally { store.close(); }
});

for (const [label, change] of [
  ['content checksum', (row: DrawingRecoveryRecord) => { if (row.payload.tool !== 'opening') row.payload.points[0].x = 500; }],
  ['unknown fields', (row: DrawingRecoveryRecord) => { (row as unknown as Record<string, unknown>).authorization = 'administrator'; }],
  ['version', (row: DrawingRecoveryRecord) => { row.formatVersion = 2 as 1; }],
  ['timestamp', (row: DrawingRecoveryRecord) => { row.updatedAt = 'yesterday'; }],
  ['nonfinite coordinate', (row: DrawingRecoveryRecord) => { if (row.payload.tool !== 'opening') row.payload.points[0].x = NaN; }],
] as const) test(`malformed ${label} recovery is rejected without dropping it or damaging saved geometry`, async () => {
  const { store, document, recovery } = await setup();
  try { const record = await recovery.save(document, 'floor-1', sample(), write()); await mutate(store, document.documentID, change);
    await assert.rejects(recovery.read(document), /corrupt-drawing-recovery/); await assert.rejects(recovery.save(document, 'floor-1', sample(), write(record.token)), /corrupt-drawing-recovery/); await assert.rejects(recovery.discard(document.documentID, record.token), /corrupt-drawing-recovery/);
    assert.deepEqual((await store.open(document.documentID)).document, document);
    assert.ok(await store.transaction([DRAWING_RECOVERY_STORE], 'readonly', tx => idb(tx.objectStore(DRAWING_RECOVERY_STORE).get(document.documentID))));
  } finally { store.close(); }
});

test('bounded payload admission rejects nonfinite or excessive points, unsafe IDs, unknown tools and sparse arrays', () => {
  const sparse = Array(2); sparse[0] = { x: 1, z: 1 };
  for (const payload of [{ tool: 'room', points: [] }, { tool: 'room', points: Array(3).fill({ x: 0, z: 0 }) }, { tool: 'wall', points: Array(1002).fill({ x: 0, z: 0 }) }, { tool: 'area', points: Array(1001).fill({ x: 0, z: 0 }) }, { tool: 'wall', points: sparse }, { tool: 'wall', points: [{ x: Infinity, z: 0 }] }, { tool: 'wall', points: [{ x: 10001, z: 0 }] }, { tool: 'wall', points: [{ x: 0, z: 0, nodeID: '../other' }] }, { tool: 'scan', points: [{ x: 1, z: 1 }] }, { tool: 'wall', points: [{ x: 0, z: 0 }], session: 'extra' }, { tool: 'wall', points: [{ x: 0, z: 0, nodeID: 'same' }, { x: 2, z: 3, nodeID: 'same' }] }]) assert.throws(() => validateDrawingRecoveryPayload(payload), /invalid-drawing-recovery-payload/);
  assert.equal((validateDrawingRecoveryPayload({ tool: 'wall', points: Array.from({ length: 1001 }, (_, i) => ({ x: i, z: 0 })) }) as { points: unknown[] }).points.length, 1001);
});

test('opening metadata and exact-base node/host references are strictly validated without requiring final geometry', async () => {
  const { store, document, recovery } = await setup();
  try { await assert.rejects(recovery.save(document, 'floor-1', { tool: 'wall', points: [{ x: 100, z: 100, nodeID: 'n0' }] }, write()), /reference-mismatch/);
    const opening = { id: 'new-door', wallID: 'missing', kind: 'door' as const, offset: 1, width: 1, bottom: 0, height: 2, provenance: { origin: 'edited' as const, sourceIDs: [], classificationConfidence: 'unknown' as const } };
    await assert.rejects(recovery.save(document, 'floor-1', { tool: 'opening', opening, point: { x: 4, z: 1 } }, write()), /reference-mismatch/);
    opening.wallID = 'w6'; opening.id = 'door-a'; await assert.rejects(recovery.save(document, 'floor-1', { tool: 'opening', opening, point: { x: 4, z: 1 } }, write()), /reference-mismatch/);
    opening.id = 'new-door'; (opening.provenance.sourceIDs as unknown[]) = Array(1); assert.throws(() => validateDrawingRecoveryPayload({ tool: 'opening', opening, point: { x: 4, z: 1 } }), /invalid/);
  } finally { store.close(); }
});

test('quota failure aborts a checkpoint replacement and leaves the previous complete checkpoint recoverable', async () => {
  const { store, document, recovery } = await setup();
  try { const first = await recovery.save(document, 'floor-1', sample(), write()); const original = store.transaction.bind(store);
    store.transaction = async (stores, mode, action) => original(stores, mode, async tx => { if (mode === 'readwrite' && stores.includes(DRAWING_RECOVERY_STORE)) { tx.abort(); throw new DOMException('Synthetic quota failure', 'QuotaExceededError'); } return action(tx); });
    await assert.rejects(recovery.save(document, 'floor-1', { tool: 'area', points: [{ x: -2, z: -2 }] }, write(first.token)), { name: 'QuotaExceededError' }); store.transaction = original;
    const retained = await recovery.read(document); if (retained.state === 'none') assert.fail(); assert.equal(retained.record.token, first.token); assert.deepEqual(retained.record.payload, first.payload); assert.deepEqual((await store.open(document.documentID)).document, document);
  } finally { store.close(); }
});

test('upgrading an existing version-one database preserves its saved geometry and immutable revisions', async () => {
  const namespace = `drawing-upgrade-${crypto.randomUUID()}`, name = `auxilium-spatial-v1:${namespace}`, document = fixture();
  const first = indexedDB.open(name, 1); first.onupgradeneeded = () => { for (const [store, keyPath] of [['drafts', 'documentID'], ['revisions', 'key'], ['outbox', 'requestID']]) first.result.createObjectStore(store, { keyPath }); };
  const db = await idb(first), bytes = jsonBytes(document), hash = await sha256(bytes), historyHash = await sha256(jsonBytes({ undo: [], redo: [] })), stamp = '2026-10-10T00:00:00.000Z';
  const tx = db.transaction(['drafts', 'revisions', 'outbox'], 'readwrite'); const completed = new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); });
  tx.objectStore('drafts').put({ documentID: document.documentID, document, hash, historyHash, undo: [], redo: [], updatedAt: stamp });
  tx.objectStore('revisions').put({ key: `${document.documentID}:${document.revision}`, documentID: document.documentID, revision: document.revision, frozen: { document, hash, bytes, createdAt: stamp } }); tx.objectStore('outbox').put({ requestID: 'retained-request', testMarker: true }); await completed; db.close();
  const store = new SpatialWebStore(namespace), recovery = new DrawingRecoveryStore(store, authority());
  try { assert.deepEqual((await store.open(document.documentID)).document, document); assert.equal((await store.loadFrozen(document.documentID, document.revision)).hash, hash);
    assert.deepEqual(await store.transaction(['outbox'], 'readonly', tx => idb(tx.objectStore('outbox').get('retained-request'))), { requestID: 'retained-request', testMarker: true });
    assert.deepEqual(await recovery.read(document), { state: 'none' }); await recovery.save(document, 'floor-1', sample(), write()); assert.equal((await recovery.read(document)).state, 'ready');
  } finally { store.close(); }
});
