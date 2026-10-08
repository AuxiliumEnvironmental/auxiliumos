import assert from "node:assert/strict";
import test from "node:test";
import {
  asClientRole,
  asProvisioningRole,
  createTestDatabase,
  foundationSeedUrl,
  runSqlFile,
  setSimulatedSubject,
} from "../helpers/pglite-database.mjs";

// Deliberately explicit: existing directory tests still test their two-migration
// boundary. No helper silently upgrades unrelated tests to this audit contract.
const auditMigrationUrl = new URL(
  "../../supabase/migrations/20261008154950_access_audit_provenance.sql", import.meta.url,
);
const id = (suffix, prefix = "00000000") =>
  `${prefix}-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const accountA = id(1);
const accountB = id(2);
const accountC = id(3);
const facilityA = id(301);
const facilityB = id(302);
const profile = (number) => id(100 + number);
const subject = (number) => id(100 + number, "10000000");
const grantId = id(701);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const legacyColumns = `id, account_id, actor_user_profile_id, object_type, object_id,
  event_type, event_metadata, occurred_at, is_internal_only, is_demo`;

const rows = async (database, sql, params = []) => (await database.query(sql, params)).rows;
const count = async (database) => (await rows(database,
  "select count(*)::int as total from public.audit_events"))[0].total;
const events = async (database, objectId) => rows(database,
  "select * from public.audit_events where object_id = $1 order by occurred_at, id", [objectId]);
async function matchingEvent(database, objectId, predicate) {
  const matches = (await events(database, objectId)).filter(predicate);
  assert.equal(matches.length, 1, "exactly one event matches the observed transition");
  return matches[0];
}

async function expectSqlError(database, code, sql, params = []) {
  await database.exec("savepoint expected_error");
  try {
    await assert.rejects(database.query(sql, params), (error) => {
      assert.equal(error.code, code, `${sql}: ${error.message}`);
      return true;
    });
  } finally {
    await database.exec("rollback to savepoint expected_error; release savepoint expected_error");
  }
}

// This is a PostgreSQL session simulation, NOT signature validation or a real
// PostgREST connection. Only superuser test setup can SET SESSION AUTHORIZATION.
async function asSession(database, session, role, callback) {
  assert.ok(["authenticator", "supabase_auth_admin", "audit_untrusted"].includes(session));
  assert.ok([null, "anon", "authenticated", "service_role"].includes(role));
  await database.exec("savepoint simulated_session");
  try {
    await database.exec(`set session authorization ${session}`);
    if (role) await database.exec(`set role ${role}`);
    return await callback();
  } catch (error) {
    await database.exec("rollback to savepoint simulated_session");
    throw error;
  } finally {
    // PGlite's RESET SESSION AUTHORIZATION retains the simulated session's
    // default; explicitly restore this harness's known postgres owner.
    await database.exec("reset role; set session authorization postgres; release savepoint simulated_session");
  }
}

async function setGatewaySubject(database, number, overrides = {}) {
  const authId = number === null ? null : subject(number);
  await setSimulatedSubject(database, authId, {
    role: "authenticated", sub: authId, ...overrides,
  });
}

async function insertGrant(database, grant = grantId, account = accountA,
  person = profile(1), capability = "view_account", scope = "account", facility = null) {
  await database.query(`insert into public.account_capability_grants
    (id, account_id, user_profile_id, capability_key, scope_kind, facility_id)
    values ($1, $2, $3, $4, $5, $6)`,
  [grant, account, person, capability, scope, facility]);
}

function assertSystem(event, session = "postgres", requestRole = "postgres") {
  assert.equal(event.actor_kind, "system");
  assert.equal(event.actor_system_key, "database_privileged_operation");
  assert.equal(event.actor_user_profile_id, null);
  assert.equal(event.actor_auth_user_id, null);
  assert.equal(event.event_metadata.database_session_user, session);
  assert.equal(event.event_metadata.database_request_role, requestRole);
  assert.equal(event.is_internal_only, true);
  assert.match(event.id, uuidPattern);
  assert.match(event.correlation_id, uuidPattern);
  assert.notEqual(event.id, event.correlation_id);
}

async function provisionTestContext(database) {
  await database.exec(`
    create role authenticator nologin noinherit;
    grant anon, authenticated, service_role to authenticator;
    create role supabase_auth_admin nologin;
    grant usage on schema auth to supabase_auth_admin;
    grant select, delete on auth.users to supabase_auth_admin;
    create role audit_untrusted nologin;
    grant usage on schema private to audit_untrusted;

    -- TEST-ONLY write seam to exercise the currently unreachable user-actor
    -- branch. It does not authorize a production endpoint and never appears in
    -- a migration. Production clients retain zero directory write privileges.
    create function private.audit_test_profile_change(p_id uuid, p_status text, p_unlink boolean default false)
      returns void language plpgsql security definer set search_path = '' as $$
      begin
        update public.user_profiles set identity_status = p_status,
          auth_user_id = case when p_unlink then null else auth_user_id end
          where id = p_id;
      end $$;
    revoke all on function private.audit_test_profile_change(uuid, text, boolean) from public;
    grant execute on function private.audit_test_profile_change(uuid, text, boolean)
      to authenticated, audit_untrusted;
  `);
  await database.query("insert into auth.users (id) select unnest($1::uuid[])",
    [Array.from({ length: 5 }, (_, n) => subject(n + 1))]);
  for (const n of [1, 2, 3, 4]) {
    await database.query("update public.user_profiles set auth_user_id = $1 where id = $2", [subject(n), profile(n)]);
    if (n !== 4) await database.query("update public.user_profiles set identity_status = 'active' where id = $1", [profile(n)]);
  }
  await database.query("insert into public.client_accounts (id, display_name) values ($1, 'Audit account B synthetic')", [accountB]);
  await database.query("insert into public.facilities (id, account_id, display_name) values ($1, $2, 'Audit facility B synthetic')", [facilityB, accountB]);
  await database.query("update public.account_access set membership_status = 'active' where account_id = $1 and user_profile_id = $2", [accountA, profile(1)]);
}

test("access audit provenance in PostgreSQL with simulated Auth/gateway sessions (not authentic API evidence)", async (t) => {
  const database = await createTestDatabase();
  t.after(() => database.close());
  const originalEvents = await rows(database, `select ${legacyColumns} from public.audit_events order by id`);
  const originalProfiles = await rows(database, "select * from public.user_profiles order by id");
  const originalMemberships = await rows(database, "select * from public.account_memberships order by id");
  const originalAccess = await rows(database, "select * from public.account_access order by account_id, user_profile_id");
  // Model provider/default privilege drift; both table and column ACLs must go.
  await database.exec(`grant all on public.audit_events to service_role;
    grant select (event_metadata), insert (event_metadata), update (event_metadata)
      on public.audit_events to public, anon, authenticated, service_role;`);
  await runSqlFile(database, auditMigrationUrl);
  const isolated = async (name, callback) => t.test(name, async () => {
    await database.exec("begin");
    try { await callback(); } finally {
      await database.exec("rollback; reset role; set session authorization postgres");
    }
  });

  await isolated("additive migration preserves every old field, identity, role and lifecycle row", async () => {
    assert.deepEqual(await rows(database, `select ${legacyColumns} from public.audit_events order by id`), originalEvents);
    assert.deepEqual(await rows(database, "select * from public.user_profiles order by id"), originalProfiles);
    assert.deepEqual(await rows(database, "select * from public.account_memberships order by id"), originalMemberships);
    assert.deepEqual(await rows(database, "select * from public.account_access order by account_id, user_profile_id"), originalAccess);
    const legacy = await rows(database, "select actor_kind, actor_auth_user_id, actor_system_key, correlation_id from public.audit_events");
    assert.equal(new Set(legacy.map((event) => event.correlation_id)).size, originalEvents.length);
    for (const event of legacy) {
      assert.equal(event.actor_kind, "legacy_fixture");
      assert.equal(event.actor_auth_user_id, null);
      assert.equal(event.actor_system_key, null);
      assert.match(event.correlation_id, uuidPattern);
    }
  });

  await isolated("unchanged privileged foundation seed replay is idempotent and asserts no runtime actor", async () => {
    const before = await rows(database, "select * from public.audit_events order by id");
    await runSqlFile(database, foundationSeedUrl);
    await runSqlFile(database, foundationSeedUrl);
    assert.deepEqual(await rows(database, "select * from public.audit_events order by id"), before);
  });

  await provisionTestContext(database);

  await isolated("database actor, UUIDs, time and correlation ignore arbitrary caller claims and fields", async () => {
    await database.query(`select set_config('request.jwt.claim.sub', $1, true),
      set_config('request.jwt.claims', $2, true), set_config('app.audit_correlation_id', $3, true)`,
    [subject(2), "not-even-json; secret-do-not-copy", id(999)]);
    const before = Date.now();
    await database.query(`update public.user_profiles set identity_status = 'removed',
      display_name = 'untrusted-secret-text', updated_at = '2000-01-01' where id = $1`, [profile(1)]);
    const event = await matchingEvent(database, profile(1), (item) => item.event_metadata.after?.identity_status === "removed");
    assertSystem(event);
    assert.equal(event.account_id, null);
    assert.equal(event.event_type, "profile_updated");
    assert.notEqual(event.correlation_id, id(999));
    assert.ok(event.occurred_at.getTime() >= before - 1 && event.occurred_at.getTime() <= Date.now() + 1);
    assert.deepEqual(Object.keys(event.event_metadata).sort(), ["after", "before", "database_request_role", "database_session_user"]);
    assert.deepEqual(Object.keys(event.event_metadata.after).sort(), ["auth_linked_once", "auth_user_id", "id", "identity_status", "is_demo"]);
    assert.equal(JSON.stringify(event).includes("secret"), false);
    assert.equal(JSON.stringify(event).includes("2000-01-01"), false);
  });

  await isolated("service-role provisioning remains system even with another valid user's claims", async () => {
    await setGatewaySubject(database, 2, { actor_kind: "user", actor_user_profile_id: profile(3) });
    await asProvisioningRole(database, () => database.query(
      "update public.user_profiles set identity_status = 'removed' where id = $1", [profile(1)]));
    assertSystem(await matchingEvent(database, profile(1), (item) => item.event_metadata.after?.identity_status === "removed"), "postgres", "service_role");
    await asSession(database, "authenticator", "service_role", () => database.query(
      "update public.user_profiles set identity_status = 'suspended' where id = $1", [profile(1)]));
    assertSystem(await matchingEvent(database, profile(1), (item) => item.event_metadata.before?.identity_status === "removed"), "authenticator", "service_role");
  });

  await isolated("profile create/link/history/status/unlink/delete records safe control states", async () => {
    const target = profile(9);
    await database.query("insert into public.user_profiles (id, display_name) values ($1, 'Do not log this name')", [target]);
    await database.query("update public.user_profiles set auth_user_id = $1 where id = $2", [subject(5), target]);
    await database.query("update public.user_profiles set identity_status = 'active' where id = $1", [target]);
    await database.query("update public.user_profiles set auth_user_id = null, identity_status = 'removed' where id = $1", [target]);
    await database.query("delete from public.user_profiles where id = $1", [target]);
    const audit = await events(database, target);
    // Database timestamps are not a total-order sequence (WASM clocks can tie).
    assert.deepEqual(audit.map((event) => event.event_type).sort(), ["profile_created", "profile_deleted", "profile_updated", "profile_updated", "profile_updated"]);
    assert.equal(audit.find((event) => event.event_type === "profile_created").event_metadata.before, null);
    const link = audit.find((event) => event.event_metadata.before?.auth_linked_once === false && event.event_metadata.after?.auth_linked_once === true);
    const unlink = audit.find((event) => event.event_metadata.after?.identity_status === "removed");
    assert.equal(link.event_metadata.after.auth_user_id, subject(5));
    assert.equal(unlink.event_metadata.before.auth_user_id, subject(5));
    assert.equal(unlink.event_metadata.after.auth_user_id, null);
    assert.equal(unlink.event_metadata.after.auth_linked_once, true);
    assert.equal(audit.find((event) => event.event_type === "profile_deleted").event_metadata.after, null);
    assert.equal(JSON.stringify(audit).includes("Do not log"), false);
    for (const event of audit) { assertSystem(event); assert.equal(event.account_id, null); }
  });

  await isolated("inserting a linked suspended profile records database-assigned initial history", async () => {
    await database.query("insert into public.user_profiles (id, auth_user_id, display_name) values ($1, $2, 'Synthetic')", [profile(9), subject(5)]);
    const [event] = await events(database, profile(9));
    assert.equal(event.event_metadata.after.auth_linked_once, true);
    assert.equal(event.event_metadata.after.identity_status, "suspended");
    assert.equal(event.event_metadata.after.auth_user_id, subject(5));
  });

  await isolated("no-op and text/timestamp-only updates produce no control-change event", async () => {
    await insertGrant(database);
    const before = await count(database);
    await database.query("update public.user_profiles set identity_status = identity_status, display_name = 'private free text', updated_at = now() where id = $1", [profile(1)]);
    await database.query("update public.account_access set membership_status = membership_status, updated_at = '2000-01-01' where user_profile_id = $1", [profile(1)]);
    await database.query("update public.account_capability_grants set revoked_at = revoked_at, created_at = '2000-01-01' where id = $1", [grantId]);
    assert.equal(await count(database), before);
    await expectSqlError(database, "23514", "update public.user_profiles set auth_linked_once = false where id = $1", [profile(1)]);
    assert.equal(await count(database), before);
  });

  await isolated("membership creation, lifecycle changes and deletion append in the same tenant", async () => {
    await database.query("insert into public.account_access (account_id, user_profile_id) values ($1, $2)", [accountB, profile(7)]);
    for (const status of ["active", "suspended", "removed"]) await database.query(
      "update public.account_access set membership_status = $1 where account_id = $2 and user_profile_id = $3", [status, accountB, profile(7)]);
    await database.query("delete from public.account_access where account_id = $1 and user_profile_id = $2", [accountB, profile(7)]);
    const audit = (await events(database, profile(7))).filter((event) => event.account_id === accountB);
    assert.deepEqual(audit.map((event) => event.event_type).sort(), ["account_access_created", "account_access_deleted", "account_access_updated", "account_access_updated", "account_access_updated"]);
    assert.deepEqual(audit.filter((event) => event.event_metadata.after).map((event) => event.event_metadata.after.membership_status).sort(), ["active", "invited", "removed", "suspended"]);
    assert.equal(audit.find((event) => event.event_type === "account_access_deleted").event_metadata.before.membership_status, "removed");
    for (const event of audit) assertSystem(event);
  });

  await isolated("grant create/change/revoke/restore/delete retains only allowed safe values", async () => {
    await insertGrant(database);
    await database.query("update public.account_capability_grants set capability_key = 'view_asset', scope_kind = 'facility', facility_id = $1 where id = $2", [facilityA, grantId]);
    await database.query("update public.account_capability_grants set revoked_at = statement_timestamp() where id = $1", [grantId]);
    await database.query("update public.account_capability_grants set revoked_at = null where id = $1", [grantId]);
    await database.query("delete from public.account_capability_grants where id = $1", [grantId]);
    const audit = await events(database, grantId);
    assert.deepEqual(audit.map((event) => event.event_type).sort(), ["capability_grant_created", "capability_grant_deleted", "capability_grant_restored", "capability_grant_revoked", "capability_grant_updated"]);
    const changed = audit.find((event) => event.event_type === "capability_grant_updated");
    assert.equal(changed.event_metadata.before.scope_kind, "account");
    assert.equal(changed.event_metadata.after.facility_id, facilityA);
    assert.ok(audit.find((event) => event.event_type === "capability_grant_revoked").event_metadata.after.revoked_at);
    assert.equal(audit.find((event) => event.event_type === "capability_grant_restored").event_metadata.after.revoked_at, null);
    assert.deepEqual(Object.keys(changed.event_metadata.after).sort(), ["account_id", "capability_key", "facility_id", "id", "is_demo", "revoked_at", "scope_kind", "user_profile_id"]);
    for (const event of audit) { assertSystem(event); assert.equal(event.account_id, accountA); }
  });

  await isolated("authorization-affecting demo flags are audited without changing directory denial", async () => {
    await insertGrant(database);
    await insertGrant(database, id(702), accountA, profile(1), "view_asset", "facility", facilityA);
    await setSimulatedSubject(database, subject(1));
    assert.deepEqual(await asClientRole(database, "authenticated", () => rows(database, "select id from public.facilities")), [{ id: facilityA }]);
    await database.query("update public.account_capability_grants set is_demo = false where id = $1", [id(702)]);
    assert.equal((await matchingEvent(database, id(702), (item) => item.event_type === "capability_grant_updated")).event_metadata.after.is_demo, false);
    assert.deepEqual(await asClientRole(database, "authenticated", () => rows(database, "select id from public.facilities")), []);
    await database.query("update public.account_access set is_demo = false where account_id = $1 and user_profile_id = $2", [accountA, profile(1)]);
    assert.deepEqual(await asClientRole(database, "authenticated", () => rows(database, "select id from public.client_accounts")), []);
    await database.query("update public.user_profiles set is_demo = false where id = $1", [profile(1)]);
    assert.deepEqual(await asClientRole(database, "authenticated", () => rows(database, "select id from public.user_profiles")), []);
  });

  await isolated("cross-account or missing-membership grant failures produce neither mutation nor durable audit", async () => {
    const before = await count(database);
    await expectSqlError(database, "23503", `insert into public.account_capability_grants
      (account_id, user_profile_id, capability_key, scope_kind, facility_id)
      values ($1, $2, 'view_asset', 'facility', $3)`, [accountA, profile(1), facilityB]);
    await expectSqlError(database, "23503", `insert into public.account_capability_grants
      (account_id, user_profile_id, capability_key, scope_kind)
      values ($1, $2, 'view_account', 'account')`, [accountB, profile(1)]);
    assert.equal(await count(database), before);
  });

  await isolated("valid privileged account moves retain both tenant histories with shared server correlation", async () => {
    await database.query("insert into public.account_access (account_id, user_profile_id) values ($1, $2)", [accountB, profile(1)]);
    await insertGrant(database);
    await database.query("update public.account_capability_grants set account_id = $1 where id = $2", [accountB, grantId]);
    const updates = (await events(database, grantId)).filter((event) => event.event_type === "capability_grant_updated");
    assert.deepEqual(updates.map((event) => event.account_id).sort(), [accountA, accountB]);
    assert.equal(updates[0].correlation_id, updates[1].correlation_id);
    assert.equal(updates[0].occurred_at.getTime(), updates[1].occurred_at.getTime());
    for (const event of updates) {
      assert.equal(event.event_metadata.before.account_id, accountA);
      assert.equal(event.event_metadata.after.account_id, accountB);
    }
    await database.query("insert into public.account_access (account_id, user_profile_id) values ($1, $2)", [accountB, profile(7)]);
    await database.query("insert into public.client_accounts (id, display_name) values ($1, 'Synthetic C')", [accountC]);
    await database.query("update public.account_access set account_id = $1 where account_id = $2 and user_profile_id = $3", [accountC, accountB, profile(7)]);
    const accessUpdates = (await events(database, profile(7))).filter((event) => event.event_type === "account_access_updated");
    assert.deepEqual(accessUpdates.map((event) => event.account_id).sort(), [accountB, accountC]);
    assert.equal(accessUpdates[0].correlation_id, accessUpdates[1].correlation_id);
  });

  await isolated("simulated trusted gateway derives the user actor from subject, not changed row or metadata", async () => {
    await setGatewaySubject(database, 1, {
      actor_user_profile_id: profile(3), actor_auth_user_id: subject(3), actor_kind: "system",
      user_metadata: { profile_id: profile(3), secret: "untrusted-do-not-log", is_anonymous: false },
    });
    await asSession(database, "authenticator", "authenticated", () => database.query(
      "select private.audit_test_profile_change($1, 'suspended')", [profile(2)]));
    const event = await matchingEvent(database, profile(2), (item) => item.actor_kind === "user");
    assert.equal(event.actor_kind, "user");
    assert.equal(event.actor_user_profile_id, profile(1));
    assert.equal(event.actor_auth_user_id, subject(1));
    assert.equal(event.actor_system_key, null);
    assert.equal(event.object_id, profile(2));
    assert.equal(event.event_metadata.database_session_user, "authenticator");
    assert.equal(event.event_metadata.database_request_role, "authenticated");
    assert.equal(JSON.stringify(event).includes("untrusted-do-not-log"), false);
  });

  for (const unlink of [false, true]) await isolated(`self-${unlink ? "unlink" : "suspension"} preserves a valid prior user actor without reopening linkage`, async () => {
    await setGatewaySubject(database, 1);
    await asSession(database, "authenticator", "authenticated", () => database.query(
      "select private.audit_test_profile_change($1, 'suspended', $2)", [profile(1), unlink]));
    const event = await matchingEvent(database, profile(1), (item) => item.actor_kind === "user");
    assert.equal(event.actor_kind, "user");
    assert.equal(event.actor_user_profile_id, profile(1));
    assert.equal(event.actor_auth_user_id, subject(1));
    assert.equal(event.event_metadata.after.auth_linked_once, true);
    assert.equal(event.event_metadata.after.auth_user_id, unlink ? null : subject(1));
  });

  await isolated("malformed, mismatched, anonymous, missing, inactive and unlinked gateway actors fail closed", async () => {
    const cases = [
      [null, {}], [9, {}], [4, {}], [5, {}],
      [1, { sub: subject(2) }], [1, { sub: "not-a-uuid" }], [1, { sub: null }],
      [1, { role: "service_role" }], [1, { role: undefined }],
      [1, { is_anonymous: true }], [1, { is_anonymous: "false" }], [1, { is_anonymous: undefined }],
    ];
    const before = await count(database);
    for (const [number, claims] of cases) {
      await setGatewaySubject(database, number, claims);
      await asSession(database, "authenticator", "authenticated", () => expectSqlError(database, "28000",
        "select private.audit_test_profile_change($1, 'suspended')", [profile(2)]));
    }
    for (const [setting, value] of [["request.jwt.claims", "malformed-json"], ["request.jwt.claim.sub", "invalid-uuid"]]) {
      await setGatewaySubject(database, 1);
      await database.query("select set_config($1, $2, true)", [setting, value]);
      await asSession(database, "authenticator", "authenticated", () => expectSqlError(database, "28000",
        "select private.audit_test_profile_change($1, 'suspended')", [profile(2)]));
    }
    assert.equal(await count(database), before);
    assert.deepEqual(await rows(database, "select identity_status from public.user_profiles where id = $1", [profile(2)]), [{ identity_status: "active" }]);
  });

  await isolated("a role string and plausible claims on an untrusted session do not assert a human actor", async () => {
    await setGatewaySubject(database, 1);
    const before = await count(database);
    await asClientRole(database, "authenticated", () => expectSqlError(database, "28000",
      "select private.audit_test_profile_change($1, 'suspended')", [profile(2)]));
    await asSession(database, "audit_untrusted", null, () => expectSqlError(database, "28000",
      "select private.audit_test_profile_change($1, 'suspended')", [profile(2)]));
    assert.equal(await count(database), before);
  });

  await isolated("Auth deletion audits its cascade unlink as system and retains historical user Auth UUID", async () => {
    await setGatewaySubject(database, 1);
    await asSession(database, "authenticator", "authenticated", () => database.query(
      "select private.audit_test_profile_change($1, 'suspended')", [profile(2)]));
    const userEvent = await matchingEvent(database, profile(2), (item) => item.actor_kind === "user");
    await asSession(database, "supabase_auth_admin", null, () => database.query("delete from auth.users where id = $1", [subject(1)]));
    const unlink = await matchingEvent(database, profile(1), (item) => item.event_metadata.before?.auth_user_id === subject(1) && item.event_metadata.after?.auth_user_id === null);
    assertSystem(unlink, "supabase_auth_admin", "supabase_auth_admin");
    assert.equal(unlink.event_metadata.before.auth_user_id, subject(1));
    assert.equal(unlink.event_metadata.after.auth_user_id, null);
    assert.equal(unlink.event_metadata.after.auth_linked_once, true);
    assert.deepEqual(await rows(database, "select actor_auth_user_id, actor_user_profile_id from public.audit_events where id = $1", [userEvent.id]),
      [{ actor_auth_user_id: subject(1), actor_user_profile_id: profile(1) }]);
    await expectSqlError(database, "23514", "update public.user_profiles set auth_user_id = $1, identity_status = 'suspended' where id = $2", [subject(5), profile(1)]);
  });

  await isolated("existing actor-profile FK preserves an actor profile and does not cascade-delete history", async () => {
    await database.query("insert into public.user_profiles (id, auth_user_id, display_name) values ($1, $2, 'Synthetic actor')", [profile(9), subject(5)]);
    await database.query("update public.user_profiles set identity_status = 'active' where id = $1", [profile(9)]);
    await setGatewaySubject(database, 5);
    await asSession(database, "authenticator", "authenticated", () => database.query(
      "select private.audit_test_profile_change($1, 'suspended')", [profile(2)]));
    const before = await count(database);
    await expectSqlError(database, "23503", "delete from public.user_profiles where id = $1", [profile(9)]);
    assert.equal(await count(database), before);
    assert.equal((await rows(database, "select id from public.user_profiles where id = $1", [profile(9)])).length, 1);
  });

  await isolated("audited tenant FK blocks hard-delete cleanup but system subject IDs add no new profile FK", async () => {
    await database.query("insert into public.client_accounts (id, display_name) values ($1, 'Synthetic retained tenant')", [accountC]);
    await database.query("insert into public.user_profiles (id, display_name) values ($1, 'Synthetic disposable subject')", [profile(9)]);
    await database.query("insert into public.account_access (account_id, user_profile_id) values ($1, $2)", [accountC, profile(9)]);
    await database.query("delete from public.account_access where account_id = $1", [accountC]);
    await database.query("delete from public.user_profiles where id = $1", [profile(9)]);
    const before = await count(database);
    await expectSqlError(database, "23503", "delete from public.client_accounts where id = $1", [accountC]);
    assert.equal(await count(database), before);
    assert.equal((await events(database, profile(9))).filter((event) => event.account_id === accountC).length, 2);
    const fks = await rows(database, `select conname, confdeltype from pg_constraint
      where conrelid = 'public.audit_events'::regclass and contype = 'f' order by conname`);
    assert.deepEqual(fks, [{ conname: "audit_events_account_fk", confdeltype: "a" }, { conname: "audit_events_actor_fk", confdeltype: "a" }]);
  });

  await isolated("transaction rollback removes successful mutation and its audit; logging failure aborts mutation", async () => {
    const before = await count(database);
    await database.exec("savepoint business_operation");
    await database.query("update public.user_profiles set identity_status = 'removed' where id = $1", [profile(1)]);
    assert.equal(await count(database), before + 1);
    await database.exec("rollback to savepoint business_operation; release savepoint business_operation");
    assert.equal(await count(database), before);
    // A controlled test-only sink failure proves fail-closed atomicity; no
    // audit best-effort exception handler may commit an unlogged source change.
    await database.exec("alter table public.audit_events add constraint audit_test_sink_failure check (event_type <> 'profile_updated') not valid");
    await expectSqlError(database, "23514", "update public.user_profiles set identity_status = 'removed' where id = $1", [profile(1)]);
    assert.equal(await count(database), before);
    assert.deepEqual(await rows(database, "select identity_status from public.user_profiles where id = $1", [profile(1)]), [{ identity_status: "active" }]);
  });

  await isolated("ordinary roles cannot read/insert/forge/alter/delete/truncate audit or mutate access tables", async () => {
    await setGatewaySubject(database, 1, { user_metadata: { actor_kind: "system" } });
    const before = await count(database);
    for (const role of ["anon", "authenticated"]) await asClientRole(database, role, async () => {
      for (const table of ["audit_events", "user_profiles", "account_access", "account_capability_grants"]) {
        const column = table === "account_access" ? "membership_status" : "id";
        await expectSqlError(database, "42501", `insert into public.${table} default values`);
        await expectSqlError(database, "42501", `update public.${table} set ${column} = ${column}`);
        await expectSqlError(database, "42501", `delete from public.${table}`);
        await expectSqlError(database, "42501", `truncate public.${table} cascade`);
      }
      await expectSqlError(database, "42501", "select * from public.audit_events");
      await expectSqlError(database, "42501", `insert into public.audit_events
        (account_id, actor_user_profile_id, actor_auth_user_id, actor_kind, object_type, object_id, event_type, correlation_id, occurred_at)
        values ($1, $2, $3, 'user', 'account_access', $2, 'account_access_created', $4, '2000-01-01')`,
      [accountB, profile(2), subject(2), id(999)]);
      await expectSqlError(database, "42501", "select private.audit_access_change()");
      await expectSqlError(database, "42501", "select private.guard_audit_history()");
    });
    assert.equal(await count(database), before);
  });

  await isolated("service can inspect internal evidence but cannot directly append or rewrite it", async () => {
    await asProvisioningRole(database, async () => {
      assert.ok(await count(database) > 0);
      await expectSqlError(database, "42501", "insert into public.audit_events default values");
      await expectSqlError(database, "42501", "update public.audit_events set event_metadata = '{}'::jsonb");
      await expectSqlError(database, "42501", "delete from public.audit_events");
      await expectSqlError(database, "42501", "truncate public.audit_events");
    });
    for (const role of ["anon", "authenticated", "service_role"]) {
      assert.deepEqual(await rows(database, `select has_table_privilege($1, 'public.audit_events', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as writable,
        has_any_column_privilege($1, 'public.audit_events', 'INSERT,UPDATE,REFERENCES') as writable_column`, [role]),
      [{ writable: false, writable_column: false }]);
    }
  });

  await isolated("append-only triggers stop even owner casual UPDATE, DELETE and TRUNCATE", async () => {
    const before = await rows(database, "select * from public.audit_events order by id");
    await expectSqlError(database, "55000", "update public.audit_events set event_metadata = '{}'::jsonb");
    await expectSqlError(database, "55000", "delete from public.audit_events");
    await expectSqlError(database, "55000", "truncate public.audit_events");
    assert.deepEqual(await rows(database, "select * from public.audit_events order by id"), before);
  });

  await isolated("bulk TRUNCATE cannot bypass access-control row auditing", async () => {
    const before = await count(database);
    for (const table of ["user_profiles", "account_access", "account_capability_grants"]) {
      await expectSqlError(database, "55000", `truncate public.${table} cascade`);
      await asProvisioningRole(database, () => expectSqlError(database, "42501", `truncate public.${table} cascade`));
    }
    assert.equal(await count(database), before);
  });

  await isolated("checked actor and event scope reject null/mixed provenance and unbounded global events", async () => {
    const insert = `insert into public.audit_events
      (account_id, actor_kind, actor_user_profile_id, actor_auth_user_id, actor_system_key,
       object_type, object_id, event_type, is_internal_only)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`;
    const valid = [null, "system", null, null, "database_privileged_operation", "user_profile", profile(1), "profile_updated", true];
    const variants = [
      { 1: "unknown" }, { 4: null }, { 4: "qualified_approver" }, { 2: profile(1) }, { 3: subject(1) },
      { 1: "user", 4: null }, { 1: "user", 2: profile(1), 4: null },
      { 1: "user", 3: subject(1), 4: null },
      { 1: "legacy_fixture", 4: null }, { 6: null }, { 8: false },
      { 5: "account_access", 7: "account_access_updated" },
      { 7: "password_reset" }, { 0: accountA },
    ];
    for (const override of variants) {
      const values = [...valid];
      for (const [index, value] of Object.entries(override)) values[index] = value;
      await expectSqlError(database, "23514", insert, values);
    }
    // An explicit database-owner fixture can still be appended; it does not
    // become a user event and cannot use the profile/global null-account path.
    await database.query(`insert into public.audit_events
      (account_id, object_type, object_id, event_type) values ($1, 'synthetic_fixture', $2, 'owner_fixture')`, [accountA, id(990)]);
    assert.equal((await events(database, id(990)))[0].actor_kind, "legacy_fixture");
  });

  await isolated("trigger ownership/search path/ACL and policy inventory keep the read-only directory boundary", async () => {
    const functions = await rows(database, `select p.proname, p.prosecdef, p.proconfig,
      p.proowner = c.relowner as same_owner,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') as client_execute,
      has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
      has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute,
      exists (select 1 from aclexplode(p.proacl) acl where acl.grantee = 0 and acl.privilege_type = 'EXECUTE') as public_execute
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      cross join pg_class c
      where n.nspname = 'private' and p.proname in ('audit_access_change', 'guard_audit_history')
        and c.oid = 'public.audit_events'::regclass order by p.proname`);
    assert.equal(functions.length, 2);
    for (const fn of functions) {
      assert.equal(fn.prosecdef, fn.proname === "audit_access_change");
      assert.deepEqual(fn.proconfig, ['search_path=""']);
      for (const key of ["client_execute", "anon_execute", "service_execute", "public_execute"]) assert.equal(fn[key], false);
      assert.equal(fn.same_owner, true);
    }
    assert.deepEqual(await rows(database, "select tablename, cmd from pg_policies where schemaname = 'public' order by tablename"),
      ["client_accounts", "facilities", "user_profiles"].map((tablename) => ({ tablename, cmd: "SELECT" })));
    assert.deepEqual(await rows(database, "select rowsecurity from pg_tables where schemaname = 'public' and tablename = 'audit_events'"), [{ rowsecurity: true }]);
    assert.deepEqual(await rows(database, `select has_schema_privilege('authenticated', 'private', 'CREATE') as can_create,
      has_table_privilege('authenticated', 'public.user_profiles', 'TRIGGER') as can_attach`), [{ can_create: false, can_attach: false }]);
  });

  await isolated("RLS-filtered reads create no audit and denied exceptions leave no durable denial collector", async () => {
    await setSimulatedSubject(database, subject(1));
    const before = await count(database);
    await asClientRole(database, "authenticated", async () => {
      assert.deepEqual(await rows(database, "select id from public.client_accounts where id = $1", [accountB]), []);
      assert.deepEqual(await rows(database, "select id from public.facilities where id = $1", [facilityB]), []);
      await expectSqlError(database, "42501", "update public.account_access set membership_status = 'active'");
    });
    assert.equal(await count(database), before);
  });
});

test("new database can apply all three migrations then replay original seed without activating access", async (t) => {
  const database = await createTestDatabase({ seedBeforeMigration: false });
  t.after(() => database.close());
  await runSqlFile(database, auditMigrationUrl);
  await runSqlFile(database, foundationSeedUrl);
  const before = await rows(database, "select * from public.audit_events order by id");
  await runSqlFile(database, foundationSeedUrl);
  assert.deepEqual(await rows(database, "select * from public.audit_events order by id"), before);
  assert.deepEqual(await rows(database, "select actor_kind, count(*)::int as total from public.audit_events group by actor_kind order by actor_kind"),
    [{ actor_kind: "legacy_fixture", total: 2 }, { actor_kind: "system", total: 14 }]);
  assert.deepEqual(await rows(database, "select distinct identity_status from public.user_profiles"), [{ identity_status: "suspended" }]);
  await setSimulatedSubject(database, null);
  assert.deepEqual(await asClientRole(database, "authenticated", () => rows(database, "select id from public.client_accounts")), []);
});
