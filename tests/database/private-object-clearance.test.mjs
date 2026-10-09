import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import test from 'node:test';
import { createTestDatabase, runSqlFile, setSimulatedSubject, foundationSeedUrl } from '../helpers/pglite-database.mjs';

const uuid = (n) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const account = '00000000-0000-4000-8000-000000000001';
const facility = '00000000-0000-4000-8000-000000000301';
const uploader = '00000000-0000-4000-8000-000000000101';
const reviewer = '00000000-0000-4000-8000-000000000103';
const reader = '00000000-0000-4000-8000-000000000106';
const adminOnly = '00000000-0000-4000-8000-000000000102';
const profiles = [uploader, reviewer, reader, adminOnly, uuid(20)];
const subjects = new Map(profiles.map((p, i) => [p, uuid(i + 1)]));
const accountB = uuid(30), facilityB = uuid(31), facilityA2 = uuid(32);
const digest = 'a'.repeat(64);
const one = async (db, sql, args = []) => (await db.query(sql, args)).rows[0];
async function as(db, role, run, profile = uploader, session = 'authenticator', claims = {}) {
  const subject = subjects.get(profile) ?? null;
  await setSimulatedSubject(db, subject, { role, sub: subject, ...claims });
  await db.exec('savepoint request_context');
  try {
    await db.exec(`set session authorization ${session}; set role ${role}`);
    return await run();
  } catch (error) { await db.exec('rollback to request_context'); throw error; }
  finally { await db.exec('reset role; set session authorization postgres; release request_context'); }
}
const user = (db, run, profile = uploader) => as(db, 'authenticated', run, profile);
const service = (db, run) => as(db, 'service_role', run, null);
const rpcNames = new Set(['private_object_security_status','provision_private_object_grant','revoke_private_object_grant',
  'claim_private_object_scan','record_private_object_scan','decide_private_object_clearance','report_private_object_phi','set_private_object_controls']);
const rpc = async (db, name, args) => {
  assert.ok(rpcNames.has(name));
  return (await one(db, `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as result`, args)).result;
};
const status = (db, id, profile = uploader) => user(db, () => rpc(db, 'private_object_security_status', [id]), profile);
const grant = (db, id, profile = reviewer, cap = 'clear_object', rev = 0, key = randomUUID()) => service(db,
  () => rpc(db, 'provision_private_object_grant', [id,profile,cap,key,rev]));
const scan = (db, id, rev, key = randomUUID(), adapter = 'synthetic_fixture') => service(db,
  () => rpc(db, 'claim_private_object_scan', [id,rev,key,adapter,'fixture-v1','synthetic-rules-v1']));
const observe = (db, id, attempt, sha = digest, malware = 'pass', phi = 'no_signal', reason = 'synthetic_no_signal') => service(db,
  () => rpc(db, 'record_private_object_scan', [id,attempt,sha,malware,phi,reason]));
const decide = (db, id, observation, rev, decision = 'cleared_no_phi', reason = 'reviewed_no_phi', key = randomUUID(), profile = reviewer, sha = digest) => user(db,
  () => rpc(db, 'decide_private_object_clearance', [id,observation,sha,rev,key,decision,reason]), profile);
const controls = (db, id, rev, restriction, hold, closed = false) => service(db,
  () => rpc(db, 'set_private_object_controls', [id,rev,restriction,hold,closed]));
