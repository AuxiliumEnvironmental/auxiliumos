import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { createTestDatabase, runSqlFile, setSimulatedSubject } from '../helpers/pglite-database.mjs';
import { OWNER_IDS, OWNER_GRANTS } from '../../scripts/owner-onboarding.mjs';

const authId = '40000000-0000-4000-8000-000000000001';
const otherAuth = '40000000-0000-4000-8000-000000000002';
const email = 'owner@example.invalid';
const migrationName = '20261009130331_owner_onboarding_activation.sql';
const one = async (db, sql, args = []) => (await db.query(sql, args)).rows[0];
async function as(db, role, callback, session = 'authenticator') {
  await setSimulatedSubject(db, authId, { role, sub: authId });
  await db.exec('savepoint request_context');
  try { await db.exec(`set session authorization ${session}; set role ${role}`); return await callback(); }
  catch (error) { await db.exec('rollback to request_context'); throw error; }
  finally { await db.exec('reset role; set session authorization postgres; release request_context'); }
}
const activate = (db, id = authId) => as(db, 'service_role', async () =>
  (await one(db, 'select public.activate_development_owner($1) result', [id])).result);
const denial = operation => assert.rejects(operation, error => { assert.equal(error.code, '42501'); return true; });

test('atomic initial owner activation: PostgreSQL engine with simulated Auth context, no hosted/concurrency claim', async t => {
  const db = await createTestDatabase(); t.after(() => db.close());
  await db.exec(`create role authenticator nologin noinherit; grant anon,authenticated,service_role to authenticator;
    alter table auth.users add column email text;
    create schema storage; create table storage.buckets(id text primary key); create table storage.objects(id uuid primary key,bucket_id text,name text);
    alter table storage.buckets enable row level security; alter table storage.objects enable row level security;
    alter default privileges in schema private grant execute on functions to public,anon,authenticated,service_role;
    alter default privileges in schema public grant execute on functions to public,anon,authenticated,service_role;`);
  const migrations = new URL('../../supabase/migrations/', import.meta.url);
  for (const name of (await readdir(migrations)).sort()) if (name > '20261008120645_identity_access_directory.sql' && name < migrationName)
    await runSqlFile(db, new URL(name, migrations));
  // Test the actual SQL with only its recipient allowlist hash made synthetic.
  const source = (await readFile(new URL(migrationName, migrations), 'utf8')).replace(
    '25b94cb2f529c847c80f4581f9101ff74676472d0df211419fed1a522652c5d9', createHash('sha256').update(email).digest('hex'));
  await db.exec(source);
  await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)', [authId, email, otherAuth, 'different@example.invalid']);
  await db.query("insert into public.client_accounts(id,display_name,is_demo) values($1,'AuxiliumOS Development',true)", [OWNER_IDS.account]);
  await db.query("insert into public.facilities(id,account_id,display_name,is_demo) values($1,$2,'Owner Workflow Sandbox',true)", [OWNER_IDS.facility, OWNER_IDS.account]);
  await db.query("insert into public.user_profiles(id,auth_user_id,display_name,identity_status,is_demo) values($1,$2,'Development owner','suspended',true)", [OWNER_IDS.profile, authId]);
  await db.query("insert into public.account_access(account_id,user_profile_id,membership_status,is_demo) values($1,$2,'active',true)", [OWNER_IDS.account, OWNER_IDS.profile]);
  await db.query("insert into public.account_memberships(id,account_id,user_profile_id,role_key,is_demo) values($1,$2,$3,'system_admin',true)",
    [OWNER_IDS.membership, OWNER_IDS.account, OWNER_IDS.profile]);
  for (const grant of OWNER_GRANTS) await db.query(`insert into public.account_capability_grants
    (id,account_id,user_profile_id,capability_key,scope_kind,facility_id,is_demo) values($1,$2,$3,$4,$5,$6,true)`,
  [grant.id, grant.account_id, grant.user_profile_id, grant.capability_key, grant.scope_kind, grant.facility_id]);
  const isolated = (name, body) => t.test(name, async () => {
    await db.exec('begin'); try { await body(); } finally { await db.exec('rollback; reset role; set session authorization postgres'); }
  });

  await isolated('service-only preflight is read-only even before activation', async () => {
    const before = await one(db, 'select count(*)::int n from public.audit_events');
    const result = await as(db, 'service_role', async () => (await one(db, 'select public.activate_development_owner(null,true) result')).result);
    assert.deepEqual(result, { ready: true, scope: 'development_owner_initial_activation' });
    assert.deepEqual(await one(db, 'select count(*)::int n from public.audit_events'), before);
    assert.equal((await one(db, 'select identity_status from public.user_profiles where id=$1', [OWNER_IDS.profile])).identity_status, 'suspended');
  });
  await isolated('one exact initial activation appends system provenance and an exact repeat is read-only', async () => {
    assert.deepEqual(await activate(db), { profile_id: OWNER_IDS.profile, active: true, changed: true });
    const audit = await one(db, "select actor_kind,actor_user_profile_id,actor_auth_user_id,actor_system_key,event_metadata from public.audit_events where object_id=$1 and event_type='profile_updated'", [OWNER_IDS.profile]);
    assert.equal(audit.actor_kind, 'system'); assert.equal(audit.actor_system_key, 'database_privileged_operation');
    assert.equal(audit.actor_user_profile_id, null); assert.equal(audit.actor_auth_user_id, null);
    assert.equal(audit.event_metadata.before.identity_status, 'suspended'); assert.equal(audit.event_metadata.after.identity_status, 'active');
    const before = await one(db, 'select count(*)::int n from public.audit_events');
    assert.deepEqual(await activate(db), { profile_id: OWNER_IDS.profile, active: true, changed: false });
    assert.deepEqual(await one(db, 'select count(*)::int n from public.audit_events'), before);
  });
  await isolated('anonymous and authenticated roles cannot invoke either wrapper or private function', async () => {
    for (const role of ['anon', 'authenticated']) for (const schema of ['public', 'private'])
      await denial(as(db, role, () => db.query(`select ${schema}.activate_development_owner($1)`, [authId])));
    const acl = await one(db, "select has_function_privilege('anon','public.activate_development_owner(uuid,boolean)','execute') anon,has_function_privilege('authenticated','public.activate_development_owner(uuid,boolean)','execute') authenticated");
    assert.deepEqual(acl, { anon: false, authenticated: false });
  });
  await isolated('a direct service_role session cannot impersonate the protected PostgREST service context', async () => {
    await assert.rejects(as(db, 'service_role', () => db.query('select public.activate_development_owner($1)', [authId]), 'service_role'),
      error => error.code === '28000');
  });
  await isolated('different or changed owner Auth email and wrong Auth UUID are denied', async () => {
    await denial(activate(db, otherAuth));
    await db.query('update auth.users set email=$1 where id=$2', ['changed@example.invalid', authId]);
    await denial(activate(db));
  });
  await isolated('profile suspension after any previous activation can never be restored', async () => {
    await activate(db); await db.query("update public.user_profiles set identity_status='suspended' where id=$1", [OWNER_IDS.profile]);
    await denial(activate(db));
    assert.equal((await one(db, 'select identity_status from public.user_profiles where id=$1', [OWNER_IDS.profile])).identity_status, 'suspended');
  });
  await isolated('a previously removed identity remains denied even if manually returned to initial suspended status', async () => {
    await db.query("update public.user_profiles set identity_status='removed' where id=$1", [OWNER_IDS.profile]);
    await db.query("update public.user_profiles set identity_status='suspended' where id=$1", [OWNER_IDS.profile]);
    await denial(activate(db));
  });
  for (const [label, sql, args] of [
    ['nondevelopment account', 'update public.client_accounts set is_demo=false where id=$1', [OWNER_IDS.account]],
    ['foreign facility', "update public.facilities set display_name='Different' where id=$1", [OWNER_IDS.facility]],
    ['removed membership', "update public.account_access set membership_status='removed' where user_profile_id=$1", [OWNER_IDS.profile]],
    ['revoked grant', 'update public.account_capability_grants set revoked_at=clock_timestamp() where id=$1', [OWNER_GRANTS[0].id]],
    ['broader grant', "update public.account_capability_grants set scope_kind='all_facilities',facility_id=null where id=$1", [OWNER_GRANTS[1].id]],
    ['missing grant', 'delete from public.account_capability_grants where id=$1', [OWNER_GRANTS[1].id]],
    ['missing administrative designation', 'delete from public.account_memberships where id=$1', [OWNER_IDS.membership]],
    ['wrong profile label', "update public.user_profiles set display_name='Foreign profile' where id=$1", [OWNER_IDS.profile]],
  ]) await isolated(`${label} cannot be repaired or activated`, async () => { await db.query(sql, args); await denial(activate(db)); });
  await isolated('restored grants and access rows cannot erase revocation history', async () => {
    await db.query('update public.account_capability_grants set revoked_at=clock_timestamp() where id=$1', [OWNER_GRANTS[0].id]);
    await db.query('update public.account_capability_grants set revoked_at=null where id=$1', [OWNER_GRANTS[0].id]);
    await denial(activate(db));
  });
  await isolated('another account lifecycle or an extra legacy role prevents initial activation', async () => {
    await db.query("insert into public.account_access(account_id,user_profile_id,membership_status) values('00000000-0000-4000-8000-000000000001',$1,'active')", [OWNER_IDS.profile]);
    await denial(activate(db));
  });
  await isolated('activation changes no scoped capabilities, professional grants, release configuration or seed identities', async () => {
    const beforeGrants = (await db.query('select * from public.account_capability_grants order by id')).rows;
    const beforeRoles = (await db.query('select * from public.account_memberships order by id')).rows;
    const seed = (await db.query("select * from public.user_profiles where id<>$1 order by id", [OWNER_IDS.profile])).rows;
    await activate(db);
    assert.deepEqual((await db.query('select * from public.account_capability_grants order by id')).rows, beforeGrants);
    assert.deepEqual((await db.query('select * from public.account_memberships order by id')).rows, beforeRoles);
    assert.deepEqual((await db.query('select * from public.user_profiles where id<>$1 order by id', [OWNER_IDS.profile])).rows, seed);
    assert.equal((await one(db, 'select count(*)::int n from private.private_object_grants')).n, 0);
    assert.equal((await one(db, 'select count(*)::int n from private.document_version_grants')).n, 0);
    assert.equal((await one(db, 'select count(*)::int n from private.document_content_grants')).n, 0);
  });
});
