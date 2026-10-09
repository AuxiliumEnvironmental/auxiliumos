import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { createTestDatabase, runSqlFile } from '../helpers/pglite-database.mjs';
import { OWNER_IDS, OWNER_GRANTS } from '../../scripts/owner-onboarding.mjs';

const invitedId = '41000000-0000-4000-8000-000000000001';
const otherId = '41000000-0000-4000-8000-000000000002';
const syntheticEmail = 'owner@example.invalid';
const source = await readFile(new URL('../../scripts/provision-owner-from-dashboard.sql', import.meta.url), 'utf8');
const syntheticSource = source.replace('25b94cb2f529c847c80f4581f9101ff74676472d0df211419fed1a522652c5d9',
  createHash('sha256').update(syntheticEmail).digest('hex'));
function configured(id = invitedId) {
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.equal(syntheticSource.split('v_expected_auth_id constant uuid := null;').length, 2);
  return syntheticSource.replace('v_expected_auth_id constant uuid := null;', `v_expected_auth_id constant uuid := '${id}';`);
}
// Most denial cases use the unchanged DO block within their own rollback-only
// transaction. Happy path, template refusal and atomic rollback use the complete
// operational BEGIN/COMMIT script, with its actual transaction boundaries.
const block = sql => sql.slice(sql.indexOf('do $$'), sql.indexOf('end $$;') + 'end $$;'.length);
const one = async (db, sql, args = []) => (await db.query(sql, args)).rows[0];
const tables = ['user_profiles', 'client_accounts', 'facilities', 'account_access', 'account_memberships', 'account_capability_grants', 'audit_events'];
async function snapshot(db) {
  const state = {};
  for (const table of tables) state[table] = (await db.query(`select row_to_json(t) r from public.${table} t order by row_to_json(t)::text`)).rows;
  return state;
}

