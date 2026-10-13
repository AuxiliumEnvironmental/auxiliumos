import 'fake-indexeddb/auto';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import { SpatialOutbox, SpatialWebStore } from '../../src/data';
import type { PublicationAuthorization, PublicationReceipt, PublicationRemoteStatus, PublicationRequest, PublicationReservation, ScopedPublicationTransport } from '../../src/data';
import { sha256 } from '../../src/data/bytes';

class SyntheticReceiver implements ScopedPublicationTransport {
  readonly connected = true;
  revoked = false; conflict = false; pending = false; failAfterAccept = false; forged = false; revokeAfterUpload = false;
  uploads = 0; statuses = 0; accepted?: PublicationReceipt; reservation?: PublicationReservation;
  onStatus?: () => Promise<void>;
  async authorize(request: PublicationRequest): Promise<PublicationAuthorization> { return { handle: 'synthetic-memory-only-handle', requestID: request.clientRequestID, destination: structuredClone(request.destination), expiresAt: Date.now() + 120_000 }; }
  async assertAuthority(_request: PublicationRequest): Promise<void> { if (this.revoked) throw new Error('authority-denied'); }
  async status(): Promise<PublicationRemoteStatus> { this.statuses++; await this.onStatus?.(); if (this.accepted) return { state: 'accepted', receipt: structuredClone(this.accepted) }; return this.reservation ? { state: 'reserved', reservation: this.reservation } : { state: 'absent' }; }
  async reserve(request: PublicationRequest): Promise<PublicationReservation> {
    if (this.conflict) throw new Error('revision-conflict');
    this.reservation = { publicationID: 'synthetic-publication', request: structuredClone(request) }; return this.reservation;
  }
  async upload(bytes: Uint8Array, reservation: PublicationReservation): Promise<void> { assert.equal(await sha256(bytes), reservation.request.archiveSHA256); this.uploads++; if (this.revokeAfterUpload) this.revoked = true; }
  async finalize(reservation: PublicationReservation): Promise<PublicationRemoteStatus> {
    if (this.pending) return { state: 'pending', reservation };
    this.accepted = { receiptID: 'synthetic-receipt', publicationID: reservation.publicationID, request: structuredClone(reservation.request), acceptedRevision: 1, acceptedAt: '2026-10-09T00:00:00Z', disposition: 'internal-draft', proof: 'synthetic-proof' };
    if (this.forged) this.accepted.request.destination.contextID = 'wrong-project';
    if (this.failAfterAccept) { this.failAfterAccept = false; throw new Error('connection-lost-after-acceptance'); }
    return { state: 'accepted', receipt: structuredClone(this.accepted) };
  }
  async authenticateReceipt(receipt: PublicationReceipt): Promise<boolean> { return receipt.proof === 'synthetic-proof'; }
}
async function setup(receiver?: SyntheticReceiver) {
  const store = new SpatialWebStore(crypto.randomUUID()), document = JSON.parse(await readFile(new URL('../../../fixtures/geometry.json', import.meta.url), 'utf8'));
  await store.create(document); const frozen = await store.freeze(document.documentID, document.revision);
  const outbox = new SpatialOutbox(store, receiver), queued = await outbox.enqueue(frozen, { system: 'auxiliumos', contextID: 'synthetic-project' }, 'stable-request');
  return { store, document, frozen, outbox, queued };
}
test('default publisher is durably queued and never claims a connection or receipt', async () => {
  const { store, outbox, queued } = await setup(); assert.equal(outbox.connected, false); assert.equal(queued.state, 'queued');
  assert.deepEqual(await outbox.deliver('stable-request'), { state: 'not-connected' });
  const records = await outbox.list(); assert.equal(records[0].state, 'queued'); assert.equal(records[0].attempts, 0); assert.equal(records[0].receipt, undefined); store.close();
});
test('outbox persists exact bytes across reopen and duplicate enqueue is idempotent', async () => {
  const { store, outbox, frozen, queued } = await setup();
  assert.deepEqual(await outbox.enqueue(frozen, queued.request.destination, 'stable-request'), queued);
  await assert.rejects(outbox.enqueue(frozen, { system: 'moldo', contextID: 'same-account-label' }, 'stable-request'), /identity-conflict/);
  const ns = store.namespace; store.close(); const reopened = new SpatialWebStore(ns); assert.deepEqual((await new SpatialOutbox(reopened).list())[0], queued); reopened.close();
});
test('synthetic receiver acknowledges the exact frozen source after subsequent editing', async () => {
  const receiver = new SyntheticReceiver(), { store, outbox, document, frozen } = await setup(receiver);
  await store.apply(document.documentID, 1, [{ type: 'renameRoom', floorID: 'floor-1', roomID: 'room-a', label: 'Later edit' }]);
  assert.deepEqual(await outbox.deliver('stable-request'), { state: 'delivered' });
  const result = (await outbox.list())[0]; assert.equal(result.receipt!.request.sourceRevision, 1); assert.equal(result.receipt!.request.localSnapshotSHA256, frozen.hash); assert.equal((await store.open(document.documentID)).document.revision, 2); assert.equal(receiver.uploads, 1); store.close();
});
test('uncertain delivery reconciles status first and does not duplicate an accepted upload', async () => {
  const receiver = new SyntheticReceiver(); receiver.failAfterAccept = true; const { store, outbox } = await setup(receiver);
  assert.equal((await outbox.deliver('stable-request')).state, 'blocked'); assert.equal((await outbox.list())[0].state, 'retryableFailure');
  assert.equal((await outbox.deliver('stable-request')).state, 'delivered'); assert.equal(receiver.statuses, 2); assert.equal(receiver.uploads, 1); assert.equal((await outbox.list())[0].attempts, 2); store.close();
});
test('pending receiver response stays pending without claiming delivery', async () => {
  const receiver = new SyntheticReceiver(); receiver.pending = true; const { store, outbox } = await setup(receiver);
  assert.deepEqual(await outbox.deliver('stable-request'), { state: 'awaitingReceipt' });
  const result = (await outbox.list())[0]; assert.equal(result.state, 'awaitingReceipt'); assert.equal(result.receipt, undefined); store.close();
});
test('revocation after upload prevents finalization and preserves local source', async () => {
  const receiver = new SyntheticReceiver(); receiver.revokeAfterUpload = true; const { store, outbox, document } = await setup(receiver);
  assert.deepEqual(await outbox.deliver('stable-request'), { state: 'blocked', failure: 'authority-denied' });
  assert.equal((await outbox.list())[0].state, 'denied'); assert.equal(receiver.accepted, undefined); assert.equal((await store.open(document.documentID)).document.revision, 1);
  receiver.revoked = false; assert.equal((await outbox.deliver('stable-request')).failure, 'publication-denied'); store.close();
});
test('destination conflicts cannot be silently retried against a newer target version', async () => {
  const receiver = new SyntheticReceiver(); receiver.conflict = true; const { store, outbox } = await setup(receiver);
  assert.equal((await outbox.deliver('stable-request')).failure, 'revision-conflict'); assert.equal((await outbox.list())[0].state, 'conflict');
  receiver.conflict = false; assert.equal((await outbox.deliver('stable-request')).failure, 'publication-conflict'); assert.equal(receiver.uploads, 0); store.close();
});
test('forged receipt for another destination is never accepted despite matching proof', async () => {
  const receiver = new SyntheticReceiver(); receiver.forged = true; const { store, outbox } = await setup(receiver);
  assert.equal((await outbox.deliver('stable-request')).failure, 'invalid-publication-receipt'); assert.equal((await outbox.list())[0].receipt, undefined); store.close();
});
test('concurrent coordinators cannot both own an active request', async () => {
  const receiver = new SyntheticReceiver(), { store, outbox } = await setup(receiver);
  let release!: () => void, started!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }), observed = new Promise<void>(resolve => { started = resolve; });
  receiver.onStatus = async () => { started(); await gate; };
  const first = outbox.deliver('stable-request'); await observed;
  const second = new SpatialOutbox(store, receiver); assert.equal((await second.deliver('stable-request')).failure, 'publication-busy');
  release(); assert.equal((await first).state, 'delivered'); assert.equal(receiver.uploads, 1); store.close();
});
test('local cancellation during a suspended attempt cannot later produce a delivered state', async () => {
  const receiver = new SyntheticReceiver(), { store, outbox } = await setup(receiver);
  let release!: () => void, started!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }), observed = new Promise<void>(resolve => { started = resolve; });
  receiver.onStatus = async () => { started(); await gate; };
  const attempt = outbox.deliver('stable-request'); await observed; await outbox.cancel('stable-request'); release();
  assert.equal((await attempt).failure, 'publication-lease-lost'); assert.equal((await outbox.list())[0].state, 'cancelledLocally'); assert.equal(receiver.uploads, 0); store.close();
});
test('expired crashed attempt recovers with unchanged request and status reconciliation', async () => {
  const receiver = new SyntheticReceiver(), { store, outbox } = await setup(receiver);
  await store.transaction(['outbox'], 'readwrite', tx => new Promise<void>((resolve, reject) => {
    const table = tx.objectStore('outbox'), get = table.get('stable-request'); get.onerror = () => reject(get.error); get.onsuccess = () => { const row = get.result; row.attemptID = 'crashed-attempt'; row.leaseUntil = 1; row.summary.state = 'delivering'; row.summary.attempts = 1; table.put(row); resolve(); };
  }));
  assert.equal((await outbox.deliver('stable-request')).state, 'delivered'); assert.equal(receiver.statuses, 1); assert.equal((await outbox.list())[0].attempts, 2); store.close();
});
test('corrupted persisted archive is blocked before contacting the receiver', async () => {
  const receiver = new SyntheticReceiver(), { store, outbox } = await setup(receiver);
  await store.transaction(['outbox'], 'readwrite', tx => new Promise<void>((resolve, reject) => {
    const table = tx.objectStore('outbox'), get = table.get('stable-request'); get.onerror = () => reject(get.error); get.onsuccess = () => { const row = get.result; row.archive[40] ^= 1; table.put(row); resolve(); };
  }));
  assert.equal((await outbox.deliver('stable-request')).failure, 'corrupt-outbox'); assert.equal(receiver.statuses, 0); assert.equal(receiver.uploads, 0); store.close();
});
test('expired or wrong-scope authorization cannot reach remote status or upload', async () => {
  for (const wrongScope of [false, true]) {
    const receiver = new SyntheticReceiver();
    receiver.authorize = async request => ({ handle: 'synthetic-memory-only-handle', requestID: request.clientRequestID, destination: { ...request.destination, ...(wrongScope ? { contextID: 'wrong-project' } : {}) }, expiresAt: wrongScope ? Date.now() + 120_000 : 1 });
    const { store, outbox } = await setup(receiver);
    assert.equal((await outbox.deliver('stable-request')).failure, 'authentication-required'); assert.equal((await outbox.list())[0].state, 'needsAuthentication'); assert.equal(receiver.statuses, 0); assert.equal(receiver.uploads, 0); store.close();
  }
});
test('receipt fields and content hashes alone cannot authenticate the receiver', async () => {
  const receiver = new SyntheticReceiver(); receiver.authenticateReceipt = async () => false; const { store, outbox } = await setup(receiver);
  assert.equal((await outbox.deliver('stable-request')).failure, 'invalid-publication-receipt'); assert.equal((await outbox.list())[0].receipt, undefined); store.close();
});
test('same request ID cannot be reassigned to a newly edited source version', async () => {
  const { store, outbox, document } = await setup();
  await store.apply(document.documentID, 1, [{ type: 'renameRoom', floorID: 'floor-1', roomID: 'room-a', label: 'Another version' }]);
  const edited = await store.freeze(document.documentID, 2);
  await assert.rejects(outbox.enqueue(edited, { system: 'auxiliumos', contextID: 'synthetic-project' }, 'stable-request'), /identity-conflict/); assert.equal((await outbox.list())[0].request.sourceRevision, 1); store.close();
});
test('queued publication snapshots source and destination before asynchronous hashing', async () => {
  const { store, outbox, frozen } = await setup();
  const destination = { system: 'auxiliumos' as const, contextID: 'intended-project' };
  const pending = outbox.enqueue(frozen, destination, 'second-request');
  destination.contextID = 'mutated-project'; frozen.document.title = 'Changed while hashing'; frozen.bytes.fill(0);
  const queued = await pending; assert.equal(queued.request.destination.contextID, 'intended-project'); assert.equal(queued.request.sourceRevision, 1); store.close();
});
test('adapter mutation of request and receipt objects cannot change the stored accepted version', async () => {
  const receiver = new SyntheticReceiver();
  receiver.assertAuthority = async request => { request.sourceRevision = 99; request.destination.contextID = 'attempted-mutation'; };
  receiver.authenticateReceipt = async receipt => { receipt.request.sourceRevision = 999; receipt.request.destination.contextID = 'attempted-mutation'; return true; };
  const { store, outbox } = await setup(receiver);
  assert.equal((await outbox.deliver('stable-request')).state, 'delivered');
  const receipt = (await outbox.list())[0].receipt!; assert.equal(receipt.request.sourceRevision, 1); assert.equal(receipt.request.destination.contextID, 'synthetic-project'); store.close();
});
