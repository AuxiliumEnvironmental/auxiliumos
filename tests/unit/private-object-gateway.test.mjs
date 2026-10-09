import assert from 'node:assert/strict';
import test from 'node:test';
import { createPrivateObjectGateway, boundedBytes, MAX_BYTES, SYNTHETIC_PREFIX, sha256 } from '../../supabase/functions/private-objects/gateway.mjs';
import { provisionPrivateBucket, assertPrivateBucket, PRIVATE_BUCKET_OPTIONS } from '../../scripts/private-object-provision.mjs';

const objectId='10000000-0000-4000-8000-000000000001';
const attemptId='10000000-0000-4000-8000-000000000002';
const receiptId='10000000-0000-4000-8000-000000000003';
const otherId='10000000-0000-4000-8000-000000000004';
const bytes=new TextEncoder().encode(`${SYNTHETIC_PREFIX}development fixture only`);
const path=`${otherId}/${otherId}/${objectId}/payload`;
const ok=(data)=>({data,error:null});
const failure=(code='42501')=>({data:null,error:{code,message:'secret raw provider path must never escape'}});

function fixture(overrides={}) {
  const state={state:'reserved',revision:1,bound:null,stored:null,receipt:null,fail:null,allowed:true,
    users:[],calls:[],puts:0,gets:0,auth:0,serviceClients:0,...overrides};
  const safe=()=>({object_id:objectId,state:state.state,state_revision:state.revision,expires_at:'2026-10-10T00:00:00Z',
    scan_state:'pending',clearance_state:'pending',quarantined:true,failure_code:state.fail,
    next_action:state.state==='finalized'?'await_scan_and_human_clearance':state.state==='stored_unverified'?'finalize':'retry_same_bytes'});
  const user=(token)=>{
    state.users.push(token);
    return {
      auth:{getUser:async(received)=>{state.auth++;assert.equal(token,received);return state.invalidToken?failure():ok({user:{id:otherId,is_anonymous:false}});}},
      rpc:async(name,args)=>{
        state.calls.push(['user',name,args]);
        if(!state.allowed || args.p_object_id===otherId) return name==='private_file_status'?ok({object_id:null,state:'not_found_or_unavailable'}):failure();
        if(state.invalidRole) return failure('28000');
        if(name==='reserve_private_object')return ok([{object_id:objectId,state:'reserved',state_revision:1}]);
        if(name==='private_file_status')return ok(safe());
        if(name==='claim_private_object_upload'){
          if(state.state==='reserved'){state.state='receiving';state.revision=2;}
          return ok([{attempt_id:attemptId,state:state.state,state_revision:state.revision}]);
        }
        if(name==='authorize_private_object_finalize'){
          if(!state.bound || args.p_expected_revision!==state.revision)return failure('40001');
          return ok([{attempt_id:attemptId,state:state.state,state_revision:state.revision}]);
        }
        if(name==='finalize_private_object'){
          assert.equal(args.p_receipt_id,receiptId);assert.equal(args.p_attempt_id,attemptId);
          if(state.revokeBeforeFinal){state.allowed=false;return failure();}
          state.state='finalized';state.revision=4;return ok(safe());
        }
        throw Error(`unexpected user RPC ${name}`);
      },
    };
  };
  const service=()=>{
    state.serviceClients++;
    return {
      rpc:async(name,args)=>{
        state.calls.push(['service',name,args]);
        if(name==='bind_private_object_upload'){
          if(args.p_byte_size!==bytes.length)return failure('22023');
          if(state.bound && state.bound!==args.p_sha256)return failure('23505');
          state.bound=args.p_sha256;return ok(null);
        }
        if(name==='private_object_transport_target')return ok([{bucket_id:'os-private-ingest',object_key:state.badPath??path,
          sha256:state.bound,byte_size:bytes.length,media_type:'text/plain',state:state.state,state_revision:state.revision}]);
        if(name==='record_private_object_receipt'){
          if(state.receiptFail){state.receiptFail=false;return failure('XX000');}
          assert.equal(args.p_sha256,state.bound);
          state.receipt=receiptId;state.state='stored_unverified';state.revision=3;state.fail=null;
          if(state.revokeAfterReceipt)state.allowed=false;
          return ok([{receipt_id:receiptId,state_revision:3}]);
        }
        if(name==='record_private_object_failure'){
          if(state.failureRecordFail)return failure('XX000');
          state.fail=args.p_failure_code;return ok(null);
        }
        throw Error(`unexpected service RPC ${name}`);
      },
      storage:{from:(bucket)=>{
        assert.equal(bucket,'os-private-ingest');
        return {
          upload:async(key,input,options)=>{
            state.puts++;assert.equal(key,path);assert.equal(options.upsert,false);assert.equal(options.contentType,'text/plain');
            if(state.putFailure)return failure();
            if(state.stored)return failure('Duplicate');
            state.stored=new Uint8Array(input);
            if(state.lostPutResponse)throw Error('transport response lost after commit');
            return ok({path:'NEVER expose this provider path'});
          },
          download:async(key)=>{
            state.gets++;assert.equal(key,path);
            if(state.readFailure)return failure();
            if(!state.stored)return {data:null,error:{statusCode:'404',message:'sensitive provider text'}};
            return ok(new Blob([state.corrupt?bytes.map(x=>x^1):state.stored],{type:state.badType?'text/html':'text/plain'}));
          },
        };
      }},
    };
  };
  const handle=createPrivateObjectGateway({enabled:state.enabled??true,allowedOrigins:['https://app.test'],createUserClient:user,createServiceClient:service});
  const request=(method,tail='',body,headers={})=>handle(new Request(`https://edge.test/functions/v1/private-objects${tail}`,{
    method,headers:{authorization:'Bearer real.user.token',...(body instanceof Uint8Array?{'content-type':'text/plain','x-state-revision':'1'}:body!==undefined?{'content-type':'application/json'}:{}),...headers},
    ...(body!==undefined?{body:body instanceof Uint8Array?body:JSON.stringify(body)}:{}),
  }));
  const upload=(input=bytes)=>request('PUT',`/${objectId}/bytes`,input);
  const finalize=()=>request('POST',`/${objectId}/finalize`,{expectedStateRevision:state.revision});
  return {state,request,upload,finalize};
}

