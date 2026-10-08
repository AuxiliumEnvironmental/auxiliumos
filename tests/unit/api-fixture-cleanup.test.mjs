import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanupFixtures, configuration, preflightSchema, recordCreatedAuth } from '../api/fixture-cleanup.mjs';

// Pure in-memory request/response mocks. These do NOT execute PostgreSQL,
// Supabase Auth, PostgREST, RLS, real triggers, or authentic API acceptance.
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const clone = (value) => structuredClone(value);
const providerSecret = 'synthetic-provider-detail-must-not-be-printed';
const errorResult = () => ({ error: { message: providerSecret, code: 'mock_failure', status: 500 }, data: null });
const missingUser = () => ({ error: { code: 'user_not_found', status: 404 }, data: { user: null } });
const filtersInclude = (call, column, value) => call.filters?.some(([key, actual]) => key === column && actual === value);

function fixture() {
  const f = {
    runId: id(1), auditProbe: id(14), auditProbeAttempted: false, createdAuth: [],
    idsByTable: {
      client_accounts: [id(2), id(3)], user_profiles: [id(4), id(5), id(6)],
      facilities: [id(7), id(8)], account_memberships: [id(9), id(10)],
      account_capability_grants: [id(11), id(12), id(13)],
    },
    accessPairs: [[id(2), id(4)], [id(3), id(5)], [id(3), id(4)]],
    grantTargets: [[id(11), id(2), id(4)], [id(12), id(3), id(5)], [id(13), id(2), id(4)]],
    profileIdByAuthId: new Map([[id(15), id(4)], [id(16), id(5)]]),
  };
  for (const [n, label] of [[15, 'a'], [16, 'b'], [17, 'unlinked']]) {
    recordCreatedAuth(f, { id: id(n), email: `api-${f.runId}-${label}@identity-directory.invalid` }, label);
  }
  return f;
}

function mock(f, hook = () => undefined) {
  const tables = {
    client_accounts: [{ id: id(2), is_demo: true }, { id: id(3), is_demo: true }],
    facilities: [{ id: id(7), account_id: id(2), is_demo: true }, { id: id(8), account_id: id(3), is_demo: true }],
    account_memberships: [{ id: id(9), account_id: id(2), user_profile_id: id(4), is_demo: true }, { id: id(10), account_id: id(3), user_profile_id: id(5), is_demo: true }],
    user_profiles: [
      { id: id(4), auth_user_id: id(15), identity_status: 'active', auth_linked_once: true, is_demo: true },
      { id: id(5), auth_user_id: id(16), identity_status: 'suspended', auth_linked_once: true, is_demo: true },
      { id: id(90), auth_user_id: id(91), identity_status: 'active', auth_linked_once: true, is_demo: false },
    ],
    account_access: [
      { account_id: id(2), user_profile_id: id(4), membership_status: 'active', is_demo: true },
      { account_id: id(3), user_profile_id: id(5), membership_status: 'active', is_demo: true },
      { account_id: id(92), user_profile_id: id(90), membership_status: 'active', is_demo: false },
    ],
    account_capability_grants: [
      { id: id(11), account_id: id(2), user_profile_id: id(4), revoked_at: null, is_demo: true },
      { id: id(12), account_id: id(3), user_profile_id: id(5), revoked_at: null, is_demo: true },
      { id: id(93), account_id: id(92), user_profile_id: id(90), revoked_at: null, is_demo: false },
    ],
    audit_events: [{ id: id(94), account_id: id(2), is_demo: true }],
  };
  const users = new Map(f.createdAuth.map((user) => [user.id, clone(user)]));
  users.set(id(91), { id: id(91), email: 'not-owned@example.invalid' });
  const calls = [];
  function invoke(call, normal) {
    calls.push(clone(call));
    const result = hook(call, { tables, users, calls });
    return result === undefined ? normal() : result;
  }
  const admin = {
    from(table) {
      const call = { table, operation: 'select', filters: [] };
      const query = {
        select(columns) { call.columns = columns; return query; },
        eq(column, value) { call.filters.push([column, value]); return query; },
        limit(limit) { call.limit = limit; return query; },
        update(patch) { call.operation = 'update'; call.patch = patch; return query; },
        then(resolve, reject) {
          return Promise.resolve().then(() => invoke(call, () => {
            let rows = tables[table].filter((row) => call.filters.every(([column, value]) => row[column] === value));
            if (call.limit !== undefined) rows = rows.slice(0, call.limit);
            if (call.operation === 'update') {
              assert.deepEqual(Object.keys(call.patch), [table === 'user_profiles' ? 'identity_status' : table === 'account_access' ? 'membership_status' : 'revoked_at']);
              for (const row of rows) Object.assign(row, call.patch);
            }
            return { error: null, data: clone(rows.map((row) => Object.fromEntries(call.columns.split(',').map((column) => [column, row[column]])))) };
          })).then(resolve, reject);
        },
      };
      return query;
    },
    auth: { admin: {
      async getUserById(authId) {
        return invoke({ operation: 'getUserById', authId }, () => users.has(authId)
          ? { error: null, data: { user: clone(users.get(authId)) } } : missingUser());
      },
      async deleteUser(authId) {
        return invoke({ operation: 'deleteUser', authId }, () => {
          const user = users.get(authId);
          users.delete(authId);
          // Model only the expected FK effect; this is NOT a real trigger test.
          for (const profile of tables.user_profiles) if (profile.auth_user_id === authId) profile.auth_user_id = null;
          return { error: null, data: { user } };
        });
      },
    } },
  };
  return { admin, tables, users, calls };
}

