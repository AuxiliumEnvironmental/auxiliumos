import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { cleanupFixtures, configuration, preflightSchema, recordCreatedAuth } from './fixture-cleanup.mjs';

const ACCOUNT_COLUMNS = 'id,display_name,is_demo';
const FACILITY_COLUMNS = 'id,account_id,display_name,is_demo';
const PROFILE_COLUMNS = 'id,display_name,identity_status,is_demo';

function client(config, key, token) {
  return createClient(config.url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(token ? { accessToken: async () => token } : {}),
    global: {
      // Do not forward credentials to a redirected host; bound every HTTP call.
      fetch: (input, init) => fetch(input, {
        ...init, redirect: 'error', signal: AbortSignal.timeout(15_000),
      }),
    },
  });
}

async function response(label, operation) {
  try {
    return await operation;
  } catch {
    // Provider errors can contain request details. Never attach their raw cause.
    throw new Error(`${label}: request failed; provider details omitted.`);
  }
}

function success(result, label) {
  if (result.error) {
    const status = result.status ?? result.error.status;
    throw new Error(`${label}: API failed (HTTP ${Number.isInteger(status) ? status : 'unavailable'}); provider details omitted.`);
  }
  return result.data;
}

async function ok(label, operation) {
  return success(await response(label, operation), label);
}

function permissionDenied(result) {
  return result.error?.code === '42501' && [401, 403].includes(result.status);
}

async function denied(label, operation) {
  const result = await response(label, operation);
  assert.ok(permissionDenied(result), `${label}: expected a database permission denial, not a constraint, transport, or invalid-session error.`);
}

function sameIds(rows, ids, label) {
  assert.ok(Array.isArray(rows), `${label}: expected an array.`);
  assert.ok(JSON.stringify(rows.map(({ id }) => id).sort()) === JSON.stringify([...ids].sort()),
    `${label}: returned rows did not match the permitted fixture IDs.`);
}

function onlyColumns(rows, columns, label) {
  const expected = columns.split(',').sort().join(',');
  assert.ok(rows.every((row) => Object.keys(row).sort().join(',') === expected),
    `${label}: response contained an unexpected column.`);
}

async function directoryRows(subject, fixtures, accountIds, facilityIds, label) {
  const accounts = await ok(`${label} accounts`, subject.data.from('client_accounts')
    .select(ACCOUNT_COLUMNS).in('id', fixtures.accountIds).order('id'));
  const facilities = await ok(`${label} facilities`, subject.data.from('facilities')
    .select(FACILITY_COLUMNS).in('id', fixtures.facilityIds).order('id'));
  sameIds(accounts, accountIds, `${label} accounts`);
  sameIds(facilities, facilityIds, `${label} facilities`);
  onlyColumns(accounts, ACCOUNT_COLUMNS, `${label} accounts`);
  onlyColumns(facilities, FACILITY_COLUMNS, `${label} facilities`);
}

async function stillAuthenticated(subject, label) {
  // Pass the original, Auth-issued token explicitly. Never refresh/re-sign in A.
  const data = await ok(label, subject.login.auth.getUser(subject.token));
  assert.ok(data.user?.id === subject.authId, `${label}: Auth did not validate the original subject.`);
}

function canonical(rows) {
  return JSON.stringify(rows.map((row) => Object.fromEntries(Object.entries(row).sort()))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))));
}

function fixtureScope(query, table, f) {
  if (table === 'account_access') {
    return query.or(f.accessPairs.map(([accountId, profileId]) =>
      `and(account_id.eq.${accountId},user_profile_id.eq.${profileId})`).join(','));
  }
  return query.in('id', f.idsByTable[table]);
}

async function snapshot(admin, f) {
  const result = {};
  for (const table of Object.keys(f.idsByTable).concat('account_access')) {
    const rows = await ok(`Read ${table} fixture state`, fixtureScope(admin.from(table).select('*'), table, f));
    result[table] = canonical(rows);
  }
  return result;
}

