import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { configuration, preflightSchema, cleanupFixtures, recordCreatedAuth } from './fixture-cleanup.mjs';
import { assertPrivateBucket, PRIVATE_BUCKET } from '../../scripts/private-object-provision.mjs';
import { SYNTHETIC_PREFIX, sha256 } from '../../supabase/functions/private-objects/gateway.mjs';

function client(config,key,token) {
  return createClient(config.url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    ...(token?{global:{headers:{Authorization:`Bearer ${token}`},fetch:safeFetch}}:{global:{fetch:safeFetch}})});
}
const safeFetch=(input,init)=>fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(30_000),cache:'no-store'});
async function ok(operation) { let result;try{result=await operation;}catch{throw new Error('Provider request failed; details omitted.');}
  assert.ok(result && !result.error,'Provider operation failed; details omitted.');return result.data; }
const rows=(list)=>assert.ok(Array.isArray(list),'Expected provider rows; details omitted.');
function storageDenied(result, label) {
  // An SDK network/5xx/invalid-token failure is not evidence of RLS denial.
  // Storage can conceal a known existing object/bucket behind 404; the service
  // readback below proves this exact path exists. Accept documented legacy and
  // current codes only, without ever printing a raw error or signed URL.
  const error=result?.error;
  const known=new Set(['AccessDenied','NoSuchKey','NoSuchBucket','not_found','unauthorized']);
  const status=Number(error?.statusCode ?? error?.status);
  const denied=error && [400,403,404].includes(Number(error.status))
    && (error.code ? known.has(error.code) : [403,404].includes(status));
  assert.ok(denied,`${label}: expected a recognized Storage denial, not a transport, session, conflict or configuration failure.`);
}

