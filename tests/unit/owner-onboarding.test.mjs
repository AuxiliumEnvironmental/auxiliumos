import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

// Run the actual implementation with only its authorized-recipient hash replaced
// by a synthetic fixture hash. No real owner address enters source or CI output.
const email = 'owner@example.invalid';
const sourceUrl = new URL('../../scripts/owner-onboarding.mjs', import.meta.url);
const source = (await readFile(sourceUrl, 'utf8'))
  .replace("'25b94cb2f529c847c80f4581f9101ff74676472d0df211419fed1a522652c5d9'", `'${createHash('sha256').update(email).digest('hex')}'`)
  .replace("'@supabase/supabase-js'", JSON.stringify(import.meta.resolve('@supabase/supabase-js')))
  .replace("'../tests/api/fixture-cleanup.mjs'", JSON.stringify(new URL('../api/fixture-cleanup.mjs', import.meta.url).href));
const { onboardOwner, ownerOptions, ownerConfiguration, verifyOwnerRedirects, ownerFetch, OWNER_IDS, OWNER_GRANTS, OWNER_ORIGIN, OWNER_TARGET } =
  await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const ownerAuthId = '00000000-0000-4000-8000-222222222222';
const probeAuthId = '00000000-0000-4000-8000-333333333333';
const ok = data => ({ data, error: null });
const owner = () => ({ id: ownerAuthId, email, is_anonymous: false });

