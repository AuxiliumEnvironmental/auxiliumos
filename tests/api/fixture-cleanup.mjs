import assert from 'node:assert/strict';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEVELOPMENT_URL = 'https://txofqxictwecgcnvezlb.supabase.co';
const LOCAL_URLS = new Set(['http://127.0.0.1:54321', 'http://localhost:54321']);
const LABELS = new Set(['a', 'b', 'role-only', 'unlinked']);
const PROFILE_COLUMNS = 'id,auth_user_id,identity_status,auth_linked_once,is_demo';
const ACCESS_COLUMNS = 'account_id,user_profile_id,membership_status,is_demo';
const GRANT_COLUMNS = 'id,account_id,user_profile_id,revoked_at,is_demo';

export function configuration(environment = process.env) {
  const names = ['AUXILIUMOS_TEST_URL', 'AUXILIUMOS_TEST_PUBLISHABLE_KEY', 'AUXILIUMOS_TEST_SERVICE_ROLE_KEY'];
  const missing = names.filter((name) => !environment[name]?.trim());
  assert.ok(missing.length === 0,
    `API acceptance requires secure runtime configuration: missing ${missing.join(', ')}. No API checks ran; this is not a passing or skipped acceptance result.`);
  const url = environment.AUXILIUMOS_TEST_URL;
  assert.ok(url === DEVELOPMENT_URL || LOCAL_URLS.has(url),
    'AUXILIUMOS_TEST_URL must exactly match the approved development project or a documented local Supabase URL. No API checks ran.');
  const publishableKey = environment.AUXILIUMOS_TEST_PUBLISHABLE_KEY;
  const serviceRoleKey = environment.AUXILIUMOS_TEST_SERVICE_ROLE_KEY;
  assert.ok(publishableKey !== serviceRoleKey && !publishableKey.startsWith('sb_secret_'),
    'API acceptance requires distinct browser and server keys; a server key must not be used as the publishable key.');
  if (publishableKey.split('.').length === 3) {
    let role;
    try {
      role = JSON.parse(Buffer.from(publishableKey.split('.')[1], 'base64url').toString()).role;
    } catch {
      assert.fail('The legacy publishable key is not a valid key configuration.');
    }
    assert.ok(role === 'anon', 'A legacy browser key must have the anon role.');
  }
  return { url, publishableKey, serviceRoleKey };
}

// Read-only capability checks, not proof of installed trigger bodies, grants for
// writes, or deployment parity. In particular, pre-audit schemas must fail here,
// before the first Auth or application fixture creation request.
export async function preflightSchema(admin) {
  const columns = {
    client_accounts: 'id,display_name,is_demo,created_at,updated_at',
    facilities: 'id,account_id,display_name,is_demo,created_at,updated_at',
    user_profiles: `${PROFILE_COLUMNS},display_name,created_at,updated_at`,
    account_access: `${ACCESS_COLUMNS},created_at,updated_at`,
    account_memberships: 'id,account_id,user_profile_id,role_key,is_demo,created_at,updated_at',
    account_capability_grants: `${GRANT_COLUMNS},capability_key,scope_kind,facility_id,created_at`,
    audit_events: 'id,account_id,actor_user_profile_id,actor_kind,actor_auth_user_id,actor_system_key,correlation_id,object_type,object_id,event_type,event_metadata,occurred_at,is_internal_only,is_demo',
  };
  for (const [table, selection] of Object.entries(columns)) {
    try {
      const rows = await data(admin.from(table).select(selection).limit(0));
      assert.ok(rows.length === 0);
    } catch {
      throw new Error(`Read-only schema preflight failed for ${table}; reconcile the foundation, identity/directory and SEC-001C audit contracts and schema cache. No fixture or Auth creation was attempted; provider details omitted.`);
    }
  }
}

export function recordCreatedAuth(f, user, label) {
  assert.ok(UUID.test(f.runId) && LABELS.has(label), 'Invalid synthetic Auth registration scope.');
  const email = `api-${f.runId}-${label}@identity-directory.invalid`;
  assert.ok(UUID.test(user?.id ?? '') && user.email === email,
    'Auth returned an unexpected created identity; no cleanup ownership was registered. Secure operator investigation is required.');
  assert.ok(!f.createdAuth.some((entry) => entry.id === user.id || entry.email === email),
    'Duplicate synthetic Auth creation response; no additional cleanup ownership was registered.');
  // Never register guessed IDs, email-search results or pre-existing identities.
  f.createdAuth.push({ id: user.id, email });
}

async function data(operation) {
  const result = await operation;
  assert.ok(result && !result.error, 'Provider operation failed; details omitted.');
  assert.ok(Array.isArray(result.data), 'Expected a row array; provider details omitted.');
  return result.data;
}

function scoped(query, filters) {
  return filters.reduce((current, [column, value]) => current.eq(column, value), query);
}

