import assert from "node:assert/strict";
import test from "node:test";
import {
  asClientRole,
  asProvisioningRole,
  createTestDatabase,
  directoryMigrationUrl,
  foundationSeedUrl,
  runSqlFile,
  setSimulatedSubject,
} from "../helpers/pglite-database.mjs";

const id = (suffix, prefix = "00000000") =>
  `${prefix}-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const accountA = id(1);
const accountB = id(2);
const facilityA1 = id(301);
const facilityA2 = id(302);
const facilityB1 = id(303);
const facilityNonDemo = id(304);
const profile = (number) => id(100 + number);
const subject = (number) => id(100 + number, "10000000");
const tables = [
  "account_access", "account_capability_grants", "account_memberships",
  "audit_events", "client_accounts", "documents", "facilities",
  "incident_requests", "user_profiles",
];
const directoryQueries = [
  "select id, display_name, identity_status, is_demo from public.user_profiles order by id",
  "select id, display_name, is_demo from public.client_accounts order by id",
  "select id, account_id, display_name, is_demo from public.facilities order by id",
];

async function rows(database, sql, params = []) {
  return (await database.query(sql, params)).rows;
}

async function directory(database, subjectNumber, claims = {}) {
  await setSimulatedSubject(database, subjectNumber === null ? null : subject(subjectNumber), claims);
  return asClientRole(database, "authenticated", async () => {
    const result = [];
    for (const query of directoryQueries) result.push(await rows(database, query));
    return result;
  });
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

async function grant(database, accountId, profileId, capabilityKey, scopeKind, facilityId = null) {
  await database.query(`
    insert into public.account_capability_grants
      (account_id, user_profile_id, capability_key, scope_kind, facility_id)
    values ($1, $2, $3, $4, $5)
  `, [accountId, profileId, capabilityKey, scopeKind, facilityId]);
}

async function provisionSyntheticDirectory(database) {
  await database.query("insert into auth.users (id) select unnest($1::uuid[]) on conflict do nothing",
    [Array.from({ length: 8 }, (_, index) => subject(index + 1))]);
  await database.query("insert into public.client_accounts (id, display_name) values ($1, 'Account B synthetic')", [accountB]);
  await database.query(`insert into public.facilities (id, account_id, display_name, is_demo)
    values ($1, $2, 'Facility A2 synthetic', true),
           ($3, $4, 'Facility B1 synthetic', true),
           ($5, $2, 'Non-demo facility restriction fixture', false)`,
  [facilityA2, accountA, facilityB1, accountB, facilityNonDemo]);

  // Linking and activation are distinct trusted operations. Profile 5 stays
  // unlinked; subject 8 has no profile; profile 7 retains suspended membership.
  for (const number of [1, 2, 3, 4, 6, 7]) {
    await database.query("update public.user_profiles set auth_user_id = $1 where id = $2", [subject(number), profile(number)]);
    await database.query("update public.user_profiles set identity_status = 'active' where id = $1", [profile(number)]);
    if (number !== 7) {
      await database.query("update public.account_access set membership_status = 'active' where account_id = $1 and user_profile_id = $2", [accountA, profile(number)]);
    }
    await grant(database, accountA, profile(number), "view_account", "account");
  }
  await database.query("update public.user_profiles set identity_status = 'active' where id = $1", [profile(5)]);
  await database.query(`insert into public.account_access (account_id, user_profile_id, membership_status)
    values ($1, $2, 'active')`, [accountB, profile(4)]);
  for (const number of [1, 6, 7]) await grant(database, accountA, profile(number), "view_asset", "facility", facilityA1);
  for (const number of [3, 4]) await grant(database, accountA, profile(number), "view_asset", "all_facilities");
  await grant(database, accountB, profile(4), "view_account", "account");
  await grant(database, accountB, profile(4), "view_asset", "all_facilities");
}

test("PostgreSQL directory authorization with simulated Auth request context (not Supabase Auth/API)", async (t) => {
  const database = await createTestDatabase({ applyDirectory: false });
  t.after(() => database.close());

  // Exercise an existing valid Auth link and mixed legacy roles before backfill.
  await database.query("insert into auth.users (id) values ($1)", [subject(2)]);
  await database.query("update public.user_profiles set auth_user_id = $1 where id = $2", [subject(2), profile(2)]);
  await database.query(`insert into public.account_memberships (account_id, user_profile_id, role_key)
    values ($1, $2, 'system_admin'), ($1, $3, 'removed_suspended')`, [accountA, profile(7), profile(3)]);
  const originalRoleRows = await rows(database, "select * from public.account_memberships order by id");
  await runSqlFile(database, directoryMigrationUrl);

  const isolated = async (name, callback) => t.test(name, async () => {
    await database.exec("begin");
    try { await callback(); } finally { await database.exec("rollback"); }
  });

  await isolated("migration preserves legacy rows and backfills only invited/suspended access", async () => {
    assert.deepEqual(await rows(database, "select * from public.account_memberships order by id"), originalRoleRows);
    assert.deepEqual(await rows(database, "select user_profile_id, membership_status from public.account_access order by user_profile_id"),
      Array.from({ length: 7 }, (_, index) => ({
        user_profile_id: profile(index + 1),
        membership_status: [3, 7].includes(index + 1) ? "suspended" : "invited",
      })));
    assert.deepEqual(await rows(database, "select distinct identity_status from public.user_profiles"), [{ identity_status: "suspended" }]);
    assert.deepEqual(await rows(database, "select auth_user_id from public.user_profiles where id = $1", [profile(2)]), [{ auth_user_id: subject(2) }]);
    assert.deepEqual(await rows(database, "select id, auth_linked_once from public.user_profiles order by id"),
      Array.from({ length: 7 }, (_, index) => ({ id: profile(index + 1), auth_linked_once: index + 1 === 2 })));
    assert.deepEqual(await rows(database, "select count(*)::int as total from public.account_capability_grants"), [{ total: 0 }]);
    assert.deepEqual(await directory(database, 2), [[], [], []]);
    await runSqlFile(database, foundationSeedUrl);
    assert.deepEqual(await rows(database, "select * from public.account_memberships order by id"), originalRoleRows);
  });

  await provisionSyntheticDirectory(database);

  await isolated("A1-only subject reads its own profile, account and exact facility", async () => {
    const result = await directory(database, 1);
    assert.deepEqual(result[0], [{ id: profile(1), display_name: "System Admin Demo", identity_status: "active", is_demo: true }]);
    assert.deepEqual(result[1], [{ id: accountA, display_name: "Demo Property Group", is_demo: true }]);
    assert.deepEqual(result[2], [{ id: facilityA1, account_id: accountA, display_name: "North Wing Facility", is_demo: true }]);
  });

  await isolated("guessed tenants/facilities, joins, counts and exported rows stay scoped", async () => {
    await setSimulatedSubject(database, subject(1), {
      user_metadata: { profile_id: profile(4), account_id: accountB, role: "system_admin" },
      roles: ["system_admin"], account_id: accountB,
    });
    await asClientRole(database, "authenticated", async () => {
      assert.deepEqual(await rows(database, "select id from public.facilities where id = any($1::uuid[])", [[facilityA2, facilityB1]]), []);
      assert.deepEqual(await rows(database, "select id from public.client_accounts where id = $1", [accountB]), []);
      assert.deepEqual(await rows(database, `select a.id, count(f.id)::int as facilities
        from public.client_accounts a left join public.facilities f on f.account_id = a.id
        group by a.id order by a.id`), [{ id: accountA, facilities: 1 }]);
      assert.deepEqual(await rows(database, `select f.id, a.id as account_id from public.facilities f
        join public.client_accounts a on a.id = f.account_id order by f.id`), [{ id: facilityA1, account_id: accountA }]);
      assert.deepEqual(await rows(database, "select count(*)::int as total from public.facilities"), [{ total: 1 }]);
      assert.deepEqual(await rows(database, "select jsonb_agg(id order by id) as exported_ids from public.facilities"), [{ exported_ids: [facilityA1] }]);
    });
  });

  await isolated("account-read alone reveals no facilities; all_facilities is explicit and same-account", async () => {
    assert.deepEqual((await directory(database, 2)).map((items) => items.map((item) => item.id)), [[profile(2)], [accountA], []]);
    assert.deepEqual((await directory(database, 3)).map((items) => items.map((item) => item.id)), [[profile(3)], [accountA], [facilityA1, facilityA2]]);
    await database.query("delete from public.account_capability_grants where user_profile_id = $1 and capability_key = 'view_account'", [profile(3)]);
    assert.deepEqual((await directory(database, 3)).slice(1), [[], []]);
  });

  await isolated("unknown keys, invalid helper arguments, absent membership and grants deny", async () => {
    await setSimulatedSubject(database, subject(1));
    await asClientRole(database, "authenticated", async () => {
      for (const args of [
        [accountA, "admin", null], [accountA, "view_document", null],
        [accountA, "view_account", facilityA1], [accountA, "view_asset", null],
        [accountA, "view_asset", facilityB1], [accountA, "view_asset", id(999)],
        [accountB, "view_account", null], [null, "view_account", null], [accountA, null, null],
      ]) {
        assert.deepEqual(await rows(database, "select private.has_directory_capability($1, $2, $3) as allowed", args), [{ allowed: false }]);
      }
    });
    await database.query("delete from public.account_capability_grants where user_profile_id = $1", [profile(1)]);
    assert.deepEqual((await directory(database, 1)).slice(1), [[], []]);
  });

  await isolated("legacy technical or alternate roles never overcome inactive lifecycle status", async () => {
    assert.deepEqual((await directory(database, 7)).slice(1), [[], []]);
    for (const status of ["invited", "suspended", "removed"]) {
      await database.query("update public.account_access set membership_status = $1 where user_profile_id = $2", [status, profile(1)]);
      await database.query(`insert into public.account_memberships (account_id, user_profile_id, role_key)
        values ($1, $2, 'document_viewer') on conflict do nothing`, [accountA, profile(1)]);
      assert.deepEqual((await directory(database, 1)).slice(1), [[], []]);
      assert.deepEqual(await rows(database, "select membership_status from public.account_access where user_profile_id = $1", [profile(1)]), [{ membership_status: status }]);
    }
  });

  await isolated("null/unlinked subjects and anonymous/unknown protected claims deny", async () => {
    for (const number of [null, 5, 8]) assert.deepEqual(await directory(database, number), [[], [], []]);
    for (const is_anonymous of [true, undefined, null, "false", 0]) {
      assert.deepEqual(await directory(database, 1, {
        is_anonymous,
        user_metadata: { is_anonymous: false, profile_id: profile(4) },
      }), [[], [], []]);
    }
    await setSimulatedSubject(database, subject(1));
    await asClientRole(database, "anon", async () => {
      for (const query of directoryQueries) await expectSqlError(database, "42501", query);
      await expectSqlError(database, "42501", "select private.current_subject_id()");
    });
  });

  await isolated("every demo restriction participates in the effective predicate", async () => {
    const restrictions = [
      ["user_profiles", "id", profile(1), [0, 0, 0]],
      ["client_accounts", "id", accountA, [1, 0, 0]],
      ["account_access", "user_profile_id", profile(1), [1, 0, 0]],
      ["facilities", "id", facilityA1, [1, 1, 0]],
    ];
    for (const [table, key, target, expected] of restrictions) {
      await database.query(`update public.${table} set is_demo = false where ${key} = $1`, [target]);
      assert.deepEqual((await directory(database, 1)).map((items) => items.length), expected, table);
      await database.query(`update public.${table} set is_demo = true where ${key} = $1`, [target]);
    }
    for (const capabilityKey of ["view_asset", "view_account"]) {
      await database.query("update public.account_capability_grants set is_demo = false where user_profile_id = $1 and capability_key = $2", [profile(1), capabilityKey]);
      assert.deepEqual((await directory(database, 1)).map((items) => items.length), capabilityKey === "view_asset" ? [1, 1, 0] : [1, 0, 0]);
      await database.query("update public.account_capability_grants set is_demo = true where user_profile_id = $1 and capability_key = $2", [profile(1), capabilityKey]);
    }
  });

  await isolated("constraints reject cross-tenant grants, invalid statuses/scopes and active duplicates", async () => {
    await expectSqlError(database, "23503", `insert into public.account_capability_grants
      (account_id, user_profile_id, capability_key, scope_kind, facility_id) values ($1, $2, 'view_asset', 'facility', $3)`, [accountB, profile(4), facilityA1]);
    await expectSqlError(database, "23503", `insert into public.account_capability_grants
      (account_id, user_profile_id, capability_key, scope_kind) values ($1, $2, 'view_account', 'account')`, [accountB, profile(1)]);
    await expectSqlError(database, "23514", "update public.account_access set membership_status = 'admin' where user_profile_id = $1", [profile(1)]);
    await expectSqlError(database, "23514", "update public.user_profiles set identity_status = 'invited' where id = $1", [profile(1)]);
    for (const [capability, scope, facility] of [
      ["view_account", "account", facilityA1], ["view_account", "all_facilities", null],
      ["view_asset", "facility", null], ["view_asset", "all_facilities", facilityA1],
      ["view_document", "account", null], ["*", "account", null],
    ]) await expectSqlError(database, "23514", `insert into public.account_capability_grants
      (account_id, user_profile_id, capability_key, scope_kind, facility_id) values ($1, $2, $3, $4, $5)`, [accountA, profile(1), capability, scope, facility]);
    for (const [person, capability, scope, facility] of [
      [1, "view_account", "account", null], [1, "view_asset", "facility", facilityA1],
      [3, "view_asset", "all_facilities", null],
    ]) await expectSqlError(database, "23505", `insert into public.account_capability_grants
      (account_id, user_profile_id, capability_key, scope_kind, facility_id) values ($1, $2, $3, $4, $5)`, [accountA, profile(person), capability, scope, facility]);
    await database.query(`update public.account_capability_grants set revoked_at = now()
      where user_profile_id = $1 and capability_key = 'view_account'`, [profile(1)]);
    await grant(database, accountA, profile(1), "view_account", "account");
    assert.deepEqual(await rows(database, `select count(*)::int as total from public.account_capability_grants
      where user_profile_id = $1 and capability_key = 'view_account'`, [profile(1)]), [{ total: 2 }]);
  });

  await isolated("profile links require real Auth IDs, start suspended and cannot be reassigned", async () => {
    await expectSqlError(database, "23514", "update public.user_profiles set auth_user_id = $1 where id = $2", [subject(8), profile(1)]);
    await expectSqlError(database, "23514", "update public.user_profiles set auth_user_id = $1 where id = $2", [subject(5), profile(5)]);
    await expectSqlError(database, "23503", "insert into public.user_profiles (auth_user_id, display_name) values ($1, 'Missing Auth fixture')", [subject(99)]);
    await expectSqlError(database, "23505", "insert into public.user_profiles (auth_user_id, display_name) values ($1, 'Duplicate Auth fixture')", [subject(1)]);
    await expectSqlError(database, "23514", "insert into public.user_profiles (auth_user_id, display_name, identity_status) values ($1, 'Active link fixture', 'active')", [subject(8)]);
    await asProvisioningRole(database, async () => {
      assert.deepEqual(await rows(database, "select auth_linked_once from public.user_profiles where id = $1", [profile(5)]), [{ auth_linked_once: false }]);
      await expectSqlError(database, "23514", "update public.user_profiles set auth_linked_once = true where id = $1", [profile(5)]);
      await database.query("update public.user_profiles set identity_status = 'suspended' where id = $1", [profile(5)]);
      await database.query("update public.user_profiles set auth_user_id = $1 where id = $2", [subject(5), profile(5)]);
      assert.deepEqual(await rows(database, "select auth_linked_once from public.user_profiles where id = $1", [profile(5)]), [{ auth_linked_once: true }]);
      await database.query("insert into public.user_profiles (id, auth_user_id, display_name) values ($1, $2, 'Initial linked profile synthetic')", [profile(9), subject(8)]);
      assert.deepEqual(await rows(database, "select identity_status, auth_linked_once from public.user_profiles where id = $1", [profile(9)]), [{ identity_status: "suspended", auth_linked_once: true }]);
      await expectSqlError(database, "23514", "insert into public.user_profiles (display_name, auth_linked_once) values ('Forged history synthetic', true)");
    });
    assert.deepEqual(await directory(database, 5), [[], [], []]);
  });

  await isolated("service_role cannot reset linkage history or inherit access after manual unlink", async () => {
    // Profile 2 was linked before migration; profile 4 was linked by the guarded
    // initial-attachment path. Both retain their existing grants after unlink.
    const grantsBefore = await rows(database, "select * from public.account_capability_grants where user_profile_id = any($1::uuid[]) order by id", [[profile(2), profile(4)]]);
    await asProvisioningRole(database, async () => {
      for (const number of [2, 4]) {
        await expectSqlError(database, "23514", "update public.user_profiles set auth_linked_once = false where id = $1", [profile(number)]);
        await database.query("update public.user_profiles set auth_user_id = null, identity_status = 'suspended' where id = $1", [profile(number)]);
        assert.deepEqual(await rows(database, "select auth_user_id, auth_linked_once from public.user_profiles where id = $1", [profile(number)]), [{ auth_user_id: null, auth_linked_once: true }]);
        await expectSqlError(database, "23514", "update public.user_profiles set auth_linked_once = default where id = $1", [profile(number)]);
        await expectSqlError(database, "23514", "update public.user_profiles set auth_user_id = $1, auth_linked_once = false where id = $2", [subject(8), profile(number)]);
        for (const status of ["active", "removed", "suspended"]) {
          await database.query("update public.user_profiles set identity_status = $1 where id = $2", [status, profile(number)]);
        }
        for (const replacement of [subject(8), subject(number)]) {
          await expectSqlError(database, "23514", "update public.user_profiles set auth_user_id = $1 where id = $2", [replacement, profile(number)]);
        }
      }
    });
    assert.deepEqual(await rows(database, "select * from public.account_capability_grants where user_profile_id = any($1::uuid[]) order by id", [[profile(2), profile(4)]]), grantsBefore);
    for (const number of [2, 4, 8]) assert.deepEqual(await directory(database, number), [[], [], []]);
  });

  await isolated("Auth deletion preserves history and service_role cannot attach a replacement identity", async () => {
    const history = await rows(database, "select id from public.audit_events where actor_user_profile_id = $1", [profile(3)]);
    const roles = await rows(database, "select id from public.account_memberships where user_profile_id = $1 order by id", [profile(3)]);
    const grantsBefore = await rows(database, "select * from public.account_capability_grants where user_profile_id = $1 order by id", [profile(3)]);
    await database.query("delete from auth.users where id = $1", [subject(3)]);
    assert.deepEqual(await rows(database, "select id, auth_user_id, auth_linked_once from public.user_profiles where id = $1", [profile(3)]), [{ id: profile(3), auth_user_id: null, auth_linked_once: true }]);
    assert.deepEqual(await rows(database, "select id from public.audit_events where actor_user_profile_id = $1", [profile(3)]), history);
    assert.deepEqual(await rows(database, "select id from public.account_memberships where user_profile_id = $1 order by id", [profile(3)]), roles);
    assert.deepEqual(await directory(database, 3), [[], [], []]);
    // Recreating the old UUID in the explicit Auth mock proves the denial is
    // immutable profile history, not merely a missing referenced Auth row.
    await database.query("insert into auth.users (id) values ($1)", [subject(3)]);
    await asProvisioningRole(database, async () => {
      await database.query("update public.user_profiles set identity_status = 'suspended' where id = $1", [profile(3)]);
      await expectSqlError(database, "23514", "update public.user_profiles set auth_linked_once = false where id = $1", [profile(3)]);
      for (const replacement of [subject(8), subject(3)]) {
        await expectSqlError(database, "23514", "update public.user_profiles set auth_user_id = $1 where id = $2", [replacement, profile(3)]);
      }
    });
    assert.deepEqual(await rows(database, "select * from public.account_capability_grants where user_profile_id = $1 order by id", [profile(3)]), grantsBefore);
    for (const number of [3, 8]) assert.deepEqual(await directory(database, number), [[], [], []]);
    await expectSqlError(database, "23503", "delete from public.user_profiles where id = $1", [profile(3)]);
    await expectSqlError(database, "23503", "delete from public.account_access where user_profile_id = $1", [profile(3)]);
  });

  await isolated("private helpers have pinned paths, trusted ownership and minimal execution ACLs", async () => {
    const functions = await rows(database, `select p.proname, p.prosecdef, p.provolatile, p.proconfig,
      p.proowner = c.relowner as same_owner,
      has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') as client_execute,
      exists (select 1 from aclexplode(p.proacl) acl where acl.grantee = 0 and acl.privilege_type = 'EXECUTE') as public_execute
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      cross join pg_class c join pg_namespace cn on cn.oid = c.relnamespace
      where n.nspname = 'private' and cn.nspname = 'public' and c.relname = 'user_profiles'
      order by p.proname`);
    assert.equal(functions.length, 5);
    for (const fn of functions) {
      const helper = ["current_subject_id", "has_directory_capability"].includes(fn.proname);
      assert.equal(fn.prosecdef, helper, fn.proname);
      if (helper) assert.equal(fn.provolatile, "s");
      assert.deepEqual(fn.proconfig, ['search_path=""']);
      assert.equal(fn.same_owner, true);
      assert.equal(fn.anon_execute, false);
      assert.equal(fn.public_execute, false);
      assert.equal(fn.client_execute, helper);
    }
    assert.deepEqual(await rows(database, `select has_schema_privilege('authenticated', 'private', 'CREATE') as can_create,
      has_schema_privilege('anon', 'private', 'USAGE') as anon_usage`), [{ can_create: false, anon_usage: false }]);
  });

  await isolated("RLS and exact column grants replace broad table/column defaults", async () => {
    assert.deepEqual(await rows(database, "select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename"),
      tables.map((tablename) => ({ tablename, rowsecurity: true })));
    const allowed = await rows(database, `select c.relname as table_name, a.attname as column_name
      from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
        and has_column_privilege('authenticated', c.oid, a.attnum, 'SELECT')
      order by c.relname, a.attname`);
    assert.deepEqual(allowed, [
      ...["display_name", "id", "is_demo"].map((column_name) => ({ table_name: "client_accounts", column_name })),
      ...["account_id", "display_name", "id", "is_demo"].map((column_name) => ({ table_name: "facilities", column_name })),
      ...["display_name", "id", "identity_status", "is_demo"].map((column_name) => ({ table_name: "user_profiles", column_name })),
    ]);
    for (const table of tables) {
      for (const role of ["anon", "authenticated"]) {
        assert.deepEqual(await rows(database, `select has_table_privilege($1, $2, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as any_table_privilege`, [role, `public.${table}`]), [{ any_table_privilege: false }]);
      }
    }
    const writableColumns = await rows(database, `select c.relname from pg_attribute a
      join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
        and (has_column_privilege('authenticated', c.oid, a.attnum, 'INSERT,UPDATE,REFERENCES')
          or has_column_privilege('anon', c.oid, a.attnum, 'SELECT,INSERT,UPDATE,REFERENCES'))`);
    assert.deepEqual(writableColumns, []);
    assert.deepEqual(await rows(database, "select tablename, cmd from pg_policies where schemaname = 'public' order by tablename"),
      ["client_accounts", "facilities", "user_profiles"].map((tablename) => ({ tablename, cmd: "SELECT" })));
    for (const table of ["client_accounts", "user_profiles", "facilities", "account_access", "account_capability_grants", "account_memberships"]) {
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
        assert.deepEqual(await rows(database, "select has_table_privilege('service_role', $1, $2) as allowed", [`public.${table}`, privilege]), [{ allowed: true }]);
      }
    }
  });

  await isolated("all client writes, self grants, forged actor/profile payloads and hidden columns deny", async () => {
    await setSimulatedSubject(database, subject(1));
    for (const role of ["anon", "authenticated"]) await asClientRole(database, role, async () => {
      for (const table of tables) {
        const column = table === "account_access" ? "membership_status" : "id";
        await expectSqlError(database, "42501", `insert into public.${table} default values`);
        await expectSqlError(database, "42501", `update public.${table} set ${column} = ${column}`);
        await expectSqlError(database, "42501", `delete from public.${table}`);
        await expectSqlError(database, "42501", `truncate public.${table} cascade`);
        await expectSqlError(database, "42501", `select * from public.${table}`);
      }
      await expectSqlError(database, "42501", "select auth_user_id from public.user_profiles");
      await expectSqlError(database, "42501", "select auth_linked_once from public.user_profiles");
      await expectSqlError(database, "42501", "select created_at from public.client_accounts");
      await expectSqlError(database, "42501", "select updated_at from public.facilities");
      await expectSqlError(database, "42501", "update public.user_profiles set auth_user_id = $1, identity_status = 'active' where id = $2", [subject(1), profile(4)]);
      await expectSqlError(database, "42501", "update public.user_profiles set auth_linked_once = false where id = $1", [profile(1)]);
      await expectSqlError(database, "42501", `insert into public.account_capability_grants
        (account_id, user_profile_id, capability_key, scope_kind) values ($1, $2, 'view_asset', 'all_facilities')`, [accountB, profile(1)]);
      await expectSqlError(database, "42501", `insert into public.audit_events
        (account_id, actor_user_profile_id, object_type, event_type) values ($1, $2, 'account', 'forged_actor_fixture')`, [accountB, profile(4)]);
    });
  });

  await t.test("committed lifecycle and grant revocation deny the next query with unchanged simulated claims", async () => {
    const heldClaims = { is_anonymous: false, roles: ["system_admin"] };
    await setSimulatedSubject(database, subject(4), heldClaims);
    const counts = () => asClientRole(database, "authenticated", async () => {
      const result = [];
      for (const query of directoryQueries) result.push((await rows(database, query)).length);
      return result;
    });
    try {
      assert.deepEqual(await counts(), [1, 2, 3]);
      for (const status of ["suspended", "removed"]) {
        await database.query("update public.user_profiles set identity_status = $1 where id = $2", [status, profile(4)]);
        assert.deepEqual(await counts(), [0, 0, 0]);
      }
      await database.query("update public.user_profiles set identity_status = 'active' where id = $1", [profile(4)]);
      for (const status of ["suspended", "removed"]) {
        await database.query("update public.account_access set membership_status = $1 where account_id = $2 and user_profile_id = $3", [status, accountA, profile(4)]);
        assert.deepEqual(await counts(), [1, 1, 1]);
      }
      await database.query("update public.account_access set membership_status = 'active' where user_profile_id = $1", [profile(4)]);
      await database.query("update public.account_capability_grants set revoked_at = now() where account_id = $1 and user_profile_id = $2 and capability_key = 'view_asset'", [accountA, profile(4)]);
      assert.deepEqual(await counts(), [1, 2, 1]);
      await database.query("update public.account_capability_grants set revoked_at = now() where account_id = $1 and user_profile_id = $2 and capability_key = 'view_account'", [accountA, profile(4)]);
      assert.deepEqual(await counts(), [1, 1, 1]);
      assert.deepEqual(await rows(database, "select auth.jwt() as claims"), [{ claims: heldClaims }]);
    } finally {
      await database.query("update public.user_profiles set identity_status = 'active' where id = $1", [profile(4)]);
      await database.query("update public.account_access set membership_status = 'active' where user_profile_id = $1", [profile(4)]);
      await database.query("update public.account_capability_grants set revoked_at = null where user_profile_id = $1", [profile(4)]);
    }
  });
});

test("unchanged foundation seed works after both migrations without activating access", async (t) => {
  const database = await createTestDatabase({ seedBeforeMigration: false });
  t.after(() => database.close());
  await runSqlFile(database, foundationSeedUrl);
  await runSqlFile(database, foundationSeedUrl);
  assert.deepEqual(await rows(database, "select membership_status, count(*)::int as total from public.account_access group by membership_status order by membership_status"),
    [{ membership_status: "invited", total: 6 }, { membership_status: "suspended", total: 1 }]);
  assert.deepEqual(await rows(database, "select identity_status, count(*)::int as total from public.user_profiles group by identity_status"), [{ identity_status: "suspended", total: 7 }]);
  assert.deepEqual(await rows(database, "select auth_linked_once, count(*)::int as total from public.user_profiles group by auth_linked_once"), [{ auth_linked_once: false, total: 7 }]);
  assert.deepEqual(await rows(database, "select count(*)::int as total from public.account_memberships"), [{ total: 7 }]);
  assert.deepEqual(await rows(database, "select count(*)::int as total from public.account_capability_grants"), [{ total: 0 }]);
  assert.deepEqual(await directory(database, 1), [[], [], []]);
});

test("orphaned pre-existing Auth link aborts the additive migration without altering history", async (t) => {
  const database = await createTestDatabase({ seedBeforeMigration: false, applyDirectory: false });
  t.after(() => database.close());
  await database.query("insert into public.user_profiles (id, auth_user_id, display_name) values ($1, $2, 'Orphan link synthetic')", [profile(1), subject(1)]);
  await assert.rejects(runSqlFile(database, directoryMigrationUrl), (error) => error.code === "23503");
  await database.exec("rollback");
  assert.deepEqual(await rows(database, "select id, auth_user_id from public.user_profiles"), [{ id: profile(1), auth_user_id: subject(1) }]);
  assert.deepEqual(await rows(database, "select to_regclass('public.account_access') as access_table"), [{ access_table: null }]);
  assert.deepEqual(await rows(database, "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'user_profiles' and column_name in ('identity_status', 'auth_linked_once')"), []);
});
