import type { SpatialWebStore } from './store';
import type { Opening, Point2, SpatialDocument } from '../types';
import { EPSILON, distance, pathLength, wallPath } from '../core/geometry';
import { requireValidDocument, validID } from '../core/validation';
import { clone, fail, jsonBytes, MAX_MEMBER, sha256, stableJSON } from './bytes';

export type DrawingRecoveryPoint = Point2 & { nodeID?: string };
export type DrawingRecoveryPayload =
  | { tool: 'wall' | 'area' | 'room'; points: DrawingRecoveryPoint[] }
  | { tool: 'opening'; opening: Opening; point: Point2 };
export interface DrawingRecoveryRecord {
  formatVersion: 1;
  namespace: string;
  documentID: string;
  floorID: string;
  baseRevision: number;
  baseSHA256: string;
  token: string;
  writerID: string;
  updatedAt: string;
  payload: DrawingRecoveryPayload;
  recordSHA256: string;
}
export type DrawingRecoveryRead = { state: 'none' } | { state: 'ready' | 'stale'; record: DrawingRecoveryRecord };
export interface DrawingRecoveryAuthority { assertAccess(): Promise<void>; isCurrent(): boolean }
export interface DrawingRecoveryWrite { expectedToken: string | null; writerID: string }
export const DRAWING_RECOVERY_STORE = 'drawingRecovery';
export const MAX_DRAWING_RECOVERY_BYTES = 512 * 1024;
// An unfinished opening may lie past the canonical 10,000 offset limit on a
// valid long host path. Retain that blocked preview; Finish still uses the
// unchanged canonical validator. References further bound it to its own host.
const MAX_RECOVERY_OFFSET = 1000 * 20000 * Math.SQRT2;