test('actual handler: provider round trip is readback verified and finalized only by fresh user RPC',async()=>{
  const f=fixture();const received=await f.upload();
  assert.equal(received.status,200);const stored=await received.json();assert.equal(stored.state,'stored_unverified');
  assert.equal(stored.quarantined,true);assert.equal(f.state.gets,1);assert.equal(f.state.bound,await sha256(bytes));
  const final=await f.finalize();assert.equal(final.status,200);assert.equal((await final.json()).state,'finalized');
  assert.equal(f.state.gets,2);assert.equal(f.state.auth,2);assert.equal(f.state.users.length,2);assert.equal(f.state.serviceClients,2);
  for(const [kind,name] of f.state.calls) {
    if(['claim_private_object_upload','authorize_private_object_finalize','finalize_private_object','private_file_status'].includes(name))assert.equal(kind,'user');
    else assert.equal(kind,'service');
  }
  assert.equal(JSON.stringify(stored).includes('payload'),false);assert.equal(Object.hasOwn(stored,'sha256'),false);
});

test('ambiguous provider success and repeated PUT recover without overwrite or new attempt',async()=>{
  const f=fixture({lostPutResponse:true});assert.equal((await f.upload()).status,200);
  const first=f.state.stored;assert.equal((await f.upload()).status,200);assert.deepEqual(f.state.stored,first);
  assert.equal(f.state.puts,2);assert.equal(f.state.gets,2);
  const changed=bytes.slice();changed[changed.length-1]^=1;
  assert.equal((await f.upload(changed)).status,409);assert.equal(f.state.puts,2);
});

test('provider put failure never claims receipt; exact retry recovers',async()=>{
  const f=fixture({putFailure:true});const result=await f.upload();assert.equal(result.status,503);
  assert.equal((await result.json()).error,'provider_missing');assert.equal(f.state.receipt,null);assert.equal(f.state.state,'receiving');
  f.state.putFailure=false;assert.equal((await f.upload()).status,200);assert.equal(f.state.receipt,receiptId);
});

test('receipt commit failure preserves bytes; finalization readback reconciles without reupload',async()=>{
  const f=fixture({receiptFail:true});assert.equal((await f.upload()).status,503);
  assert.deepEqual(f.state.stored,bytes);assert.equal(f.state.state,'receiving');assert.equal(f.state.fail,'receipt_unavailable');
  const result=await f.finalize();assert.equal(result.status,200);assert.equal((await result.json()).state,'finalized');assert.equal(f.state.puts,1);
});

test('content/type/readback mismatches remain quarantined, never finalizable',async()=>{
  for(const error of ['corrupt','badType','readFailure']) {
    const f=fixture({[error]:true});const result=await f.upload();assert.ok([409,503].includes(result.status));
    assert.equal(f.state.receipt,null);assert.equal(f.state.state,'receiving');
    const final=await f.finalize();assert.ok([409,503].includes(final.status));assert.notEqual(f.state.state,'finalized');
  }
});

test('current authorization before and after I/O controls finalization and status',async()=>{
  const f=fixture({revokeBeforeFinal:true});assert.equal((await f.upload()).status,200);
  assert.equal((await f.finalize()).status,404);assert.equal(f.state.state,'stored_unverified');
  assert.equal((await f.request('GET',`/${objectId}`)).status,404);
  const revoked=fixture({revokeAfterReceipt:true});assert.equal((await revoked.upload()).status,404);
  assert.deepEqual(revoked.state.stored,bytes);assert.equal(revoked.state.state,'stored_unverified');
});

