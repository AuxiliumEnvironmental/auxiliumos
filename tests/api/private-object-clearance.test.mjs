import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { configuration, preflightSchema, cleanupFixtures, recordCreatedAuth } from './fixture-cleanup.mjs';
import { assertPrivateBucket, PRIVATE_BUCKET } from '../../scripts/private-object-provision.mjs';
import { SYNTHETIC_PREFIX, sha256 } from '../../supabase/functions/private-objects/gateway.mjs';

const safeFetch = (input, init) => fetch(input, {...init,redirect:'error',signal:AbortSignal.timeout(30_000),cache:'no-store'});
const client = (config,key,token) => createClient(config.url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  global:{fetch:safeFetch,...(token ? {headers:{Authorization:`Bearer ${token}`}} : {})}});
async function ok(operation) {
  let result; try { result=await operation; } catch { throw new Error('Provider request failed; details omitted.'); }
  assert.ok(result && !result.error,'Provider operation failed; details omitted.'); return result.data;
}
async function denied(operation,code) {
  let result; try { result=await operation; } catch { throw new Error('Provider request failed; details omitted.'); }
  assert.equal(result.error?.code,code,'Expected safe RPC denial; provider details omitted.');
}

test('private-object security authentic Auth/Data API + synthetic scan fixture — secure configuration required',async (t) => {
  // Missing configuration fails before any request; never skip-to-pass.
  // This test creates only marked synthetic text, never invokes a real scanner,
  // and must be separately authorized before execution against the dev service.
  const config=configuration(), admin=client(config,config.serviceRoleKey);
  await preflightSchema(admin);
  assertPrivateBucket(await ok(admin.storage.getBucket(PRIVATE_BUCKET)));
  await denied(admin.rpc('claim_private_object_scan',{p_object_id:randomUUID(),p_expected_revision:0,p_request_id:randomUUID(),
    p_adapter_kind:'synthetic_fixture',p_adapter_version:'api-fixture-v1',p_ruleset_version:'synthetic-rules-v1'}),'42501');

  const runId=randomUUID(), accountA=randomUUID(), accountB=randomUUID(), facilityA=randomUUID(), facilityB=randomUUID();
  const profiles=[randomUUID(),randomUUID(),randomUUID()], membership=randomUUID(), grants=Array.from({length:8},() => randomUUID());
  const f={runId,createdAuth:[],profileIdByAuthId:new Map(),auditProbe:randomUUID(),auditProbeAttempted:false,
    idsByTable:{client_accounts:[accountA,accountB],facilities:[facilityA,facilityB],user_profiles:profiles,account_memberships:[membership],account_capability_grants:grants},
    accessPairs:[[accountA,profiles[0]],[accountA,profiles[1]],[accountB,profiles[2]]],
    grantTargets:grants.map((id,n) => [id,n<5?accountA:accountB,profiles[n<3?0:n<5?1:2]])};
  const objects=new Map(), objectGrants=[];
  t.after(async () => {
    const failures=[];
    try {
      // Exact new object/grant IDs only. No bytes, manifests, decisions, audit
      // records or application rows are deleted. Close only this run's ingest.
      for (const g of objectGrants) if (!g.revoked) {
        try {
          const result=await ok(admin.rpc('revoke_private_object_grant',{p_object_id:g.objectId,p_grant_id:g.id,p_expected_revision:objects.get(g.objectId)}));
          objects.set(g.objectId,result.security_revision);g.revoked=true;
        } catch { failures.push(`Private synthetic grant retirement failed for ${g.id}`); }
      }
      for (const [id,revision] of objects) {
        try { await ok(admin.rpc('set_private_object_controls',{p_object_id:id,p_expected_revision:revision,
          p_visibility_restricted:true,p_preservation_hold:false,p_ingest_closed:true})); }
        catch { failures.push(`Private synthetic ingest closure failed for ${id}`); }
      }
    } finally {
      t.diagnostic(`Retained synthetic private object/history IDs: ${JSON.stringify([...objects.keys()])}; run ${runId}.`);
      t.diagnostic(`Retained synthetic private grant/history IDs: ${JSON.stringify(objectGrants.map(g => ({id:g.id,objectId:g.objectId})))}; run ${runId}.`);
      for (const failure of failures) t.diagnostic(failure);
      // Shared cleanup may throw; emit recovery evidence first and allow its
      // original error to propagate rather than replacing it with our summary.
      await cleanupFixtures(admin,f,message => t.diagnostic(message));
    }
    assert.equal(failures.length,0,failures.join('; '));
  });
  async function subject(label,profileId) {
    const email=`api-${runId}-${label}@identity-directory.invalid`, password=`${randomBytes(36).toString('base64url')}aA1!`;
    const created=await ok(admin.auth.admin.createUser({email,password,email_confirm:true}));
    recordCreatedAuth(f,created.user,label);f.profileIdByAuthId.set(created.user.id,profileId);
    const login=client(config,config.publishableKey), signed=await ok(login.auth.signInWithPassword({email,password}));
    assert.equal(signed.user.id,created.user.id);assert.ok(signed.session?.access_token);
    return {id:created.user.id,token:signed.session.access_token,login,data:client(config,config.publishableKey,signed.session.access_token)};
  }
  const upload=await subject('a',profiles[0]),review=await subject('b',profiles[1]),outsider=await subject('role-only',profiles[2]);
  await ok(admin.from('client_accounts').insert([{id:accountA,display_name:`Security synthetic A ${runId}`,is_demo:true},{id:accountB,display_name:`Security synthetic B ${runId}`,is_demo:true}]));
  await ok(admin.from('facilities').insert([{id:facilityA,account_id:accountA,display_name:'Synthetic A1',is_demo:true},{id:facilityB,account_id:accountB,display_name:'Synthetic B1',is_demo:true}]));
  await ok(admin.from('user_profiles').insert([upload,review,outsider].map((person,n) => ({id:profiles[n],auth_user_id:person.id,
    display_name:`Synthetic security actor ${n}`,identity_status:'suspended',is_demo:true}))));
  await ok(admin.from('account_access').insert(profiles.map((id,n) => ({account_id:n<2?accountA:accountB,user_profile_id:id,membership_status:'active',is_demo:true}))));
  await ok(admin.from('account_memberships').insert({id:membership,account_id:accountA,user_profile_id:profiles[1],role_key:'system_admin',is_demo:true}));
  const capabilities=['view_account','view_asset','ingest_private_object','view_account','view_asset','view_account','view_asset','ingest_private_object'];
  await ok(admin.from('account_capability_grants').insert(grants.map((id,n) => ({id,account_id:n<5?accountA:accountB,
    user_profile_id:profiles[n<3?0:n<5?1:2],capability_key:capabilities[n],scope_kind:capabilities[n]==='view_account'?'account':'facility',
    facility_id:capabilities[n]==='view_account'?null:n<5?facilityA:facilityB,is_demo:true}))));
  await ok(admin.from('user_profiles').update({identity_status:'active'}).in('id',profiles));

  async function edge(method,path,body,extra={}) {
    let response;try { response=await safeFetch(`${config.url}/functions/v1/private-objects${path}`,{method,headers:{apikey:config.publishableKey,
      Authorization:`Bearer ${upload.token}`,'Content-Type':body instanceof Uint8Array?'text/plain':'application/json',...extra},body:body instanceof Uint8Array?body:JSON.stringify(body)}); }
    catch { throw new Error('Edge request failed; details omitted.'); }
    assert.ok(response.ok,'Synthetic transport gateway prerequisite failed; provider details omitted.');
    try { return await response.json(); } catch { throw new Error('Expected safe Edge JSON.'); }
  }
  const bytes=new TextEncoder().encode(`${SYNTHETIC_PREFIX}Security fixture ${runId}\nNo real data.\n`), digest=await sha256(bytes);
  const reserved=await edge('POST','',{accountId:accountA,facilityId:facilityA,idempotencyKey:randomUUID(),byteSize:bytes.length,mediaType:'text/plain'});
  const id=reserved.objectId;objects.set(id,0);
  const received=await edge('PUT',`/${id}/bytes`,bytes,{'X-State-Revision':'1'});
  await edge('POST',`/${id}/finalize`,{expectedStateRevision:received.stateRevision});
  const state = person => ok(person.data.rpc('private_object_security_status',{p_object_id:id}));
  const revision = result => { objects.set(id,result.security_revision); return result; };
  assert.equal((await state(upload)).verified_sha256,digest);
  assert.equal((await state(upload)).security_clearance_eligible,false);
  const missing={object_id:null,state:'not_found_or_unavailable'};
  assert.deepEqual(await state(review),missing);assert.deepEqual(await state(outsider),missing);
  assert.deepEqual(await ok(outsider.data.rpc('private_object_security_status',{p_object_id:randomUUID()})),missing);

  const provisionArgs={p_object_id:id,p_profile_id:profiles[1],p_capability:'clear_object',p_request_id:randomUUID(),p_expected_revision:0};
  const g=revision(await ok(admin.rpc('provision_private_object_grant',provisionArgs)));objectGrants.push({id:g.grant_id,objectId:id,revoked:false});
  assert.deepEqual(await ok(admin.rpc('provision_private_object_grant',provisionArgs)),g);
  await denied(upload.data.rpc('provision_private_object_grant',provisionArgs),'42501');
  assert.equal((await state(review)).state,'scan_pending');
  const claimArgs={p_object_id:id,p_expected_revision:g.security_revision,p_request_id:randomUUID(),p_adapter_kind:'synthetic_fixture',p_adapter_version:'api-fixture-v1',p_ruleset_version:'synthetic-rules-v1'};
  await denied(admin.rpc('claim_private_object_scan',{...claimArgs,p_adapter_kind:'provider'}),'22023');
  const a=revision(await ok(admin.rpc('claim_private_object_scan',claimArgs)));
  const observeArgs={p_object_id:id,p_scan_attempt_id:a.scan_attempt_id,p_verified_sha256:digest,p_malware_outcome:'pass',p_phi_signal:'no_signal',p_reason_code:'synthetic_no_signal'};
  await denied(admin.rpc('record_private_object_scan',{...observeArgs,p_verified_sha256:'f'.repeat(64)}),'40001');
  const o=revision(await ok(admin.rpc('record_private_object_scan',observeArgs)));
  assert.deepEqual(await ok(admin.rpc('record_private_object_scan',observeArgs)),o);
  assert.equal((await state(review)).state,'human_review_required');
  const decisionArgs={p_object_id:id,p_scan_observation_id:o.scan_observation_id,p_verified_sha256:digest,p_expected_revision:o.security_revision,
    p_request_id:randomUUID(),p_decision:'cleared_no_phi',p_reason_code:'reviewed_no_phi'};
  await denied(admin.rpc('decide_private_object_clearance',decisionArgs),'42501');
  await denied(upload.data.rpc('decide_private_object_clearance',decisionArgs),'42501');
  await denied(review.data.rpc('decide_private_object_clearance',{...decisionArgs,p_expected_revision:o.security_revision-1}),'40001');
  const d=revision(await ok(review.data.rpc('decide_private_object_clearance',decisionArgs)));
  assert.deepEqual(await ok(review.data.rpc('decide_private_object_clearance',decisionArgs)),d);
  assert.equal((await state(upload)).security_clearance_eligible,true);

  const reported=revision(await ok(upload.data.rpc('report_private_object_phi',{p_object_id:id,p_expected_revision:d.security_revision})));
  assert.equal(reported.security_clearance_eligible,false);assert.equal(reported.clearance_decision_id,null);assert.equal(reported.visibility_restricted,true);
  const lifted=revision(await ok(admin.rpc('set_private_object_controls',{p_object_id:id,p_expected_revision:reported.security_revision,p_visibility_restricted:false,p_preservation_hold:true,p_ingest_closed:false})));
  assert.equal(lifted.security_clearance_eligible,false);assert.equal(lifted.preservation_hold,true);
  const fpArgs={...decisionArgs,p_expected_revision:lifted.security_revision,p_request_id:randomUUID(),p_reason_code:'false_positive_reviewed'};
  const fp=revision(await ok(review.data.rpc('decide_private_object_clearance',fpArgs)));
  assert.equal((await state(review)).security_clearance_eligible,true);
  const rescan=revision(await ok(admin.rpc('claim_private_object_scan',{...claimArgs,p_request_id:randomUUID(),p_expected_revision:fp.security_revision})));
  assert.equal((await state(review)).security_clearance_eligible,false);
  await denied(admin.rpc('record_private_object_scan',observeArgs),'40001');
  const revocation=revision(await ok(admin.rpc('revoke_private_object_grant',{p_object_id:id,p_grant_id:g.grant_id,p_expected_revision:rescan.security_revision})));
  objectGrants[0].revoked=true;
  assert.equal((await ok(review.login.auth.getUser(review.token))).user.id,review.id,'Same bearer still valid at Auth.');
  assert.deepEqual(await state(review),missing);
  await denied(review.data.rpc('decide_private_object_clearance',{...fpArgs,p_expected_revision:revocation.security_revision,p_request_id:randomUUID()}),'42501');
  const audit=await ok(admin.from('audit_events').select('object_id,object_type,event_type,actor_kind,actor_user_profile_id,actor_auth_user_id,actor_system_key,event_metadata').in('object_id',[id,g.grant_id,o.scan_observation_id,d.decision_id,fp.decision_id]));
  assert.equal(audit.filter(x => x.event_type==='private_object_clearance_recorded').length,2);
  assert.deepEqual(audit.filter(x => x.event_type==='private_object_clearance_recorded').map(x => x.object_id).sort(),[d.decision_id,fp.decision_id].sort());
  assert.ok(audit.filter(x => x.event_type==='private_object_clearance_recorded').every(x => x.actor_kind==='user' && x.actor_auth_user_id===review.id));
  const scanEvents=audit.filter(x => x.event_type==='private_object_scan_recorded');
  assert.equal(scanEvents.length,1,'The exact scan observation must have one audit event, including after its retry.');
  assert.deepEqual(scanEvents.map(x => [x.object_type,x.object_id,x.event_metadata.object_id,x.event_metadata.scan_attempt_id,x.event_metadata.verified_sha256]),
    [['private_object_scan',o.scan_observation_id,id,a.scan_attempt_id,digest]]);
  const scanClaims=audit.filter(x => x.event_type==='private_object_scan_claimed');
  assert.equal(scanClaims.length,2,'The original scan and rescan must each have one claim audit event.');
  assert.deepEqual(scanClaims.map(x => x.event_metadata.scan_attempt_id).sort(),[a.scan_attempt_id,rescan.scan_attempt_id].sort());
  assert.ok(scanClaims.every(x => x.object_type==='private_object' && x.object_id===id && x.event_metadata.object_id===id && x.event_metadata.verified_sha256===digest));
  assert.ok([...scanEvents,...scanClaims].every(x => x.actor_kind==='system' && x.actor_user_profile_id===null
    && x.actor_auth_user_id===null && x.actor_system_key==='database_privileged_operation'));
  t.diagnostic('Authentic API scenario, if executed, proves typed synthetic state/identity isolation only. It proves no real scanner effectiveness, content inspection, professional approval, document adoption or PostgreSQL two-session ordering.');
});