const digest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const recordError = () => fail('corrupt-drawing-recovery');
const request = <T>(value: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error ?? new Error('drawing-recovery-storage-failed')); });
function object(value: unknown, required: string[], optional: string[] = []): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) return false;
  const keys = Object.keys(value); return required.every(key => Object.hasOwn(value, key)) && keys.every(key => required.includes(key) || optional.includes(key));
}
const finite = (value: unknown, low: number, high: number) => typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high;
function point(value: unknown, node = false): value is DrawingRecoveryPoint {
  return object(value, ['x', 'z'], node ? ['nodeID'] : []) && finite(value.x, -10000, 10000) && finite(value.z, -10000, 10000) && (!Object.hasOwn(value, 'nodeID') || validID(value.nodeID));
}
function provenance(value: unknown): boolean {
  if (!object(value, ['origin', 'sourceIDs', 'classificationConfidence']) || !['captured', 'edited', 'inferred', 'synthetic'].includes(value.origin as string) || !['low', 'medium', 'high', 'unknown'].includes(value.classificationConfidence as string) || !Array.isArray(value.sourceIDs) || value.sourceIDs.length > 1000) return false;
  const ids = value.sourceIDs;
  return Array.from({ length: ids.length }, (_, i) => Object.hasOwn(ids, i) && validID(ids[i])).every(Boolean);
}
function opening(value: unknown): value is Opening {
  return object(value, ['id', 'wallID', 'kind', 'offset', 'width', 'bottom', 'height', 'provenance']) && validID(value.id) && validID(value.wallID) && ['door', 'window', 'passage'].includes(value.kind as string) && finite(value.offset, -10000, MAX_RECOVERY_OFFSET) && finite(value.width, 0, 10000) && (value.width as number) > 0 && finite(value.bottom, 0, 100) && finite(value.height, 0, 100) && (value.height as number) > 0 && provenance(value.provenance);
}
/** Recovery admits unfinished shapes; final geometry still goes through commands. */
export function validateDrawingRecoveryPayload(value: unknown): DrawingRecoveryPayload {
  if (object(value, ['tool', 'opening', 'point']) && value.tool === 'opening' && opening(value.opening) && point(value.point)) return clone(value as unknown as DrawingRecoveryPayload);
  if (!object(value, ['tool', 'points']) || !['wall', 'area', 'room'].includes(value.tool as string) || !Array.isArray(value.points)) fail('invalid-drawing-recovery-payload');
  const maximum = value.tool === 'wall' ? 1001 : value.tool === 'area' ? 1000 : 2;
  if (!value.points.length || value.points.length > maximum) fail('invalid-drawing-recovery-payload');
  const seen = new Map<string, Point2>();
  for (let i = 0; i < value.points.length; i++) {
    const sample = value.points[i]; if (!Object.hasOwn(value.points, i) || !point(sample, true)) fail('invalid-drawing-recovery-payload');
    if (sample.nodeID) { const previous = seen.get(sample.nodeID); if (previous && distance(previous, sample) > EPSILON) fail('invalid-drawing-recovery-payload'); seen.set(sample.nodeID, sample); }
  }
  return clone(value as unknown as DrawingRecoveryPayload);
}
function validateRecordShape(value: unknown, namespace: string, documentID: string): DrawingRecoveryRecord {
  if (!object(value, ['formatVersion', 'namespace', 'documentID', 'floorID', 'baseRevision', 'baseSHA256', 'token', 'writerID', 'updatedAt', 'payload', 'recordSHA256'])) recordError();
  const row = value as unknown as DrawingRecoveryRecord;
  if (row.formatVersion !== 1 || row.namespace !== namespace || row.documentID !== documentID || !validID(row.documentID) || !validID(row.floorID) || !validID(row.token) || !validID(row.writerID) || !Number.isSafeInteger(row.baseRevision) || row.baseRevision < 1 || !digest(row.baseSHA256) || !digest(row.recordSHA256) || typeof row.updatedAt !== 'string' || !Number.isFinite(Date.parse(row.updatedAt)) || new Date(row.updatedAt).toISOString() !== row.updatedAt) recordError();
  try { validateDrawingRecoveryPayload(row.payload); } catch { recordError(); }
  if (jsonBytes(row).length > MAX_DRAWING_RECOVERY_BYTES) recordError();
  return row;
}
const recordBody = ({ recordSHA256: _hash, ...body }: DrawingRecoveryRecord) => body;
async function validateRecord(value: unknown, namespace: string, documentID: string): Promise<DrawingRecoveryRecord | undefined> {
  if (value === undefined) return;
  const row = validateRecordShape(value, namespace, documentID);
  if (await sha256(jsonBytes(recordBody(row))) !== row.recordSHA256) recordError();
  return clone(row);
}
function validateReferences(payload: DrawingRecoveryPayload, document: SpatialDocument, floorID: string): void {
  const floor = document.floors.find(floor => floor.id === floorID); if (!floor) fail('drawing-recovery-floor-missing');
  if (payload.tool === 'opening') {
    const host = floor.walls.find(wall => wall.id === payload.opening.wallID);
    if (!host || [...floor.walls, ...floor.openings, ...floor.rooms, ...(floor.areas ?? [])].some(item => item.id === payload.opening.id)) fail('drawing-recovery-reference-mismatch');
    if (payload.opening.offset < -payload.opening.width - EPSILON || payload.opening.offset > pathLength(wallPath(floor, host)) + EPSILON) fail('drawing-recovery-reference-mismatch');
  } else {
    const nodes = new Map(floor.nodes.map(node => [node.id, node.point]));
    for (const sample of payload.points) { const saved = sample.nodeID ? nodes.get(sample.nodeID) : undefined; if (saved && distance(saved, sample) > EPSILON) fail('drawing-recovery-reference-mismatch'); }
  }
}
interface SavedGeometry { documentID: string; document: SpatialDocument; hash: string }
async function geometry(value: unknown, documentID: string): Promise<SavedGeometry> {
  if (!value || typeof value !== 'object') fail('document-not-found');
  const row = value as SavedGeometry;
  if (row.documentID !== documentID || !digest(row.hash)) fail('corrupt-local-document');
  const document = requireValidDocument(row.document); if (document.documentID !== documentID) fail('corrupt-local-document');
  const bytes = jsonBytes(document); if (bytes.length > MAX_MEMBER || await sha256(bytes) !== row.hash) fail('corrupt-local-document');
  return { documentID, document, hash: row.hash };
}
function sameRecovery(actual: unknown, expected: DrawingRecoveryRecord | undefined, namespace: string, documentID: string): boolean {
  if (actual === undefined || expected === undefined) return actual === expected;
  validateRecordShape(actual, namespace, documentID);
  return stableJSON(actual) === stableJSON(expected);
}
function sameGeometry(actual: unknown, expected: SavedGeometry): boolean {
  if (!actual || typeof actual !== 'object') return false;
  const row = actual as SavedGeometry;
  return row.documentID === expected.documentID && row.hash === expected.hash && row.document?.revision === expected.document.revision && stableJSON(row.document) === stableJSON(expected.document);
}

