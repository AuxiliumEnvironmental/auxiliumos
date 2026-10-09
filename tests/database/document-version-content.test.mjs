import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { createTestDatabase, runSqlFile, setSimulatedSubject, foundationSeedUrl } from '../helpers/pglite-database.mjs';

const uuid=n=>`40000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const account='00000000-0000-4000-8000-000000000001',facility='00000000-0000-4000-8000-000000000301';
const uploader='00000000-0000-4000-8000-000000000101',reviewer='00000000-0000-4000-8000-000000000103',reader='00000000-0000-4000-8000-000000000106';
const doc='00000000-0000-4000-8000-000000000501',accountB=uuid(20),facilityB=uuid(21),facilityA2=uuid(22),other=uuid(30);
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
const names=new Set(['provision_document_version_grant','adopt_private_object','list_document_versions','provision_private_object_grant',
  'claim_private_object_scan','record_private_object_scan','decide_private_object_clearance','report_private_object_phi','set_private_object_controls','private_object_security_status',
  'provision_document_content_grant','revoke_document_content_grant','authorize_document_version_content','record_document_content_result','record_document_content_denial']);
async function rpc(db,name,args) {assert.ok(names.has(name));return (await one(db,`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) result`,args)).result;}
const view=(db,profile=uploader,cap='view_versions',rev=0,key=randomUUID())=>service(db,()=>rpc(db,'provision_document_version_grant',[doc,profile,cap,key,rev]));
const grant=(db,v,profile=uploader,rev=0,key=randomUUID(),sha=digest)=>service(db,()=>rpc(db,'provision_document_content_grant',[v.version_id,sha,profile,key,rev]));
const authorize=(db,v,profile=uploader,key=randomUUID(),sha=digest)=>user(db,()=>rpc(db,'authorize_document_version_content',[v.version_id,sha,key]),profile);
const revoke=(db,v,g,rev)=>service(db,()=>rpc(db,'revoke_document_content_grant',[v.version_id,g.grant_id,rev]));
const result=(db,a,outcome)=>service(db,()=>rpc(db,'record_document_content_result',[a.authorization_id,outcome]));
const denial=(db,version=null,subject=null,reason='not_found_or_unavailable',key=randomUUID())=>service(db,()=>rpc(db,'record_document_content_denial',[key,version,subject,reason]));
const deny=(op,code='42501',message)=>assert.rejects(op,error=>{assert.equal(error.code,code,error.message);if(message)assert.equal(error.message,message);return true;});
async function ownerDeny(db,sql,args=[],code='55000') {
  await db.exec('savepoint owner_probe');try {await deny(db.query(sql,args),code);}finally {await db.exec('rollback to owner_probe; release owner_probe');}
}
async function finalized(db) {
  const r=await user(db,()=>one(db,"select * from public.reserve_private_object($1,$2,$3,40,'text/plain')",[account,facility,randomUUID()]));
  const a=await user(db,()=>one(db,'select * from public.claim_private_object_upload($1,1)',[r.object_id]));
  await service(db,()=>db.query('select public.bind_private_object_upload($1,$2,$3,40)',[r.object_id,a.attempt_id,digest]));
  const receipt=await service(db,()=>one(db,"select * from public.record_private_object_receipt($1,$2,$3,40,'text/plain')",[r.object_id,a.attempt_id,digest]));
  await user(db,()=>db.query('select public.finalize_private_object($1,$2,$3,$4)',[r.object_id,a.attempt_id,receipt.receipt_id,receipt.state_revision]));
  return r.object_id;
}
async function cleared(db) {
  const id=await finalized(db);
  const g=await service(db,()=>rpc(db,'provision_private_object_grant',[id,reviewer,'clear_object',randomUUID(),0]));
  const a=await service(db,()=>rpc(db,'claim_private_object_scan',[id,g.security_revision,randomUUID(),'synthetic_fixture','fixture-v1','rules-v1']));
  const o=await service(db,()=>rpc(db,'record_private_object_scan',[id,a.scan_attempt_id,digest,'pass','no_signal','synthetic_no_signal']));
  const c=await user(db,()=>rpc(db,'decide_private_object_clearance',[id,o.scan_observation_id,digest,o.security_revision,randomUUID(),'cleared_no_phi','reviewed_no_phi']),reviewer);
  return {id,g,a,o,c};
}
const adopt=(db,c,rev)=>user(db,()=>rpc(db,'adopt_private_object',[c.id,digest,doc,c.c.security_revision,rev,randomUUID()]));

test('exact-version content authority — PostgreSQL/PGlite simulated Auth, not hosted/API/concurrency proof',async(t)=>{
  const db=await createTestDatabase();t.after(()=>db.close());
  await db.exec(`create role authenticator nologin noinherit;grant anon,authenticated,service_role to authenticator;
    create schema storage;create table storage.buckets(id text primary key);create table storage.objects(id uuid primary key,bucket_id text,name text);
    alter table storage.buckets enable row level security;alter table storage.objects enable row level security;
    alter default privileges in schema private grant all on tables to public,anon,authenticated,service_role;
    alter default privileges in schema private grant execute on functions to public,anon,authenticated,service_role;
    alter default privileges in schema public grant execute on functions to public,anon,authenticated,service_role;`);
  const migrations=new URL('../../supabase/migrations/',import.meta.url);
  for(const name of (await readdir(migrations)).sort()) if(name>'20261008120645_identity_access_directory.sql'&&name<='20261009080505_document_version_content.sql') await runSqlFile(db,new URL(name,migrations));
  await db.query("insert into public.client_accounts(id,display_name) values($1,'Synthetic B')",[accountB]);
  await db.query("insert into public.facilities(id,account_id,display_name) values($1,$2,'Synthetic B1'),($3,$4,'Synthetic A2')",[facilityB,accountB,facilityA2,account]);
  await db.query("insert into public.user_profiles(id,display_name) values($1,'Synthetic external user')",[other]);
  for(const [profile,subject] of subjects) {
    const tenant=profile===other?accountB:account,asset=profile===other?facilityB:facility;
    await db.query('insert into auth.users(id) values($1)',[subject]);await db.query('update public.user_profiles set auth_user_id=$1 where id=$2',[subject,profile]);
    await db.query("update public.user_profiles set identity_status='active' where id=$1",[profile]);
    await db.query("insert into public.account_access(account_id,user_profile_id,membership_status) values($1,$2,'active') on conflict(account_id,user_profile_id) do update set membership_status='active'",[tenant,profile]);
    await db.query("insert into public.account_capability_grants(account_id,user_profile_id,capability_key,scope_kind,facility_id) values($1,$2,'view_account','account',null),($1,$2,'view_asset','facility',$3),($1,$2,'ingest_private_object','facility',$3)",[tenant,profile,asset]);
  }
  await db.exec('update private.private_object_reservation_config set enabled=true;begin');
  await view(db);await view(db,uploader,'create_version',1);const c1=await cleared(db),v1=await adopt(db,c1,2);
  const c2=await cleared(db),v2=await adopt(db,c2,3);await db.exec('commit');
  const isolated=(name,run)=>t.test(name,async()=>{await db.exec('begin');try{await run();}finally{await db.exec('rollback; reset role; set session authorization postgres');}});

  await isolated('separate synthetic content switch defaults disabled and all grants/authorizations deny',async()=>{
    assert.equal((await one(db,'select enabled from private.document_content_config')).enabled,false);
    await deny(grant(db,v1));await deny(authorize(db,v1),'42501','not_found_or_unavailable');
    assert.equal((await one(db,"select count(*)::int n from public.audit_events where event_type='document_content_config_created' and actor_kind='system'")).n,1);
  });
  await db.exec('update private.document_content_config set enabled=true');

  await isolated('service null-version preflight confirms both gates without creating any state',async()=>{
    const probe=()=>service(db,()=>rpc(db,'provision_document_content_grant',[null,digest,uploader,randomUUID(),0]));
    await deny(probe(),'22023');assert.equal((await one(db,'select count(*)::int n from private.document_content_heads')).n,0);
    await db.exec('update private.document_content_config set enabled=false');await deny(probe());
    await db.exec('update private.document_content_config set enabled=true;update private.private_object_reservation_config set enabled=false');await deny(probe());
    assert.equal((await one(db,'select count(*)::int n from private.document_content_grants')).n,0);
  });

  await isolated('exact grant returns immutable manifest binding and durable human authorization, not delivery',async()=>{
    const g=await grant(db,v1),key=randomUUID(),a=await authorize(db,v1,uploader,key);
    assert.deepEqual(Object.keys(a).sort(),['authorization_id','version_id','object_id','verified_sha256','byte_size','media_type','bucket_id','object_key'].sort());
    assert.equal(a.version_id,v1.version_id);assert.equal(a.object_id,c1.id);assert.equal(a.verified_sha256,digest);assert.equal(a.byte_size,40);assert.equal(a.media_type,'text/plain');
    assert.equal(a.bucket_id,'os-private-ingest');assert.equal(a.object_key,`${account}/${facility}/${c1.id}/payload`);
    assert.deepEqual(await authorize(db,v1,uploader,key),a);
    const rows=(await db.query("select * from public.audit_events where object_id=$1",[a.authorization_id])).rows;
    assert.equal(rows.length,1);assert.equal(rows[0].actor_kind,'user');assert.equal(rows[0].actor_user_profile_id,uploader);assert.equal(rows[0].actor_auth_user_id,subjects.get(uploader));
    assert.equal(rows[0].event_metadata.content_grant_id,g.grant_id);assert.equal(rows[0].event_metadata.meaning,'authorization_only');
    assert.equal((await one(db,'select count(*)::int n from private.document_content_results')).n,0);
    assert.equal((await one(db,'select document_revision from private.document_version_heads where document_id=$1',[doc])).document_revision,4);
  });
  await isolated('uploader, legacy admin, metadata and ingest grants do not imply content',async()=>{
    for(const profile of [uploader,reviewer,reader,other]) await deny(authorize(db,v1,profile),'42501','not_found_or_unavailable');
    assert.equal((await one(db,"select count(*)::int n from public.account_memberships where user_profile_id=$1 and role_key='system_admin'",[uploader])).n,1);
    await grant(db,v1,reader);await deny(authorize(db,v1,reader));
    await view(db,reader,'view_versions',4);assert.equal((await authorize(db,v1,reader)).version_id,v1.version_id);
    await deny(authorize(db,v2,reader));await deny(grant(db,v1,other,1));
  });
  await isolated('replacement drafts and wrong digest/version cannot inherit exact content grant',async()=>{
    await grant(db,v1);await deny(authorize(db,v2));await deny(authorize(db,{version_id:randomUUID()}));await deny(authorize(db,{version_id:c1.id}));
    await deny(authorize(db,v1,uploader,randomUUID(),'b'.repeat(64)));
    await grant(db,v2);assert.equal((await authorize(db,v2)).version_id,v2.version_id);
  });
  await isolated('request UUID binds verified subject plus immutable version/digest and is not a permit',async()=>{
    const g=await grant(db,v1),key=randomUUID(),a=await authorize(db,v1,uploader,key);
    await deny(authorize(db,v2,uploader,key),'23505');await deny(authorize(db,v1,uploader,key,'b'.repeat(64)),'23505');
    await revoke(db,v1,g,1);await deny(authorize(db,v1,uploader,key));await deny(authorize(db,v1));
    assert.equal((await one(db,'select count(*)::int n from private.document_content_authorizations')).n,1);
    assert.equal((await result(db,a,'access_changed')).outcome,'access_changed');
  });
  await isolated('per-version grant CAS, exact retry and immutable retirement are independent of document CAS',async()=>{
    const key=randomUUID(),g=await grant(db,v1,uploader,0,key);
    assert.deepEqual(await grant(db,v1,uploader,0,key),g);await deny(grant(db,v1,reader,0),'40001');
    await deny(grant(db,v1,reader,0,key),'23505');await deny(grant(db,v1,uploader,1,key),'23505');
    await deny(grant(db,v1,reader,1,randomUUID(),'b'.repeat(64)),'40001');
    assert.equal((await grant(db,v2)).content_revision,1);
    await deny(revoke(db,v1,g,0),'40001');const retired=await revoke(db,v1,g,1);
    assert.deepEqual(await revoke(db,v1,g,1),retired);assert.equal(retired.content_revision,2);assert.equal(retired.revoked,true);
    assert.equal((await grant(db,v1,uploader,0,key)).revoked,true);await deny(revoke(db,v1,g,2),'55000');
    const replacement=await grant(db,v1,uploader,2);assert.notEqual(replacement.grant_id,g.grant_id);assert.equal(replacement.content_revision,3);
  });

  for(const [label,sql,args] of [
    ['membership',"update public.account_access set membership_status='suspended' where account_id=$1 and user_profile_id=$2",[account,uploader]],
    ['profile',"update public.user_profiles set identity_status='suspended' where id=$1",[uploader]],
    ['Auth unlink','update public.user_profiles set auth_user_id=null where id=$1',[uploader]],
    ['account grant',"update public.account_capability_grants set revoked_at=now() where account_id=$1 and user_profile_id=$2 and capability_key='view_account'",[account,uploader]],
    ['facility grant',"update public.account_capability_grants set revoked_at=now() where account_id=$1 and user_profile_id=$2 and capability_key='view_asset'",[account,uploader]],
    ['facility synthetic scope','update public.facilities set is_demo=false where id=$1',[facility]],
    ['account synthetic scope','update public.client_accounts set is_demo=false where id=$1',[account]],
    ['document synthetic scope','update public.documents set is_demo=false where id=$1',[doc]],
    ['content switch','update private.document_content_config set enabled=false',[]],
    ['ingest security switch','update private.private_object_reservation_config set enabled=false',[]],
  ]) await isolated(`current ${label} revocation denies unchanged simulated subject with retained roles`,async()=>{
    await grant(db,v1);const key=randomUUID();await authorize(db,v1,uploader,key);await db.query(sql,args);
    await deny(authorize(db,v1,uploader,key),'42501','not_found_or_unavailable');await deny(authorize(db,v1));
  });

  await isolated('logical view grant is rechecked independently of content grant',async()=>{
    await grant(db,v1);const key=randomUUID();await authorize(db,v1,uploader,key);
    const g=await one(db,"select id from private.document_version_grants where document_id=$1 and user_profile_id=$2 and capability_key='view_versions'",[doc,uploader]);
    await service(db,()=>db.query('select public.revoke_document_version_grant($1,$2,4)',[doc,g.id]));
    await deny(authorize(db,v1,uploader,key));await deny(authorize(db,v1));
  });
  await isolated('retire content grant after membership/config removal without restoring any access',async()=>{
    const g=await grant(db,v1);await db.query("update public.account_access set membership_status='suspended' where account_id=$1 and user_profile_id=$2",[account,uploader]);
    await db.exec('update private.document_content_config set enabled=false;update private.private_object_reservation_config set enabled=false');
    assert.equal((await revoke(db,v1,g,1)).revoked,true);await deny(authorize(db,v1));
  });
  await isolated('A2-only directory authority cannot provision or use A1 content even within same account',async()=>{
    const g=await grant(db,v1,reader);await view(db,reader,'view_versions',4);const key=randomUUID();await authorize(db,v1,reader,key);
    await db.query("update public.account_capability_grants set revoked_at=now() where account_id=$1 and user_profile_id=$2 and capability_key='view_asset'",[account,reader]);
    await db.query("insert into public.account_capability_grants(account_id,user_profile_id,capability_key,scope_kind,facility_id) values($1,$2,'view_asset','facility',$3)",[account,reader,facilityA2]);
    await deny(authorize(db,v1,reader,key));await deny(grant(db,v2,reader));assert.equal((await revoke(db,v1,g,1)).revoked,true);
  });
  await isolated('deleted Auth identity cannot reuse unchanged simulated claims',async()=>{
    await grant(db,v1);const key=randomUUID();await authorize(db,v1,uploader,key);await db.query('delete from auth.users where id=$1',[subjects.get(uploader)]);
    await deny(authorize(db,v1,uploader,key));assert.equal((await one(db,'select auth_user_id from public.user_profiles where id=$1',[uploader])).auth_user_id,null);
  });

  for(const [hold,restricted] of [[false,false],[true,false],[false,true],[true,true]]) await isolated(`hold=${hold} and restriction=${restricted} remain separate`,async()=>{
    await grant(db,v1);
    await service(db,()=>rpc(db,'set_private_object_controls',[c1.id,v1.security_revision,restricted,hold,true]));
    if(restricted)await deny(authorize(db,v1));else assert.equal((await authorize(db,v1)).version_id,v1.version_id);
  });

  await isolated('service security narrowing invalidates usable clearance',async()=>{
    await grant(db,v1);
    await service(db,()=>db.query('update private.private_object_security set phi_suspected=true,current_clearance_id=null,security_revision=security_revision+1 where object_id=$1',[c1.id])).catch(async error=>{
      // Direct service DML is deliberately denied; the privileged SQL fixture
      // executes under service provenance only to simulate an operator change.
      assert.equal(error.code,'42501');
      await db.exec('create function public.test_narrow(uuid) returns void language sql security definer set search_path=\'\' as $$ update private.private_object_security set phi_suspected=true,current_clearance_id=null,security_revision=security_revision+1 where object_id=$1 $$;revoke all on function public.test_narrow(uuid) from public,anon,authenticated;grant execute on function public.test_narrow(uuid) to service_role');
      await service(db,()=>db.query('select public.test_narrow($1)',[c1.id]));
    });
    await deny(authorize(db,v1));
  });
  await isolated('closed ingest cannot be reopened or scanned/cleared/reported through old grants',async()=>{
    await grant(db,v1);assert.equal((await authorize(db,v1)).version_id,v1.version_id);
    await deny(service(db,()=>rpc(db,'claim_private_object_scan',[c1.id,v1.security_revision,randomUUID(),'synthetic_fixture','fixture-v1','rules-v1'])),'55000');
    await deny(user(db,()=>rpc(db,'report_private_object_phi',[c1.id,v1.security_revision])),'55000');
    await deny(user(db,()=>rpc(db,'decide_private_object_clearance',[c1.id,c1.o.scan_observation_id,digest,v1.security_revision,randomUUID(),'cleared_no_phi','reviewed_no_phi']),reviewer),'55000');
    assert.equal((await user(db,()=>rpc(db,'private_object_security_status',[c1.id]))).state,'ingest_closed');
  });

  await isolated('current clearance is mandatory even with no suspicion and an unchanged version',async()=>{
    await grant(db,v1);
    await db.exec(`create function public.test_remove_clearance(uuid) returns void language sql security definer set search_path='' as $$
      update private.private_object_security set current_clearance_id=null,security_revision=security_revision+1 where object_id=$1 $$;
      revoke all on function public.test_remove_clearance(uuid) from public,anon,authenticated;
      grant execute on function public.test_remove_clearance(uuid) to service_role;`);
    await service(db,()=>db.query('select public.test_remove_clearance($1)',[c1.id]));
    await deny(authorize(db,v1));assert.equal((await one(db,'select phi_suspected from private.private_object_security where object_id=$1',[c1.id])).phi_suspected,false);
    const narrowed=await service(db,()=>rpc(db,'set_private_object_controls',[c1.id,v1.security_revision+1,true,true,true]));
    await service(db,()=>rpc(db,'set_private_object_controls',[c1.id,narrowed.security_revision,false,true,true]));await deny(authorize(db,v1));
    assert.equal((await one(db,'select current_clearance_id from private.private_object_security where object_id=$1',[c1.id])).current_clearance_id,null);
  });
  await isolated('same request UUID across distinct verified subjects has distinct authorizations',async()=>{
    await grant(db,v1);await grant(db,v1,reader,1);await view(db,reader,'view_versions',4);
    const key=randomUUID(),a=await authorize(db,v1,uploader,key),b=await authorize(db,v1,reader,key);
    assert.notEqual(a.authorization_id,b.authorization_id);assert.deepEqual(await authorize(db,v1,reader,key),b);
  });
  await isolated('anonymous, missing, service and forged non-gateway human contexts deny',async()=>{
    await grant(db,v1);const args=[v1.version_id,digest,randomUUID()];
    await deny(as(db,'anon',()=>rpc(db,'authorize_document_version_content',args)));
    await deny(as(db,'service_role',()=>rpc(db,'authorize_document_version_content',args)));
    await deny(as(db,'authenticated',()=>rpc(db,'authorize_document_version_content',args),uploader,'postgres'),'28000');
    await deny(as(db,'authenticated',()=>rpc(db,'authorize_document_version_content',args),uploader,'authenticator',{is_anonymous:true}),'28000');
    await deny(as(db,'authenticated',()=>rpc(db,'authorize_document_version_content',args),null),'28000');
    for(const name of ['provision_document_content_grant','revoke_document_content_grant','record_document_content_result','record_document_content_denial']) {
      const parameters={provision_document_content_grant:[v1.version_id,digest,reader,randomUUID(),1],revoke_document_content_grant:[v1.version_id,randomUUID(),1],record_document_content_result:[randomUUID(),'response_prepared'],record_document_content_denial:[randomUUID(),v1.version_id,subjects.get(uploader),'not_found_or_unavailable']}[name];
      await deny(user(db,()=>rpc(db,name,parameters)));
      await deny(as(db,'service_role',()=>rpc(db,name,parameters),null,'postgres'),'28000');
    }
  });
  await isolated('typed invalid inputs fail with no history, path, actor or free-text override surface',async()=>{
    for(const args of [[null,digest,randomUUID()],[v1.version_id,null,randomUUID()],[v1.version_id,'bad',randomUUID()],[v1.version_id,digest,null]])
      await deny(user(db,()=>rpc(db,'authorize_document_version_content',args)),'22023');
    for(const args of [[v1.version_id,digest,uploader,null,0],[v1.version_id,digest,uploader,randomUUID(),-1]])
      await deny(service(db,()=>rpc(db,'provision_document_content_grant',args)),'22023');
    await deny(result(db,{authorization_id:randomUUID()},'delivered'),'22023');await deny(denial(db,null,null,'raw secret'),'22023');
    await deny(denial(db,null,null,'unauthenticated',null),'22023');
    assert.equal((await one(db,'select count(*)::int n from private.document_content_authorizations')).n,0);
  });
  await isolated('all base tables deny direct select/write/truncate including BYPASSRLS service role',async()=>{
    for(const table of ['document_content_config','document_content_heads','document_content_grants','document_content_authorizations','document_content_results','document_content_denials']) {
      assert.equal((await one(db,"select relrowsecurity from pg_class where oid=$1::regclass",[`private.${table}`])).relrowsecurity,true);
      for(const role of ['anon','authenticated','service_role']) {
        for(const op of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) assert.equal((await one(db,'select has_table_privilege($1,$2,$3) allowed',[role,`private.${table}`,op])).allowed,false);
        await deny(as(db,role,()=>db.query(`select * from private.${table}`)));
      }
    }
    const functions=(await db.query("select n.nspname,p.proname,p.prosecdef,p.proconfig,oidvectortypes(p.proargtypes) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname like '%document_content%' or p.proname='authorize_document_version_content'")).rows;
    for(const f of functions) {
      assert.ok(f.proconfig.includes('search_path=""'),f.proname);if(f.nspname==='public')assert.equal(f.prosecdef,false,f.proname);
      assert.equal((await one(db,'select has_function_privilege($1,$2,\'EXECUTE\') allowed',['anon',`${f.nspname}.${f.proname}(${f.args})`])).allowed,false);
      if(f.proname.startsWith('lock_')||f.proname.startsWith('guard_')||f.proname.startsWith('audit_')||f.proname.endsWith('_receipt'))
        for(const role of ['authenticated','service_role'])assert.equal((await one(db,'select has_function_privilege($1,$2,\'EXECUTE\') allowed',[role,`${f.nspname}.${f.proname}(${f.args})`])).allowed,false);
    }
  });
  await isolated('immutable authorization/grant/result/denial rows resist privileged edits, deletion and truncation',async()=>{
    const g=await grant(db,v1),a=await authorize(db,v1),r=await result(db,a,'response_prepared'),d=await denial(db,v1.version_id,subjects.get(uploader));
    for(const [table,id] of [['document_content_grants',g.grant_id],['document_content_authorizations',a.authorization_id],['document_content_results',r.result_id],['document_content_denials',d.denial_id]]) {
      await ownerDeny(db,`delete from private.${table} where id=$1`,[id]);await ownerDeny(db,`truncate private.${table} cascade`);
      await ownerDeny(db,`update private.${table} set id=$1 where id=$2`,[randomUUID(),id],table==='document_content_grants'?'28000':'55000');
    }
    await ownerDeny(db,'update private.document_content_config set synthetic_only=false',[],'23514');
    await ownerDeny(db,'delete from private.document_content_config');await ownerDeny(db,'truncate private.document_content_config');
  });
  await isolated('privileged insertion cannot forge human authorization actor, manifest, time or grant',async()=>{
    await grant(db,v1);
    await db.exec(`create function public.test_insert_content(uuid,text,uuid) returns uuid language plpgsql security definer set search_path='' as $$
      declare id uuid;begin insert into private.document_content_authorizations(version_id,verified_sha256,request_id,object_id,bucket_id,object_key,subject_profile_id,subject_auth_user_id,authorized_at)
      values($1,$2,$3,'${c2.id}','evil','attacker-key','${reader}','${subjects.get(reader)}','2000-01-01') returning document_content_authorizations.id into id;return id;end $$;
      revoke all on function public.test_insert_content(uuid,text,uuid) from public,anon,service_role;grant execute on function public.test_insert_content(uuid,text,uuid) to authenticated;`);
    const id=(await user(db,()=>one(db,'select public.test_insert_content($1,$2,$3) id',[v1.version_id,digest,randomUUID()]))).id;
    const a=await one(db,'select * from private.document_content_authorizations where id=$1',[id]);
    assert.equal(a.object_id,c1.id);assert.equal(a.subject_profile_id,uploader);assert.equal(a.subject_auth_user_id,subjects.get(uploader));assert.equal(a.bucket_id,'os-private-ingest');
    assert.notEqual(a.authorized_at,'2000-01-01T00:00:00.000Z');
    await deny(user(db,()=>db.query('select public.test_insert_content($1,$2,$3)',[v2.version_id,digest,randomUUID()])));
  });
  await isolated('privileged grant insertion still validates recipient, digest, capability and CAS, assigning scope/time',async()=>{
    await db.exec(`create function public.test_insert_content_grant(uuid,text,uuid,bigint,text) returns uuid language plpgsql security definer set search_path='' as $$
      declare id uuid;begin insert into private.document_content_grants(id,version_id,document_id,account_id,verified_sha256,user_profile_id,capability_key,request_id,requested_revision,created_at)
      values('${uuid(777)}',$1,'${uuid(778)}','${accountB}',$2,$3,$5,pg_catalog.gen_random_uuid(),$4,'2000-01-01') returning document_content_grants.id into id;return id;end $$;
      revoke all on function public.test_insert_content_grant(uuid,text,uuid,bigint,text) from public,anon,authenticated;grant execute on function public.test_insert_content_grant(uuid,text,uuid,bigint,text) to service_role;`);
    const insert=(profile=uploader,sha=digest,rev=0,cap='view_content')=>service(db,()=>one(db,'select public.test_insert_content_grant($1,$2,$3,$4,$5) id',[v1.version_id,sha,profile,rev,cap]));
    await deny(insert(other));await deny(insert(uploader,'b'.repeat(64)),'40001');await deny(insert(uploader,digest,1),'40001');await deny(insert(uploader,digest,0,'create_version'),'22023');
    const {id}=await insert(),g=await one(db,'select * from private.document_content_grants where id=$1',[id]);
    assert.notEqual(id,uuid(777));assert.equal(g.document_id,doc);assert.equal(g.account_id,account);assert.notEqual(g.created_at,'2000-01-01T00:00:00.000Z');
    assert.equal((await one(db,'select content_revision from private.document_content_heads where version_id=$1',[v1.version_id])).content_revision,1);
  });
  await isolated('retired grants cannot be edited, moved or restored under technical provenance',async()=>{
    const g=await grant(db,v1);await revoke(db,v1,g,1);
    await db.exec(`create function public.test_restore_content_grant(uuid) returns void language sql security definer set search_path='' as $$
      update private.document_content_grants set revoked_at=null,revoked_from_revision=null where id=$1 $$;
      revoke all on function public.test_restore_content_grant(uuid) from public,anon,authenticated;grant execute on function public.test_restore_content_grant(uuid) to service_role;`);
    await deny(service(db,()=>db.query('select public.test_restore_content_grant($1)',[g.grant_id])),'55000');
    await deny(authorize(db,v1));
  });
  await isolated('bounded system results are idempotent observations even after config/authority revocation',async()=>{
    const g=await grant(db,v1),a=await authorize(db,v1);await revoke(db,v1,g,1);await db.exec('update private.document_content_config set enabled=false');
    for(const outcome of ['response_prepared','provider_failure','integrity_failure','access_changed']) {
      const r=await result(db,a,outcome);assert.deepEqual(Object.keys(r).sort(),['authorization_id','outcome','result_id']);assert.deepEqual(await result(db,a,outcome),r);
      const audit=await one(db,'select * from public.audit_events where object_id=$1',[r.result_id]);
      assert.equal(audit.actor_kind,'system');assert.equal(audit.actor_user_profile_id,null);assert.equal(audit.actor_auth_user_id,null);assert.equal(audit.actor_system_key,'database_privileged_operation');
      assert.equal(audit.event_metadata.meaning,'system_observation_not_delivery');
    }
    assert.equal((await one(db,'select count(*)::int n from private.document_content_results')).n,4);
    await deny(result(db,{authorization_id:randomUUID()},'provider_failure'));await deny(authorize(db,v1));
  });
  await isolated('denials resolve only safe visible scope; attempted/observed IDs never become human authority',async()=>{
    await db.exec('update private.document_content_config set enabled=false');
    for(const [version,subject,tenant] of [[v1.version_id,subjects.get(uploader),account],[v1.version_id,subjects.get(other),null],[v1.version_id,null,null],[randomUUID(),subjects.get(uploader),null],[null,null,null]]) {
      const d=await denial(db,version,subject),row=await one(db,'select * from private.document_content_denials where id=$1',[d.denial_id]);
      assert.deepEqual(Object.keys(d).sort(),['denial_id','reason_code','request_id']);assert.equal(row.resolved_account_id,tenant);
      const audit=await one(db,'select * from public.audit_events where object_id=$1',[d.denial_id]);assert.equal(audit.actor_kind,'system');assert.equal(audit.actor_auth_user_id,null);assert.equal(audit.actor_user_profile_id,null);
      assert.equal(audit.event_metadata.attempted_version_id,version);assert.equal(audit.event_metadata.observed_auth_user_id,subject);
      assert.equal(audit.event_metadata.meaning,'system_observation_not_human_authority');
    }
    const key=randomUUID(),a=await denial(db,null,null,'unauthenticated',key),b=await denial(db,null,null,'unauthenticated',key);assert.notEqual(a.denial_id,b.denial_id);
    await db.query("update public.account_access set membership_status='suspended' where account_id=$1 and user_profile_id=$2",[account,uploader]);
    const d=await denial(db,v1.version_id,subjects.get(uploader));assert.equal((await one(db,'select resolved_account_id from private.document_content_denials where id=$1',[d.denial_id])).resolved_account_id,null);
  });
  await isolated('denial survives a rolled-back failed user transaction as a separate service transaction',async()=>{
    await db.exec('savepoint failed_user_transaction');await deny(authorize(db,v1));await db.exec('rollback to failed_user_transaction;release failed_user_transaction');
    const d=await denial(db,v1.version_id,subjects.get(uploader));
    assert.equal((await one(db,'select count(*)::int n from public.audit_events where object_id=$1',[d.denial_id])).n,1);
    assert.equal((await one(db,'select count(*)::int n from private.document_content_authorizations')).n,0);
  });
  await isolated('audit metadata never contains storage path, key, raw content, claims or delivery claim',async()=>{
    await grant(db,v1);const a=await authorize(db,v1);await result(db,a,'response_prepared');await denial(db,v1.version_id,subjects.get(uploader));
    const events=(await db.query("select event_metadata,event_type from public.audit_events where object_type like 'document_content_%'")).rows;
    for(const e of events)for(const forbidden of ['object_key','bucket_id','raw_error','token','content','claims','delivered'])assert.equal(Object.hasOwn(e.event_metadata,forbidden),false);
    assert.ok(events.some(e=>e.event_type==='document_content_authorized'));
  });
  await isolated('audit failure rolls back grant/head, authorization, result, denial and configuration transitions',async()=>{
    const g=await grant(db,v1),a=await authorize(db,v1);
    await db.exec(`create function private.test_fail_content_audit() returns trigger language plpgsql set search_path='' as $$begin
      if new.object_type like 'document_content_%' then raise exception 'simulated audit outage';end if;return new;end $$;
      create trigger test_fail_content_audit before insert on public.audit_events for each row execute function private.test_fail_content_audit();`);
    await deny(grant(db,v1,reader,1),'P0001');await deny(revoke(db,v1,g,1),'P0001');await deny(authorize(db,v1),'P0001');
    await deny(result(db,a,'provider_failure'),'P0001');await deny(denial(db,v1.version_id,subjects.get(uploader)),'P0001');
    await ownerDeny(db,'update private.document_content_config set enabled=false',[],'P0001');
    assert.equal((await one(db,'select content_revision from private.document_content_heads where version_id=$1',[v1.version_id])).content_revision,1);
    assert.equal((await one(db,'select revoked_at from private.document_content_grants where id=$1',[g.grant_id])).revoked_at,null);
    assert.equal((await one(db,'select count(*)::int n from private.document_content_authorizations')).n,1);
    assert.equal((await one(db,'select count(*)::int n from private.document_content_results')).n,0);assert.equal((await one(db,'select count(*)::int n from private.document_content_denials')).n,0);
    assert.equal((await one(db,'select enabled from private.document_content_config')).enabled,true);
  });
  await isolated('old security guard and all existing audit allowlist branches are preserved verbatim',async()=>{
    const old=await readFile(new URL('20261009072201_document_versions.sql',migrations),'utf8');
    const current=await readFile(new URL('20261009080505_document_version_content.sql',migrations),'utf8');
    const branches=old.slice(old.indexOf("    (actor_kind='legacy_fixture'"),old.indexOf('\n    ))\n  );',old.indexOf("    (actor_kind='legacy_fixture'")));
    assert.ok(current.includes(branches));
    assert.deepEqual([...current.matchAll(/create or replace function ([^(]+)/g)].map(m=>m[1]),['private.set_private_object_controls']);
    const seed=await readFile(foundationSeedUrl,'utf8');await db.exec(seed.replace(/^\s*begin;/i,'').replace(/commit;\s*$/i,''));
    assert.ok((await one(db,"select count(*)::int n from public.audit_events where event_type='document_version_adopted'")).n>=2);
    await deny(service(db,()=>rpc(db,'set_private_object_controls',[c1.id,v1.security_revision,false,false,false])),'55000');
  });
  await isolated('restriction removal can restore visibility only when current clearance remains valid',async()=>{
    await grant(db,v1);
    const restricted=await service(db,()=>rpc(db,'set_private_object_controls',[c1.id,v1.security_revision,true,true,true]));await deny(authorize(db,v1));
    await service(db,()=>rpc(db,'set_private_object_controls',[c1.id,restricted.security_revision,false,true,true]));assert.equal((await authorize(db,v1)).version_id,v1.version_id);
    assert.equal((await one(db,'select current_clearance_id from private.private_object_security where object_id=$1',[c1.id])).current_clearance_id,c1.c.decision_id);
  });
  await isolated('first technical closure still invalidates clearance and is not version adoption',async()=>{
    const c=await cleared(db);await service(db,()=>rpc(db,'set_private_object_controls',[c.id,c.c.security_revision,false,true,true]));
    const state=await one(db,'select * from private.private_object_security where object_id=$1',[c.id]);assert.equal(state.current_clearance_id,null);assert.ok(state.ingest_closed_at);assert.equal(state.preservation_hold,true);
    await deny(adopt(db,c,4),'40001');assert.equal((await one(db,'select count(*)::int n from private.document_versions where object_id=$1',[c.id])).n,0);
  });
});
