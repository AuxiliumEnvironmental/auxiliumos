import { applyCommands, requireValidDocument, restorationMappings } from '../core';
import type { EditCommand, FrozenRevision, SpatialDocument, StoredWorkspace, WorkspaceSummary } from '../types';
import { clone, fail, jsonBytes, MAX_MEMBER, sha256, stableJSON } from './bytes';

interface DraftRecord { documentID: string; document: SpatialDocument; hash: string; historyHash: string; undo: SpatialDocument[]; redo: SpatialDocument[]; updatedAt: string; receipt?: StoredWorkspace['receipt'] }
export interface SavedRevision { key: string; documentID: string; revision: number; frozen: FrozenRevision }
const request = <T>(req: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error ?? new Error('storage-request-failed')); });
const completed = (tx: IDBTransaction): Promise<void> => new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error ?? new Error('storage-transaction-aborted')); tx.onerror = () => { /* onabort owns failure */ }; });
export class SpatialWebStore {
  private readonly database: Promise<IDBDatabase>;
  private closed = false;
  constructor(readonly namespace: string) {
    if (!namespace || namespace.length > 256 || /[\u0000-\u001f]/.test(namespace)) fail('invalid-storage-namespace');
    this.database = new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) { reject(new Error('durable-storage-unavailable')); return; }
      const opening = indexedDB.open(`auxilium-spatial-v1:${namespace}`, 1);
      opening.onupgradeneeded = () => {
        for (const [name, keyPath] of [['drafts', 'documentID'], ['revisions', 'key'], ['outbox', 'requestID']] as const) opening.result.createObjectStore(name, { keyPath });
      };
      opening.onerror = () => reject(opening.error ?? new Error('storage-open-failed'));
      opening.onblocked = () => { this.closed = true; reject(new Error('storage-upgrade-blocked-close-other-tabs')); };
      opening.onsuccess = () => {
        const db = opening.result;
        if (this.closed) { db.close(); reject(new Error('store-closed')); return; }
        db.onversionchange = () => { this.closed = true; db.close(); };
        resolve(db);
      };
    });
  }
  async transaction<T>(stores: string[], mode: IDBTransactionMode, action: (tx: IDBTransaction) => Promise<T>): Promise<T> {
    const db = await this.database; if (this.closed) fail('store-closed');
    const tx = db.transaction(stores, mode, mode === 'readwrite' ? { durability: 'strict' } : undefined);
    const done = completed(tx);
    try { const value = await action(tx); await done; return value; }
    catch (error) { try { tx.abort(); } catch { /* transaction already terminated */ } await done.catch(() => {}); throw error; }
  }
  private async record(documentID: string): Promise<DraftRecord> {
    const row = await this.transaction(['drafts'], 'readonly', tx => request(tx.objectStore('drafts').get(documentID))) as DraftRecord | undefined;
    if (!row) fail('document-not-found');
    requireValidDocument(row.document);
    if (await sha256(jsonBytes(row.document)) !== row.hash || row.documentID !== row.document.documentID || !Array.isArray(row.undo) || !Array.isArray(row.redo) || row.undo.length > 100 || row.redo.length > 100) fail('corrupt-local-document');
    if (!Number.isFinite(Date.parse(row.updatedAt)) || await sha256(jsonBytes({ undo: row.undo, redo: row.redo, receipt: row.receipt })) !== row.historyHash) fail('corrupt-local-history');
    return row;
  }
  private workspace(row: DraftRecord): StoredWorkspace { return clone({ document: row.document, canUndo: !!row.undo.length, canRedo: !!row.redo.length, updatedAt: row.updatedAt, ...(row.receipt ? { receipt: row.receipt } : {}) }); }
  async list(): Promise<WorkspaceSummary[]> {
    const rows = await this.transaction(['drafts'], 'readonly', tx => request(tx.objectStore('drafts').getAll())) as DraftRecord[];
    return rows.map(row => ({ documentID: row.documentID, title: row.document.title, revision: row.document.revision, updatedAt: row.updatedAt })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async create(document: SpatialDocument): Promise<StoredWorkspace> {
    document = clone(requireValidDocument(document));
    const bytes = jsonBytes(document); if (bytes.length > MAX_MEMBER) fail('document-size-limit');
    const row: DraftRecord = { documentID: document.documentID, document, hash: await sha256(bytes), historyHash: await sha256(jsonBytes({ undo: [], redo: [] })), undo: [], redo: [], updatedAt: new Date().toISOString() };
    await this.transaction(['drafts'], 'readwrite', async tx => {
      const drafts = tx.objectStore('drafts'); if (await request(drafts.get(row.documentID))) fail('document-already-exists'); await request(drafts.add(row));
    });
    return this.workspace(row);
  }
  async open(documentID: string): Promise<StoredWorkspace> { return this.workspace(await this.record(documentID)); }
  private async commit(row: DraftRecord, expectedRevision: number): Promise<StoredWorkspace> {
    const expectedHash = row.hash, expectedHistoryHash = row.historyHash;
    const bytes = jsonBytes(row.document); if (bytes.length > MAX_MEMBER) fail('document-size-limit');
    // History is recoverable editing convenience, bounded separately from immutable saved versions.
    for (const key of ['undo', 'redo'] as const) while (row[key].length > 1 && jsonBytes(row[key]).length > 16 * 1024 * 1024) row[key].shift();
    row.hash = await sha256(bytes); row.historyHash = await sha256(jsonBytes({ undo: row.undo, redo: row.redo, receipt: row.receipt })); row.updatedAt = new Date().toISOString();
    await this.transaction(['drafts'], 'readwrite', async tx => {
      const drafts = tx.objectStore('drafts'), current = await request(drafts.get(row.documentID)) as DraftRecord | undefined;
      if (!current || current.document.revision !== expectedRevision || current.hash !== expectedHash || current.historyHash !== expectedHistoryHash) fail('revision-conflict'); await request(drafts.put(row));
    });
    return this.workspace(row);
  }
  async apply(documentID: string, expectedRevision: number, commands: EditCommand[]): Promise<StoredWorkspace> {
    commands = clone(commands);
    const row = await this.record(documentID);
    if (row.document.revision !== expectedRevision) fail('revision-conflict');
    const result = applyCommands(row.document, commands, expectedRevision);
    row.undo = [...row.undo, clone(row.document)].slice(-100); row.redo = []; row.document = result.document; row.receipt = result.receipt;
    return this.commit(row, expectedRevision);
  }
  private async history(documentID: string, expectedRevision: number, direction: 'undo' | 'redo'): Promise<StoredWorkspace> {
    const row = await this.record(documentID); if (row.document.revision !== expectedRevision) fail('revision-conflict');
    const target = row[direction].pop(); if (!target) fail(`nothing-to-${direction}`);
    if (expectedRevision >= Number.MAX_SAFE_INTEGER) fail('revision-limit');
    requireValidDocument(target); if (target.documentID !== documentID) fail('corrupt-history');
    const opposite = direction === 'undo' ? 'redo' : 'undo'; row[opposite] = [...row[opposite], clone(row.document)].slice(-100);
    const source = row.document;
    row.document = { ...target, parentRevision: expectedRevision, revision: expectedRevision + 1, reviewState: 'needsReview' };
    requireValidDocument(row.document); row.receipt = { sourceRevision: expectedRevision, resultingRevision: row.document.revision, mappings: restorationMappings(source, row.document) };
    return this.commit(row, expectedRevision);
  }
  async undo(documentID: string, expectedRevision: number): Promise<StoredWorkspace> { return this.history(documentID, expectedRevision, 'undo'); }
  async redo(documentID: string, expectedRevision: number): Promise<StoredWorkspace> { return this.history(documentID, expectedRevision, 'redo'); }
  async freeze(documentID: string, expectedRevision: number): Promise<FrozenRevision> {
    const row = await this.record(documentID); if (row.document.revision !== expectedRevision) fail('revision-conflict');
    const bytes = jsonBytes(row.document), frozen: FrozenRevision = { document: row.document, hash: await sha256(bytes), bytes, createdAt: new Date().toISOString() };
    await this.transaction(['revisions'], 'readwrite', async tx => {
      const revisions = tx.objectStore('revisions'), key = `${documentID}:${expectedRevision}`, current = await request(revisions.get(key)) as SavedRevision | undefined;
      if (current && (current.frozen.hash !== frozen.hash || stableJSON(current.frozen.document) !== stableJSON(frozen.document))) fail('immutable-revision-conflict');
      if (!current) await request(revisions.add({ key, documentID, revision: expectedRevision, frozen } satisfies SavedRevision));
    });
    return clone(frozen);
  }
  async revisions(documentID: string): Promise<FrozenRevision[]> {
    const rows = await this.transaction(['revisions'], 'readonly', tx => request(tx.objectStore('revisions').getAll())) as SavedRevision[];
    const result = rows.filter(row => row.documentID === documentID).sort((a, b) => b.revision - a.revision).map(row => row.frozen);
    for (const frozen of result) await validateFrozen(frozen);
    return clone(result);
  }
  async listRevisions(documentID: string): Promise<FrozenRevision[]> { return this.revisions(documentID); }
  async loadFrozen(documentID: string, revision: number): Promise<FrozenRevision> {
    const row = await this.transaction(['revisions'], 'readonly', tx => request(tx.objectStore('revisions').get(`${documentID}:${revision}`))) as SavedRevision | undefined;
    if (!row) fail('frozen-revision-not-found'); await validateFrozen(row.frozen); return clone(row.frozen);
  }
  async restore(documentID: string, sourceRevision: number, expectedRevision: number): Promise<StoredWorkspace> {
    const frozen = await this.loadFrozen(documentID, sourceRevision), row = await this.record(documentID);
    if (row.document.revision !== expectedRevision) fail('revision-conflict');
    if (expectedRevision >= Number.MAX_SAFE_INTEGER) fail('revision-limit');
    const source = row.document;
    row.undo = [...row.undo, clone(source)].slice(-100); row.redo = [];
    row.document = { ...clone(frozen.document), parentRevision: expectedRevision, revision: expectedRevision + 1, reviewState: 'needsReview' };
    row.receipt = { sourceRevision: expectedRevision, resultingRevision: row.document.revision, mappings: restorationMappings(source, row.document) };
    return this.commit(row, expectedRevision);
  }
  close(): void { this.closed = true; void this.database.then(db => db.close()).catch(() => {}); }
}
export async function validateFrozen(frozen: FrozenRevision): Promise<void> {
  requireValidDocument(frozen.document);
  if (!(frozen.bytes instanceof Uint8Array) || frozen.bytes.length !== jsonBytes(frozen.document).length || stableJSON(frozen.document) !== new TextDecoder().decode(frozen.bytes) || await sha256(frozen.bytes) !== frozen.hash) fail('frozen-revision-mismatch');
}
export { request as idbRequest };
