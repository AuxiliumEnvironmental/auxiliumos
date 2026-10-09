begin;

-- DOC-001C / recorded OD-002 synthetic reviewer-assignment choice only.
-- No owner capability, logical release label, immutable version or live policy
-- is changed. Review records are not release, signature or qualification proof.
create table private.document_review_heads (
  version_id uuid primary key references private.document_versions(id),
  review_revision bigint not null default 0 check(review_revision>=0)
);
create table private.document_review_assignments (
  id uuid primary key,
  version_id uuid not null,
  document_id uuid not null,
  account_id uuid not null,
  verified_sha256 text not null check(verified_sha256 ~ '^[0-9a-f]{64}$'),
  user_profile_id uuid not null,
  assigned_auth_user_id uuid not null,
  qualification_basis text not null check(qualification_basis='synthetic_fixture'),
  request_id uuid not null,
  requested_document_revision bigint not null check(requested_document_revision>=0),
  requested_review_revision bigint not null check(requested_review_revision>=0),
  created_at timestamptz not null,
  revoked_at timestamptz,
  revoked_from_revision bigint,
  is_demo boolean not null default true check(is_demo),
  unique(version_id,request_id),
  unique(id,version_id,verified_sha256,user_profile_id,assigned_auth_user_id),
  foreign key(version_id,document_id,account_id,verified_sha256) references private.document_versions(id,document_id,account_id,verified_sha256),
  foreign key(account_id,user_profile_id) references public.account_access(account_id,user_profile_id),
  check((revoked_at is null and revoked_from_revision is null) or (revoked_at is not null and revoked_from_revision>=0))
);
create unique index document_review_assignments_active_unique on private.document_review_assignments(version_id,user_profile_id) where revoked_at is null;
create index document_review_assignments_recipient_idx on private.document_review_assignments(account_id,user_profile_id);
create index document_review_assignments_version_idx on private.document_review_assignments(version_id,document_id,account_id,verified_sha256);
create table private.document_review_requests (
  id uuid primary key,
  version_id uuid not null unique,
  document_id uuid not null,
  account_id uuid not null,
  verified_sha256 text not null check(verified_sha256 ~ '^[0-9a-f]{64}$'),
  requester_profile_id uuid not null,
  requester_auth_user_id uuid not null,
  request_id uuid not null,
  expected_document_revision bigint not null check(expected_document_revision>=0),
  expected_review_revision bigint not null check(expected_review_revision>=0),
  requested_at timestamptz not null,
  is_demo boolean not null default true check(is_demo),
  unique(requester_auth_user_id,request_id),
  unique(id,version_id,document_id,account_id,verified_sha256),
  foreign key(version_id,document_id,account_id,verified_sha256) references private.document_versions(id,document_id,account_id,verified_sha256),
  foreign key(account_id,requester_profile_id) references public.account_access(account_id,user_profile_id)
);
create index document_review_requests_scope_idx on private.document_review_requests(version_id,document_id,account_id,verified_sha256);
create index document_review_requests_actor_idx on private.document_review_requests(account_id,requester_profile_id);
create table private.document_review_decisions (
  id uuid primary key,
  review_request_id uuid not null unique,
  version_id uuid not null unique,
  document_id uuid not null,
  account_id uuid not null,
  verified_sha256 text not null check(verified_sha256 ~ '^[0-9a-f]{64}$'),
  assignment_id uuid not null,
  reviewer_profile_id uuid not null,
  reviewer_auth_user_id uuid not null,
  request_id uuid not null,
  expected_document_revision bigint not null check(expected_document_revision>=0),
  expected_review_revision bigint not null check(expected_review_revision>=0),
  decision text not null check(decision in ('approved_internal','changes_requested','rejected')),
  attestation_code text not null check(attestation_code='reviewed_exact_synthetic_version'),
  decided_at timestamptz not null,
  is_demo boolean not null default true check(is_demo),
  unique(reviewer_auth_user_id,request_id),
  foreign key(review_request_id,version_id,document_id,account_id,verified_sha256)
    references private.document_review_requests(id,version_id,document_id,account_id,verified_sha256),
  foreign key(assignment_id,version_id,verified_sha256,reviewer_profile_id,reviewer_auth_user_id)
    references private.document_review_assignments(id,version_id,verified_sha256,user_profile_id,assigned_auth_user_id),
  foreign key(account_id,reviewer_profile_id) references public.account_access(account_id,user_profile_id)
);
create index document_review_decisions_request_idx on private.document_review_decisions(review_request_id,version_id,document_id,account_id,verified_sha256);
create index document_review_decisions_assignment_idx on private.document_review_decisions(assignment_id,version_id,verified_sha256,reviewer_profile_id,reviewer_auth_user_id);
create index document_review_decisions_actor_idx on private.document_review_decisions(account_id,reviewer_profile_id);
alter table private.document_review_heads enable row level security;
alter table private.document_review_assignments enable row level security;
alter table private.document_review_requests enable row level security;
alter table private.document_review_decisions enable row level security;
revoke all on private.document_review_heads,private.document_review_assignments,
  private.document_review_requests,private.document_review_decisions from public,anon,authenticated,service_role;