function manifest(f) {
  assert.ok(UUID.test(f.runId), 'Invalid fixture manifest.');
  const tables = ['client_accounts', 'facilities', 'user_profiles', 'account_memberships', 'account_capability_grants'];
  const ids = tables.flatMap((table) => {
    assert.ok(Array.isArray(f.idsByTable[table]) && f.idsByTable[table].every((id) => UUID.test(id)), 'Invalid fixture manifest.');
    return f.idsByTable[table];
  });
  assert.ok(new Set(ids).size === ids.length && UUID.test(f.auditProbe), 'Invalid fixture manifest.');
  const accounts = new Set(f.idsByTable.client_accounts);
  const profiles = new Set(f.idsByTable.user_profiles);
  assert.ok(Array.isArray(f.accessPairs) && f.accessPairs.every(([account, profile]) => accounts.has(account) && profiles.has(profile)), 'Invalid fixture manifest.');
  const pairs = new Set(f.accessPairs.map((pair) => pair.join('/')));
  assert.ok(pairs.size === f.accessPairs.length, 'Invalid fixture manifest.');
  assert.ok(Array.isArray(f.grantTargets) && f.grantTargets.length === f.idsByTable.account_capability_grants.length
    && new Set(f.grantTargets.map(([id]) => id)).size === f.grantTargets.length
    && f.grantTargets.every(([id, account, profile]) => f.idsByTable.account_capability_grants.includes(id) && pairs.has(`${account}/${profile}`)), 'Invalid fixture manifest.');
  assert.ok(Array.isArray(f.createdAuth) && f.createdAuth.every(({ id, email }) => UUID.test(id)
    && [...LABELS].some((label) => email === `api-${f.runId}-${label}@identity-directory.invalid`)), 'Invalid fixture Auth ownership manifest.');
  assert.ok(new Set(f.createdAuth.map(({ id }) => id)).size === f.createdAuth.length
    && new Set(f.createdAuth.map(({ email }) => email)).size === f.createdAuth.length, 'Invalid fixture Auth ownership manifest.');
  assert.ok(f.profileIdByAuthId instanceof Map && [...f.profileIdByAuthId].every(([authId, profileId]) =>
    f.createdAuth.some(({ id }) => id === authId) && profiles.has(profileId)), 'Invalid fixture profile ownership manifest.');
  assert.ok(new Set(f.profileIdByAuthId.values()).size === f.profileIdByAuthId.size, 'Invalid fixture profile ownership manifest.');
  return pairs;
}

async function currentAuth(admin, id) {
  const result = await admin.auth.admin.getUserById(id);
  if (result.error?.status === 404 && result.error.code === 'user_not_found') return null;
  assert.ok(result && !result.error && result.data?.user?.id === id, 'Auth lookup was not verified.');
  return result.data.user;
}

