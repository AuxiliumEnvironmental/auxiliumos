begin;

-- DOC-001A: immutable synthetic internal drafts only. Legacy logical-document
-- rows/labels remain untouched; no review, release, content or destruction API.
alter table public.documents add constraint documents_id_account_facility_unique unique(id,account_id,facility_id);
alter table private.private_object_reservations add constraint private_object_reservations_scope_unique unique(id,account_id,facility_id);

create table private.document_version_heads (
  document_id uuid primary key,
  account_id uuid not null,
  facility_id uuid not null,
  document_revision bigint not null default 0 check(document_revision>=0),
  next_version_ordinal bigint not null default 1 check(next_version_ordinal>0),
  foreign key(document_id,account_id,facility_id) references public.documents(id,account_id,facility_id)
);
create index document_version_heads_scope_idx on private.document_version_heads(account_id,facility_id);
create table private.document_version_grants (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  document_id uuid not null,
  account_id uuid not null,
  facility_id uuid not null,
  user_profile_id uuid not null,
  capability_key text not null check(capability_key in ('view_versions','create_version')),
  request_id uuid not null,
  requested_revision bigint not null check(requested_revision>=0),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  revoked_at timestamptz,
  revoked_from_revision bigint,
  is_demo boolean not null default true check(is_demo),
  unique(document_id,request_id),
  foreign key(document_id,account_id,facility_id) references public.documents(id,account_id,facility_id),
  foreign key(account_id,user_profile_id) references public.account_access(account_id,user_profile_id),
  check((revoked_at is null and revoked_from_revision is null) or (revoked_at is not null and revoked_from_revision>=0))
);
create unique index document_version_grants_active_unique on private.document_version_grants(document_id,user_profile_id,capability_key) where revoked_at is null;
create index document_version_grants_subject_idx on private.document_version_grants(user_profile_id,account_id,document_id) where revoked_at is null;
create index document_version_grants_access_idx on private.document_version_grants(account_id,user_profile_id);

create table private.document_versions (
  id uuid primary key,
  document_id uuid not null,
  account_id uuid not null,
  facility_id uuid not null,
  version_ordinal bigint not null check(version_ordinal>0),
  object_id uuid not null unique,
  verified_sha256 text not null check(verified_sha256 ~ '^[0-9a-f]{64}$'),
  byte_size integer not null check(byte_size between 1 and 65536),
  media_type text not null check(media_type='text/plain'),
  transport_state text not null check(transport_state='finalized'),
  scan_observation_id uuid not null,
  clearance_decision_id uuid not null,
  expected_security_revision bigint not null check(expected_security_revision>=0),
  expected_document_revision bigint not null check(expected_document_revision>=0),
  request_id uuid not null,
  lifecycle_state text not null check(lifecycle_state='internal_draft'),
  preservation_hold_at_adoption boolean not null,
  created_by_profile_id uuid not null,
  created_by_auth_user_id uuid not null,
  created_at timestamptz not null,
  adoption_transaction_id xid8 not null,
  is_demo boolean not null check(is_demo),
  unique(document_id,version_ordinal),
  unique(document_id,created_by_profile_id,request_id),
  unique(id,document_id,account_id,verified_sha256),
  foreign key(document_id,account_id,facility_id) references public.documents(id,account_id,facility_id),
  foreign key(object_id,account_id,facility_id) references private.private_object_reservations(id,account_id,facility_id),
  foreign key(object_id,verified_sha256,transport_state) references private.private_object_transports(object_id,verified_sha256,state),
  foreign key(scan_observation_id,object_id,account_id,verified_sha256) references private.private_object_scan_observations(id,object_id,account_id,verified_sha256),
  foreign key(clearance_decision_id,object_id,account_id,verified_sha256,scan_observation_id) references private.private_object_clearance_decisions(id,object_id,account_id,verified_sha256,scan_observation_id),
  foreign key(account_id,created_by_profile_id) references public.account_access(account_id,user_profile_id)
);
create index document_versions_scope_idx on private.document_versions(account_id,facility_id);
create index document_versions_scan_idx on private.document_versions(scan_observation_id);
create index document_versions_clearance_idx on private.document_versions(clearance_decision_id);
create index document_versions_creator_idx on private.document_versions(account_id,created_by_profile_id);
alter table private.document_version_heads enable row level security;
alter table private.document_version_grants enable row level security;
alter table private.document_versions enable row level security;
revoke all on private.document_version_heads,private.document_version_grants,private.document_versions from public,anon,authenticated,service_role;

