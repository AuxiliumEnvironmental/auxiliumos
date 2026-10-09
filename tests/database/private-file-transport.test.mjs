import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import test from 'node:test';
import { createTestDatabase, runSqlFile, setSimulatedSubject } from '../helpers/pglite-database.mjs';
import { createPrivateObjectGateway, SYNTHETIC_PREFIX } from '../../supabase/functions/private-objects/gateway.mjs';

const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const account = '00000000-0000-4000-8000-000000000001';
const facility = '00000000-0000-4000-8000-000000000301';
const profile = '00000000-0000-4000-8000-000000000101';
const subject = id(1), other = id(2), digest = 'a'.repeat(64);
const one = async (db, sql, args = []) => (await db.query(sql, args)).rows[0];
async function as(db, role, callback, authId = subject, session = 'authenticator') {
  await setSimulatedSubject(db, authId, { role, sub: authId });
  await db.exec('savepoint request_context');
  try {
    await db.exec(`set session authorization ${session}; set role ${role}`);
    return await callback();
  } catch (error) { await db.exec('rollback to request_context'); throw error; }
  finally { await db.exec('reset role; set session authorization postgres; release request_context'); }
}
const user = (db, callback, authId = subject) => as(db, 'authenticated', callback, authId);
const service = (db, callback) => as(db, 'service_role', callback, null);
const reserve = (db, key = crypto.randomUUID()) => user(db, () => one(db,
  'select * from public.reserve_private_object($1,$2,$3,40,\'text/plain\')', [account,facility,key]));
const claim = (db, objectId, revision = 1) => user(db, () => one(db,
  'select * from public.claim_private_object_upload($1,$2)', [objectId,revision]));
const bind = (db, objectId, attemptId, sha = digest) => service(db, () => db.query(
  'select public.bind_private_object_upload($1,$2,$3,40)', [objectId,attemptId,sha]));
const receipt = (db, objectId, attemptId, sha = digest) => service(db, () => one(db,
  'select * from public.record_private_object_receipt($1,$2,$3,40,\'text/plain\')', [objectId,attemptId,sha]));
const finalize = (db, objectId, attemptId, receiptId, revision) => user(db, () => one(db,
  'select public.finalize_private_object($1,$2,$3,$4) as result', [objectId,attemptId,receiptId,revision]));
const status = (db, objectId, authId = subject) => user(db, () => one(db,
  'select public.private_file_status($1) as result', [objectId]), authId);
const denied = (operation, code) => assert.rejects(operation, (error) => { assert.equal(error.code, code, error.message); return true; });