function fixture({ users = [], failure, redirectMismatch = false } = {}) {
  const calls = [], db = Object.fromEntries(['client_accounts', 'facilities', 'user_profiles', 'account_access', 'account_memberships', 'account_capability_grants', 'audit_events'].map(name => [name, []]));
  users = structuredClone(users);
  function audit(table, row, before = null) {
    const type = { user_profiles: 'user_profile', account_access: 'account_access', account_capability_grants: 'account_capability_grant' }[table];
    if (!type) return;
    db.audit_events.push({ object_type: type, object_id: row.id ?? row.user_profile_id,
      event_type: table === 'user_profiles' ? (before ? 'profile_updated' : 'profile_created')
        : table === 'account_access' ? 'account_access_created' : 'capability_grant_created',
      event_metadata: { before, after: structuredClone(row) }, actor_kind: 'system', actor_system_key: 'database_privileged_operation' });
  }
  function result(label, data) {
    calls.push(label);
    if (failure === label) return { data: null, error: { message: 'RAW_PROVIDER_TOKEN_MUST_NOT_PRINT' } };
    return ok(data);
  }
  function query(table) {
    const filters = []; let operation = 'select', insertRows, limit = Infinity;
    const q = {
      select() { return q; },
      eq(column, value) { filters.push(row => row[column] === value); return q; },
      in(column, values) { filters.push(row => values.includes(row[column])); return q; },
      or(value) {
        const profileMatch = value.match(/^user_profile_id\.eq\.([^,]+),/)[1];
        const ids = value.includes('id.in.(') ? value.split('id.in.(')[1].slice(0, -1).split(',') : [value.split('id.eq.')[1]];
        filters.push(row => row.user_profile_id === profileMatch || ids.includes(row.id)); return q;
      },
      limit(value) { limit = value; return q; },
      insert(value) { operation = 'insert'; insertRows = structuredClone(Array.isArray(value) ? value : [value]); return q; },
      then(resolve, reject) {
        try {
          const label = `${operation}:${table}`;
          if (failure === label) return Promise.resolve(result(label, null)).then(resolve, reject);
          if (operation === 'insert') {
            for (const row of insertRows) {
              if (table === 'user_profiles') row.auth_linked_once = true;
              db[table].push(row); audit(table, row);
            }
          }
          return Promise.resolve(result(label, operation === 'insert' ? null : structuredClone(db[table].filter(row => filters.every(filter => filter(row))).slice(0, limit)))).then(resolve, reject);
        } catch (error) { return Promise.reject(error).then(resolve, reject); }
      },
    }; return q;
  }
  const admin = {
    from: query,
    rpc: async (name, args) => {
      assert.equal(name, 'activate_development_owner');
      if (args.p_preflight === true) return result('activation-preflight', { ready: true, scope: 'development_owner_initial_activation' });
      assert.equal(args.p_auth_user_id, ownerAuthId);
      if (failure === 'activate') return result('activate', null);
      const profile = db.user_profiles.find(row => row.id === OWNER_IDS.profile);
      const before = structuredClone(profile); profile.identity_status = 'active'; audit('user_profiles', profile, before);
      return result('activate', { profile_id: OWNER_IDS.profile, active: true, changed: true });
    },
    auth: { admin: {
      listUsers: async ({ page, perPage }) => result('list-users', { users: users.slice((page - 1) * perPage, page * perPage) }),
      getUserById: async id => result('get-user', { user: users.find(user => user.id === id) }),
      inviteUserByEmail: async (address, options) => {
        assert.equal(address, email); assert.deepEqual(options, { redirectTo: `${OWNER_ORIGIN}/?auth=invite` });
        if (failure === 'invite') return result('invite', null);
        const user = owner(); users.push(user); return result('invite', { user });
      },
      createUser: async request => {
        assert.match(request.email, /^owner-redirect-[0-9a-f-]+@identity-directory\.invalid$/);
        assert.deepEqual(Object.keys(request).sort(), ['email', 'email_confirm']);
        if (failure === 'probe-create') return result('probe-create', null);
        const user = { id: probeAuthId, email: request.email, is_anonymous: false }; users.push(user);
        return result('probe-create', { user });
      },
      generateLink: async request => {
        assert.equal(request.type, 'recovery');
        const user = users.find(user => user.email === request.email);
        return result('generate-link', { user, properties: { redirect_to: redirectMismatch ? 'https://unexpected.invalid' : request.options.redirectTo,
          action_link: 'PRIVATE_LINK_MUST_NOT_PRINT', email_otp: 'PRIVATE_OTP_MUST_NOT_PRINT', hashed_token: 'PRIVATE_HASH_MUST_NOT_PRINT' } });
      },
      deleteUser: async id => { assert.equal(id, probeAuthId); const user = users.find(user => user.id === id);
        if (failure !== 'delete-probe') users = users.filter(user => user.id !== id); return result('delete-probe', { user }); },
    } },
  };
  const recoveryClient = { auth: { resetPasswordForEmail: async (address, options) => {
    assert.equal(address, email); assert.deepEqual(options, { redirectTo: `${OWNER_ORIGIN}/?auth=recovery` }); return result('send-recovery', {});
  } } };
  return { admin, recoveryClient, calls, db, users: () => users, audit, setFailure(value) { failure = value; } };
}
const options = action => ({ action, email });
const provision = async f => onboardOwner(f.admin, options('invite-and-provision'));

test('default preflight is read-only and does not represent a password or owner login as verified', async () => {
  const f = fixture(); const result = await onboardOwner(f.admin, { email });
  assert.equal(result.action, 'preflight-only'); assert.equal(result.configured, false); assert.equal(result.emailSent, false);
  assert.equal(result.ownerFirstLoginVerified, false); assert.equal(result.passwordSetVerified, false);
  assert.ok(f.calls.every(call => call.startsWith('select:') || ['list-users', 'activation-preflight'].includes(call)));
});

test('explicit onboarding verifies redirects, sends one supported invitation and activates last with five exact grants', async () => {
  const f = fixture(); const result = await provision(f);
  assert.equal(result.configured, true); assert.equal(result.emailSent, true); assert.equal(result.redirectResolutionVerified, true);
  assert.deepEqual(f.db.account_capability_grants, OWNER_GRANTS);
  assert.equal(f.db.account_memberships[0].role_key, 'system_admin');
  assert.equal(f.calls.filter(call => call === 'generate-link').length, 2);
  assert.ok(f.calls.indexOf('delete-probe') < f.calls.indexOf('invite'));
  assert.ok(f.calls.indexOf('insert:account_capability_grants') < f.calls.indexOf('activate'));
  assert.equal(f.users().length, 1); assert.equal(f.users()[0].id, ownerAuthId);
  assert.ok(!JSON.stringify(result).includes('PRIVATE_')); assert.equal(result.professionalApprovalGranted, false);
});