test('private-file authentic Auth/Edge/Storage acceptance — secure configuration is mandatory',async(t)=>{
  // Absence is a failed prerequisite, never a skipped-to-pass API acceptance.
  const config=configuration();
  const admin=client(config,config.serviceRoleKey);
  await preflightSchema(admin);
  assertPrivateBucket(await ok(admin.storage.getBucket(PRIVATE_BUCKET)));
  const probe=await admin.rpc('private_object_transport_target',{p_object_id:randomUUID(),p_attempt_id:randomUUID()});
  assert.equal(probe.error?.code,'42501','Transport RPC provenance/schema preflight failed. No fixtures created.');
  const runId=randomUUID();
  const accountA=randomUUID(),accountB=randomUUID(),facilityA=randomUUID(),facilityA2=randomUUID(),facilityB=randomUUID();
  const profileA=randomUUID(),profileB=randomUUID();
  const grants=Array.from({length:6},()=>randomUUID());
  const f={runId,createdAuth:[],profileIdByAuthId:new Map(),auditProbe:randomUUID(),auditProbeAttempted:false,
    idsByTable:{client_accounts:[accountA,accountB],facilities:[facilityA,facilityA2,facilityB],user_profiles:[profileA,profileB],account_memberships:[],account_capability_grants:grants},
    accessPairs:[[accountA,profileA],[accountB,profileB]],
    grantTargets:grants.map((id,n)=>[id,n<3?accountA:accountB,n<3?profileA:profileB])};
  const objects=[];
  t.diagnostic(`Private-file synthetic run ${runId}; target ${config.url}; all application/audit history and bytes will be retained.`);
  t.after(async()=>{
    // Preserve application/audit rows AND every object byte. Only exact test-
    // created identities/access are retired by the already-reviewed helper.
    t.diagnostic(`Private object IDs retained, never deleted: ${JSON.stringify(objects)}. Run ${runId}.`);
    await cleanupFixtures(admin,f,message=>t.diagnostic(message));
  });
  async function subject(label,profileId) {
    const email=`api-${runId}-${label}@identity-directory.invalid`;
    const password=`${randomBytes(36).toString('base64url')}aA1!`;
    const created=await ok(admin.auth.admin.createUser({email,password,email_confirm:true}));
    recordCreatedAuth(f,created.user,label);f.profileIdByAuthId.set(created.user.id,profileId);
    const login=client(config,config.publishableKey);
    const signed=await ok(login.auth.signInWithPassword({email,password}));
    assert.equal(signed.user.id,created.user.id);assert.ok(signed.session?.access_token);
    const token=signed.session.access_token;
    assert.equal((await ok(login.auth.getUser(token))).user.id,created.user.id);
    return {id:created.user.id,token,data:client(config,config.publishableKey,token),login};
  }
  const a=await subject('a',profileA),b=await subject('b',profileB);
  await ok(admin.from('client_accounts').insert([{id:accountA,display_name:`Transport synthetic ${runId} A`,is_demo:true},{id:accountB,display_name:`Transport synthetic ${runId} B`,is_demo:true}]));
  await ok(admin.from('facilities').insert([{id:facilityA,account_id:accountA,display_name:'Synthetic A1',is_demo:true},
    {id:facilityA2,account_id:accountA,display_name:'Synthetic A2',is_demo:true},{id:facilityB,account_id:accountB,display_name:'Synthetic B1',is_demo:true}]));
  await ok(admin.from('user_profiles').insert([{id:profileA,auth_user_id:a.id,display_name:'Synthetic uploader A',identity_status:'suspended',is_demo:true},
    {id:profileB,auth_user_id:b.id,display_name:'Synthetic uploader B',identity_status:'suspended',is_demo:true}]));
  await ok(admin.from('account_access').insert([{account_id:accountA,user_profile_id:profileA,membership_status:'active',is_demo:true},
    {account_id:accountB,user_profile_id:profileB,membership_status:'active',is_demo:true}]));
  const capabilities=['view_account','view_asset','ingest_private_object'];
  await ok(admin.from('account_capability_grants').insert(grants.map((id,n)=>({id,account_id:n<3?accountA:accountB,
    user_profile_id:n<3?profileA:profileB,capability_key:capabilities[n%3],scope_kind:n%3===0?'account':'facility',
    facility_id:n%3===0?null:n<3?facilityA:facilityB,is_demo:true}))));
  await ok(admin.from('user_profiles').update({identity_status:'active'}).in('id',[profileA,profileB]));

  async function edge(person,method,path='',body,extra={}) {
    let result;
    try { result=await safeFetch(`${config.url}/functions/v1/private-objects${path}`,{method,headers:{apikey:config.publishableKey,
      Authorization:`Bearer ${person.token}`,...(body instanceof Uint8Array?{'Content-Type':'text/plain','X-State-Revision':'1'}:body?{'Content-Type':'application/json'}:{}),...extra},
      ...(body?{body:body instanceof Uint8Array?body:JSON.stringify(body)}:{})}); }
    catch{throw new Error('Edge request failed; details omitted.');}
    let value;try{value=await result.json();}catch{throw new Error('Expected safe Edge JSON; deployment/configuration preflight failed.');}
    return {status:result.status,value};
  }
  const bytes=new TextEncoder().encode(`${SYNTHETIC_PREFIX}Authentic provider roundtrip ${runId}\nNo real data.\n`);
  const key=randomUUID();
  const declaration={accountId:accountA,facilityId:facilityA,idempotencyKey:key,byteSize:bytes.length,mediaType:'text/plain'};
  const reserved=await edge(a,'POST','',declaration);
  assert.equal(reserved.status,201,'Enable only reviewed synthetic reservation config and deployed synthetic gateway before running.');
  const objectId=reserved.value.objectId;objects.push(objectId);
  assert.equal((await edge(a,'POST','',declaration)).value.objectId,objectId);
  assert.equal((await edge(a,'POST','',{...declaration,byteSize:bytes.length-1})).status,409);
  for(const d of [{facilityId:facilityA2},{accountId:accountB,facilityId:facilityB}]) assert.equal((await edge(a,'POST','',{...declaration,...d,idempotencyKey:randomUUID()})).status,404);
  const forbidden=await edge(b,'GET',`/${objectId}`),missing=await edge(b,'GET',`/${randomUUID()}`);
  // Matching outages, invalid sessions or successful responses prove no denial.
  for(const response of [forbidden,missing]) {
    assert.equal(response.status,404,'Cross-account GET must return the expected unavailable denial.');
    assert.deepEqual(response.value,{error:'not_found_or_unavailable'},'Cross-account GET must return only the safe unavailable error.');
  }
  assert.deepEqual(forbidden,missing);
  assert.equal((await edge(b,'PUT',`/${objectId}/bytes`,bytes)).status,404);
  const received=await edge(a,'PUT',`/${objectId}/bytes`,bytes);assert.equal(received.status,200);assert.equal(received.value.state,'stored_unverified');
  assert.equal(received.value.quarantined,true);assert.equal(received.value.scanState,'pending');
  assert.equal((await edge(a,'PUT',`/${objectId}/bytes`,bytes)).status,200);
  const changed=bytes.slice();changed[changed.length-2]^=1;assert.equal((await edge(a,'PUT',`/${objectId}/bytes`,changed)).status,409);
  const objectPath=`${accountA}/${facilityA}/${objectId}/payload`;
  const providerBlob=await ok(admin.storage.from(PRIVATE_BUCKET).download(objectPath));
  assert.equal(await sha256(await providerBlob.arrayBuffer()),await sha256(bytes));assert.equal(providerBlob.size,bytes.length);
  assert.equal(providerBlob.type.split(';')[0].trim().toLowerCase(),'text/plain');
  // Ordinary direct APIs stay denied, including guessing a manifest-owned key.
  for(const ordinary of [a.data,b.data,client(config,config.publishableKey)]) {
    storageDenied(await ordinary.storage.from(PRIVATE_BUCKET).download(objectPath),'Direct download');
    const listed=await ordinary.storage.from(PRIVATE_BUCKET).list(`${accountA}/${facilityA}/${objectId}`);
    if(listed.error)storageDenied(listed,'Direct listing');
    else assert.ok(Array.isArray(listed.data)&&listed.data.length===0,'Direct listing leaked objects.');
    storageDenied(await ordinary.storage.from(PRIVATE_BUCKET).upload(objectPath,changed,{contentType:'text/plain',upsert:true}),'Overwrite');
    storageDenied(await ordinary.storage.from(PRIVATE_BUCKET).createSignedUrl(objectPath,60),'Signing');
    storageDenied(await ordinary.storage.from(PRIVATE_BUCKET).createSignedUploadUrl(objectPath),'Upload signing');
  }
  const preserved=await ok(admin.storage.from(PRIVATE_BUCKET).download(objectPath));
  assert.equal(await sha256(await preserved.arrayBuffer()),await sha256(bytes),'Denied changed-byte overwrites must preserve the original.');
  assert.equal((await edge(a,'GET',`/${objectId}/content`)).status,404);
  assert.equal((await edge(a,'POST',`/${objectId}/clearance`,{})).status,404);
  const final=await edge(a,'POST',`/${objectId}/finalize`,{expectedStateRevision:received.value.stateRevision});
  assert.equal(final.status,200);assert.equal(final.value.state,'finalized');assert.equal(final.value.quarantined,true);
  assert.equal(final.value.clearanceState,'pending');
  assert.deepEqual(await edge(a,'POST',`/${objectId}/finalize`,{expectedStateRevision:received.value.stateRevision}),final);
  // A second object is received, then the same retained JWT loses entitlement.
  const second=await edge(a,'POST','',{...declaration,idempotencyKey:randomUUID()});assert.equal(second.status,201);objects.push(second.value.objectId);
  const staged=await edge(a,'PUT',`/${second.value.objectId}/bytes`,bytes);assert.equal(staged.status,200);
  await ok(admin.from('account_capability_grants').update({revoked_at:new Date().toISOString()}).eq('id',grants[2]));
  assert.equal((await ok(a.login.auth.getUser(a.token))).user.id,a.id,'Original JWT still valid at Auth.');
  assert.equal((await edge(a,'POST',`/${second.value.objectId}/finalize`,{expectedStateRevision:staged.value.stateRevision})).status,404);
  assert.equal((await edge(a,'GET',`/${objectId}`)).status,404);
  const audit=await ok(admin.from('audit_events').select('object_id,event_type,actor_kind,actor_auth_user_id,event_metadata').in('object_id',objects));rows(audit);
  const finalized=audit.filter(x=>x.object_id===objectId&&x.event_type==='private_object_finalized');
  assert.equal(finalized.length,1);
  assert.ok(finalized[0].actor_kind==='user'&&finalized[0].actor_auth_user_id===a.id,'Finalization must retain the genuine user actor.');
  assert.equal(audit.filter(x=>x.object_id===second.value.objectId&&x.event_type==='private_object_finalized').length,0);
  for(const id of objects){
    const receivedEvents=audit.filter(x=>x.object_id===id&&x.event_type==='private_object_upload_received');
    assert.equal(receivedEvents.length,1,'Each provider receipt must have one durable audit event.');
    assert.ok(receivedEvents[0].actor_kind==='system'&&receivedEvents[0].actor_auth_user_id===null,'A provider receipt is not a human action.');
  }
  t.diagnostic('Genuine synthetic Auth → Edge → provider bytes → trusted receipt → user finalization checked. Scan/human clearance and production acceptance remain unaccepted; transforms/resumable/S3 route inventory and target concurrency require separate evidence.');
});
