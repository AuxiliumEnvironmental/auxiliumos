import type { FrozenRevision } from '../types';
import { clone, fail, sha256, stableJSON, strictJSON } from './bytes';
import { exportRevision } from './exports';
import { idbRequest, SpatialWebStore, validateFrozen } from './store';
import { readZIP } from './zip';

export interface PublicationDestination { system: 'auxiliumos' | 'moldo'; contextID: string }
export interface PublicationRequest {
  clientRequestID: string; sourceDocumentID: string; sourceRevision: number;
  localSnapshotSHA256: string; manifestSHA256: string; archiveSHA256: string; archiveByteCount: number;
  destination: PublicationDestination; expectedPublishedRevision?: number;
}
export type PublicationState = 'queued' | 'delivering' | 'awaitingReceipt' | 'needsAuthentication' | 'denied' | 'conflict' | 'retryableFailure' | 'delivered' | 'cancelledLocally';
export interface PublicationReceipt { receiptID: string; publicationID: string; request: PublicationRequest; acceptedRevision: number; acceptedAt: string; disposition: 'internal-draft'; proof: string }
export interface PublicationSummary { request: PublicationRequest; state: PublicationState; attempts: number; queuedAt: string; lastFailure?: string; receipt?: PublicationReceipt }
interface OutboxRecord { requestID: string; summary: PublicationSummary; frozen: FrozenRevision; archive: Uint8Array; attemptID?: string; leaseUntil?: number }
export interface PublicationAuthorization { handle: string; requestID: string; destination: PublicationDestination; expiresAt: number }
export interface PublicationReservation { publicationID: string; request: PublicationRequest }
export type PublicationRemoteStatus = { state: 'absent' } | { state: 'reserved' | 'pending'; reservation: PublicationReservation } | { state: 'accepted'; receipt: PublicationReceipt };
export interface ScopedPublicationTransport {
  readonly connected: boolean;
  authorize(request: PublicationRequest): Promise<PublicationAuthorization>;
  /** Current source-read and destination rights, not a locally asserted role. */
  assertAuthority(request: PublicationRequest, authorization: PublicationAuthorization): Promise<void>;
  status(request: PublicationRequest, authorization: PublicationAuthorization): Promise<PublicationRemoteStatus>;
  reserve(request: PublicationRequest, authorization: PublicationAuthorization): Promise<PublicationReservation>;
  upload(bytes: Uint8Array, reservation: PublicationReservation, authorization: PublicationAuthorization): Promise<void>;
  finalize(reservation: PublicationReservation, authorization: PublicationAuthorization): Promise<PublicationRemoteStatus>;
  authenticateReceipt(receipt: PublicationReceipt, authorization: PublicationAuthorization): Promise<boolean>;
}
export class DisabledPublicationTransport implements ScopedPublicationTransport {
  readonly connected = false;
  async authorize(): Promise<PublicationAuthorization> { return fail('not-connected'); }
  async assertAuthority(): Promise<void> { fail('not-connected'); }
  async status(): Promise<PublicationRemoteStatus> { return fail('not-connected'); }
  async reserve(): Promise<PublicationReservation> { return fail('not-connected'); }
  async upload(): Promise<void> { fail('not-connected'); }
  async finalize(): Promise<PublicationRemoteStatus> { return fail('not-connected'); }
  async authenticateReceipt(): Promise<boolean> { return fail('not-connected'); }
}
const validID = (id: unknown) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,96}$/.test(id);
const equal = (a: unknown, b: unknown) => stableJSON(a) === stableJSON(b);
export class SpatialOutbox {
  constructor(private readonly store: SpatialWebStore, private readonly transport: ScopedPublicationTransport = new DisabledPublicationTransport(), private readonly now = () => Date.now()) {}
  get connected(): boolean { return this.transport.connected; }
  async enqueue(frozen: FrozenRevision, destination: PublicationDestination, requestID: string = crypto.randomUUID(), expectedPublishedRevision?: number): Promise<PublicationSummary> {
    frozen = clone(frozen); destination = clone(destination);
    await validateFrozen(frozen);
    if (!validID(requestID) || !validID(destination.contextID) || !['auxiliumos', 'moldo'].includes(destination.system) || expectedPublishedRevision !== undefined && (!Number.isSafeInteger(expectedPublishedRevision) || expectedPublishedRevision < 1)) fail('invalid-publication-identity');
    const artifact = await exportRevision(frozen, 'bundle'), files = readZIP(artifact.bytes);
    const request: PublicationRequest = { clientRequestID: requestID, sourceDocumentID: frozen.document.documentID, sourceRevision: frozen.document.revision, localSnapshotSHA256: frozen.hash, manifestSHA256: await sha256(files['manifest.json']), archiveSHA256: artifact.hash, archiveByteCount: artifact.bytes.length, destination: clone(destination), ...(expectedPublishedRevision === undefined ? {} : { expectedPublishedRevision }) };
    const record: OutboxRecord = { requestID, summary: { request, state: 'queued', attempts: 0, queuedAt: new Date(this.now()).toISOString() }, frozen: clone(frozen), archive: artifact.bytes.slice() };
    return this.store.transaction(['outbox'], 'readwrite', async tx => {
      const box = tx.objectStore('outbox'), existing = await idbRequest(box.get(requestID)) as OutboxRecord | undefined;
      if (existing) { if (!equal(existing.summary.request, request)) fail('publication-identity-conflict'); return clone(existing.summary); }
      await idbRequest(box.add(record)); return clone(record.summary);
    });
  }
  async list(): Promise<PublicationSummary[]> {
    const rows = await this.store.transaction(['outbox'], 'readonly', tx => idbRequest(tx.objectStore('outbox').getAll())) as OutboxRecord[];
    return rows.map(row => clone(row.summary));
  }
  async cancel(requestID: string): Promise<void> {
    await this.store.transaction(['outbox'], 'readwrite', async tx => {
      const box = tx.objectStore('outbox'), record = await idbRequest(box.get(requestID)) as OutboxRecord | undefined;
      if (!record) fail('publication-not-found'); if (record.summary.state === 'delivered') fail('accepted-delivery-cannot-be-recalled-locally');
      record.summary.state = 'cancelledLocally'; delete record.attemptID; delete record.leaseUntil; await idbRequest(box.put(record));
    });
  }
  private async begin(requestID: string): Promise<OutboxRecord> {
    return this.store.transaction(['outbox'], 'readwrite', async tx => {
      const box = tx.objectStore('outbox'), row = await idbRequest(box.get(requestID)) as OutboxRecord | undefined;
      if (!row) fail('publication-not-found');
      if (['delivered', 'cancelledLocally', 'denied', 'conflict'].includes(row.summary.state)) fail(`publication-${row.summary.state}`);
      if (row.attemptID && (row.leaseUntil ?? 0) > this.now()) fail('publication-busy');
      if (row.summary.attempts >= 100_000) fail('publication-attempt-limit');
      row.summary.attempts++; row.summary.state = 'delivering'; row.attemptID = crypto.randomUUID(); row.leaseUntil = this.now() + 60_000;
      await idbRequest(box.put(row)); return row;
    });
  }
  private async mutate(attempt: OutboxRecord, update: (current: OutboxRecord) => void, mustBeLive = true): Promise<void> {
    await this.store.transaction(['outbox'], 'readwrite', async tx => {
      const box = tx.objectStore('outbox'), current = await idbRequest(box.get(attempt.requestID)) as OutboxRecord | undefined;
      if (!current || current.attemptID !== attempt.attemptID || mustBeLive && (current.leaseUntil ?? 0) <= this.now()) fail('publication-lease-lost');
      if (!equal(current.summary.request, attempt.summary.request)) fail('publication-identity-conflict');
      update(current); await idbRequest(box.put(current));
    });
  }
  private async ready(attempt: OutboxRecord, authorization: PublicationAuthorization): Promise<void> {
    const request = attempt.summary.request;
    if (!authorization.handle || authorization.handle.length > 512 || authorization.requestID !== request.clientRequestID || !equal(authorization.destination, request.destination) || !Number.isFinite(authorization.expiresAt) || authorization.expiresAt <= this.now()) fail('authentication-required');
    await this.transport.assertAuthority(clone(request), clone(authorization));
    if (authorization.expiresAt <= this.now()) fail('authentication-required');
    await this.mutate(attempt, row => { row.leaseUntil = this.now() + 60_000; });
  }
  private reservation(value: PublicationReservation, attempt: OutboxRecord): void {
    if (!validID(value.publicationID) || !equal(value.request, attempt.summary.request)) fail('publication-identity-conflict');
  }
  private async accept(receipt: PublicationReceipt, attempt: OutboxRecord, authorization: PublicationAuthorization): Promise<void> {
    receipt = clone(receipt);
    if (!validID(receipt.receiptID) || !validID(receipt.publicationID) || !equal(receipt.request, attempt.summary.request) || !Number.isSafeInteger(receipt.acceptedRevision) || receipt.acceptedRevision < 1 || !Number.isFinite(Date.parse(receipt.acceptedAt)) || receipt.disposition !== 'internal-draft' || !receipt.proof || receipt.proof.length > 4096 || !await this.transport.authenticateReceipt(clone(receipt), clone(authorization))) fail('invalid-publication-receipt');
    await this.ready(attempt, authorization);
    await this.mutate(attempt, row => { row.summary.state = 'delivered'; row.summary.receipt = clone(receipt); delete row.summary.lastFailure; delete row.attemptID; delete row.leaseUntil; });
  }
  async deliver(requestID: string): Promise<{ state: string; failure?: string }> {
    if (!this.transport.connected) return { state: 'not-connected' };
    let attempt: OutboxRecord;
    try { attempt = await this.begin(requestID); } catch (error) { return { state: 'blocked', failure: error instanceof Error ? error.message : 'publication-failed' }; }
    try {
      const request = attempt.summary.request;
      if (request.clientRequestID !== attempt.requestID || !validID(request.clientRequestID) || !validID(request.sourceDocumentID) || !Number.isSafeInteger(request.sourceRevision) || request.sourceRevision < 1 || !request.destination || !validID(request.destination.contextID) || !['auxiliumos', 'moldo'].includes(request.destination.system) || request.expectedPublishedRevision !== undefined && (!Number.isSafeInteger(request.expectedPublishedRevision) || request.expectedPublishedRevision < 1) || [request.localSnapshotSHA256, request.manifestSHA256, request.archiveSHA256].some(value => !/^[a-f0-9]{64}$/.test(value))) fail('corrupt-outbox');
      await validateFrozen(attempt.frozen);
      if (attempt.frozen.hash !== request.localSnapshotSHA256 || attempt.frozen.document.documentID !== request.sourceDocumentID || attempt.frozen.document.revision !== request.sourceRevision || attempt.archive.length !== request.archiveByteCount || await sha256(attempt.archive) !== request.archiveSHA256) fail('corrupt-outbox');
      const members = readZIP(attempt.archive);
      if (await sha256(members['manifest.json']) !== request.manifestSHA256 || (strictJSON(members['manifest.json']) as Record<string, unknown>).revision !== request.sourceRevision) fail('corrupt-outbox');
      const auth = clone(await this.transport.authorize(clone(request))); await this.ready(attempt, auth);
      // Every retry reconciles first, covering receiver acceptance followed by tab/process death.
      let remote = clone(await this.transport.status(clone(request), clone(auth))); await this.ready(attempt, auth);
      if (remote.state === 'accepted') { await this.accept(remote.receipt, attempt, auth); return { state: 'delivered' }; }
      if (remote.state !== 'pending') {
        const reservation = remote.state === 'reserved' ? clone(remote.reservation) : clone(await this.transport.reserve(clone(request), clone(auth)));
        this.reservation(reservation, attempt); await this.ready(attempt, auth);
        await this.transport.upload(attempt.archive.slice(), clone(reservation), clone(auth)); await this.ready(attempt, auth);
        remote = clone(await this.transport.finalize(clone(reservation), clone(auth))); await this.ready(attempt, auth);
        if (remote.state === 'accepted') { await this.accept(remote.receipt, attempt, auth); return { state: 'delivered' }; }
      }
      if (remote.state !== 'pending') fail('transient-failure');
      this.reservation(remote.reservation, attempt);
      await this.mutate(attempt, row => { row.summary.state = 'awaitingReceipt'; delete row.attemptID; delete row.leaseUntil; });
      return { state: 'awaitingReceipt' };
    } catch (error) {
      const known = ['authentication-required', 'authority-denied', 'revision-conflict', 'invalid-publication-receipt', 'publication-identity-conflict', 'corrupt-outbox', 'publication-lease-lost'];
      const failure = error instanceof Error && known.includes(error.message) ? error.message : 'transient-failure';
      const state: PublicationState = failure === 'authentication-required' ? 'needsAuthentication' : failure === 'authority-denied' ? 'denied' : failure === 'revision-conflict' ? 'conflict' : 'retryableFailure';
      await this.mutate(attempt, row => { row.summary.state = state; row.summary.lastFailure = failure; delete row.attemptID; delete row.leaseUntil; }).catch(() => {});
      return { state: 'blocked', failure };
    }
  }
}
