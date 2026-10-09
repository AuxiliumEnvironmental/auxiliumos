begin;

-- CLI-generated filename allocated by the integration lead. Additive transport
-- only: reservations remain immutable; no scan, clearance, read or release API.
create table private.private_object_transports (
  object_id uuid primary key references private.private_object_reservations(id),
  attempt_id uuid not null unique default pg_catalog.gen_random_uuid(),
  state text not null default 'receiving' check (state in ('receiving', 'stored_unverified', 'finalized')),
  state_revision bigint not null default 2 check (state_revision >= 2),
  claimed_at timestamptz not null default pg_catalog.clock_timestamp(),
  bound_sha256 text check (bound_sha256 ~ '^[0-9a-f]{64}$'),
  bound_byte_size integer check (bound_byte_size between 1 and 65536),
  receipt_id uuid unique,
  verified_sha256 text check (verified_sha256 ~ '^[0-9a-f]{64}$'),
  verified_byte_size integer check (verified_byte_size between 1 and 65536),
  verified_media_type text check (verified_media_type = 'text/plain'),
  verified_at timestamptz,
  finalized_at timestamptz,
  failure_code text check (failure_code in ('provider_unavailable', 'provider_missing', 'byte_mismatch', 'invalid_text', 'receipt_unavailable')),
  -- Transport success cannot make content safe or visible. Later immutable
  -- document-version adoption must add an explicit, separately reviewed gate.
  scan_state text not null default 'pending' check (scan_state = 'pending'),
  clearance_state text not null default 'pending' check (clearance_state = 'pending'),
  quarantined boolean not null default true check (quarantined),
  constraint private_object_transport_binding_check check (
    (bound_sha256 is null and bound_byte_size is null)
    or (bound_sha256 is not null and bound_byte_size is not null)),
  constraint private_object_transport_receipt_check check (
    (state = 'receiving' and receipt_id is null and verified_sha256 is null
      and verified_byte_size is null and verified_media_type is null and verified_at is null and finalized_at is null)
    or (state in ('stored_unverified','finalized') and receipt_id is not null
      and verified_sha256 is not null and verified_sha256 = bound_sha256
      and verified_byte_size is not null and verified_byte_size = bound_byte_size
      and verified_media_type is not null and verified_at is not null
      and ((state = 'stored_unverified' and finalized_at is null)
        or (state = 'finalized' and finalized_at is not null))))
);
alter table private.private_object_transports enable row level security;
revoke all on private.private_object_transports from public, anon, authenticated, service_role;

-- Preserve the immediately preceding intake migration's exact event families.
alter table public.audit_events drop constraint audit_events_access_event_scope_check,
  add constraint audit_events_access_event_scope_check check (
    (actor_kind = 'legacy_fixture' and account_id is not null)
    or (actor_kind in ('user','system') and object_id is not null and is_internal_only and (
      (account_id is null and object_type = 'user_profile'
        and event_type in ('profile_created','profile_updated','profile_deleted'))
      or (account_id is not null and object_type = 'account_access'
        and event_type in ('account_access_created','account_access_updated','account_access_deleted'))
      or (account_id is not null and object_type = 'account_capability_grant'
        and event_type in ('capability_grant_created','capability_grant_updated','capability_grant_revoked','capability_grant_restored','capability_grant_deleted'))
      or (account_id is not null and actor_kind = 'user' and is_demo and (
        (object_type = 'incident' and event_type = 'incident_created')
        or (object_type = 'project_request' and event_type in ('request_created','request_submitted','request_assigned','request_reclassified','request_status_changed'))
        or (object_type = 'request_response' and event_type = 'missing_information_received')))
      or (account_id is not null and object_type = 'private_object' and is_demo and (
        (actor_kind = 'user' and event_type in ('private_object_reserved','private_object_upload_claimed','private_object_finalized'))
        or (actor_kind = 'system' and event_type in ('private_object_upload_claimed','private_object_upload_received','private_object_failed'))))
      or (account_id is null and object_type = 'private_object_reservation_config'
        and event_type in ('private_object_reservation_config_created','private_object_reservation_config_updated')
        and actor_kind = 'system' and is_demo)
    ))
  );