-- Exact additive event families; all prior allowlist branches remain unchanged.
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
      or (account_id is not null and is_demo and actor_kind='user' and object_type='workspace_plan'
        and event_type in ('workspace_plan_created','workspace_plan_revised'))
      or (account_id is not null and is_demo and actor_kind='system' and object_type='document_review_assignment'
        and event_type in ('document_review_assignment_created','document_review_assignment_revoked'))
      or (account_id is not null and is_demo and actor_kind='user' and object_type='document_review_request' and event_type='document_review_requested')
      or (account_id is not null and is_demo and actor_kind='user' and object_type='document_review_decision' and event_type='document_review_decided')
    ))
  );

-- Same safe exact adopted-object predicates as DOC-001B. This metadata-only
-- helper grants no bytes and is never executable by application roles.
create function private.lock_document_review_safety(v private.document_versions)
returns void language plpgsql security invoker set search_path='' as $$
declare t private.private_object_transports%rowtype; s private.private_object_security%rowtype;
  o private.private_object_scan_observations%rowtype; c private.private_object_clearance_decisions%rowtype;
begin
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
    raise exception 'not_found_or_unavailable' using errcode='42501';
  end if;
  -- A preservation hold does not remove visibility or change review authority.
end;
$$;

create function private.lock_document_review_human(p_version_id uuid,p_expected_sha256 text,p_action text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare actor uuid:=private.private_object_authenticated_subject(); v private.document_versions%rowtype; profile uuid;
begin
  if p_action is null or p_action not in ('view','request','decide') then raise exception 'Invalid review action' using errcode='22023'; end if;
  perform private.lock_document_content_config();
  select * into v from private.document_versions where id=p_version_id and is_demo and lifecycle_state='internal_draft';
  if not found then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
  begin
    profile:=private.lock_document_version_actor(v.document_id,case when p_action='request' then 'create_version' else 'view_versions' end);
  exception when insufficient_privilege then raise exception 'not_found_or_unavailable' using errcode='42501'; end;
  if not exists(select 1 from public.user_profiles where id=profile and auth_user_id=actor) then
    raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
  if p_expected_sha256 is null or p_expected_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'Invalid review digest' using errcode='22023'; end if;
  if v.verified_sha256<>p_expected_sha256 then raise exception 'Document review conflict' using errcode='40001'; end if;
  if p_action='decide' then
    if private.lock_document_content_access(v.id,v.verified_sha256) is distinct from profile then
      raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
  else perform private.lock_document_review_safety(v); end if;
  return profile;
end;
$$;

create function private.lock_document_review_recipient(p_version_id uuid,p_expected_sha256 text,p_profile_id uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v private.document_versions%rowtype; access record; actor uuid;
begin
  perform private.private_object_service_context();perform private.lock_document_content_config();perform private.lock_private_object_security_config();
  select * into v from private.document_versions where id=p_version_id and is_demo and lifecycle_state='internal_draft';
  if not found then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
  select * into access from private.lock_private_object_security_profile(p_profile_id,v.account_id,v.facility_id);
  if not access.directory_allowed then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
  perform 1 from private.document_version_grants where document_id=v.document_id and account_id=v.account_id and facility_id=v.facility_id
    and user_profile_id=p_profile_id and capability_key='view_versions' and revoked_at is null and is_demo for share;
  if not found then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
  perform 1 from public.documents where id=v.document_id and account_id=v.account_id and facility_id=v.facility_id and is_demo for share;
  if not found then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
  perform 1 from private.document_content_grants where version_id=v.id and document_id=v.document_id and account_id=v.account_id
    and verified_sha256=v.verified_sha256 and user_profile_id=p_profile_id and capability_key='view_content' and revoked_at is null and is_demo for share;
  if not found then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
  if p_expected_sha256 is null or p_expected_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'Invalid review digest' using errcode='22023'; end if;
  if v.verified_sha256<>p_expected_sha256 then raise exception 'Document review conflict' using errcode='40001'; end if;
  perform private.lock_document_review_safety(v);
  select auth_user_id into strict actor from public.user_profiles where id=p_profile_id;
  return actor;
end;
$$;

create function private.lock_document_review_document_revision(p_document_id uuid)
returns bigint language plpgsql security invoker set search_path='' as $$
declare revision bigint;
begin
  select document_revision into revision from private.document_version_heads where document_id=p_document_id for share;
  if not found then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
  return revision;
end;
$$;
create function private.lock_document_review_head(p_version_id uuid)
returns bigint language plpgsql security invoker set search_path='' as $$
declare revision bigint;
begin
  insert into private.document_review_heads(version_id) values(p_version_id) on conflict(version_id) do nothing;
  select review_revision into strict revision from private.document_review_heads where version_id=p_version_id for update;
  return revision;
end;
$$;
create function private.lock_document_review_assignment(p_version_id uuid,p_profile uuid,p_auth uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare assignment uuid;
begin
  select id into assignment from private.document_review_assignments where version_id=p_version_id and user_profile_id=p_profile
    and assigned_auth_user_id=p_auth and qualification_basis='synthetic_fixture' and revoked_at is null and is_demo for share;
  if not found then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
  return assignment;
end;
$$;

create function private.guard_document_review_history()
returns trigger language plpgsql security definer set search_path='' as $$
declare v private.document_versions%rowtype; r private.document_review_requests%rowtype;
  profile uuid; actor uuid; revision bigint; document_revision bigint;
begin
  if tg_table_schema<>'private' or tg_when<>'BEFORE' or tg_op in ('DELETE','TRUNCATE') then
    raise exception 'Document review history is immutable' using errcode='55000'; end if;
  if tg_table_name='document_review_heads' then
    if session_user='authenticator' and current_setting('role',true)='authenticated' then perform private.private_object_authenticated_subject();
    else perform private.private_object_service_context(); end if;
    if (tg_op='INSERT' and new.review_revision<>0) or (tg_op='UPDATE' and
      (new.version_id<>old.version_id or new.review_revision<>old.review_revision+1)) then
      raise exception 'Invalid review revision' using errcode='55000'; end if;
    return new;
  end if;
  if tg_table_name='document_review_assignments' then
    perform private.private_object_service_context();
    if tg_op='UPDATE' then
      if (to_jsonb(new)-array['revoked_at','revoked_from_revision']) is distinct from (to_jsonb(old)-array['revoked_at','revoked_from_revision'])
        or old.revoked_at is not null or new.revoked_at is null or new.revoked_from_revision is null then
        raise exception 'Review assignments cannot be edited or restored' using errcode='55000'; end if;
      revision:=private.lock_document_review_head(new.version_id);
      if new.revoked_from_revision<>revision then raise exception 'Document review conflict' using errcode='40001'; end if;
      new.revoked_at:=clock_timestamp();return new;
    end if;
    if new.request_id is null or new.requested_document_revision is null or new.requested_document_revision<0
      or new.requested_review_revision is null or new.requested_review_revision<0
      or new.qualification_basis is distinct from 'synthetic_fixture' then raise exception 'Invalid review assignment' using errcode='22023'; end if;
    actor:=private.lock_document_review_recipient(new.version_id,new.verified_sha256,new.user_profile_id);
    select * into strict v from private.document_versions where id=new.version_id;
    document_revision:=private.lock_document_review_document_revision(v.document_id);revision:=private.lock_document_review_head(v.id);
    if new.requested_document_revision<>document_revision or new.requested_review_revision<>revision then
      raise exception 'Document review conflict' using errcode='40001'; end if;
    if new.revoked_at is not null or new.revoked_from_revision is not null then raise exception 'Invalid review assignment' using errcode='23514'; end if;
    new.id:=gen_random_uuid();new.document_id:=v.document_id;new.account_id:=v.account_id;new.assigned_auth_user_id:=actor;
    new.created_at:=clock_timestamp();new.is_demo:=true;
  elsif tg_table_name='document_review_requests' and tg_op='INSERT' then
    actor:=private.private_object_authenticated_subject();profile:=private.lock_document_review_human(new.version_id,new.verified_sha256,'request');
    if new.request_id is null or new.expected_document_revision is null or new.expected_document_revision<0
      or new.expected_review_revision is null or new.expected_review_revision<0 then raise exception 'Invalid review request' using errcode='22023'; end if;
    select * into strict v from private.document_versions where id=new.version_id;
    document_revision:=private.lock_document_review_document_revision(v.document_id);revision:=private.lock_document_review_head(v.id);
    if new.expected_document_revision<>document_revision or new.expected_review_revision<>revision then
      raise exception 'Document review conflict' using errcode='40001'; end if;
    new.id:=gen_random_uuid();new.document_id:=v.document_id;new.account_id:=v.account_id;
    new.requester_profile_id:=profile;new.requester_auth_user_id:=actor;new.requested_at:=clock_timestamp();new.is_demo:=true;
  elsif tg_table_name='document_review_decisions' and tg_op='INSERT' then
    actor:=private.private_object_authenticated_subject();
    select * into r from private.document_review_requests where id=new.review_request_id;
    if not found then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
    profile:=private.lock_document_review_human(r.version_id,new.verified_sha256,'decide');
    if new.request_id is null or new.expected_document_revision is null or new.expected_document_revision<0
      or new.expected_review_revision is null or new.expected_review_revision<0
      or new.decision is null or new.decision not in ('approved_internal','changes_requested','rejected')
      or new.attestation_code is distinct from 'reviewed_exact_synthetic_version' then raise exception 'Invalid review decision' using errcode='22023'; end if;
    document_revision:=private.lock_document_review_document_revision(r.document_id);revision:=private.lock_document_review_head(r.version_id);
    new.assignment_id:=private.lock_document_review_assignment(r.version_id,profile,actor);
    if new.expected_document_revision<>document_revision or new.expected_review_revision<>revision then
      raise exception 'Document review conflict' using errcode='40001'; end if;
    new.id:=gen_random_uuid();new.version_id:=r.version_id;new.document_id:=r.document_id;new.account_id:=r.account_id;
    new.reviewer_profile_id:=profile;new.reviewer_auth_user_id:=actor;new.decided_at:=clock_timestamp();new.is_demo:=true;
  else raise exception 'Document review history is immutable' using errcode='55000'; end if;
  return new;
end;
$$;

create function private.audit_document_review_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid; profile uuid; kind text; object_type text; event_name text; expected_revision bigint; metadata jsonb;
begin
  if tg_table_schema<>'private' or tg_when<>'AFTER' or tg_level<>'ROW' then raise exception 'Unsupported review audit context' using errcode='55000'; end if;
  if tg_table_name='document_review_assignments' and tg_op in ('INSERT','UPDATE') then
    perform private.private_object_service_context();kind:='system';object_type:='document_review_assignment';
    event_name:=case when tg_op='INSERT' then 'document_review_assignment_created' else 'document_review_assignment_revoked' end;
    expected_revision:=case when tg_op='INSERT' then new.requested_review_revision else new.revoked_from_revision end;
    metadata:=jsonb_build_object('recipient_profile_id',new.user_profile_id,'qualification_basis',new.qualification_basis,
      'intent_document_revision',new.requested_document_revision);
  elsif tg_table_name='document_review_requests' and tg_op='INSERT' then
    actor:=private.private_object_authenticated_subject();profile:=new.requester_profile_id;kind:='user';
    if actor<>new.requester_auth_user_id then raise exception 'Invalid review actor' using errcode='28000'; end if;
    object_type:='document_review_request';event_name:='document_review_requested';expected_revision:=new.expected_review_revision;
    metadata:=jsonb_build_object('document_revision',new.expected_document_revision,'state','under_review');
  elsif tg_table_name='document_review_decisions' and tg_op='INSERT' then
    actor:=private.private_object_authenticated_subject();profile:=new.reviewer_profile_id;kind:='user';
    if actor<>new.reviewer_auth_user_id then raise exception 'Invalid review actor' using errcode='28000'; end if;
    object_type:='document_review_decision';event_name:='document_review_decided';expected_revision:=new.expected_review_revision;
    metadata:=jsonb_build_object('document_revision',new.expected_document_revision,'review_request_id',new.review_request_id,
      'assignment_id',new.assignment_id,'decision',new.decision,'attestation_code',new.attestation_code);
  else raise exception 'Unsupported review audit relation' using errcode='55000'; end if;
  update private.document_review_heads set review_revision=review_revision+1 where version_id=new.version_id and review_revision=expected_revision;
  if not found then raise exception 'Document review conflict' using errcode='40001'; end if;
  insert into public.audit_events(account_id,actor_user_profile_id,actor_kind,actor_auth_user_id,actor_system_key,
    object_type,object_id,event_type,event_metadata,occurred_at,correlation_id,is_internal_only,is_demo)
  values(new.account_id,profile,kind,actor,case when kind='system' then 'database_privileged_operation' else null end,
    object_type,new.id,event_name,metadata||jsonb_build_object('document_id',new.document_id,'version_id',new.version_id,
      'verified_sha256',new.verified_sha256,'review_revision',expected_revision+1,'previous_review_revision',expected_revision,
      'request_id',new.request_id,'component_version','document-review-v1','operation_source',tg_table_name,
      'database_session_user',session_user::text,'database_request_role',current_setting('role',true)),
    clock_timestamp(),gen_random_uuid(),true,true);
  return null;
end;
$$;
create trigger document_review_heads_guard before insert or update or delete on private.document_review_heads for each row execute function private.guard_document_review_history();
create trigger document_review_heads_no_truncate before truncate on private.document_review_heads for each statement execute function private.guard_document_review_history();
create trigger document_review_assignments_guard before insert or update or delete on private.document_review_assignments for each row execute function private.guard_document_review_history();
create trigger document_review_assignments_no_truncate before truncate on private.document_review_assignments for each statement execute function private.guard_document_review_history();
create trigger document_review_assignments_audit after insert or update on private.document_review_assignments for each row execute function private.audit_document_review_change();
create trigger document_review_requests_guard before insert or update or delete on private.document_review_requests for each row execute function private.guard_document_review_history();
create trigger document_review_requests_no_truncate before truncate on private.document_review_requests for each statement execute function private.guard_document_review_history();
create trigger document_review_requests_audit after insert on private.document_review_requests for each row execute function private.audit_document_review_change();
create trigger document_review_decisions_guard before insert or update or delete on private.document_review_decisions for each row execute function private.guard_document_review_history();
create trigger document_review_decisions_no_truncate before truncate on private.document_review_decisions for each statement execute function private.guard_document_review_history();
create trigger document_review_decisions_audit after insert on private.document_review_decisions for each row execute function private.audit_document_review_change();

create function private.document_review_request_receipt(r private.document_review_requests)
returns jsonb language sql immutable security invoker set search_path='' as $$
  select jsonb_build_object('review_request_id',r.id,'version_id',r.version_id,'document_id',r.document_id,'verified_sha256',r.verified_sha256,
    'document_revision',r.expected_document_revision,'review_revision',r.expected_review_revision+1,'requested_at',r.requested_at,'state','under_review')
$$;
create function private.document_review_decision_receipt(d private.document_review_decisions)
returns jsonb language sql immutable security invoker set search_path='' as $$
  select jsonb_build_object('decision_id',d.id,'review_request_id',d.review_request_id,'assignment_id',d.assignment_id,
    'version_id',d.version_id,'document_id',d.document_id,'verified_sha256',d.verified_sha256,
    'document_revision',d.expected_document_revision,'review_revision',d.expected_review_revision+1,
    'decision',d.decision,'attestation_code',d.attestation_code,'decided_at',d.decided_at)
$$;

create function private.provision_document_review_assignment(p_version_id uuid,p_expected_sha256 text,p_profile_id uuid,
  p_request_id uuid,p_expected_document_revision bigint,p_expected_review_revision bigint,p_qualification_basis text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; v private.document_versions%rowtype; g private.document_review_assignments%rowtype; revision bigint; document_revision bigint;
begin
  perform private.private_object_service_context();
  if p_request_id is null or p_expected_document_revision is null or p_expected_document_revision<0
    or p_expected_review_revision is null or p_expected_review_revision<0 or p_qualification_basis is distinct from 'synthetic_fixture' then
    raise exception 'Invalid review assignment' using errcode='22023'; end if;
  actor:=private.lock_document_review_recipient(p_version_id,p_expected_sha256,p_profile_id);
  select * into strict v from private.document_versions where id=p_version_id;
  document_revision:=private.lock_document_review_document_revision(v.document_id);revision:=private.lock_document_review_head(v.id);
  select * into g from private.document_review_assignments where version_id=v.id and request_id=p_request_id;
  if found then
    if (g.verified_sha256,g.user_profile_id,g.requested_document_revision,g.requested_review_revision,g.qualification_basis)
      is distinct from (p_expected_sha256,p_profile_id,p_expected_document_revision,p_expected_review_revision,p_qualification_basis) then
      raise exception 'Review assignment request conflict' using errcode='23505'; end if;
    if g.assigned_auth_user_id<>actor then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
    return jsonb_build_object('assignment_id',g.id,'version_id',v.id,'review_revision',revision,'revoked',g.revoked_at is not null,'qualification_basis',g.qualification_basis);
  end if;
  if p_expected_document_revision<>document_revision or p_expected_review_revision<>revision then raise exception 'Document review conflict' using errcode='40001'; end if;
  insert into private.document_review_assignments(version_id,verified_sha256,user_profile_id,request_id,requested_document_revision,requested_review_revision,qualification_basis)
    values(v.id,p_expected_sha256,p_profile_id,p_request_id,p_expected_document_revision,p_expected_review_revision,p_qualification_basis) returning * into g;
  return jsonb_build_object('assignment_id',g.id,'version_id',v.id,'review_revision',revision+1,'revoked',false,'qualification_basis',g.qualification_basis);
end;
$$;

create function private.revoke_document_review_assignment(p_version_id uuid,p_assignment_id uuid,p_expected_review_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g private.document_review_assignments%rowtype; revision bigint;
begin
  perform private.private_object_service_context();
  if p_version_id is null or p_assignment_id is null or p_expected_review_revision is null or p_expected_review_revision<0 then
    raise exception 'Invalid review retirement' using errcode='22023'; end if;
  select * into g from private.document_review_assignments where id=p_assignment_id and version_id=p_version_id;
  if not found then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
  revision:=private.lock_document_review_head(p_version_id);
  select * into strict g from private.document_review_assignments where id=p_assignment_id for update;
  if g.revoked_at is not null and g.revoked_from_revision=p_expected_review_revision then
    return jsonb_build_object('assignment_id',g.id,'version_id',p_version_id,'review_revision',revision,'revoked',true,'qualification_basis',g.qualification_basis); end if;
  if p_expected_review_revision<>revision then raise exception 'Document review conflict' using errcode='40001'; end if;
  if g.revoked_at is not null then raise exception 'Review assignment already revoked' using errcode='55000'; end if;
  update private.document_review_assignments set revoked_at=clock_timestamp(),revoked_from_revision=p_expected_review_revision where id=g.id;
  return jsonb_build_object('assignment_id',g.id,'version_id',p_version_id,'review_revision',revision+1,'revoked',true,'qualification_basis',g.qualification_basis);
end;
$$;

create function private.request_document_version_review(p_version_id uuid,p_expected_sha256 text,
  p_expected_document_revision bigint,p_expected_review_revision bigint,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.private_object_authenticated_subject(); profile uuid; v private.document_versions%rowtype;
  r private.document_review_requests%rowtype; revision bigint; document_revision bigint;
begin
  profile:=private.lock_document_review_human(p_version_id,p_expected_sha256,'request');
  if p_request_id is null or p_expected_document_revision is null or p_expected_document_revision<0
    or p_expected_review_revision is null or p_expected_review_revision<0 then raise exception 'Invalid review request' using errcode='22023'; end if;
  select * into strict v from private.document_versions where id=p_version_id;
  document_revision:=private.lock_document_review_document_revision(v.document_id);revision:=private.lock_document_review_head(v.id);
  select * into r from private.document_review_requests where requester_auth_user_id=actor and request_id=p_request_id;
  if found then
    if (r.version_id,r.verified_sha256,r.expected_document_revision,r.expected_review_revision) is distinct from
      (p_version_id,p_expected_sha256,p_expected_document_revision,p_expected_review_revision) then raise exception 'Review request conflict' using errcode='23505'; end if;
    if r.requester_profile_id<>profile then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
    return private.document_review_request_receipt(r);
  end if;
  if p_expected_document_revision<>document_revision or p_expected_review_revision<>revision then raise exception 'Document review conflict' using errcode='40001'; end if;
  if exists(select 1 from private.document_review_requests where version_id=v.id) then raise exception 'Version review already requested' using errcode='55000'; end if;
  insert into private.document_review_requests(version_id,verified_sha256,request_id,expected_document_revision,expected_review_revision)
    values(v.id,p_expected_sha256,p_request_id,p_expected_document_revision,p_expected_review_revision) returning * into r;
  return private.document_review_request_receipt(r);
end;
$$;

create function private.decide_document_version_review(p_review_request_id uuid,p_expected_sha256 text,
  p_expected_document_revision bigint,p_expected_review_revision bigint,p_request_id uuid,p_decision text,p_attestation_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.private_object_authenticated_subject(); profile uuid; assignment uuid;
  r private.document_review_requests%rowtype; d private.document_review_decisions%rowtype; revision bigint; document_revision bigint;
begin
  select * into r from private.document_review_requests where id=p_review_request_id;
  if not found then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
  profile:=private.lock_document_review_human(r.version_id,p_expected_sha256,'decide');
  if p_request_id is null or p_expected_document_revision is null or p_expected_document_revision<0
    or p_expected_review_revision is null or p_expected_review_revision<0 or p_decision is null
    or p_decision not in ('approved_internal','changes_requested','rejected')
    or p_attestation_code is distinct from 'reviewed_exact_synthetic_version' then raise exception 'Invalid review decision' using errcode='22023'; end if;
  document_revision:=private.lock_document_review_document_revision(r.document_id);revision:=private.lock_document_review_head(r.version_id);
  assignment:=private.lock_document_review_assignment(r.version_id,profile,actor);
  select * into d from private.document_review_decisions where reviewer_auth_user_id=actor and request_id=p_request_id;
  if found then
    if (d.review_request_id,d.verified_sha256,d.expected_document_revision,d.expected_review_revision,d.decision,d.attestation_code) is distinct from
      (p_review_request_id,p_expected_sha256,p_expected_document_revision,p_expected_review_revision,p_decision,p_attestation_code) then
      raise exception 'Review decision request conflict' using errcode='23505'; end if;
    if d.reviewer_profile_id<>profile or d.assignment_id<>assignment then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
    return private.document_review_decision_receipt(d);
  end if;
  if p_expected_document_revision<>document_revision or p_expected_review_revision<>revision then raise exception 'Document review conflict' using errcode='40001'; end if;
  if exists(select 1 from private.document_review_decisions where review_request_id=r.id) then raise exception 'Version review already decided' using errcode='55000'; end if;
  insert into private.document_review_decisions(review_request_id,verified_sha256,request_id,expected_document_revision,expected_review_revision,decision,attestation_code)
    values(r.id,p_expected_sha256,p_request_id,p_expected_document_revision,p_expected_review_revision,p_decision,p_attestation_code) returning * into d;
  return private.document_review_decision_receipt(d);
end;
$$;

create function private.document_version_review_status(p_version_id uuid,p_expected_sha256 text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.private_object_authenticated_subject(); profile uuid; v private.document_versions%rowtype;
  r private.document_review_requests%rowtype; d private.document_review_decisions%rowtype;
  revision bigint; document_revision bigint; has_create boolean:=false; may_decide boolean:=false;
begin
  profile:=private.lock_document_review_human(p_version_id,p_expected_sha256,'view');
  select * into strict v from private.document_versions where id=p_version_id;
  -- Match the same separately granted create predicate used by the request
  -- helper without upgrading a read's logical-document SHARE lock to UPDATE.
  perform 1 from private.document_version_grants where document_id=v.document_id and account_id=v.account_id and facility_id=v.facility_id
    and user_profile_id=profile and capability_key='create_version' and revoked_at is null and is_demo for share;
  has_create:=found;
  begin
    may_decide:=private.lock_document_content_access(v.id,v.verified_sha256)=profile;
  exception when insufficient_privilege then may_decide:=false; end;
  document_revision:=private.lock_document_review_document_revision(v.document_id);
  select review_revision into revision from private.document_review_heads where version_id=v.id for share;
  revision:=coalesce(revision,0);
  -- Head before assignment, also for reads, matches retirement's UPDATE order.
  -- Taking an assignment SHARE before the head could deadlock with retirement.
  if may_decide then
    begin perform private.lock_document_review_assignment(v.id,profile,actor);
    exception when insufficient_privilege then may_decide:=false; end;
  end if;
  select * into r from private.document_review_requests where version_id=v.id;
  select * into d from private.document_review_decisions where version_id=v.id;
  return jsonb_build_object('version_id',v.id,'document_id',v.document_id,'verified_sha256',v.verified_sha256,
    'document_revision',document_revision,'review_revision',revision,
    'historical_review_state',case when d.id is not null then d.decision when r.id is not null then 'under_review' else 'internal_draft' end,
    'request',case when r.id is null then null else jsonb_build_object('review_request_id',r.id,'requested_at',r.requested_at) end,
    'decision',case when d.id is null then null else jsonb_build_object('decision_id',d.id,'decision',d.decision,'decided_at',d.decided_at) end,
    'can_request',has_create and r.id is null,'can_decide',may_decide and r.id is not null and d.id is null,'release_authorized',false);
end;
$$;

create function public.provision_document_review_assignment(p_version_id uuid,p_expected_sha256 text,p_profile_id uuid,p_request_id uuid,p_expected_document_revision bigint,p_expected_review_revision bigint,p_qualification_basis text)
returns jsonb language sql security invoker set search_path='' as $$ select private.provision_document_review_assignment(p_version_id,p_expected_sha256,p_profile_id,p_request_id,p_expected_document_revision,p_expected_review_revision,p_qualification_basis) $$;
create function public.revoke_document_review_assignment(p_version_id uuid,p_assignment_id uuid,p_expected_review_revision bigint)
returns jsonb language sql security invoker set search_path='' as $$ select private.revoke_document_review_assignment(p_version_id,p_assignment_id,p_expected_review_revision) $$;
create function public.request_document_version_review(p_version_id uuid,p_expected_sha256 text,p_expected_document_revision bigint,p_expected_review_revision bigint,p_request_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.request_document_version_review(p_version_id,p_expected_sha256,p_expected_document_revision,p_expected_review_revision,p_request_id) $$;
create function public.decide_document_version_review(p_review_request_id uuid,p_expected_sha256 text,p_expected_document_revision bigint,p_expected_review_revision bigint,p_request_id uuid,p_decision text,p_attestation_code text)
returns jsonb language sql security invoker set search_path='' as $$ select private.decide_document_version_review(p_review_request_id,p_expected_sha256,p_expected_document_revision,p_expected_review_revision,p_request_id,p_decision,p_attestation_code) $$;
create function public.document_version_review_status(p_version_id uuid,p_expected_sha256 text)
returns jsonb language sql security invoker set search_path='' as $$ select private.document_version_review_status(p_version_id,p_expected_sha256) $$;

revoke all on function private.lock_document_review_safety(private.document_versions),private.lock_document_review_human(uuid,text,text),
  private.lock_document_review_recipient(uuid,text,uuid),private.lock_document_review_document_revision(uuid),private.lock_document_review_head(uuid),
  private.lock_document_review_assignment(uuid,uuid,uuid),private.guard_document_review_history(),private.audit_document_review_change(),
  private.document_review_request_receipt(private.document_review_requests),private.document_review_decision_receipt(private.document_review_decisions),
  private.provision_document_review_assignment(uuid,text,uuid,uuid,bigint,bigint,text),private.revoke_document_review_assignment(uuid,uuid,bigint),
  private.request_document_version_review(uuid,text,bigint,bigint,uuid),private.decide_document_version_review(uuid,text,bigint,bigint,uuid,text,text),
  private.document_version_review_status(uuid,text),
  public.provision_document_review_assignment(uuid,text,uuid,uuid,bigint,bigint,text),public.revoke_document_review_assignment(uuid,uuid,bigint),
  public.request_document_version_review(uuid,text,bigint,bigint,uuid),public.decide_document_version_review(uuid,text,bigint,bigint,uuid,text,text),
  public.document_version_review_status(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.provision_document_review_assignment(uuid,text,uuid,uuid,bigint,bigint,text),private.revoke_document_review_assignment(uuid,uuid,bigint),
  public.provision_document_review_assignment(uuid,text,uuid,uuid,bigint,bigint,text),public.revoke_document_review_assignment(uuid,uuid,bigint) to service_role;
grant execute on function private.request_document_version_review(uuid,text,bigint,bigint,uuid),private.decide_document_version_review(uuid,text,bigint,bigint,uuid,text,text),
  private.document_version_review_status(uuid,text),public.request_document_version_review(uuid,text,bigint,bigint,uuid),
  public.decide_document_version_review(uuid,text,bigint,bigint,uuid,text,text),public.document_version_review_status(uuid,text) to authenticated;

commit;
