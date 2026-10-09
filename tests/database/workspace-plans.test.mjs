import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import { createTestDatabase, runSqlFile, setSimulatedSubject } from '../helpers/pglite-database.mjs';

const migrationName='20261009170854_workspace_plans.sql';
const uuid=n=>`50000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const account='00000000-0000-4000-8000-000000000001',facility='00000000-0000-4000-8000-000000000301';
const author='00000000-0000-4000-8000-000000000101',colleague='00000000-0000-4000-8000-000000000103';
const accountB=uuid(20),facilityB=uuid(21),facilityA2=uuid(22),outsider=uuid(30);
const subjects=new Map([[author,uuid(1)],[colleague,uuid(2)],[outsider,uuid(3)]]);
const one=async(db,sql,args=[]) => (await db.query(sql,args)).rows[0];
const expectedRecordKeys=['id','account_id','facility_id','module_key','panel_key','title','revision','values','rows','checks','created_at','updated_at','is_demo','state'];
const rpcNames=new Set(['save_workspace_plan','get_workspace_plan','list_workspace_plans']);
async function rpc(db,name,args) {
  assert.ok(rpcNames.has(name));
  return (await one(db,`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) result`,args)).result;
}
async function as(db,run,{profile=author,role='authenticated',session='authenticator',claims={}}={}) {
  const subject=subjects.get(profile)??null;
  await setSimulatedSubject(db,subject,{role,sub:subject,...claims});
  await db.exec('savepoint request_context');
  try {await db.exec(`set session authorization ${session}; set role ${role}`);return await run();}
  catch(error){await db.exec('rollback to request_context');throw error;}
  finally {await db.exec('reset role; set session authorization postgres; release request_context');}
}
const intent=(overrides={})=>({id:randomUUID(),account_id:account,facility_id:facility,module_key:'scope',panel_key:'scope.1',
  expected_revision:0,request_id:randomUUID(),title:'Synthetic scope preparation',
  values:{'Project request reference':'SYNTHETIC-REQUEST-1',Inclusions:'Synthetic inspection planning only.'},
  rows:[{Deliverable:'Synthetic draft brief','Acceptance evidence':'Unverified preparation note'}],checks:{},...overrides});
const save=(db,p= intent(),context)=>as(db,()=>rpc(db,'save_workspace_plan',[p.id,p.account_id,p.facility_id,p.module_key,p.panel_key,
  p.expected_revision,p.request_id,p.title,JSON.stringify(p.values),JSON.stringify(p.rows),JSON.stringify(p.checks)]),context);
const get=(db,id,context)=>as(db,()=>rpc(db,'get_workspace_plan',[id]),context);
const list=(db,p=intent(),context)=>as(db,()=>rpc(db,'list_workspace_plans',[p.account_id,p.facility_id,p.module_key,p.panel_key]),context);
const deny=(op,code='42501')=>assert.rejects(op,error=>{assert.equal(error.code,code,error.message);return true;});
async function ownerDeny(db,sql,args=[],code='55000') {
  await db.exec('savepoint owner_probe');
  try {await deny(db.query(sql,args),code);} finally {await db.exec('rollback to owner_probe; release owner_probe');}
}
async function domainSnapshot(db) {
  const tables=['public.user_profiles','public.account_access','public.account_capability_grants','public.account_memberships',
    'public.documents','public.incidents','public.project_requests','private.private_object_reservations',
    'private.private_object_reservation_config','private.document_versions','private.document_version_grants',
    'private.document_content_grants','private.document_content_config'];
  const snapshot={};
  for (const table of tables) snapshot[table]=(await one(db,`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) rows from ${table} t`)).rows;
  return snapshot;
}

test('personal synthetic workspace plans — PostgreSQL/PGlite simulated Auth; no hosted/concurrency claim',async t=>{
  const db=await createTestDatabase();t.after(()=>db.close());
  await db.exec(`create role authenticator nologin noinherit; grant anon,authenticated,service_role to authenticator;
    alter table auth.users add column email text;
    create schema storage;create table storage.buckets(id text primary key);create table storage.objects(id uuid primary key,bucket_id text,name text);
    alter table storage.buckets enable row level security;alter table storage.objects enable row level security;
    alter default privileges in schema private grant all on tables to public,anon,authenticated,service_role;
    alter default privileges in schema private grant execute on functions to public,anon,authenticated,service_role;
    alter default privileges in schema public grant execute on functions to public,anon,authenticated,service_role;`);
  const migrations=new URL('../../supabase/migrations/',import.meta.url);
  for (const name of (await readdir(migrations)).sort()) if (name>'20261008120645_identity_access_directory.sql'&&name<=migrationName)
    await runSqlFile(db,new URL(name,migrations));
  await db.query("insert into public.client_accounts(id,display_name) values($1,'Synthetic other account')",[accountB]);
  await db.query("insert into public.facilities(id,account_id,display_name) values($1,$2,'Synthetic B1'),($3,$4,'Synthetic A2')",[facilityB,accountB,facilityA2,account]);
  await db.query("insert into public.user_profiles(id,display_name) values($1,'Synthetic outsider')",[outsider]);
  for (const [profile,subject] of subjects) {
    const tenant=profile===outsider?accountB:account,asset=profile===outsider?facilityB:facility;
    await db.query('insert into auth.users(id) values($1)',[subject]);
    await db.query('update public.user_profiles set auth_user_id=$1 where id=$2',[subject,profile]);
    await db.query("update public.user_profiles set identity_status='active' where id=$1",[profile]);
    await db.query("insert into public.account_access(account_id,user_profile_id,membership_status) values($1,$2,'active') on conflict(account_id,user_profile_id) do update set membership_status='active'",[tenant,profile]);
    await db.query("insert into public.account_capability_grants(account_id,user_profile_id,capability_key,scope_kind,facility_id) values($1,$2,'view_account','account',null),($1,$2,'view_asset','facility',$3),($1,$2,'submit_request','facility',$3),($1,$2,'triage_request','facility',$3)",[tenant,profile,asset]);
  }
  // A privileged fixture marked released is preserved verbatim, not interpreted
  // as runtime release proof. Planning saves never touch its state or contents.
  await db.exec("update public.documents set release_state='released_synthetic_fixture' where id='00000000-0000-4000-8000-000000000501'");
  const isolated=(name,body)=>t.test(name,async()=>{
    await db.exec('begin');try {await body();} finally {await db.exec('rollback;reset role;set session authorization postgres');}
  });

  await isolated('create, reopen, list and edit preserve original immutable revision and user audit',async()=>{
    const p=intent();assert.deepEqual(await list(db,p),[]);
    const created=await save(db,p);
    assert.deepEqual(Object.keys(created).sort(),expectedRecordKeys.sort());
    assert.equal(created.id,p.id);assert.equal(created.revision,1);assert.equal(created.state,'planning_draft');assert.equal(created.is_demo,true);
    assert.deepEqual(created.values,p.values);assert.deepEqual(created.rows,p.rows);assert.deepEqual(await get(db,p.id),created);
    const summaries=await list(db,p);assert.equal(summaries.length,1);assert.equal(summaries[0].title,p.title);
    assert.equal(summaries[0].values,undefined);assert.equal(summaries[0].rows,undefined);assert.equal(summaries[0].checks,undefined);
    const revised=await save(db,{...p,expected_revision:1,request_id:randomUUID(),title:'Updated synthetic preparation',values:{...p.values,Exclusions:'Synthetic exclusion'}});
    assert.equal(revised.revision,2);assert.equal(revised.created_at,created.created_at);assert.deepEqual(await get(db,p.id),revised);
    const history=(await db.query('select revision,title,values from private.workspace_plan_revisions where plan_id=$1 order by revision',[p.id])).rows;
    assert.equal(history.length,2);assert.equal(history[0].title,p.title);assert.deepEqual(history[0].values,p.values);
    const events=(await db.query("select * from public.audit_events where object_type='workspace_plan' and object_id=$1 order by event_metadata->>'revision'",[p.id])).rows;
    assert.deepEqual(events.map(e=>e.event_type),['workspace_plan_created','workspace_plan_revised']);
    for(const event of events) {
      assert.equal(event.actor_kind,'user');assert.equal(event.actor_user_profile_id,author);assert.equal(event.actor_auth_user_id,subjects.get(author));
      assert.equal(event.is_demo,true);assert.equal(event.is_internal_only,true);assert.equal(event.event_metadata.state,'planning_draft');
      assert.deepEqual(Object.keys(event.event_metadata).sort(),['facility_id','module_key','panel_key','revision','previous_revision','request_id','state','meaning'].sort());
      assert.ok(!JSON.stringify(event.event_metadata).includes(p.title));assert.equal(event.correlation_id,event.event_metadata.request_id);
    }
  });

  await isolated('exact creation/edit retries are read-only and historical receipt does not overwrite a later revision',async()=>{
    const p=intent(),first=await save(db,p),edit={...p,expected_revision:1,request_id:randomUUID(),title:'Synthetic revision two'};
    assert.deepEqual(await save(db,p),first);
    const second=await save(db,edit);assert.deepEqual(await save(db,edit),second);assert.deepEqual(await save(db,p),first);
    assert.deepEqual(await get(db,p.id),second);
    assert.equal((await one(db,'select count(*)::int n from private.workspace_plan_revisions')).n,2);
    assert.equal((await one(db,"select count(*)::int n from public.audit_events where object_type='workspace_plan'")).n,2);
  });

  await isolated('revision CAS and request UUID bind full intent without a conflicting write',async()=>{
    const p=intent();await save(db,p);
    await deny(save(db,{...p,request_id:randomUUID()}),'40001');
    for(const patch of [{title:'Different title'},{values:{}},{rows:[]},{checks:{invalid:true}},{expected_revision:1},{id:randomUUID()}])
      await deny(save(db,{...p,...patch}),patch.checks?'22023':'40001');
    await deny(save(db,{...p,module_key:'projects',panel_key:'projects.1',values:{},rows:[]}));
    assert.equal((await get(db,p.id)).revision,1);
    assert.equal((await one(db,'select count(*)::int n from private.workspace_plans')).n,1);
    assert.equal((await one(db,'select count(*)::int n from private.workspace_plan_revisions')).n,1);
  });

  await isolated('same-facility colleague, triage and legacy administrator cannot see or reuse another author draft',async()=>{
    const p=intent();await save(db,p);
    assert.equal((await one(db,"select count(*)::int n from public.account_memberships where user_profile_id=$1 and role_key='system_admin'",[author])).n,1);
    await deny(get(db,p.id,{profile:colleague}));await deny(get(db,randomUUID(),{profile:colleague}));
    assert.deepEqual(await list(db,p,{profile:colleague}),[]);await deny(save(db,p,{profile:colleague}));
    const theirs=intent({request_id:p.request_id});assert.equal((await save(db,theirs,{profile:colleague})).revision,1);
    await deny(get(db,theirs.id));assert.deepEqual((await list(db)).map(p=>p.id),[p.id]);
  });

  await isolated('foreign account/facility and current account with inaccessible facility all deny',async()=>{
    const p=intent();await save(db,p);
    await deny(get(db,p.id,{profile:outsider}));await deny(list(db,p,{profile:outsider}));await deny(save(db,p,{profile:outsider}));
    for(const patch of [{facility_id:facilityB},{facility_id:facilityA2},{account_id:accountB},{account_id:accountB,facility_id:facilityB}]) {
      await deny(save(db,intent(patch)));await deny(list(db,intent(patch)));
    }
    const elsewhere=intent({account_id:accountB,facility_id:facilityB});assert.equal((await save(db,elsewhere,{profile:outsider})).revision,1);
    await deny(get(db,elsewhere.id));
  });

  await isolated('authorized second facility cannot move or replay an existing plan under a different scope',async()=>{
    await db.query("insert into public.account_capability_grants(account_id,user_profile_id,capability_key,scope_kind,facility_id) values($1,$2,'view_asset','facility',$3),($1,$2,'submit_request','facility',$3)",[account,author,facilityA2]);
    const p=intent();await save(db,p);await deny(save(db,{...p,facility_id:facilityA2}));
    assert.deepEqual(await list(db,intent({facility_id:facilityA2})),[]);
    assert.equal((await save(db,intent({facility_id:facilityA2}))).facility_id,facilityA2);
  });

  for(const [label,sql,args] of [
    ['identity',"update public.user_profiles set identity_status='suspended' where id=$1",[author]],
    ['removed identity',"update public.user_profiles set identity_status='removed' where id=$1",[author]],
    ['Auth unlink','update public.user_profiles set auth_user_id=null where id=$1',[author]],
    ['membership',"update public.account_access set membership_status='suspended' where account_id=$1 and user_profile_id=$2",[account,author]],
    ['removed membership',"update public.account_access set membership_status='removed' where account_id=$1 and user_profile_id=$2",[account,author]],
    ['account grant',"update public.account_capability_grants set revoked_at=now() where account_id=$1 and user_profile_id=$2 and capability_key='view_account'",[account,author]],
    ['facility view grant',"update public.account_capability_grants set revoked_at=now() where account_id=$1 and user_profile_id=$2 and capability_key='view_asset'",[account,author]],
    ['submit grant with triage retained',"update public.account_capability_grants set revoked_at=now() where account_id=$1 and user_profile_id=$2 and capability_key='submit_request'",[account,author]],
    ['profile demo scope','update public.user_profiles set is_demo=false where id=$1',[author]],
    ['account demo scope','update public.client_accounts set is_demo=false where id=$1',[account]],
    ['facility demo scope','update public.facilities set is_demo=false where id=$1',[facility]],
    ['membership demo scope','update public.account_access set is_demo=false where account_id=$1 and user_profile_id=$2',[account,author]],
    ['grant demo scope',"update public.account_capability_grants set is_demo=false where account_id=$1 and user_profile_id=$2 and capability_key='submit_request'",[account,author]],
  ]) await isolated(`current ${label} revocation denies reads, fresh saves and exact retries`,async()=>{
    const p=intent();await save(db,p);await db.query(sql,args);
    await deny(get(db,p.id));await deny(list(db,p));await deny(save(db,p));await deny(save(db,intent()));
    assert.equal((await one(db,'select count(*)::int n from private.workspace_plan_revisions')).n,1);
  });

  for(const [label,context] of [
    ['anonymous role',{role:'anon'}],['service role',{role:'service_role'}],['spoofed operator session',{session:'postgres'}],
    ['anonymous Auth user',{claims:{is_anonymous:true}}],['missing anonymous proof',{claims:{is_anonymous:null}}],
    ['claim role mismatch',{claims:{role:'service_role'}}],['subject mismatch',{claims:{sub:subjects.get(colleague)}}],
    ['invalid subject',{claims:{sub:'invalid-subject'}}],['unlinked Auth subject',{profile:null}],
  ]) await isolated(`${label} cannot invoke read/write surface`,async()=>{
    const p=intent();await save(db,p);await deny(get(db,p.id,context));await deny(list(db,p,context));await deny(save(db,p,context));
  });

  await isolated('Facility coordinator field persists and replaced field key is rejected',async()=>{
    const p=intent({module_key:'readiness',panel_key:'readiness.1',values:{'Facility coordinator':'Synthetic coordinator'},rows:[]});
    const saved=await save(db,p);
    assert.deepEqual(saved.values,{'Facility coordinator':'Synthetic coordinator'});
    assert.deepEqual((await get(db,p.id)).values,saved.values);
    await deny(save(db,{...p,expected_revision:1,request_id:randomUUID(),values:{'Site champion':'Synthetic prior label'}}),'22023');
    assert.equal((await get(db,p.id)).revision,1);
  });

  await isolated('fixed catalogue exactly matches forty editable current panels and all accept representative typed drafts',async()=>{
    const source=await readFile(new URL('../../web/src/pages/module-screen-definitions.ts',import.meta.url),'utf8');
    const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022}}).outputText;
    const {moduleScreens}=await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
    const before=await domainSnapshot(db);let count=0;
    for(const [module,screens] of Object.entries(moduleScreens)) for(const [index,screen] of screens.entries()) {
      const key=`${module}.${index+1}`;
      const schema=(await one(db,'select private.workspace_plan_schema($1,$2) schema',[module,key])).schema;
      if(!screen.fields.length) {assert.equal(schema,null);continue;}
      count++;
      const fields=screen.fields.map(f=>({...f,kind:f.kind??'text'}));
      if(screen.pattern==='review') fields.push({label:'Current revision notes',kind:'multiline'},{label:'Proposed revision notes',kind:'multiline'});
      if(screen.checks?.length&&!fields.some(f=>f.label==='Review notes')) fields.push({label:'Review notes',kind:'multiline'});
      const rowFields=(screen.repeat?.fields??[]).map(f=>({...f,kind:f.kind??'text'}));
      assert.deepEqual(schema,{module_key:module,fields,row_fields:rowFields,checks:screen.checks??[]});
      const valuesFor=fields=>Object.fromEntries(fields.map(f=>[f.label,f.kind==='date'?'2026-10-09':f.kind==='money'?'12.50':f.kind==='quantity'?'2.125':f.kind==='select'?f.options[0]:'Synthetic preparation']));
      const p=intent({module_key:module,panel_key:key,title:`Synthetic ${key}`,values:valuesFor(fields),rows:rowFields.length?[valuesFor(rowFields)]:[],checks:Object.fromEntries((screen.checks??[]).map(c=>[c,true]))});
      const saved=await save(db,p);assert.equal(saved.state,'planning_draft');assert.equal(saved.revision,1);assert.deepEqual((await get(db,p.id)).values,p.values);
    }
    assert.equal(count,40);assert.deepEqual(await domainSnapshot(db),before);
    const events=(await db.query("select distinct event_type from public.audit_events where object_type='workspace_plan'")).rows;
    assert.deepEqual(events,[{event_type:'workspace_plan_created'}]);
  });

  for(const [label,patch] of [
    ['unknown module',{module_key:'core'}],['unknown panel',{panel_key:'scope.99'}],['Moldo panel',{module_key:'integrations',panel_key:'integrations.1'}],
    ['title empty',{title:''}],['title whitespace',{title:' Draft '}],['title bound',{title:'x'.repeat(121)}],
    ['unknown authority field',{values:{approved:true}}],['nested authority object',{values:{Inclusions:{status:'approved'}}}],
    ['nonstring known value',{values:{Inclusions:true}}],['null values',{values:null}],['array values',{values:[]}],
    ['text field bound',{values:{'Project request reference':'x'.repeat(501)}}],['multiline field bound',{values:{Inclusions:'x'.repeat(4001)}}],
    ['unknown row field',{rows:[{source_url:'blocked'}]}],['local row ID wrapper',{rows:[{id:1,values:{Deliverable:'test'}}]}],
    ['rows shape',{rows:{}}],['rows count',{rows:Array.from({length:51},()=>({Deliverable:'Synthetic'}))}],
    ['unknown check',{checks:{approved:true}}],['check type',{module_key:'scope',panel_key:'scope.2',values:{},rows:[],checks:{'Confirm the exact scope revision':'yes'}}],
    ['URL',{values:{Inclusions:'https://example.invalid/source'}}],['file URL',{values:{Inclusions:'file:///private'}}],
    ['data URL',{values:{Inclusions:'data:text/plain,secret'}}],['secret marker',{values:{Inclusions:'sb_secret_synthetic'}}],
    ['token marker',{values:{Inclusions:'access_token=synthetic'}}],['private key marker',{title:'-----BEGIN PRIVATE KEY-----'}],
    ['date syntax',{module_key:'programs',panel_key:'programs.2',values:{'Effective from':'09/10/2026'},rows:[]}],
    ['invalid date',{module_key:'programs',panel_key:'programs.2',values:{'Effective from':'2026-02-30'},rows:[]}],
    ['money precision',{module_key:'finance',panel_key:'finance.1',values:{Amount:'12.345'},rows:[]}],
    ['money exponent',{module_key:'finance',panel_key:'finance.1',values:{Amount:'1e3'},rows:[]}],
    ['money overflow',{module_key:'finance',panel_key:'finance.1',values:{Amount:'1234567890123'},rows:[]}],
    ['invalid select',{module_key:'finance',panel_key:'finance.1',values:{'Record basis':'Approved'},rows:[]}],
    ['rows for nonrepeat panel',{module_key:'finance',panel_key:'finance.1',values:{},rows:[{}]}],
    ['negative expected revision',{expected_revision:-1}],['null request',{request_id:null}],['null plan',{id:null}],
  ]) await isolated(`reject ${label} without any draft or audit write`,async()=>{
    await deny(save(db,intent(patch)),'22023');
    assert.equal((await one(db,'select count(*)::int n from private.workspace_plans')).n,0);
    assert.equal((await one(db,"select count(*)::int n from public.audit_events where object_type='workspace_plan'")).n,0);
  });

  await isolated('reject aggregate payload over64KiB even when individual fields and rows are valid',async()=>{
    const p=intent({module_key:'projects',panel_key:'projects.2',values:{},rows:Array.from({length:20},()=>({'Permitted instructions':'x'.repeat(4000)}))});
    await deny(save(db,p),'22023');
  });

  await isolated('unknown get and unavailable expected nonzero creation have indistinguishable denial',async()=>{
    await deny(get(db,randomUUID()));await deny(save(db,intent({expected_revision:1})));
    assert.equal((await one(db,'select count(*)::int n from private.workspace_plans')).n,0);
  });

  await isolated('immutable revisions and head identity deny privileged edits, deletes, truncation and direct operator insert',async()=>{
    const p=intent();await save(db,p);
    for(const sql of ["update private.workspace_plan_revisions set title='changed' where plan_id=$1",
      'delete from private.workspace_plan_revisions where plan_id=$1']) await ownerDeny(db,sql,[p.id]);
    await ownerDeny(db,'delete from private.workspace_plans where id=$1',[p.id]);
    await ownerDeny(db,'truncate private.workspace_plan_revisions');await ownerDeny(db,'truncate private.workspace_plans cascade');
    await ownerDeny(db,'update private.workspace_plans set revision=100 where id=$1',[p.id],'42501');
    await ownerDeny(db,"insert into private.workspace_plans(id,account_id,facility_id,creator_profile_id,creator_auth_user_id,module_key,panel_key) values($1,$2,$3,$4,$5,'scope','scope.1')",[randomUUID(),account,facility,author,subjects.get(author)],'42501');
    assert.equal((await get(db,p.id)).revision,1);
  });

  await isolated('RPC privileges, default-deny RLS and immutable audit survive broad inherited defaults',async()=>{
    const p=intent();await save(db,p);
    const acl=(await db.query(`select n.nspname schema,p.proname name,p.prosecdef definer,p.proconfig,
      has_function_privilege('anon',p.oid,'execute') anon,has_function_privilege('authenticated',p.oid,'execute') authenticated,
      has_function_privilege('service_role',p.oid,'execute') service from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where p.proname in ('save_workspace_plan','get_workspace_plan','list_workspace_plans') order by 1,2`)).rows;
    assert.equal(acl.length,6);
    for(const f of acl) {assert.equal(f.anon,false);assert.equal(f.service,false);assert.equal(f.authenticated,true);assert.equal(f.definer,f.schema==='private');assert.ok(f.proconfig.includes('search_path=""'));}
    assert.equal((await one(db,"select count(*)::int n from pg_policies where schemaname='private' and tablename in ('workspace_plans','workspace_plan_revisions')")).n,0);
    for(const table of ['workspace_plans','workspace_plan_revisions']) {
      assert.equal((await one(db,'select relrowsecurity enabled from pg_class where oid=$1::regclass',[`private.${table}`])).enabled,true);
      for(const role of ['anon','authenticated','service_role']) assert.equal((await one(db,'select has_table_privilege($1,$2,$3) allowed',[role,`private.${table}`,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'])).allowed,false);
      await db.exec(`grant select on private.${table} to authenticated`);
      assert.deepEqual((await as(db,()=>db.query(`select * from private.${table}`))).rows,[]);
    }
    const count=(await one(db,"select count(*)::int n from public.audit_events where object_type='workspace_plan'")).n;
    await ownerDeny(db,"update public.audit_events set event_metadata='{}' where object_type='workspace_plan'",[],'55000');
    assert.equal((await one(db,"select count(*)::int n from public.audit_events where object_type='workspace_plan'")).n,count);
  });
});
