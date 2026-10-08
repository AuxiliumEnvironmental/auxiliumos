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
  beforeSet = null;
  beforeRemove = null;
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
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
  return { storage, owner, oldLease };
}

function freshLogin(owner) {
  const lease = owner.beginLogin();
  lease.storage.setItem(owner.sessionKey, 'fresh-subject-session');
  owner.commitLogin(lease);
  return lease;
}

test('a delayed storage event cannot make an old tab overwrite or remove a fresh session', (t) => {
  const { owner, oldLease } = setup(t);
  owner.beginLogout();
  owner.finishLogout();
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
  owner.beginLogout();
  owner.finishLogout();
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