test('unavailable/invalid identities never reach service; client data cannot choose actor/path/digest',async()=>{
  for(const controls of [{allowed:false},{invalidToken:true},{invalidRole:true}]) {
    const f=fixture(controls);const result=await f.upload();assert.ok([401,404].includes(result.status));assert.equal(f.state.serviceClients,0);
    assert.equal((await result.text()).includes('secret'),false);
  }
  const f=fixture();const input={accountId:otherId,facilityId:otherId,idempotencyKey:otherId,byteSize:bytes.length,mediaType:'text/plain'};
  for(const extra of [{actor:otherId},{path:'x'},{sha256:'a'.repeat(64)},{isDemo:true},{release:true}]) {
    assert.equal((await f.request('POST','',{...input,...extra})).status,400);
  }
  assert.equal((await f.request('POST','',input)).status,201);assert.equal(f.state.serviceClients,0);
});

test('UTF8/size/header and synthetic-only bounds are enforced without accepting active content',async()=>{
  for(const input of [new Uint8Array(MAX_BYTES+1),new Uint8Array([0xff]),new TextEncoder().encode('unmarked arbitrary file'),new TextEncoder().encode(`${SYNTHETIC_PREFIX}\0`)]) {
    const f=fixture();assert.ok([400,413].includes((await f.upload(input)).status));assert.equal(f.state.puts,0);
  }
  const f=fixture();
  for(const headers of [{'content-type':'text/html'},{'content-encoding':'gzip'},{range:'bytes=0-5'},{'x-upsert':'true'}]) {
    assert.equal((await f.request('PUT',`/${objectId}/bytes`,bytes,headers)).status,400);
  }
  assert.equal(f.state.puts,0);
});

test('read/clearance/scan/adoption/URL routes do not exist, and status is safely projected',async()=>{
  const f=fixture();for(const tail of ['/content','/quarantine-content','/clearance','/scan','/adopt','/signed-url']) {
    assert.equal((await f.request('GET',`/${objectId}${tail}`)).status,404);
  }
  assert.equal((await f.request('GET',`/${objectId}?path=anything`)).status,404);assert.equal(f.state.serviceClients,0);
  assert.equal((await f.request('GET',`/${otherId}`)).status,404);
});

test('disabled/origin boundaries and opaque operational faults do not leak backend details',async()=>{
  const disabled=fixture({enabled:false});assert.equal((await disabled.upload()).status,503);assert.equal(disabled.state.auth,0);
  const f=fixture({putFailure:true,failureRecordFail:true});const result=await f.upload();
  assert.deepEqual(await result.json(),{error:'provider_missing',operationalFault:'failure_record_unavailable'});
  const cors=fixture();const denied=await cors.request('GET',`/${objectId}`,undefined,{origin:'https://evil.test'});
  assert.equal(denied.status,403);assert.equal(cors.state.auth,0);assert.equal(denied.headers.has('Access-Control-Allow-Origin'),false);
  const allowed=await cors.request('GET',`/${objectId}`,undefined,{origin:'https://app.test'});
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'),'https://app.test');assert.equal(allowed.headers.get('Cache-Control'),'private, no-store');
});

test('malformed server targets fail closed before Storage, and streams are bounded without content-length trust',async()=>{
  const f=fixture({badPath:`${otherId}/${otherId}/${otherId}/payload`});assert.equal((await f.upload()).status,503);assert.equal(f.state.puts,0);
  let canceled=false;
  const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(20));c.enqueue(new Uint8Array(20));},cancel(){canceled=true;}});
  await assert.rejects(boundedBytes(stream,30),/payload_too_large/);assert.equal(canceled,true);
  await assert.rejects(boundedBytes(new ReadableStream({}),30,5),/request_timeout/);
});

test('bucket preflight is read-only by default and never repairs or overwrites existing storage',async()=>{
  let bucket=null,creates=0,entries=[];
  const client={storage:{listBuckets:async()=>ok(bucket?[bucket]:[]),
    createBucket:async(id,options)=>{assert.equal(id,'os-private-ingest');assert.deepEqual(options,PRIVATE_BUCKET_OPTIONS);creates++;
      bucket={id,public:false,file_size_limit:65536,allowed_mime_types:['text/plain']};return ok({name:id});},
    getBucket:async()=>ok(bucket),from:()=>({list:async()=>ok(entries)})}};
  await assert.rejects(provisionPrivateBucket(client),/absent/);assert.equal(creates,0);
  assert.equal((await provisionPrivateBucket(client,{create:true})).created,true);assert.equal(creates,1);
  assert.equal((await provisionPrivateBucket(client)).created,false);
  entries=[{id:'existing'}];await assert.rejects(provisionPrivateBucket(client),/contains existing/);
  assert.equal((await provisionPrivateBucket(client,{reviewedExisting:true})).policiesAndSigningHistoryVerified,false);
  bucket.public=true;await assert.rejects(provisionPrivateBucket(client,{create:true,reviewedExisting:true}),/configuration differs/);
  assert.equal(creates,1);assert.throws(()=>assertPrivateBucket({...bucket,public:false,allowed_mime_types:['*']}),/configuration differs/);
});
