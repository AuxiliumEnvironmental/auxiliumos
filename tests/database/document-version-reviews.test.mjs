import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import test from 'node:test';
import { createTestDatabase, runSqlFile, setSimulatedSubject } from '../helpers/pglite-database.mjs';

const migrationName='20261009172736_document_version_reviews.sql';
const uuid=n=>`60000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
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
  'request_document_version_review','decide_document_version_review','document_version_review_status']);
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
const assign=(db,v,options={})=>{
  const o={profile:reviewer,key:randomUUID(),doc:6,rev:0,sha:digest,basis:'synthetic_fixture',...options};
  return service(db,()=>rpc(db,'provision_document_review_assignment',[v.version_id,o.sha,o.profile,o.key,o.doc,o.rev,o.basis]));
};
const request=(db,v,options={})=>{
  const o={profile:author,key:randomUUID(),doc:6,rev:0,sha:digest,...options};
  return user(db,()=>rpc(db,'request_document_version_review',[v.version_id,o.sha,o.doc,o.rev,o.key]),o.profile);
};
const decide=(db,r,options={})=>{
  const o={profile:reviewer,key:randomUUID(),doc:6,rev:2,sha:digest,decision:'approved_internal',attestation:'reviewed_exact_synthetic_version',...options};
  return user(db,()=>rpc(db,'decide_document_version_review',[r.review_request_id,o.sha,o.doc,o.rev,o.key,o.decision,o.attestation]),o.profile);
};
const status=(db,v,profile=author,sha=digest)=>user(db,()=>rpc(db,'document_version_review_status',[v.version_id,sha]),profile);
const retire=(db,v,g,revision)=>service(db,()=>rpc(db,'revoke_document_review_assignment',[v.version_id,g.assignment_id,revision]));
const controls=(db,v,{restricted=false,hold=false}={})=>service(db,()=>rpc(db,'set_private_object_controls',[v.object_id,v.security_revision,restricted,hold,true]));
async function prepared(db,v) {const g=await assign(db,v);const r=await request(db,v,{rev:1});return {g,r};}
async function domainSnapshot(db) {
  const result={};
  for(const table of ['public.documents','private.document_versions','private.document_version_heads','public.account_capability_grants',
    'public.account_access','public.user_profiles','private.document_content_grants','private.private_object_security'])
    result[table]=(await one(db,`select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) rows from ${table} t`)).rows;
  return result;
}

test('exact-version human internal review — PostgreSQL/PGlite simulated Auth, not hosted or concurrent-session proof',async t=>{
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
  await db.exec('update private.private_object_reservation_config set enabled=true;update private.document_content_config set enabled=true;begin');
  await view(db);await view(db,author,'create_version',1);await view(db,reviewer,'view_versions',2);await view(db,reader,'view_versions',3);
  const v1=await adopted(db,4),v2=await adopted(db,5);
  const reviewContent=await content(db,v1),readerContent=await content(db,v1,reader,1);await content(db,v1,author,2);await content(db,v2,reviewer);
  await db.exec('commit');assert.equal(await docRevision(db),6);
  const isolated=(name,body)=>t.test(name,async()=>{await db.exec('begin');try{await body();}finally{await db.exec('rollback;reset role;set session authorization postgres');}});

  await isolated('request then explicit assignment then decision preserves exact bytes, actor audit and existing domain state',async()=>{
    const before=await domainSnapshot(db);
    const initial=await status(db,v1);assert.equal(initial.can_request,true);assert.equal(initial.can_decide,false);assert.equal(initial.review_revision,0);
    const r=await request(db,v1);assert.equal(r.review_revision,1);assert.equal(r.state,'under_review');assert.equal(r.document_revision,6);
    assert.equal((await status(db,v1,reviewer)).can_decide,false);
    const g=await assign(db,v1,{rev:1});assert.equal(g.qualification_basis,'synthetic_fixture');assert.equal(g.review_revision,2);
    assert.equal((await status(db,v1,reviewer)).can_decide,true);
    const d=await decide(db,r);assert.equal(d.assignment_id,g.assignment_id);assert.equal(d.decision,'approved_internal');assert.equal(d.review_revision,3);
    assert.equal(d.verified_sha256,digest);assert.equal(d.attestation_code,'reviewed_exact_synthetic_version');
    const after=await status(db,v1,reviewer);assert.equal(after.historical_review_state,'approved_internal');assert.equal(after.can_decide,false);assert.equal(after.can_request,false);assert.equal(after.release_authorized,false);
    assert.deepEqual(await domainSnapshot(db),before);
    const events=(await db.query("select * from public.audit_events where object_type like 'document_review_%' order by event_metadata->>'review_revision'")).rows;
    assert.deepEqual(events.map(e=>e.event_type),['document_review_requested','document_review_assignment_created','document_review_decided']);
    const [requested,assignment,decided]=events;
    assert.equal(requested.actor_kind,'user');assert.equal(requested.actor_auth_user_id,subjects.get(author));assert.equal(requested.actor_user_profile_id,author);
    assert.equal(assignment.actor_kind,'system');assert.equal(assignment.actor_auth_user_id,null);assert.equal(assignment.actor_user_profile_id,null);assert.equal(assignment.actor_system_key,'database_privileged_operation');
    assert.equal(decided.actor_kind,'user');assert.equal(decided.actor_auth_user_id,subjects.get(reviewer));assert.equal(decided.actor_user_profile_id,reviewer);
    for(const event of events){assert.equal(event.is_demo,true);assert.equal(event.is_internal_only,true);assert.equal(event.event_metadata.version_id,v1.version_id);assert.equal(event.event_metadata.verified_sha256,digest);}
  });

  await isolated('requester needs create, decider needs exact assignment and content; roles and security clearance confer neither',async()=>{
    const r=await request(db,v1);
    await deny(request(db,v2,{profile:reviewer}));await deny(request(db,v2,{profile:reader}));
    await deny(decide(db,r,{rev:1,profile:author}));await deny(decide(db,r,{rev:1,profile:reviewer}));await deny(decide(db,r,{rev:1,profile:reader}));
    assert.equal((await one(db,"select count(*)::int n from public.account_memberships where user_profile_id=$1 and role_key='system_admin'",[author])).n,1);
    assert.ok((await one(db,"select count(*)::int n from private.private_object_clearance_decisions where reviewer_profile_id=$1",[reviewer])).n>0);
    await assign(db,v1,{rev:1});assert.equal((await decide(db,r)).decision,'approved_internal');
  });

  await isolated('same fixture person requires explicit assignment without inventing a self-review or qualification claim',async()=>{
    const g=await assign(db,v1,{profile:author});const r=await request(db,v1,{rev:1});
    const d=await decide(db,r,{profile:author});assert.equal(d.assignment_id,g.assignment_id);assert.equal(d.decision,'approved_internal');
    assert.equal((await status(db,v1)).release_authorized,false);
  });

  await isolated('full-intent retries reauthorize but return preserved human receipts after unrelated CAS advances',async()=>{
    const assignmentKey=randomUUID(),requestKey=randomUUID(),decisionKey=randomUUID();
    const g=await assign(db,v1,{key:assignmentKey});const r=await request(db,v1,{rev:1,key:requestKey});
    assert.deepEqual(await request(db,v1,{rev:1,key:requestKey}),r);
    assert.equal((await assign(db,v1,{key:assignmentKey})).assignment_id,g.assignment_id);
    await view(db,reader,'create_version',6);
    await deny(decide(db,r),'40001');const d=await decide(db,r,{doc:7,key:decisionKey});
    await assign(db,v1,{profile:reader,doc:7,rev:3});await view(db,reviewer,'create_version',7);
    assert.deepEqual(await request(db,v1,{rev:1,key:requestKey}),r);assert.deepEqual(await decide(db,r,{doc:7,key:decisionKey}),d);
    assert.equal((await status(db,v1)).document_revision,8);assert.equal((await status(db,v1)).review_revision,4);
    assert.equal((await one(db,'select count(*)::int n from private.document_review_requests')).n,1);
    assert.equal((await one(db,'select count(*)::int n from private.document_review_decisions')).n,1);
  });

  await isolated('changed idempotent tuples conflict; exact current digest and both CAS values are independently required',async()=>{
    const key=randomUUID(),g=await assign(db,v1,{key});
    await deny(assign(db,v1,{key,profile:reader}),'23505');await deny(assign(db,v1,{key,doc:7}),'23505');await deny(assign(db,v1,{key,rev:1}),'23505');
    await deny(request(db,v1),'40001');await deny(request(db,v1,{rev:1,doc:5}),'40001');await deny(request(db,v1,{rev:1,sha:'b'.repeat(64)}),'40001');
    const requestKey=randomUUID(),r=await request(db,v1,{rev:1,key:requestKey});
    await deny(request(db,v1,{rev:2,key:requestKey}),'23505');await deny(request(db,v2,{key:requestKey}),'23505');
    const decisionKey=randomUUID(),d=await decide(db,r,{key:decisionKey});
    await deny(decide(db,r,{key:decisionKey,decision:'rejected'}),'23505');await deny(decide(db,r,{key:decisionKey,rev:3}),'23505');
    await deny(decide(db,r,{key:decisionKey,doc:7}),'23505');await deny(decide(db,r,{rev:2}),'40001');await deny(decide(db,r,{rev:3}),'55000');
    await deny(request(db,v1,{rev:3}),'55000');assert.equal((await status(db,v1)).decision.decision_id,d.decision_id);
    assert.equal(g.revoked,false);
  });

  for(const decision of ['changes_requested','rejected']) await isolated(`${decision} is immutable; another request needs a new immutable version`,async()=>{
    const {r}=await prepared(db,v1);const d=await decide(db,r,{decision});assert.equal(d.decision,decision);
    await deny(request(db,v1,{rev:3}),'55000');await deny(decide(db,r,{rev:3,decision:'approved_internal'}),'55000');
    const otherRequest=await request(db,v2);assert.notEqual(otherRequest.version_id,r.version_id);
    await deny(decide(db,otherRequest,{rev:1}));await assign(db,v2,{rev:1});assert.equal((await decide(db,otherRequest)).decision,'approved_internal');
    assert.equal((await status(db,v1)).historical_review_state,decision);
  });

  await isolated('same digest replacement has no inherited assignment, review record or released pointer change',async()=>{
    const {r}=await prepared(db,v1);await decide(db,r);
    const before=await one(db,'select to_jsonb(d) row from public.documents d where id=$1',[doc]);
    const otherStatus=await status(db,v2,reviewer);assert.equal(otherStatus.historical_review_state,'internal_draft');assert.equal(otherStatus.review_revision,0);assert.equal(otherStatus.can_decide,false);
    const r2=await request(db,v2);await deny(decide(db,r2,{rev:1}));assert.deepEqual(await one(db,'select to_jsonb(d) row from public.documents d where id=$1',[doc]),before);
    assert.equal((await one(db,'select next_version_ordinal from private.document_version_heads where document_id=$1',[doc])).next_version_ordinal,3);
  });

  for(const [label,sql,args] of [
    ['identity',"update public.user_profiles set identity_status='suspended' where id=$1",[reviewer]],
    ['removed identity',"update public.user_profiles set identity_status='removed' where id=$1",[reviewer]],
    ['Auth unlink','update public.user_profiles set auth_user_id=null where id=$1',[reviewer]],
    ['membership',"update public.account_access set membership_status='suspended' where account_id=$1 and user_profile_id=$2",[account,reviewer]],
    ['account grant',"update public.account_capability_grants set revoked_at=now() where account_id=$1 and user_profile_id=$2 and capability_key='view_account'",[account,reviewer]],
    ['facility grant',"update public.account_capability_grants set revoked_at=now() where account_id=$1 and user_profile_id=$2 and capability_key='view_asset'",[account,reviewer]],
    ['profile demo','update public.user_profiles set is_demo=false where id=$1',[reviewer]],
    ['membership demo','update public.account_access set is_demo=false where account_id=$1 and user_profile_id=$2',[account,reviewer]],
    ['account demo','update public.client_accounts set is_demo=false where id=$1',[account]],
    ['facility demo','update public.facilities set is_demo=false where id=$1',[facility]],
  ]) await isolated(`current reviewer ${label} removal denies fresh decision, exact retry and metadata status`,async()=>{
    const {r}=await prepared(db,v1),key=randomUUID();await decide(db,r,{key});await db.query(sql,args);
    await deny(decide(db,r,{key}));await deny(decide(db,r,{rev:3}));await deny(status(db,v1,reviewer));await deny(assign(db,v1,{rev:3}));
    assert.equal((await one(db,'select count(*)::int n from private.document_review_decisions')).n,1);
  });

  await isolated('exact content revocation preserves history but removes decision authority and current UI flag',async()=>{
    const {r}=await prepared(db,v1);assert.equal((await status(db,v1,reviewer)).can_decide,true);
    await service(db,()=>rpc(db,'revoke_document_content_grant',[v1.version_id,reviewContent.grant_id,3]));
    await deny(decide(db,r));assert.equal((await status(db,v1,reviewer)).can_decide,false);
    await deny(assign(db,v1,{profile:reviewer,rev:2}));
    assert.equal((await status(db,v1)).historical_review_state,'under_review');assert.equal(readerContent.revoked,false);
  });

  await isolated('logical grant revocation denies current review and a new grant never restores the old assignment',async()=>{
    const {g,r}=await prepared(db,v1),key=randomUUID();const d=await decide(db,r,{key});
    await retire(db,v1,g,3);await deny(decide(db,r,{key}));assert.equal((await status(db,v1,reviewer)).historical_review_state,'approved_internal');
    const g2=await assign(db,v1,{rev:4});assert.notEqual(g.assignment_id,g2.assignment_id);await deny(decide(db,r,{key}));
    assert.equal((await status(db,v1,reviewer)).decision.decision_id,d.decision_id);
    const meta=await one(db,"select id from private.document_version_grants where document_id=$1 and user_profile_id=$2 and capability_key='view_versions' and revoked_at is null",[doc,reviewer]);
    await service(db,()=>rpc(db,'revoke_document_version_grant',[doc,meta.id,6]));await deny(status(db,v1,reviewer));await deny(decide(db,r,{key}));
  });

  await isolated('requester create grant and membership are rechecked on exact retries',async()=>{
    const key=randomUUID(),r=await request(db,v1,{key});
    const createGrant=await one(db,"select id from private.document_version_grants where document_id=$1 and user_profile_id=$2 and capability_key='create_version'",[doc,author]);
    await service(db,()=>rpc(db,'revoke_document_version_grant',[doc,createGrant.id,6]));
    await deny(request(db,v1,{key}));assert.equal((await status(db,v1)).can_request,false);
    assert.equal((await status(db,v1)).request.review_request_id,r.review_request_id);
    await db.query("update public.account_access set membership_status='removed' where account_id=$1 and user_profile_id=$2",[account,author]);
    await deny(request(db,v1,{key}));await deny(status(db,v1));
  });

  await isolated('assignment retirement is CAS/idempotent and works after recipient and both gates are disabled',async()=>{
    const g=await assign(db,v1);await deny(retire(db,v1,g,0),'40001');
    await db.query("update public.account_access set membership_status='suspended' where account_id=$1 and user_profile_id=$2",[account,reviewer]);
    await db.exec('update private.document_content_config set enabled=false;update private.private_object_reservation_config set enabled=false');
    const result=await retire(db,v1,g,1);assert.equal(result.revoked,true);assert.equal(result.review_revision,2);assert.deepEqual(await retire(db,v1,g,1),result);
    await deny(retire(db,v1,g,2),'55000');
    const events=(await db.query("select actor_kind,actor_auth_user_id,actor_user_profile_id from public.audit_events where object_id=$1 and event_type='document_review_assignment_revoked'",[g.assignment_id])).rows;
    assert.deepEqual(events,[{actor_kind:'system',actor_auth_user_id:null,actor_user_profile_id:null}]);
  });

  for(const gate of ['private.document_content_config','private.private_object_reservation_config']) await isolated(`${gate} disables status, new review and successful-operation retries`,async()=>{
    const {r}=await prepared(db,v1),key=randomUUID();await decide(db,r,{key});await db.exec(`update ${gate} set enabled=false`);
    await deny(status(db,v1));await deny(decide(db,r,{key}));await deny(request(db,v2));await deny(assign(db,v2));
  });

  await isolated('current visibility restriction blocks review but a preservation hold alone does not',async()=>{
    const {r}=await prepared(db,v1);const held=await controls(db,v1,{hold:true});
    assert.equal((await status(db,v1,reviewer)).can_decide,true);assert.equal((await decide(db,r)).decision,'approved_internal');
    await service(db,()=>rpc(db,'set_private_object_controls',[v1.object_id,held.security_revision,true,true,true]));
    await deny(status(db,v1));await deny(decide(db,r));await deny(assign(db,v1,{rev:3}));
    assert.equal((await one(db,'select preservation_hold from private.private_object_security where object_id=$1',[v1.object_id])).preservation_hold,true);
  });

  await isolated('foreign accounts, wrong facility entitlement and unknown objects have no review existence oracle',async()=>{
    const {r}=await prepared(db,v1);await deny(status(db,v1,outsider));await deny(request(db,v1,{profile:outsider}));await deny(decide(db,r,{profile:outsider}));await deny(assign(db,v1,{profile:outsider,rev:2}));
    await deny(status(db,{version_id:randomUUID()},outsider));await deny(decide(db,{review_request_id:randomUUID()},{profile:outsider}));
    await db.query("update public.account_capability_grants set revoked_at=now() where account_id=$1 and user_profile_id=$2 and capability_key='view_asset'",[account,reviewer]);
    await db.query("insert into public.account_capability_grants(account_id,user_profile_id,capability_key,scope_kind,facility_id) values($1,$2,'view_asset','facility',$3)",[account,reviewer,facilityA2]);
    await deny(decide(db,r));await deny(status(db,v1,reviewer));
  });

  for(const [label,patch,code] of [
    ['anonymous role',{role:'anon'},'42501'],['service is not a human',{role:'service_role'},'42501'],
    ['operator claim spoofing',{session:'postgres'},'28000'],['anonymous Auth',{claims:{is_anonymous:true}},'28000'],
    ['missing anonymous proof',{claims:{is_anonymous:null}},'28000'],['mismatched subject',{claims:{sub:subjects.get(author)}},'28000'],
  ]) await isolated(`${label} cannot submit a human decision`,async()=>{
    const {r}=await prepared(db,v1);
    await deny(as(db,patch.role??'authenticated',()=>rpc(db,'decide_document_version_review',[r.review_request_id,digest,6,2,randomUUID(),'approved_internal','reviewed_exact_synthetic_version']),reviewer,patch.session??'authenticator',patch.claims??{}),code);
  });

  await isolated('typed attestation and qualification boundaries reject missing, real-world and release claims',async()=>{
    await deny(assign(db,v1,{basis:null}),'22023');await deny(assign(db,v1,{basis:'licensed_professional'}),'22023');
    const {r}=await prepared(db,v1);
    for(const patch of [{attestation:null},{attestation:'approved_real_scientific_conclusions'},{decision:'client_visible_released'},
      {decision:null},{key:null},{doc:-1},{rev:-1}]) await deny(decide(db,r,patch),'22023');
    await deny(status(db,v1,reviewer,'b'.repeat(64)),'40001');assert.equal((await reviewRevision(db,v1)),2);
  });

  await isolated('immutable history, server provenance and protected audit roll back direct tampering',async()=>{
    const {g,r}=await prepared(db,v1);await decide(db,r);
    for(const table of ['document_review_requests','document_review_decisions']) {
      await ownerDeny(db,`update private.${table} set verified_sha256=$1`,['b'.repeat(64)]);
      await ownerDeny(db,`delete from private.${table}`);await ownerDeny(db,`truncate private.${table} cascade`);
    }
    await ownerDeny(db,'delete from private.document_review_assignments');await ownerDeny(db,'truncate private.document_review_heads cascade');
    await ownerDeny(db,'update private.document_review_assignments set qualification_basis=$1 where id=$2',['changed',g.assignment_id],'28000');
    await retire(db,v1,g,3);
    await deny(service(db,()=>db.query('update private.document_review_assignments set revoked_at=null where id=$1',[g.assignment_id])));
    await ownerDeny(db,'insert into private.document_review_requests(version_id,verified_sha256,request_id,expected_document_revision,expected_review_revision) values($1,$2,$3,6,0)',[v2.version_id,digest,randomUUID()],'28000');
    await ownerDeny(db,"update public.audit_events set event_metadata='{}' where object_type like 'document_review_%'");
    assert.equal((await status(db,v1)).historical_review_state,'approved_internal');
  });

  await isolated('audit failure atomically rolls back decision, review revision and every side effect',async()=>{
    const {r}=await prepared(db,v1);const before=await domainSnapshot(db);
    await db.exec("alter table public.audit_events add constraint test_reject_review_decision check(event_type<>'document_review_decided')");
    await deny(decide(db,r),'23514');assert.equal(await reviewRevision(db,v1),2);
    assert.equal((await one(db,'select count(*)::int n from private.document_review_decisions')).n,0);
    assert.deepEqual(await domainSnapshot(db),before);
  });

  await isolated('default-deny tables and exact function ACLs retain service/human separation',async()=>{
    const {r}=await prepared(db,v1);await decide(db,r);
    for(const table of ['document_review_heads','document_review_assignments','document_review_requests','document_review_decisions']) {
      assert.equal((await one(db,'select relrowsecurity value from pg_class where oid=$1::regclass',[`private.${table}`])).value,true);
      for(const role of ['anon','authenticated','service_role']) assert.equal((await one(db,'select has_table_privilege($1,$2,$3) value',[role,`private.${table}`,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'])).value,false);
      await db.exec(`grant select on private.${table} to authenticated`);assert.deepEqual((await user(db,()=>db.query(`select * from private.${table}`))).rows,[]);
    }
    const fns=(await db.query(`select n.nspname schema,p.proname name,p.prosecdef definer,p.proconfig,
      has_function_privilege('anon',p.oid,'execute') anon,has_function_privilege('authenticated',p.oid,'execute') human,
      has_function_privilege('service_role',p.oid,'execute') service from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where p.proname in ('provision_document_review_assignment','revoke_document_review_assignment','request_document_version_review','decide_document_version_review','document_version_review_status')`)).rows;
    assert.equal(fns.length,10);
    for(const f of fns) {const technical=/^(provision|revoke)_/.test(f.name);assert.equal(f.anon,false);assert.equal(f.human,!technical);assert.equal(f.service,technical);assert.equal(f.definer,f.schema==='private');assert.ok(f.proconfig.includes('search_path=""'));}
    await deny(user(db,()=>rpc(db,'provision_document_review_assignment',[v2.version_id,digest,reviewer,randomUUID(),6,0,'synthetic_fixture'])));
    await deny(as(db,'service_role',()=>rpc(db,'provision_document_review_assignment',[v2.version_id,digest,reviewer,randomUUID(),6,0,'synthetic_fixture']),null,'postgres'),'28000');
  });
});