function fixtures() {
  const ids = Object.fromEntries([
    'accountA', 'accountB', 'accountProbe', 'profileA', 'profileB', 'profileRoleOnly', 'profileProbe',
    'facilityA1', 'facilityA2', 'facilityB1', 'facilityProbe', 'memberA', 'memberAdminA', 'memberB',
    'memberRoleOnly', 'memberProbe', 'grantAccountA', 'grantA1', 'grantAccountB', 'grantB1',
    'grantAllA', 'grantAtoB', 'grantAtoB1', 'grantProbe', 'auditProbe',
  ].map((name) => [name, randomUUID()]));
  return {
    ...ids,
    runId: randomUUID(), createdAuth: [], profileIdByAuthId: new Map(), auditProbeAttempted: false,
    accountIds: [ids.accountA, ids.accountB],
    facilityIds: [ids.facilityA1, ids.facilityA2, ids.facilityB1],
    accessPairs: [
      [ids.accountA, ids.profileA], [ids.accountB, ids.profileB],
      [ids.accountA, ids.profileRoleOnly], [ids.accountB, ids.profileA],
    ],
    grantTargets: [
      [ids.grantAccountA, ids.accountA, ids.profileA], [ids.grantA1, ids.accountA, ids.profileA],
      [ids.grantAccountB, ids.accountB, ids.profileB], [ids.grantB1, ids.accountB, ids.profileB],
      [ids.grantAllA, ids.accountA, ids.profileA], [ids.grantAtoB, ids.accountB, ids.profileA],
      [ids.grantAtoB1, ids.accountB, ids.profileA], [ids.grantProbe, ids.accountA, ids.profileA],
    ],
    idsByTable: {
      client_accounts: [ids.accountA, ids.accountB, ids.accountProbe],
      user_profiles: [ids.profileA, ids.profileB, ids.profileRoleOnly, ids.profileProbe],
      facilities: [ids.facilityA1, ids.facilityA2, ids.facilityB1, ids.facilityProbe],
      account_memberships: [ids.memberA, ids.memberAdminA, ids.memberB, ids.memberRoleOnly, ids.memberProbe],
      account_capability_grants: [ids.grantAccountA, ids.grantA1, ids.grantAccountB, ids.grantB1,
        ids.grantAllA, ids.grantAtoB, ids.grantAtoB1, ids.grantProbe],
    },
  };
}

function grant(id, accountId, profileId, capability, scope, facilityId = null) {
  return { id, account_id: accountId, user_profile_id: profileId, capability_key: capability,
    scope_kind: scope, facility_id: facilityId, revoked_at: null, is_demo: true };
}