test('private-file transport — PostgreSQL, simulated gateway; no provider/concurrency proof', async (t) => {
  const db = await createTestDatabase();
  t.after(() => db.close());
  // Provider schema models are TEST-ONLY. Production creates/changes bucket
  // contents exclusively through Storage API. Existing permissive policies are
  // deliberate drift fixtures for the new restrictive bucket-scoped defenses.
  await db.exec(`create role authenticator nologin noinherit;
    grant anon,authenticated,service_role to authenticator;
    create schema storage;
    create table storage.buckets(id text primary key);
    create table storage.objects(id uuid primary key,bucket_id text,name text);
    alter table storage.buckets enable row level security;
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated;
    grant all on storage.buckets,storage.objects to anon,authenticated;
    create policy existing_allow on storage.objects for all to anon,authenticated using(true) with check(true);
    create policy existing_allow on storage.buckets for all to anon,authenticated using(true) with check(true);
    insert into storage.buckets values('os-private-ingest'),('unrelated');
    insert into storage.objects values('${id(90)}','os-private-ingest','hidden'),('${id(91)}','unrelated','visible');
    alter default privileges in schema private grant all on tables to public,anon,authenticated,service_role;
    alter default privileges in schema private grant execute on functions to public,anon,authenticated,service_role;
    alter default privileges in schema public grant execute on functions to public,anon,authenticated,service_role;`);
  const migrations = new URL('../../supabase/migrations/', import.meta.url);
  for (const name of (await readdir(migrations)).sort()) {
    if (name > '20261008120645_identity_access_directory.sql' && name <= '20261008234953_private_file_transport.sql') await runSqlFile(db, new URL(name,migrations));
  }
  await db.query('insert into auth.users(id) values($1),($2)', [subject,other]);
  await db.query('update public.user_profiles set auth_user_id=$1 where id=$2', [subject,profile]);
  await db.query("update public.user_profiles set identity_status='active' where id=$1", [profile]);
  await db.query("update public.account_access set membership_status='active' where account_id=$1 and user_profile_id=$2", [account,profile]);
  await db.query(`insert into public.account_capability_grants(account_id,user_profile_id,capability_key,scope_kind,facility_id)
    values($1,$2,'view_account','account',null),($1,$2,'view_asset','facility',$3),($1,$2,'ingest_private_object','facility',$3)`, [account,profile,facility]);
  const otherProfile='00000000-0000-4000-8000-000000000102';
  await db.query('update public.user_profiles set auth_user_id=$1 where id=$2',[other,otherProfile]);
  await db.query("update public.user_profiles set identity_status='active' where id=$1",[otherProfile]);
  await db.query("update public.account_access set membership_status='active' where account_id=$1 and user_profile_id=$2",[account,otherProfile]);
  await db.query(`insert into public.account_capability_grants(account_id,user_profile_id,capability_key,scope_kind,facility_id)
    values($1,$2,'view_account','account',null),($1,$2,'view_asset','facility',$3),($1,$2,'ingest_private_object','facility',$3)`,[account,otherProfile,facility]);
  await db.exec('update private.private_object_reservation_config set enabled=true');
  const isolated = (name, run) => t.test(name, async () => {
    await db.exec('begin');
    try { await run(); } finally { await db.exec('rollback; reset role; set session authorization postgres'); }
  });

  await isolated('receipt precedes user finalization; exact retries preserve attempt, bytes and audits', async () => {
    const r=await reserve(db); const a=await claim(db,r.object_id);
    assert.equal(a.state,'receiving'); assert.equal(a.state_revision,2);
    assert.deepEqual(await claim(db,r.object_id),a);
    await bind(db,r.object_id,a.attempt_id); await bind(db,r.object_id,a.attempt_id);
    const v=await receipt(db,r.object_id,a.attempt_id);
    assert.deepEqual(await receipt(db,r.object_id,a.attempt_id),v);
    assert.equal((await status(db,r.object_id)).result.state,'stored_unverified');
    const final=await finalize(db,r.object_id,a.attempt_id,v.receipt_id,v.state_revision);
    assert.equal(final.result.state,'finalized'); assert.equal(final.result.state_revision,4);
    assert.equal(final.result.quarantined,true); assert.equal(final.result.scan_state,'pending');
    assert.equal(final.result.clearance_state,'pending');
    assert.equal(final.result.next_action,'await_scan_and_human_clearance');
    assert.deepEqual(await finalize(db,r.object_id,a.attempt_id,v.receipt_id,3),final);
    const events=(await db.query("select * from public.audit_events where object_id=$1 and object_type='private_object' order by occurred_at",[r.object_id])).rows;
    assert.deepEqual(events.map(x=>[x.event_type,x.actor_kind]),[
      ['private_object_reserved','user'],['private_object_upload_claimed','user'],
      ['private_object_upload_claimed','system'],['private_object_upload_received','system'],['private_object_finalized','user']]);
    for(const event of events) {
      assert.equal(event.is_demo,true); assert.equal(event.is_internal_only,true);
      for(const key of ['object_key','bucket_id','claims','filename','content']) assert.equal(Object.hasOwn(event.event_metadata,key),false);
      if(event.actor_kind==='system') { assert.equal(event.actor_auth_user_id,null); assert.equal(event.actor_user_profile_id,null); }
    }
    await denied(as(db,'authenticated',()=>db.query('select * from public.private_object_status($1)',[r.object_id]),subject,'postgres'),'28000');
  });

  await isolated('real handler and SQL RPC contract compose through verified byte receipt and finalization', async () => {
    const rpcNames=new Set(['reserve_private_object','private_file_status','claim_private_object_upload',
      'bind_private_object_upload','private_object_transport_target','record_private_object_receipt',
      'record_private_object_failure','authorize_private_object_finalize','finalize_private_object']);
    const makeClient=(role)=>({
      auth:{getUser:async()=>({data:{user:{id:subject,is_anonymous:false}},error:null})},
      rpc:async(name,args)=>{
        assert.ok(rpcNames.has(name));
        const placeholders=Object.keys(args).map((_,i)=>`$${i+1}`).join(',');
        try {
          const result=await as(db,role,()=>db.query(`select * from public.${name}(${placeholders})`,Object.values(args)),role==='authenticated'?subject:null);
          return {error:null,data:['private_file_status','finalize_private_object'].includes(name)?result.rows[0][name]:result.rows};
        }catch(error){return {data:null,error:{code:error.code}};}
      },
    });
    const provider=new Map();
    const handler=createPrivateObjectGateway({enabled:true,createUserClient:()=>makeClient('authenticated'),
      createServiceClient:()=>({...makeClient('service_role'),storage:{from:bucket=>({
        upload:async(key,bytes,options)=>{
          assert.equal(bucket,'os-private-ingest');assert.equal(options.upsert,false);
          if(provider.has(key))return {data:null,error:{code:'Duplicate'}};
          provider.set(key,new Blob([bytes],{type:'text/plain'}));return {data:{},error:null};
        },
        download:async(key)=>({data:provider.get(key),error:provider.has(key)?null:{statusCode:'404'}}),
      })}})});
    const invoke=(method,tail,body,headers={})=>handler(new Request(`https://example.test/private-objects${tail}`,{
      method,headers:{Authorization:'Bearer test.simulated.token','Content-Type':body instanceof Uint8Array?'text/plain':'application/json',...headers},
      body:body instanceof Uint8Array?body:JSON.stringify(body),
    }));
    const bytes=new TextEncoder().encode(`${SYNTHETIC_PREFIX}SQL handler integration only`);
    const reserved=await invoke('POST','',{accountId:account,facilityId:facility,idempotencyKey:id(750),byteSize:bytes.length,mediaType:'text/plain'});
    assert.equal(reserved.status,201);const r=await reserved.json();
    const uploaded=await invoke('PUT',`/${r.objectId}/bytes`,bytes,{'X-State-Revision':'1'});
    assert.equal(uploaded.status,200);const received=await uploaded.json();assert.equal(received.state,'stored_unverified');
    const final=await invoke('POST',`/${r.objectId}/finalize`,{expectedStateRevision:received.stateRevision});
    assert.equal(final.status,200);assert.equal((await final.json()).state,'finalized');
    const changed=bytes.slice();changed[changed.length-1]^=1;
    const conflict=await invoke('PUT',`/${r.objectId}/bytes`,changed,{'X-State-Revision':'1'});
    assert.equal(conflict.status,409);assert.equal(provider.size,1);
    const persisted=await one(db,'select verified_byte_size,quarantined from private.private_object_transports where object_id=$1',[r.objectId]);
    assert.deepEqual(persisted,{verified_byte_size:bytes.length,quarantined:true});
  });

  await isolated('changed body, forged receipt, wrong attempt and stale revision cannot finalize', async () => {
    const r=await reserve(db); const a=await claim(db,r.object_id);
    await denied(user(db,()=>db.query('select * from public.claim_private_object_upload($1,1)',[r.object_id]),other),'42501');
    assert.deepEqual(await status(db,r.object_id,other),{result:{object_id:null,state:'not_found_or_unavailable'}});
    await denied(finalize(db,r.object_id,a.attempt_id,id(98),2),'40001');
    await bind(db,r.object_id,a.attempt_id);
    await denied(bind(db,r.object_id,a.attempt_id,'b'.repeat(64)),'23505');
    await denied(receipt(db,r.object_id,a.attempt_id,'b'.repeat(64)),'23505');
    await denied(bind(db,r.object_id,id(98)),'42501');
    const v=await receipt(db,r.object_id,a.attempt_id);
    await denied(finalize(db,r.object_id,a.attempt_id,v.receipt_id,2),'40001');
    assert.equal((await status(db,r.object_id)).result.state,'stored_unverified');
  });

  await isolated('revocation during provider gap denies finalization and hides existing status', async () => {
    const r=await reserve(db);const a=await claim(db,r.object_id);await bind(db,r.object_id,a.attempt_id);
    const v=await receipt(db,r.object_id,a.attempt_id);
    await db.query("update public.account_capability_grants set revoked_at=clock_timestamp() where user_profile_id=$1 and capability_key='ingest_private_object'",[profile]);
    await denied(finalize(db,r.object_id,a.attempt_id,v.receipt_id,3),'42501');
    const absent={result:{object_id:null,state:'not_found_or_unavailable'}};
    assert.deepEqual(await status(db,r.object_id),absent);assert.deepEqual(await status(db,id(99)),absent);
    assert.deepEqual(await status(db,r.object_id,other),absent);
    assert.equal((await one(db,'select state from private.private_object_transports where object_id=$1',[r.object_id])).state,'stored_unverified');
  });

  await isolated('private table, service receipt and user authority are separately least privileged', async () => {
    const r=await reserve(db);const a=await claim(db,r.object_id);
    for(const role of ['anon','authenticated','service_role']) {
      for(const sql of ['select * from private.private_object_transports','delete from private.private_object_transports'])
        await denied(as(db,role,()=>db.query(sql)),'42501');
    }
    await denied(user(db,()=>db.query('select * from public.private_object_transport_target($1,$2)',[r.object_id,a.attempt_id])),'42501');
    await denied(user(db,()=>db.query('select public.bind_private_object_upload($1,$2,$3,40)',[r.object_id,a.attempt_id,digest])),'42501');
    await denied(service(db,()=>db.query('select public.finalize_private_object($1,$2,$3,3)',[r.object_id,a.attempt_id,id(9)])),'42501');
    await denied(as(db,'service_role',()=>db.query('select public.bind_private_object_upload($1,$2,$3,40)',[r.object_id,a.attempt_id,digest]),null,'postgres'),'28000');
    await denied(as(db,'authenticated',()=>db.query('select * from public.claim_private_object_upload($1,1)',[r.object_id]),subject,'postgres'),'28000');
  });

  await isolated('read, signing, release, scan and human-clearance placeholders are absent', async () => {
    const functions=(await db.query("select proname from pg_proc join pg_namespace n on n.oid=pronamespace where n.nspname='public' and proname ~ '(private_object|private_file)' order by proname")).rows.map(x=>x.proname);
    assert.equal(functions.some(x=>/read|content|clearance|scan|adopt|release|sign/.test(x)),false);
    const r=await reserve(db);const a=await claim(db,r.object_id);await bind(db,r.object_id,a.attempt_id);
    const v=await receipt(db,r.object_id,a.attempt_id);await finalize(db,r.object_id,a.attempt_id,v.receipt_id,3);
    await db.exec('savepoint immutable_probe');
    await assert.rejects(db.query("update private.private_object_transports set quarantined=false where object_id=$1",[r.object_id]), /immutable/);
    await db.exec('rollback to immutable_probe');
    await assert.rejects(db.exec('truncate private.private_object_transports'), /preserved/);
    await db.exec('rollback to immutable_probe; release immutable_probe');
  });

  await isolated('bucket-scoped restrictive denial defeats broad allow without breaking unrelated buckets', async () => {
    for(const role of ['anon','authenticated']) {
      const objects=await as(db,role,()=>db.query('select bucket_id from storage.objects'));
      assert.deepEqual(objects.rows,[{bucket_id:'unrelated'}]);
      const buckets=await as(db,role,()=>db.query('select id from storage.buckets'));
      assert.deepEqual(buckets.rows,[{id:'unrelated'}]);
      await denied(as(db,role,()=>db.query("insert into storage.objects values($1,'os-private-ingest','new')",[id(92)])),'42501');
      assert.equal((await as(db,role,()=>db.query("delete from storage.objects where bucket_id='os-private-ingest' returning id"))).rows.length,0);
    }
  });

  await isolated('audit failure rolls back receipt; recovery is idempotent and non-destructive', async () => {
    const r=await reserve(db);const a=await claim(db,r.object_id);await bind(db,r.object_id,a.attempt_id);
    await service(db,()=>db.query("select public.record_private_object_failure($1,$2,'provider_unavailable')",[r.object_id,a.attempt_id]));
    assert.equal((await status(db,r.object_id)).result.failure_code,'provider_unavailable');
    await db.exec(`create function private.transport_test_audit_failure() returns trigger language plpgsql as $$
      begin if new.event_type='private_object_upload_received' then raise exception 'injected audit failure'; end if;return new;end $$;
      create trigger transport_test_failure before insert on public.audit_events for each row execute function private.transport_test_audit_failure();`);
    await assert.rejects(receipt(db,r.object_id,a.attempt_id), /injected audit failure/);
    assert.equal((await status(db,r.object_id)).result.state,'receiving');
    await db.exec('drop trigger transport_test_failure on public.audit_events');
    const v=await receipt(db,r.object_id,a.attempt_id);
    assert.equal((await status(db,r.object_id)).result.failure_code,null);
    await finalize(db,r.object_id,a.attempt_id,v.receipt_id,3);
  });

  await isolated('operational expiry blocks new upload/finalize without deleting reservations or receipts', async () => {
    await db.exec('update private.private_object_reservation_config set reservation_ttl_seconds=1');
    const r=await reserve(db);const a=await claim(db,r.object_id);await bind(db,r.object_id,a.attempt_id);
    const v=await receipt(db,r.object_id,a.attempt_id);
    await new Promise(resolve=>setTimeout(resolve,1100));
    await denied(claim(db,r.object_id),'55000');
    await denied(finalize(db,r.object_id,a.attempt_id,v.receipt_id,3),'55000');
    assert.equal((await status(db,r.object_id)).result.state,'expired');
    assert.equal((await one(db,'select count(*)::int as count from private.private_object_transports')).count,1);
  });
});