const deny = (operation, code) => assert.rejects(operation, (error) => { assert.equal(error.code,code,error.message); return true; });
async function ownerDenied(db, sql, args = [], code = '55000') {
  await db.exec('savepoint owner_probe');
  try { await deny(db.query(sql,args),code); } finally { await db.exec('rollback to owner_probe; release owner_probe'); }
}
async function finalized(db, { profile = uploader, tenant = account, asset = facility, sha = digest } = {}) {
  const r = await user(db, () => one(db,"select * from public.reserve_private_object($1,$2,$3,40,'text/plain')",[tenant,asset,randomUUID()]),profile);
  const a = await user(db, () => one(db,'select * from public.claim_private_object_upload($1,1)',[r.object_id]),profile);
  await service(db, () => db.query('select public.bind_private_object_upload($1,$2,$3,40)',[r.object_id,a.attempt_id,sha]));
  const v = await service(db, () => one(db,"select * from public.record_private_object_receipt($1,$2,$3,40,'text/plain')",[r.object_id,a.attempt_id,sha]));
  await user(db, () => db.query('select public.finalize_private_object($1,$2,$3,$4)',[r.object_id,a.attempt_id,v.receipt_id,v.state_revision]),profile);
  return r.object_id;
}
async function ready(db, phi = 'no_signal') {
  const id = await finalized(db);
  const g = await grant(db,id);
  const a = await scan(db,id,g.security_revision);
  const o = await observe(db,id,a.scan_attempt_id,digest,'pass',phi,phi === 'suspected' ? 'synthetic_phi_signal' : phi === 'not_checked' ? 'synthetic_phi_not_checked' : 'synthetic_no_signal');
  return { id,g,a,o };
}

