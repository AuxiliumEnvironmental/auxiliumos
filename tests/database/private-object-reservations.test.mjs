import assert from "node:assert/strict";
import test from "node:test";
import {
  createTestDatabase, foundationSeedUrl, runSqlFile, setSimulatedSubject,
} from "../helpers/pglite-database.mjs";

const migration = (name) => new URL(`../../supabase/migrations/${name}.sql`, import.meta.url);
const auditMigration = migration("20261008154950_access_audit_provenance");
const reservationMigration = migration("20261008164758_private_object_reservations");
const id = (n, prefix = "00000000") => `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const accountA = id(1), accountB = id(2);
const facilityA1 = id(301), facilityA2 = id(302), facilityB1 = id(303);
const profile = (n) => id(100 + n);
const subject = (n) => id(100 + n, "10000000");
const key = id(900);
const unavailable = { object_id: null, state: "not_found_or_unavailable", state_revision: null, expires_at: null };
const reserveSql = "select * from public.reserve_private_object($1, $2, $3, $4, $5)";
const request = (overrides = {}) => Object.values({ account: accountA, facility: facilityA1,
  key, bytes: 12, media: "text/plain", ...overrides });
const rows = async (db, sql, params = []) => (await db.query(sql, params)).rows;
const reserve = async (db, overrides) => (await rows(db, reserveSql, request(overrides)))[0];
const status = async (db, objectId) => (await rows(db, "select * from public.private_object_status($1)", [objectId]))[0];
const reservations = (db) => rows(db, "select * from private.private_object_reservations order by id");
const reservationEvents = (db) => rows(db, "select * from public.audit_events where event_type = 'private_object_reserved' order by id");
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function expectSqlError(db, code, sql, params = []) {
  await db.exec("savepoint expected_error");
  try {
    await assert.rejects(db.query(sql, params), (error) => {
      assert.equal(error.code, code, `${sql}: ${error.message}`);
      return true;
    });
  } finally { await db.exec("rollback to savepoint expected_error; release savepoint expected_error"); }
}

// TEST-ONLY gateway simulation. No JWT signature, real Auth, API or concurrent
// connection is present. Only superuser setup can select a session identity.
async function asSession(db, session, role, callback) {
  assert.ok(["authenticator", "reservation_untrusted", "postgres"].includes(session));
  assert.ok([null, "anon", "authenticated", "service_role"].includes(role));
  await db.exec("savepoint simulated_session");
  try {
    await db.exec(`set session authorization ${session}`);
    if (role) await db.exec(`set role ${role}`);
    return await callback();
  } catch (error) {
    await db.exec("rollback to savepoint simulated_session");
    throw error;
  } finally {
    await db.exec("reset role; set session authorization postgres; release savepoint simulated_session");
  }
}
async function gateway(db, person, callback, overrides = {}) {
  const authId = person === null ? null : subject(person);
  await setSimulatedSubject(db, authId, { role: "authenticated", sub: authId, ...overrides });
  return asSession(db, "authenticator", "authenticated", callback);
}
async function grant(db, account, person, capability, scope, facility = null) {
  await db.query(`insert into public.account_capability_grants
    (account_id, user_profile_id, capability_key, scope_kind, facility_id)
    values ($1, $2, $3, $4, $5)`, [account, profile(person), capability, scope, facility]);
}
async function fullGrant(db, account, person, facility) {
  await grant(db, account, person, "view_account", "account");
  await grant(db, account, person, "view_asset", "facility", facility);
  await grant(db, account, person, "ingest_private_object", "facility", facility);
}
async function provision(db) {
  await db.exec(`create role authenticator nologin noinherit;
    grant anon, authenticated, service_role to authenticator;
    create role reservation_untrusted nologin noinherit;
    grant authenticated to reservation_untrusted;`);
  await db.query("insert into auth.users (id) select unnest($1::uuid[])", [Array.from({ length: 8 }, (_, n) => subject(n + 1))]);
  await db.query("insert into public.client_accounts (id, display_name) values ($1, 'Reservation account B synthetic')", [accountB]);
  await db.query(`insert into public.facilities (id, account_id, display_name)
    values ($1, $2, 'Reservation A2 synthetic'), ($3, $4, 'Reservation B1 synthetic')`,
  [facilityA2, accountA, facilityB1, accountB]);
  for (const n of [1, 2, 3, 4, 6, 7]) {
    await db.query("update public.user_profiles set auth_user_id = $1 where id = $2", [subject(n), profile(n)]);
    if (n !== 4) await db.query("update public.user_profiles set identity_status = 'active' where id = $1", [profile(n)]);
    if (n !== 7) await db.query("update public.account_access set membership_status = 'active' where account_id = $1 and user_profile_id = $2", [accountA, profile(n)]);
  }
  await db.query("update public.user_profiles set identity_status = 'active' where id = $1", [profile(5)]);
  await db.query("update public.account_access set membership_status = 'active' where user_profile_id = $1", [profile(5)]);
  await db.query("insert into public.account_access (account_id, user_profile_id, membership_status) values ($1, $2, 'active')", [accountB, profile(2)]);
  for (const n of [1, 4, 5, 6, 7]) await fullGrant(db, accountA, n, facilityA1);
  await fullGrant(db, accountB, 2, facilityB1);
  await db.query("insert into public.account_memberships (account_id, user_profile_id, role_key) values ($1, $2, 'system_admin') on conflict do nothing", [accountA, profile(3)]);
  await db.exec("update private.private_object_reservation_config set enabled = true");
}

test("private reservations: PostgreSQL with simulated Auth/gateway, single session only", async (t) => {
  const db = await createTestDatabase();
  t.after(() => db.close());
  await runSqlFile(db, auditMigration);
  const publicTables = ["client_accounts", "facilities", "user_profiles", "account_access", "account_memberships", "documents", "incident_requests", "audit_events"];
  const originals = Object.fromEntries(await Promise.all(publicTables.map(async (table) => [table, await rows(db, `select * from public.${table} order by 1, 2`)])));
  const helperDefinitions = await rows(db, `select pg_get_functiondef(oid) as definition from pg_proc
    where oid in ('private.current_subject_id()'::regprocedure, 'private.has_directory_capability(uuid,text,uuid)'::regprocedure) order by oid`);
  // Simulate provider/default privilege drift for every new table/function.
  await db.exec(`alter default privileges in schema private grant all on tables to public, anon, authenticated, service_role;
    alter default privileges in schema private grant execute on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;`);
  await runSqlFile(db, reservationMigration);
  t.diagnostic((await rows(db, "select version() as version"))[0].version);
  const isolated = (name, callback) => t.test(name, async () => {
    await db.exec("begin");
    try { await callback(); } finally { await db.exec("rollback; reset role; set session authorization postgres"); }
  });

  await isolated("additive migration preserves legacy rows/seed and directory helper definitions", async () => {
    for (const table of publicTables) {
      const current = await rows(db, `select * from public.${table} order by 1, 2`);
      assert.deepEqual(table === "audit_events" ? current.filter((event) => event.actor_kind === "legacy_fixture") : current,
        originals[table], table);
    }
    assert.deepEqual(await rows(db, `select pg_get_functiondef(oid) as definition from pg_proc
      where oid in ('private.current_subject_id()'::regprocedure, 'private.has_directory_capability(uuid,text,uuid)'::regprocedure) order by oid`), helperDefinitions);
    const before = await rows(db, "select * from public.audit_events order by id");
    await runSqlFile(db, foundationSeedUrl);
    assert.deepEqual(await rows(db, "select * from public.audit_events order by id"), before);
    assert.deepEqual(await reservations(db), []);
    assert.deepEqual(await rows(db, "select enabled, max_bytes, reservation_ttl_seconds, revision from private.private_object_reservation_config"),
      [{ enabled: false, max_bytes: 65536, reservation_ttl_seconds: 900, revision: 1 }]);
  });

  await provision(db);

  await isolated("allowed reservation/status expose four safe fields and exact server provenance", async () => {
    const before = Date.now();
    const result = await gateway(db, 1, () => reserve(db), {
      actor_profile_id: profile(2), occurred_at: "2000-01-01", object_key: "secret-path",
      user_metadata: { account_id: accountB, role: "system_admin", filename: "secret-file" },
    });
    assert.deepEqual(Object.keys(result).sort(), ["expires_at", "object_id", "state", "state_revision"]);
    assert.match(result.object_id, uuidPattern);
    assert.equal(result.state, "reserved");
    assert.equal(result.state_revision, 1);
    assert.deepEqual(await gateway(db, 1, () => status(db, result.object_id)), result);
    const [manifest] = await reservations(db);
    assert.equal(manifest.created_by_profile_id, profile(1));
    assert.equal(manifest.created_by_auth_user_id, subject(1));
    assert.equal(manifest.account_id, accountA);
    assert.equal(manifest.facility_id, facilityA1);
    assert.equal(manifest.bucket_id, "os-private-ingest");
    assert.equal(manifest.object_key, `${accountA}/${facilityA1}/${result.object_id}/payload`);
    assert.equal(manifest.expires_at - manifest.created_at, 900_000);
    assert.ok(manifest.created_at.getTime() >= before - 1 && manifest.created_at.getTime() <= Date.now() + 1);
    assert.deepEqual(manifest.canonical_request, { schema_version: 1, account_id: accountA, facility_id: facilityA1, byte_size: 12, media_type: "text/plain" });
    const [event] = await reservationEvents(db);
    assert.equal(event.actor_kind, "user");
    assert.equal(event.actor_user_profile_id, profile(1));
    assert.equal(event.actor_auth_user_id, subject(1));
    assert.equal(event.actor_system_key, null);
    assert.equal(event.object_id, result.object_id);
    assert.equal(event.account_id, accountA);
    assert.equal(event.object_type, "private_object");
    assert.equal(event.event_metadata.database_session_user, "authenticator");
    assert.equal(event.event_metadata.database_request_role, "authenticated");
    assert.equal(event.event_metadata.operation_source, "reserve_private_object");
    assert.equal(event.is_demo, true);
    assert.equal(event.is_internal_only, true);
    assert.match(event.correlation_id, uuidPattern);
    assert.notEqual(event.id, event.correlation_id);
    assert.equal(JSON.stringify(event).includes("secret"), false);
    for (const forbidden of ["object_key", "bucket_id", "canonical_request", "idempotency_key", "claims", "filename"]) {
      assert.equal(Object.hasOwn(event.event_metadata, forbidden), false);
      assert.equal(Object.hasOwn(result, forbidden), false);
    }
  });

  await isolated("role-only, unlinked, inactive, absent and anonymous subjects cannot reserve", async () => {
    for (const person of [3, 4, 5, 7, 8]) await gateway(db, person, async () => {
      await expectSqlError(db, "42501", reserveSql, request());
      assert.deepEqual(await status(db, id(999)), unavailable);
    });
    for (const claims of [
      { is_anonymous: true }, { is_anonymous: undefined }, { is_anonymous: "false" },
      { role: "service_role" }, { role: undefined }, { sub: subject(2) }, { sub: "not-a-uuid" },
      { sub: null },
    ]) await gateway(db, 1, async () => {
      await expectSqlError(db, "28000", reserveSql, request());
      await expectSqlError(db, "28000", "select * from public.private_object_status($1)", [id(999)]);
    }, claims);
    await gateway(db, null, () => expectSqlError(db, "28000", reserveSql, request()));
    assert.deepEqual(await reservations(db), []);
  });

  await isolated("actual gateway session/role are required; service_role and forged GUCs cannot impersonate", async () => {
    await setSimulatedSubject(db, subject(1), { role: "authenticated", sub: subject(1) });
    for (const session of ["postgres", "reservation_untrusted"]) await asSession(db, session, "authenticated",
      () => expectSqlError(db, "28000", reserveSql, request()));
    for (const role of ["anon", "service_role"]) await asSession(db, "authenticator", role, async () => {
      await expectSqlError(db, "42501", reserveSql, request());
      await expectSqlError(db, "42501", "select * from public.private_object_status($1)", [id(999)]);
    });
    // Even hypothetical execute-grant drift cannot turn the service gateway role
    // into a user. This grant exists only in this rolled-back test transaction.
    await db.exec("grant usage on schema private to service_role; grant execute on function private.reserve_private_object(uuid,uuid,uuid,integer,text) to service_role");
    await asSession(db, "authenticator", "service_role", () => expectSqlError(db, "28000",
      "select * from private.reserve_private_object($1,$2,$3,$4,$5)", request()));
    await gateway(db, 1, async () => {
      await db.query("select set_config('request.jwt.claims', $1, true)", ["not-json-secret"]);
      await expectSqlError(db, "28000", reserveSql, request());
    });
    assert.deepEqual(await reservationEvents(db), []);
  });

  await isolated("exact facility scope, cross-account boundaries and creator-only status privacy", async () => {
    const owned = await gateway(db, 1, () => reserve(db));
    const foreign = await gateway(db, 2, () => reserve(db, { account: accountB, facility: facilityB1 }));
    await gateway(db, 1, async () => {
      for (const overrides of [{ facility: facilityA2 }, { facility: facilityB1 }, { account: accountB, facility: facilityB1 }, { facility: null }]) {
        await expectSqlError(db, "42501", reserveSql, request(overrides));
      }
      for (const target of [foreign.object_id, id(999), null]) assert.deepEqual(await status(db, target), unavailable);
    });
    await gateway(db, 6, async () => {
      assert.deepEqual(await status(db, owned.object_id), unavailable);
      assert.deepEqual(await status(db, id(999)), unavailable);
    });
    assert.notEqual(owned.object_id, foreign.object_id);
    // Existing all-facilities VIEW is still valid, but never a wildcard INGEST.
    await db.query("update public.account_capability_grants set scope_kind = 'all_facilities', facility_id = null where user_profile_id = $1 and capability_key = 'view_asset'", [profile(1)]);
    await grant(db, accountA, 1, "ingest_private_object", "facility", facilityA2);
    await gateway(db, 1, async () => {
      assert.deepEqual(await rows(db, "select id from public.facilities order by id"), [{ id: facilityA1 }, { id: facilityA2 }]);
      assert.deepEqual(await rows(db, "select private.has_directory_capability($1, 'ingest_private_object', $2) as allowed", [accountA, facilityA2]), [{ allowed: false }]);
      assert.equal((await reserve(db, { facility: facilityA2, key: id(901) })).state, "reserved");
    });
  });

  await isolated("revocation denies next reserve/status/replay with unchanged simulated subject and roles", async () => {
    const original = await gateway(db, 1, () => reserve(db));
    await setSimulatedSubject(db, subject(1), { role: "authenticated", sub: subject(1) });
    const denyThenRestore = async (change, restore, params) => {
      await db.query(change, params);
      await asSession(db, "authenticator", "authenticated", async () => {
        await expectSqlError(db, "42501", reserveSql, request());
        await expectSqlError(db, "42501", reserveSql, request({ key: id(901) }));
        assert.deepEqual(await status(db, original.object_id), unavailable);
      });
      await db.query(restore, params);
    };
    await denyThenRestore("update public.user_profiles set identity_status = 'removed' where id = $1",
      "update public.user_profiles set identity_status = 'active' where id = $1", [profile(1)]);
    await denyThenRestore("update public.account_access set membership_status = 'suspended' where user_profile_id = $1",
      "update public.account_access set membership_status = 'active' where user_profile_id = $1", [profile(1)]);
    for (const capability of ["view_account", "view_asset", "ingest_private_object"]) {
      await denyThenRestore("update public.account_capability_grants set revoked_at = now() where user_profile_id = $1 and capability_key = $2",
        "update public.account_capability_grants set revoked_at = null where user_profile_id = $1 and capability_key = $2", [profile(1), capability]);
    }
    for (const [table, target] of [["user_profiles", profile(1)], ["client_accounts", accountA], ["facilities", facilityA1]]) {
      await denyThenRestore(`update public.${table} set is_demo = false where id = $1`,
        `update public.${table} set is_demo = true where id = $1`, [target]);
    }
    await denyThenRestore("update public.account_access set is_demo = false where user_profile_id = $1",
      "update public.account_access set is_demo = true where user_profile_id = $1", [profile(1)]);
    for (const capability of ["view_account", "view_asset", "ingest_private_object"]) {
      await denyThenRestore("update public.account_capability_grants set is_demo = false where user_profile_id = $1 and capability_key = $2",
        "update public.account_capability_grants set is_demo = true where user_profile_id = $1 and capability_key = $2", [profile(1), capability]);
    }
    assert.ok((await rows(db, "select id from public.account_memberships where user_profile_id = $1", [profile(1)])).length > 0);
    await db.query("delete from auth.users where id = $1", [subject(1)]);
    await asSession(db, "authenticator", "authenticated", async () => {
      await expectSqlError(db, "42501", reserveSql, request());
      assert.deepEqual(await status(db, original.object_id), unavailable);
    });
    assert.equal((await reservations(db)).length, 1);
    assert.equal((await reservationEvents(db)).length, 1);
    assert.equal((await reservations(db))[0].created_by_auth_user_id, subject(1));
  });

  await isolated("idempotent replay never renews or duplicates audit; changed canonical request conflicts", async () => {
    const first = await gateway(db, 1, () => reserve(db));
    const snapshot = await reservations(db);
    await gateway(db, 1, async () => {
      assert.deepEqual(await reserve(db), first);
      await expectSqlError(db, "23505", reserveSql, request({ bytes: 13 }));
    });
    await grant(db, accountA, 1, "view_asset", "facility", facilityA2);
    await grant(db, accountA, 1, "ingest_private_object", "facility", facilityA2);
    await gateway(db, 1, () => expectSqlError(db, "23505", reserveSql, request({ facility: facilityA2 })));
    assert.deepEqual(await reservations(db), snapshot);
    assert.equal((await reservationEvents(db)).length, 1);
    const otherCreator = await gateway(db, 6, () => reserve(db));
    assert.notEqual(first.object_id, otherCreator.object_id);
    assert.equal((await reservations(db)).length, 2);
  });

  await isolated("operational expiry returns expired without mutation, renewal, bytes or deletion", async () => {
    await db.exec("update private.private_object_reservation_config set reservation_ttl_seconds = 1");
    const first = await gateway(db, 1, () => reserve(db));
    const before = await reservations(db);
    // Real elapsed time; no test-only timestamp rewriting or immutable bypass.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const expired = { ...first, state: "expired" };
    assert.deepEqual(await gateway(db, 1, () => status(db, first.object_id)), expired);
    assert.deepEqual(await gateway(db, 1, () => reserve(db)), expired);
    assert.deepEqual(await reservations(db), before);
    assert.equal((await reservationEvents(db)).length, 1);
  });

  await isolated("private configuration is bounded/audited and client GUCs cannot enable or raise limits", async () => {
    const first = await gateway(db, 1, () => reserve(db));
    await db.exec("update private.private_object_reservation_config set enabled = false");
    await gateway(db, 1, async () => {
      await db.exec("select set_config('app.private_objects_enabled', 'true', true), set_config('app.private_object_max_bytes', '999999', true)");
      await expectSqlError(db, "42501", reserveSql, request());
      assert.deepEqual(await status(db, first.object_id), unavailable);
      await expectSqlError(db, "42501", "update private.private_object_reservation_config set enabled = true");
    });
    await db.exec("update private.private_object_reservation_config set enabled = true, max_bytes = 8");
    await gateway(db, 1, async () => {
      assert.deepEqual(await reserve(db), first); // Existing identity is unchanged by a smaller future limit.
      await expectSqlError(db, "22023", reserveSql, request({ key: id(901) }));
      assert.equal((await reserve(db, { key: id(902), bytes: 8 })).state, "reserved");
    });
    const events = await rows(db, "select * from public.audit_events where object_type = 'private_object_reservation_config' order by occurred_at, id");
    const count = events.length;
    await db.exec("update private.private_object_reservation_config set enabled = enabled");
    assert.equal((await rows(db, "select id from public.audit_events where object_type = 'private_object_reservation_config'")).length, count);
    for (const event of events) {
      assert.equal(event.actor_kind, "system");
      assert.equal(event.actor_auth_user_id, null);
      assert.equal(event.actor_user_profile_id, null);
      assert.equal(event.actor_system_key, "database_privileged_operation");
      assert.equal(event.account_id, null);
    }
    for (const assignment of ["max_bytes = 0", "max_bytes = 65537", "reservation_ttl_seconds = 0", "reservation_ttl_seconds = 3601", "revision = 99", "updated_at = '2000-01-01'", "singleton = false"]) {
      await expectSqlError(db, "23514", `update private.private_object_reservation_config set ${assignment}`);
    }
    await expectSqlError(db, "55000", "delete from private.private_object_reservation_config");
    await expectSqlError(db, "55000", "truncate private.private_object_reservation_config");
    await expectSqlError(db, "23505", "insert into private.private_object_reservation_config (enabled) values (true)");
  });

  await isolated("constraints keep narrow request types and preserve all old directory capability shapes", async () => {
    await gateway(db, 1, async () => {
      for (const overrides of [{ key: null }, { bytes: null }, { bytes: 0 }, { bytes: 65537 }, { media: "text/html" }, { media: "TEXT/PLAIN" }, { media: null }]) {
        await expectSqlError(db, "22023", reserveSql, request(overrides));
      }
      assert.equal((await reserve(db, { bytes: 65536 })).state, "reserved");
    });
    for (const [scope, facility] of [["account", null], ["all_facilities", null], ["facility", null], ["account", facilityA1]]) {
      await expectSqlError(db, "23514", `insert into public.account_capability_grants
        (account_id,user_profile_id,capability_key,scope_kind,facility_id) values ($1,$2,'ingest_private_object',$3,$4)`, [accountA, profile(3), scope, facility]);
    }
    await expectSqlError(db, "23503", `insert into public.account_capability_grants
      (account_id,user_profile_id,capability_key,scope_kind,facility_id) values ($1,$2,'ingest_private_object','facility',$3)`, [accountA, profile(3), facilityB1]);
    await grant(db, accountA, 3, "view_account", "account");
    await grant(db, accountA, 3, "view_asset", "facility", facilityA1);
    await grant(db, accountA, 3, "view_asset", "all_facilities");
    await gateway(db, 3, async () => {
      assert.deepEqual(await rows(db, "select id from public.client_accounts"), [{ id: accountA }]);
      assert.deepEqual(await rows(db, "select id from public.facilities order by id"), [{ id: facilityA1 }, { id: facilityA2 }]);
      await expectSqlError(db, "42501", reserveSql, request());
    });
  });

  await isolated("ACLs/RLS defeat broad default grants and private function invocation", async () => {
    for (const table of ["private_object_reservations", "private_object_reservation_config"]) {
      assert.deepEqual(await rows(db, "select relrowsecurity from pg_class where oid = $1::regclass", [`private.${table}`]), [{ relrowsecurity: true }]);
      for (const role of ["public", "anon", "authenticated", "service_role"]) {
        assert.deepEqual(await rows(db, `select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as allowed,
          has_any_column_privilege($1,$2,'SELECT,INSERT,UPDATE,REFERENCES') as columns`, [role, `private.${table}`]), [{ allowed: false, columns: false }]);
      }
    }
    const functions = await rows(db, `select n.nspname, p.proname, p.oid, p.prosecdef, p.proconfig
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where p.proname in ('private_object_authenticated_subject','lock_private_object_ingest','prepare_private_object_reservation',
        'guard_private_object_reservation_history','guard_private_object_reservation_config','audit_private_object_reservation_change',
        'reserve_private_object','private_object_status')`);
    assert.equal(functions.length, 10);
    for (const fn of functions) {
      assert.ok(fn.proconfig.includes('search_path=""'));
      if (fn.nspname === "public") assert.equal(fn.prosecdef, false);
      for (const role of ["public", "anon", "authenticated", "service_role"]) {
        const expected = role === "authenticated" && ["reserve_private_object", "private_object_status"].includes(fn.proname);
        assert.deepEqual(await rows(db, "select has_function_privilege($1,$2,'EXECUTE') as allowed", [role, fn.oid]), [{ allowed: expected }]);
      }
    }
    await gateway(db, 1, async () => {
      for (const sql of [
        "select count(*) from private.private_object_reservations",
        "select jsonb_agg(r) from private.private_object_reservations r",
        "select a.id from public.client_accounts a join private.private_object_reservations r on r.account_id=a.id",
        "insert into private.private_object_reservations (account_id) values (null)",
        "update private.private_object_reservations set state='reserved'",
        "delete from private.private_object_reservations", "truncate private.private_object_reservations",
        "select private.private_object_authenticated_subject()",
        "select private.lock_private_object_ingest(null,null)",
      ]) await expectSqlError(db, "42501", sql);
    });
    await asSession(db, "authenticator", "service_role", async () => {
      await expectSqlError(db, "42501", "select * from private.private_object_reservations");
      await expectSqlError(db, "42501", "update private.private_object_reservation_config set enabled=true");
    });
  });

  await isolated("empty search paths resist temporary relation/function shadowing", async () => {
    await gateway(db, 1, async () => {
      await db.exec(`create temp table private_object_reservations (id uuid);
        create temp table private_object_reservation_config (enabled boolean);
        create temp table user_profiles (id uuid, auth_user_id uuid);
        create function pg_temp.gen_random_uuid() returns uuid language sql as $$select '${id(999)}'::uuid$$;
        set local search_path = pg_temp, public, private;`);
      const result = await reserve(db);
      assert.notEqual(result.object_id, id(999));
      assert.deepEqual(await status(db, result.object_id), result);
    });
    assert.equal((await reservations(db)).length, 1);
  });

  await isolated("immutability and NO ACTION references protect metadata including upstream cascades", async () => {
    const result = await gateway(db, 1, () => reserve(db));
    const before = await reservations(db);
    for (const assignment of ["account_id = account_id", "created_by_profile_id = created_by_profile_id", "expires_at = expires_at + interval '1 second'", "canonical_request = '{}'", "state = 'uploaded'", "is_demo = false", "object_key = 'replacement'"]) {
      await expectSqlError(db, "55000", `update private.private_object_reservations set ${assignment} where id=$1`, [result.object_id]);
    }
    await expectSqlError(db, "55000", "delete from private.private_object_reservations");
    await expectSqlError(db, "55000", "truncate private.private_object_reservations");
    await expectSqlError(db, "23503", "delete from public.facilities where id=$1", [facilityA1]);
    await expectSqlError(db, "23503", "delete from public.account_access where account_id=$1 and user_profile_id=$2", [accountA, profile(1)]);
    await expectSqlError(db, "23503", "delete from public.user_profiles where id=$1", [profile(1)]);
    await expectSqlError(db, "23503", "delete from public.client_accounts where id=$1", [accountA]);
    await expectSqlError(db, "55000", "truncate public.client_accounts cascade");
    assert.deepEqual(await reservations(db), before);
    assert.deepEqual(await rows(db, `select distinct confdeltype, confupdtype from pg_constraint
      where conrelid = 'private.private_object_reservations'::regclass and contype='f'`), [{ confdeltype: "a", confupdtype: "a" }]);
  });

  await isolated("protected audit scope and failure rollback leave no orphan reservation/config change", async () => {
    const first = await gateway(db, 1, () => reserve(db));
    await asSession(db, "authenticator", "service_role", () => expectSqlError(db, "42501",
      "insert into public.audit_events (object_type,event_type) values ('private_object','private_object_reserved')"));
    await expectSqlError(db, "55000", "update public.audit_events set occurred_at = now() where object_id=$1", [first.object_id]);
    await expectSqlError(db, "55000", "delete from public.audit_events where object_id=$1", [first.object_id]);
    await expectSqlError(db, "23514", `insert into public.audit_events
      (account_id, object_type, object_id, event_type, actor_kind, actor_system_key)
      values ($1,'private_object',$2,'private_object_reserved','system','database_privileged_operation')`, [accountA, id(999)]);
    await expectSqlError(db, "23514", `insert into public.audit_events
      (account_id, object_type, object_id, event_type, actor_kind, actor_system_key)
      values ($1,'private_object',$2,'private_object_finalized','system','database_privileged_operation')`, [accountA, id(999)]);
    // Failure injection adds a constraint, never disables audit or immutable guards.
    await db.exec(`alter table public.audit_events add constraint reservation_test_audit_failure
      check (event_type not in ('private_object_reserved','private_object_reservation_config_updated')) not valid`);
    const before = await reservations(db);
    const configBefore = await rows(db, "select * from private.private_object_reservation_config");
    await gateway(db, 1, () => expectSqlError(db, "23514", reserveSql, request({ key: id(901) })));
    await expectSqlError(db, "23514", "update private.private_object_reservation_config set enabled=false");
    assert.deepEqual(await reservations(db), before);
    assert.deepEqual(await rows(db, "select * from private.private_object_reservation_config"), configBefore);
    assert.equal((await reservationEvents(db)).length, 1);
  });
});
