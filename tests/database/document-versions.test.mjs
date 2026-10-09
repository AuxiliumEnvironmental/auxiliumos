import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import test from 'node:test';
import { createTestDatabase, runSqlFile, setSimulatedSubject, foundationSeedUrl } from '../helpers/pglite-database.mjs';

const uuid=n=>`30000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const account='00000000-0000-4000-8000-000000000001',facility='00000000-0000-4000-8000-000000000301';
const uploader='00000000-0000-4000-8000-000000000101',reviewer='00000000-0000-4000-8000-000000000103',reader='00000000-0000-4000-8000-000000000106';
const doc='00000000-0000-4000-8000-000000000501',sibling='00000000-0000-4000-8000-000000000502';
const accountB=uuid(20),facilityB=uuid(21),facilityA2=uuid(22),docB=uuid(23),docA2=uuid(24),docAccount=uuid(25),other=uuid(30);
const subjects=new Map([[uploader,uuid(1)],[reviewer,uuid(2)],[reader,uuid(3)],[other,uuid(4)]]),digest='a'.repeat(64);
const one=async(db,sql,args=[]) => (await db.query(sql,args)).rows[0];
async function as(db,role,run,profile=uploader,session='authenticator',claims={}) {
  const subject=subjects.get(profile)??null;
  await setSimulatedSubject(db,subject,{role,sub:subject,...claims});await db.exec('savepoint request_context');
  try {await db.exec(`set session authorization ${session}; set role ${role}`);return await run();}
  catch(error){await db.exec('rollback to request_context');throw error;}
  finally {await db.exec('reset role; set session authorization postgres; release request_context');}
}
const user=(db,run,profile=uploader)=>as(db,'authenticated',run,profile),service=(db,run)=>as(db,'service_role',run,null);
const names=new Set(['provision_document_version_grant','revoke_document_version_grant','adopt_private_object','list_version_documents','list_document_versions',
  'private_object_security_status','provision_private_object_grant','claim_private_object_scan','record_private_object_scan','decide_private_object_clearance','report_private_object_phi','set_private_object_controls']);
async function rpc(db,name,args) {assert.ok(names.has(name));return (await one(db,`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) result`,args)).result;}
const status=(db,id,profile=uploader)=>user(db,()=>rpc(db,'private_object_security_status',[id]),profile);
const grant=(db,id=doc,profile=uploader,cap='view_versions',rev=0,key=randomUUID())=>service(db,()=>rpc(db,'provision_document_version_grant',[id,profile,cap,key,rev]));
const versions=(db,id=doc,profile=uploader,after=0,limit=25)=>user(db,()=>rpc(db,'list_document_versions',[id,after,limit]),profile);
const documents=(db,tenant=account,profile=uploader,after=null,limit=25)=>user(db,()=>rpc(db,'list_version_documents',[tenant,after,limit]),profile);
const adopt=(db,id,srev,drev=2,target=doc,key=randomUUID(),profile=uploader,sha=digest)=>user(db,()=>rpc(db,'adopt_private_object',[id,sha,target,srev,drev,key]),profile);
const deny=(op,code)=>assert.rejects(op,error=>{assert.equal(error.code,code,error.message);return true;});
async function ownerDeny(db,sql,args=[],code='55000') {
  await db.exec('savepoint owner_probe');try {await deny(db.query(sql,args),code);}finally {await db.exec('rollback to owner_probe; release owner_probe');}
}
async function target(db,id=doc,profile=uploader,rev=0) {const view=await grant(db,id,profile,'view_versions',rev);const create=await grant(db,id,profile,'create_version',view.document_revision);return {view,create};}
async function finalized(db,{profile=uploader,tenant=account,asset=facility,sha=digest}={}) {
  const r=await user(db,()=>one(db,"select * from public.reserve_private_object($1,$2,$3,40,'text/plain')",[tenant,asset,randomUUID()]),profile);
  const a=await user(db,()=>one(db,'select * from public.claim_private_object_upload($1,1)',[r.object_id]),profile);
  await service(db,()=>db.query('select public.bind_private_object_upload($1,$2,$3,40)',[r.object_id,a.attempt_id,sha]));
  const v=await service(db,()=>one(db,"select * from public.record_private_object_receipt($1,$2,$3,40,'text/plain')",[r.object_id,a.attempt_id,sha]));
  await user(db,()=>db.query('select public.finalize_private_object($1,$2,$3,$4)',[r.object_id,a.attempt_id,v.receipt_id,v.state_revision]),profile);
  return r.object_id;
}
async function cleared(db) {
  const id=await finalized(db);
  const g=await service(db,()=>rpc(db,'provision_private_object_grant',[id,reviewer,'clear_object',randomUUID(),0]));
  const a=await service(db,()=>rpc(db,'claim_private_object_scan',[id,g.security_revision,randomUUID(),'synthetic_fixture','fixture-v1','rules-v1']));
  const o=await service(db,()=>rpc(db,'record_private_object_scan',[id,a.scan_attempt_id,digest,'pass','no_signal','synthetic_no_signal']));
  const d=await user(db,()=>rpc(db,'decide_private_object_clearance',[id,o.scan_observation_id,digest,o.security_revision,randomUUID(),'cleared_no_phi','reviewed_no_phi']),reviewer);
  return {id,g,a,o,d};
}

test('immutable document versions — PostgreSQL with simulated Auth; no hosted or concurrency proof',async(t)=>{
  const db=await createTestDatabase();t.after(()=>db.close());
  await db.exec(`create role authenticator nologin noinherit;grant anon,authenticated,service_role to authenticator;
    create schema storage;create table storage.buckets(id text primary key);create table storage.objects(id uuid primary key,bucket_id text,name text);
    alter table storage.buckets enable row level security;alter table storage.objects enable row level security;
    alter default privileges in schema private grant all on tables to public,anon,authenticated,service_role;
    alter default privileges in schema private grant execute on functions to public,anon,authenticated,service_role;
    alter default privileges in schema public grant execute on functions to public,anon,authenticated,service_role;`);
  const migrations=new URL('../../supabase/migrations/',import.meta.url);
  for(const name of (await readdir(migrations)).sort()) if(name>'20261008120645_identity_access_directory.sql'&&name<='20261009072201_document_versions.sql') await runSqlFile(db,new URL(name,migrations));
  await db.query("insert into public.client_accounts(id,display_name) values($1,'Synthetic B')",[accountB]);
  await db.query("insert into public.facilities(id,account_id,display_name) values($1,$2,'Synthetic B1'),($3,$4,'Synthetic A2')",[facilityB,accountB,facilityA2,account]);
  await db.query("insert into public.user_profiles(id,display_name) values($1,'Synthetic external user')",[other]);
  await db.query("insert into public.documents(id,account_id,facility_id,title,document_class) values($1,$2,$3,'Synthetic B','internal_note'),($4,$5,$6,'Synthetic A2','internal_note'),($7,$5,null,'Synthetic account-only','internal_note')",[docB,accountB,facilityB,docA2,account,facilityA2,docAccount]);
  for(const [profile,subject] of subjects) {
    const tenant=profile===other?accountB:account,asset=profile===other?facilityB:facility;
    await db.query('insert into auth.users(id) values($1)',[subject]);await db.query('update public.user_profiles set auth_user_id=$1 where id=$2',[subject,profile]);
    await db.query("update public.user_profiles set identity_status='active' where id=$1",[profile]);
    await db.query("insert into public.account_access(account_id,user_profile_id,membership_status) values($1,$2,'active') on conflict(account_id,user_profile_id) do update set membership_status='active'",[tenant,profile]);
    await db.query("insert into public.account_capability_grants(account_id,user_profile_id,capability_key,scope_kind,facility_id) values($1,$2,'view_account','account',null),($1,$2,'view_asset','facility',$3),($1,$2,'ingest_private_object','facility',$3)",[tenant,profile,asset]);
  }
  await db.exec('update private.private_object_reservation_config set enabled=true');
  const isolated=(name,run)=>t.test(name,async()=>{await db.exec('begin');try{await run();}finally{await db.exec('rollback; reset role; set session authorization postgres');}});

  await isolated('exact cleared object becomes one immutable internal draft and ingest closes atomically',async()=>{
    const beforeDoc=await one(db,'select * from public.documents where id=$1',[doc]);await target(db);const c=await cleared(db);
    const before=await one(db,'select * from private.private_object_security where object_id=$1',[c.id]);
    const v=await adopt(db,c.id,c.d.security_revision);
    assert.equal(v.document_id,doc);assert.equal(v.version_ordinal,1);assert.equal(v.lifecycle_state,'internal_draft');assert.equal(v.verified_sha256,digest);
    assert.equal(v.byte_size,40);assert.equal(v.media_type,'text/plain');assert.equal(v.document_revision,3);assert.equal(v.security_revision,c.d.security_revision+1);
    const after=await one(db,'select * from private.private_object_security where object_id=$1',[c.id]);
    assert.ok(after.ingest_closed_at);assert.deepEqual({...after,ingest_closed_at:null,security_revision:before.security_revision},before);
    assert.equal((await status(db,c.id)).state,'ingest_closed');assert.deepEqual(await one(db,'select * from public.documents where id=$1',[doc]),beforeDoc);
    const history=await one(db,'select * from private.document_versions where id=$1',[v.version_id]);
    assert.equal(history.clearance_decision_id,c.d.decision_id);assert.equal(history.scan_observation_id,c.o.scan_observation_id);
    assert.equal(history.created_by_profile_id,uploader);assert.equal(history.created_by_auth_user_id,subjects.get(uploader));
  });

  await isolated('bounded document/version reads require explicit exact view grants, not roles/ingest/source grants',async()=>{
    const c=await cleared(db);const absent={document_id:null,state:'not_found_or_unavailable',items:[],next_cursor:null};
    assert.deepEqual(await versions(db),absent);assert.deepEqual(await documents(db),{items:[],next_cursor:null});
    await target(db);await adopt(db,c.id,c.d.security_revision);
    for(const profile of [reviewer,reader,other]) {assert.deepEqual(await versions(db,doc,profile),absent);assert.deepEqual(await versions(db,randomUUID(),profile),absent);}
    assert.deepEqual(await versions(db,sibling),absent);assert.deepEqual(await versions(db,docB),absent);
    const list=await documents(db);assert.equal(list.items.length,1);assert.equal(list.items[0].document_id,doc);assert.equal(list.items[0].can_create_version,true);
    const page=await versions(db);assert.equal(page.items.length,1);assert.equal(page.items[0].lifecycle_state,'internal_draft');
    for(const item of [...list.items,...page.items]) for(const key of ['object_key','bucket_id','content','signed_url','created_by_auth_user_id','release_state','version_label']) assert.equal(Object.hasOwn(item,key),false);
    await grant(db,doc,reader,'view_versions',3);assert.equal((await versions(db,doc,reader)).items.length,1);
    assert.equal((await documents(db,account,reader)).items[0].can_create_version,false);
  });

  await isolated('both target capabilities and current source entitlement are independently necessary',async()=>{
    const c=await cleared(db);await grant(db,doc,uploader,'create_version');
    await deny(adopt(db,c.id,c.d.security_revision,1),'42501');assert.equal((await versions(db)).state,'not_found_or_unavailable');
    await grant(db,doc,uploader,'view_versions',1);await target(db,doc,reader,2);
    await deny(adopt(db,c.id,c.d.security_revision,4,doc,randomUUID(),reader),'42501');
    const source=await service(db,()=>rpc(db,'provision_private_object_grant',[c.id,reader,'inspect_cleared_object',randomUUID(),c.d.security_revision]));
    assert.equal((await adopt(db,c.id,source.security_revision,4,doc,randomUUID(),reader)).version_ordinal,1);
  });

  await isolated('cross-account/facility and account-only targets cannot receive versions or grants',async()=>{
    const c=await cleared(db);await target(db);
    for(const id of [docB,docA2,docAccount,randomUUID()]) await deny(adopt(db,c.id,c.d.security_revision,2,id),'42501');
    await deny(grant(db,doc,other),'42501');await deny(grant(db,docAccount),'42501');
    const b=await finalized(db,{profile:other,tenant:accountB,asset:facilityB});await deny(adopt(db,b,0),'42501');
  });

  await isolated('stale document/security revisions, digest and changed idempotent inputs conflict',async()=>{
    const c=await cleared(db);await target(db);
    await deny(adopt(db,c.id,c.d.security_revision,1),'40001');await deny(adopt(db,c.id,c.d.security_revision-1),'40001');
    await deny(adopt(db,c.id,c.d.security_revision,2,doc,randomUUID(),uploader,'b'.repeat(64)),'40001');
    const key=randomUUID(),v=await adopt(db,c.id,c.d.security_revision,2,doc,key);
    assert.deepEqual(await adopt(db,c.id,c.d.security_revision,2,doc,key),v);
    await deny(adopt(db,c.id,c.d.security_revision,3,doc,key),'23505');
    const another=await cleared(db);await deny(adopt(db,another.id,another.d.security_revision,2,doc,key),'23505');
    assert.equal((await one(db,'select count(*)::int n from private.document_versions')).n,1);
    assert.equal((await one(db,"select count(*)::int n from public.audit_events where object_id=$1 and event_type='document_version_adopted'",[v.version_id])).n,1);
  });

  await isolated('later drafts have server ordinals and cannot inherit or supersede legacy release labels',async()=>{
    await db.query("update public.documents set release_state='client_visible_released',version_label='legacy-final',is_internal_only=false where id=$1",[doc]);
    await target(db);const a=await cleared(db),first=await adopt(db,a.id,a.d.security_revision);
    const b=await cleared(db),second=await adopt(db,b.id,b.d.security_revision,first.document_revision);
    assert.equal(first.version_ordinal,1);assert.equal(second.version_ordinal,2);assert.notEqual(first.version_id,second.version_id);
    assert.deepEqual((await versions(db)).items.map(v=>[v.version_ordinal,v.lifecycle_state]),[[1,'internal_draft'],[2,'internal_draft']]);
    assert.deepEqual(await one(db,'select release_state,version_label,is_internal_only from public.documents where id=$1',[doc]),{release_state:'client_visible_released',version_label:'legacy-final',is_internal_only:false});
    assert.equal((await one(db,'select lifecycle_state from private.document_versions where id=$1',[first.version_id])).lifecycle_state,'internal_draft');
    await deny(adopt(db,a.id,first.security_revision,second.document_revision,sibling),'42501');
  });

  await isolated('pagination and cursor bounds expose only permitted documents/versions',async()=>{
    await target(db);await target(db,sibling);
    const first=await documents(db,account,uploader,null,1);assert.equal(first.items.length,1);assert.equal(first.next_cursor,first.items[0].document_id);
    const second=await documents(db,account,uploader,first.next_cursor,1);assert.equal(second.items.length,1);assert.equal(second.next_cursor,null);
    for(let n=0;n<3;n++){const c=await cleared(db);await adopt(db,c.id,c.d.security_revision,2+n);}
    const a=await versions(db,doc,uploader,0,2);assert.deepEqual(a.items.map(v=>v.version_ordinal),[1,2]);assert.equal(a.next_cursor,2);
    const b=await versions(db,doc,uploader,2,2);assert.deepEqual(b.items.map(v=>v.version_ordinal),[3]);assert.equal(b.next_cursor,null);
    await deny(versions(db,doc,uploader,0,101),'22023');await deny(versions(db,doc,uploader,-1,25),'22023');await deny(documents(db,account,uploader,null,0),'22023');
  });

  for(const [label,sql] of [
    ['profile suspension',"update public.user_profiles set identity_status='suspended' where id=$1"],
    ['membership removal',"update public.account_access set membership_status='removed' where user_profile_id=$1"],
    ['account read revocation',"update public.account_capability_grants set revoked_at=clock_timestamp() where user_profile_id=$1 and capability_key='view_account'"],
    ['facility read revocation',"update public.account_capability_grants set revoked_at=clock_timestamp() where user_profile_id=$1 and capability_key='view_asset'"],
    ['demo identity revocation',"update public.user_profiles set is_demo=false where id=$1"],
  ]) await isolated(`${label} defeats retained identity and system_admin role`,async()=>{
    await target(db);const c=await cleared(db);await db.query(sql,[uploader]);
    assert.deepEqual(await versions(db),await versions(db,randomUUID()));assert.deepEqual(await documents(db),{items:[],next_cursor:null});
    await deny(adopt(db,c.id,c.d.security_revision),'42501');
    assert.equal((await one(db,"select count(*)::int n from public.account_memberships where user_profile_id=$1 and role_key='system_admin'",[uploader])).n,1);
  });

  await isolated('exact target-grant revocation denies replay without altering history or another document',async()=>{
    const grants=await target(db);await target(db,sibling);const c=await cleared(db);const key=randomUUID();const v=await adopt(db,c.id,c.d.security_revision,2,doc,key);
    const r=await service(db,()=>rpc(db,'revoke_document_version_grant',[doc,grants.create.grant_id,v.document_revision]));
    await deny(adopt(db,c.id,c.d.security_revision,2,doc,key),'42501');assert.equal((await versions(db)).items.length,1);
    const gone=await service(db,()=>rpc(db,'revoke_document_version_grant',[doc,grants.view.grant_id,r.document_revision]));
    assert.equal((await versions(db)).state,'not_found_or_unavailable');assert.equal((await documents(db)).items[0].document_id,sibling);
    assert.deepEqual(await service(db,()=>rpc(db,'revoke_document_version_grant',[doc,grants.view.grant_id,r.document_revision])),gone);
    assert.equal((await one(db,'select count(*)::int n from private.document_versions')).n,1);
  });

  await isolated('source ingest revocation defeats adoption despite target authority',async()=>{
    await target(db);const c=await cleared(db);
    await db.query("update public.account_capability_grants set revoked_at=clock_timestamp() where user_profile_id=$1 and capability_key='ingest_private_object'",[uploader]);
    await deny(adopt(db,c.id,c.d.security_revision),'42501');assert.equal((await documents(db)).items[0].can_create_version,true);
  });

  for(const mode of ['unscanned','running','no_signal','malware_blocked','scan_error','rejected','suspected','restricted','closed']) await isolated(`${mode} object cannot be adopted`,async()=>{
    await target(db);const c=mode==='unscanned'?{id:await finalized(db)}:await cleared(db);
    let s=await status(db,c.id);
    if(['running','no_signal','malware_blocked','scan_error'].includes(mode)) {
      const a=await service(db,()=>rpc(db,'claim_private_object_scan',[c.id,s.security_revision,randomUUID(),'synthetic_fixture','v1','r1']));
      if(mode==='no_signal') await service(db,()=>rpc(db,'record_private_object_scan',[c.id,a.scan_attempt_id,digest,'pass','no_signal','synthetic_no_signal']));
      if(mode==='malware_blocked') await service(db,()=>rpc(db,'record_private_object_scan',[c.id,a.scan_attempt_id,digest,'blocked','not_checked','synthetic_malware_blocked']));
      if(mode==='scan_error') await service(db,()=>rpc(db,'record_private_object_scan',[c.id,a.scan_attempt_id,digest,'error','not_checked','synthetic_scan_error']));
    } else if(mode==='rejected') {
      await user(db,()=>rpc(db,'decide_private_object_clearance',[c.id,c.o.scan_observation_id,digest,s.security_revision,randomUUID(),'rejected','review_rejected']),reviewer);
    } else if(mode==='suspected') await user(db,()=>rpc(db,'report_private_object_phi',[c.id,s.security_revision]));
    else if(mode==='restricted'||mode==='closed') await service(db,()=>rpc(db,'set_private_object_controls',[c.id,s.security_revision,mode==='restricted',false,mode==='closed']));
    s=await status(db,c.id);await deny(adopt(db,c.id,s.security_revision),'55000');
    assert.equal((await one(db,'select count(*)::int n from private.document_versions')).n,0);
  });

  await isolated('preservation hold is carried without becoming a visibility or adoption prohibition',async()=>{
    await target(db);const c=await cleared(db);
    const held=await service(db,()=>rpc(db,'set_private_object_controls',[c.id,c.d.security_revision,false,true,false]));
    const v=await adopt(db,c.id,held.security_revision);assert.equal(v.preservation_hold_at_adoption,true);
    const page=await versions(db);assert.equal(page.items[0].preservation_hold,true);assert.equal(page.items[0].visibility_restricted,false);
    const s=await status(db,c.id);assert.equal(s.preservation_hold,true);assert.equal(s.ingest_closed,true);
    await service(db,()=>rpc(db,'set_private_object_controls',[c.id,s.security_revision,true,true,true]));
    assert.equal((await versions(db)).items[0].visibility_restricted,true,'authorized metadata reports restriction, never serves bytes');
    assert.equal((await one(db,'select preservation_hold_at_adoption from private.document_versions where id=$1',[v.version_id])).preservation_hold_at_adoption,true);
  });

  await isolated('service role, forged sessions, anonymous and unlinked subjects cannot adopt as human',async()=>{
    await target(db);const c=await cleared(db),args=[c.id,digest,doc,c.d.security_revision,2,randomUUID()];
    await deny(as(db,'service_role',()=>rpc(db,'adopt_private_object',args),uploader),'42501');
    await deny(as(db,'authenticated',()=>rpc(db,'adopt_private_object',args),uploader,'postgres'),'28000');
    await deny(as(db,'authenticated',()=>rpc(db,'adopt_private_object',args),uploader,'authenticator',{is_anonymous:true}),'28000');
    await deny(as(db,'anon',()=>rpc(db,'list_document_versions',[doc,0,25])),'42501');
    await db.query('update public.user_profiles set auth_user_id=null where id=$1',[uploader]);await deny(adopt(db,c.id,c.d.security_revision),'42501');
  });

  await isolated('base tables, helpers and public invoker/checked-definer boundaries resist hostile defaults',async()=>{
    for(const role of ['anon','authenticated','service_role']) for(const table of ['document_versions','document_version_heads','document_version_grants']) {
      for(const op of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) assert.equal((await one(db,'select has_table_privilege($1,$2,$3) allowed',[role,`private.${table}`,op])).allowed,false);
      await deny(as(db,role,()=>db.query(`select * from private.${table}`)),'42501');
    }
    await deny(user(db,()=>db.query('select private.has_document_version_capability($1,\'view_versions\')',[doc])),'42501');
    const functions=(await db.query("select n.nspname,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname=any($1::text[])",[['adopt_private_object','list_version_documents','list_document_versions','provision_document_version_grant','revoke_document_version_grant']])).rows;
    assert.equal(functions.length,10);assert.ok(functions.every(f=>f.proconfig.includes('search_path=""')));assert.ok(functions.filter(f=>f.nspname==='public').every(f=>!f.prosecdef));
    assert.equal((await one(db,"select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname in ('document_versions','document_version_heads','document_version_grants') and c.relrowsecurity")).n,3);
  });

  await isolated('no GUC/standalone human update can close ingest without an exact just-inserted version',async()=>{
    await target(db);const c=await cleared(db);
    await db.exec(`create function private.test_forged_document_close(p_id uuid) returns void language plpgsql security definer set search_path='' as $$ begin
      perform pg_catalog.set_config('app.document_adoption','true',true);
      update private.private_object_security set ingest_closed_at=pg_catalog.clock_timestamp(),security_revision=security_revision+1 where object_id=p_id;
    end $$;revoke all on function private.test_forged_document_close(uuid) from public;grant execute on function private.test_forged_document_close(uuid) to authenticated;`);
    await deny(user(db,()=>db.query('select private.test_forged_document_close($1)',[c.id])),'42501');
    assert.equal((await status(db,c.id)).ingest_closed,false);assert.equal((await one(db,'select count(*)::int n from private.document_versions')).n,0);
    assert.equal((await adopt(db,c.id,c.d.security_revision)).version_ordinal,1);
  });

  await isolated('mandatory insert triggers overwrite caller provenance and cannot omit atomic closure',async()=>{
    await target(db);const c=await cleared(db),spoof=randomUUID();
    // Test-only proxy simulates a privileged accidental INSERT exposure. Real
    // clients have no base-table INSERT or access to this rollback-only helper.
    await db.exec(`create function private.test_insert_document_version(p_object uuid,p_security_revision bigint,p_document uuid,p_spoof uuid) returns jsonb
      language plpgsql security definer set search_path='' as $$ declare v private.document_versions%rowtype;begin
      insert into private.document_versions(id,document_id,account_id,facility_id,object_id,verified_sha256,expected_security_revision,expected_document_revision,request_id,
        version_ordinal,byte_size,media_type,transport_state,scan_observation_id,clearance_decision_id,lifecycle_state,preservation_hold_at_adoption,
        created_by_profile_id,created_by_auth_user_id,created_at,adoption_transaction_id,is_demo)
      values(p_spoof,p_document,p_spoof,p_spoof,p_object,repeat('a',64),p_security_revision,2,pg_catalog.gen_random_uuid(),
        999,1,'application/x-spoof','spoof',p_spoof,p_spoof,'released',false,p_spoof,p_spoof,'2000-01-01','1'::xid8,false) returning * into v;
      return private.document_version_receipt(v);end $$;
      revoke all on function private.test_insert_document_version(uuid,bigint,uuid,uuid) from public,anon,authenticated,service_role;
      grant execute on function private.test_insert_document_version(uuid,bigint,uuid,uuid) to authenticated;`);
    const v=(await user(db,()=>one(db,'select private.test_insert_document_version($1,$2,$3,$4) result',[c.id,c.d.security_revision,doc,spoof]))).result;
    assert.notEqual(v.version_id,spoof);assert.equal(v.version_ordinal,1);assert.equal(v.byte_size,40);assert.equal(v.media_type,'text/plain');
    assert.equal(v.lifecycle_state,'internal_draft');assert.notEqual(v.created_at.slice(0,10),'2000-01-01');
    const row=await one(db,'select * from private.document_versions where id=$1',[v.version_id]);
    assert.equal(row.created_by_profile_id,uploader);assert.equal(row.created_by_auth_user_id,subjects.get(uploader));
    assert.equal(row.account_id,account);assert.equal(row.facility_id,facility);assert.equal(row.is_demo,true);
    assert.equal((await status(db,c.id)).ingest_closed,true);
    assert.equal((await one(db,"select count(*)::int n from public.audit_events where object_id=any($1::uuid[]) and event_type in ('document_version_adopted','private_object_ingest_closed')",[[v.version_id,c.id]])).n,2);
  });

  await isolated('disabled synthetic context and malformed inputs cannot produce versions',async()=>{
    await target(db);const c=await cleared(db);
    await deny(adopt(db,c.id,c.d.security_revision,2,doc,null),'22023');
    await deny(adopt(db,c.id,c.d.security_revision,2,doc,randomUUID(),uploader,'not-a-digest'),'22023');
    await deny(adopt(db,c.id,-1),'22023');
    await db.exec('update private.private_object_reservation_config set enabled=false');
    await deny(adopt(db,c.id,c.d.security_revision),'42501');
    assert.deepEqual(await documents(db),{items:[],next_cursor:null});assert.equal((await versions(db)).state,'not_found_or_unavailable');
    assert.equal((await one(db,'select count(*)::int n from private.document_versions')).n,0);
  });

  await isolated('closed ingest cannot rescan/report/clear or adopt the same object again',async()=>{
    await target(db);const c=await cleared(db),v=await adopt(db,c.id,c.d.security_revision);
    await deny(adopt(db,c.id,v.security_revision,v.document_revision),'55000');
    await deny(user(db,()=>rpc(db,'report_private_object_phi',[c.id,v.security_revision])),'55000');
    await deny(service(db,()=>rpc(db,'claim_private_object_scan',[c.id,v.security_revision,randomUUID(),'synthetic_fixture','v1','r1'])),'55000');
    await deny(user(db,()=>rpc(db,'decide_private_object_clearance',[c.id,c.o.scan_observation_id,digest,v.security_revision,randomUUID(),'cleared_no_phi','reviewed_no_phi']),reviewer),'55000');
    await deny(service(db,()=>rpc(db,'set_private_object_controls',[c.id,v.security_revision,false,false,false])),'55000');
  });

  await isolated('existing technical closure and clearance protections survive the additive guard extension',async()=>{
    const c=await cleared(db);const closed=await service(db,()=>rpc(db,'set_private_object_controls',[c.id,c.d.security_revision,false,true,true]));
    assert.equal(closed.ingest_closed,true);assert.equal(closed.preservation_hold,true);assert.equal(closed.clearance_decision_id,null);
    assert.equal((await one(db,"select actor_kind from public.audit_events where object_id=$1 and event_type='private_object_ingest_closed'",[c.id])).actor_kind,'system');
    await deny(service(db,()=>rpc(db,'decide_private_object_clearance',[c.id,c.o.scan_observation_id,digest,closed.security_revision,randomUUID(),'cleared_no_phi','reviewed_no_phi'])),'42501');
  });

  await isolated('versions and grant identities are append-only and same-scope composite FKs remain authoritative',async()=>{
    const g=await target(db);const c=await cleared(db);const v=await adopt(db,c.id,c.d.security_revision);
    await ownerDeny(db,"update private.document_versions set lifecycle_state='released' where id=$1",[v.version_id]);
    await ownerDeny(db,'delete from private.document_versions where id=$1',[v.version_id]);await ownerDeny(db,'truncate private.document_versions');
    await ownerDeny(db,'delete from private.document_version_grants where id=$1',[g.view.grant_id]);
    await db.exec('alter table private.document_versions disable trigger document_versions_immutable');
    await ownerDeny(db,'update private.document_versions set account_id=$1 where id=$2',[accountB,v.version_id],'23503');
    await ownerDeny(db,'update private.document_versions set facility_id=$1 where id=$2',[facilityA2,v.version_id],'23503');
    await ownerDeny(db,'update private.document_versions set verified_sha256=$1 where id=$2',['b'.repeat(64),v.version_id],'23503');
    await ownerDeny(db,'update public.documents set facility_id=$1 where id=$2',[facilityA2,doc],'23503');
  });

  for(const event of ['document_version_adopted','private_object_ingest_closed']) await isolated(`${event} audit failure rolls back version, closure and ordinal/revision together`,async()=>{
    await target(db);const c=await cleared(db),before=await status(db,c.id);
    await db.exec(`create function private.test_document_audit_failure() returns trigger language plpgsql as $$ begin if new.event_type='${event}' then raise exception 'injected adoption audit failure';end if;return new;end $$;
      create trigger test_document_audit_failure before insert on public.audit_events for each row execute function private.test_document_audit_failure();`);
    await assert.rejects(adopt(db,c.id,c.d.security_revision),/injected adoption audit failure/);
    assert.deepEqual(await status(db,c.id),before);assert.equal((await one(db,'select count(*)::int n from private.document_versions')).n,0);
    assert.deepEqual(await one(db,'select document_revision,next_version_ordinal from private.document_version_heads where document_id=$1',[doc]),{document_revision:2,next_version_ordinal:1});
    await db.exec('drop trigger test_document_audit_failure on public.audit_events');assert.equal((await adopt(db,c.id,c.d.security_revision)).version_ordinal,1);
  });

  await isolated('grant retries are stable; changed target/request or audit failure cannot invent authority',async()=>{
    const key=randomUUID(),g=await grant(db,doc,uploader,'view_versions',0,key);assert.deepEqual(await grant(db,doc,uploader,'view_versions',0,key),g);
    await deny(grant(db,doc,uploader,'create_version',0,key),'23505');await deny(grant(db,doc,reader,'view_versions',0),'40001');
    await db.exec(`create function private.test_grant_audit_failure() returns trigger language plpgsql as $$ begin if new.event_type='document_version_grant_created' then raise exception 'injected grant audit failure';end if;return new;end $$;
      create trigger test_grant_audit_failure before insert on public.audit_events for each row execute function private.test_grant_audit_failure();`);
    await assert.rejects(grant(db,doc,uploader,'create_version',1),/injected grant audit failure/);
    assert.equal((await documents(db)).items[0].can_create_version,false);assert.equal((await versions(db)).document_revision,1);
  });

  await isolated('adoption and closure audit exact versions/objects and real human provenance; grants remain system',async()=>{
    const g=await target(db);const c=await cleared(db);const v=await adopt(db,c.id,c.d.security_revision);
    const audit=(await db.query("select * from public.audit_events where object_id=any($1::uuid[]) and event_type in ('document_version_adopted','private_object_ingest_closed','document_version_grant_created')",[[v.version_id,c.id,g.view.grant_id,g.create.grant_id]])).rows;
    assert.equal(audit.length,4);
    for(const e of audit) {
      if(e.event_type==='document_version_grant_created'){assert.equal(e.actor_kind,'system');assert.equal(e.actor_auth_user_id,null);}
      else {assert.equal(e.actor_kind,'user');assert.equal(e.actor_auth_user_id,subjects.get(uploader));assert.equal(e.actor_user_profile_id,uploader);}
      for(const key of ['content','filename','bucket_id','object_key','claims','token']) assert.equal(Object.hasOwn(e.event_metadata,key),false);
    }
    const adopted=audit.find(e=>e.event_type==='document_version_adopted');assert.equal(adopted.event_metadata.verified_sha256,digest);assert.equal(adopted.event_metadata.clearance_decision_id,c.d.decision_id);
  });

  await isolated('unchanged seed and legacy bytes survive; no approval/release/content API is created',async()=>{
    await runSqlFile(db,foundationSeedUrl);assert.equal((await one(db,'select count(*)::int n from private.document_versions')).n,0);
    assert.equal((await one(db,'select count(*)::int n from public.documents where id in ($1,$2)',[doc,sibling])).n,2);
    const functions=(await db.query("select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname ~ '(document|version)' ")).rows.map(x=>x.proname);
    assert.equal(functions.some(x=>/release|approve|sign|download|content|supersede/.test(x)),false);
  });
});
