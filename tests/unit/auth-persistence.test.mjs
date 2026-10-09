import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

// Execute the production storage adapter, not a reimplementation. Only the
// browser Storage surface is simulated; this is not Auth or browser acceptance.
const moduleUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const transpile = (source) => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const errorsUrl = moduleUrl(transpile(await readFile(new URL('../../web/src/lib/errors.ts', import.meta.url), 'utf8')));
const adapter = transpile(await readFile(new URL('../../web/src/lib/auth-storage.ts', import.meta.url), 'utf8'));
assert.match(adapter, /from\s+["']\.\/errors["']/);
const { AuthPersistence } = await import(moduleUrl(adapter.replace(/from\s+["']\.\/errors["']/, `from '${errorsUrl}'`)));

class SharedStorage {
  values = new Map();
  afterGet = null;
  afterEnumeratedKey = null;
  beforeSet = null;
  beforeRemove = null;
  constructor() {
    // Storage is a named-property platform object. Model [[OwnPropertyKeys]]
    // with one names list, not the mock's implementation fields or live indices.
    return new Proxy(this, {
      ownKeys: (storage) => {
        const names = [...storage.values.keys()];
        for (const name of names) storage.afterEnumeratedKey?.(name);
        return names;
      },
      getOwnPropertyDescriptor: (storage, key) => storage.values.has(key)
        ? { value: storage.values.get(key), writable: true, enumerable: true, configurable: true }
        : Reflect.getOwnPropertyDescriptor(storage, key),
      get: (storage, key, receiver) => Reflect.has(storage, key)
        ? Reflect.get(storage, key, receiver) : storage.values.get(key),
    });
  }
  get length() { return this.values.size; }
  key(index) {
    const key = [...this.values.keys()][index] ?? null;
    this.afterEnumeratedKey?.(key);
    return key;
  }
  getItem(key) {
    const value = this.values.get(key) ?? null;
    this.afterGet?.(key, value);
    return value;
  }
  setItem(key, value) {
    this.beforeSet?.(key, value);
    this.values.set(key, value);
  }
  removeItem(key) {
    this.beforeRemove?.(key);
    this.values.delete(key);
  }
}

const target = 'https://txofqxictwecgcnvezlb.supabase.co';
function setup(t) {
  const previous = globalThis.window;
  const storage = new SharedStorage();
  globalThis.window = { localStorage: storage };
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  const owner = new AuthPersistence(target);
  owner.initialLease();
  const first = owner.beginLogin();
  first.storage.setItem(owner.sessionKey, 'original-subject-session');
  owner.commitLogin(first);
  const otherTab = new AuthPersistence(target);
  const oldLease = otherTab.initialLease();
  return { storage, owner, oldLease, otherTab };
}

function freshLogin(owner, value = 'fresh-subject-session') {
  const lease = owner.beginLogin();
  lease.storage.setItem(owner.sessionKey, value);
  owner.commitLogin(lease);
  return lease;
}

test('a delayed storage event cannot make an old tab overwrite or remove a fresh session', (t) => {
  const { owner, oldLease } = setup(t);
  const logout = owner.beginLogout();
  owner.finishLogout(logout);
  const fresh = freshLogin(owner);
  // No storage event is delivered to the old tab before this late SDK callback.
  oldLease.storage.setItem(owner.sessionKey, 'late-old-subject-refresh');
  oldLease.storage.removeItem(owner.sessionKey);
  assert.equal(fresh.storage.getItem(owner.sessionKey), 'fresh-subject-session');
  assert.equal(oldLease.storage.getItem(owner.sessionKey), null);
});

test('a login interleaved between an old lease check and write cannot overwrite the current generation', (t) => {
  const { storage, owner, oldLease } = setup(t);
  let fresh;
  storage.beforeSet = (_key, value) => {
    if (value !== 'late-old-subject-refresh') return;
    storage.beforeSet = null;
    fresh = freshLogin(owner);
  };
  oldLease.storage.setItem(owner.sessionKey, 'late-old-subject-refresh');
  assert.ok(fresh, 'The test must reach the deliberately interleaved write.');
  assert.equal(fresh.storage.getItem(owner.sessionKey), 'fresh-subject-session');
  assert.equal([...storage.values.values()].includes('late-old-subject-refresh'), false,
    'A superseded write must not leave a stale credential slot behind.');
});

test('a login interleaved with removal of an old slot cannot delete the current session', (t) => {
  const { storage, owner, oldLease } = setup(t);
  let fresh;
  storage.beforeRemove = () => {
    storage.beforeRemove = null;
    fresh = freshLogin(owner);
  };
  oldLease.storage.removeItem(owner.sessionKey);
  assert.ok(fresh, 'The test must reach the deliberately interleaved removal.');
  assert.equal(fresh.storage.getItem(owner.sessionKey), 'fresh-subject-session');
});

test('logout purges this project credentials, preserves unrelated storage and stays locked after failed login', (t) => {
  const { storage, owner, oldLease } = setup(t);
  storage.setItem('another-application-session', 'unrelated-preserved-value');
  const logout = owner.beginLogout();
  owner.finishLogout(logout);
  oldLease.storage.setItem(owner.sessionKey, 'late-old-subject-refresh');
  assert.equal([...storage.values.values()].includes('original-subject-session'), false);
  assert.equal([...storage.values.values()].includes('late-old-subject-refresh'), false);
  assert.equal(storage.getItem('another-application-session'), 'unrelated-preserved-value');
  const reload = new AuthPersistence(target);
  assert.equal(reload.initiallyLocked, true);
  assert.equal(reload.initialLease().storage.getItem(reload.sessionKey), null);
  const failedAttempt = reload.beginLogin();
  failedAttempt.revoke();
  assert.equal(new AuthPersistence(target).initiallyLocked, true);
  const fresh = freshLogin(reload);
  assert.equal(fresh.storage.getItem(reload.sessionKey), 'fresh-subject-session');
  assert.equal(new AuthPersistence(target).initiallyLocked, false);
});

test('a read interleaved with a fresh login cannot return the superseded credential', (t) => {
  const { storage, owner, oldLease } = setup(t);
  let fresh;
  storage.afterGet = (_key, value) => {
    if (value !== 'original-subject-session') return;
    storage.afterGet = null;
    fresh = freshLogin(owner);
  };
  assert.equal(oldLease.storage.getItem(owner.sessionKey), null);
  assert.ok(fresh, 'The test must read the old physical credential slot.');
  assert.equal(fresh.storage.getItem(owner.sessionKey), 'fresh-subject-session');
});

test('an old async logout finishing after fresh login only cleans its captured lease', async (t) => {
  const { storage, owner } = setup(t);
  const logout = owner.beginLogout();
  let finish;
  const remoteLogout = new Promise((resolve) => { finish = resolve; });
  const pending = remoteLogout.then(() => owner.finishLogout(logout));
  assert.equal(logout.storage.getItem(owner.sessionKey), 'original-subject-session');
  logout.storage.setItem(owner.sessionKey, 'late-logout-refresh');
  const fresh = freshLogin(owner);
  finish();
  await pending;
  assert.equal(fresh.storage.getItem(owner.sessionKey), 'fresh-subject-session');
  assert.equal(logout.storage.getItem(owner.sessionKey), null);
  assert.equal([...storage.values.values()].includes('late-logout-refresh'), false);
  const reload = new AuthPersistence(target);
  assert.equal(reload.initialLease().storage.getItem(reload.sessionKey), 'fresh-subject-session');
});

test('logout from an already superseded tab cannot revoke or snapshot the fresh session', (t) => {
  const { owner, otherTab } = setup(t);
  const fresh = freshLogin(owner);
  const staleLogout = otherTab.beginLogout();
  assert.equal(staleLogout.storage.getItem(owner.sessionKey), null);
  otherTab.finishLogout(staleLogout);
  assert.equal(fresh.storage.getItem(owner.sessionKey), 'fresh-subject-session');
  assert.equal(new AuthPersistence(target).initiallyLocked, false);
});

test('a superseded staged login cannot commit or erase the fresh generation', (t) => {
  const { owner, otherTab, storage } = setup(t);
  const staged = owner.beginLogin();
  staged.storage.setItem(owner.sessionKey, 'superseded-password-session');
  const fresh = freshLogin(otherTab);
  assert.throws(() => owner.commitLogin(staged), { code: 'session_expired' });
  assert.equal(fresh.storage.getItem(owner.sessionKey), 'fresh-subject-session');
  assert.equal([...storage.values.values()].includes('superseded-password-session'), false);
  assert.equal(new AuthPersistence(target).initiallyLocked, false);
});

for (const interleaving of ['credential', 'commit marker']) {
  test(`logout interleaved with a staged ${interleaving} write cannot be cleared by that commit`, (t) => {
    const { owner, storage } = setup(t);
    const staged = owner.beginLogin();
    staged.storage.setItem(owner.sessionKey, 'staged-password-session');
    const loggingOutTab = new AuthPersistence(target);
    loggingOutTab.initialLease();
    let reached = false;
    storage.beforeSet = (key, value) => {
      if (!(interleaving === 'credential' ? value === 'staged-password-session' : key.endsWith('.committed'))) return;
      storage.beforeSet = null;
      reached = true;
      loggingOutTab.finishLogout(loggingOutTab.beginLogout());
    };
    assert.throws(() => owner.commitLogin(staged), { code: 'session_expired' });
    assert.equal(reached, true, 'The test must interrupt the selected commit write.');
    assert.equal(storage.getItem(`${owner.sessionKey}.generation.${staged.generation}.logout-intent`), '1');
    assert.equal([...storage.values.values()].includes('staged-password-session'), false);
    const reload = new AuthPersistence(target);
    assert.equal(reload.initiallyLocked, true);
    assert.equal(reload.initialLease().storage.getItem(reload.sessionKey), null);
  });
}

test('a fresh login interleaved with a stale commit marker keeps its own credentials', (t) => {
  const { owner, storage } = setup(t);
  const staged = owner.beginLogin();
  staged.storage.setItem(owner.sessionKey, 'staged-password-session');
  let fresh;
  storage.beforeSet = (key) => {
    if (!key.endsWith('.committed')) return;
    storage.beforeSet = null;
    fresh = freshLogin(owner);
  };
  assert.throws(() => owner.commitLogin(staged), { code: 'session_expired' });
  assert.ok(fresh, 'The test must interrupt the stale commit marker write.');
  assert.equal(fresh.storage.getItem(owner.sessionKey), 'fresh-subject-session');
  assert.equal([...storage.values.values()].includes('staged-password-session'), false);
});

test('a new tab observing an in-progress commit cannot purge that generation', (t) => {
  const { owner, storage } = setup(t);
  const staged = owner.beginLogin();
  staged.storage.setItem(owner.sessionKey, 'staged-password-session');
  let observer;
  storage.beforeSet = (key) => {
    if (!key.endsWith('.committed')) return;
    storage.beforeSet = null;
    observer = new AuthPersistence(target);
    assert.equal(observer.initiallyLocked, true);
    assert.equal(observer.initialLease().storage.getItem(observer.sessionKey), null);
  };
  owner.commitLogin(staged);
  assert.ok(observer, 'The test must observe the generation before commitment.');
  assert.equal(staged.storage.getItem(owner.sessionKey), 'staged-password-session');
  assert.equal(new AuthPersistence(target).initiallyLocked, false);
});

test('storage read failure permanently locks this owner and persists intent when possible', (t) => {
  const { owner, oldLease, storage, otherTab } = setup(t);
  storage.afterGet = () => { throw new Error('Browser storage rejected read'); };
  assert.throws(() => oldLease.storage.getItem(owner.sessionKey), { code: 'storage' });
  storage.afterGet = null;
  assert.throws(() => otherTab.beginLogin(), { code: 'storage' });
  assert.equal(oldLease.storage.getItem(owner.sessionKey), null);
  assert.equal(new AuthPersistence(target).initiallyLocked, true);
  assert.equal([...storage.values.values()].includes('original-subject-session'), false);
});

test('partial credential persistence failure cannot unlock reload or a later attempt in the failed tab', (t) => {
  const { owner, storage } = setup(t);
  const staged = owner.beginLogin();
  staged.storage.setItem(owner.sessionKey, 'partial-password-session');
  staged.storage.setItem(`${owner.sessionKey}-user`, 'partial-user');
  storage.beforeSet = (_key, value) => {
    if (value === 'partial-user') throw new Error('Browser storage rejected write');
  };
  assert.throws(() => owner.commitLogin(staged), { code: 'storage' });
  storage.beforeSet = null;
  assert.throws(() => owner.beginLogin(), { code: 'storage' });
  assert.equal([...storage.values.values()].includes('partial-password-session'), false);
  assert.equal(new AuthPersistence(target).initiallyLocked, true);
});

test('refused logout deletion reports failure while its saved intent prevents restoration', (t) => {
  const { owner, storage } = setup(t);
  storage.beforeRemove = () => { throw new Error('Browser storage rejected deletion'); };
  assert.throws(() => owner.beginLogout(), { code: 'storage' });
  assert.throws(() => new AuthPersistence(target), { code: 'storage' });
  storage.beforeRemove = null;
  assert.throws(() => owner.beginLogin(), { code: 'storage' });
  const reload = new AuthPersistence(target);
  assert.equal(reload.initiallyLocked, true);
  assert.equal(reload.initialLease().storage.getItem(reload.sessionKey), null);
});

test('refused intent and deletion never claim logout or allow recovery in the failed tab', (t) => {
  const { owner, storage } = setup(t);
  storage.beforeSet = () => { throw new Error('Browser storage rejected intent'); };
  storage.beforeRemove = () => { throw new Error('Browser storage rejected deletion'); };
  assert.throws(() => owner.beginLogout(), { code: 'storage' });
  storage.beforeSet = null;
  storage.beforeRemove = null;
  assert.throws(() => owner.beginLogin(), { code: 'storage' });
  // Explicit limitation: refused browser writes cannot guarantee disk deletion.
  assert.equal([...storage.values.values()].includes('original-subject-session'), true);
});

test('leases touch only their exact project SDK keys, including user and verifier slots', (t) => {
  const { owner, storage, oldLease } = setup(t);
  storage.setItem('another-application-session', 'unrelated-preserved-value');
  const fresh = owner.beginLogin();
  for (const key of ['another-application-session', owner.generationKey, `${owner.sessionKey}.generation.evil`, `${owner.sessionKey}-user-extra`]) {
    fresh.storage.setItem(key, 'must-not-persist');
    fresh.storage.removeItem(key);
    assert.equal(fresh.storage.getItem(key), null);
  }
  fresh.storage.setItem(owner.sessionKey, 'fresh-subject-session');
  fresh.storage.setItem(`${owner.sessionKey}-user`, 'fresh-user');
  fresh.storage.setItem(`${owner.sessionKey}-code-verifier`, 'fresh-verifier');
  owner.commitLogin(fresh);
  oldLease.storage.removeItem(`${owner.sessionKey}-user`);
  oldLease.storage.removeItem(`${owner.sessionKey}-code-verifier`);
  assert.equal(fresh.storage.getItem(`${owner.sessionKey}-user`), 'fresh-user');
  assert.equal(fresh.storage.getItem(`${owner.sessionKey}-code-verifier`), 'fresh-verifier');
  assert.equal(storage.getItem('another-application-session'), 'unrelated-preserved-value');
  assert.equal([...storage.values.values()].includes('must-not-persist'), false);
  owner.finishLogout(owner.beginLogout());
  assert.equal([...storage.values.values()].some((value) => ['fresh-subject-session', 'fresh-user', 'fresh-verifier'].includes(value)), false);
});

test('the old shared-slot format is purged without adopting its credentials or deleting unrelated keys', (t) => {
  const { owner, storage } = setup(t);
  storage.removeItem(owner.generationKey);
  storage.setItem(owner.sessionKey, 'legacy-subject-session');
  storage.setItem(`${owner.sessionKey}-user`, 'legacy-user');
  storage.setItem(`${owner.sessionKey}-code-verifier`, 'legacy-verifier');
  storage.setItem(`${owner.sessionKey}.logout-intent`, 'legacy-intent');
  storage.setItem(`${owner.sessionKey}-unowned`, 'unrelated-preserved-value');
  const reload = new AuthPersistence(target);
  assert.equal(reload.initiallyLocked, true);
  assert.equal(reload.initialLease().storage.getItem(reload.sessionKey), null);
  assert.equal([...storage.values.values()].some((value) => ['legacy-subject-session', 'legacy-user', 'legacy-verifier'].includes(value)), false);
  assert.equal(storage.getItem(`${owner.sessionKey}-unowned`), 'unrelated-preserved-value');
});

test('overlapping beginLogin cleans an intermediate committed generation without a responsive old tab', (t) => {
  const { storage, owner: tabA, otherTab: tabB } = setup(t);
  let leaseA;
  storage.beforeSet = (key) => {
    if (key !== tabB.generationKey) return;
    storage.beforeSet = null;
    // B captured and locked G but has not published B. A publishes and fully
    // commits while B is suspended immediately before its pointer write.
    leaseA = freshLogin(tabA, 'synthetic-A-bearer-and-refresh-credential');
  };
  const leaseB = tabB.beginLogin();
  assert.ok(leaseA, 'The intermediate generation must actually commit.');
  // Do not deliver storage events or invoke A again: B must perform cleanup.
  const slotA = `${tabA.sessionKey}.generation.${leaseA.generation}`;
  assert.equal(storage.getItem(slotA), null);
  assert.equal(storage.getItem(`${slotA}.logout-intent`), '1');
  leaseB.storage.setItem(tabB.sessionKey, 'synthetic-B-session');
  tabB.commitLogin(leaseB);
  tabB.finishLogout(tabB.beginLogout());
  assert.equal([...storage.values.values()].includes('synthetic-A-bearer-and-refresh-credential'), false);
  assert.equal(new AuthPersistence(target).initiallyLocked, true);
  // Even an explicit pointer change cannot restore the tombstoned generation.
  storage.setItem(tabA.generationKey, leaseA.generation);
  const restore = new AuthPersistence(target);
  assert.equal(restore.initiallyLocked, true);
  assert.equal(restore.initialLease().storage.getItem(tabA.sessionKey), null);
});

for (const interleaving of ['enumeration', 'removal']) {
  test(`a newer login during retired-slot ${interleaving} keeps its own credentials`, (t) => {
    const { storage, owner: tabA, otherTab: tabB } = setup(t);
    let leaseA;
    let newest;
    storage.beforeSet = (key) => {
      if (key !== tabB.generationKey) return;
      storage.beforeSet = null;
      leaseA = freshLogin(tabA, 'intermediate-A-session');
      const slotA = `${tabA.sessionKey}.generation.${leaseA.generation}`;
      const advance = (candidate) => {
        if (candidate !== slotA) return;
        storage.afterEnumeratedKey = null;
        storage.beforeRemove = null;
        newest = freshLogin(tabA, 'newest-C-session');
      };
      if (interleaving === 'enumeration') storage.afterEnumeratedKey = advance;
      else storage.beforeRemove = advance;
    };
    assert.throws(() => tabB.beginLogin(), { code: 'session_expired' });
    assert.ok(newest, 'The cleanup must be interrupted by a newer committed login.');
    assert.equal(newest.storage.getItem(tabA.sessionKey), 'newest-C-session');
    assert.equal(storage.getItem(`${tabA.sessionKey}.generation.${leaseA.generation}.logout-intent`), '1');
    assert.equal([...storage.values.values()].includes('intermediate-A-session'), false);
    const reload = new AuthPersistence(target);
    assert.equal(reload.initialLease().storage.getItem(reload.sessionKey), 'newest-C-session');
  });
}

test('a retired-generation cleanup failure cannot delete a newer concurrent session', (t) => {
  const { storage, owner: tabA, otherTab: tabB } = setup(t);
  let newest;
  storage.beforeSet = (key) => {
    if (key !== tabB.generationKey) return;
    storage.beforeSet = null;
    const leaseA = freshLogin(tabA, 'intermediate-A-session');
    const tombstoneA = `${tabA.sessionKey}.generation.${leaseA.generation}.logout-intent`;
    storage.beforeSet = (candidate) => {
      if (candidate !== tombstoneA) return;
      storage.beforeSet = null;
      newest = freshLogin(tabA, 'newest-C-session');
      throw new Error('Browser storage rejected retired-generation cleanup');
    };
  };
  assert.throws(() => tabB.beginLogin(), { code: 'storage' });
  assert.ok(newest, 'The newer generation must commit before the cleanup fails.');
  assert.throws(() => tabB.beginLogin(), { code: 'storage' });
  assert.equal(newest.storage.getItem(tabA.sessionKey), 'newest-C-session');
  assert.equal([...storage.values.values()].includes('intermediate-A-session'), false);
  const reload = new AuthPersistence(target);
  assert.equal(reload.initialLease().storage.getItem(reload.sessionKey), 'newest-C-session');
});

test('reload cleanup retires exact orphan credential slots but preserves metadata-only and unrelated entries', (t) => {
  const { owner, storage } = setup(t);
  const orphan = '00000000-0000-4000-8000-000000000001';
  const pending = '00000000-0000-4000-8000-000000000002';
  const slot = `${owner.sessionKey}.generation.${orphan}`;
  const preserved = [
    `${owner.sessionKey}.generation.${pending}.committed`,
    `${slot}-user-extra`, `${slot}.other`, `${owner.sessionKey}.generation.not-a-uuid`,
    `another-project.generation.${orphan}`, 'another-application-session',
  ];
  for (const key of preserved) storage.setItem(key, 'unrelated-preserved-value');
  storage.setItem(slot, 'orphan-session');
  storage.setItem(`${slot}-user`, 'orphan-user');
  storage.setItem(`${slot}-code-verifier`, 'orphan-verifier');
  storage.setItem(`${slot}.committed`, '1');
  const reload = new AuthPersistence(target);
  assert.equal(reload.initialLease().storage.getItem(reload.sessionKey), 'original-subject-session');
  assert.equal(storage.getItem(`${slot}.logout-intent`), '1');
  assert.equal([...storage.values.values()].some((value) => ['orphan-session', 'orphan-user', 'orphan-verifier'].includes(value)), false);
  for (const key of preserved) assert.equal(storage.getItem(key), 'unrelated-preserved-value');
  assert.equal(storage.getItem(`${owner.sessionKey}.generation.${pending}.logout-intent`), null);
});

test('the Storage mock exposes stored names, not its instrumentation fields', () => {
  const storage = new SharedStorage();
  storage.setItem('synthetic-stored-name', 'synthetic-value');
  assert.deepEqual(Object.getOwnPropertyNames(storage), ['synthetic-stored-name']);
  assert.equal(storage['synthetic-stored-name'], 'synthetic-value');
  assert.equal(Object.getOwnPropertyDescriptor(storage, 'synthetic-stored-name').value, 'synthetic-value');
});

test('concurrent deletion during a key snapshot cannot skip another retired credential', (t) => {
  const { owner, storage } = setup(t);
  const prefix = `${owner.sessionKey}.generation.`;
  const x = `${prefix}00000000-0000-4000-8000-000000000001`;
  const y = `${prefix}00000000-0000-4000-8000-000000000002`;
  storage.setItem(x, 'retired-X-session');
  storage.setItem(y, 'retired-Y-bearer-and-refresh-credential');
  storage.setItem(`${y}.committed`, '1');
  let removedConcurrently = false;
  // Both key(index) and named-property enumeration invoke this hook. The
  // regression must reach the deletion under either enumeration strategy.
  storage.afterEnumeratedKey = (key) => {
    if (key !== x) return;
    storage.afterEnumeratedKey = null;
    storage.removeItem(x);
    removedConcurrently = true;
  };
  owner.finishLogout(owner.beginLogout());
  assert.equal(removedConcurrently, true, 'The concurrent deletion must actually execute during enumeration.');
  assert.equal(storage.getItem(x), null);
  assert.equal(storage.getItem(y), null);
  assert.equal(storage.getItem(`${y}.logout-intent`), '1');
  assert.equal([...storage.values.values()].includes('retired-Y-bearer-and-refresh-credential'), false);
  storage.setItem(owner.generationKey, '00000000-0000-4000-8000-000000000002');
  const restore = new AuthPersistence(target);
  assert.equal(restore.initiallyLocked, true);
  assert.equal(restore.initialLease().storage.getItem(restore.sessionKey), null);
});