test('Dashboard-invited owner: genuine-operator application transaction under PostgreSQL; no hosted proof', async t => {
  const db = await createTestDatabase(); t.after(() => db.close());
  await db.exec(`create role authenticator nologin noinherit; grant anon,authenticated,service_role to authenticator;
    alter table auth.users add column email text,add column is_anonymous boolean not null default false,
      add column deleted_at timestamptz,add column banned_until timestamptz,add column email_change text;
    create schema storage; create table storage.buckets(id text primary key); create table storage.objects(id uuid primary key,bucket_id text,name text);
    alter table storage.buckets enable row level security; alter table storage.objects enable row level security;`);
  const migrations = new URL('../../supabase/migrations/', import.meta.url);
  for (const name of (await readdir(migrations)).sort()) if (name > '20261008120645_identity_access_directory.sql' && name <= '20261009130331_owner_onboarding_activation.sql')
    await runSqlFile(db, new URL(name, migrations));
  // Auth is simulated only in this fixture. The operational script does not
  // insert/update/delete Auth rows or create/invoke a replacement bootstrap API.
  await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)', [invitedId, syntheticEmail, otherId, 'someone-else@example.invalid']);
  const initial = await snapshot(db);
  const initialAuth = (await db.query('select * from auth.users order by id')).rows;
  const helper = await one(db, "select pg_get_functiondef('private.activate_development_owner(uuid,boolean)'::regprocedure) definition");
  const isolated = (name, body) => t.test(name, async () => {
    await db.exec('begin'); try { await body(); } finally { await db.exec('rollback; reset role; set session authorization postgres'); }
  });
  const denies = (promise, code = '42501') => assert.rejects(promise, error => { assert.equal(error.code, code, error.message); return true; });

  await t.test('untouched input template refuses before any application change', async () => {
    await denies(db.exec(syntheticSource), '22023'); await db.exec('rollback');
    assert.deepEqual(await snapshot(db), initial);
  });
  await isolated('wrong independently supplied Auth UUID is denied', async () => {
    await denies(db.exec(block(configured(otherId))));
  });
  await isolated('another profile already linked to the invited identity cannot be adopted', async () => {
    await db.query("insert into public.user_profiles(id,auth_user_id,display_name,identity_status,is_demo) values($1,$2,'Other profile','suspended',true)",
      ['41000000-0000-4000-8000-000000000099', invitedId]);
    await denies(db.exec(block(configured())));
  });
  await isolated('reserved unlinked profile cannot receive a silent Auth link', async () => {
    await db.query("insert into public.user_profiles(id,display_name,identity_status,is_demo) values($1,'Development owner','suspended',true)", [OWNER_IDS.profile]);
    await denies(db.exec(block(configured())));
  });
  for (const [label, sql, args] of [
    ['wrong email', 'update auth.users set email=$1 where id=$2', ['changed@example.invalid', invitedId]],
    ['anonymous identity', 'update auth.users set is_anonymous=true where id=$1', [invitedId]],
    ['banned identity', "update auth.users set banned_until='2999-01-01' where id=$1", [invitedId]],
    ['pending email change', "update auth.users set email_change='changed@example.invalid' where id=$1", [invitedId]],
    ['deleted identity', 'update auth.users set deleted_at=clock_timestamp() where id=$1', [invitedId]],
    ['duplicate recipient', 'update auth.users set email=$1 where id=$2', [syntheticEmail, otherId]],
  ]) await isolated(`${label} is rejected`, async () => { await db.query(sql, args); await denies(db.exec(block(configured()))); });

  for (const role of ['anon', 'authenticated', 'service_role']) await isolated(`${role} cannot impersonate the genuine database operator`, async () => {
    await db.exec(`set role ${role}`);
    await denies(db.exec(block(configured())));
  });
  await isolated('genuine authenticator session cannot use this operator path even with service role', async () => {
    await db.exec('set session authorization authenticator; set role service_role');
    await denies(db.exec(block(configured())));
  });
  await isolated('exact never-activated suspended partial setup can be completed without relinking', async () => {
    await db.query("insert into public.user_profiles(id,auth_user_id,display_name,identity_status,is_demo) values($1,$2,'Development owner','suspended',true)", [OWNER_IDS.profile, invitedId]);
    await db.exec(block(configured()));
    assert.equal((await one(db, 'select identity_status from public.user_profiles where id=$1', [OWNER_IDS.profile])).identity_status, 'active');
    assert.equal((await one(db, "select count(*)::int n from public.audit_events where object_id=$1 and event_type='profile_created'", [OWNER_IDS.profile])).n, 1);
  });
  await t.test('an injected late write failure rolls back every application row and audit while preserving Auth', async () => {
    await db.exec(`create function pg_temp.reject_last_owner_grant() returns trigger language plpgsql as $$ begin
      if new.id='80f693ae-4109-442c-b719-000000000705'::uuid then raise exception 'Synthetic late failure' using errcode='23514'; end if;
      return new; end $$;
      create trigger synthetic_owner_failure before insert on public.account_capability_grants
        for each row execute function pg_temp.reject_last_owner_grant();`);
    await denies(db.exec(configured()), '23514'); await db.exec('rollback');
    await db.exec('drop trigger synthetic_owner_failure on public.account_capability_grants');
    assert.deepEqual(await snapshot(db), initial);
    assert.deepEqual((await db.query('select * from auth.users order by id')).rows, initialAuth);
  });
  await t.test('complete script creates only exact current administrative workflow capabilities and system audits', async () => {
    const result = await db.exec(configured());
    const readback = result[result.length - 1].rows[0];
    assert.deepEqual(readback, { profile_id: OWNER_IDS.profile, identity_status: 'active', account_id: OWNER_IDS.account,
      facility_id: OWNER_IDS.facility, capabilities: OWNER_GRANTS.map(grant => grant.capability_key) });
    const grants = (await db.query(`select id,account_id,user_profile_id,capability_key,scope_kind,facility_id,revoked_at,is_demo
      from public.account_capability_grants where user_profile_id=$1 order by id`, [OWNER_IDS.profile])).rows;
    assert.deepEqual(grants, OWNER_GRANTS);
    const audit = (await db.query('select actor_kind,actor_user_profile_id,actor_auth_user_id,actor_system_key,event_metadata from public.audit_events where object_id=$1', [OWNER_IDS.profile])).rows;
    assert.equal(audit.length, 3); // profile created, access created, profile activated
    for (const event of audit) {
      assert.equal(event.actor_kind, 'system'); assert.equal(event.actor_user_profile_id, null); assert.equal(event.actor_auth_user_id, null);
      assert.equal(event.actor_system_key, 'database_privileged_operation'); assert.equal(event.event_metadata.database_session_user, 'postgres');
    }
    assert.deepEqual((await db.query('select * from auth.users order by id')).rows, initialAuth);
    assert.deepEqual(await one(db, "select pg_get_functiondef('private.activate_development_owner(uuid,boolean)'::regprocedure) definition"), helper);
    for (const table of ['private_object_grants', 'document_version_grants', 'document_content_grants'])
      assert.equal((await one(db, `select count(*)::int n from private.${table}`)).n, 0);
  });
  await t.test('an exact completed retry is read-only including all immutable audit history', async () => {
    const before = await snapshot(db); await db.exec(configured()); assert.deepEqual(await snapshot(db), before);
  });
  for (const [label, sql, args] of [
    ['suspended former active profile', "update public.user_profiles set identity_status='suspended' where id=$1", [OWNER_IDS.profile]],
    ['removed profile', "update public.user_profiles set identity_status='removed' where id=$1", [OWNER_IDS.profile]],
    ['lost Auth linkage', 'update public.user_profiles set auth_user_id=null where id=$1', [OWNER_IDS.profile]],
    ['suspended access', "update public.account_access set membership_status='suspended' where user_profile_id=$1", [OWNER_IDS.profile]],
    ['removed access', "update public.account_access set membership_status='removed' where user_profile_id=$1", [OWNER_IDS.profile]],
    ['broader grant', "update public.account_capability_grants set scope_kind='all_facilities',facility_id=null where id=$1", [OWNER_GRANTS[1].id]],
    ['revoked grant', 'update public.account_capability_grants set revoked_at=clock_timestamp() where id=$1', [OWNER_GRANTS[1].id]],
    ['deleted grant', 'delete from public.account_capability_grants where id=$1', [OWNER_GRANTS[1].id]],
    ['missing administrative designation', 'delete from public.account_memberships where id=$1', [OWNER_IDS.membership]],
    ['foreign account metadata', "update public.client_accounts set display_name='Foreign account' where id=$1", [OWNER_IDS.account]],
  ]) await isolated(`${label} cannot be silently repaired`, async () => { await db.query(sql, args); await denies(db.exec(block(configured()))); });
  await isolated('revoked then externally restored capabilities retain their blocking history', async () => {
    await db.query('update public.account_capability_grants set revoked_at=clock_timestamp() where id=$1', [OWNER_GRANTS[1].id]);
    await db.query('update public.account_capability_grants set revoked_at=null where id=$1', [OWNER_GRANTS[1].id]);
    await denies(db.exec(block(configured())));
  });
  await isolated('a formerly removed profile cannot pass even if externally restored to active', async () => {
    await db.query("update public.user_profiles set identity_status='removed' where id=$1", [OWNER_IDS.profile]);
    await db.query("update public.user_profiles set identity_status='active' where id=$1", [OWNER_IDS.profile]);
    await denies(db.exec(block(configured())));
  });
});