// Only caller-generated application IDs and confirmed createUser responses may
// enter this manifest. Application/audit rows are NEVER deleted here. Every
// independent target is attempted even when another target cannot be disabled.
export async function cleanupFixtures(admin, f, diagnostic = () => {}) {
  const pairs = manifest(f);
  const profileAuth = new Map([...f.profileIdByAuthId].map(([authId, profileId]) => [profileId, authId]));
  const report = { disabled: [], alreadyDisabled: [], absent: [], deletedAuthIds: [], absentAuthIds: [], retainedAuthIds: [], failures: [] };
  const attempt = async (label, operation) => {
    try { return await operation(); } catch { report.failures.push(label); return undefined; }
  };
  async function readOne(table, columns, filters) {
    const rows = await data(scoped(admin.from(table).select(columns), filters));
    assert.ok(rows.length <= 1, 'Exact fixture read returned multiple rows.');
    return rows[0];
  }
  async function disable(table, columns, filters, patch, isDisabled, owned = () => true, unchanged = () => true, readFilters = filters) {
    const label = `${table} [${filters.map(([, value]) => value).join('/')}]`;
    await attempt(label, async () => {
      const before = await readOne(table, columns, readFilters);
      if (!before) { report.absent.push(label); return; }
      assert.ok(before.is_demo === true && owned(before), 'Fixture ownership is not verified.');
      if (isDisabled(before)) { report.alreadyDisabled.push(label); return; }
      const changed = await data(scoped(admin.from(table).update(patch), filters).eq('is_demo', true).select(columns));
      assert.ok(changed.length === 1 && changed[0].is_demo === true && owned(changed[0]) && isDisabled(changed[0])
        && unchanged(before, changed[0]), 'The exact fixture update was not verified.');
      const after = await readOne(table, columns, readFilters);
      assert.ok(after && after.is_demo === true && owned(after) && isDisabled(after) && unchanged(before, after), 'Fixture disablement did not persist.');
      report.disabled.push(label);
    });
  }

  // Cut off the profile first, then independently retire memberships/grants.
  // Never write auth_user_id or auth_linked_once, even when cleanup is failing.
  for (const id of f.idsByTable.user_profiles) {
    await disable('user_profiles', PROFILE_COLUMNS, [['id', id]], { identity_status: 'removed' },
      (row) => row.identity_status === 'removed',
      (row) => typeof row.auth_linked_once === 'boolean'
        && (!profileAuth.has(id) || row.auth_linked_once === true)
        && (row.auth_user_id === null || (row.auth_user_id === profileAuth.get(id) && row.auth_linked_once === true)),
      (before, after) => before.auth_user_id === after.auth_user_id && before.auth_linked_once === after.auth_linked_once);
  }
  for (const [account, profile] of f.accessPairs) {
    await disable('account_access', ACCESS_COLUMNS, [['account_id', account], ['user_profile_id', profile]],
      { membership_status: 'removed' }, (row) => row.membership_status === 'removed');
  }
  const revokedAt = new Date().toISOString();
  for (const [id, account, profile] of f.grantTargets) {
    await disable('account_capability_grants', GRANT_COLUMNS, [['id', id], ['account_id', account], ['user_profile_id', profile]],
      { revoked_at: revokedAt }, (row) => typeof row.revoked_at === 'string' && Number.isFinite(Date.parse(row.revoked_at)),
      (row) => row.account_id === account && row.user_profile_id === profile, () => true, [['id', id]]);
  }

  if (f.auditProbeAttempted) {
    await attempt(`audit_events [${f.auditProbe}] unexpected or unreadable probe preserved; never deleted`, async () => {
      const rows = await data(admin.from('audit_events').select('id').eq('id', f.auditProbe));
      assert.ok(rows.length === 0, 'Unexpected audit probe is preserved for investigation.');
    });
  }

  for (const { id, email } of f.createdAuth) {
    let linked = [];
    const safe = await attempt(`auth user [${id}] retained: exact ownership or disabled profile/access could not be verified`, async () => {
      const user = await currentAuth(admin, id);
      if (user) assert.ok(user.email === email, 'Current Auth identity no longer matches this run.');
      // Do not hide non-demo or unexpected links behind an is_demo filter.
      linked = await data(admin.from('user_profiles').select(PROFILE_COLUMNS).eq('auth_user_id', id));
      assert.ok(linked.length <= 1, 'Unexpected Auth linkage.');
      if (!user) {
        assert.ok(linked.length === 0, 'Absent Auth still has a profile link.');
        report.absentAuthIds.push(id);
        return 'absent';
      }
      for (const profile of linked) {
        assert.ok(profile.id === f.profileIdByAuthId.get(id) && profile.is_demo === true
          && profile.auth_linked_once === true && ['removed', 'suspended'].includes(profile.identity_status), 'Linked profile is not safely disabled.');
        const access = await data(admin.from('account_access').select(ACCESS_COLUMNS).eq('user_profile_id', profile.id));
        assert.ok(access.every((row) => row.user_profile_id === profile.id && row.is_demo === true
          && pairs.has(`${row.account_id}/${row.user_profile_id}`)
          && ['removed', 'suspended', 'invited'].includes(row.membership_status)), 'Linked profile access is not safely disabled.');
      }
      // Recheck after the profile/access reads, immediately before deletion.
      assert.ok((await currentAuth(admin, id))?.email === email, 'Auth ownership changed during verification.');
      return 'safe';
    });
    if (safe === 'absent') continue;
    if (!safe) { report.retainedAuthIds.push(id); continue; }

    await attempt(`auth user [${id}] deletion request failed`, async () => {
      const result = await admin.auth.admin.deleteUser(id);
      assert.ok(result && !result.error, 'Auth deletion request failed.');
    });
    // A successful HTTP response is insufficient; an ambiguous failure may also
    // have committed. Read back either way, without changing the ownership set.
    const absent = await attempt(`auth user [${id}] deletion not verified`, async () => {
      assert.ok(await currentAuth(admin, id) === null, 'Auth user still exists.');
      return true;
    });
    if (absent) report.deletedAuthIds.push(id);
    else report.retainedAuthIds.push(id);
    for (const profile of linked) {
      await attempt(`user_profiles [${profile.id}] preserved unlink/history not verified after Auth deletion`, async () => {
        const after = await readOne('user_profiles', PROFILE_COLUMNS, [['id', profile.id]]);
        assert.ok(after && after.is_demo === true && after.auth_user_id === null
          && after.auth_linked_once === true && ['removed', 'suspended'].includes(after.identity_status), 'Preserved Auth unlink was not verified.');
      });
    }
  }

  // IDs are validated above. Do not include emails, provider responses or tokens.
  diagnostic(`Synthetic application/audit history retained; exact fixture candidate IDs (some probes may be absent): ${JSON.stringify(f.idsByTable)}; access pairs ${JSON.stringify(f.accessPairs)}; audit probe ${f.auditProbe}.`);
  diagnostic(`Auth cleanup: deleted and absence verified [${report.deletedAuthIds.join(', ')}]; already absent [${report.absentAuthIds.join(', ')}]; absence not confirmed [${report.retainedAuthIds.join(', ')}].`);
  if (report.failures.length) {
    const error = new Error(`Synthetic fixture cleanup incomplete; secure operator review required for exact IDs: ${report.failures.join('; ')}. Application/audit history was not deleted. Provider details omitted.`);
    error.report = report;
    throw error;
  }
  return report;
}