/**
 * Separate unfinished samples, never a layout snapshot, export or remote upload.
 * The supplied authority belongs to the current host scope and is checked again
 * after asynchronous work and immediately before each mutation.
 */
export class DrawingRecoveryStore {
  readonly namespace: string;
  constructor(private readonly store: SpatialWebStore, private readonly authority: DrawingRecoveryAuthority) {
    this.namespace = store.namespace;
    if (!authority || typeof authority.assertAccess !== 'function' || typeof authority.isCurrent !== 'function') fail('drawing-recovery-authority-required');
  }
  private current(): void { if (!this.authority.isCurrent()) fail('drawing-recovery-authority-changed'); }
  private async access(): Promise<void> { this.current(); await this.authority.assertAccess(); this.current(); }
  private async readRows(documentID: string): Promise<{ saved: SavedGeometry; record: DrawingRecoveryRecord | undefined }> {
    if (!validID(documentID)) fail('invalid-drawing-recovery-document');
    const rows = await this.store.transaction(['drafts', DRAWING_RECOVERY_STORE], 'readonly', async tx => {
      this.current(); const saved = await request(tx.objectStore('drafts').get(documentID)); const record = await request(tx.objectStore(DRAWING_RECOVERY_STORE).get(documentID)); this.current(); return { saved, record };
    });
    const [saved, record] = await Promise.all([geometry(rows.saved, documentID), validateRecord(rows.record, this.namespace, documentID)]); this.current(); return { saved, record };
  }
  async read(document: SpatialDocument): Promise<DrawingRecoveryRead> {
    document = requireValidDocument(document); await this.access();
    const { saved, record } = await this.readRows(document.documentID); if (!record) { await this.access(); return { state: 'none' }; }
    const hash = await sha256(jsonBytes(document)); await this.access();
    const ready = saved.hash === hash && saved.document.revision === document.revision && record.baseRevision === document.revision && record.baseSHA256 === hash && document.floors.some(floor => floor.id === record.floorID);
    if (ready) validateReferences(record.payload, document, record.floorID);
    return { state: ready ? 'ready' : 'stale', record: clone(record) };
  }
  async save(document: SpatialDocument, floorID: string, payload: DrawingRecoveryPayload, options: DrawingRecoveryWrite): Promise<DrawingRecoveryRecord> {
    document = requireValidDocument(document); payload = validateDrawingRecoveryPayload(payload); options = clone(options);
    if (!validID(floorID) || !object(options, ['expectedToken', 'writerID']) || options.expectedToken !== null && !validID(options.expectedToken) || !validID(options.writerID)) fail('invalid-drawing-recovery-write');
    validateReferences(payload, document, floorID); await this.access();
    const hash = await sha256(jsonBytes(document)), { saved, record } = await this.readRows(document.documentID);
    if (saved.hash !== hash || saved.document.revision !== document.revision) fail('drawing-recovery-stale-base');
    if ((record?.token ?? null) !== options.expectedToken) fail('drawing-recovery-conflict');
    if (record && (record.baseRevision !== document.revision || record.baseSHA256 !== hash || record.floorID !== floorID)) fail('drawing-recovery-stale-base');
    const body = { formatVersion: 1 as const, namespace: this.namespace, documentID: document.documentID, floorID, baseRevision: document.revision, baseSHA256: hash, token: crypto.randomUUID(), writerID: options.writerID, updatedAt: new Date().toISOString(), payload };
    const next: DrawingRecoveryRecord = { ...body, recordSHA256: await sha256(jsonBytes(body)) };
    if (jsonBytes(next).length > MAX_DRAWING_RECOVERY_BYTES) fail('drawing-recovery-size-limit');
    await this.access();
    await this.store.transaction(['drafts', DRAWING_RECOVERY_STORE], 'readwrite', async tx => {
      this.current(); const currentGeometry = await request(tx.objectStore('drafts').get(document.documentID)); const table = tx.objectStore(DRAWING_RECOVERY_STORE), currentRecord = await request(table.get(document.documentID)); this.current();
      if (!sameGeometry(currentGeometry, saved)) fail('drawing-recovery-stale-base');
      if (!sameRecovery(currentRecord, record, this.namespace, document.documentID)) fail('drawing-recovery-conflict');
      await request(table.put(next)); this.current();
    });
    this.current(); return clone(next);
  }
  async discard(documentID: string, expectedToken: string): Promise<void> {
    if (!validID(documentID) || !validID(expectedToken)) fail('invalid-drawing-recovery-write'); await this.access();
    const { record } = await this.readRows(documentID); if (!record || record.token !== expectedToken) fail('drawing-recovery-conflict');
    await this.access();
    await this.store.transaction([DRAWING_RECOVERY_STORE], 'readwrite', async tx => {
      this.current(); const table = tx.objectStore(DRAWING_RECOVERY_STORE), currentRecord = await request(table.get(documentID)); this.current();
      if (!sameRecovery(currentRecord, record, this.namespace, documentID)) fail('drawing-recovery-conflict');
      await request(table.delete(documentID)); this.current();
    });
  }
}

