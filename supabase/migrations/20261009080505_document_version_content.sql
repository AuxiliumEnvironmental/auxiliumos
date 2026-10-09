begin;

-- DOC-001B: separately granted, exact-version synthetic internal content.
-- No release, professional approval, signed URL, scanner or provider I/O here.
create table private.document_content_config (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  singleton boolean not null unique default true check(singleton),
  enabled boolean not null default false,
  synthetic_only boolean not null default true check(synthetic_only),
  revision bigint not null default 1 check(revision>0),
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table private.document_content_heads (
  version_id uuid primary key references private.document_versions(id),
  content_revision bigint not null default 0 check(content_revision>=0)
);
create table private.document_content_grants (
  id uuid primary key,
  version_id uuid not null,
  document_id uuid not null,
  account_id uuid not null,
  verified_sha256 text not null check(verified_sha256 ~ '^[0-9a-f]{64}$'),
  user_profile_id uuid not null,
  capability_key text not null default 'view_content' check(capability_key='view_content'),
  request_id uuid not null,
  requested_revision bigint not null check(requested_revision>=0),
  created_at timestamptz not null,
  revoked_at timestamptz,
  revoked_from_revision bigint,
  is_demo boolean not null default true check(is_demo),
  unique(version_id,request_id),
  unique(id,version_id,verified_sha256,user_profile_id),
  foreign key(version_id,document_id,account_id,verified_sha256) references private.document_versions(id,document_id,account_id,verified_sha256),
  foreign key(account_id,user_profile_id) references public.account_access(account_id,user_profile_id),
  check((revoked_at is null and revoked_from_revision is null) or (revoked_at is not null and revoked_from_revision>=0))
);
create unique index document_content_grants_active_idx on private.document_content_grants(version_id,user_profile_id) where revoked_at is null;
create index document_content_grants_recipient_idx on private.document_content_grants(account_id,user_profile_id);
create table private.document_content_authorizations (
  id uuid primary key,
  version_id uuid not null,
  document_id uuid not null,
  account_id uuid not null,
  object_id uuid not null,
  verified_sha256 text not null,
  byte_size integer not null check(byte_size between 1 and 65536),
  media_type text not null check(media_type='text/plain'),
  bucket_id text not null check(bucket_id='os-private-ingest'),
  object_key text not null,
  content_grant_id uuid not null,
  subject_profile_id uuid not null,
  subject_auth_user_id uuid not null,
  request_id uuid not null,
  authorized_at timestamptz not null,
  unique(subject_auth_user_id,request_id),
  foreign key(version_id,document_id,account_id,verified_sha256) references private.document_versions(id,document_id,account_id,verified_sha256),
  foreign key(object_id,account_id) references private.private_object_reservations(id,account_id),
  foreign key(content_grant_id,version_id,verified_sha256,subject_profile_id) references private.document_content_grants(id,version_id,verified_sha256,user_profile_id),
  foreign key(account_id,subject_profile_id) references public.account_access(account_id,user_profile_id)
);
create index document_content_authorizations_version_idx on private.document_content_authorizations(version_id,document_id,account_id,verified_sha256);
create index document_content_authorizations_object_idx on private.document_content_authorizations(object_id,account_id);
create index document_content_authorizations_grant_idx on private.document_content_authorizations(content_grant_id,version_id,verified_sha256,subject_profile_id);
create index document_content_authorizations_profile_idx on private.document_content_authorizations(account_id,subject_profile_id);
create table private.document_content_results (
  id uuid primary key,
  authorization_id uuid not null references private.document_content_authorizations(id),
  outcome text not null check(outcome in ('response_prepared','provider_failure','integrity_failure','access_changed')),
  recorded_at timestamptz not null,
  unique(authorization_id,outcome)
);
create table private.document_content_denials (
  id uuid primary key,
  request_id uuid not null,
  attempted_version_id uuid,
  observed_auth_user_id uuid,
  resolved_account_id uuid references public.client_accounts(id),
  reason_code text not null check(reason_code in ('unauthenticated','forbidden_origin','method_not_allowed','invalid_request','not_found_or_unavailable','backend_unavailable')),
  recorded_at timestamptz not null
);
create index document_content_denials_account_idx on private.document_content_denials(resolved_account_id);
create index document_content_denials_request_idx on private.document_content_denials(request_id);
alter table private.document_content_config enable row level security;
alter table private.document_content_heads enable row level security;
alter table private.document_content_grants enable row level security;
alter table private.document_content_authorizations enable row level security;
alter table private.document_content_results enable row level security;
alter table private.document_content_denials enable row level security;
revoke all on private.document_content_config,private.document_content_heads,private.document_content_grants,
  private.document_content_authorizations,private.document_content_results,private.document_content_denials from public,anon,authenticated,service_role;

-- Exact additive allowlist. Preserve ALL earlier families and guards unchanged.
alter table public.audit_events drop constraint audit_events_access_event_scope_check,
  add constraint audit_events_access_event_scope_check check (
    (actor_kind='legacy_fixture' and account_id is not null)
    or (actor_kind in ('user','system') and object_id is not null and is_internal_only and (
      (account_id is null and object_type='user_profile' and event_type in ('profile_created','profile_updated','profile_deleted'))
      or (account_id is not null and object_type='account_access' and event_type in ('account_access_created','account_access_updated','account_access_deleted'))
      or (account_id is not null and object_type='account_capability_grant' and event_type in ('capability_grant_created','capability_grant_updated','capability_grant_revoked','capability_grant_restored','capability_grant_deleted'))
      or (account_id is not null and actor_kind='user' and is_demo and (
        (object_type='incident' and event_type='incident_created')
        or (object_type='project_request' and event_type in ('request_created','request_submitted','request_assigned','request_reclassified','request_status_changed'))
        or (object_type='request_response' and event_type='missing_information_received')))
      or (account_id is not null and object_type='private_object' and is_demo and (
        (actor_kind='user' and event_type in ('private_object_reserved','private_object_upload_claimed','private_object_finalized','private_object_ingest_closed'))
        or (actor_kind='system' and event_type in ('private_object_upload_claimed','private_object_upload_received','private_object_failed','private_object_scan_claimed','private_object_restriction_changed','private_object_hold_changed','private_object_ingest_closed'))
        or event_type='private_object_phi_suspected'))
      or (account_id is not null and is_demo and actor_kind='system' and (
        (object_type='private_object_grant' and event_type in ('private_object_grant_created','private_object_grant_revoked'))
        or (object_type='private_object_scan' and event_type='private_object_scan_recorded')
        or (object_type='document_version_grant' and event_type in ('document_version_grant_created','document_version_grant_revoked'))))
      or (account_id is not null and is_demo and actor_kind='user' and object_type='private_object_clearance' and event_type='private_object_clearance_recorded')
      or (account_id is not null and is_demo and actor_kind='user' and object_type='document_version' and event_type='document_version_adopted')
      or (account_id is null and object_type='private_object_reservation_config' and event_type in ('private_object_reservation_config_created','private_object_reservation_config_updated') and actor_kind='system' and is_demo)
      or (account_id is not null and is_demo and actor_kind='user' and object_type='document_content_authorization' and event_type='document_content_authorized')
      or (account_id is not null and is_demo and actor_kind='system' and object_type='document_content_grant' and event_type in ('document_content_grant_created','document_content_grant_revoked'))
      or (account_id is not null and is_demo and actor_kind='system' and object_type='document_content_result' and event_type='document_content_result_recorded')
      or (is_demo and actor_kind='system' and object_type='document_content_attempt' and event_type='document_content_denied')
      or (account_id is null and is_demo and actor_kind='system' and object_type='document_content_config' and event_type in ('document_content_config_created','document_content_config_updated'))
    ))
  );

create function private.lock_document_content_config()
returns void language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from private.document_content_config where singleton and enabled and synthetic_only for share;
  if not found then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
end;
$$;

-- Compatibility correction: initial technical closure still invalidates
-- clearance. Once adoption has closed ingest, a later hold-only change must
-- not silently discard its human clearance. Existing null clearance remains
-- null; this neither supplies human clearance nor reopens the object.
create or replace function private.set_private_object_controls(p_object_id uuid,p_expected_revision bigint,p_visibility_restricted boolean,p_preservation_hold boolean,p_ingest_closed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.private_object_security%rowtype;
begin
  perform private.private_object_service_context(); perform private.lock_private_object_security_config();
  if p_visibility_restricted is null or p_preservation_hold is null or p_ingest_closed is null then raise exception 'Invalid private object controls' using errcode='22023'; end if;
  s:=private.lock_private_object_security(p_object_id);
  if p_expected_revision is distinct from s.security_revision then raise exception 'Private object conflict' using errcode='40001'; end if;
  if s.ingest_closed_at is not null and not p_ingest_closed then raise exception 'Private object ingest cannot reopen' using errcode='55000'; end if;
  if (s.visibility_restricted,s.preservation_hold,s.ingest_closed_at is not null) is distinct from (p_visibility_restricted,p_preservation_hold,p_ingest_closed) then
    update private.private_object_security set security_revision=security_revision+1,visibility_restricted=p_visibility_restricted,preservation_hold=p_preservation_hold,
      ingest_closed_at=case when p_ingest_closed then coalesce(ingest_closed_at,pg_catalog.clock_timestamp()) else null end,
      current_clearance_id=case when p_ingest_closed and s.ingest_closed_at is null then null else current_clearance_id end where object_id=p_object_id;
  end if;
  return private.private_object_security_snapshot(p_object_id);
end;
$$;
revoke all on function private.set_private_object_controls(uuid,bigint,boolean,boolean,boolean) from public,anon,authenticated,service_role;
grant execute on function private.set_private_object_controls(uuid,bigint,boolean,boolean,boolean) to service_role;

create function private.lock_document_content_head(p_version_id uuid)
returns bigint language plpgsql security invoker set search_path='' as $$
declare revision bigint;
begin
  insert into private.document_content_heads(version_id) values(p_version_id) on conflict(version_id) do nothing;
  select content_revision into strict revision from private.document_content_heads where version_id=p_version_id for update;
  return revision;
end;
$$;

-- Locks: content config -> ingest config -> current directory -> logical
-- view grant/document -> exact content grant -> transport/security. No head
-- lock or provider I/O is needed for reads. Missing and forbidden are identical.
create function private.lock_document_content_access(p_version_id uuid,p_expected_sha256 text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v private.document_versions%rowtype; profile uuid; g uuid;
  t private.private_object_transports%rowtype; s private.private_object_security%rowtype;
  o private.private_object_scan_observations%rowtype; c private.private_object_clearance_decisions%rowtype;
begin
  perform private.private_object_authenticated_subject();
  perform private.lock_document_content_config();
  select * into v from private.document_versions where id=p_version_id and is_demo and lifecycle_state='internal_draft' and verified_sha256=p_expected_sha256;
  if not found then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
  begin profile:=private.lock_document_version_actor(v.document_id,'view_versions');
  exception when insufficient_privilege then raise exception 'not_found_or_unavailable' using errcode='42501'; end;
  select id into g from private.document_content_grants where version_id=v.id and document_id=v.document_id and account_id=v.account_id
    and verified_sha256=v.verified_sha256 and user_profile_id=profile and capability_key='view_content' and revoked_at is null and is_demo for share;
  if not found then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
  select * into t from private.private_object_transports where object_id=v.object_id and state='finalized' for share;
  select * into s from private.private_object_security where object_id=v.object_id and account_id=v.account_id and verified_sha256=v.verified_sha256 for share;
  select * into o from private.private_object_scan_observations where id=s.current_scan_observation_id;
  select * into c from private.private_object_clearance_decisions where id=s.current_clearance_id;
  if t.verified_sha256 is distinct from v.verified_sha256 or t.verified_byte_size is distinct from v.byte_size or t.verified_media_type is distinct from v.media_type
    or s.ingest_closed_at is null or s.scan_state is distinct from 'result' or s.phi_suspected or s.visibility_restricted
    or o.id is distinct from v.scan_observation_id or o.malware_outcome is distinct from 'pass'
    or o.verified_sha256 is distinct from v.verified_sha256 or o.scan_attempt_id is distinct from s.current_scan_attempt_id
    or c.id is distinct from v.clearance_decision_id or c.decision is distinct from 'cleared_no_phi'
    or c.scan_observation_id is distinct from o.id or c.verified_sha256 is distinct from v.verified_sha256 then
    raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
  -- preservation_hold is intentionally NOT a visibility predicate.
  return profile;
end;
$$;

create function private.guard_document_content_history()
returns trigger language plpgsql security definer set search_path='' as $$
declare v private.document_versions%rowtype; a private.document_content_authorizations%rowtype;
  r private.private_object_reservations%rowtype; access record; revision bigint; profile uuid;
begin
  if tg_table_schema<>'private' or tg_when<>'BEFORE' or tg_op in ('DELETE','TRUNCATE') then
    raise exception 'Document content history is immutable' using errcode='55000'; end if;
  if tg_table_name='document_content_config' then
    if session_user not in ('postgres','supabase_admin') or coalesce(nullif(pg_catalog.current_setting('role',true),'none'),session_user::text)<>session_user::text then
      raise exception 'Untrusted content configuration session' using errcode='28000'; end if;
    if tg_op='INSERT' then new.id:=pg_catalog.gen_random_uuid();new.singleton:=true;new.revision:=1;
    else
      if (new.id,new.singleton,new.synthetic_only,new.revision,new.updated_at) is distinct from (old.id,old.singleton,old.synthetic_only,old.revision,old.updated_at) then
        raise exception 'Content configuration provenance is server assigned' using errcode='23514'; end if;
      if new.enabled=old.enabled then return old; end if;
      new.revision:=old.revision+1;
    end if;
    new.updated_at:=pg_catalog.clock_timestamp();
  elsif tg_table_name='document_content_heads' then
    perform private.private_object_service_context();
    if (tg_op='INSERT' and new.content_revision<>0) or (tg_op='UPDATE' and (new.version_id<>old.version_id or new.content_revision<>old.content_revision+1)) then
      raise exception 'Invalid content revision' using errcode='55000'; end if;
  elsif tg_table_name='document_content_grants' then
    perform private.private_object_service_context();
    select * into v from private.document_versions where id=new.version_id and is_demo and lifecycle_state='internal_draft';
    if not found then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
    if tg_op='INSERT' then
      perform private.lock_document_content_config();perform private.lock_private_object_security_config();
      select * into access from private.lock_private_object_security_profile(new.user_profile_id,v.account_id,v.facility_id);
      if not access.directory_allowed then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
      perform 1 from public.documents where id=v.document_id and account_id=v.account_id and facility_id=v.facility_id and is_demo for share;
      if not found then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
      if new.request_id is null or new.requested_revision is null or new.requested_revision<0 or new.verified_sha256 is null or new.verified_sha256 !~ '^[0-9a-f]{64}$'
        or new.capability_key is distinct from 'view_content' then raise exception 'Invalid content grant' using errcode='22023'; end if;
      revision:=private.lock_document_content_head(v.id);
      if new.requested_revision<>revision or new.verified_sha256<>v.verified_sha256 then raise exception 'Content revision conflict' using errcode='40001'; end if;
      if new.revoked_at is not null or new.revoked_from_revision is not null then raise exception 'Invalid content grant' using errcode='23514'; end if;
      new.id:=pg_catalog.gen_random_uuid();new.document_id:=v.document_id;new.account_id:=v.account_id;new.created_at:=pg_catalog.clock_timestamp();new.is_demo:=true;
    else
      if (pg_catalog.to_jsonb(new)-array['revoked_at','revoked_from_revision']) is distinct from (pg_catalog.to_jsonb(old)-array['revoked_at','revoked_from_revision'])
        or old.revoked_at is not null or new.revoked_at is null or new.revoked_from_revision is null then
        raise exception 'Content grants cannot be edited or restored' using errcode='55000'; end if;
      revision:=private.lock_document_content_head(v.id);
      if new.revoked_from_revision<>revision then raise exception 'Content revision conflict' using errcode='40001'; end if;
      new.revoked_at:=pg_catalog.clock_timestamp();
    end if;
  elsif tg_table_name='document_content_authorizations' and tg_op='INSERT' then
    if new.request_id is null or new.verified_sha256 is null or new.verified_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'Invalid content request' using errcode='22023'; end if;
    profile:=private.lock_document_content_access(new.version_id,new.verified_sha256);
    select * into strict v from private.document_versions where id=new.version_id;
    select * into strict r from private.private_object_reservations where id=v.object_id;
    new.id:=pg_catalog.gen_random_uuid();new.document_id:=v.document_id;new.account_id:=v.account_id;new.object_id:=v.object_id;
    new.byte_size:=v.byte_size;new.media_type:=v.media_type;new.bucket_id:=r.bucket_id;new.object_key:=r.object_key;
    new.subject_profile_id:=profile;new.subject_auth_user_id:=private.private_object_authenticated_subject();new.authorized_at:=pg_catalog.clock_timestamp();
    select id into strict new.content_grant_id from private.document_content_grants where version_id=v.id and user_profile_id=profile and revoked_at is null;
  elsif tg_table_name='document_content_results' and tg_op='INSERT' then
    perform private.private_object_service_context();
    select * into a from private.document_content_authorizations where id=new.authorization_id;
    if not found then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
    new.id:=pg_catalog.gen_random_uuid();new.recorded_at:=pg_catalog.clock_timestamp();
  elsif tg_table_name='document_content_denials' and tg_op='INSERT' then
    perform private.private_object_service_context();
    new.id:=pg_catalog.gen_random_uuid();new.recorded_at:=pg_catalog.clock_timestamp();new.resolved_account_id:=null;
    -- Observation != human authority. Resolve a tenant only when the observed
    -- linked subject could currently see that logical document's metadata.
    select v1.account_id into new.resolved_account_id from private.document_versions v1
      join public.documents d on d.id=v1.document_id and d.account_id=v1.account_id and d.facility_id=v1.facility_id and d.is_demo
      join public.client_accounts ca on ca.id=v1.account_id and ca.is_demo
      join public.facilities f on f.id=v1.facility_id and f.account_id=v1.account_id and f.is_demo
      join public.user_profiles p on p.auth_user_id=new.observed_auth_user_id and p.identity_status='active' and p.is_demo
      join public.account_access aa on aa.account_id=v1.account_id and aa.user_profile_id=p.id and aa.membership_status='active' and aa.is_demo
      where v1.id=new.attempted_version_id and v1.is_demo
        and exists(select 1 from public.account_capability_grants g where g.account_id=v1.account_id and g.user_profile_id=p.id and g.capability_key='view_account' and g.scope_kind='account' and g.revoked_at is null and g.is_demo)
        and exists(select 1 from public.account_capability_grants g where g.account_id=v1.account_id and g.user_profile_id=p.id and g.capability_key='view_asset' and ((g.scope_kind='facility' and g.facility_id=v1.facility_id) or g.scope_kind='all_facilities') and g.revoked_at is null and g.is_demo)
        and exists(select 1 from private.document_version_grants g where g.document_id=v1.document_id and g.account_id=v1.account_id and g.facility_id=v1.facility_id and g.user_profile_id=p.id and g.capability_key='view_versions' and g.revoked_at is null and g.is_demo);
  else raise exception 'Document content history is immutable' using errcode='55000'; end if;
  return new;
end;
$$;

create function private.audit_document_content_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid; profile uuid; tenant uuid; metadata jsonb; kind text:='system'; object_type text; event_name text;
  a private.document_content_authorizations%rowtype;
begin
  if tg_table_schema<>'private' or tg_when<>'AFTER' or tg_level<>'ROW' then raise exception 'Unsupported content audit context' using errcode='55000'; end if;
  if tg_table_name='document_content_config' and tg_op in ('INSERT','UPDATE') then
    if tg_op='UPDATE' and new.revision=old.revision then return null; end if;
    if session_user not in ('postgres','supabase_admin') or coalesce(nullif(pg_catalog.current_setting('role',true),'none'),session_user::text)<>session_user::text then
      raise exception 'Untrusted content configuration session' using errcode='28000'; end if;
    object_type:='document_content_config';event_name:=case when tg_op='INSERT' then 'document_content_config_created' else 'document_content_config_updated' end;
    metadata:=pg_catalog.jsonb_build_object('enabled',new.enabled,'synthetic_only',new.synthetic_only,'revision',new.revision);
  elsif tg_table_name='document_content_grants' and tg_op in ('INSERT','UPDATE') then
    perform private.private_object_service_context();tenant:=new.account_id;object_type:='document_content_grant';
    event_name:=case when tg_op='INSERT' then 'document_content_grant_created' else 'document_content_grant_revoked' end;
    update private.document_content_heads set content_revision=content_revision+1 where version_id=new.version_id
      and content_revision=coalesce(new.revoked_from_revision,new.requested_revision);
    if not found then raise exception 'Content revision conflict' using errcode='40001'; end if;
    metadata:=pg_catalog.jsonb_build_object('version_id',new.version_id,'document_id',new.document_id,'verified_sha256',new.verified_sha256,
      'recipient_profile_id',new.user_profile_id,'capability','view_content','content_revision',coalesce(new.revoked_from_revision,new.requested_revision)+1);
  elsif tg_table_name='document_content_authorizations' and tg_op='INSERT' then
    actor:=private.private_object_authenticated_subject();profile:=new.subject_profile_id;kind:='user';tenant:=new.account_id;
    if actor is distinct from new.subject_auth_user_id then raise exception 'Invalid content actor' using errcode='28000'; end if;
    object_type:='document_content_authorization';event_name:='document_content_authorized';
    metadata:=pg_catalog.jsonb_build_object('version_id',new.version_id,'document_id',new.document_id,'object_id',new.object_id,
      'verified_sha256',new.verified_sha256,'content_grant_id',new.content_grant_id,'request_id',new.request_id,'meaning','authorization_only');
  elsif tg_table_name='document_content_results' and tg_op='INSERT' then
    perform private.private_object_service_context();select * into strict a from private.document_content_authorizations where id=new.authorization_id;
    tenant:=a.account_id;object_type:='document_content_result';event_name:='document_content_result_recorded';
    metadata:=pg_catalog.jsonb_build_object('authorization_id',a.id,'version_id',a.version_id,'object_id',a.object_id,'verified_sha256',a.verified_sha256,
      'outcome',new.outcome,'meaning','system_observation_not_delivery');
  elsif tg_table_name='document_content_denials' and tg_op='INSERT' then
    perform private.private_object_service_context();tenant:=new.resolved_account_id;object_type:='document_content_attempt';event_name:='document_content_denied';
    metadata:=pg_catalog.jsonb_build_object('request_id',new.request_id,'attempted_version_id',new.attempted_version_id,
      'observed_auth_user_id',new.observed_auth_user_id,'reason_code',new.reason_code,'meaning','system_observation_not_human_authority');
  else raise exception 'Unsupported content audit relation' using errcode='55000'; end if;
  insert into public.audit_events(id,account_id,actor_user_profile_id,actor_kind,actor_auth_user_id,actor_system_key,object_type,object_id,event_type,event_metadata,occurred_at,correlation_id,is_internal_only,is_demo)
  values(pg_catalog.gen_random_uuid(),tenant,profile,kind,actor,case when kind='system' then 'database_privileged_operation' else null end,
    object_type,new.id,event_name,metadata||pg_catalog.jsonb_build_object('component_version','document-content-v1','operation_source',tg_table_name,
      'database_session_user',session_user::text,'database_request_role',pg_catalog.current_setting('role',true)),
    pg_catalog.clock_timestamp(),pg_catalog.gen_random_uuid(),true,true);
  return null;
end;
$$;

create trigger document_content_config_guard before insert or update or delete on private.document_content_config for each row execute function private.guard_document_content_history();
create trigger document_content_config_no_truncate before truncate on private.document_content_config for each statement execute function private.guard_document_content_history();
create trigger document_content_config_audit after insert or update on private.document_content_config for each row execute function private.audit_document_content_change();
create trigger document_content_heads_guard before insert or update or delete on private.document_content_heads for each row execute function private.guard_document_content_history();
create trigger document_content_heads_no_truncate before truncate on private.document_content_heads for each statement execute function private.guard_document_content_history();
create trigger document_content_grants_guard before insert or update or delete on private.document_content_grants for each row execute function private.guard_document_content_history();
create trigger document_content_grants_no_truncate before truncate on private.document_content_grants for each statement execute function private.guard_document_content_history();
create trigger document_content_grants_audit after insert or update on private.document_content_grants for each row execute function private.audit_document_content_change();
create trigger document_content_authorizations_guard before insert or update or delete on private.document_content_authorizations for each row execute function private.guard_document_content_history();
create trigger document_content_authorizations_no_truncate before truncate on private.document_content_authorizations for each statement execute function private.guard_document_content_history();
create trigger document_content_authorizations_audit after insert on private.document_content_authorizations for each row execute function private.audit_document_content_change();
create trigger document_content_results_guard before insert or update or delete on private.document_content_results for each row execute function private.guard_document_content_history();
create trigger document_content_results_no_truncate before truncate on private.document_content_results for each statement execute function private.guard_document_content_history();
create trigger document_content_results_audit after insert on private.document_content_results for each row execute function private.audit_document_content_change();
create trigger document_content_denials_guard before insert or update or delete on private.document_content_denials for each row execute function private.guard_document_content_history();
create trigger document_content_denials_no_truncate before truncate on private.document_content_denials for each statement execute function private.guard_document_content_history();
create trigger document_content_denials_audit after insert on private.document_content_denials for each row execute function private.audit_document_content_change();

create function private.provision_document_content_grant(p_version_id uuid,p_expected_sha256 text,p_profile_id uuid,p_request_id uuid,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v private.document_versions%rowtype; g private.document_content_grants%rowtype; access record; revision bigint;
begin
  perform private.private_object_service_context();perform private.lock_document_content_config();perform private.lock_private_object_security_config();
  if p_version_id is null or p_profile_id is null or p_request_id is null or p_expected_sha256 is null or p_expected_sha256 !~ '^[0-9a-f]{64}$'
    or p_expected_revision is null or p_expected_revision<0 then raise exception 'Invalid content grant' using errcode='22023'; end if;
  select * into v from private.document_versions where id=p_version_id and is_demo and lifecycle_state='internal_draft';
  if not found then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
  select * into access from private.lock_private_object_security_profile(p_profile_id,v.account_id,v.facility_id);
  if not access.directory_allowed then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
  perform 1 from public.documents where id=v.document_id and account_id=v.account_id and facility_id=v.facility_id and is_demo for share;
  if not found then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
  revision:=private.lock_document_content_head(v.id);
  select * into g from private.document_content_grants where version_id=v.id and request_id=p_request_id;
  if found then
    if (g.verified_sha256,g.user_profile_id,g.requested_revision) is distinct from (p_expected_sha256,p_profile_id,p_expected_revision) then
      raise exception 'Content grant request conflict' using errcode='23505'; end if;
    return pg_catalog.jsonb_build_object('grant_id',g.id,'content_revision',revision,'revoked',g.revoked_at is not null);
  end if;
  insert into private.document_content_grants(version_id,verified_sha256,user_profile_id,request_id,requested_revision)
    values(v.id,p_expected_sha256,p_profile_id,p_request_id,p_expected_revision) returning * into g;
  return pg_catalog.jsonb_build_object('grant_id',g.id,'content_revision',revision+1,'revoked',false);
end;
$$;

create function private.revoke_document_content_grant(p_version_id uuid,p_grant_id uuid,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g private.document_content_grants%rowtype; revision bigint;
begin
  perform private.private_object_service_context();
  if p_version_id is null or p_grant_id is null or p_expected_revision is null or p_expected_revision<0 then raise exception 'Invalid content revocation' using errcode='22023'; end if;
  -- Retirement is always possible after config/directory/recipient revocation.
  -- Head before grant on every public mutation prevents read-lock upgrades.
  select * into g from private.document_content_grants where id=p_grant_id and version_id=p_version_id;
  if not found then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
  revision:=private.lock_document_content_head(p_version_id);
  select * into strict g from private.document_content_grants where id=p_grant_id for update;
  if g.revoked_at is not null and g.revoked_from_revision=p_expected_revision then
    return pg_catalog.jsonb_build_object('grant_id',g.id,'content_revision',revision,'revoked',true); end if;
  if p_expected_revision<>revision then raise exception 'Content revision conflict' using errcode='40001'; end if;
  if g.revoked_at is not null then raise exception 'Content grant already revoked' using errcode='55000'; end if;
  update private.document_content_grants set revoked_at=pg_catalog.clock_timestamp(),revoked_from_revision=p_expected_revision where id=g.id;
  return pg_catalog.jsonb_build_object('grant_id',g.id,'content_revision',revision+1,'revoked',true);
end;
$$;

create function private.document_content_authorization_receipt(a private.document_content_authorizations)
returns jsonb language sql security invoker set search_path='' as $$
  select pg_catalog.jsonb_build_object('authorization_id',a.id,'version_id',a.version_id,'object_id',a.object_id,'verified_sha256',a.verified_sha256,
    'byte_size',a.byte_size,'media_type',a.media_type,'bucket_id',a.bucket_id,'object_key',a.object_key)
$$;
create function private.authorize_document_version_content(p_version_id uuid,p_expected_sha256 text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare subject uuid:=private.private_object_authenticated_subject(); a private.document_content_authorizations%rowtype;
begin
  if p_version_id is null or p_request_id is null or p_expected_sha256 is null or p_expected_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'Invalid content request' using errcode='22023'; end if;
  select * into a from private.document_content_authorizations where subject_auth_user_id=subject and request_id=p_request_id;
  if found and (a.version_id,a.verified_sha256) is distinct from (p_version_id,p_expected_sha256) then raise exception 'Content request conflict' using errcode='23505'; end if;
  perform private.lock_document_content_access(p_version_id,p_expected_sha256);
  if a.id is not null then return private.document_content_authorization_receipt(a); end if;
  insert into private.document_content_authorizations(version_id,verified_sha256,request_id) values(p_version_id,p_expected_sha256,p_request_id)
    on conflict(subject_auth_user_id,request_id) do nothing returning * into a;
  if not found then
    select * into strict a from private.document_content_authorizations where subject_auth_user_id=subject and request_id=p_request_id;
    if (a.version_id,a.verified_sha256) is distinct from (p_version_id,p_expected_sha256) then raise exception 'Content request conflict' using errcode='23505'; end if;
  end if;
  return private.document_content_authorization_receipt(a);
end;
$$;
create function private.record_document_content_result(p_authorization_id uuid,p_outcome text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.document_content_results%rowtype;
begin
  perform private.private_object_service_context();
  if p_authorization_id is null or p_outcome is null or p_outcome not in ('response_prepared','provider_failure','integrity_failure','access_changed') then raise exception 'Invalid content result' using errcode='22023'; end if;
  insert into private.document_content_results(authorization_id,outcome) values(p_authorization_id,p_outcome)
    on conflict(authorization_id,outcome) do nothing returning * into r;
  if not found then select * into strict r from private.document_content_results where authorization_id=p_authorization_id and outcome=p_outcome; end if;
  return pg_catalog.jsonb_build_object('result_id',r.id,'authorization_id',r.authorization_id,'outcome',r.outcome);
end;
$$;
create function private.record_document_content_denial(p_request_id uuid,p_attempted_version_id uuid,p_observed_auth_user_id uuid,p_reason_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d private.document_content_denials%rowtype;
begin
  perform private.private_object_service_context();
  if p_request_id is null or p_reason_code is null or p_reason_code not in ('unauthenticated','forbidden_origin','method_not_allowed','invalid_request','not_found_or_unavailable','backend_unavailable') then
    raise exception 'Invalid content denial' using errcode='22023'; end if;
  insert into private.document_content_denials(request_id,attempted_version_id,observed_auth_user_id,reason_code)
    values(p_request_id,p_attempted_version_id,p_observed_auth_user_id,p_reason_code) returning * into d;
  return pg_catalog.jsonb_build_object('denial_id',d.id,'request_id',d.request_id,'reason_code',d.reason_code);
end;
$$;

create function public.provision_document_content_grant(p_version_id uuid,p_expected_sha256 text,p_profile_id uuid,p_request_id uuid,p_expected_revision bigint) returns jsonb language sql security invoker set search_path='' as $$ select private.provision_document_content_grant(p_version_id,p_expected_sha256,p_profile_id,p_request_id,p_expected_revision) $$;
create function public.revoke_document_content_grant(p_version_id uuid,p_grant_id uuid,p_expected_revision bigint) returns jsonb language sql security invoker set search_path='' as $$ select private.revoke_document_content_grant(p_version_id,p_grant_id,p_expected_revision) $$;
create function public.authorize_document_version_content(p_version_id uuid,p_expected_sha256 text,p_request_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.authorize_document_version_content(p_version_id,p_expected_sha256,p_request_id) $$;
create function public.record_document_content_result(p_authorization_id uuid,p_outcome text) returns jsonb language sql security invoker set search_path='' as $$ select private.record_document_content_result(p_authorization_id,p_outcome) $$;
create function public.record_document_content_denial(p_request_id uuid,p_attempted_version_id uuid,p_observed_auth_user_id uuid,p_reason_code text) returns jsonb language sql security invoker set search_path='' as $$ select private.record_document_content_denial(p_request_id,p_attempted_version_id,p_observed_auth_user_id,p_reason_code) $$;

revoke all on function private.lock_document_content_config(),private.lock_document_content_head(uuid),private.lock_document_content_access(uuid,text),
  private.guard_document_content_history(),private.audit_document_content_change(),private.document_content_authorization_receipt(private.document_content_authorizations),
  private.provision_document_content_grant(uuid,text,uuid,uuid,bigint),private.revoke_document_content_grant(uuid,uuid,bigint),private.authorize_document_version_content(uuid,text,uuid),private.record_document_content_result(uuid,text),private.record_document_content_denial(uuid,uuid,uuid,text),
  public.provision_document_content_grant(uuid,text,uuid,uuid,bigint),public.revoke_document_content_grant(uuid,uuid,bigint),public.authorize_document_version_content(uuid,text,uuid),public.record_document_content_result(uuid,text),public.record_document_content_denial(uuid,uuid,uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function private.authorize_document_version_content(uuid,text,uuid),public.authorize_document_version_content(uuid,text,uuid) to authenticated;
grant execute on function private.provision_document_content_grant(uuid,text,uuid,uuid,bigint),private.revoke_document_content_grant(uuid,uuid,bigint),private.record_document_content_result(uuid,text),private.record_document_content_denial(uuid,uuid,uuid,text),
  public.provision_document_content_grant(uuid,text,uuid,uuid,bigint),public.revoke_document_content_grant(uuid,uuid,bigint),public.record_document_content_result(uuid,text),public.record_document_content_denial(uuid,uuid,uuid,text) to service_role;

-- Separate audited operational enablement is intentionally not supplied by this
-- migration, nor by user/service table privileges. Live OD gates remain closed.
insert into private.document_content_config(enabled) values(false);
comment on table private.document_content_authorizations is 'Durable exact-version authorization observation, NOT a reusable bearer permit or proof of bytes delivered. Recheck current authority before every provider read and response.';
comment on table private.document_content_results is 'Bounded trusted-system observations only. response_prepared is not sent/delivered/opened; each authorization/outcome is immutable and idempotent.';
commit;
