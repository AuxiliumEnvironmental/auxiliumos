import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DrawingRecoveryStore, type DrawingRecoveryPayload, type DrawingRecoveryRecord } from '../data/drawingRecovery';
import type { SpatialWebStore } from '../data';
import type { SpatialDocument } from '../types';

type Offer = { state: 'ready' | 'stale'; record: DrawingRecoveryRecord };
type Status = 'idle' | 'checking' | 'offered' | 'saving' | 'saved' | 'failed';
type View = { key: string; status: Status; error: string; offer: Offer | null; active: boolean; blocked: boolean; reviewBusy: boolean; initialDraft?: DrawingRecoveryPayload; resumeKey: string };
type Binding = {
  key: string; alive: boolean; document: SpatialDocument; api: DrawingRecoveryStore;
  token: string | null; writerID: string; payload: DrawingRecoveryPayload | null;
  floorID: string; acknowledged: string | null; failure: string; blocked: boolean;
  sequence: number; queue: Promise<void>; current: () => boolean; reviewing: boolean;
};
type Inputs = {
  document: SpatialDocument | null; scope: string;
  getStore: () => SpatialWebStore | null; getGeneration: () => number;
  assertAccess: (generation: number) => Promise<void>;
};
const message = (cause: unknown) => cause instanceof Error ? cause.message : String(cause);
const empty = (key: string): View => ({ key, status: 'idle', error: '', offer: null, active: false, blocked: false, reviewBusy: false, resumeKey: 'fresh' });
const signature = (payload: DrawingRecoveryPayload) => JSON.stringify(payload);

/** Persist completed drawing samples separately from the canonical geometry.
 * Pointer previews never enter this hook. A saved checkpoint is recoverable
 * input, not a new geometry revision or permission to rebase it.
 */