/** SHA validation happens before the editor opens its mutating transaction. */
export async function prepareDrawingRecoveryClear(store: SpatialWebStore, namespace: string, documentID: string, expectedToken: string): Promise<DrawingRecoveryRecord> {
  if (namespace !== store.namespace || !validID(documentID) || !validID(expectedToken)) fail('invalid-drawing-recovery-write');
  const rows = await store.transaction(['drafts', DRAWING_RECOVERY_STORE], 'readonly', async tx => ({ saved: await request(tx.objectStore('drafts').get(documentID)), record: await request(tx.objectStore(DRAWING_RECOVERY_STORE).get(documentID)) }));
  const [saved, record] = await Promise.all([geometry(rows.saved, documentID), validateRecord(rows.record, namespace, documentID)]);
  if (!record || record.token !== expectedToken) fail('drawing-recovery-conflict');
  if (saved.document.revision !== record.baseRevision || saved.hash !== record.baseSHA256 || !saved.document.floors.some(floor => floor.id === record.floorID)) fail('drawing-recovery-stale-base');
  return clone(record);
}

/**
 * Called only inside the editor's transaction containing both object stores.
 * No crypto await may outlive an IndexedDB transaction. The prepared snapshot was
 * SHA-validated before this transaction; this final gate compares every field,
 * the exact token and the still-current saved geometry base before deleting it.
 * A mismatch aborts the entire edit instead of erasing a different saved draft.
 */
export async function clearDrawingRecoveryInTransaction(tx: IDBTransaction, namespace: string, documentID: string, expectedToken: string, prepared: DrawingRecoveryRecord): Promise<void> {
  if (!validID(documentID) || !validID(expectedToken)) fail('invalid-drawing-recovery-write');
  const table = tx.objectStore(DRAWING_RECOVERY_STORE), raw = await request(table.get(documentID));
  if (raw === undefined) fail('drawing-recovery-conflict');
  const record = validateRecordShape(raw, namespace, documentID);
  if (!prepared || prepared.token !== expectedToken || record.token !== expectedToken || !sameRecovery(raw, prepared, namespace, documentID)) fail('drawing-recovery-conflict');
  const saved = await request(tx.objectStore('drafts').get(documentID)) as SavedGeometry | undefined;
  if (!saved || saved.documentID !== documentID || saved.document?.revision !== record.baseRevision || saved.hash !== record.baseSHA256 || !saved.document.floors.some(floor => floor.id === record.floorID)) fail('drawing-recovery-stale-base');
  await request(table.delete(documentID));
}