-- Exact additive extension, including user-provenance ingest closure. The
-- existing trigger derives that provenance; only the checked adoption below
-- permits a human closure. No generic event JSON writer is exposed.
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
    ))
  );

create function private.lock_document_version_actor(p_document_id uuid,p_action text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare subject uuid:=private.private_object_authenticated_subject(); profile uuid; d public.documents%rowtype;
  access record; g record; has_view boolean:=false; has_create boolean:=false;
begin
  if p_action is null or p_action not in ('view_versions','create_version') then raise exception 'Invalid document action' using errcode='22023'; end if;
  perform private.lock_private_object_security_config();
  select * into d from public.documents where id=p_document_id and is_demo and facility_id is not null;
  if not found then raise exception 'Document unavailable' using errcode='42501'; end if;
  select id into profile from public.user_profiles where auth_user_id=subject and identity_status='active' and is_demo for share;
  if not found then raise exception 'Document unavailable' using errcode='42501'; end if;
  select * into access from private.lock_private_object_security_profile(profile,d.account_id,d.facility_id);
  if not access.directory_allowed then raise exception 'Document unavailable' using errcode='42501'; end if;
  for g in select capability_key from private.document_version_grants where document_id=d.id and account_id=d.account_id
    and facility_id=d.facility_id and user_profile_id=profile and revoked_at is null and is_demo order by id for share
  loop
    if g.capability_key='view_versions' then has_view:=true; elsif g.capability_key='create_version' then has_create:=true; end if;
  end loop;
  if not has_view or (p_action='create_version' and not has_create) then raise exception 'Document unavailable' using errcode='42501'; end if;
  -- Recheck mutable logical metadata after entitlement locks; scope is also
  -- anchored by exact composite grant/version FKs, with no update cascade.
  if p_action='create_version' then
    -- Acquire UPDATE directly: two adopters must not first take SHARE locks
    -- and deadlock while both attempt an upgrade on the same document.
    perform 1 from public.documents where id=d.id and account_id=d.account_id and facility_id=d.facility_id and is_demo for update;
  else
    perform 1 from public.documents where id=d.id and account_id=d.account_id and facility_id=d.facility_id and is_demo for share;
  end if;
  if not found then raise exception 'Document unavailable' using errcode='42501'; end if;
  return profile;
end;
$$;

create function private.lock_document_version_head(p_document_id uuid)
returns private.document_version_heads language plpgsql security invoker set search_path='' as $$
declare d public.documents%rowtype; h private.document_version_heads%rowtype;
begin
  select * into d from public.documents where id=p_document_id and is_demo and facility_id is not null for update;
  if not found then raise exception 'Document unavailable' using errcode='42501'; end if;
  insert into private.document_version_heads(document_id,account_id,facility_id) values(d.id,d.account_id,d.facility_id) on conflict(document_id) do nothing;
  select * into strict h from private.document_version_heads where document_id=d.id for update;
  return h;
end;
$$;

create function private.lock_document_adoption_actor(p_object_id uuid,p_document_id uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare r private.private_object_reservations%rowtype; d public.documents%rowtype; profile uuid;
begin
  perform private.private_object_authenticated_subject();
  select * into r from private.private_object_reservations where id=p_object_id;
  select * into d from public.documents where id=p_document_id and is_demo;
  if r.id is null or d.id is null or d.facility_id is null or (r.account_id,r.facility_id) is distinct from (d.account_id,d.facility_id) then
    raise exception 'Document unavailable' using errcode='42501'; end if;
  -- A guessed cleared object plus directory/document entitlement is insufficient.
  -- Current source entitlement and independent exact target grants are required.
  profile:=private.lock_private_object_security_actor(p_object_id,'status');
  if profile is distinct from private.lock_document_version_actor(p_document_id,'create_version') then
    raise exception 'Document unavailable' using errcode='42501'; end if;
  return profile;
end;
$$;

create function private.document_version_receipt(v private.document_versions)
returns jsonb language sql immutable security invoker set search_path='' as $$
  select pg_catalog.jsonb_build_object('version_id',v.id,'document_id',v.document_id,'object_id',v.object_id,
    'version_ordinal',v.version_ordinal,'verified_sha256',v.verified_sha256,'byte_size',v.byte_size,'media_type',v.media_type,
    'lifecycle_state',v.lifecycle_state,'created_at',v.created_at,'preservation_hold_at_adoption',v.preservation_hold_at_adoption,
    'document_revision',v.expected_document_revision+1,'security_revision',v.expected_security_revision+1)
$$;

create function private.prepare_document_version()
returns trigger language plpgsql security definer set search_path='' as $$
declare profile uuid; h private.document_version_heads%rowtype; s private.private_object_security%rowtype;
  t private.private_object_transports%rowtype; o private.private_object_scan_observations%rowtype; c private.private_object_clearance_decisions%rowtype;
begin
  if tg_table_schema<>'private' or tg_table_name<>'document_versions' or tg_op<>'INSERT' or tg_when<>'BEFORE' then
    raise exception 'Unsupported document adoption context' using errcode='55000'; end if;
  profile:=private.lock_document_adoption_actor(new.object_id,new.document_id);
  if new.request_id is null or new.verified_sha256 is null or new.verified_sha256 !~ '^[0-9a-f]{64}$'
    or new.expected_security_revision is null or new.expected_security_revision<0
    or new.expected_document_revision is null or new.expected_document_revision<0 then
    raise exception 'Invalid document adoption request' using errcode='22023'; end if;
  h:=private.lock_document_version_head(new.document_id);
  s:=private.lock_private_object_security(new.object_id);
  if new.expected_document_revision<>h.document_revision or new.expected_security_revision<>s.security_revision
    or new.verified_sha256<>s.verified_sha256 then raise exception 'Document adoption conflict' using errcode='40001'; end if;
  select * into strict t from private.private_object_transports where object_id=s.object_id;
  select * into o from private.private_object_scan_observations where id=s.current_scan_observation_id;
  select * into c from private.private_object_clearance_decisions where id=s.current_clearance_id;
  if s.ingest_closed_at is not null or s.visibility_restricted or s.phi_suspected or s.scan_state<>'result'
    or o.malware_outcome is distinct from 'pass' or c.decision is distinct from 'cleared_no_phi'
    or c.scan_observation_id is distinct from o.id or c.verified_sha256 is distinct from s.verified_sha256 then
    raise exception 'Document security prerequisite unavailable' using errcode='55000'; end if;
  -- All authority/provenance fields are server assigned, even on a privileged
  -- direct INSERT. The immutable request fields are the checked CAS/fingerprint.
  new.id:=pg_catalog.gen_random_uuid();new.account_id:=h.account_id;new.facility_id:=h.facility_id;
  new.version_ordinal:=h.next_version_ordinal;new.byte_size:=t.verified_byte_size;new.media_type:=t.verified_media_type;
  new.transport_state:='finalized';new.scan_observation_id:=o.id;new.clearance_decision_id:=c.id;
  new.lifecycle_state:='internal_draft';new.preservation_hold_at_adoption:=s.preservation_hold;
  new.created_by_profile_id:=profile;new.created_by_auth_user_id:=private.private_object_authenticated_subject();
  new.created_at:=pg_catalog.clock_timestamp();new.adoption_transaction_id:=pg_catalog.pg_current_xact_id();new.is_demo:=true;
  return new;
end;
$$;

create function private.document_version_closure_allowed(p_before private.private_object_security,p_after private.private_object_security)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v private.document_versions%rowtype; actor uuid:=private.private_object_authenticated_subject();
begin
  if p_before.ingest_closed_at is not null or p_after.ingest_closed_at is null
    or p_after.security_revision<>p_before.security_revision+1
    or (pg_catalog.to_jsonb(p_before)-array['ingest_closed_at','security_revision']) is distinct from
      (pg_catalog.to_jsonb(p_after)-array['ingest_closed_at','security_revision']) then return false; end if;
  select * into v from private.document_versions where object_id=p_before.object_id and account_id=p_before.account_id
    and verified_sha256=p_before.verified_sha256 and scan_observation_id=p_before.current_scan_observation_id
    and clearance_decision_id=p_before.current_clearance_id and expected_security_revision=p_before.security_revision
    and created_by_auth_user_id=actor and created_at=p_after.ingest_closed_at
    and adoption_transaction_id=pg_catalog.pg_current_xact_id();
  if not found then return false; end if;
  return v.created_by_profile_id=private.lock_document_adoption_actor(v.object_id,v.document_id);
end;
$$;

-- Preserve the reviewed security guard verbatim except for the narrow
-- same-transaction exact-version closure branch. No GUC/context flag is trusted.
create or replace function private.guard_private_object_security_history()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op in ('DELETE','TRUNCATE') or (tg_op='UPDATE' and tg_table_name not in ('private_object_grants','private_object_security')) then
    raise exception 'Private object security history is immutable' using errcode='55000'; end if;
  if tg_table_name='private_object_clearance_decisions' then
    new.reviewer_auth_user_id:=private.private_object_authenticated_subject();
    new.reviewer_profile_id:=private.lock_private_object_security_actor(new.object_id,'clear_object');
    new.id:=pg_catalog.gen_random_uuid(); new.decided_at:=pg_catalog.clock_timestamp();
  elsif tg_table_name='private_object_security' then
    if session_user='authenticator' and pg_catalog.current_setting('role',true)='authenticated' then
      perform private.private_object_authenticated_subject();
      if tg_op='UPDATE' and ((new.scan_state,new.current_scan_attempt_id,new.current_scan_observation_id,new.preservation_hold,new.ingest_closed_at)
          is distinct from (old.scan_state,old.current_scan_attempt_id,old.current_scan_observation_id,old.preservation_hold,old.ingest_closed_at)
        or (old.visibility_restricted and not new.visibility_restricted)) then
        if not private.document_version_closure_allowed(old,new) then
          raise exception 'Human disposition cannot change technical controls' using errcode='42501'; end if;
      end if;
    else
      perform private.private_object_service_context();
      if new.current_clearance_id is not null and (tg_op='INSERT' or new.current_clearance_id is distinct from old.current_clearance_id) then
        raise exception 'Service cannot authorize human clearance' using errcode='42501'; end if;
    end if;
    if tg_op='INSERT' then
      if new.security_revision<>0 or new.scan_state<>'pending' or new.phi_suspected or new.visibility_restricted or new.preservation_hold or new.ingest_closed_at is not null then
        raise exception 'Invalid initial security state' using errcode='23514'; end if;
    elsif (new.object_id,new.account_id,new.verified_sha256,new.transport_state) is distinct from (old.object_id,old.account_id,old.verified_sha256,old.transport_state)
      or new.security_revision<>old.security_revision+1 or (old.ingest_closed_at is not null and new.ingest_closed_at is distinct from old.ingest_closed_at) then
      raise exception 'Invalid private object security transition' using errcode='55000'; end if;
  else
    perform private.private_object_service_context();
    if tg_table_name='private_object_grants' then
      if tg_op='INSERT' then new.id:=pg_catalog.gen_random_uuid(); new.created_at:=pg_catalog.clock_timestamp();
        if new.revoked_at is not null or new.revoked_from_revision is not null then raise exception 'Invalid private object grant' using errcode='23514'; end if;
      else
        if (pg_catalog.to_jsonb(new)-array['revoked_at','revoked_from_revision']) is distinct from (pg_catalog.to_jsonb(old)-array['revoked_at','revoked_from_revision'])
          or old.revoked_at is not null or new.revoked_at is null or new.revoked_from_revision is null then
          raise exception 'Private object grants cannot be edited or restored' using errcode='55000'; end if;
        new.revoked_at:=pg_catalog.clock_timestamp();
      end if;
    elsif tg_table_name='private_object_scan_attempts' then new.id:=pg_catalog.gen_random_uuid(); new.claimed_at:=pg_catalog.clock_timestamp();
    elsif tg_table_name='private_object_scan_observations' then new.id:=pg_catalog.gen_random_uuid(); new.recorded_at:=pg_catalog.clock_timestamp();
    else raise exception 'Unsupported security history' using errcode='55000'; end if;
  end if;
  return new;
end;
$$;

create function private.guard_document_version_history()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op in ('DELETE','TRUNCATE') or tg_table_name='document_versions' then
    raise exception 'Document version history is immutable' using errcode='55000'; end if;
  if tg_table_name='document_version_grants' then
    perform private.private_object_service_context();
    if tg_op='INSERT' then
      new.id:=pg_catalog.gen_random_uuid();new.created_at:=pg_catalog.clock_timestamp();
      if new.revoked_at is not null or new.revoked_from_revision is not null then raise exception 'Invalid document grant' using errcode='23514'; end if;
    else
      if (pg_catalog.to_jsonb(new)-array['revoked_at','revoked_from_revision']) is distinct from (pg_catalog.to_jsonb(old)-array['revoked_at','revoked_from_revision'])
        or old.revoked_at is not null or new.revoked_at is null or new.revoked_from_revision is null then
        raise exception 'Document grants cannot be edited or restored' using errcode='55000'; end if;
      new.revoked_at:=pg_catalog.clock_timestamp();
    end if;
  elsif tg_table_name='document_version_heads' then
    if session_user='authenticator' and pg_catalog.current_setting('role',true)='authenticated' then perform private.private_object_authenticated_subject();
    else perform private.private_object_service_context(); end if;
    if tg_op='INSERT' then
      if new.document_revision<>0 or new.next_version_ordinal<>1 then raise exception 'Invalid document head' using errcode='23514'; end if;
    elsif (new.document_id,new.account_id,new.facility_id) is distinct from (old.document_id,old.account_id,old.facility_id)
      or new.document_revision<>old.document_revision+1 or new.next_version_ordinal not in (old.next_version_ordinal,old.next_version_ordinal+1) then
      raise exception 'Invalid document revision transition' using errcode='55000'; end if;
  else raise exception 'Unsupported document history' using errcode='55000'; end if;
  return new;
end;
$$;

create function private.audit_document_version_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid; profile uuid; metadata jsonb; object_type text; event_name text; human boolean;
begin
  if tg_table_schema<>'private' or tg_when<>'AFTER' or tg_level<>'ROW' then raise exception 'Unsupported document audit context' using errcode='55000'; end if;
  if tg_table_name='document_versions' and tg_op='INSERT' then
    actor:=private.private_object_authenticated_subject();profile:=new.created_by_profile_id;human:=true;
    if actor<>new.created_by_auth_user_id then raise exception 'Invalid document actor' using errcode='28000'; end if;
    object_type:='document_version';event_name:='document_version_adopted';
    metadata:=pg_catalog.jsonb_build_object('document_id',new.document_id,'object_id',new.object_id,'facility_id',new.facility_id,
      'version_ordinal',new.version_ordinal,'verified_sha256',new.verified_sha256,'scan_observation_id',new.scan_observation_id,
      'clearance_decision_id',new.clearance_decision_id,'document_revision',new.expected_document_revision+1,
      'security_revision',new.expected_security_revision+1,'preservation_hold_at_adoption',new.preservation_hold_at_adoption,'lifecycle_state','internal_draft');
    -- Mandatory on every INSERT path, not an optional caller cleanup step.
    -- Closing preserves the hold, restriction, scan and clearance evidence.
    update private.private_object_security set ingest_closed_at=new.created_at,security_revision=security_revision+1
      where object_id=new.object_id and security_revision=new.expected_security_revision and ingest_closed_at is null;
    if not found then raise exception 'Document adoption conflict' using errcode='40001'; end if;
    update private.document_version_heads set document_revision=document_revision+1,next_version_ordinal=next_version_ordinal+1
      where document_id=new.document_id and document_revision=new.expected_document_revision and next_version_ordinal=new.version_ordinal;
    if not found then raise exception 'Document adoption conflict' using errcode='40001'; end if;
  elsif tg_table_name='document_version_grants' and tg_op in ('INSERT','UPDATE') then
    perform private.private_object_service_context();human:=false;object_type:='document_version_grant';
    event_name:=case when tg_op='INSERT' then 'document_version_grant_created' else 'document_version_grant_revoked' end;
    metadata:=pg_catalog.jsonb_build_object('document_id',new.document_id,'facility_id',new.facility_id,'subject_profile_id',new.user_profile_id,
      'capability',new.capability_key,'document_revision',coalesce(new.revoked_from_revision,new.requested_revision)+1);
  else raise exception 'Unsupported document audit relation' using errcode='55000'; end if;
  insert into public.audit_events(id,account_id,actor_user_profile_id,actor_kind,actor_auth_user_id,actor_system_key,object_type,object_id,event_type,event_metadata,occurred_at,correlation_id,is_internal_only,is_demo)
  values(pg_catalog.gen_random_uuid(),new.account_id,profile,case when human then 'user' else 'system' end,actor,
    case when human then null else 'database_privileged_operation' end,object_type,new.id,event_name,
    metadata||pg_catalog.jsonb_build_object('component_version','document-versions-v1','operation_source',tg_table_name,
      'database_session_user',session_user::text,'database_request_role',pg_catalog.current_setting('role',true)),
    pg_catalog.clock_timestamp(),pg_catalog.gen_random_uuid(),true,true);
  return null;
end;
$$;

create trigger document_versions_prepare before insert on private.document_versions for each row execute function private.prepare_document_version();
create trigger document_versions_immutable before update or delete on private.document_versions for each row execute function private.guard_document_version_history();
create trigger document_versions_no_truncate before truncate on private.document_versions for each statement execute function private.guard_document_version_history();
create trigger document_versions_adopt_and_audit after insert on private.document_versions for each row execute function private.audit_document_version_change();
create trigger document_version_grants_guard before insert or update or delete on private.document_version_grants for each row execute function private.guard_document_version_history();
create trigger document_version_grants_no_truncate before truncate on private.document_version_grants for each statement execute function private.guard_document_version_history();
create trigger document_version_grants_audit after insert or update on private.document_version_grants for each row execute function private.audit_document_version_change();
create trigger document_version_heads_guard before insert or update or delete on private.document_version_heads for each row execute function private.guard_document_version_history();
create trigger document_version_heads_no_truncate before truncate on private.document_version_heads for each statement execute function private.guard_document_version_history();

create function private.provision_document_version_grant(p_document_id uuid,p_profile_id uuid,p_capability text,p_request_id uuid,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.documents%rowtype; h private.document_version_heads%rowtype; g private.document_version_grants%rowtype; access record;
begin
  perform private.private_object_service_context();perform private.lock_private_object_security_config();
  select * into d from public.documents where id=p_document_id and is_demo and facility_id is not null;
  if not found then raise exception 'Document unavailable' using errcode='42501'; end if;
  select * into access from private.lock_private_object_security_profile(p_profile_id,d.account_id,d.facility_id);
  if not access.directory_allowed then raise exception 'Document unavailable' using errcode='42501'; end if;
  if p_capability is null or p_capability not in ('view_versions','create_version') or p_request_id is null or p_expected_revision is null or p_expected_revision<0 then
    raise exception 'Invalid document grant' using errcode='22023'; end if;
  perform 1 from private.document_version_grants where document_id=d.id and user_profile_id=p_profile_id order by id for update;
  h:=private.lock_document_version_head(d.id);
  select * into g from private.document_version_grants where document_id=d.id and request_id=p_request_id;
  if found then
    if (g.user_profile_id,g.capability_key,g.requested_revision) is distinct from (p_profile_id,p_capability,p_expected_revision) then raise exception 'Document grant request conflict' using errcode='23505'; end if;
    return pg_catalog.jsonb_build_object('grant_id',g.id,'document_revision',h.document_revision,'revoked',g.revoked_at is not null);
  end if;
  if p_expected_revision<>h.document_revision then raise exception 'Document revision conflict' using errcode='40001'; end if;
  insert into private.document_version_grants(document_id,account_id,facility_id,user_profile_id,capability_key,request_id,requested_revision)
    values(d.id,d.account_id,d.facility_id,p_profile_id,p_capability,p_request_id,p_expected_revision) returning * into g;
  update private.document_version_heads set document_revision=document_revision+1 where document_id=d.id;
  return pg_catalog.jsonb_build_object('grant_id',g.id,'document_revision',h.document_revision+1,'revoked',false);
end;
$$;

create function private.revoke_document_version_grant(p_document_id uuid,p_grant_id uuid,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g private.document_version_grants%rowtype; h private.document_version_heads%rowtype;
begin
  perform private.private_object_service_context();perform private.lock_private_object_security_config();
  select * into g from private.document_version_grants where id=p_grant_id and document_id=p_document_id for update;
  if not found then raise exception 'Document unavailable' using errcode='42501'; end if;
  h:=private.lock_document_version_head(p_document_id);
  if g.revoked_at is not null and g.revoked_from_revision=p_expected_revision then
    return pg_catalog.jsonb_build_object('grant_id',g.id,'document_revision',h.document_revision,'revoked',true); end if;
  if p_expected_revision is distinct from h.document_revision then raise exception 'Document revision conflict' using errcode='40001'; end if;
  if g.revoked_at is not null then raise exception 'Document grant already revoked' using errcode='55000'; end if;
  update private.document_version_grants set revoked_at=pg_catalog.clock_timestamp(),revoked_from_revision=p_expected_revision where id=g.id;
  update private.document_version_heads set document_revision=document_revision+1 where document_id=p_document_id;
  return pg_catalog.jsonb_build_object('grant_id',g.id,'document_revision',h.document_revision+1,'revoked',true);
end;
$$;

create function private.adopt_private_object(p_object_id uuid,p_expected_sha256 text,p_document_id uuid,p_expected_security_revision bigint,p_expected_document_revision bigint,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare profile uuid; h private.document_version_heads%rowtype; v private.document_versions%rowtype;
begin
  profile:=private.lock_document_adoption_actor(p_object_id,p_document_id);
  if p_request_id is null or p_expected_sha256 is null or p_expected_sha256 !~ '^[0-9a-f]{64}$'
    or p_expected_security_revision is null or p_expected_security_revision<0 or p_expected_document_revision is null or p_expected_document_revision<0 then
    raise exception 'Invalid document adoption request' using errcode='22023'; end if;
  h:=private.lock_document_version_head(p_document_id);
  select * into v from private.document_versions where document_id=p_document_id and created_by_profile_id=profile and request_id=p_request_id;
  if found then
    if (v.object_id,v.verified_sha256,v.expected_security_revision,v.expected_document_revision) is distinct from
      (p_object_id,p_expected_sha256,p_expected_security_revision,p_expected_document_revision) then
      raise exception 'Document adoption request conflict' using errcode='23505'; end if;
    return private.document_version_receipt(v);
  end if;
  insert into private.document_versions(document_id,object_id,verified_sha256,expected_security_revision,expected_document_revision,request_id)
    values(p_document_id,p_object_id,p_expected_sha256,p_expected_security_revision,p_expected_document_revision,p_request_id) returning * into v;
  return private.document_version_receipt(v);
end;
$$;

create function private.has_document_version_capability(p_document_id uuid,p_capability text)
returns boolean language sql stable security invoker set search_path='' as $$
  select p_capability in ('view_versions','create_version') and exists (
    select 1 from public.documents d join private.document_version_grants g on g.document_id=d.id and g.account_id=d.account_id and g.facility_id=d.facility_id
    where d.id=p_document_id and d.is_demo and d.facility_id is not null and g.user_profile_id=private.current_subject_id()
      and g.capability_key=p_capability and g.revoked_at is null and g.is_demo
      and private.has_directory_capability(d.account_id,'view_asset',d.facility_id))
$$;

create function private.list_version_documents(p_account_id uuid,p_after_id uuid default null,p_limit integer default 25)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; cursor uuid;
begin
  perform private.private_object_authenticated_subject();
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'Invalid document query' using errcode='22023'; end if;
  begin perform private.lock_private_object_security_config();
  exception when insufficient_privilege then return pg_catalog.jsonb_build_object('items','[]'::jsonb,'next_cursor',null); end;
  -- One statement snapshot; filtered rows/counts/cursors disclose only exact
  -- view-granted logical documents. This metadata is not a reusable permit.
  with permitted as (
    select d.*,coalesce(h.document_revision,0) document_revision from public.documents d
    left join private.document_version_heads h on h.document_id=d.id
    where d.account_id=p_account_id and (p_after_id is null or d.id>p_after_id)
      and private.has_document_version_capability(d.id,'view_versions') order by d.id limit p_limit+1
  ), numbered as (select p.*,row_number() over(order by p.id) ordinal from permitted p)
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('document_id',n.id,'account_id',n.account_id,'facility_id',n.facility_id,
    'title',n.title,'document_class',n.document_class,'document_revision',n.document_revision,
    'can_create_version',private.has_document_version_capability(n.id,'create_version')) order by n.id) filter(where n.ordinal<=p_limit),'[]'::jsonb),
    case when count(*)>p_limit then (array_agg(n.id order by n.id))[p_limit] else null end into result,cursor from numbered n;
  return pg_catalog.jsonb_build_object('items',result,'next_cursor',cursor);
end;
$$;

create function private.list_document_versions(p_document_id uuid,p_after_ordinal bigint default 0,p_limit integer default 25)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; cursor bigint; revision bigint;
begin
  perform private.private_object_authenticated_subject();
  if p_after_ordinal is null or p_after_ordinal<0 or p_limit is null or p_limit not between 1 and 100 then raise exception 'Invalid version query' using errcode='22023'; end if;
  begin perform private.lock_document_version_actor(p_document_id,'view_versions');
  exception when insufficient_privilege then return pg_catalog.jsonb_build_object('document_id',null,'state','not_found_or_unavailable','items','[]'::jsonb,'next_cursor',null); end;
  select document_revision into revision from private.document_version_heads where document_id=p_document_id for share;
  with page as (
    select v.*,s.preservation_hold,s.visibility_restricted from private.document_versions v join private.private_object_security s on s.object_id=v.object_id
    where v.document_id=p_document_id and v.version_ordinal>p_after_ordinal order by v.version_ordinal limit p_limit+1
  ), numbered as (select p.*,row_number() over(order by p.version_ordinal) ordinal from page p)
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('version_id',n.id,'version_ordinal',n.version_ordinal,'object_id',n.object_id,
    'verified_sha256',n.verified_sha256,'byte_size',n.byte_size,'media_type',n.media_type,'lifecycle_state',n.lifecycle_state,'created_at',n.created_at,
    'preservation_hold_at_adoption',n.preservation_hold_at_adoption,'preservation_hold',n.preservation_hold,'visibility_restricted',n.visibility_restricted)
    order by n.version_ordinal) filter(where n.ordinal<=p_limit),'[]'::jsonb),
    case when count(*)>p_limit then (array_agg(n.version_ordinal order by n.version_ordinal))[p_limit] else null end into result,cursor from numbered n;
  return pg_catalog.jsonb_build_object('document_id',p_document_id,'state','available','document_revision',coalesce(revision,0),'items',result,'next_cursor',cursor);
end;
$$;

create function public.provision_document_version_grant(p_document_id uuid,p_profile_id uuid,p_capability text,p_request_id uuid,p_expected_revision bigint) returns jsonb language sql security invoker set search_path='' as $$ select private.provision_document_version_grant(p_document_id,p_profile_id,p_capability,p_request_id,p_expected_revision) $$;
create function public.revoke_document_version_grant(p_document_id uuid,p_grant_id uuid,p_expected_revision bigint) returns jsonb language sql security invoker set search_path='' as $$ select private.revoke_document_version_grant(p_document_id,p_grant_id,p_expected_revision) $$;
create function public.adopt_private_object(p_object_id uuid,p_expected_sha256 text,p_document_id uuid,p_expected_security_revision bigint,p_expected_document_revision bigint,p_request_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.adopt_private_object(p_object_id,p_expected_sha256,p_document_id,p_expected_security_revision,p_expected_document_revision,p_request_id) $$;
create function public.list_version_documents(p_account_id uuid,p_after_id uuid default null,p_limit integer default 25) returns jsonb language sql security invoker set search_path='' as $$ select private.list_version_documents(p_account_id,p_after_id,p_limit) $$;
create function public.list_document_versions(p_document_id uuid,p_after_ordinal bigint default 0,p_limit integer default 25) returns jsonb language sql security invoker set search_path='' as $$ select private.list_document_versions(p_document_id,p_after_ordinal,p_limit) $$;

revoke all on function private.lock_document_version_actor(uuid,text),private.lock_document_version_head(uuid),private.lock_document_adoption_actor(uuid,uuid),private.document_version_receipt(private.document_versions),private.prepare_document_version(),private.document_version_closure_allowed(private.private_object_security,private.private_object_security),private.guard_document_version_history(),private.audit_document_version_change(),private.has_document_version_capability(uuid,text),
  private.provision_document_version_grant(uuid,uuid,text,uuid,bigint),private.revoke_document_version_grant(uuid,uuid,bigint),private.adopt_private_object(uuid,text,uuid,bigint,bigint,uuid),private.list_version_documents(uuid,uuid,integer),private.list_document_versions(uuid,bigint,integer),
  public.provision_document_version_grant(uuid,uuid,text,uuid,bigint),public.revoke_document_version_grant(uuid,uuid,bigint),public.adopt_private_object(uuid,text,uuid,bigint,bigint,uuid),public.list_version_documents(uuid,uuid,integer),public.list_document_versions(uuid,bigint,integer) from public,anon,authenticated,service_role;
grant execute on function private.adopt_private_object(uuid,text,uuid,bigint,bigint,uuid),private.list_version_documents(uuid,uuid,integer),private.list_document_versions(uuid,bigint,integer),public.adopt_private_object(uuid,text,uuid,bigint,bigint,uuid),public.list_version_documents(uuid,uuid,integer),public.list_document_versions(uuid,bigint,integer) to authenticated;
grant execute on function private.provision_document_version_grant(uuid,uuid,text,uuid,bigint),private.revoke_document_version_grant(uuid,uuid,bigint),public.provision_document_version_grant(uuid,uuid,text,uuid,bigint),public.revoke_document_version_grant(uuid,uuid,bigint) to service_role;
comment on table private.document_versions is 'Immutable synthetic internal draft versions. Exact finalized object/digest/current clearance adoption closes ingest atomically. No professional approval, release, supersession, serving or destruction authority.';
comment on table private.document_version_grants is 'Explicit synthetic exact-logical-document metadata/read and creation grants. Not version-content, release or audience authority. Current identity/membership/facility access always required.';
comment on table private.document_version_heads is 'CAS and ordinal allocation only; no current/released version pointer. A new draft never supersedes another version or changes legacy document labels.';
commit;
