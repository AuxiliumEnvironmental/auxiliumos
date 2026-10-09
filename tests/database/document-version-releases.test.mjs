import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import test from 'node:test';
import { createTestDatabase, runSqlFile, setSimulatedSubject } from '../helpers/pglite-database.mjs';

const migrationName='20261009184724_document_version_releases.sql';
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
  'request_document_version_review','decide_document_version_review','document_version_review_status','provision_document_release_grant','revoke_document_release_grant','release_document_version','withdraw_document_release','retire_document_release','document_version_release_status','current_document_release','historical_document_release','authorize_document_version_content','document_release_audience_options']);
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

test('synthetic exact-version metadata release — PostgreSQL/PGlite simulated Auth, not hosted or concurrent-session proof',async t=>{
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

  await isolated('approved exact revision plus separate controller and explicit recipient produces metadata only with protected provenance',async()=>{
    const {review,assignment,recipient}=await prepared(db,v1,{release:false});const before=await domainSnapshot(db);
    assert.equal((await status(db,v1)).can_prepare_release,true);await deny(current(db));
    const r=await release(db,v1,[recipient.grant_id]);assert.equal(r.controller_grant_id,assignment.grant_id);assert.equal(r.review_decision_id,review.result.decision_id);
    assert.equal(r.verified_sha256,digest);assert.equal(r.previous_release_id,null);assert.equal(r.metadata_only,true);assert.equal(r.release_revision,3);
    const seen=await current(db);assert.equal(seen.version_id,v1.version_id);assert.equal(seen.visibility,'current');assert.equal(seen.released_download_available,false);
    assert.equal((await status(db,v1)).release_state,'current');assert.deepEqual(await domainSnapshot(db),before);
    await deny(status(db,v1,reader));await deny(user(db,()=>rpc(db,'authorize_document_version_content',[v1.version_id,digest,randomUUID()]),reader));
    assert.doesNotMatch(JSON.stringify(seen),/object_id|storage|path|url|controller|recipient|review_decision/);
    const events=(await db.query("select * from public.audit_events where object_type like 'document_release%' order by event_metadata->>'release_revision'")).rows;
    assert.deepEqual(events.map(e=>e.event_type),['document_release_grant_created','document_release_grant_created','document_released']);
    for(const e of events){assert.equal(e.is_internal_only,true);assert.equal(e.is_demo,true);assert.equal(e.event_metadata.verified_sha256,digest);}
    assert.equal(events[0].actor_kind,'system');assert.equal(events[0].actor_auth_user_id,null);assert.equal(events[0].actor_user_profile_id,null);
    assert.equal(events[2].actor_kind,'user');assert.equal(events[2].actor_auth_user_id,subjects.get(author));assert.equal(events[2].actor_user_profile_id,author);
  });

  await isolated('audience discovery exposes only explicit current eligible recipients to the exact controller',async()=>{
    const assignment=await controller(db,v1);const g=await grant(db,v1);const ineligible=await grant(db,v1,'current_recipient',reviewer);
    await grant(db,v1,'historical_recipient',author);await grant(db,v2,'current_recipient',author);
    await db.query("update public.account_access set membership_status='suspended' where account_id=$1 and user_profile_id=$2",[account,reviewer]);
    const list=await options(db,v1);assert.equal(list.version_id,v1.version_id);assert.equal(list.verified_sha256,digest);assert.equal(list.release_revision,5);assert.equal(list.document_revision,5);assert.equal(list.review_revision,0);
    assert.deepEqual(list.recipients,[{grant_id:g.grant_id,recipient_profile_id:reader,recipient_display_name:(await one(db,'select display_name from public.user_profiles where id=$1',[reader])).display_name}]);
    assert.doesNotMatch(JSON.stringify(list),/auth_user|storage|object_id|bucket|url|path/);assert.notEqual(ineligible.grant_id,g.grant_id);
    await deny(options(db,v1,reviewer));await deny(options(db,v1,reader));await deny(options(db,v1,outsider));await deny(options(db,v2));
    await revoke(db,v1,assignment,await releaseRevision(db));await deny(options(db,v1));
  });

  await isolated('audience discovery cannot replace content authority and stale recipient options cannot authorize release',async()=>{
    const {recipient}=await prepared(db,v1,{release:false});const listed=await options(db,v1);
    const other=await grant(db,v1,'current_recipient',reviewer);await deny(release(db,v1,listed.recipients.map(g=>g.grant_id),{rev:listed.release_revision}),'40001');
    await revoke(db,v1,recipient,await releaseRevision(db));const fresh=await options(db,v1);assert.deepEqual(fresh.recipients.map(g=>g.grant_id),[other.grant_id]);
    await deny(release(db,v1,[recipient.grant_id]));await service(db,()=>rpc(db,'revoke_document_content_grant',[v1.version_id,authorContent.grant_id,2]));await deny(options(db,v1));
  });

  await isolated('review assignment, technical clearance, administrator, uploader, content, and audience alone confer no release authority',async()=>{
    await approved(db,v1);const recipient=await grant(db,v1);
    for(const profile of [author,reviewer,reader]) await deny(release(db,v1,[recipient.grant_id],{profile}));
    await controller(db,v1);await release(db,v1,[recipient.grant_id]);
    await deny(current(db,author));await deny(current(db,reviewer));
    assert.equal((await one(db,"select count(*)::int n from public.account_memberships where user_profile_id=$1 and role_key='system_admin'",[author])).n,1);
  });

  for(const decision of [null,'changes_requested','rejected']) await isolated(`release denies ${decision??'missing'} exact internal approval`,async()=>{
    if(decision) await approved(db,v1,decision);
    await controller(db,v1);const g=await grant(db,v1);await deny(release(db,v1,[g.grant_id]));
    assert.equal((await status(db,v1)).can_prepare_release,false);
  });

  await isolated('identical bytes in another immutable version do not transfer review, controller, or recipient authority',async()=>{
    const {recipient}=await prepared(db,v1);await deny(release(db,v2,[recipient.grant_id]));
    await approved(db,v2);await deny(release(db,v2,[recipient.grant_id]));await controller(db,v2);await deny(release(db,v2,[recipient.grant_id]));
    const other=await grant(db,v2);const r=await release(db,v2,[other.grant_id]);assert.equal((await current(db)).release_id,r.release_id);
  });

  await isolated('new draft and internal review preserve current release; replacement hides prior until explicit history grant',async()=>{
    const first=await prepared(db,v1);await adopted(db,await docRevision(db));assert.equal((await current(db)).version_id,v1.version_id);
    await approved(db,v2);assert.equal((await current(db)).version_id,v1.version_id);
    await controller(db,v2);const recipient=await grant(db,v2);assert.equal((await current(db)).version_id,v1.version_id);
    const next=await release(db,v2,[recipient.grant_id]);assert.equal(next.previous_release_id,first.result.release_id);
    assert.equal((await current(db)).version_id,v2.version_id);assert.equal((await status(db,v1)).release_state,'superseded');await deny(historical(db,v1));
    const h=await grant(db,v1,'historical_recipient');assert.equal((await historical(db,v1)).visibility,'historical');assert.equal((await current(db)).version_id,v2.version_id);
    await deny(historical(db,v2));await revoke(db,v1,h,await releaseRevision(db));await deny(historical(db,v1));
    const event=await one(db,"select * from public.audit_events where event_type='document_superseded'");assert.equal(event.object_id,first.result.release_id);assert.equal(event.event_metadata.replacement_release_id,next.release_id);
  });

  await isolated('retired reviewer assignment preserves approval; dual routine roles require independently provisioned controller',async()=>{
    const review=await approved(db,v1,'approved_internal',author);const g=await grant(db,v1);await deny(release(db,v1,[g.grant_id]));
    await service(db,()=>rpc(db,'revoke_document_review_assignment',[v1.version_id,review.assignment.assignment_id,3]));
    await controller(db,v1);const r=await release(db,v1,[g.grant_id]);assert.equal(r.review_decision_id,review.result.decision_id);assert.equal(r.review_revision,4);
  });

  await isolated('audience set validates nonempty bounded unique UUIDs and deliberate attestation',async()=>{
    const {recipient}=await prepared(db,v1,{release:false});
    for(const ids of [null,[],[null],[recipient.grant_id,recipient.grant_id],Array.from({length:33},()=>randomUUID())]) await deny(release(db,v1,ids),'22023');
    for(const attestation of [null,'approved','reviewed_exact_synthetic_version']) await deny(release(db,v1,[recipient.grant_id],{attestation}),'22023');
    const h=await grant(db,v1,'historical_recipient');await deny(release(db,v1,[h.grant_id]));await deny(release(db,v1,[randomUUID()]));
  });

  for(const classification of ['internal_note','draft_report','final_report','legal_dispute_sensitive','executive_document','invoice','signed_authorization']) await isolated(`class ${classification} cannot inherit routine synthetic release`,async()=>{
    const {recipient}=await prepared(db,v1,{release:false});await db.query('update public.documents set document_class=$1 where id=$2',[classification,doc]);
    await deny(release(db,v1,[recipient.grant_id]));await deny(grant(db,v2));assert.equal((await status(db,v1)).can_prepare_release,false);
  });

  await isolated('full intent retries preserve release receipt after unrelated advances and changed intent conflicts',async()=>{
    const {recipient}=await prepared(db,v1,{release:false});const key=randomUUID(),docRev=await docRevision(db),rev=await releaseRevision(db),review=await reviewRevision(db,v1);
    const r=await release(db,v1,[recipient.grant_id],{key,doc:docRev,rev,review});await grant(db,v1,'historical_recipient');await view(db,reviewer,'create_version',5);
    assert.deepEqual(await release(db,v1,[recipient.grant_id],{key,doc:docRev,rev,review}),r);
    for(const change of [{rev:rev+1},{doc:docRev+1},{review:review+1}]) await deny(release(db,v1,[recipient.grant_id],{key,doc:docRev,rev,review,...change}),'23505');
    const extra=await grant(db,v1,'current_recipient',reviewer);await deny(release(db,v1,[recipient.grant_id,extra.grant_id],{key,doc:docRev,rev,review}),'23505');
    await deny(current(db,reviewer));assert.equal((await one(db,'select count(*)::int n from private.document_releases')).n,1);
  });

  await isolated('CAS independently fences logical document, review, release authority, and digest changes',async()=>{
    const {recipient}=await prepared(db,v1,{release:false});
    for(const change of [{doc:4},{review:2},{rev:1},{sha:'b'.repeat(64)}]) await deny(release(db,v1,[recipient.grant_id],change),'40001');
    await deny(release(db,v1,[recipient.grant_id],{sha:'bad'}),'22023');
    const stale=await releaseRevision(db);await grant(db,v1,'historical_recipient');await deny(release(db,v1,[recipient.grant_id],{rev:stale}),'40001');
    await release(db,v1,[recipient.grant_id]);await deny(release(db,v1,[recipient.grant_id]),'55000');
  });

  await isolated('grant provisioning retries bind whole intent and revoked grants cannot restore current audience',async()=>{
    await approved(db,v1);await controller(db,v1);const key=randomUUID(),rev=await releaseRevision(db),g=await grant(db,v1,'current_recipient',reader,{key,rev});
    assert.equal((await grant(db,v1,'current_recipient',reader,{key,rev})).grant_id,g.grant_id);
    for(const args of [['historical_recipient',reader,{}],['current_recipient',reviewer,{}],['current_recipient',reader,{doc:6}],['current_recipient',reader,{rev:rev+1}]])
      await deny(grant(db,v1,args[0],args[1],{key,rev,...args[2]}),'23505');
    const r=await release(db,v1,[g.grant_id]);const retiring=await releaseRevision(db);await revoke(db,v1,g,retiring);await deny(current(db));
    await revoke(db,v1,g,retiring);const replacement=await grant(db,v1);assert.notEqual(replacement.grant_id,g.grant_id);await deny(current(db));
    assert.equal((await status(db,v1)).release_id,r.release_id);assert.equal((await grant(db,v1,'current_recipient',reader,{key,rev})).revoked,true);
  });

  await isolated('revoked or replacement controller cannot replay original release receipt',async()=>{
    const {assignment,recipient}=await prepared(db,v1,{release:false});const key=randomUUID(),rev=await releaseRevision(db);await release(db,v1,[recipient.grant_id],{key,rev});
    await revoke(db,v1,assignment,await releaseRevision(db));await deny(release(db,v1,[recipient.grant_id],{key,rev}));
    await controller(db,v1);await deny(release(db,v1,[recipient.grant_id],{key,rev}));assert.equal((await current(db)).version_id,v1.version_id);
  });

  await isolated('cross-account and wrong-facility users cannot provision, release or read even with forged claims',async()=>{
    const {recipient}=await prepared(db,v1);await deny(grant(db,v1,'current_recipient',outsider));
    await deny(release(db,v1,[recipient.grant_id],{profile:outsider,sha:'b'.repeat(64)}));await deny(current(db,outsider));
    await deny(as(db,'authenticated',()=>rpc(db,'current_document_release',[doc]),outsider,'authenticator',{role:'service_role',user_metadata:{role:'owner'},app_metadata:{is_admin:true}}),'28000');
    await db.query("update public.account_capability_grants set facility_id=$1 where user_profile_id=$2 and capability_key='view_asset'",[facilityA2,reader]);await deny(current(db));
  });

  for(const target of ['controller_identity','controller_membership','controller_content','recipient_identity','recipient_membership','recipient_facility','content_switch','reservation_switch','restricted','phi']) await isolated(`current authorization rechecks ${target} on release, read, and retry`,async()=>{
    const {recipient}=await prepared(db,v1,{release:false});const key=randomUUID(),rev=await releaseRevision(db);const r=await release(db,v1,[recipient.grant_id],{key,rev});
    if(target.endsWith('identity')) await db.query("update public.user_profiles set identity_status='suspended' where id=$1",[target.startsWith('controller')?author:reader]);
    if(target.endsWith('membership')) await db.query("update public.account_access set membership_status='suspended' where account_id=$1 and user_profile_id=$2",[account,target.startsWith('controller')?author:reader]);
    if(target==='controller_content') await service(db,()=>rpc(db,'revoke_document_content_grant',[v1.version_id,authorContent.grant_id,2]));
    if(target==='recipient_facility') await db.query("update public.account_capability_grants set revoked_at=clock_timestamp() where user_profile_id=$1 and capability_key='view_asset'",[reader]);
    if(target==='content_switch') await db.exec('update private.document_content_config set enabled=false');
    if(target==='reservation_switch') await db.exec('update private.private_object_reservation_config set enabled=false');
    if(target==='restricted') await controls(db,v1,{restricted:true});
    if(target==='phi') {
      // Controlled trusted-state probe: no live scanner/provider claim.
      await db.exec(`create function private.test_record_phi_state(p_object uuid) returns void language sql security definer set search_path='' as $$
        update private.private_object_security set security_revision=security_revision+1,phi_suspected=true where object_id=p_object
      $$;grant execute on function private.test_record_phi_state(uuid) to service_role;`);
      await service(db,()=>db.query('select private.test_record_phi_state($1)',[v1.object_id]));
    }
    await deny(release(db,v1,[recipient.grant_id],{key,rev}));
    if(!target.startsWith('controller')) await deny(current(db));else assert.equal((await current(db)).release_id,r.release_id);
  });

  await isolated('preservation hold leaves eligible current and historical metadata visible and never deletes bytes',async()=>{
    const first=await prepared(db,v1);await controls(db,v1,{hold:true});assert.equal((await current(db)).release_id,first.result.release_id);
    await prepared(db,v2);await grant(db,v1,'historical_recipient');assert.equal((await historical(db,v1)).version_id,v1.version_id);
    await withdraw(db,first.result,{operator:true});await deny(historical(db,v1));
    assert.equal((await one(db,'select preservation_hold value from private.private_object_security where object_id=$1',[v1.object_id])).value,true);
    assert.equal((await one(db,'select count(*)::int n from private.document_versions where id=$1',[v1.version_id])).n,1);
  });

  await isolated('human withdrawal narrows current visibility, retains immutable history, and never revives previous release',async()=>{
    const first=await prepared(db,v1);const next=await prepared(db,v2);await grant(db,v1,'historical_recipient');
    const before=await domainSnapshot(db),key=randomUUID(),rev=await releaseRevision(db);const w=await withdraw(db,next.result,{key,rev});
    assert.equal(w.withdrawn,true);await deny(current(db));assert.equal((await status(db,v2)).release_state,'withdrawn');assert.equal((await status(db,v1)).release_state,'superseded');
    assert.equal((await historical(db,v1)).release_id,first.result.release_id);await deny(historical(db,v2));assert.deepEqual(await domainSnapshot(db),before);
    assert.deepEqual(await withdraw(db,next.result,{key,rev}),w);await deny(withdraw(db,next.result,{key,rev,reason:'audience_change'}),'23505');
    await deny(withdraw(db,next.result),'55000');assert.equal((await one(db,'select current_release_id from private.document_release_heads where document_id=$1',[doc])).current_release_id,null);
  });

  await isolated('human withdrawal remains narrowing after content retirement and visibility restriction',async()=>{
    const {result}=await prepared(db,v1);await service(db,()=>rpc(db,'revoke_document_content_grant',[v1.version_id,authorContent.grant_id,2]));
    await controls(db,v1,{restricted:true});const w=await withdraw(db,result,{reason:'security_concern'});assert.equal(w.withdrawn,true);
    const event=await one(db,"select * from public.audit_events where event_type='document_withdrawn'");assert.equal(event.actor_kind,'user');assert.equal(event.actor_auth_user_id,subjects.get(author));
    assert.equal((await one(db,'select current_release_id from private.document_release_heads where document_id=$1',[doc])).current_release_id,null);
  });

  await isolated('withdrawal requires explicit active controller; stale and wrong actor cannot remove a release',async()=>{
    const {result,assignment}=await prepared(db,v1);await deny(withdraw(db,result,{profile:reviewer}));await deny(withdraw(db,result,{profile:reader}));await deny(withdraw(db,result,{profile:outsider}));
    await deny(withdraw(db,result,{rev:0}),'40001');await revoke(db,v1,assignment,await releaseRevision(db));await deny(withdraw(db,result));
    assert.equal((await current(db)).release_id,result.release_id);
  });

  await isolated('trusted narrowing withdrawal and revocation survive all switches, access and safety removal',async()=>{
    const {result,assignment,recipient}=await prepared(db,v1);await controls(db,v1,{restricted:true,hold:true});
    await db.query("update public.account_access set membership_status='removed' where account_id=$1 and user_profile_id in ($2,$3)",[account,author,reader]);
    await db.exec('update private.document_content_config set enabled=false;update private.private_object_reservation_config set enabled=false');
    await deny(withdraw(db,result));const rev=await releaseRevision(db),key=randomUUID();const w=await withdraw(db,result,{operator:true,rev,key,reason:'security_concern'});
    assert.deepEqual(await withdraw(db,result,{operator:true,rev,key,reason:'security_concern'}),w);
    await revoke(db,v1,assignment,await releaseRevision(db));await revoke(db,v1,recipient,await releaseRevision(db));
    const event=await one(db,"select * from public.audit_events where event_type='document_withdrawn'");assert.equal(event.actor_kind,'system');assert.equal(event.actor_auth_user_id,null);
    assert.equal((await one(db,'select count(*)::int n from private.document_releases')).n,1);assert.equal((await one(db,'select current_release_id from private.document_release_heads where document_id=$1',[doc])).current_release_id,null);
  });

  await isolated('withdrawn version or older ordinal cannot be released again and a new version starts without automatic fallback',async()=>{
    await approved(db,v1);await controller(db,v1);const earlier=await grant(db,v1);const second=await prepared(db,v2);await withdraw(db,second.result);
    await deny(release(db,v1,[earlier.grant_id]),'55000');await deny(release(db,v2,[second.recipient.grant_id]),'55000');await deny(current(db));
    const v3=await adopted(db,await docRevision(db));await content(db,v3,author);await content(db,v3,reviewer,1);const third=await prepared(db,v3);
    assert.equal(third.result.previous_release_id,null);assert.equal((await current(db)).version_id,v3.version_id);
  });

  await isolated('withdrawal of superseded history leaves current release intact',async()=>{
    const first=await prepared(db,v1);const next=await prepared(db,v2);await grant(db,v1,'historical_recipient');
    await withdraw(db,first.result);await deny(historical(db,v1));assert.equal((await current(db)).release_id,next.result.release_id);
  });

  await isolated('audit failures roll back release head and authoritative history atomically',async()=>{
    const {recipient}=await prepared(db,v1,{release:false});const rev=await releaseRevision(db),before=await domainSnapshot(db);
    await db.exec("alter table public.audit_events add constraint test_reject_release check(event_type<>'document_released')");
    await deny(release(db,v1,[recipient.grant_id]),'23514');assert.equal(await releaseRevision(db),rev);assert.equal((await one(db,'select count(*)::int n from private.document_releases')).n,0);
    assert.equal((await one(db,'select current_release_id from private.document_release_heads where document_id=$1',[doc])).current_release_id,null);assert.deepEqual(await domainSnapshot(db),before);
  });

  await isolated('immutable release, withdrawal, grants, heads, and audit reject owner-level history edits and deletion',async()=>{
    const {result,assignment}=await prepared(db,v1);await withdraw(db,result);await revoke(db,v1,assignment,await releaseRevision(db));
    await ownerDeny(db,"update private.document_releases set recipient_grant_ids=array[]::uuid[]");await ownerDeny(db,"update private.document_release_withdrawals set reason_code='audience_change'");
    await ownerDeny(db,'update private.document_release_grants set revoked_at=null,revoked_from_revision=null where id=$1',[assignment.grant_id],'28000');
    await ownerDeny(db,'update private.document_release_heads set release_revision=release_revision+1',[],'28000');
    for(const table of ['document_releases','document_release_withdrawals','document_release_grants']){await ownerDeny(db,`delete from private.${table}`);await ownerDeny(db,`truncate private.${table} cascade`);}
    await ownerDeny(db,'delete from private.document_release_heads');await ownerDeny(db,'truncate private.document_release_heads');
  });

  await isolated('forged public provenance and stale backend roles do not become human authority',async()=>{
    const {recipient}=await prepared(db,v1,{release:false});
    const args=[v1.version_id,digest,5,3,2,[recipient.grant_id],randomUUID(),'released_exact_synthetic_version'];
    await deny(as(db,'authenticated',()=>rpc(db,'release_document_version',args),author,'postgres'),'28000');
    await deny(as(db,'authenticated',()=>rpc(db,'release_document_version',args),author,'authenticator',{is_anonymous:true}),'28000');
    await deny(service(db,()=>rpc(db,'release_document_version',args)));
    await deny(user(db,()=>rpc(db,'retire_document_release',[randomUUID(),0,randomUUID(),'release_error'])));
    await deny(user(db,()=>db.query('select private.withdraw_document_release($1,0,$2,$3,true)',[randomUUID(),randomUUID(),'release_error'])),'28000');
  });

  await isolated('default-deny tables and exact function ACLs retain service/human separation with no exposed definer',async()=>{
    await prepared(db,v1);
    for(const table of ['document_release_heads','document_release_grants','document_releases','document_release_withdrawals']) {
      assert.equal((await one(db,'select relrowsecurity value from pg_class where oid=$1::regclass',[`private.${table}`])).value,true);
      for(const role of ['anon','authenticated','service_role']) assert.equal((await one(db,'select has_table_privilege($1,$2,$3) value',[role,`private.${table}`,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'])).value,false);
      await db.exec(`grant select on private.${table} to authenticated`);assert.deepEqual((await user(db,()=>db.query(`select * from private.${table}`))).rows,[]);
    }
    const fns=(await db.query(`select n.nspname schema,p.proname name,p.prosecdef definer,p.proconfig,
      has_function_privilege('anon',p.oid,'execute') anon,has_function_privilege('authenticated',p.oid,'execute') human,
      has_function_privilege('service_role',p.oid,'execute') service from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in ('provision_document_release_grant','revoke_document_release_grant','release_document_version','withdraw_document_release','retire_document_release','document_version_release_status','current_document_release','historical_document_release','document_release_audience_options')`)).rows;
    assert.equal(fns.length,9);
    for(const f of fns){const technical=/^(provision|revoke|retire)_/.test(f.name);assert.equal(f.anon,false);assert.equal(f.human,!technical);assert.equal(f.service,technical);assert.equal(f.definer,false);assert.ok(f.proconfig.includes('search_path=""'));}
    const helpers=(await db.query("select p.proname,has_function_privilege('authenticated',p.oid,'execute') human,has_function_privilege('service_role',p.oid,'execute') service from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in ('lock_document_release_scope','lock_document_release_context','lock_document_release_head','guard_document_release_history','audit_document_release_change','normalize_document_release_audience')")).rows;
    assert.equal(helpers.length,6);for(const f of helpers){assert.equal(f.human,false);assert.equal(f.service,false);}
  });
});