test('an exact active configuration is read-only idempotent and never sends a second invite', async () => {
  const f = fixture(); await provision(f); f.calls.length = 0;
  const result = await provision(f); assert.equal(result.configured, true); assert.equal(result.emailSent, false);
  assert.ok(!f.calls.some(call => /invite|insert:|^activate$|probe-create/.test(call)));
});

test('existing unlinked Auth identity must be independently pinned before adoption', async () => {
  const f = fixture({ users: [owner()] });
  await assert.rejects(provision(f), /independently reviewed UUID/);
  assert.ok(!f.calls.some(call => /invite|insert:|^activate$/.test(call)));
  const result = await onboardOwner(f.admin, { ...options('invite-and-provision'), reviewedAuthId: ownerAuthId });
  assert.equal(result.configured, true); assert.equal(result.emailSent, false);
});

test('ambiguous, banned and anonymous Auth identities fail before changes', async () => {
  for (const users of [[owner(), { ...owner(), id: probeAuthId }], [{ ...owner(), is_anonymous: true }],
    [{ ...owner(), banned_until: '2999-01-01T00:00:00Z' }], [{ ...owner(), email_change: 'elsewhere@example.invalid' }]]) {
    const f = fixture({ users }); await assert.rejects(provision(f));
    assert.ok(!f.calls.some(call => /invite|insert:|^activate$/.test(call)));
  }
});

test('Auth inventory is paged before choosing the owner or sending an invite', async () => {
  const users = Array.from({ length: 250 }, (_, index) => ({ id: `synthetic-${index}`, email: `fixture-${index}@example.invalid` }));
  const f = fixture({ users: [...users, owner()] });
  await assert.rejects(provision(f), /independently reviewed UUID/);
  assert.equal(f.calls.filter(call => call === 'list-users').length, 2); assert.ok(!f.calls.includes('invite'));
});

test('reserved rows cannot adopt foreign metadata, lifecycle, linkage or expanded capability scope', async () => {
  for (const change of [
    f => { f.db.client_accounts[0].display_name = 'Different account'; },
    f => { f.db.facilities[0].account_id = probeAuthId; },
    f => { f.db.user_profiles[0].auth_user_id = probeAuthId; },
    f => { f.db.user_profiles[0].identity_status = 'removed'; },
    f => { f.db.account_access[0].membership_status = 'suspended'; },
    f => { f.db.account_capability_grants[1].scope_kind = 'all_facilities'; f.db.account_capability_grants[1].facility_id = null; },
    f => { f.db.account_capability_grants[0].revoked_at = '2026-10-09T12:00:00Z'; },
    f => { f.db.account_capability_grants.splice(0, 1); },
  ]) {
    const f = fixture(); await provision(f); change(f); f.calls.length = 0;
    await assert.rejects(provision(f)); assert.ok(!f.calls.some(call => /invite|insert:|^activate$/.test(call)));
  }
});

test('a formerly active profile cannot be reactivated even with unchanged identity and capabilities', async () => {
  const f = fixture(); await provision(f); f.db.user_profiles[0].identity_status = 'suspended'; f.calls.length = 0;
  await assert.rejects(provision(f), /cannot restore/); assert.ok(!f.calls.includes('activate'));
});

test('partial setup remains suspended and can safely resume through the atomic activation operation', async () => {
  const f = fixture({ failure: 'activate' }); await assert.rejects(provision(f), /activation failed/);
  assert.equal(f.db.user_profiles[0].identity_status, 'suspended');
  assert.equal(f.db.account_capability_grants.length, 5);
  assert.ok(!f.calls.some(call => call.startsWith('delete:')));
  f.setFailure(undefined); f.calls.length = 0;
  const result = await provision(f); assert.equal(result.configured, true); assert.equal(result.emailSent, false);
  assert.ok(!f.calls.some(call => call.startsWith('insert:'))); assert.ok(f.calls.includes('activate'));
});