async function failedCleanup(m, f) {
  try { await cleanupFixtures(m.admin, f); } catch (error) {
    assert.match(error.message, /cleanup incomplete/);
    assert.ok(!error.message.includes(providerSecret));
    assert.ok(error.report);
    return error;
  }
  assert.fail('Cleanup must report its failed postcondition, not silently pass.');
}

test('configuration accepts only the exact target and keeps rejected keys out of errors', () => {
  const env = { AUXILIUMOS_TEST_URL: 'https://txofqxictwecgcnvezlb.supabase.co', AUXILIUMOS_TEST_PUBLISHABLE_KEY: 'sb_publishable_mock', AUXILIUMOS_TEST_SERVICE_ROLE_KEY: 'sb_secret_mock' };
  assert.equal(configuration(env).url, env.AUXILIUMOS_TEST_URL);
  assert.throws(() => configuration({}), /No API checks ran/);
  for (const url of ['https://other.supabase.co', `${env.AUXILIUMOS_TEST_URL}/`, 'http://localhost:54322', 'http://localhost:54321/path']) {
    assert.throws(() => configuration({ ...env, AUXILIUMOS_TEST_URL: url }), /must exactly match/);
  }
  for (const url of ['http://localhost:54321', 'http://127.0.0.1:54321']) assert.equal(configuration({ ...env, AUXILIUMOS_TEST_URL: url }).url, url);
  const key = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.mock-signature`;
  for (const rejected of ['sb_secret_do_not_print', key, env.AUXILIUMOS_TEST_SERVICE_ROLE_KEY]) {
    assert.throws(() => configuration({ ...env, AUXILIUMOS_TEST_PUBLISHABLE_KEY: rejected }), (error) => !error.message.includes(rejected));
  }
});

test('read-only preflight requires identity history and the audit schema before creation', async () => {
  const m = mock(fixture());
  await preflightSchema(m.admin);
  assert.equal(m.calls.length, 7);
  assert.ok(m.calls.every((call) => call.operation === 'select' && call.limit === 0));
  assert.ok(m.calls.find((call) => call.table === 'user_profiles').columns.includes('auth_linked_once'));
  assert.ok(m.calls.find((call) => call.table === 'audit_events').columns.includes('actor_auth_user_id'));
  const mismatch = mock(fixture(), (call) => call.table === 'audit_events' ? errorResult() : undefined);
  let created = false;
  await assert.rejects(async () => { await preflightSchema(mismatch.admin); created = true; }, (error) => /No fixture or Auth creation/.test(error.message) && !error.message.includes(providerSecret));
  assert.equal(created, false);
  assert.ok(mismatch.calls.every((call) => call.operation === 'select'));
});

test('ownership registration requires a returned UUID and exact run-specific email', () => {
  const f = fixture();
  const before = clone(f.createdAuth);
  for (const user of [{ id: id(20), email: 'api-other-a@identity-directory.invalid' }, { id: 'not-a-uuid', email: `api-${f.runId}-a@identity-directory.invalid` }]) {
    assert.throws(() => recordCreatedAuth(f, user, 'a'), /no cleanup ownership was registered/);
  }
  assert.throws(() => recordCreatedAuth(f, f.createdAuth[0], 'a'), /Duplicate/);
  assert.deepEqual(f.createdAuth, before);
});

test('cleanup preserves every application/audit row, disables exact demo scopes, then deletes owned Auth only', async () => {
  const f = fixture();
  const m = mock(f, (call, { tables }) => {
    if (call.operation === 'deleteUser') {
      for (const profile of tables.user_profiles.filter((row) => row.auth_user_id === call.authId)) {
        assert.equal(profile.identity_status, 'removed');
        assert.ok(tables.account_access.filter((row) => row.user_profile_id === profile.id).every((row) => row.membership_status === 'removed'));
        assert.ok(tables.account_capability_grants.filter((row) => row.user_profile_id === profile.id).every((row) => row.revoked_at !== null));
      }
    }
  });
  const before = clone(m.tables);
  const diagnostics = [];
  const report = await cleanupFixtures(m.admin, f, (message) => diagnostics.push(message));
  assert.deepEqual(report.deletedAuthIds, f.createdAuth.map(({ id: authId }) => authId));
  assert.equal(report.retainedAuthIds.length, 0);
  assert.ok(report.absent.some((label) => label.includes(id(6))));
  for (const table of Object.keys(before)) assert.equal(m.tables[table].length, before[table].length);
  for (const table of ['client_accounts', 'facilities', 'account_memberships', 'audit_events']) assert.deepEqual(m.tables[table], before[table]);
  for (const profile of m.tables.user_profiles.slice(0, 2)) assert.deepEqual([profile.identity_status, profile.auth_user_id, profile.auth_linked_once], ['removed', null, true]);
  assert.deepEqual(m.tables.user_profiles[2], before.user_profiles[2]);
  assert.deepEqual(m.tables.account_access[2], before.account_access[2]);
  assert.deepEqual(m.tables.account_capability_grants[2], before.account_capability_grants[2]);
  assert.deepEqual([...m.users.keys()], [id(91)]);
  const updates = m.calls.filter((call) => call.operation === 'update');
  assert.equal(updates.length, 6);
  for (const call of updates) {
    assert.ok(filtersInclude(call, 'is_demo', true));
    if (call.table === 'account_access') assert.ok(f.accessPairs.some(([account, profile]) => filtersInclude(call, 'account_id', account) && filtersInclude(call, 'user_profile_id', profile)));
    else assert.ok(f.idsByTable[call.table].some((target) => filtersInclude(call, 'id', target)));
  }
  assert.ok(m.calls.every((call) => ['select', 'update', 'getUserById', 'deleteUser'].includes(call.operation)));
  assert.ok(diagnostics.join(' ').includes(id(2)) && diagnostics.join(' ').includes('history retained'));
  assert.ok(!diagnostics.join(' ').includes('@'));
});

test('silent zero-row profile update fails; unrelated and unlinked Auth cleanup still proceeds', async () => {
  const f = fixture();
  const m = mock(f, (call) => call.operation === 'update' && call.table === 'user_profiles' && filtersInclude(call, 'id', id(4)) ? { error: null, data: [] } : undefined);
  const error = await failedCleanup(m, f);
  assert.deepEqual(error.report.retainedAuthIds, [id(15)]);
  assert.deepEqual(error.report.deletedAuthIds, [id(16), id(17)]);
  assert.equal(m.tables.user_profiles[0].identity_status, 'active');
  assert.ok(m.tables.account_capability_grants[0].revoked_at);
});

test('an update response claiming removal cannot replace the persisted-state readback', async () => {
  const f = fixture();
  const m = mock(f, (call, { tables }) => call.operation === 'update' && call.table === 'user_profiles' && filtersInclude(call, 'id', id(4))
    ? { error: null, data: [{ ...tables.user_profiles[0], identity_status: 'removed' }] } : undefined);
  const error = await failedCleanup(m, f);
  assert.deepEqual(error.report.retainedAuthIds, [id(15)]);
  assert.deepEqual(error.report.deletedAuthIds, [id(16), id(17)]);
  assert.equal(m.tables.user_profiles[0].identity_status, 'active');
});

test('failed grant revocation is reported without retaining an otherwise safely disabled Auth identity', async () => {
  const f = fixture();
  const m = mock(f, (call) => call.operation === 'update' && call.table === 'account_capability_grants' && filtersInclude(call, 'id', id(11)) ? errorResult() : undefined);
  const error = await failedCleanup(m, f);
  assert.match(error.message, new RegExp(id(11)));
  assert.deepEqual(error.report.deletedAuthIds, [id(15), id(16), id(17)]);
  assert.equal(m.tables.account_capability_grants[0].revoked_at, null);
  assert.equal(m.tables.user_profiles[0].auth_user_id, null);
});

test('failed active membership retirement blocks only its associated Auth deletion', async () => {
  const f = fixture();
  const m = mock(f, (call) => call.operation === 'update' && call.table === 'account_access' && filtersInclude(call, 'user_profile_id', id(4)) ? errorResult() : undefined);
  const error = await failedCleanup(m, f);
  assert.deepEqual(error.report.retainedAuthIds, [id(15)]);
  assert.deepEqual(error.report.deletedAuthIds, [id(16), id(17)]);
  assert.ok(!m.calls.some((call) => call.operation === 'deleteUser' && call.authId === id(15)));
});

test('current Auth email mismatch cannot acquire deletion authority', async () => {
  const f = fixture();
  const m = mock(f);
  m.users.get(id(15)).email = `api-${f.runId}-b@identity-directory.invalid`;
  const error = await failedCleanup(m, f);
  assert.deepEqual(error.report.retainedAuthIds, [id(15)]);
  assert.ok(!m.calls.some((call) => call.operation === 'deleteUser' && call.authId === id(15)));
});

test('Auth ownership is rechecked after profile/access verification and before deletion', async () => {
  const f = fixture();
  let reads = 0;
  const m = mock(f, (call, { users }) => {
    if (call.operation === 'getUserById' && call.authId === id(15) && ++reads === 2) users.get(id(15)).email = 'changed@example.invalid';
  });
  const error = await failedCleanup(m, f);
  assert.deepEqual(error.report.retainedAuthIds, [id(15)]);
  assert.ok(!m.calls.some((call) => call.operation === 'deleteUser' && call.authId === id(15)));
});

test('unexpected non-demo profile linked to a created Auth identity is not touched or unlinked', async () => {
  const f = fixture();
  const m = mock(f);
  m.tables.user_profiles[0].auth_user_id = null;
  m.tables.user_profiles[2].auth_user_id = id(15);
  const before = clone(m.tables.user_profiles[2]);
  const error = await failedCleanup(m, f);
  assert.deepEqual(error.report.retainedAuthIds, [id(15)]);
  assert.deepEqual(m.tables.user_profiles[2], before);
});

test('partially provisioned run removes returned Auth identities even when no model rows were created', async () => {
  const f = fixture();
  f.createdAuth = f.createdAuth.slice(0, 1);
  f.profileIdByAuthId = new Map();
  const m = mock(f);
  for (const table of Object.keys(m.tables)) m.tables[table] = [];
  const report = await cleanupFixtures(m.admin, f);
  assert.deepEqual(report.deletedAuthIds, [id(15)]);
  assert.equal(report.disabled.length, 0);
  assert.equal(report.absent.length, 9);
  assert.ok(!m.calls.some((call) => call.operation === 'update'));
});

test('an unexpectedly accepted audit probe is preserved and reported, never mutated', async () => {
  const f = fixture();
  f.auditProbeAttempted = true;
  const m = mock(f);
  m.tables.audit_events.push({ id: f.auditProbe, account_id: id(2), is_demo: true });
  const before = clone(m.tables.audit_events);
  const error = await failedCleanup(m, f);
  assert.match(error.message, new RegExp(f.auditProbe));
  assert.deepEqual(m.tables.audit_events, before);
  assert.ok(m.calls.filter((call) => call.table === 'audit_events').every((call) => call.operation === 'select' && filtersInclude(call, 'id', f.auditProbe)));
  assert.deepEqual(error.report.deletedAuthIds, [id(15), id(16), id(17)]);
});

test('unreadable audit probe does not short-circuit independent Auth cleanup', async () => {
  const f = fixture();
  f.auditProbeAttempted = true;
  const m = mock(f, (call) => call.table === 'audit_events' ? errorResult() : undefined);
  const error = await failedCleanup(m, f);
  assert.deepEqual(error.report.deletedAuthIds, [id(15), id(16), id(17)]);
});

test('Auth deletion failure is read back and reported while later identities are removed', async () => {
  const f = fixture();
  const m = mock(f, (call) => call.operation === 'deleteUser' && call.authId === id(15) ? errorResult() : undefined);
  const error = await failedCleanup(m, f);
  assert.deepEqual(error.report.retainedAuthIds, [id(15)]);
  assert.deepEqual(error.report.deletedAuthIds, [id(16), id(17)]);
  assert.equal(m.tables.user_profiles[0].auth_linked_once, true);
  assert.equal(m.tables.user_profiles[0].identity_status, 'removed');
});

test('successful no-op Auth deletion is not reported as verified absence', async () => {
  const f = fixture();
  const m = mock(f, (call) => call.operation === 'deleteUser' && call.authId === id(15)
    ? { error: null, data: { user: { id: id(15) } } } : undefined);
  const error = await failedCleanup(m, f);
  assert.match(error.message, /deletion not verified/);
  assert.deepEqual(error.report.retainedAuthIds, [id(15)]);
  assert.deepEqual(error.report.deletedAuthIds, [id(16), id(17)]);
});

test('ambiguous Auth deletion may have committed but its failed response still fails the run', async () => {
  const f = fixture();
  const m = mock(f, (call, { tables, users }) => {
    if (call.operation !== 'deleteUser' || call.authId !== id(15)) return;
    users.delete(id(15));
    tables.user_profiles[0].auth_user_id = null;
    return errorResult();
  });
  const error = await failedCleanup(m, f);
  assert.deepEqual(error.report.deletedAuthIds, [id(15), id(16), id(17)]);
  assert.equal(error.report.retainedAuthIds.length, 0);
});

test('successful Auth response cannot hide broken retained-profile link history', async () => {
  const f = fixture();
  const m = mock(f, (call, { tables, users }) => {
    if (call.operation !== 'deleteUser' || call.authId !== id(15)) return;
    users.delete(id(15));
    tables.user_profiles[0].auth_user_id = null;
    tables.user_profiles[0].auth_linked_once = false;
    return { error: null, data: { user: { id: id(15) } } };
  });
  const error = await failedCleanup(m, f);
  assert.match(error.message, /preserved unlink\/history not verified/);
  assert.deepEqual(error.report.deletedAuthIds, [id(15), id(16), id(17)]);
});

test('already absent Auth and already disabled rows are verified rather than claimed as new deletes/updates', async () => {
  const f = fixture();
  const m = mock(f);
  m.users.delete(id(15));
  Object.assign(m.tables.user_profiles[0], { auth_user_id: null, identity_status: 'removed' });
  m.tables.account_access[0].membership_status = 'removed';
  m.tables.account_capability_grants[0].revoked_at = '2026-01-01T00:00:00.000Z';
  const report = await cleanupFixtures(m.admin, f);
  assert.deepEqual(report.absentAuthIds, [id(15)]);
  assert.deepEqual(report.deletedAuthIds, [id(16), id(17)]);
  assert.equal(report.alreadyDisabled.length, 3);
  assert.equal(m.tables.account_capability_grants[0].revoked_at, '2026-01-01T00:00:00.000Z');
});

test('a generated grant found under an unexpected membership is a failure, not falsely absent', async () => {
  const f = fixture();
  const m = mock(f);
  m.tables.account_capability_grants[0].account_id = id(3);
  const error = await failedCleanup(m, f);
  assert.match(error.message, new RegExp(id(11)));
  assert.equal(m.tables.account_capability_grants[0].revoked_at, null);
  assert.ok(!error.report.absent.some((label) => label.includes(id(11))));
});

test('non-demo generated profile is never modified or deleted through Auth', async () => {
  const f = fixture();
  const m = mock(f);
  m.tables.user_profiles[0].is_demo = false;
  const error = await failedCleanup(m, f);
  assert.equal(m.tables.user_profiles[0].identity_status, 'active');
  assert.deepEqual(error.report.retainedAuthIds, [id(15)]);
  assert.ok(!m.calls.some((call) => call.operation === 'update' && call.table === 'user_profiles' && filtersInclude(call, 'id', id(4))));
});

test('invalid generated-ID or Auth-ownership manifests fail before any request', async () => {
  for (const mutate of [(f) => { f.idsByTable.user_profiles[0] = 'untrusted-filter-value'; }, (f) => { f.createdAuth[0].email = 'unowned@example.invalid'; }]) {
    const f = fixture();
    const m = mock(f);
    mutate(f);
    await assert.rejects(() => cleanupFixtures(m.admin, f), /Invalid fixture/);
    assert.equal(m.calls.length, 0);
  }
});