export function useDrawingRecovery(inputs: Inputs) {
  const inputRef = useRef(inputs); inputRef.current = inputs;
  const binding = useRef<Binding | null>(null);
  const [readVersion, setReadVersion] = useState(0);
  const key = inputs.document ? JSON.stringify([inputs.scope, inputs.document.documentID, inputs.document.revision, readVersion]) : '';
  const [view, setView] = useState<View>(() => empty(key));
  const update = (owner: Binding, change: Partial<View>) => {
    if (owner.current()) setView(previous => previous.key === owner.key ? { ...previous, ...change } : previous);
  };

  useLayoutEffect(() => {
    const document = inputRef.current.document;
    const store = inputRef.current.getStore();
    if (!document || !store) { binding.current = null; setView(empty(key)); return; }
    const generation = inputRef.current.getGeneration(), scope = inputRef.current.scope;
    let owner: Binding;
    const current = () => owner.alive && binding.current === owner && inputRef.current.scope === scope && inputRef.current.getGeneration() === generation && inputRef.current.document?.documentID === document.documentID && inputRef.current.document?.revision === document.revision;
    const api = new DrawingRecoveryStore(store, { assertAccess: () => inputRef.current.assertAccess(generation), isCurrent: current });
    owner = { key, alive: true, document, api, token: null, writerID: crypto.randomUUID(), payload: null, floorID: '', acknowledged: null, failure: '', blocked: true, sequence: 0, queue: Promise.resolve(), current, reviewing: false };
    binding.current = owner;
    setView({ ...empty(key), status: 'checking', blocked: true });
    owner.queue = (async () => {
      try {
        const result = await api.read(document);
        if (!current()) return;
        owner.blocked = result.state !== 'none';
        if (result.state === 'none') update(owner, { status: 'idle', blocked: false });
        else { owner.token = result.record.token; update(owner, { status: 'offered', offer: result, blocked: true }); }
      } catch (cause) {
        if (!current()) return;
        owner.failure = message(cause);
        update(owner, { status: 'failed', error: `Unfinished drawing recovery could not be opened: ${owner.failure}`, blocked: true });
      }
    })();
    return () => { owner.alive = false; if (binding.current === owner) binding.current = null; };
  }, [key]);

  function change(floorID: string, payload: DrawingRecoveryPayload | null) {
    const owner = binding.current;
    if (!owner?.current() || owner.blocked) return;
    const copied = payload ? structuredClone(payload) : null;
    const nextSignature = copied ? signature(copied) : null;
    if (owner.floorID === floorID && nextSignature === (owner.payload ? signature(owner.payload) : null) && !owner.failure) return;
    owner.payload = copied; owner.floorID = floorID; owner.failure = '';
    const sequence = ++owner.sequence;
    update(owner, { status: 'saving', active: copied !== null || owner.token !== null, error: '' });
    owner.queue = owner.queue.then(async () => {
      if (!owner.current() || owner.blocked) return;
      try {
        if (copied) {
          const record = await owner.api.save(owner.document, floorID, copied, { expectedToken: owner.token, writerID: owner.writerID });
          if (!owner.current()) return;
          owner.token = record.token; owner.acknowledged = nextSignature;
        } else {
          if (owner.token) await owner.api.discard(owner.document.documentID, owner.token);
          if (!owner.current()) return;
          owner.token = null; owner.acknowledged = null;
        }
        if (sequence === owner.sequence) { owner.failure = ''; update(owner, { status: copied ? 'saved' : 'idle', active: copied !== null, error: '' }); }
      } catch (cause) {
        if (!owner.current()) return;
        owner.failure = message(cause);
        // A compare-and-swap or base mismatch requires an explicit reread. Never
        // replace another tab's checkpoint or silently adopt a newer revision.
        if (/conflict|stale|mismatch|corrupt|integrity/.test(owner.failure)) owner.blocked = true;
        update(owner, { status: 'failed', active: copied !== null || owner.token !== null, blocked: owner.blocked, error: `Unfinished drawing is not saved for recovery: ${owner.failure}` });
      }
    });
  }

  async function flush(): Promise<{ token: string } | undefined> {
    const owner = binding.current;
    if (!owner?.current()) throw new Error('Workspace context changed. The drawing was not applied.');
    const sequence = owner.sequence;
    let pending: Promise<void>;
    do { pending = owner.queue; await pending; } while (pending !== owner.queue && owner.current());
    if (!owner.current()) throw new Error('Workspace context changed. The drawing was not applied.');
    if (sequence !== owner.sequence) throw new Error('The unfinished drawing changed while saving. Review it and choose Finish again.');
    if (owner.blocked || owner.failure) throw new Error(owner.failure || 'Review the saved unfinished drawing before editing.');
    if (!owner.payload) return;
    if (!owner.token || owner.acknowledged !== signature(owner.payload)) throw new Error('Wait until this unfinished drawing is saved for recovery, then finish it.');
    return { token: owner.token };
  }

  async function resume(): Promise<DrawingRecoveryRecord | undefined> {
    const owner = binding.current;
    if (!owner?.current() || owner.reviewing) return;
    owner.reviewing = true; update(owner, { reviewBusy: true });
    await owner.queue;
    try {
      const result = await owner.api.read(owner.document);
      if (!owner.current()) return;
      if (result.state !== 'ready' || result.record.token !== owner.token) {
        if (result.state !== 'none') { owner.token = result.record.token; update(owner, { status: 'offered', offer: result, error: 'The saved recovery changed. Review it before continuing.', blocked: true }); }
        else { owner.token = null; owner.blocked = false; update(owner, { ...empty(owner.key) }); }
        return;
      }
      const record = result.record;
      owner.payload = structuredClone(record.payload); owner.floorID = record.floorID; owner.acknowledged = signature(record.payload); owner.failure = ''; owner.blocked = false;
      update(owner, { status: 'saved', offer: null, active: true, blocked: false, error: '', initialDraft: structuredClone(record.payload), resumeKey: record.token });
      return record;
    } catch (cause) { if (owner.current()) update(owner, { error: `Recovery could not be resumed: ${message(cause)}` }); }
    finally { owner.reviewing = false; update(owner, { reviewBusy: false }); }
    return undefined;
  }

  async function discard(): Promise<boolean> {
    const owner = binding.current;
    if (!owner?.current() || owner.reviewing) return false;
    owner.reviewing = true; update(owner, { reviewBusy: true });
    await owner.queue;
    try {
      if (owner.token) await owner.api.discard(owner.document.documentID, owner.token);
      if (!owner.current()) return false;
      owner.token = null; owner.payload = null; owner.acknowledged = null; owner.failure = ''; owner.blocked = false; owner.sequence++;
      setView({ ...empty(owner.key), resumeKey: crypto.randomUUID() });
      return true;
    } catch (cause) { if (owner.current()) update(owner, { status: 'failed', error: `Recovery could not be discarded: ${message(cause)}`, blocked: true }); return false; }
    finally { owner.reviewing = false; update(owner, { reviewBusy: false }); }
  }

  function consumed(token: string) {
    const owner = binding.current;
    if (!owner?.current() || owner.token !== token) return;
    owner.token = null; owner.payload = null; owner.acknowledged = null; owner.failure = ''; owner.sequence++;
    update(owner, { status: 'idle', active: false, error: '', initialDraft: undefined });
  }

  function retry() {
    const owner = binding.current;
    if (!owner?.current() || owner.blocked) return;
    const payload = owner.payload ? structuredClone(owner.payload) : null;
    owner.failure = owner.failure || 'retry';
    change(owner.floorID, payload);
  }

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      const owner = binding.current;
      if (owner?.current() && !owner.blocked && (owner.failure || (owner.payload ? owner.acknowledged !== signature(owner.payload) : owner.token !== null))) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const shown = view.key === key ? view : { ...empty(key), status: 'checking' as const, blocked: !!inputs.document };
  return { ...shown, change, flush, resume, discard, consumed, retry, refresh: () => setReadVersion(value => value + 1) };
}
