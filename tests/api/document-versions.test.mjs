import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { configuration, preflightSchema, recordCreatedAuth } from './fixture-cleanup.mjs';
import { assertPrivateBucket, PRIVATE_BUCKET } from '../../scripts/private-object-provision.mjs';
import { SYNTHETIC_PREFIX, sha256 } from '../../supabase/functions/private-objects/gateway.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const safeFetch=(input,init)=>fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(30_000),cache:'no-store'});
const client=(config,key,token)=>createClient(config.url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  global:{fetch:safeFetch,...(token?{headers:{Authorization:`Bearer ${token}`}}:{})}});
async function ok(operation) {
  let r;try{r=await operation;}catch{throw new Error('Provider operation failed; details omitted.');}
  assert.ok(r&&!r.error,'Provider operation failed; details omitted.');return r.data;
}
async function denied(operation,code) {
  let r;try{r=await operation;}catch{throw new Error('Provider request failed; details omitted.');}
  assert.equal(r.error?.code,code,'Expected safe RPC denial; provider details omitted.');
}

test('immutable version adoption authentic Auth/API — explicitly owner-provisioned synthetic document required',async(t)=>{
  // No dependency/ACL change grants a service key logical-document provisioning.
  // Require a designated synthetic fixture and read-only preflight BEFORE Auth
  // creation. Missing prerequisites fail, never skip-to-pass. No hosted execution
  // is authorized merely by adding this prepared harness to the repository.
  const config=configuration(),documentId=process.env.AUXILIUMOS_TEST_VERSION_DOCUMENT_ID;
  const initialRevision=Number(process.env.AUXILIUMOS_TEST_VERSION_DOCUMENT_REVISION??'0');
  assert.ok(UUID.test(documentId??'')&&Number.isSafeInteger(initialRevision)&&initialRevision>=0,
    'Configure an explicitly owner-provisioned synthetic logical document ID/current revision. No API acceptance ran.');
  const admin=client(config,config.serviceRoleKey);await preflightSchema(admin);
  const doc=await ok(admin.from('documents').select('id,account_id,facility_id,title,is_demo').eq('id',documentId).maybeSingle());
  assert.ok(doc?.id===documentId&&doc.is_demo===true&&UUID.test(doc.facility_id??'')&&doc.title===`Synthetic version API fixture ${documentId}`,
    'The exact designated synthetic fixture was not verified. No Auth fixture was created; logical-document provisioning is an owner prerequisite.');
  for(const [table,id] of [['client_accounts',doc.account_id],['facilities',doc.facility_id]]) {
    const row=await ok(admin.from(table).select('id,is_demo').eq('id',id).maybeSingle());assert.ok(row?.id===id&&row.is_demo===true,'Synthetic context preflight failed.');
  }
  assertPrivateBucket(await ok(admin.storage.getBucket(PRIVATE_BUCKET)));
  await denied(admin.rpc('provision_document_version_grant',{p_document_id:randomUUID(),p_profile_id:randomUUID(),p_capability:'view_versions',p_request_id:randomUUID(),p_expected_revision:0}),'42501');

  const runId=randomUUID(),profiles=[randomUUID(),randomUUID()],directoryGrants=Array.from({length:6},()=>randomUUID());
  const owned={runId,createdAuth:[]},actors=[],objectRevisions=new Map(),documentGrants=[],objectGrants=[],versionIds=[];
  let documentRevision=initialRevision;
  t.after(async()=>{
    const failures=[];
    // Persist recovery diagnostics BEFORE any possibly failing cleanup. The
    // owner-supplied document/account/facility are context, never owned cleanup
    // targets. All bytes, versions, grants, audit and Auth identities are retained.
    t.diagnostic(`Retained synthetic run ${runId}; borrowed document ${documentId}; last observed document revision ${documentRevision}; objects ${JSON.stringify([...objectRevisions.keys()])}; versions ${JSON.stringify(versionIds)}; document grants ${JSON.stringify(documentGrants.map(g=>g.id))}; object grants ${JSON.stringify(objectGrants.map(g=>g.id))}; Auth IDs ${JSON.stringify(owned.createdAuth.map(a=>a.id))}; created profile IDs ${JSON.stringify(profiles)}; directory grant IDs ${JSON.stringify(directoryGrants)}.`);
    async function attempt(label,operation){try{await operation();}catch{failures.push(label);t.diagnostic(label);}}
    for(const g of documentGrants) if(!g.revoked) await attempt(`Retirement failed for owned document grant ${g.id}`,async()=>{
      const r=await ok(admin.rpc('revoke_document_version_grant',{p_document_id:documentId,p_grant_id:g.id,p_expected_revision:documentRevision}));documentRevision=r.document_revision;g.revoked=true;
    });
    for(const g of objectGrants) await attempt(`Retirement failed for owned object grant ${g.id}`,async()=>{
      const r=await ok(admin.rpc('revoke_private_object_grant',{p_object_id:g.objectId,p_grant_id:g.id,p_expected_revision:objectRevisions.get(g.objectId)}));objectRevisions.set(g.objectId,r.security_revision);
    });
    for(const [id,revision] of objectRevisions) await attempt(`Ingest closure failed for owned object ${id}`,async()=>{
      await ok(admin.rpc('set_private_object_controls',{p_object_id:id,p_expected_revision:revision,p_visibility_restricted:true,p_preservation_hold:true,p_ingest_closed:true}));
    });
    for(const [i,person] of actors.entries()) {
      await attempt(`Profile retirement failed for ${profiles[i]}`,async()=>{
        const columns='id,auth_user_id,auth_linked_once,identity_status,is_demo';
        const row=await ok(admin.from('user_profiles').select(columns).eq('id',profiles[i]).maybeSingle());if(!row)return;
        const ownedProfile=r=>r?.id===profiles[i]&&r.auth_user_id===person.id&&r.auth_linked_once===true&&r.is_demo===true;
        assert.ok(ownedProfile(row),'Exact created profile ownership is required.');
        const changed=await ok(admin.from('user_profiles').update({identity_status:'removed'}).eq('id',profiles[i]).eq('auth_user_id',person.id).eq('is_demo',true).select(columns));
        assert.equal(changed.length,1);assert.ok(ownedProfile(changed[0])&&changed[0].identity_status==='removed');
        const after=await ok(admin.from('user_profiles').select(columns).eq('id',profiles[i]).maybeSingle());
        assert.ok(ownedProfile(after)&&after.identity_status==='removed');
      });
      await attempt(`Membership retirement failed for owned profile ${profiles[i]}`,async()=>{
        const columns='account_id,user_profile_id,membership_status,is_demo';
        const read=()=>ok(admin.from('account_access').select(columns).eq('account_id',doc.account_id).eq('user_profile_id',profiles[i]).maybeSingle());
        const row=await read();if(!row)return;
        const ownedAccess=r=>r?.account_id===doc.account_id&&r.user_profile_id===profiles[i]&&r.is_demo===true;
        assert.ok(ownedAccess(row),'Exact created membership ownership is required.');
        const changed=await ok(admin.from('account_access').update({membership_status:'removed'}).eq('account_id',doc.account_id).eq('user_profile_id',profiles[i]).eq('is_demo',true).select(columns));
        assert.equal(changed.length,1);assert.ok(ownedAccess(changed[0])&&changed[0].membership_status==='removed');
        const after=await read();assert.ok(ownedAccess(after)&&after.membership_status==='removed');
      });
    }
    for(const [i,id] of directoryGrants.entries()) await attempt(`Directory grant retirement failed for ${id}`,async()=>{
      const columns='id,account_id,user_profile_id,revoked_at,is_demo',profile=profiles[Math.floor(i/3)];
      const read=()=>ok(admin.from('account_capability_grants').select(columns).eq('id',id).maybeSingle());
      const row=await read();if(!row)return;
      const ownedGrant=r=>r?.id===id&&r.account_id===doc.account_id&&r.user_profile_id===profile&&r.is_demo===true;
      const revoked=r=>typeof r?.revoked_at==='string'&&Number.isFinite(Date.parse(r.revoked_at));
      assert.ok(ownedGrant(row),'Exact created directory grant ownership is required.');
      if(revoked(row))return;
      const changed=await ok(admin.from('account_capability_grants').update({revoked_at:new Date().toISOString()}).eq('id',id).eq('account_id',doc.account_id).eq('user_profile_id',profile).eq('is_demo',true).select(columns));
      assert.equal(changed.length,1);assert.ok(ownedGrant(changed[0])&&revoked(changed[0]));
      const after=await read();assert.ok(ownedGrant(after)&&revoked(after));
    });
    // Shared cleanupFixtures requires every accessPairs account to occur in
    // idsByTable.client_accounts. Registering this borrowed account as owned is
    // forbidden; omitting its pairs also fails linked-access Auth-delete checks.
    t.diagnostic(`Auth identities retained for verified operator cleanup. Owned access retirement ${failures.length?'incomplete; exact failures reported above':'verified (or candidates absent)'}. No pre-existing document/account/facility was changed by cleanup; no application/audit history was deleted.`);
    assert.equal(failures.length,0,failures.join('; '));
  });
  for(const [i,label] of ['a','b'].entries()) {
    const email=`api-${runId}-${label}@identity-directory.invalid`,password=`${randomBytes(36).toString('base64url')}aA1!`;
    const created=await ok(admin.auth.admin.createUser({email,password,email_confirm:true}));recordCreatedAuth(owned,created.user,label);
    const login=client(config,config.publishableKey),session=await ok(login.auth.signInWithPassword({email,password}));
    assert.equal(session.user.id,created.user.id);assert.ok(session.session?.access_token);
    actors.push({id:created.user.id,token:session.session.access_token,data:client(config,config.publishableKey,session.session.access_token),login});
  }
  const [upload,review]=actors;
  await ok(admin.from('user_profiles').insert(actors.map((a,i)=>({id:profiles[i],auth_user_id:a.id,display_name:`Synthetic version fixture ${i}`,identity_status:'suspended',is_demo:true}))));
  await ok(admin.from('account_access').insert(profiles.map(id=>({account_id:doc.account_id,user_profile_id:id,membership_status:'active',is_demo:true}))));
  await ok(admin.from('account_capability_grants').insert(directoryGrants.map((id,i)=>({id,account_id:doc.account_id,user_profile_id:profiles[Math.floor(i/3)],
    capability_key:['view_account','view_asset','ingest_private_object'][i%3],scope_kind:i%3===0?'account':'facility',facility_id:i%3===0?null:doc.facility_id,is_demo:true}))));
  await ok(admin.from('user_profiles').update({identity_status:'active'}).in('id',profiles));
  const unavailable={document_id:null,state:'not_found_or_unavailable',items:[],next_cursor:null};
  assert.deepEqual(await ok(upload.data.rpc('list_document_versions',{p_document_id:documentId})),unavailable);
  for(const capability of ['view_versions','create_version']) {
    const g=await ok(admin.rpc('provision_document_version_grant',{p_document_id:documentId,p_profile_id:profiles[0],p_capability:capability,p_request_id:randomUUID(),p_expected_revision:documentRevision}));
    documentRevision=g.document_revision;documentGrants.push({id:g.grant_id,capability,revoked:false});
  }
  async function edge(method,path,body,extra={}) {
    let r;try{r=await safeFetch(`${config.url}/functions/v1/private-objects${path}`,{method,headers:{apikey:config.publishableKey,Authorization:`Bearer ${upload.token}`,
      'Content-Type':body instanceof Uint8Array?'text/plain':'application/json',...extra},body:body instanceof Uint8Array?body:JSON.stringify(body)});}catch{throw new Error('Edge request failed; details omitted.');}
    assert.ok(r.ok,'Synthetic transport prerequisite failed; details omitted.');return r.json();
  }
  const bytes=new TextEncoder().encode(`${SYNTHETIC_PREFIX}Immutable version API ${runId}\nNo real data.\n`),digest=await sha256(bytes);
  const reserved=await edge('POST','',{accountId:doc.account_id,facilityId:doc.facility_id,idempotencyKey:randomUUID(),byteSize:bytes.length,mediaType:'text/plain'}),id=reserved.objectId;
  objectRevisions.set(id,0);const received=await edge('PUT',`/${id}/bytes`,bytes,{'X-State-Revision':'1'});
  await edge('POST',`/${id}/finalize`,{expectedStateRevision:received.stateRevision});
  const g=await ok(admin.rpc('provision_private_object_grant',{p_object_id:id,p_profile_id:profiles[1],p_capability:'clear_object',p_request_id:randomUUID(),p_expected_revision:0}));
  objectGrants.push({id:g.grant_id,objectId:id});objectRevisions.set(id,g.security_revision);
  const a=await ok(admin.rpc('claim_private_object_scan',{p_object_id:id,p_expected_revision:g.security_revision,p_request_id:randomUUID(),p_adapter_kind:'synthetic_fixture',p_adapter_version:'api-fixture-v1',p_ruleset_version:'fixture-rules-v1'}));objectRevisions.set(id,a.security_revision);
  const o=await ok(admin.rpc('record_private_object_scan',{p_object_id:id,p_scan_attempt_id:a.scan_attempt_id,p_verified_sha256:digest,p_malware_outcome:'pass',p_phi_signal:'no_signal',p_reason_code:'synthetic_no_signal'}));objectRevisions.set(id,o.security_revision);
  const decision=await ok(review.data.rpc('decide_private_object_clearance',{p_object_id:id,p_scan_observation_id:o.scan_observation_id,p_verified_sha256:digest,p_expected_revision:o.security_revision,p_request_id:randomUUID(),p_decision:'cleared_no_phi',p_reason_code:'reviewed_no_phi'}));objectRevisions.set(id,decision.security_revision);
  const held=await ok(admin.rpc('set_private_object_controls',{p_object_id:id,p_expected_revision:decision.security_revision,p_visibility_restricted:false,p_preservation_hold:true,p_ingest_closed:false}));objectRevisions.set(id,held.security_revision);
  const args={p_object_id:id,p_expected_sha256:digest,p_document_id:documentId,p_expected_security_revision:held.security_revision,p_expected_document_revision:documentRevision,p_request_id:randomUUID()};
  await denied(admin.rpc('adopt_private_object',args),'42501');await denied(review.data.rpc('adopt_private_object',args),'42501');
  await denied(upload.data.rpc('adopt_private_object',{...args,p_expected_document_revision:documentRevision-1}),'40001');
  const v=await ok(upload.data.rpc('adopt_private_object',args));versionIds.push(v.version_id);documentRevision=v.document_revision;objectRevisions.set(id,v.security_revision);
  assert.equal(v.lifecycle_state,'internal_draft');assert.equal(v.verified_sha256,digest);assert.equal(v.preservation_hold_at_adoption,true);
  assert.deepEqual(await ok(upload.data.rpc('adopt_private_object',args)),v);
  const security=await ok(upload.data.rpc('private_object_security_status',{p_object_id:id}));assert.equal(security.ingest_closed,true);assert.equal(security.preservation_hold,true);
  const page=await ok(upload.data.rpc('list_document_versions',{p_document_id:documentId}));assert.ok(page.items.some(item=>item.version_id===v.version_id&&item.lifecycle_state==='internal_draft'));
  assert.deepEqual(await ok(review.data.rpc('list_document_versions',{p_document_id:documentId})),unavailable);
  const audit=await ok(admin.from('audit_events').select('object_id,event_type,actor_kind,actor_user_profile_id,actor_auth_user_id,actor_system_key,event_metadata').in('object_id',[id,v.version_id]));
  const adopted=audit.filter(e=>e.event_type==='document_version_adopted'),closed=audit.filter(e=>e.event_type==='private_object_ingest_closed');
  assert.equal(adopted.length,1);assert.equal(closed.length,1);assert.equal(adopted[0].object_id,v.version_id);assert.equal(closed[0].object_id,id);
  assert.ok([...adopted,...closed].every(e=>e.actor_kind==='user'&&e.actor_auth_user_id===upload.id&&e.actor_user_profile_id===profiles[0]&&e.actor_system_key===null));
  assert.equal(adopted[0].event_metadata.verified_sha256,digest);assert.equal(adopted[0].event_metadata.clearance_decision_id,decision.decision_id);
  const view=documentGrants.find(g=>g.capability==='view_versions');
  const revoked=await ok(admin.rpc('revoke_document_version_grant',{p_document_id:documentId,p_grant_id:view.id,p_expected_revision:documentRevision}));documentRevision=revoked.document_revision;view.revoked=true;
  assert.equal((await ok(upload.login.auth.getUser(upload.token))).user.id,upload.id);assert.deepEqual(await ok(upload.data.rpc('list_document_versions',{p_document_id:documentId})),unavailable);
  await denied(upload.data.rpc('adopt_private_object',args),'42501');
  t.diagnostic('If executed, this proves authentic synthetic adoption/read denial only. It does not prove real scanner effectiveness, professional approval, release, byte serving or true PostgreSQL concurrent-session ordering.');
});