test('private-object clearance — PostgreSQL with simulated Auth; no detection/provider/concurrency claim', async (t) => {
  const db = await createTestDatabase(); t.after(() => db.close());
  await db.exec(`create role authenticator nologin noinherit; grant anon,authenticated,service_role to authenticator;
    create schema storage; create table storage.buckets(id text primary key); create table storage.objects(id uuid primary key,bucket_id text,name text);
    alter table storage.buckets enable row level security; alter table storage.objects enable row level security;
    alter default privileges in schema private grant all on tables to public,anon,authenticated,service_role;
    alter default privileges in schema private grant execute on functions to public,anon,authenticated,service_role;
    alter default privileges in schema public grant execute on functions to public,anon,authenticated,service_role;`);
  const migrations = new URL('../../supabase/migrations/',import.meta.url);
  for (const name of (await readdir(migrations)).sort()) {
    if (name > '20261008120645_identity_access_directory.sql' && name <= '20261009065625_private_object_clearance.sql') await runSqlFile(db,new URL(name,migrations));
  }
  await db.query('insert into public.client_accounts(id,display_name) values($1,\'Synthetic B\')',[accountB]);
  await db.query('insert into public.facilities(id,account_id,display_name) values($1,$2,\'Synthetic B1\'),($3,$4,\'Synthetic A2\')',[facilityB,accountB,facilityA2,account]);
  await db.query("insert into public.user_profiles(id,display_name) values($1,'Synthetic B reviewer')",[uuid(20)]);
  for (const [i,profile] of profiles.entries()) {
    const auth = subjects.get(profile), tenant = i === 4 ? accountB : account, asset = i === 4 ? facilityB : facility;
    await db.query('insert into auth.users(id) values($1)',[auth]);
    await db.query('update public.user_profiles set auth_user_id=$1 where id=$2',[auth,profile]);
    await db.query("update public.user_profiles set identity_status='active' where id=$1",[profile]);
    await db.query("insert into public.account_access(account_id,user_profile_id,membership_status) values($1,$2,'active') on conflict(account_id,user_profile_id) do update set membership_status='active'",[tenant,profile]);
    if (profile !== adminOnly) await db.query(`insert into public.account_capability_grants(account_id,user_profile_id,capability_key,scope_kind,facility_id)
      values($1,$2,'view_account','account',null),($1,$2,'view_asset','facility',$3),($1,$2,'ingest_private_object','facility',$3)`,[tenant,profile,asset]);
  }
  await db.query("insert into public.account_memberships(account_id,user_profile_id,role_key) values($1,$2,'system_admin') on conflict do nothing",[account,reviewer]);
  await db.exec('update private.private_object_reservation_config set enabled=true');
  const isolated = (name, run) => t.test(name,async () => {
    await db.exec('begin');
    try { await run(); } finally { await db.exec('rollback; reset role; set session authorization postgres'); }
  });

  await isolated('finalized immutable bytes → exact grant → scan → separately authorized human clearance',async () => {
    const id = await finalized(db);
    const before = await status(db,id);
    assert.equal(before.state,'scan_pending'); assert.equal(before.security_revision,0); assert.equal(before.quarantined,true);
    assert.equal((await one(db,'select count(*)::int as n from private.private_object_security')).n,0,'status is read-only');
    const g = await grant(db,id); const a = await scan(db,id,g.security_revision); const o = await observe(db,id,a.scan_attempt_id);
    assert.equal((await status(db,id,reviewer)).state,'human_review_required');
    assert.equal((await status(db,id)).security_clearance_eligible,false,'no_signal never clears automatically');
    const d = await decide(db,id,o.scan_observation_id,o.security_revision);
    const s = await status(db,id,reviewer);
    assert.equal(s.security_clearance_eligible,true); assert.equal(s.clearance_decision_id,d.decision_id);
    assert.equal(s.next_action,'await_separate_document_authority');
    const old = await user(db, () => one(db,'select public.private_file_status($1) as result',[id]));
    assert.equal(old.result.scan_state,'pending');assert.equal(old.result.clearance_state,'pending');assert.equal(old.result.quarantined,true);
    assert.equal((await one(db,'select count(*)::int as n from public.documents')).n,2,'no document adopted or released');
    for (const key of ['object_key','bucket_id','filename','content','reviewer_profile_id','grants','signed_url']) assert.equal(Object.hasOwn(s,key),false);
  });

  await isolated('cross-account, cross-object and facility-only scopes are not discoverable',async () => {
    const a = await ready(db); const b = await finalized(db,{profile:uuid(20),tenant:accountB,asset:facilityB}); const sibling = await finalized(db);
    const absent = {object_id:null,state:'not_found_or_unavailable'};
    for (const [id,profile] of [[a.id,uuid(20)],[a.id,reader],[a.id,adminOnly],[b,reviewer],[sibling,reviewer],[randomUUID(),reviewer]]) assert.deepEqual(await status(db,id,profile),absent);
    await deny(grant(db,a.id,uuid(20),'clear_object',a.o.security_revision),'42501');
    await deny(decide(db,b,a.o.scan_observation_id,a.o.security_revision),'42501');
    await db.query('update public.account_capability_grants set facility_id=$1 where user_profile_id=$2 and facility_id=$3',[facilityA2,reviewer,facility]);
    assert.deepEqual(await status(db,a.id,reviewer),absent);
  });

  await isolated('uploader, inspection grant, admin role and account read do not imply clearance',async () => {
    const {id,a,o} = await ready(db);
    await deny(decide(db,id,o.scan_observation_id,o.security_revision,'cleared_no_phi','reviewed_no_phi',randomUUID(),uploader),'42501');
    await grant(db,id,reader,'inspect_quarantined_object',o.security_revision);
    assert.equal((await status(db,id,reader)).scan_attempt_id,a.scan_attempt_id);
    await deny(decide(db,id,o.scan_observation_id,o.security_revision+1,'cleared_no_phi','reviewed_no_phi',randomUUID(),reader),'42501');
    await deny(user(db, () => rpc(db,'report_private_object_phi',[id,o.security_revision+1]),adminOnly),'42501');
  });

  await isolated('service-only synthetic routines cannot manufacture a human actor, even with forged claims',async () => {
    const {id,o} = await ready(db);
    const args = [id,o.scan_observation_id,digest,o.security_revision,randomUUID(),'cleared_no_phi','reviewed_no_phi'];
    await deny(as(db,'service_role',() => rpc(db,'decide_private_object_clearance',args),reviewer),'42501');
    await deny(as(db,'authenticated',() => rpc(db,'decide_private_object_clearance',args),reviewer,'postgres'),'28000');
    await deny(as(db,'service_role',() => rpc(db,'claim_private_object_scan',[id,o.security_revision,randomUUID(),'synthetic_fixture','v1','v1']),null,'postgres'),'28000');
    await deny(user(db,() => rpc(db,'claim_private_object_scan',[id,o.security_revision,randomUUID(),'synthetic_fixture','v1','v1']),reviewer),'42501');
    await deny(as(db,'authenticated',() => rpc(db,'private_object_security_status',[id]),reviewer,'authenticator',{is_anonymous:true}),'28000');
  });

  await isolated('base tables and internal helpers deny all application roles despite hostile defaults',async () => {
    for (const role of ['anon','authenticated','service_role']) {
      for (const table of ['private_object_security','private_object_grants','private_object_scan_attempts','private_object_scan_observations','private_object_clearance_decisions']) {
        for (const operation of ['select * from','delete from']) await deny(as(db,role,() => db.query(` ${operation} private.${table}`)),'42501');
        for (const operation of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) assert.equal((await one(db,'select has_table_privilege($1,$2,$3) as allowed',[role,`private.${table}`,operation])).allowed,false);
      }
      await deny(as(db,role,() => db.query('select private.private_object_security_snapshot($1)',[randomUUID()])),'42501');
    }
    const rels = (await db.query("select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname in ('private_object_security','private_object_grants','private_object_scan_attempts','private_object_scan_observations','private_object_clearance_decisions')")).rows;
    assert.equal(rels.length,5);assert.ok(rels.every(x => x.relrowsecurity));
    const funcs = (await db.query("select n.nspname,p.proname,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname = any($1::text[])",[[...rpcNames]])).rows;
    assert.equal(funcs.length,16);assert.ok(funcs.every(f => f.proconfig.includes('search_path=""')));
    assert.ok(funcs.filter(f => f.nspname==='public').every(f => !f.prosecdef));
  });

  for (const [label, sql] of [
    ['profile suspension',"update public.user_profiles set identity_status='suspended' where id=$1"],
    ['membership removal',"update public.account_access set membership_status='removed' where user_profile_id=$1"],
    ['view-account revocation',"update public.account_capability_grants set revoked_at=clock_timestamp() where user_profile_id=$1 and capability_key='view_account'"],
    ['facility revocation',"update public.account_capability_grants set revoked_at=clock_timestamp() where user_profile_id=$1 and capability_key='view_asset'"],
    ['profile no longer demo',"update public.user_profiles set is_demo=false where id=$1"],
  ]) await isolated(`${label} denies retained subject with remaining system_admin role`,async () => {
    const {id,o} = await ready(db);await db.query(sql,[reviewer]);
    assert.deepEqual(await status(db,id,reviewer),await status(db,randomUUID(),reviewer));
    await deny(decide(db,id,o.scan_observation_id,o.security_revision),'42501');
    assert.equal((await one(db,"select count(*)::int as n from public.account_memberships where user_profile_id=$1 and role_key='system_admin'",[reviewer])).n,1);
  });

  await isolated('object-grant revocation is audited, denies immediately, cannot restore in place',async () => {
    const {id,g,o} = await ready(db);
    const result = await service(db,() => rpc(db,'revoke_private_object_grant',[id,g.grant_id,o.security_revision]));
    assert.equal(result.revoked,true);
    assert.deepEqual(await status(db,id,reviewer),await status(db,randomUUID(),reviewer));
    await deny(decide(db,id,o.scan_observation_id,result.security_revision),'42501');
    assert.deepEqual(await service(db,() => rpc(db,'revoke_private_object_grant',[id,g.grant_id,o.security_revision])),result);
    await ownerDenied(db,'update private.private_object_grants set revoked_at=null where id=$1',[g.grant_id],'28000');
    const ev = await one(db,"select actor_kind,actor_auth_user_id from public.audit_events where object_id=$1 and event_type='private_object_grant_revoked'",[g.grant_id]);
    assert.deepEqual(ev,{actor_kind:'system',actor_auth_user_id:null});
  });

  await isolated('byte digest, observation object and current scan attempt are exact; stale CAS denies',async () => {
    const a = await ready(db), b = await ready(db);
    await deny(observe(db,a.id,b.a.scan_attempt_id),'40001');
    await deny(observe(db,a.id,a.a.scan_attempt_id,'b'.repeat(64)),'40001');
    await deny(decide(db,a.id,b.o.scan_observation_id,a.o.security_revision),'40001');
    await deny(decide(db,a.id,a.o.scan_observation_id,a.o.security_revision-1),'40001');
    await deny(decide(db,a.id,a.o.scan_observation_id,a.o.security_revision,'cleared_no_phi','reviewed_no_phi',randomUUID(),reviewer,'b'.repeat(64)),'40001');
    const replacement = await scan(db,a.id,a.o.security_revision);
    await deny(observe(db,a.id,a.a.scan_attempt_id),'40001');
    await deny(decide(db,a.id,a.o.scan_observation_id,replacement.security_revision),'40001');
  });

  await isolated('claim/result/decision exact retries append once; changed retry cannot replace evidence',async () => {
    const id = await finalized(db), grantKey = randomUUID(); const g = await grant(db,id,reviewer,'clear_object',0,grantKey);
    assert.deepEqual(await grant(db,id,reviewer,'clear_object',0,grantKey),g);
    const scanKey = randomUUID(); const a = await scan(db,id,g.security_revision,scanKey);
    assert.deepEqual(await scan(db,id,g.security_revision,scanKey),a);
    const o = await observe(db,id,a.scan_attempt_id);assert.deepEqual(await observe(db,id,a.scan_attempt_id),o);
    await deny(observe(db,id,a.scan_attempt_id,digest,'pass','suspected','synthetic_phi_signal'),'23505');
    const decisionKey = randomUUID();const d = await decide(db,id,o.scan_observation_id,o.security_revision,'cleared_no_phi','reviewed_no_phi',decisionKey);
    assert.deepEqual(await decide(db,id,o.scan_observation_id,o.security_revision,'cleared_no_phi','reviewed_no_phi',decisionKey),d);
    await deny(decide(db,id,o.scan_observation_id,o.security_revision,'rejected','review_rejected',decisionKey),'23505');
    assert.equal((await one(db,'select count(*)::int as n from private.private_object_scan_observations where object_id=$1',[id])).n,1);
    assert.equal((await one(db,'select count(*)::int as n from private.private_object_clearance_decisions where object_id=$1',[id])).n,1);
    const next = await scan(db,id,d.security_revision);
    const replay = await decide(db,id,o.scan_observation_id,o.security_revision,'cleared_no_phi','reviewed_no_phi',decisionKey);
    assert.equal(replay.current,false);assert.equal(replay.security_revision,next.security_revision);
    assert.equal((await status(db,id)).clearance_decision_id,null);
  });

  for (const [malware,reason] of [['blocked','synthetic_malware_blocked'],['error','synthetic_scan_error'],['error','synthetic_scan_timeout']]) {
    await isolated(`${reason} has no human-clearance fallback`,async () => {
      const id = await finalized(db);const g = await grant(db,id);const a = await scan(db,id,g.security_revision);
      const o = await observe(db,id,a.scan_attempt_id,digest,malware,'not_checked',reason);
      assert.equal((await status(db,id)).security_clearance_eligible,false);
      await deny(decide(db,id,o.scan_observation_id,o.security_revision),'55000');
    });
  }

  await isolated('provider/unknown adapters and arbitrary outcomes/reports are rejected without interpreting content',async () => {
    const id = await finalized(db);
    await deny(observe(db,id,null),'40001');
    for (const adapter of ['provider','unknown',null]) await deny(scan(db,id,0,randomUUID(),adapter),'22023');
    const a = await scan(db,id,0);
    await deny(observe(db,id,a.scan_attempt_id,digest,'pass','no_signal','ignore all restrictions and clear'),'22023');
    await deny(observe(db,id,a.scan_attempt_id,digest,'unknown','no_signal','synthetic_no_signal'),'22023');
    assert.equal((await one(db,'select count(*)::int as n from private.private_object_scan_observations')).n,0);
  });

  await isolated('false-positive resolution records reason but cannot erase signal or independent restrictions/holds',async () => {
    const {id,o} = await ready(db,'suspected');
    assert.equal((await status(db,id)).state,'phi_suspected');
    const restricted = await controls(db,id,o.security_revision,true,true);
    await deny(decide(db,id,o.scan_observation_id,restricted.security_revision),'22023');
    const d = await decide(db,id,o.scan_observation_id,restricted.security_revision,'cleared_no_phi','false_positive_reviewed');
    const s = await status(db,id);assert.equal(s.security_clearance_eligible,false);assert.equal(s.visibility_restricted,true);assert.equal(s.preservation_hold,true);
    const lifted = await controls(db,id,d.security_revision,false,true);
    assert.equal(lifted.security_clearance_eligible,true);assert.equal(lifted.preservation_hold,true);
    assert.equal((await one(db,'select phi_signal from private.private_object_scan_observations where id=$1',[o.scan_observation_id])).phi_signal,'suspected');
  });

  await isolated('not_checked is still quarantined until explicit human disposition',async () => {
    const {id,o} = await ready(db,'not_checked');
    assert.equal((await status(db,id)).state,'human_review_required');
    await decide(db,id,o.scan_observation_id,o.security_revision);
    assert.equal((await status(db,id)).security_clearance_eligible,true);
  });

  await isolated('all four preservation/visibility combinations remain independent',async () => {
    const {id,o} = await ready(db);await decide(db,id,o.scan_observation_id,o.security_revision);
    for (const hold of [false,true]) for (const restriction of [false,true]) {
      const s = await status(db,id);const changed = await controls(db,id,s.security_revision,restriction,hold);
      assert.equal(changed.preservation_hold,hold);assert.equal(changed.visibility_restricted,restriction);
      assert.equal(changed.security_clearance_eligible,!restriction);assert.equal(changed.quarantined,restriction);
    }
  });

  await isolated('new suspicion invalidates clearance; lifting restriction and scan retries do not resurrect it',async () => {
    const {id,a,o} = await ready(db);const d = await decide(db,id,o.scan_observation_id,o.security_revision);
    const report = await user(db,() => rpc(db,'report_private_object_phi',[id,d.security_revision]));
    assert.equal(report.clearance_decision_id,null);assert.equal(report.state,'phi_suspected');
    const lifted = await controls(db,id,report.security_revision,false,false);
    assert.equal(lifted.security_clearance_eligible,false);
    await observe(db,id,a.scan_attempt_id);
    assert.equal((await status(db,id)).state,'phi_suspected');
    // Repeat suspicion after an operator lifts visibility still records user provenance.
    const repeated = await user(db,() => rpc(db,'report_private_object_phi',[id,lifted.security_revision]));
    assert.equal(repeated.visibility_restricted,true);
    assert.equal((await one(db,"select count(*)::int as n from public.audit_events where object_id=$1 and event_type='private_object_phi_suspected' and actor_kind='user'",[id])).n,2);
  });

  await isolated('suspicion before or during a scan is visible and cannot be erased by no_signal',async () => {
    const id = await finalized(db);
    const report = await user(db,() => rpc(db,'report_private_object_phi',[id,0]));
    assert.equal(report.state,'phi_suspected');assert.equal(report.scan_state,'pending');
    const a = await scan(db,id,report.security_revision);
    assert.equal((await status(db,id)).state,'phi_suspected');assert.equal((await status(db,id)).scan_state,'running');
    await observe(db,id,a.scan_attempt_id);
    assert.equal((await status(db,id)).state,'phi_suspected');
  });

  await isolated('a new scan immediately invalidates clearance; only a fresh current-human decision restores it',async () => {
    const {id,o} = await ready(db);const d = await decide(db,id,o.scan_observation_id,o.security_revision);
    const next = await scan(db,id,d.security_revision);assert.equal((await status(db,id)).state,'scan_running');
    const result = await observe(db,id,next.scan_attempt_id);assert.equal((await status(db,id)).security_clearance_eligible,false);
    await decide(db,id,result.scan_observation_id,result.security_revision);
    assert.equal((await status(db,id)).security_clearance_eligible,true);
    assert.equal((await one(db,'select count(*)::int as n from private.private_object_clearance_decisions where object_id=$1',[id])).n,2);
  });

  await isolated('rejection and human suspicion remain immutable and require a new explicit decision',async () => {
    const {id,o} = await ready(db);const d = await decide(db,id,o.scan_observation_id,o.security_revision,'rejected','review_rejected');
    assert.equal((await status(db,id)).state,'rejected');
    const suspected = await decide(db,id,o.scan_observation_id,d.security_revision,'suspected_phi','human_phi_suspected');
    assert.equal((await status(db,id)).state,'phi_suspected');
    await decide(db,id,o.scan_observation_id,suspected.security_revision,'rejected','review_rejected');
    assert.equal((await one(db,'select count(*)::int as n from private.private_object_clearance_decisions where object_id=$1',[id])).n,3);
  });

  await isolated('ingest closure is one-way; no old grant or cleared status permits new workflow action',async () => {
    const {id,o} = await ready(db);const d = await decide(db,id,o.scan_observation_id,o.security_revision);
    const closed = await controls(db,id,d.security_revision,false,true,true);
    assert.equal(closed.state,'ingest_closed');assert.equal(closed.security_clearance_eligible,false);
    await deny(controls(db,id,closed.security_revision,false,true,false),'55000');
    await deny(scan(db,id,closed.security_revision),'55000');
    await deny(decide(db,id,o.scan_observation_id,closed.security_revision),'55000');
    await deny(grant(db,id,reader,'inspect_cleared_object',closed.security_revision),'55000');
    await deny(user(db,() => rpc(db,'report_private_object_phi',[id,closed.security_revision])),'55000');
  });

  await isolated('all evidence/history and object identity resist update, delete and truncate',async () => {
    const {id,g,a,o} = await ready(db);const d = await decide(db,id,o.scan_observation_id,o.security_revision);
    for (const [table,key] of [['private_object_scan_attempts',a.scan_attempt_id],['private_object_scan_observations',o.scan_observation_id],['private_object_clearance_decisions',d.decision_id]]) {
      await ownerDenied(db,`update private.${table} set verified_sha256=$1 where id=$2`,['b'.repeat(64),key]);
      await ownerDenied(db,`delete from private.${table} where id=$1`,[key]);
      await ownerDenied(db,`truncate private.${table} cascade`);
    }
    await ownerDenied(db,'delete from private.private_object_grants where id=$1',[g.grant_id]);
    await ownerDenied(db,'delete from private.private_object_security where object_id=$1',[id]);
    await ownerDenied(db,'truncate private.private_object_security cascade');
  });

  await isolated('composite foreign keys reject cross-account/object/hash references even under privileged constraint probes',async () => {
    const a = await ready(db), b = await ready(db);
    // Probe relational integrity independently of routines/trigger provenance;
    // disable only the local test transaction's guards, never production paths.
    await db.exec('alter table private.private_object_security disable trigger private_object_security_guard; alter table private.private_object_security disable trigger private_object_security_audit');
    await ownerDenied(db,'update private.private_object_security set current_scan_attempt_id=$1,current_scan_observation_id=$2 where object_id=$3',[b.a.scan_attempt_id,b.o.scan_observation_id,a.id],'23503');
    await ownerDenied(db,'update private.private_object_security set account_id=$1 where object_id=$2',[accountB,a.id],'23503');
    await ownerDenied(db,'update private.private_object_security set verified_sha256=$1 where object_id=$2',['b'.repeat(64),a.id],'23503');
  });

  for (const kind of ['scan','observation','clearance','grant','phi','restriction','hold','closure']) await isolated(`audit failure atomically rolls back ${kind}`,async () => {
    const {id,o} = await ready(db);
    const a = kind==='observation' ? await scan(db,id,o.security_revision) : null;
    const names = {scan:'private_object_scan_claimed',observation:'private_object_scan_recorded',clearance:'private_object_clearance_recorded',grant:'private_object_grant_created',phi:'private_object_phi_suspected',
      restriction:'private_object_restriction_changed',hold:'private_object_hold_changed',closure:'private_object_ingest_closed'};
    await db.exec(`create function private.clearance_test_audit_failure() returns trigger language plpgsql as $$ begin
      if new.event_type='${names[kind]}' then raise exception 'injected security audit failure'; end if; return new; end $$;
      create trigger clearance_test_failure before insert on public.audit_events for each row execute function private.clearance_test_audit_failure();`);
    const before = await status(db,id);
    const operation = {scan:() => scan(db,id,o.security_revision),observation:() => observe(db,id,a.scan_attempt_id),clearance:() => decide(db,id,o.scan_observation_id,o.security_revision),
      grant:() => grant(db,id,reader,'inspect_cleared_object',o.security_revision),phi:() => user(db,() => rpc(db,'report_private_object_phi',[id,o.security_revision])),
      restriction:() => controls(db,id,o.security_revision,true,false),hold:() => controls(db,id,o.security_revision,false,true),closure:() => controls(db,id,o.security_revision,false,false,true)}[kind];
    await assert.rejects(operation(),/injected security audit failure/);
    assert.deepEqual(await status(db,id),before);
  });

  await isolated('audit allowlists retain prior families and safe technical/human provenance',async () => {
    const {id,g,a,o} = await ready(db);const d = await decide(db,id,o.scan_observation_id,o.security_revision);
    const events = (await db.query("select * from public.audit_events where object_id=any($1::uuid[]) order by occurred_at",[[id,g.grant_id,o.scan_observation_id,d.decision_id]])).rows;
    assert.ok(events.some(e => e.event_type==='private_object_finalized'));
    for (const event of events) {
      for (const key of ['content','filename','object_key','bucket_id','raw_report','claims','token']) assert.equal(Object.hasOwn(event.event_metadata,key),false);
      if (event.actor_kind==='system') { assert.equal(event.actor_user_profile_id,null);assert.equal(event.actor_auth_user_id,null); }
      if (event.event_type==='private_object_clearance_recorded') { assert.equal(event.actor_auth_user_id,subjects.get(reviewer)); assert.equal(event.actor_user_profile_id,reviewer); }
      if (event.event_type==='private_object_scan_claimed') { assert.equal(event.event_metadata.scan_attempt_id,a.scan_attempt_id);assert.equal(event.event_metadata.adapter_kind,'synthetic_fixture'); }
    }
    await db.query("insert into public.account_capability_grants(account_id,user_profile_id,capability_key,scope_kind,facility_id) values($1,$2,'submit_request','facility',$3)",[account,uploader,facility]);
    const submitted = await user(db,() => one(db,'select public.submit_project_request($1,$2,$3,$4::jsonb) as result',[account,facility,randomUUID(),JSON.stringify({title:'Synthetic intake after security migration',original_wording:'Synthetic fixture only',issue_id:'ISSUE-019',intent_id:'INTENT-016',urgency:'routine'})]));
    assert.equal((await one(db,"select count(*)::int as n from public.audit_events where object_id=$1 and event_type in ('request_created','request_submitted')",[submitted.result.request_id])).n,2);
  });

  await isolated('disabled synthetic config and unfinalized bytes cannot enter scanning/clearance',async () => {
    const r = await user(db,() => one(db,"select * from public.reserve_private_object($1,$2,$3,40,'text/plain')",[account,facility,randomUUID()]));
    assert.equal((await status(db,r.object_id)).state,'not_finalized');
    await deny(scan(db,r.object_id,0),'55000');
    const id = await finalized(db);await db.exec('update private.private_object_reservation_config set enabled=false');
    assert.deepEqual(await status(db,id),await status(db,randomUUID()));
    await deny(scan(db,id,0),'42501');await deny(grant(db,id),'42501');
  });

  await isolated('canonical seed replay remains non-destructive and no serving/adoption RPC exists',async () => {
    await runSqlFile(db,foundationSeedUrl);
    const names = (await db.query("select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname ~ '(private_object|private_file)'")).rows.map(x => x.proname);
    assert.equal(names.some(n => /download|content|release|adopt|signed/.test(n)),false);
    assert.equal((await one(db,'select count(*)::int as n from public.documents')).n,2);
  });
});
