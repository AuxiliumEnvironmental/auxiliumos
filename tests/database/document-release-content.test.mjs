import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import test from 'node:test';
import { createTestDatabase, runSqlFile, setSimulatedSubject } from '../helpers/pglite-database.mjs';

const migrationName='20261009194030_document_release_content.sql';
const uuid=n=>`70000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const account='00000000-0000-4000-8000-000000000001',facility='00000000-0000-4000-8000-000000000301';
const author='00000000-0000-4000-8000-000000000101',reviewer='00000000-0000-4000-8000-000000000103',reader='00000000-0000-4000-8000-000000000106';
const doc='00000000-0000-4000-8000-000000000501',accountB=uuid(20),facilityB=uuid(21),facilityA2=uuid(22),outsider=uuid(30);
const subjects=new Map([[author,uuid(1)],[reviewer,uuid(2)],[reader,uuid(3)],[outsider,uuid(4)]]),digest='a'.repeat(64);
const one=async(db,sql,args=[]) => (await db.query(sql,args)).rows[0];
async function as(db,role,run,profile=author,session='authenticator',claims={}) {
  const subject=subjects.get(profile)??null;
  await setSimulatedSubject(db,subject,{role,sub:subject,...claims});await db.exec('savepoint request_context');
  try {await db.exec(`set session authorization ${session};set role ${role}`);return await run();}
  catch(error){await db.exec('rollback to request_context');throw error;}
  finally {await db.exec('reset role;set session authorization postgres;release request_context');}
}
const user=(db,run,profile=author)=>as(db,'authenticated',run,profile),service=(db,run)=>as(db,'service_role',run,null);
const names=new Set(['provision_document_version_grant','revoke_document_version_grant','adopt_private_object','provision_private_object_grant',
  'claim_private_object_scan','record_private_object_scan','decide_private_object_clearance','set_private_object_controls',
  'provision_document_content_grant','revoke_document_content_grant','provision_document_review_assignment','revoke_document_review_assignment',
  'request_document_version_review','decide_document_version_review','document_version_review_status','provision_document_release_grant','revoke_document_release_grant','release_document_version','withdraw_document_release','retire_document_release','document_version_release_status','current_document_release','historical_document_release','authorize_document_version_content','document_release_audience_options','authorize_document_release_content','record_document_release_content_result','record_document_release_content_denial','document_release_withdrawal_status']);
async function rpc(db,name,args) {assert.ok(names.has(name));return (await one(db,`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) result`,args)).result;}
const deny=(op,code='42501')=>assert.rejects(op,e=>{assert.equal(e.code,code,e.message);return true;});
async function ownerDeny(db,sql,args=[],code='55000') {
  await db.exec('savepoint owner_probe');try {await deny(db.query(sql,args),code);}finally {await db.exec('rollback to owner_probe;release owner_probe');}
}
const view=(db,profile=author,cap='view_versions',rev=0)=>service(db,()=>rpc(db,'provision_document_version_grant',[doc,profile,cap,randomUUID(),rev]));
const content=(db,v,profile=reviewer,rev=0)=>service(db,()=>rpc(db,'provision_document_content_grant',[v.version_id,digest,profile,randomUUID(),rev]));
const docRevision=async db=>(await one(db,'select document_revision from private.document_version_heads where document_id=$1',[doc])).document_revision;
const reviewRevision=async(db,v)=>(await one(db,'select coalesce((select review_revision from private.document_review_heads where version_id=$1),0) revision',[v.version_id])).revision;
async function adopted(db,documentRevision) {
  const r=await user(db,()=>one(db,"select * from public.reserve_private_object($1,$2,$3,40,'text/plain')",[account,facility,randomUUID()]));
  const a=await user(db,()=>one(db,'select * from public.claim_private_object_upload($1,1)',[r.object_id]));
  await service(db,()=>db.query('select public.bind_private_object_upload($1,$2,$3,40)',[r.object_id,a.attempt_id,digest]));
  const receipt=await service(db,()=>one(db,"select * from public.record_private_object_receipt($1,$2,$3,40,'text/plain')",[r.object_id,a.attempt_id,digest]));
  await user(db,()=>db.query('select public.finalize_private_object($1,$2,$3,$4)',[r.object_id,a.attempt_id,receipt.receipt_id,receipt.state_revision]));
  const g=await service(db,()=>rpc(db,'provision_private_object_grant',[r.object_id,reviewer,'clear_object',randomUUID(),0]));
  const scan=await service(db,()=>rpc(db,'claim_private_object_scan',[r.object_id,g.security_revision,randomUUID(),'synthetic_fixture','fixture-v1','rules-v1']));
  const observation=await service(db,()=>rpc(db,'record_private_object_scan',[r.object_id,scan.scan_attempt_id,digest,'pass','no_signal','synthetic_no_signal']));
  const clear=await user(db,()=>rpc(db,'decide_private_object_clearance',[r.object_id,observation.scan_observation_id,digest,observation.security_revision,randomUUID(),'cleared_no_phi','reviewed_no_phi']),reviewer);
  return user(db,()=>rpc(db,'adopt_private_object',[r.object_id,digest,doc,clear.security_revision,documentRevision,randomUUID()]));
}
const releaseRevision=async db=>(await one(db,'select coalesce((select release_revision from private.document_release_heads where document_id=$1),0) revision',[doc])).revision;
async function approved(db,v,decision='approved_internal',profile=reviewer) {
  const d=await docRevision(db),rev=await reviewRevision(db,v);
  const assignment=await service(db,()=>rpc(db,'provision_document_review_assignment',[v.version_id,digest,profile,randomUUID(),d,rev,'synthetic_fixture']));
  const request=await user(db,()=>rpc(db,'request_document_version_review',[v.version_id,digest,d,rev+1,randomUUID()]));
  const result=await user(db,()=>rpc(db,'decide_document_version_review',[request.review_request_id,digest,d,rev+2,randomUUID(),decision,'reviewed_exact_synthetic_version']),profile);
  return {assignment,request,result};
}
async function grant(db,v,kind='current_recipient',profile=reader,options={}) {
  const o={key:randomUUID(),doc:await docRevision(db),rev:await releaseRevision(db),sha:digest,basis:'synthetic_fixture',...options};
  return service(db,()=>rpc(db,'provision_document_release_grant',[v.version_id,o.sha,profile,kind,o.key,o.doc,o.rev,o.basis]));
}
const controller=(db,v,profile=author,options={})=>grant(db,v,'release_controller',profile,options);
async function release(db,v,audience,options={}) {
  const o={profile:author,key:randomUUID(),doc:await docRevision(db),review:await reviewRevision(db,v),rev:await releaseRevision(db),sha:digest,attestation:'released_exact_synthetic_version',...options};
  return user(db,()=>rpc(db,'release_document_version',[v.version_id,o.sha,o.doc,o.review,o.rev,audience,o.key,o.attestation]),o.profile);
}
async function prepared(db,v,options={}) {
  const review=await approved(db,v);const assignment=await controller(db,v);const recipient=await grant(db,v);
  return {review,assignment,recipient,result:options.release===false?null:await release(db,v,[recipient.grant_id])};
}
async function revoke(db,v,g,revision) {return service(db,()=>rpc(db,'revoke_document_release_grant',[v.version_id,g.grant_id,revision]));}
async function withdraw(db,r,options={}) {
  const o={profile:author,key:randomUUID(),rev:await releaseRevision(db),reason:'release_error',operator:false,...options};
  const run=()=>rpc(db,o.operator?'retire_document_release':'withdraw_document_release',[r.release_id,o.rev,o.key,o.reason]);
  return o.operator?service(db,run):user(db,run,o.profile);
}
const current=(db,profile=reader,id=doc)=>user(db,()=>rpc(db,'current_document_release',[id]),profile);
const historical=(db,v,profile=reader,sha=digest)=>user(db,()=>rpc(db,'historical_document_release',[v.version_id,sha]),profile);
const options=(db,v,profile=author)=>user(db,()=>rpc(db,'document_release_audience_options',[v.version_id,digest]),profile);
const status=(db,v,profile=author,sha=digest)=>user(db,()=>rpc(db,'document_version_release_status',[v.version_id,sha]),profile);
async function controls(db,v,{restricted=false,hold=false}={}) {
  const rev=(await one(db,'select security_revision from private.private_object_security where object_id=$1',[v.object_id])).security_revision;
  return service(db,()=>rpc(db,'set_private_object_controls',[v.object_id,rev,restricted,hold,true]));
}
async function domainSnapshot(db) {
  const result={};
  for(const table of ['public.documents','private.document_versions','private.document_version_heads','public.account_capability_grants',
    'public.account_access','public.user_profiles','private.document_content_grants','private.private_object_security','private.document_review_decisions'])
    result[table]=(await one(db,`select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) rows from ${table} t`)).rows;
  return result;
}


const authorize=(db,r,options={})=>{
  const o={profile:reader,sha:digest,visibility:'current',key:randomUUID(),...options};
  return user(db,()=>rpc(db,'authorize_document_release_content',[r.release_id,o.sha,o.visibility,o.key]),o.profile);
};
const result=(db,a,outcome)=>service(db,()=>rpc(db,'record_document_release_content_result',[a.authorization_id,outcome]));
const denial=(db,rid,subject=subjects.get(reader),reason='not_found_or_unavailable',key=randomUUID())=>
  service(db,()=>rpc(db,'record_document_release_content_denial',[key,rid,subject,reason]));

test('exact-release content authorization — PostgreSQL/PGlite simulated Auth, not hosted bytes or concurrent-session proof',async t=>{
  const db=await createTestDatabase();t.after(()=>db.close());
  await db.exec(`create role authenticator nologin noinherit;grant anon,authenticated,service_role to authenticator;
    alter table auth.users add column email text;
    create schema storage;create table storage.buckets(id text primary key);create table storage.objects(id uuid primary key,bucket_id text,name text);
    alter table storage.buckets enable row level security;alter table storage.objects enable row level security;
    alter default privileges in schema private grant all on tables to public,anon,authenticated,service_role;
    alter default privileges in schema private grant execute on functions to public,anon,authenticated,service_role;
    alter default privileges in schema public grant execute on functions to public,anon,authenticated,service_role;`);
  const migrations=new URL('../../supabase/migrations/',import.meta.url);
  for(const name of (await readdir(migrations)).sort()) if(name>'20261008120645_identity_access_directory.sql'&&name<=migrationName) await runSqlFile(db,new URL(name,migrations));
  await db.query("insert into public.client_accounts(id,display_name) values($1,'Synthetic B')",[accountB]);
  await db.query("insert into public.facilities(id,account_id,display_name) values($1,$2,'Synthetic B1'),($3,$4,'Synthetic A2')",[facilityB,accountB,facilityA2,account]);
  await db.query("insert into public.user_profiles(id,display_name) values($1,'Synthetic outsider')",[outsider]);
  for(const [profile,subject] of subjects) {
    const tenant=profile===outsider?accountB:account,asset=profile===outsider?facilityB:facility;
    await db.query('insert into auth.users(id) values($1)',[subject]);await db.query('update public.user_profiles set auth_user_id=$1 where id=$2',[subject,profile]);
    await db.query("update public.user_profiles set identity_status='active' where id=$1",[profile]);
    await db.query("insert into public.account_access(account_id,user_profile_id,membership_status) values($1,$2,'active') on conflict(account_id,user_profile_id) do update set membership_status='active'",[tenant,profile]);
    await db.query("insert into public.account_capability_grants(account_id,user_profile_id,capability_key,scope_kind,facility_id) values($1,$2,'view_account','account',null),($1,$2,'view_asset','facility',$3),($1,$2,'ingest_private_object','facility',$3)",[tenant,profile,asset]);
  }
  await db.query("update public.documents set document_class='routine_synthetic_document' where id=$1",[doc]);
  await db.exec('update private.private_object_reservation_config set enabled=true;update private.document_content_config set enabled=true;begin');
  await view(db);await view(db,author,'create_version',1);await view(db,reviewer,'view_versions',2);
  const v1=await adopted(db,3),v2=await adopted(db,4);
  const authorContent=await content(db,v1,author),reviewContent=await content(db,v1,reviewer,1);
  await content(db,v2,author);await content(db,v2,reviewer,1);
  await db.exec('commit');assert.equal(await docRevision(db),5);
  const isolated=(name,body)=>t.test(name,async()=>{await db.exec('begin');try{await body();}finally{await db.exec('rollback;reset role;set session authorization postgres');}});


  await isolated('exact current recipient receives an immutable manifest without internal draft access',async()=>{
    const p=await prepared(db,v1),before=await domainSnapshot(db),a=await authorize(db,p.result);
    assert.deepEqual(Object.keys(a).sort(),['authorization_id','bucket_id','byte_size','media_type','object_id','object_key','recipient_grant_id','release_id','verified_sha256','version_id','visibility']);
    assert.equal(a.release_id,p.result.release_id);assert.equal(a.version_id,v1.version_id);assert.equal(a.recipient_grant_id,p.recipient.grant_id);
    assert.equal(a.object_id,v1.object_id);assert.equal(a.verified_sha256,digest);assert.equal(a.byte_size,40);assert.equal(a.media_type,'text/plain');
    assert.equal(a.visibility,'current');assert.equal(a.bucket_id,'os-private-ingest');
    assert.equal(a.object_key,(await one(db,'select object_key from private.private_object_reservations where id=$1',[v1.object_id])).object_key);
    assert.deepEqual(await domainSnapshot(db),before);
    const metadata=await current(db);assert.equal(metadata.metadata_only,true);assert.equal(metadata.released_download_available,false);
    await deny(user(db,()=>rpc(db,'authorize_document_version_content',[v1.version_id,digest,randomUUID()]),reader));
    const row=await one(db,'select * from private.document_release_content_authorizations where id=$1',[a.authorization_id]);
    assert.equal(row.subject_profile_id,reader);assert.equal(row.subject_auth_user_id,subjects.get(reader));
    const event=await one(db,"select * from public.audit_events where event_type='document_release_content_authorized'");
    assert.equal(event.actor_kind,'user');assert.equal(event.actor_user_profile_id,reader);assert.equal(event.actor_auth_user_id,subjects.get(reader));
    assert.equal(event.event_metadata.meaning,'authorization_only');assert.equal(event.event_metadata.recipient_grant_id,p.recipient.grant_id);
    assert.doesNotMatch(JSON.stringify(event.event_metadata),/object_key|bucket_id|token|url|payload/);
  });

  await isolated('request identity binds exact release digest mode and original recipient; a receipt is not a bearer permit',async()=>{
    const p=await prepared(db,v1),key=randomUUID(),first=await authorize(db,p.result,{key});
    await grant(db,v1,'historical_recipient');assert.deepEqual(await authorize(db,p.result,{key}),first);
    for(const change of [{sha:'b'.repeat(64)},{visibility:'historical'}]) await deny(authorize(db,p.result,{key,...change}),'23505');
    await deny(authorize(db,{release_id:randomUUID()},{key}),'23505');
    await deny(authorize(db,p.result,{sha:'b'.repeat(64)}));
    await revoke(db,v1,p.recipient,await releaseRevision(db));
    await deny(authorize(db,p.result,{key}));await deny(authorize(db,p.result));
    const replacement=await grant(db,v1);assert.notEqual(replacement.grant_id,p.recipient.grant_id);
    await deny(authorize(db,p.result,{key}));await deny(authorize(db,p.result));
    assert.equal((await one(db,'select count(*)::int n from private.document_release_content_authorizations')).n,1);
  });

  await isolated('same request UUID under another explicitly approved subject has independent provenance',async()=>{
    const p=await prepared(db,v1,{release:false}),second=await grant(db,v1,'current_recipient',reviewer);
    const r=await release(db,v1,[p.recipient.grant_id,second.grant_id]),key=randomUUID();
    const a=await authorize(db,r,{key}),b=await authorize(db,r,{key,profile:reviewer});
    assert.notEqual(a.authorization_id,b.authorization_id);assert.notEqual(a.recipient_grant_id,b.recipient_grant_id);
    assert.equal((await one(db,'select count(*)::int n from private.document_release_content_authorizations')).n,2);
  });

  await isolated('administrator controller reviewer uploader and cross-account identity cannot inherit recipient bytes',async()=>{
    const p=await prepared(db,v1);
    for(const profile of [author,reviewer,outsider]) await deny(authorize(db,p.result,{profile}));
    await deny(authorize(db,{release_id:randomUUID()}));
    await deny(authorize(db,{release_id:v1.version_id}));
    await deny(as(db,'authenticated',()=>rpc(db,'authorize_document_release_content',[p.result.release_id,digest,'current',randomUUID()]),outsider,'authenticator',{role:'service_role',user_metadata:{owner:true}}),'28000');
    assert.equal((await one(db,'select count(*)::int n from private.document_release_content_authorizations')).n,0);
  });

  await isolated('new draft and review preserve current bytes; replacement requires explicit historical access',async()=>{
    const p=await prepared(db,v1),key=randomUUID(),a=await authorize(db,p.result,{key});
    await adopted(db,await docRevision(db));await approved(db,v2);
    assert.deepEqual(await authorize(db,p.result,{key}),a);
    await controller(db,v2);const g=await grant(db,v2),r2=await release(db,v2,[g.grant_id]);
    await deny(authorize(db,p.result,{key}));await deny(authorize(db,p.result,{visibility:'historical'}));
    await deny(authorize(db,r2,{visibility:'historical'}));assert.equal((await authorize(db,r2)).version_id,v2.version_id);
    const h=await grant(db,v1,'historical_recipient'),historicalKey=randomUUID();
    const old=await authorize(db,p.result,{visibility:'historical',key:historicalKey});
    assert.equal(old.recipient_grant_id,h.grant_id);assert.equal(old.visibility,'historical');assert.equal(old.version_id,v1.version_id);
    await deny(authorize(db,p.result));await deny(authorize(db,p.result,{key,visibility:'historical'}),'23505');
  });

  await isolated('historical recipient replacement cannot revive an earlier exact authorization',async()=>{
    const p=await prepared(db,v1);await prepared(db,v2);
    const g=await grant(db,v1,'historical_recipient'),key=randomUUID(),old=await authorize(db,p.result,{visibility:'historical',key});
    await revoke(db,v1,g,await releaseRevision(db));await deny(authorize(db,p.result,{visibility:'historical',key}));
    const replacement=await grant(db,v1,'historical_recipient');await deny(authorize(db,p.result,{visibility:'historical',key}));
    const fresh=await authorize(db,p.result,{visibility:'historical'});
    assert.equal(fresh.recipient_grant_id,replacement.grant_id);assert.notEqual(fresh.authorization_id,old.authorization_id);
  });

  await isolated('separate historical assignment may authorize an eligible recipient absent from original current audience',async()=>{
    const p=await prepared(db,v1);await prepared(db,v2);const g=await grant(db,v1,'historical_recipient',reviewer);
    const a=await authorize(db,p.result,{profile:reviewer,visibility:'historical'});assert.equal(a.recipient_grant_id,g.grant_id);
    await deny(authorize(db,p.result,{profile:reviewer}));
  });

  for(const visibility of ['current','historical']) await isolated('withdrawal denies fresh and repeated '+visibility+' authorization without deleting history',async()=>{
    const p=await prepared(db,v1);
    if(visibility==='historical'){await prepared(db,v2);await grant(db,v1,'historical_recipient');}
    const key=randomUUID(),a=await authorize(db,p.result,{visibility,key});await controls(db,v1,{hold:true});
    await withdraw(db,p.result,{operator:true});
    await deny(authorize(db,p.result,{visibility,key}));await deny(authorize(db,p.result,{visibility}));
    assert.equal((await one(db,'select count(*)::int n from private.document_release_content_authorizations where id=$1',[a.authorization_id])).n,1);
    assert.equal((await one(db,'select preservation_hold value from private.private_object_security where object_id=$1',[v1.object_id])).value,true);
  });

  await isolated('withdrawal and released-recipient authority do not revoke or confer internal view_content',async()=>{
    const p=await prepared(db,v1);await authorize(db,p.result);
    const a=await user(db,()=>rpc(db,'authorize_document_version_content',[v1.version_id,digest,randomUUID()]));
    await withdraw(db,p.result);
    const b=await user(db,()=>rpc(db,'authorize_document_version_content',[v1.version_id,digest,randomUUID()]));
    assert.equal(a.object_id,b.object_id);await deny(authorize(db,p.result));
  });

  for(const target of ['identity','membership','directory_account','directory_facility','wrong_facility','auth_unlinked','auth_deleted','content_switch','ingest_switch','restricted','phi','class']) {
    await isolated('every request rechecks current '+target+' after an earlier authorization',async()=>{
      const p=await prepared(db,v1),key=randomUUID();await authorize(db,p.result,{key});
      if(target==='identity') await db.query("update public.user_profiles set identity_status='suspended' where id=$1",[reader]);
      if(target==='membership') await db.query("update public.account_access set membership_status='suspended' where account_id=$1 and user_profile_id=$2",[account,reader]);
      if(target==='directory_account'||target==='directory_facility') await db.query("update public.account_capability_grants set revoked_at=clock_timestamp() where user_profile_id=$1 and capability_key=$2",[reader,target==='directory_account'?'view_account':'view_asset']);
      if(target==='wrong_facility') await db.query("update public.account_capability_grants set facility_id=$1 where user_profile_id=$2 and capability_key='view_asset'",[facilityA2,reader]);
      if(target==='auth_unlinked') await db.query('update public.user_profiles set auth_user_id=null where id=$1',[reader]);
      if(target==='auth_deleted') await db.query('delete from auth.users where id=$1',[subjects.get(reader)]);
      if(target==='content_switch') await db.exec('update private.document_content_config set enabled=false');
      if(target==='ingest_switch') await db.exec('update private.private_object_reservation_config set enabled=false');
      if(target==='restricted') await controls(db,v1,{restricted:true});
      if(target==='class') await db.query("update public.documents set document_class='final_report' where id=$1",[doc]);
      if(target==='phi') {
        await db.exec("create function private.test_release_phi(p_object uuid) returns void language sql security definer set search_path='' as $$ update private.private_object_security set security_revision=security_revision+1,phi_suspected=true where object_id=p_object $$;grant execute on function private.test_release_phi(uuid) to service_role;");
        await service(db,()=>db.query('select private.test_release_phi($1)',[v1.object_id]));
      }
      await deny(authorize(db,p.result,{key}));await deny(authorize(db,p.result));
    });
  }

  await isolated('historical reads recheck membership and safety; holds alone preserve visibility',async()=>{
    const p=await prepared(db,v1);await prepared(db,v2);await grant(db,v1,'historical_recipient');
    await controls(db,v1,{hold:true});const key=randomUUID(),a=await authorize(db,p.result,{visibility:'historical',key});
    assert.equal(a.version_id,v1.version_id);
    await controls(db,v1,{hold:true,restricted:true});await deny(authorize(db,p.result,{visibility:'historical',key}));
    await controls(db,v1,{hold:true});assert.deepEqual(await authorize(db,p.result,{visibility:'historical',key}),a);
    await db.query("update public.account_access set membership_status='suspended' where account_id=$1 and user_profile_id=$2",[account,reader]);
    await deny(authorize(db,p.result,{visibility:'historical',key}));
  });

  await isolated('retired controller or reviewer does not erase completed recipient authority',async()=>{
    const p=await prepared(db,v1),a=await authorize(db,p.result);
    await revoke(db,v1,p.assignment,await releaseRevision(db));
    const revision=await reviewRevision(db,v1);
    await service(db,()=>rpc(db,'revoke_document_review_assignment',[v1.version_id,p.review.assignment.assignment_id,revision]));
    assert.equal((await authorize(db,p.result)).object_id,a.object_id);
  });

  await isolated('service outcomes are bounded observations and remain recordable after narrowing',async()=>{
    const p=await prepared(db,v1),a=await authorize(db,p.result);await withdraw(db,p.result,{operator:true});
    await db.exec('update private.document_content_config set enabled=false;update private.private_object_reservation_config set enabled=false');
    for(const outcome of ['response_prepared','provider_failure','integrity_failure','access_changed']){
      const first=await result(db,a,outcome);assert.deepEqual(await result(db,a,outcome),first);
      assert.deepEqual(Object.keys(first).sort(),['authorization_id','outcome','result_id']);
    }
    await deny(result(db,a,'delivered'),'22023');await deny(result(db,{authorization_id:randomUUID()},'response_prepared'));
    await deny(user(db,()=>rpc(db,'record_document_release_content_result',[a.authorization_id,'response_prepared'])));
    const events=(await db.query("select * from public.audit_events where event_type='document_release_content_result_recorded'")).rows;
    assert.equal(events.length,4);
    for(const e of events){assert.equal(e.actor_kind,'system');assert.equal(e.actor_auth_user_id,null);assert.equal(e.actor_user_profile_id,null);assert.equal(e.event_metadata.meaning,'system_observation_not_delivery');assert.doesNotMatch(JSON.stringify(e.event_metadata),/object_key|bucket_id|token|payload/);}
  });

  await isolated('denial observations never fabricate human or tenant provenance and accept no free-form reason',async()=>{
    const p=await prepared(db,v1),key=randomUUID(),a=await denial(db,p.result.release_id,subjects.get(reader),'not_found_or_unavailable',key);
    const b=await denial(db,p.result.release_id,subjects.get(reader),'not_found_or_unavailable',key);assert.notEqual(a.denial_id,b.denial_id);
    await denial(db,null,null,'unauthenticated');await deny(denial(db,randomUUID(),randomUUID(),'SECRET path'),'22023');
    await deny(user(db,()=>rpc(db,'record_document_release_content_denial',[randomUUID(),p.result.release_id,subjects.get(reader),'not_found_or_unavailable'])));
    const events=(await db.query("select * from public.audit_events where event_type='document_release_content_denied'")).rows;
    assert.equal(events.length,3);
    for(const e of events){assert.equal(e.account_id,null);assert.equal(e.actor_kind,'system');assert.equal(e.actor_auth_user_id,null);assert.equal(e.actor_user_profile_id,null);assert.equal(e.event_metadata.meaning,'system_observation_not_human_authority');}
  });

  await isolated('authorization and observation audit failures roll back their associated records',async()=>{
    const p=await prepared(db,v1);
    await db.exec("alter table public.audit_events add constraint test_deny_auth check(event_type<>'document_release_content_authorized')");
    await deny(authorize(db,p.result),'23514');assert.equal((await one(db,'select count(*)::int n from private.document_release_content_authorizations')).n,0);
    await db.exec('alter table public.audit_events drop constraint test_deny_auth');const a=await authorize(db,p.result);
    await db.exec("alter table public.audit_events add constraint test_deny_result check(event_type<>'document_release_content_result_recorded')");
    await deny(result(db,a,'response_prepared'),'23514');assert.equal((await one(db,'select count(*)::int n from private.document_release_content_results')).n,0);
    await db.exec("alter table public.audit_events add constraint test_deny_denial check(event_type<>'document_release_content_denied')");
    await deny(denial(db,p.result.release_id),'23514');assert.equal((await one(db,'select count(*)::int n from private.document_release_content_denials')).n,0);
  });

  await isolated('private trigger rechecks authority and derives every privileged-insert binding field',async()=>{
    const p=await prepared(db,v1);
    await db.exec("create function private.test_release_content_insert(p_release uuid,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$ declare a private.document_release_content_authorizations%rowtype;begin insert into private.document_release_content_authorizations(id,release_id,version_id,document_id,account_id,object_id,verified_sha256,recipient_grant_id,visibility,byte_size,media_type,bucket_id,object_key,subject_profile_id,subject_auth_user_id,request_id,authorized_at) values(gen_random_uuid(),p_release,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),repeat('a',64),gen_random_uuid(),'current',1,'text/html','forged','forged',gen_random_uuid(),gen_random_uuid(),p_key,'2000-01-01') returning * into a;return to_jsonb(a);end;$$;grant execute on function private.test_release_content_insert(uuid,uuid) to authenticated;");
    const row=(await user(db,()=>one(db,'select private.test_release_content_insert($1,$2) a',[p.result.release_id,randomUUID()]),reader)).a;
    assert.equal(row.version_id,v1.version_id);assert.equal(row.account_id,account);assert.equal(row.object_id,v1.object_id);
    assert.equal(row.recipient_grant_id,p.recipient.grant_id);assert.equal(row.subject_profile_id,reader);assert.equal(row.subject_auth_user_id,subjects.get(reader));
    assert.equal(row.byte_size,40);assert.equal(row.media_type,'text/plain');assert.equal(row.bucket_id,'os-private-ingest');assert.notEqual(row.object_key,'forged');
    assert.ok(new Date(row.authorized_at).getTime()>new Date('2000-01-02').getTime());
    await deny(user(db,()=>one(db,'select private.test_release_content_insert($1,$2)',[p.result.release_id,randomUUID()]),author));
    await deny(as(db,'authenticated',()=>rpc(db,'authorize_document_release_content',[p.result.release_id,digest,'current',randomUUID()]),reader,'postgres'),'28000');
    await deny(as(db,'authenticated',()=>rpc(db,'authorize_document_release_content',[p.result.release_id,digest,'current',randomUUID()]),reader,'authenticator',{is_anonymous:true}),'28000');
  });

  await isolated('default-deny ACLs and immutable histories prevent direct application and owner edits',async()=>{
    const p=await prepared(db,v1),a=await authorize(db,p.result);await result(db,a,'response_prepared');await denial(db,p.result.release_id);
    for(const table of ['document_release_content_authorizations','document_release_content_results','document_release_content_denials']){
      assert.equal((await one(db,'select relrowsecurity value from pg_class where oid=$1::regclass',['private.'+table])).value,true);
      for(const role of ['anon','authenticated','service_role']) assert.equal((await one(db,'select has_table_privilege($1,$2,$3) value',[role,'private.'+table,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'])).value,false);
      await ownerDeny(db,'delete from private.'+table);await ownerDeny(db,'truncate private.'+table+' cascade');
      await ownerDeny(db,'update private.'+table+' set id=gen_random_uuid()');
      await db.exec('grant select on private.'+table+' to authenticated');assert.deepEqual((await user(db,()=>db.query('select * from private.'+table))).rows,[]);
    }
    const fns=(await db.query("select n.nspname schema,p.proname name,p.prosecdef definer,p.proconfig,has_function_privilege('anon',p.oid,'execute') anon,has_function_privilege('authenticated',p.oid,'execute') human,has_function_privilege('service_role',p.oid,'execute') service from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('authorize_document_release_content','record_document_release_content_result','record_document_release_content_denial','document_release_withdrawal_status')")).rows;
    assert.equal(fns.length,4);
    for(const f of fns){const human=['authorize_document_release_content','document_release_withdrawal_status'].includes(f.name);assert.equal(f.anon,false);assert.equal(f.human,human);assert.equal(f.service,!human);assert.equal(f.definer,false);assert.ok(f.proconfig.includes('search_path=""'));}
    const helpers=(await db.query("select p.proname,has_function_privilege('authenticated',p.oid,'execute') human,has_function_privilege('service_role',p.oid,'execute') service from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in ('lock_document_release_content_access','guard_document_release_content_history','audit_document_release_content_change','document_release_content_receipt')")).rows;
    assert.equal(helpers.length,4);for(const f of helpers){assert.equal(f.human,false);assert.equal(f.service,false);}
  });


  const withdrawalStatus=(v,profile=author,sha=digest)=>user(db,()=>rpc(db,'document_release_withdrawal_status',[v.version_id,sha]),profile);
  await isolated('fresh withdrawal discovery survives disabled content gate and unsafe restricted object',async()=>{
    const p=await prepared(db,v1);await controls(db,v1,{restricted:true});
    await db.exec('update private.document_content_config set enabled=false');
    await deny(status(db,v1));
    const seen=await withdrawalStatus(v1);
    assert.deepEqual(Object.keys(seen).sort(),['can_withdraw','document_id','release_id','release_revision','release_state','verified_sha256','version_id']);
    assert.deepEqual(seen,{version_id:v1.version_id,document_id:doc,verified_sha256:digest,release_id:p.result.release_id,
      release_revision:await releaseRevision(db),release_state:'current',can_withdraw:true});
    const receipt=await withdraw(db,{release_id:seen.release_id},{rev:seen.release_revision,reason:'security_concern'});
    assert.equal(receipt.release_id,seen.release_id);assert.equal(receipt.withdrawn,true);
    const after=await withdrawalStatus(v1);assert.equal(after.release_state,'withdrawn');assert.equal(after.can_withdraw,false);
    assert.equal(after.release_revision,receipt.release_revision);
  });

  await isolated('withdrawal discovery excludes internal content grants and reports current head revision for superseded release',async()=>{
    const p=await prepared(db,v1);await prepared(db,v2);
    await service(db,()=>rpc(db,'revoke_document_content_grant',[v1.version_id,authorContent.grant_id,2]));
    const seen=await withdrawalStatus(v1);
    assert.equal(seen.release_id,p.result.release_id);assert.equal(seen.release_state,'superseded');assert.equal(seen.can_withdraw,true);
    assert.equal(seen.release_revision,await releaseRevision(db));assert.ok(seen.release_revision>p.result.release_revision);
    const receipt=await withdraw(db,{release_id:seen.release_id},{rev:seen.release_revision});
    assert.equal(receipt.withdrawn,true);assert.equal((await current(db)).version_id,v2.version_id);
  });

  await isolated('unreleased withdrawal discovery requires an explicit controller and never creates release state',async()=>{
    const before=await one(db,'select count(*)::int n from private.document_release_heads');
    await deny(withdrawalStatus(v1));
    assert.equal((await one(db,'select count(*)::int n from private.document_release_heads')).n,before.n);
    await controller(db,v1);
    const revision=await releaseRevision(db),seen=await withdrawalStatus(v1);
    assert.equal(seen.release_id,null);assert.equal(seen.release_state,'unreleased');assert.equal(seen.can_withdraw,false);
    assert.equal(seen.release_revision,revision);assert.equal(await releaseRevision(db),revision);
    assert.equal((await one(db,'select count(*)::int n from private.document_releases')).n,0);
  });

  for(const restriction of ['controller','logical_view','membership','ingest_gate']) await isolated('withdrawal discovery retains existing human '+restriction+' boundary',async()=>{
    const p=await prepared(db,v1);
    if(restriction==='controller') await revoke(db,v1,p.assignment,await releaseRevision(db));
    if(restriction==='logical_view') {
      const g=await one(db,"select id from private.document_version_grants where document_id=$1 and user_profile_id=$2 and capability_key='view_versions' and revoked_at is null",[doc,author]);
      const revision=await docRevision(db);
      await service(db,()=>rpc(db,'revoke_document_version_grant',[doc,g.id,revision]));
    }
    if(restriction==='membership') await db.query("update public.account_access set membership_status='suspended' where account_id=$1 and user_profile_id=$2",[account,author]);
    if(restriction==='ingest_gate') await db.exec('update private.private_object_reservation_config set enabled=false');
    await deny(withdrawalStatus(v1));
  });

  await isolated('withdrawal discovery denies other viewers and digest probes without granting new-release authority',async()=>{
    await prepared(db,v1);
    for(const profile of [reader,reviewer,outsider]) await deny(withdrawalStatus(v1,profile));
    await deny(withdrawalStatus(v1,author,'b'.repeat(64)));await deny(withdrawalStatus(v1,author,'bad'),'22023');
    await deny(withdrawalStatus({version_id:randomUUID()}));
    await deny(service(db,()=>rpc(db,'document_release_withdrawal_status',[v1.version_id,digest])));
    await deny(as(db,'anon',()=>rpc(db,'document_release_withdrawal_status',[v1.version_id,digest]),null));
    const metadata=await current(db);assert.equal(metadata.metadata_only,true);assert.equal(metadata.released_download_available,false);
  });
});