create function private.private_object_service_context()
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if session_user <> 'authenticator'
    or pg_catalog.current_setting('role',true) is distinct from 'service_role' then
    raise exception 'Invalid private object service' using errcode = '28000';
  end if;
end;
$$;

-- Same lock order as reservations; the immutable reservation is only read to
-- discover scope. Transport row locks always follow current entitlement locks.
create function private.lock_private_object_uploader(p_object_id uuid)
returns private.private_object_reservations language plpgsql security invoker set search_path = '' as $$
declare r private.private_object_reservations%rowtype; profile_id uuid;
begin
  perform private.private_object_authenticated_subject();
  select * into r from private.private_object_reservations where id = p_object_id;
  if not found or r.created_by_auth_user_id <> auth.uid() then
    raise exception 'Private object unavailable' using errcode = '42501';
  end if;
  profile_id := private.lock_private_object_ingest(r.account_id,r.facility_id);
  if profile_id is null or profile_id <> r.created_by_profile_id then
    raise exception 'Private object unavailable' using errcode = '42501';
  end if;
  return r;
end;
$$;

create function private.private_file_status(p_object_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r private.private_object_reservations%rowtype; t private.private_object_transports%rowtype; effective_state text;
begin
  -- Invalid authentication is not conflated with a missing/forbidden object.
  perform private.private_object_authenticated_subject();
  begin r := private.lock_private_object_uploader(p_object_id);
  exception when insufficient_privilege then
    return pg_catalog.jsonb_build_object('object_id',null,'state','not_found_or_unavailable');
  end;
  select * into t from private.private_object_transports where object_id = r.id;
  effective_state := coalesce(t.state,'reserved');
  if effective_state <> 'finalized' and r.expires_at <= pg_catalog.clock_timestamp() then effective_state := 'expired'; end if;
  return pg_catalog.jsonb_build_object('object_id',r.id,'state',effective_state,
    'state_revision',coalesce(t.state_revision,1),'expires_at',r.expires_at,
    'scan_state','pending','clearance_state','pending','quarantined',true,
    'failure_code',t.failure_code,'next_action',case effective_state
      when 'reserved' then 'upload' when 'receiving' then 'retry_same_bytes'
      when 'stored_unverified' then 'finalize' when 'finalized' then 'await_scan_and_human_clearance'
      else 'contact_administrator' end);
end;
$$;

create function private.claim_private_object_upload(p_object_id uuid,p_expected_revision bigint)
returns table(attempt_id uuid,state text,state_revision bigint)
language plpgsql security definer set search_path = '' as $$
declare r private.private_object_reservations%rowtype; t private.private_object_transports%rowtype;
begin
  r := private.lock_private_object_uploader(p_object_id);
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'Invalid private object revision' using errcode = '22023';
  end if;
  if r.expires_at <= pg_catalog.clock_timestamp() then
    raise exception 'Private object expired' using errcode = '55000';
  end if;
  select * into t from private.private_object_transports where object_id = r.id for update;
  if not found then
    if p_expected_revision <> 1 then raise exception 'Private object conflict' using errcode = '40001'; end if;
    insert into private.private_object_transports(object_id) values(r.id)
      on conflict(object_id) do nothing returning * into t;
    if not found then select * into strict t from private.private_object_transports where object_id = r.id for update; end if;
  end if;
  -- Revision 1 is the immutable initial claim's replay key. It cannot replace
  -- the attempt or its once-bound bytes, even after a lost provider response.
  if p_expected_revision not in (1,t.state_revision) then
    raise exception 'Private object conflict' using errcode = '40001';
  end if;
  return query select t.attempt_id,t.state,t.state_revision;
end;
$$;

create function private.authorize_private_object_finalize(p_object_id uuid,p_expected_revision bigint)
returns table(attempt_id uuid,state text,state_revision bigint)
language plpgsql security definer set search_path = '' as $$
declare r private.private_object_reservations%rowtype; t private.private_object_transports%rowtype;
begin
  r := private.lock_private_object_uploader(p_object_id);
  select * into t from private.private_object_transports where object_id = r.id for update;
  if not found then raise exception 'Private object conflict' using errcode = '40001'; end if;
  if p_expected_revision is null or (p_expected_revision <> t.state_revision and
      not (t.state = 'finalized' and p_expected_revision = t.state_revision - 1)) then
    raise exception 'Private object conflict' using errcode = '40001';
  end if;
  if t.state <> 'finalized' and r.expires_at <= pg_catalog.clock_timestamp() then
    raise exception 'Private object expired' using errcode = '55000';
  end if;
  if t.bound_sha256 is null then raise exception 'Private object conflict' using errcode = '40001'; end if;
  return query select t.attempt_id,t.state,t.state_revision;
end;
$$;

create function private.private_object_transport_target(p_object_id uuid,p_attempt_id uuid)
returns table(bucket_id text,object_key text,sha256 text,byte_size integer,media_type text,state text,state_revision bigint)
language plpgsql security definer set search_path = '' as $$
begin
  perform private.private_object_service_context();
  return query select r.bucket_id,r.object_key,t.bound_sha256,r.declared_byte_size,r.declared_media_type,t.state,t.state_revision
    from private.private_object_reservations r join private.private_object_transports t on t.object_id=r.id
    where r.id=p_object_id and t.attempt_id=p_attempt_id;
  if not found then raise exception 'Private object unavailable' using errcode = '42501'; end if;
end;
$$;

create function private.bind_private_object_upload(p_object_id uuid,p_attempt_id uuid,p_sha256 text,p_byte_size integer)
returns void language plpgsql security definer set search_path = '' as $$
declare r private.private_object_reservations%rowtype; t private.private_object_transports%rowtype;
begin
  perform private.private_object_service_context();
  select * into r from private.private_object_reservations where id=p_object_id;
  select * into t from private.private_object_transports where object_id=p_object_id and attempt_id=p_attempt_id for update;
  if t.object_id is null then raise exception 'Private object unavailable' using errcode='42501'; end if;
  if r.expires_at <= pg_catalog.clock_timestamp() then raise exception 'Private object expired' using errcode='55000'; end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' or p_byte_size is distinct from r.declared_byte_size then
    raise exception 'Invalid private object bytes' using errcode='22023';
  end if;
  if t.bound_sha256 is not null then
    if t.bound_sha256 <> p_sha256 or t.bound_byte_size <> p_byte_size then
      raise exception 'Private object byte conflict' using errcode='23505';
    end if;
    return;
  end if;
  update private.private_object_transports set bound_sha256=p_sha256,bound_byte_size=p_byte_size where object_id=p_object_id;
end;
$$;

create function private.record_private_object_receipt(p_object_id uuid,p_attempt_id uuid,p_sha256 text,p_byte_size integer,p_media_type text)
returns table(receipt_id uuid,state_revision bigint)
language plpgsql security definer set search_path = '' as $$
declare t private.private_object_transports%rowtype;
begin
  perform private.private_object_service_context();
  select * into t from private.private_object_transports where object_id=p_object_id and attempt_id=p_attempt_id for update;
  if not found then raise exception 'Private object unavailable' using errcode='42501'; end if;
  if t.bound_sha256 is null or p_sha256 is distinct from t.bound_sha256
    or p_byte_size is distinct from t.bound_byte_size or p_media_type is distinct from 'text/plain' then
    raise exception 'Private object byte conflict' using errcode='23505';
  end if;
  if t.receipt_id is null then
    update private.private_object_transports set state='stored_unverified',state_revision=private_object_transports.state_revision+1,
      receipt_id=pg_catalog.gen_random_uuid(),verified_sha256=p_sha256,verified_byte_size=p_byte_size,
      verified_media_type=p_media_type,verified_at=pg_catalog.clock_timestamp(),failure_code=null
      where object_id=p_object_id returning * into t;
  end if;
  return query select t.receipt_id,t.state_revision;
end;
$$;

create function private.record_private_object_failure(p_object_id uuid,p_attempt_id uuid,p_failure_code text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.private_object_service_context();
  if p_failure_code is null or p_failure_code not in ('provider_unavailable','provider_missing','byte_mismatch','invalid_text','receipt_unavailable') then
    raise exception 'Invalid private object failure' using errcode='22023';
  end if;
  -- Diagnostic changes do not advance the lifecycle CAS revision. They cannot
  -- downgrade receipt/byte evidence or finalized state. Each change is audited.
  update private.private_object_transports set failure_code=p_failure_code
    where object_id=p_object_id and attempt_id=p_attempt_id and state <> 'finalized'
      and failure_code is distinct from p_failure_code;
end;
$$;

create function private.finalize_private_object(p_object_id uuid,p_attempt_id uuid,p_receipt_id uuid,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r private.private_object_reservations%rowtype; t private.private_object_transports%rowtype;
begin
  -- This is deliberately a USER transaction after provider I/O. A service
  -- receipt cannot impersonate current uploader authorization or human review.
  r := private.lock_private_object_uploader(p_object_id);
  select * into t from private.private_object_transports where object_id=r.id for update;
  if not found or p_attempt_id is distinct from t.attempt_id or p_receipt_id is null
    or p_receipt_id is distinct from t.receipt_id then raise exception 'Private object conflict' using errcode='40001'; end if;
  if t.state='finalized' and p_expected_revision in (t.state_revision,t.state_revision-1) then
    return private.private_file_status(r.id);
  end if;
  if r.expires_at <= pg_catalog.clock_timestamp() then raise exception 'Private object expired' using errcode='55000'; end if;
  if t.state <> 'stored_unverified' or p_expected_revision is distinct from t.state_revision then
    raise exception 'Private object conflict' using errcode='40001';
  end if;
  update private.private_object_transports set state='finalized',state_revision=private_object_transports.state_revision+1,
    finalized_at=pg_catalog.clock_timestamp(),failure_code=null where object_id=r.id;
  return private.private_file_status(r.id);
end;
$$;

create function private.guard_private_object_transport()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op in ('DELETE','TRUNCATE') then raise exception 'Private object transport is preserved' using errcode='55000'; end if;
  if tg_op='INSERT' then
    perform private.private_object_authenticated_subject();
    if new.state <> 'receiving' or new.state_revision <> 2 or new.bound_sha256 is not null or new.receipt_id is not null then
      raise exception 'Invalid private object claim' using errcode='23514'; end if;
  else
    if (new.object_id,new.attempt_id,new.claimed_at) is distinct from (old.object_id,old.attempt_id,old.claimed_at)
      or (old.bound_sha256 is not null and (new.bound_sha256,new.bound_byte_size) is distinct from (old.bound_sha256,old.bound_byte_size))
      or (old.receipt_id is not null and (new.receipt_id,new.verified_sha256,new.verified_byte_size,new.verified_media_type,new.verified_at)
        is distinct from (old.receipt_id,old.verified_sha256,old.verified_byte_size,old.verified_media_type,old.verified_at))
      or old.state='finalized' then raise exception 'Private object evidence is immutable' using errcode='55000'; end if;
    if new.state='finalized' then
      perform private.private_object_authenticated_subject();
      if old.state <> 'stored_unverified' or new.state_revision <> old.state_revision+1 then
        raise exception 'Invalid private object transition' using errcode='23514'; end if;
    else
      perform private.private_object_service_context();
      if not ((new.state=old.state and new.state_revision=old.state_revision)
        or (old.state='receiving' and new.state='stored_unverified' and new.state_revision=old.state_revision+1)) then
        raise exception 'Invalid private object transition' using errcode='23514'; end if;
    end if;
  end if;
  return new;
end;
$$;

create function private.audit_private_object_transport()
returns trigger language plpgsql security definer set search_path='' as $$
declare r private.private_object_reservations%rowtype; event_name text; operation text; human boolean;
begin
  select * into strict r from private.private_object_reservations where id=new.object_id;
  if tg_op='INSERT' then event_name:='private_object_upload_claimed'; operation:='claim_private_object_upload'; human:=true;
  elsif new.state='finalized' then event_name:='private_object_finalized'; operation:='finalize_private_object'; human:=true;
  elsif new.receipt_id is distinct from old.receipt_id then event_name:='private_object_upload_received'; operation:='record_private_object_receipt'; human:=false;
  elsif new.bound_sha256 is distinct from old.bound_sha256 then event_name:='private_object_upload_claimed'; operation:='bind_private_object_upload'; human:=false;
  elsif new.failure_code is distinct from old.failure_code then event_name:='private_object_failed'; operation:='record_private_object_failure'; human:=false;
  else return null; end if;
  if human then perform private.private_object_authenticated_subject(); else perform private.private_object_service_context(); end if;
  insert into public.audit_events(id,account_id,actor_user_profile_id,actor_kind,actor_auth_user_id,actor_system_key,
    object_type,object_id,event_type,event_metadata,occurred_at,correlation_id,is_internal_only,is_demo)
  values(pg_catalog.gen_random_uuid(),r.account_id,case when human then r.created_by_profile_id else null end,
    case when human then 'user' else 'system' end,case when human then r.created_by_auth_user_id else null end,
    case when human then null else 'database_privileged_operation' end,'private_object',r.id,event_name,
    pg_catalog.jsonb_build_object('operation_source',operation,'attempt_id',new.attempt_id,
      'component_version','private-file-transport-v1',
      'state',new.state,'state_revision',new.state_revision,'sha256',new.verified_sha256,
      'byte_size',new.verified_byte_size,'failure_code',new.failure_code,'quarantined',true,
      'database_session_user',session_user::text,'database_request_role',pg_catalog.current_setting('role',true)),
    pg_catalog.clock_timestamp(),pg_catalog.gen_random_uuid(),true,true);
  return null;
end;
$$;
create trigger private_object_transport_guard before insert or update or delete on private.private_object_transports
  for each row execute function private.guard_private_object_transport();
create trigger private_object_transport_no_truncate before truncate on private.private_object_transports
  for each statement execute function private.guard_private_object_transport();
create trigger private_object_transport_audit after insert or update on private.private_object_transports
  for each row execute function private.audit_private_object_transport();

-- Keep the existing four-column status RPC truthful without widening it.
create or replace function private.private_object_status(p_object_id uuid)
returns table(object_id uuid,state text,state_revision bigint,expires_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare s jsonb;
begin
  s:=private.private_file_status(p_object_id);
  return query select (s->>'object_id')::uuid,s->>'state',(s->>'state_revision')::bigint,(s->>'expires_at')::timestamptz;
end;
$$;

create function public.private_file_status(p_object_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.private_file_status(p_object_id) $$;
create function public.claim_private_object_upload(p_object_id uuid,p_expected_revision bigint)
returns table(attempt_id uuid,state text,state_revision bigint) language sql security invoker set search_path='' as $$
  select * from private.claim_private_object_upload(p_object_id,p_expected_revision) $$;
create function public.authorize_private_object_finalize(p_object_id uuid,p_expected_revision bigint)
returns table(attempt_id uuid,state text,state_revision bigint) language sql security invoker set search_path='' as $$
  select * from private.authorize_private_object_finalize(p_object_id,p_expected_revision) $$;
create function public.finalize_private_object(p_object_id uuid,p_attempt_id uuid,p_receipt_id uuid,p_expected_revision bigint)
returns jsonb language sql security invoker set search_path='' as $$
  select private.finalize_private_object(p_object_id,p_attempt_id,p_receipt_id,p_expected_revision) $$;
create function public.private_object_transport_target(p_object_id uuid,p_attempt_id uuid)
returns table(bucket_id text,object_key text,sha256 text,byte_size integer,media_type text,state text,state_revision bigint)
language sql security invoker set search_path='' as $$ select * from private.private_object_transport_target(p_object_id,p_attempt_id) $$;
create function public.bind_private_object_upload(p_object_id uuid,p_attempt_id uuid,p_sha256 text,p_byte_size integer)
returns void language sql security invoker set search_path='' as $$
  select private.bind_private_object_upload(p_object_id,p_attempt_id,p_sha256,p_byte_size) $$;
create function public.record_private_object_receipt(p_object_id uuid,p_attempt_id uuid,p_sha256 text,p_byte_size integer,p_media_type text)
returns table(receipt_id uuid,state_revision bigint) language sql security invoker set search_path='' as $$
  select * from private.record_private_object_receipt(p_object_id,p_attempt_id,p_sha256,p_byte_size,p_media_type) $$;
create function public.record_private_object_failure(p_object_id uuid,p_attempt_id uuid,p_failure_code text)
returns void language sql security invoker set search_path='' as $$
  select private.record_private_object_failure(p_object_id,p_attempt_id,p_failure_code) $$;

revoke all on function private.private_object_service_context(),private.lock_private_object_uploader(uuid),
  private.guard_private_object_transport(),private.audit_private_object_transport(),
  private.private_file_status(uuid),private.claim_private_object_upload(uuid,bigint),private.authorize_private_object_finalize(uuid,bigint),
  private.finalize_private_object(uuid,uuid,uuid,bigint),private.private_object_transport_target(uuid,uuid),
  private.bind_private_object_upload(uuid,uuid,text,integer),private.record_private_object_receipt(uuid,uuid,text,integer,text),
  private.record_private_object_failure(uuid,uuid,text),
  public.private_file_status(uuid),public.claim_private_object_upload(uuid,bigint),public.authorize_private_object_finalize(uuid,bigint),
  public.finalize_private_object(uuid,uuid,uuid,bigint),public.private_object_transport_target(uuid,uuid),
  public.bind_private_object_upload(uuid,uuid,text,integer),public.record_private_object_receipt(uuid,uuid,text,integer,text),
  public.record_private_object_failure(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.private_file_status(uuid),private.claim_private_object_upload(uuid,bigint),
  private.authorize_private_object_finalize(uuid,bigint),private.finalize_private_object(uuid,uuid,uuid,bigint),
  public.private_file_status(uuid),public.claim_private_object_upload(uuid,bigint),
  public.authorize_private_object_finalize(uuid,bigint),public.finalize_private_object(uuid,uuid,uuid,bigint) to authenticated;
grant usage on schema private to service_role;
grant execute on function private.private_object_transport_target(uuid,uuid),private.bind_private_object_upload(uuid,uuid,text,integer),
  private.record_private_object_receipt(uuid,uuid,text,integer,text),private.record_private_object_failure(uuid,uuid,text),
  public.private_object_transport_target(uuid,uuid),public.bind_private_object_upload(uuid,uuid,text,integer),
  public.record_private_object_receipt(uuid,uuid,text,integer,text),public.record_private_object_failure(uuid,uuid,text) to service_role;

-- Provider-owned bytes/metadata are never INSERTed/UPDATEd/DELETEd by SQL.
-- RESTRICTIVE predicates also defeat unrelated permissive allow policies. They
-- are bucket-scoped, not broad revokes or guarantees against a service key.
create policy os_private_ingest_objects_deny on storage.objects as restrictive
  for all to anon,authenticated using(bucket_id <> 'os-private-ingest') with check(bucket_id <> 'os-private-ingest');
create policy os_private_ingest_bucket_deny on storage.buckets as restrictive
  for all to anon,authenticated using(id <> 'os-private-ingest') with check(id <> 'os-private-ingest');

comment on table private.private_object_transports is
  'Synthetic 64KiB text transport, one immutable attempt/binding/receipt. Finalization remains pending scan/human clearance, inaccessible and not a document version. No destruction or serving route.';
commit;