test('SEC-001B authentic Supabase identity and directory API acceptance', async (t) => {
  // Fail before constructing clients or making requests if secure config is absent.
  const config = configuration();
  const admin = client(config, config.serviceRoleKey);
  // This performs SELECTs only, before any fixture/Auth creation request.
  await preflightSchema(admin);
  const anonymous = client(config, config.publishableKey);
  const f = fixtures();
  t.after(async () => cleanupFixtures(admin, f, (message) => t.diagnostic(message)));
  t.diagnostic(`Synthetic fixture run ${f.runId}; target ${config.url}.`);

  async function createSubject(label) {
    const email = `api-${f.runId}-${label}@identity-directory.invalid`;
    const password = `${randomBytes(36).toString('base64url')}aA1!`;
    const created = await ok('Create synthetic Auth user', admin.auth.admin.createUser({
      email, password, email_confirm: true,
    }));
    // Register a destructive cleanup target only after both identity fields
    // match the object created by this run. A mismatched response is never owned.
    recordCreatedAuth(f, created.user, label);
    const login = client(config, config.publishableKey);
    const signedIn = await ok('Sign in synthetic Auth user', login.auth.signInWithPassword({ email, password }));
    assert.ok(signedIn.user?.id === created.user.id && typeof signedIn.session?.access_token === 'string',
      'Password sign-in did not return the expected real Auth session.');
    const token = signedIn.session.access_token;
    const subject = { authId: created.user.id, login, token, data: client(config, config.publishableKey, token) };
    await stillAuthenticated(subject, 'Verify synthetic Auth identity');
    return subject;
  }

  const a = await createSubject('a');
  const b = await createSubject('b');
  const roleOnly = await createSubject('role-only');
  const unlinked = await createSubject('unlinked');
  f.profileIdByAuthId = new Map([
    [a.authId, f.profileA], [b.authId, f.profileB], [roleOnly.authId, f.profileRoleOnly],
  ]);

  await ok('Create two synthetic accounts', admin.from('client_accounts').insert([
    { id: f.accountA, display_name: `API ${f.runId} account A`, is_demo: true },
    { id: f.accountB, display_name: `API ${f.runId} account B`, is_demo: true },
  ]));
  // Link creation and activation are separate trusted operations. The database
  // owns immutable link history; never supply/reset it or unlink for cleanup.
  await ok('Create linked suspended synthetic profiles', admin.from('user_profiles').insert([
    { id: f.profileA, auth_user_id: a.authId, display_name: `API ${f.runId} A`, identity_status: 'suspended', is_demo: true },
    { id: f.profileB, auth_user_id: b.authId, display_name: `API ${f.runId} B`, identity_status: 'suspended', is_demo: true },
    { id: f.profileRoleOnly, auth_user_id: roleOnly.authId, display_name: `API ${f.runId} role only`, identity_status: 'suspended', is_demo: true },
  ]));
  await ok('Create A1 A2 B1 facilities', admin.from('facilities').insert([
    { id: f.facilityA1, account_id: f.accountA, display_name: `API ${f.runId} A1`, is_demo: true },
    { id: f.facilityA2, account_id: f.accountA, display_name: `API ${f.runId} A2`, is_demo: true },
    { id: f.facilityB1, account_id: f.accountB, display_name: `API ${f.runId} B1`, is_demo: true },
  ]));
  await ok('Create independent active account access', admin.from('account_access').insert([
    { account_id: f.accountA, user_profile_id: f.profileA, membership_status: 'active', is_demo: true },
    { account_id: f.accountB, user_profile_id: f.profileB, membership_status: 'active', is_demo: true },
    { account_id: f.accountA, user_profile_id: f.profileRoleOnly, membership_status: 'active', is_demo: true },
  ]));
  await ok('Create legacy roles without implied authority', admin.from('account_memberships').insert([
    { id: f.memberA, account_id: f.accountA, user_profile_id: f.profileA, role_key: 'site_champion', is_demo: true },
    { id: f.memberAdminA, account_id: f.accountA, user_profile_id: f.profileA, role_key: 'system_admin', is_demo: true },
    { id: f.memberB, account_id: f.accountB, user_profile_id: f.profileB, role_key: 'document_viewer', is_demo: true },
    { id: f.memberRoleOnly, account_id: f.accountA, user_profile_id: f.profileRoleOnly, role_key: 'system_admin', is_demo: true },
  ]));
  await ok('Create only explicit directory grants', admin.from('account_capability_grants').insert([
    grant(f.grantAccountA, f.accountA, f.profileA, 'view_account', 'account'),
    grant(f.grantA1, f.accountA, f.profileA, 'view_asset', 'facility', f.facilityA1),
    grant(f.grantAccountB, f.accountB, f.profileB, 'view_account', 'account'),
    grant(f.grantB1, f.accountB, f.profileB, 'view_asset', 'facility', f.facilityB1),
  ]));

  async function scenario(name, body) {
    let failed = false;
    await t.test(name, async () => {
      try { await body(); } catch (error) { failed = true; throw error; }
    });
    assert.ok(!failed, 'API acceptance stopped after a failed case; fixture cleanup will run.');
  }

  await scenario('anonymous requests have no application table privileges', async () => {
    for (const [table, columns] of [
      ['user_profiles', PROFILE_COLUMNS], ['client_accounts', ACCOUNT_COLUMNS], ['facilities', FACILITY_COLUMNS],
      ['account_access', 'account_id'], ['account_capability_grants', 'id'], ['account_memberships', 'id'],
      ['incident_requests', 'id'], ['documents', 'id'], ['audit_events', 'id'],
    ]) {
      await denied(`Anonymous ${table} read`, anonymous.from(table).select(columns).limit(1));
    }
  });

  await scenario('linked profiles begin suspended and require explicit server activation', async () => {
    for (const subject of [a, b, roleOnly]) {
      const rows = await ok('Read newly linked suspended profile', subject.data.from('user_profiles').select(PROFILE_COLUMNS));
      sameIds(rows, [], 'Newly linked suspended profile');
      await directoryRows(subject, f, [], [], 'Suspended profile before activation');
      await stillAuthenticated(subject, 'Auth is valid before profile activation');
    }
    const profileIds = [f.profileA, f.profileB, f.profileRoleOnly];
    const activated = await ok('Explicitly activate this run\'s linked profiles', admin.from('user_profiles')
      .update({ identity_status: 'active' }).in('id', profileIds)
      .eq('identity_status', 'suspended').eq('is_demo', true).select('id,identity_status'));
    sameIds(activated, profileIds, 'Explicitly activated profiles');
    assert.ok(activated.every(({ identity_status }) => identity_status === 'active'), 'Profile activation did not persist.');
  });

  await scenario('real Auth, own profile and explicit account/facility reads succeed', async () => {
    for (const [subject, profileId] of [[a, f.profileA], [b, f.profileB], [roleOnly, f.profileRoleOnly]]) {
      const rows = await ok('Read current active profile', subject.data.from('user_profiles').select(PROFILE_COLUMNS));
      sameIds(rows, [profileId], 'Current active profile');
      onlyColumns(rows, PROFILE_COLUMNS, 'Current active profile');
      assert.ok(rows[0].identity_status === 'active' && rows[0].is_demo === true, 'Expected active demo profile.');
    }
    await directoryRows(a, f, [f.accountA], [f.facilityA1], 'Subject A');
    await directoryRows(b, f, [f.accountB], [f.facilityB1], 'Subject B');
    await directoryRows(roleOnly, f, [], [], 'Legacy system_admin without grants');
    const profiles = await ok('Read unlinked subject profile', unlinked.data.from('user_profiles').select(PROFILE_COLUMNS));
    sameIds(profiles, [], 'Unlinked subject profile');
    await directoryRows(unlinked, f, [], [], 'Unlinked authenticated subject');
    await stillAuthenticated(unlinked, 'Unlinked token is valid Auth');
  });

  await scenario('hidden columns and authorization/business tables stay unreadable', async () => {
    for (const [table, columns] of [
      ['user_profiles', 'id,auth_user_id'], ['client_accounts', 'id,created_at'], ['facilities', 'id,updated_at'],
      ['user_profiles', '*'], ['client_accounts', '*'], ['facilities', '*'],
      ['account_access', 'account_id,user_profile_id,membership_status'], ['account_capability_grants', 'id'],
      ['account_memberships', 'id'], ['incident_requests', 'id'], ['documents', 'id'], ['audit_events', 'id'],
    ]) {
      await denied(`Authenticated ${table} restricted read`, a.data.from(table).select(columns).limit(1));
    }
  });

  await scenario('filters, exact counts and both join directions preserve isolation', async () => {
    for (const [table, column, id] of [
      ['client_accounts', 'id', f.accountB], ['facilities', 'id', f.facilityA2],
      ['facilities', 'id', f.facilityB1], ['facilities', 'account_id', f.accountB],
      ['user_profiles', 'id', f.profileB],
    ]) {
      const rows = await ok('Read forbidden filtered fixture', a.data.from(table).select('id').eq(column, id));
      sameIds(rows, [], 'Forbidden filtered fixture');
      const counted = await response('Count forbidden filtered fixture', a.data.from(table)
        .select('id', { count: 'exact', head: true }).eq(column, id));
      success(counted, 'Count forbidden filtered fixture');
      assert.ok(counted.count === 0 && counted.data === null, 'Forbidden fixture leaked through an exact count.');
    }
    for (const [table, ids] of [['client_accounts', f.accountIds], ['facilities', f.facilityIds]]) {
      const counted = await response('Count visible fixtures', a.data.from(table)
        .select('id', { count: 'exact', head: true }).in('id', ids));
      success(counted, 'Count visible fixtures');
      assert.ok(counted.count === 1, 'Count included a forbidden fixture or omitted the allowed fixture.');
    }
    const embedded = `${ACCOUNT_COLUMNS},facilities!facilities_account_fk(${FACILITY_COLUMNS})`;
    const accounts = await ok('Join accounts to facilities', a.data.from('client_accounts').select(embedded).in('id', f.accountIds));
    sameIds(accounts, [f.accountA], 'Account join');
    sameIds(accounts[0].facilities, [f.facilityA1], 'Embedded facilities');
    for (const forbiddenId of [f.facilityA2, f.facilityB1]) {
      const rows = await ok('Filter an inner facility join', a.data.from('client_accounts')
        .select(`${ACCOUNT_COLUMNS},facilities!facilities_account_fk!inner(${FACILITY_COLUMNS})`)
        .in('id', f.accountIds).eq('facilities.id', forbiddenId));
      sameIds(rows, [], 'Forbidden inner join filter');
    }
    const facilities = await ok('Join facilities to accounts', a.data.from('facilities')
      .select(`${FACILITY_COLUMNS},client_accounts!facilities_account_fk(${ACCOUNT_COLUMNS})`).in('id', f.facilityIds));
    sameIds(facilities, [f.facilityA1], 'Facility join');
    assert.ok(facilities[0].client_accounts?.id === f.accountA, 'Facility join exposed an unexpected account.');
  });

  await scenario('self-elevation, forged actors and all directory table writes are denied', async () => {
    const before = await snapshot(admin, f);
    const writes = [
      ['client_accounts', { id: f.accountProbe, display_name: `API ${f.runId} forbidden account`, is_demo: true },
        { display_name: `API ${f.runId} forbidden rename` }, (query) => query.eq('id', f.accountA)],
      ['user_profiles', { id: f.profileProbe, auth_user_id: null, identity_status: 'active', display_name: `API ${f.runId} forbidden profile`, is_demo: true },
        { display_name: `API ${f.runId} forbidden profile rename` }, (query) => query.eq('id', f.profileA)],
      ['facilities', { id: f.facilityProbe, account_id: f.accountA, display_name: `API ${f.runId} forbidden facility`, is_demo: true },
        { display_name: `API ${f.runId} forbidden facility rename` }, (query) => query.eq('id', f.facilityA1)],
      ['account_access', { account_id: f.accountB, user_profile_id: f.profileA, membership_status: 'active', is_demo: true },
        { membership_status: 'suspended' }, (query) => query.eq('account_id', f.accountA).eq('user_profile_id', f.profileA)],
      ['account_memberships', { id: f.memberProbe, account_id: f.accountA, user_profile_id: f.profileA, role_key: 'document_viewer', is_demo: true },
        { role_key: 'document_viewer' }, (query) => query.eq('id', f.memberA)],
      ['account_capability_grants', grant(f.grantProbe, f.accountA, f.profileA, 'view_asset', 'facility', f.facilityA2),
        { facility_id: f.facilityA2 }, (query) => query.eq('id', f.grantA1)],
    ];
    for (const [table, insert, update, filter] of writes) {
      await denied(`Client ${table} insert`, a.data.from(table).insert(insert));
      await denied(`Client ${table} update`, filter(a.data.from(table).update(update)));
      await denied(`Client ${table} delete`, filter(a.data.from(table).delete()));
    }
    await denied('Client profile relink and status elevation', a.data.from('user_profiles')
      .update({ auth_user_id: b.authId, identity_status: 'active' }).eq('id', f.profileA));
    await denied('Client capability upsert', a.data.from('account_capability_grants')
      .upsert(grant(f.grantProbe, f.accountA, f.profileA, 'view_asset', 'facility', f.facilityA2)));
    f.auditProbeAttempted = true;
    const auditResult = await response('Client forged audit actor insert', a.data.from('audit_events').insert({
      id: f.auditProbe, account_id: f.accountA, actor_user_profile_id: f.profileB,
      object_type: 'client_account', object_id: f.accountB, event_type: 'api_acceptance_forged_actor',
      event_metadata: { actor_kind: 'user', actor_auth_user_id: b.authId },
      occurred_at: '2000-01-01T00:00:00.000Z', is_internal_only: true, is_demo: true,
    }));
    assert.ok(permissionDenied(auditResult), 'Client audit insertion must fail with a database permission denial.');
    const auditRows = await ok('Check exact audit probe ID', admin.from('audit_events').select('id').eq('id', f.auditProbe));
    sameIds(auditRows, [], 'Denied audit insert');
    const after = await snapshot(admin, f);
    assert.ok(JSON.stringify(before) === JSON.stringify(after), 'A denied client write changed generated directory/authorization rows.');
    await directoryRows(a, f, [f.accountA], [f.facilityA1], 'After denied writes');
    await stillAuthenticated(a, 'Token remains valid after denied writes');
  });

  async function revoke(grantId, revoked) {
    await ok('Change exact synthetic grant revocation', admin.from('account_capability_grants')
      .update({ revoked_at: revoked ? new Date().toISOString() : null }).eq('id', grantId).eq('is_demo', true));
  }

  await scenario('the same valid token loses access immediately after grant revocation', async () => {
    await revoke(f.grantA1, true);
    await stillAuthenticated(a, 'Held token after facility grant revocation');
    await directoryRows(a, f, [f.accountA], [], 'Account read without a facility grant');
    await revoke(f.grantA1, false);
    await directoryRows(a, f, [f.accountA], [f.facilityA1], 'Restored facility grant');
    await revoke(f.grantAccountA, true);
    await stillAuthenticated(a, 'Held token after account grant revocation');
    await directoryRows(a, f, [], [], 'Facility access requires account read');
    await revoke(f.grantAccountA, false);
    await directoryRows(a, f, [f.accountA], [f.facilityA1], 'Restored account grant');
  });

  await scenario('explicit all-facilities scope is restricted to one account', async () => {
    await ok('Grant explicit all-facilities access in A', admin.from('account_capability_grants')
      .insert(grant(f.grantAllA, f.accountA, f.profileA, 'view_asset', 'all_facilities')));
    await directoryRows(a, f, [f.accountA], [f.facilityA1, f.facilityA2], 'Explicit all-facilities A grant');
    await revoke(f.grantAllA, true);
    await directoryRows(a, f, [f.accountA], [f.facilityA1], 'Revoked all-facilities grant');
  });

  await scenario('invited/suspended/removed membership defeats a second legacy admin role with the same token', async () => {
    for (const status of ['invited', 'suspended', 'removed']) {
      await ok('Change synthetic membership lifecycle', admin.from('account_access')
        .update({ membership_status: status }).eq('account_id', f.accountA).eq('user_profile_id', f.profileA).eq('is_demo', true));
      await stillAuthenticated(a, `Held token during ${status} membership`);
      await directoryRows(a, f, [], [], `${status} membership with legacy roles`);
      const roles = await ok('Verify legacy roles were retained', admin.from('account_memberships')
        .select('id,role_key').in('id', [f.memberA, f.memberAdminA]));
      sameIds(roles, [f.memberA, f.memberAdminA], 'Retained legacy roles');
      assert.ok(roles.some(({ role_key }) => role_key === 'system_admin'), 'The alternate admin role must still exist during denial.');
      await ok('Restore synthetic active membership', admin.from('account_access')
        .update({ membership_status: 'active' }).eq('account_id', f.accountA).eq('user_profile_id', f.profileA).eq('is_demo', true));
      await directoryRows(a, f, [f.accountA], [f.facilityA1], 'Restored membership');
    }
  });

  await scenario('profile suspension/removal denies both explicitly granted accounts with the same token', async () => {
    await ok('Add explicit second-account membership for suspension evidence', admin.from('account_access').insert({
      account_id: f.accountB, user_profile_id: f.profileA, membership_status: 'active', is_demo: true,
    }));
    await ok('Grant bounded second-account directory access', admin.from('account_capability_grants').insert([
      grant(f.grantAtoB, f.accountB, f.profileA, 'view_account', 'account'),
      grant(f.grantAtoB1, f.accountB, f.profileA, 'view_asset', 'facility', f.facilityB1),
    ]));
    await directoryRows(a, f, f.accountIds, [f.facilityA1, f.facilityB1], 'Before global profile suspension');
    for (const status of ['suspended', 'removed']) {
      await ok('Change synthetic profile lifecycle', admin.from('user_profiles')
        .update({ identity_status: status }).eq('id', f.profileA).eq('is_demo', true));
      await stillAuthenticated(a, `Held token during ${status} profile`);
      await directoryRows(a, f, [], [], `${status} profile across two accounts`);
      const rows = await ok('Read inactive current profile', a.data.from('user_profiles').select(PROFILE_COLUMNS));
      sameIds(rows, [], 'Inactive profile');
      await ok('Restore synthetic active profile', admin.from('user_profiles')
        .update({ identity_status: 'active' }).eq('id', f.profileA).eq('is_demo', true));
      await directoryRows(a, f, f.accountIds, [f.facilityA1, f.facilityB1], 'Restored profile');
    }
  });
});