test('recovery is explicit, verifies redirects and changes no application permissions', async () => {
  const f = fixture(); await provision(f); f.calls.length = 0;
  const before = structuredClone(f.db);
  const result = await onboardOwner(f.admin, options('send-recovery'), { recoveryClient: f.recoveryClient });
  assert.equal(result.emailSent, true); assert.equal(result.emailDeliveryVerified, false); assert.deepEqual(f.db, before);
  assert.equal(f.calls.filter(call => call === 'send-recovery').length, 1); assert.ok(!f.calls.includes('invite'));
});

test('redirect fallback or generation failure retires only its exact synthetic Auth probe and never emails owner', async () => {
  for (const settings of [{ redirectMismatch: true }, { failure: 'generate-link' }]) {
    const f = fixture(settings); await assert.rejects(provision(f), error => !/PRIVATE_|RAW_PROVIDER_/.test(error.message));
    assert.equal(f.users().length, 0); assert.ok(f.calls.includes('delete-probe')); assert.ok(!f.calls.includes('invite'));
    assert.equal(f.db.user_profiles.length, 0);
  }
});

test('unconfirmed cleanup fails the whole redirect probe and no owner email is sent', async () => {
  const f = fixture({ failure: 'delete-probe' });
  await assert.rejects(provision(f), /cleanup failed/); assert.ok(!f.calls.includes('invite'));
  assert.equal(f.users().length, 1);
});

test('all provider error bodies are sanitized, including missing schema and activation RPC', async () => {
  for (const failure of ['select:user_profiles', 'activation-preflight', 'list-users', 'invite', 'insert:account_access', 'activate']) {
    const f = fixture({ failure });
    await assert.rejects(provision(f), error => !/RAW_PROVIDER_|PRIVATE_/.test(error.message));
    if (['select:user_profiles', 'activation-preflight', 'list-users'].includes(failure)) assert.ok(!f.calls.includes('invite'));
  }
});

test('incorrect owner email, action, reviewed UUID or backend is rejected before requests', () => {
  for (const input of [{ email: 'not-owner@example.invalid' }, { email, action: 'grant-all' }, { email, reviewedAuthId: 'not-an-id' }])
    assert.throws(() => ownerOptions(input));
  const env = { AUXILIUMOS_TEST_URL: OWNER_TARGET, AUXILIUMOS_TEST_SERVICE_ROLE_KEY: 'server-secret-fixture',
    AUXILIUMOS_TEST_PUBLISHABLE_KEY: 'sb_publishable_fixture', OWNER_ONBOARDING_EMAIL: email };
  assert.equal(ownerConfiguration(env).action, 'preflight-only');
  assert.throws(() => ownerConfiguration({ ...env, AUXILIUMOS_TEST_URL: 'http://localhost:54321' }));
  assert.throws(() => ownerConfiguration({ ...env, AUXILIUMOS_TEST_SERVICE_ROLE_KEY: '' }));
  for (const url of ['https://evil.invalid/auth/v1/admin/users', `${OWNER_TARGET}/storage/v1/bucket`, `${OWNER_TARGET}.evil.invalid/rest/v1/user_profiles`])
    assert.throws(() => ownerFetch(url), /outside the approved/);
});

test('CLI errors never print supplied credentials or accept command-line values', () => {
  const result = spawnSync(process.execPath, [sourceUrl.pathname, '--secret=DO_NOT_PRINT'], {
    encoding: 'utf8', env: { PATH: process.env.PATH, AUXILIUMOS_TEST_SERVICE_ROLE_KEY: 'DO_NOT_PRINT' },
  });
  assert.equal(result.status, 1); assert.equal(result.stdout, ''); assert.ok(!result.stderr.includes('DO_NOT_PRINT'));
});
