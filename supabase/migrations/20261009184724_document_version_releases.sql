begin;

-- DOC-001D: synthetic metadata release only. No existing version, logical
-- lifecycle, byte authorization, owner grant or live policy is changed.
create table private.document_release_heads (
  document_id uuid primary key references public.documents(id),
  release_revision bigint not null default 0 check(release_revision>=0),
  current_release_id uuid
);
create table private.document_release_grants (
  id uuid primary key,
  version_id uuid not null,
  document_id uuid not null,
  account_id uuid not null,
  verified_sha256 text not null check(verified_sha256 ~ '^[0-9a-f]{64}$'),
  user_profile_id uuid not null,
  assigned_auth_user_id uuid not null,
  grant_kind text not null check(grant_kind in ('release_controller','current_recipient','historical_recipient')),
  authority_basis text not null check(authority_basis='synthetic_fixture'),
  request_id uuid not null,
  expected_document_revision bigint not null check(expected_document_revision>=0),
  expected_release_revision bigint not null check(expected_release_revision>=0),
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
create unique index document_release_grants_active_unique on private.document_release_grants(version_id,user_profile_id,grant_kind) where revoked_at is null;
create index document_release_grants_scope_idx on private.document_release_grants(version_id,document_id,account_id,verified_sha256);
create index document_release_grants_recipient_idx on private.document_release_grants(account_id,user_profile_id);
create table private.document_releases (
  id uuid primary key,
  version_id uuid not null unique,
  document_id uuid not null,
  account_id uuid not null,
  verified_sha256 text not null check(verified_sha256 ~ '^[0-9a-f]{64}$'),
  review_decision_id uuid not null references private.document_review_decisions(id),
  controller_grant_id uuid not null,
  controller_profile_id uuid not null,
  controller_auth_user_id uuid not null,
  recipient_grant_ids uuid[] not null check(cardinality(recipient_grant_ids) between 1 and 32),
  previous_release_id uuid,
  release_class text not null check(release_class='routine_synthetic_document'),
  attestation_code text not null check(attestation_code='released_exact_synthetic_version'),
  request_id uuid not null,
  expected_document_revision bigint not null check(expected_document_revision>=0),
  expected_review_revision bigint not null check(expected_review_revision>=0),
  expected_release_revision bigint not null check(expected_release_revision>=0),
  released_at timestamptz not null,
  is_demo boolean not null default true check(is_demo),
  unique(controller_auth_user_id,request_id),
  unique(id,document_id),
  foreign key(version_id,document_id,account_id,verified_sha256) references private.document_versions(id,document_id,account_id,verified_sha256),
  foreign key(controller_grant_id,version_id,verified_sha256,controller_profile_id,controller_auth_user_id)
    references private.document_release_grants(id,version_id,verified_sha256,user_profile_id,assigned_auth_user_id),
  foreign key(account_id,controller_profile_id) references public.account_access(account_id,user_profile_id),
  foreign key(previous_release_id,document_id) references private.document_releases(id,document_id)
);
alter table private.document_release_heads add foreign key(current_release_id,document_id) references private.document_releases(id,document_id);
create index document_releases_scope_idx on private.document_releases(version_id,document_id,account_id,verified_sha256);
create index document_releases_document_idx on private.document_releases(document_id);
create index document_releases_review_idx on private.document_releases(review_decision_id);
create index document_releases_controller_idx on private.document_releases(controller_grant_id,version_id,verified_sha256,controller_profile_id,controller_auth_user_id);
create index document_releases_actor_idx on private.document_releases(account_id,controller_profile_id);
create index document_releases_previous_idx on private.document_releases(previous_release_id,document_id);
create table private.document_release_withdrawals (
  id uuid primary key,
  release_id uuid not null unique,
  document_id uuid not null,
  account_id uuid not null,
  version_id uuid not null,
  verified_sha256 text not null,
  actor_kind text not null check(actor_kind in ('user','system')),
  actor_profile_id uuid,
  actor_auth_user_id uuid,
  controller_grant_id uuid references private.document_release_grants(id),
  request_id uuid not null,
  expected_release_revision bigint not null check(expected_release_revision>=0),
  reason_code text not null check(reason_code in ('release_error','audience_change','security_concern')),
  withdrawn_at timestamptz not null,
  is_demo boolean not null default true check(is_demo),
  unique nulls not distinct(actor_auth_user_id,request_id),
  foreign key(release_id,document_id) references private.document_releases(id,document_id),
  foreign key(version_id,document_id,account_id,verified_sha256) references private.document_versions(id,document_id,account_id,verified_sha256),
  foreign key(account_id,actor_profile_id) references public.account_access(account_id,user_profile_id),
  check((actor_kind='user' and actor_profile_id is not null and actor_auth_user_id is not null and controller_grant_id is not null)
    or (actor_kind='system' and actor_profile_id is null and actor_auth_user_id is null and controller_grant_id is null))
);
create index document_release_withdrawals_actor_idx on private.document_release_withdrawals(account_id,actor_profile_id);
create index document_release_withdrawals_controller_idx on private.document_release_withdrawals(controller_grant_id);
create index document_release_withdrawals_scope_idx on private.document_release_withdrawals(version_id,document_id,account_id,verified_sha256);
alter table private.document_release_heads enable row level security;
alter table private.document_release_grants enable row level security;
alter table private.document_releases enable row level security;
alter table private.document_release_withdrawals enable row level security;
revoke all on private.document_release_heads,private.document_release_grants,private.document_releases,private.document_release_withdrawals from public,anon,authenticated,service_role;

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
      or (account_id is not null and is_demo and actor_kind='system' and object_type='document_release_grant' and event_type in ('document_release_grant_created','document_release_grant_revoked'))
      or (account_id is not null and is_demo and actor_kind='user' and object_type='document_release' and event_type in ('document_released','document_superseded'))
      or (account_id is not null and is_demo and object_type='document_release_withdrawal' and event_type='document_withdrawn')
    ))
  );

-- Lock order: existing config/identity/document/content/safety -> document
-- revision -> review head (read) -> release head -> exact release grants.
-- No provider I/O occurs under these locks.
create function private.lock_document_release_head(p_document_id uuid)
returns private.document_release_heads language plpgsql security invoker set search_path='' as $$
declare h private.document_release_heads%rowtype;
begin
  insert into private.document_release_heads(document_id) values(p_document_id) on conflict(document_id) do nothing;
  select * into strict h from private.document_release_heads where document_id=p_document_id for update;
  return h;
end;
$$;
create function private.lock_document_release_scope(v private.document_versions,p_profile_id uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare access record; actor uuid;
begin
  perform private.lock_document_content_config();perform private.lock_private_object_security_config();
  select * into access from private.lock_private_object_security_profile(p_profile_id,v.account_id,v.facility_id);
  if not access.directory_allowed then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
  perform 1 from public.documents where id=v.document_id and account_id=v.account_id and facility_id=v.facility_id
    and is_demo and document_class='routine_synthetic_document' for share;
  if not found then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
  select auth_user_id into strict actor from public.user_profiles where id=p_profile_id;
  return actor;
end;
$$;
create function private.lock_document_release_grantee(p_version_id uuid,p_expected_sha256 text,p_profile_id uuid,p_grant_kind text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v private.document_versions%rowtype; actor uuid;
begin
  perform private.private_object_service_context();
  if p_grant_kind is null or p_grant_kind not in ('release_controller','current_recipient','historical_recipient') then
    raise exception 'Invalid release grant kind' using errcode='22023'; end if;
  select * into v from private.document_versions where id=p_version_id and is_demo and lifecycle_state='internal_draft';
  if not found then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
  if p_grant_kind='release_controller' then actor:=private.lock_document_review_recipient(v.id,p_expected_sha256,p_profile_id); end if;
  actor:=private.lock_document_release_scope(v,p_profile_id);
  if p_expected_sha256 is null or p_expected_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'Invalid release digest' using errcode='22023'; end if;
  if v.verified_sha256<>p_expected_sha256 then raise exception 'Document release conflict' using errcode='40001'; end if;
  perform private.lock_document_review_safety(v);
  return actor;
end;
$$;
create function private.lock_document_release_controller(p_version_id uuid,p_profile_id uuid,p_auth_user_id uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid;
begin
  select id into result from private.document_release_grants where version_id=p_version_id and user_profile_id=p_profile_id
    and assigned_auth_user_id=p_auth_user_id and grant_kind='release_controller' and authority_basis='synthetic_fixture' and revoked_at is null and is_demo for share;
  if not found then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
  return result;
end;
$$;
create function private.normalize_document_release_audience(p_ids uuid[])
returns uuid[] language plpgsql immutable security invoker set search_path='' as $$
declare result uuid[];
begin
  if p_ids is null or array_ndims(p_ids) is distinct from 1 or cardinality(p_ids) not between 1 and 32
    or array_position(p_ids,null) is not null then raise exception 'Invalid release audience' using errcode='22023'; end if;
  select array_agg(distinct id order by id) into result from unnest(p_ids) id;
  if cardinality(result)<>cardinality(p_ids) then raise exception 'Invalid release audience' using errcode='22023'; end if;
  return result;
end;
$$;
create function private.lock_document_release_audience(v private.document_versions,p_ids uuid[])
returns void language plpgsql security invoker set search_path='' as $$
declare grant_id uuid; g private.document_release_grants%rowtype; actor uuid;
begin
  foreach grant_id in array private.normalize_document_release_audience(p_ids) loop
    select * into g from private.document_release_grants where id=grant_id and version_id=v.id and verified_sha256=v.verified_sha256
      and grant_kind='current_recipient' and revoked_at is null and authority_basis='synthetic_fixture' and is_demo for share;
    if not found then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
    actor:=private.lock_document_release_scope(v,g.user_profile_id);
    if actor<>g.assigned_auth_user_id then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
  end loop;
end;
$$;
create function private.lock_document_release_context(p_version_id uuid,p_expected_sha256 text)
returns table(profile_id uuid,controller_grant_id uuid,review_decision_id uuid,document_revision bigint,review_revision bigint,release_revision bigint,current_release_id uuid)
language plpgsql security invoker set search_path='' as $$
declare actor uuid:=private.private_object_authenticated_subject(); v private.document_versions%rowtype; h private.document_release_heads%rowtype;
begin
  -- The review helper's 'decide' mode checks current exact content only; the
  -- independent professional assignment is deliberately not inherited.
  profile_id:=private.lock_document_review_human(p_version_id,p_expected_sha256,'decide');
  select * into strict v from private.document_versions where id=p_version_id;
  perform private.lock_document_release_scope(v,profile_id);
  document_revision:=private.lock_document_review_document_revision(v.document_id);
  select rh.review_revision into review_revision from private.document_review_heads rh where rh.version_id=v.id for share;
  review_revision:=coalesce(review_revision,0);
  h:=private.lock_document_release_head(v.document_id);release_revision:=h.release_revision;current_release_id:=h.current_release_id;
  controller_grant_id:=private.lock_document_release_controller(v.id,profile_id,actor);
  select d.id into review_decision_id from private.document_review_decisions d where d.version_id=v.id and d.document_id=v.document_id
    and d.verified_sha256=v.verified_sha256 and d.decision='approved_internal' and d.is_demo;
  if not found then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
  return next;
end;
$$;
create function private.document_release_receipt(r private.document_releases)
returns jsonb language sql immutable security invoker set search_path='' as $$
  select jsonb_build_object('release_id',r.id,'version_id',r.version_id,'document_id',r.document_id,'verified_sha256',r.verified_sha256,
    'review_decision_id',r.review_decision_id,'controller_grant_id',r.controller_grant_id,'recipient_grant_ids',r.recipient_grant_ids,
    'previous_release_id',r.previous_release_id,'release_class',r.release_class,'attestation_code',r.attestation_code,
    'document_revision',r.expected_document_revision,'review_revision',r.expected_review_revision,
    'release_revision',r.expected_release_revision+1,'released_at',r.released_at,'metadata_only',true)
$$;
create function private.document_withdrawal_receipt(w private.document_release_withdrawals)
returns jsonb language sql immutable security invoker set search_path='' as $$
  select jsonb_build_object('withdrawal_id',w.id,'release_id',w.release_id,'version_id',w.version_id,'document_id',w.document_id,
    'release_revision',w.expected_release_revision+1,'reason_code',w.reason_code,'withdrawn_at',w.withdrawn_at,'withdrawn',true)
$$;

create function private.guard_document_release_history()
returns trigger language plpgsql security definer set search_path='' as $$
declare v private.document_versions%rowtype; r private.document_releases%rowtype; h private.document_release_heads%rowtype;
  actor uuid; profile uuid; assignment uuid; context record; document_revision bigint;
begin
  if tg_table_schema<>'private' or tg_when<>'BEFORE' or tg_op in ('DELETE','TRUNCATE') then
    raise exception 'Document release history is immutable' using errcode='55000'; end if;
  if tg_table_name='document_release_heads' then
    if session_user='authenticator' and current_setting('role',true)='authenticated' then perform private.private_object_authenticated_subject();
    else perform private.private_object_service_context(); end if;
    if (tg_op='INSERT' and (new.release_revision<>0 or new.current_release_id is not null)) or (tg_op='UPDATE' and
      (pg_trigger_depth()<2 or new.document_id<>old.document_id or new.release_revision<>old.release_revision+1)) then
      raise exception 'Invalid release revision' using errcode='55000'; end if;
    return new;
  end if;
  if tg_table_name='document_release_grants' then
    perform private.private_object_service_context();
    if tg_op='UPDATE' then
      if (to_jsonb(new)-array['revoked_at','revoked_from_revision']) is distinct from (to_jsonb(old)-array['revoked_at','revoked_from_revision'])
        or old.revoked_at is not null or new.revoked_at is null or new.revoked_from_revision is null then
        raise exception 'Release grants cannot be edited or restored' using errcode='55000'; end if;
      h:=private.lock_document_release_head(new.document_id);
      if new.revoked_from_revision<>h.release_revision then raise exception 'Document release conflict' using errcode='40001'; end if;
      new.revoked_at:=clock_timestamp();return new;
    end if;
    if new.request_id is null or new.expected_document_revision is null or new.expected_document_revision<0
      or new.expected_release_revision is null or new.expected_release_revision<0 or new.authority_basis is distinct from 'synthetic_fixture' then
      raise exception 'Invalid release grant' using errcode='22023'; end if;
    actor:=private.lock_document_release_grantee(new.version_id,new.verified_sha256,new.user_profile_id,new.grant_kind);
    select * into strict v from private.document_versions where id=new.version_id;
    document_revision:=private.lock_document_review_document_revision(v.document_id);h:=private.lock_document_release_head(v.document_id);
    if new.expected_document_revision<>document_revision or new.expected_release_revision<>h.release_revision then
      raise exception 'Document release conflict' using errcode='40001'; end if;
    if new.revoked_at is not null or new.revoked_from_revision is not null then raise exception 'Invalid release grant' using errcode='23514'; end if;
    new.id:=gen_random_uuid();new.document_id:=v.document_id;new.account_id:=v.account_id;new.assigned_auth_user_id:=actor;
    new.created_at:=clock_timestamp();new.is_demo:=true;
  elsif tg_table_name='document_releases' and tg_op='INSERT' then
    actor:=private.private_object_authenticated_subject();
    select * into context from private.lock_document_release_context(new.version_id,new.verified_sha256);
    if new.request_id is null or new.expected_document_revision is null or new.expected_document_revision<0
      or new.expected_review_revision is null or new.expected_review_revision<0 or new.expected_release_revision is null or new.expected_release_revision<0
      or new.attestation_code is distinct from 'released_exact_synthetic_version' then raise exception 'Invalid document release' using errcode='22023'; end if;
    if (new.expected_document_revision,new.expected_review_revision,new.expected_release_revision) is distinct from
      (context.document_revision,context.review_revision,context.release_revision) then raise exception 'Document release conflict' using errcode='40001'; end if;
    select * into strict v from private.document_versions where id=new.version_id;
    new.recipient_grant_ids:=private.normalize_document_release_audience(new.recipient_grant_ids);
    perform private.lock_document_release_audience(v,new.recipient_grant_ids);
    -- No rollback to a previously released or older ordinal, even after withdrawal.
    if exists(select 1 from private.document_releases prior join private.document_versions pv on pv.id=prior.version_id
      where prior.document_id=v.document_id and pv.version_ordinal>=v.version_ordinal) then
      raise exception 'Version is not a new release' using errcode='55000'; end if;
    new.id:=gen_random_uuid();new.document_id:=v.document_id;new.account_id:=v.account_id;new.review_decision_id:=context.review_decision_id;
    new.controller_grant_id:=context.controller_grant_id;new.controller_profile_id:=context.profile_id;new.controller_auth_user_id:=actor;
    new.previous_release_id:=context.current_release_id;new.release_class:='routine_synthetic_document';new.released_at:=clock_timestamp();new.is_demo:=true;
  elsif tg_table_name='document_release_withdrawals' and tg_op='INSERT' then
    select * into r from private.document_releases where id=new.release_id;
    if not found then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
    if session_user='authenticator' and current_setting('role',true)='authenticated' then
      actor:=private.private_object_authenticated_subject();profile:=private.lock_document_version_actor(r.document_id,'view_versions');
    else perform private.private_object_service_context(); end if;
    h:=private.lock_document_release_head(r.document_id);
    if actor is not null then assignment:=private.lock_document_release_controller(r.version_id,profile,actor);end if;
    if new.request_id is null or new.expected_release_revision is null or new.expected_release_revision<0
      or new.reason_code is null or new.reason_code not in ('release_error','audience_change','security_concern') then
      raise exception 'Invalid withdrawal' using errcode='22023'; end if;
    if new.expected_release_revision<>h.release_revision then raise exception 'Document release conflict' using errcode='40001'; end if;
    new.id:=gen_random_uuid();new.document_id:=r.document_id;new.version_id:=r.version_id;new.account_id:=r.account_id;new.verified_sha256:=r.verified_sha256;
    new.actor_kind:=case when actor is null then 'system' else 'user' end;new.actor_profile_id:=profile;new.actor_auth_user_id:=actor;
    new.controller_grant_id:=assignment;new.withdrawn_at:=clock_timestamp();new.is_demo:=true;
  else raise exception 'Document release history is immutable' using errcode='55000'; end if;
  return new;
end;
$$;
create function private.audit_document_release_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid; profile uuid; kind text; object_type text; event_name text; revision bigint; metadata jsonb;
begin
  if tg_table_schema<>'private' or tg_when<>'AFTER' or tg_level<>'ROW' then raise exception 'Unsupported release audit context' using errcode='55000'; end if;
  if tg_table_name='document_release_grants' and tg_op in ('INSERT','UPDATE') then
    perform private.private_object_service_context();kind:='system';object_type:='document_release_grant';
    event_name:=case when tg_op='INSERT' then 'document_release_grant_created' else 'document_release_grant_revoked' end;
    revision:=case when tg_op='INSERT' then new.expected_release_revision else new.revoked_from_revision end;
    metadata:=jsonb_build_object('recipient_profile_id',new.user_profile_id,'grant_kind',new.grant_kind,'authority_basis',new.authority_basis);
  elsif tg_table_name='document_releases' and tg_op='INSERT' then
    actor:=private.private_object_authenticated_subject();profile:=new.controller_profile_id;kind:='user';object_type:='document_release';event_name:='document_released';
    if actor<>new.controller_auth_user_id then raise exception 'Invalid release actor' using errcode='28000'; end if;
    revision:=new.expected_release_revision;
    metadata:=jsonb_build_object('review_decision_id',new.review_decision_id,'controller_grant_id',new.controller_grant_id,
      'recipient_grant_ids',new.recipient_grant_ids,'previous_release_id',new.previous_release_id,'attestation_code',new.attestation_code,
      'document_revision',new.expected_document_revision,'review_revision',new.expected_review_revision);
  elsif tg_table_name='document_release_withdrawals' and tg_op='INSERT' then
    kind:=new.actor_kind;profile:=new.actor_profile_id;actor:=new.actor_auth_user_id;object_type:='document_release_withdrawal';event_name:='document_withdrawn';
    if kind='user' then
      if actor is distinct from private.private_object_authenticated_subject() then raise exception 'Invalid withdrawal actor' using errcode='28000'; end if;
    else perform private.private_object_service_context(); end if;
    revision:=new.expected_release_revision;
    metadata:=jsonb_build_object('release_id',new.release_id,'reason_code',new.reason_code,'controller_grant_id',new.controller_grant_id);
  else raise exception 'Unsupported release audit relation' using errcode='55000'; end if;
  if tg_table_name='document_releases' then
    update private.document_release_heads set release_revision=release_revision+1,current_release_id=new.id
      where document_id=new.document_id and release_revision=revision;
  elsif tg_table_name='document_release_withdrawals' then
    update private.document_release_heads set release_revision=release_revision+1,
      current_release_id=case when current_release_id=new.release_id then null else current_release_id end
      where document_id=new.document_id and release_revision=revision;
  else
    update private.document_release_heads set release_revision=release_revision+1 where document_id=new.document_id and release_revision=revision;
  end if;
  if not found then raise exception 'Document release conflict' using errcode='40001'; end if;
  metadata:=metadata||jsonb_build_object('document_id',new.document_id,'version_id',new.version_id,'verified_sha256',new.verified_sha256,
    'release_revision',revision+1,'previous_release_revision',revision,'request_id',new.request_id,'component_version','document-release-v1',
    'operation_source',tg_table_name,'database_session_user',session_user::text,'database_request_role',current_setting('role',true),'metadata_only',true);
  insert into public.audit_events(account_id,actor_user_profile_id,actor_kind,actor_auth_user_id,actor_system_key,
    object_type,object_id,event_type,event_metadata,occurred_at,correlation_id,is_internal_only,is_demo)
  values(new.account_id,profile,kind,actor,case when kind='system' then 'database_privileged_operation' else null end,
    object_type,new.id,event_name,metadata,clock_timestamp(),gen_random_uuid(),true,true);
  if tg_table_name='document_releases' then
    if new.previous_release_id is not null then
      insert into public.audit_events(account_id,actor_user_profile_id,actor_kind,actor_auth_user_id,object_type,object_id,event_type,event_metadata,occurred_at,correlation_id,is_internal_only,is_demo)
      values(new.account_id,profile,'user',actor,'document_release',new.previous_release_id,'document_superseded',
        jsonb_build_object('replacement_release_id',new.id,'document_id',new.document_id,'release_revision',revision+1,'component_version','document-release-v1','metadata_only',true),
        clock_timestamp(),gen_random_uuid(),true,true);
    end if;
  end if;
  return null;
end;
$$;
create trigger document_release_heads_guard before insert or update or delete on private.document_release_heads for each row execute function private.guard_document_release_history();
create trigger document_release_heads_no_truncate before truncate on private.document_release_heads for each statement execute function private.guard_document_release_history();
create trigger document_release_grants_guard before insert or update or delete on private.document_release_grants for each row execute function private.guard_document_release_history();
create trigger document_release_grants_no_truncate before truncate on private.document_release_grants for each statement execute function private.guard_document_release_history();
create trigger document_release_grants_audit after insert or update on private.document_release_grants for each row execute function private.audit_document_release_change();
create trigger document_releases_guard before insert or update or delete on private.document_releases for each row execute function private.guard_document_release_history();
create trigger document_releases_no_truncate before truncate on private.document_releases for each statement execute function private.guard_document_release_history();
create trigger document_releases_audit after insert on private.document_releases for each row execute function private.audit_document_release_change();
create trigger document_release_withdrawals_guard before insert or update or delete on private.document_release_withdrawals for each row execute function private.guard_document_release_history();
create trigger document_release_withdrawals_no_truncate before truncate on private.document_release_withdrawals for each statement execute function private.guard_document_release_history();
create trigger document_release_withdrawals_audit after insert on private.document_release_withdrawals for each row execute function private.audit_document_release_change();

create function private.provision_document_release_grant(p_version_id uuid,p_expected_sha256 text,p_profile_id uuid,p_grant_kind text,
  p_request_id uuid,p_expected_document_revision bigint,p_expected_release_revision bigint,p_authority_basis text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; v private.document_versions%rowtype; g private.document_release_grants%rowtype; h private.document_release_heads%rowtype; document_revision bigint;
begin
  perform private.private_object_service_context();
  if p_request_id is null or p_expected_document_revision is null or p_expected_document_revision<0
    or p_expected_release_revision is null or p_expected_release_revision<0 or p_authority_basis is distinct from 'synthetic_fixture' then
    raise exception 'Invalid release grant' using errcode='22023'; end if;
  actor:=private.lock_document_release_grantee(p_version_id,p_expected_sha256,p_profile_id,p_grant_kind);
  select * into strict v from private.document_versions where id=p_version_id;
  document_revision:=private.lock_document_review_document_revision(v.document_id);h:=private.lock_document_release_head(v.document_id);
  select * into g from private.document_release_grants where version_id=v.id and request_id=p_request_id;
  if found then
    if (g.verified_sha256,g.user_profile_id,g.grant_kind,g.expected_document_revision,g.expected_release_revision,g.authority_basis)
      is distinct from (p_expected_sha256,p_profile_id,p_grant_kind,p_expected_document_revision,p_expected_release_revision,p_authority_basis) then
      raise exception 'Release grant request conflict' using errcode='23505'; end if;
    if g.assigned_auth_user_id<>actor then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
  else
    if p_expected_document_revision<>document_revision or p_expected_release_revision<>h.release_revision then raise exception 'Document release conflict' using errcode='40001'; end if;
    insert into private.document_release_grants(version_id,verified_sha256,user_profile_id,grant_kind,request_id,expected_document_revision,expected_release_revision,authority_basis)
      values(v.id,p_expected_sha256,p_profile_id,p_grant_kind,p_request_id,p_expected_document_revision,p_expected_release_revision,p_authority_basis) returning * into g;
    h.release_revision:=h.release_revision+1;
  end if;
  return jsonb_build_object('grant_id',g.id,'version_id',g.version_id,'grant_kind',g.grant_kind,'release_revision',h.release_revision,'revoked',g.revoked_at is not null,'authority_basis',g.authority_basis);
end;
$$;
create function private.revoke_document_release_grant(p_version_id uuid,p_grant_id uuid,p_expected_release_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g private.document_release_grants%rowtype; h private.document_release_heads%rowtype;
begin
  perform private.private_object_service_context();
  if p_version_id is null or p_grant_id is null or p_expected_release_revision is null or p_expected_release_revision<0 then
    raise exception 'Invalid release grant retirement' using errcode='22023'; end if;
  select * into g from private.document_release_grants where id=p_grant_id and version_id=p_version_id;
  if not found then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
  h:=private.lock_document_release_head(g.document_id);
  select * into strict g from private.document_release_grants where id=p_grant_id for update;
  if g.revoked_at is not null and g.revoked_from_revision=p_expected_release_revision then
    return jsonb_build_object('grant_id',g.id,'version_id',g.version_id,'grant_kind',g.grant_kind,'release_revision',h.release_revision,'revoked',true); end if;
  if p_expected_release_revision<>h.release_revision then raise exception 'Document release conflict' using errcode='40001'; end if;
  if g.revoked_at is not null then raise exception 'Release grant already revoked' using errcode='55000'; end if;
  update private.document_release_grants set revoked_at=clock_timestamp(),revoked_from_revision=p_expected_release_revision where id=g.id;
  return jsonb_build_object('grant_id',g.id,'version_id',g.version_id,'grant_kind',g.grant_kind,'release_revision',h.release_revision+1,'revoked',true);
end;
$$;
create function private.release_document_version(p_version_id uuid,p_expected_sha256 text,p_expected_document_revision bigint,p_expected_review_revision bigint,
  p_expected_release_revision bigint,p_recipient_grant_ids uuid[],p_request_id uuid,p_attestation_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.private_object_authenticated_subject(); context record; v private.document_versions%rowtype; r private.document_releases%rowtype; audience uuid[];
begin
  select * into context from private.lock_document_release_context(p_version_id,p_expected_sha256);
  if p_request_id is null or p_expected_document_revision is null or p_expected_document_revision<0
    or p_expected_review_revision is null or p_expected_review_revision<0 or p_expected_release_revision is null or p_expected_release_revision<0
    or p_attestation_code is distinct from 'released_exact_synthetic_version' then raise exception 'Invalid document release' using errcode='22023'; end if;
  audience:=private.normalize_document_release_audience(p_recipient_grant_ids);
  select * into strict v from private.document_versions where id=p_version_id;
  perform private.lock_document_release_audience(v,audience);
  select * into r from private.document_releases where controller_auth_user_id=actor and request_id=p_request_id;
  if found then
    if (r.version_id,r.verified_sha256,r.expected_document_revision,r.expected_review_revision,r.expected_release_revision,r.recipient_grant_ids,r.attestation_code)
      is distinct from (p_version_id,p_expected_sha256,p_expected_document_revision,p_expected_review_revision,p_expected_release_revision,audience,p_attestation_code) then
      raise exception 'Release request conflict' using errcode='23505'; end if;
    if r.controller_profile_id<>context.profile_id or r.controller_grant_id<>context.controller_grant_id then
      raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
    if exists(select 1 from private.document_release_withdrawals where release_id=r.id) then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
    return private.document_release_receipt(r);
  end if;
  if (p_expected_document_revision,p_expected_review_revision,p_expected_release_revision) is distinct from
    (context.document_revision,context.review_revision,context.release_revision) then raise exception 'Document release conflict' using errcode='40001'; end if;
  insert into private.document_releases(version_id,verified_sha256,recipient_grant_ids,request_id,expected_document_revision,expected_review_revision,expected_release_revision,attestation_code)
    values(v.id,p_expected_sha256,audience,p_request_id,p_expected_document_revision,p_expected_review_revision,p_expected_release_revision,p_attestation_code) returning * into r;
  return private.document_release_receipt(r);
end;
$$;
create function private.withdraw_document_release(p_release_id uuid,p_expected_release_revision bigint,p_request_id uuid,p_reason_code text,p_operator boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; profile uuid; assignment uuid; r private.document_releases%rowtype; w private.document_release_withdrawals%rowtype; h private.document_release_heads%rowtype;
begin
  if p_operator is true then perform private.private_object_service_context();
  else actor:=private.private_object_authenticated_subject(); end if;
  select * into r from private.document_releases where id=p_release_id;
  if not found then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
  if not p_operator then profile:=private.lock_document_version_actor(r.document_id,'view_versions'); end if;
  if p_request_id is null or p_expected_release_revision is null or p_expected_release_revision<0
    or p_reason_code is null or p_reason_code not in ('release_error','audience_change','security_concern') then raise exception 'Invalid withdrawal' using errcode='22023'; end if;
  h:=private.lock_document_release_head(r.document_id);
  if not p_operator then assignment:=private.lock_document_release_controller(r.version_id,profile,actor); end if;
  select * into w from private.document_release_withdrawals where actor_auth_user_id is not distinct from actor and request_id=p_request_id;
  if found then
    if (w.release_id,w.expected_release_revision,w.reason_code) is distinct from (p_release_id,p_expected_release_revision,p_reason_code) then
      raise exception 'Withdrawal request conflict' using errcode='23505'; end if;
    if (w.actor_profile_id,w.controller_grant_id) is distinct from (profile,assignment) then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
    return private.document_withdrawal_receipt(w);
  end if;
  if p_expected_release_revision<>h.release_revision then raise exception 'Document release conflict' using errcode='40001'; end if;
  if exists(select 1 from private.document_release_withdrawals where release_id=r.id) then raise exception 'Release already withdrawn' using errcode='55000'; end if;
  insert into private.document_release_withdrawals(release_id,expected_release_revision,request_id,reason_code)
    values(r.id,p_expected_release_revision,p_request_id,p_reason_code) returning * into w;
  return private.document_withdrawal_receipt(w);
end;
$$;

create function private.document_version_release_status(p_version_id uuid,p_expected_sha256 text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare profile uuid; actor uuid:=private.private_object_authenticated_subject(); v private.document_versions%rowtype; r private.document_releases%rowtype;
  h private.document_release_heads%rowtype; document_revision bigint; review_revision bigint; approved uuid; controller boolean:=false;
begin
  profile:=private.lock_document_review_human(p_version_id,p_expected_sha256,'view');
  select * into strict v from private.document_versions where id=p_version_id;
  begin
    perform private.lock_document_release_scope(v,profile);perform private.lock_document_content_access(v.id,v.verified_sha256);controller:=true;
  exception when insufficient_privilege then controller:=false; end;
  document_revision:=private.lock_document_review_document_revision(v.document_id);
  select rh.review_revision into review_revision from private.document_review_heads rh where rh.version_id=v.id for share;
  select * into h from private.document_release_heads where document_id=v.document_id for share;
  if controller then
    begin perform private.lock_document_release_controller(v.id,profile,actor);
    exception when insufficient_privilege then controller:=false; end;
  end if;
  select id into approved from private.document_review_decisions where version_id=v.id and verified_sha256=v.verified_sha256 and decision='approved_internal';
  select * into r from private.document_releases where version_id=v.id;
  return jsonb_build_object('version_id',v.id,'document_id',v.document_id,'verified_sha256',v.verified_sha256,
    'document_revision',document_revision,'review_revision',coalesce(review_revision,0),'release_revision',coalesce(h.release_revision,0),
    'release_id',r.id,'current_release_id',h.current_release_id,'approved_review_decision_id',approved,
    'release_state',case when r.id is null then 'unreleased' when exists(select 1 from private.document_release_withdrawals where release_id=r.id) then 'withdrawn'
      when r.id=h.current_release_id then 'current' else 'superseded' end,
    'controller_eligible',controller,'can_prepare_release',controller and approved is not null and r.id is null
      and not exists(select 1 from private.document_releases prior join private.document_versions pv on pv.id=prior.version_id
        where prior.document_id=v.document_id and pv.version_ordinal>=v.version_ordinal),
    'metadata_only',true,'released_download_available',false);
end;
$$;
-- Recipient reads intentionally do not require or grant internal draft access.
-- Only exact approved current grants or separate historical grants can match.
create function private.read_document_release(p_document_id uuid,p_version_id uuid,p_expected_sha256 text,p_historical boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.private_object_authenticated_subject(); profile uuid; v private.document_versions%rowtype; r private.document_releases%rowtype;
  h private.document_release_heads%rowtype; g private.document_release_grants%rowtype;
begin
  select id into profile from public.user_profiles where auth_user_id=actor and identity_status='active' and is_demo;
  if not found then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
  if p_historical then
    select * into v from private.document_versions where id=p_version_id and is_demo;
  else
    select rv.* into v from private.document_release_heads rh join private.document_releases rr on rr.id=rh.current_release_id
      join private.document_versions rv on rv.id=rr.version_id where rh.document_id=p_document_id;
  end if;
  if v.id is null then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
  perform private.lock_document_release_scope(v,profile);
  -- Lock current object safety before the release head, matching release writes.
  perform private.lock_document_review_safety(v);
  select * into h from private.document_release_heads where document_id=v.document_id for share;
  select * into r from private.document_releases where version_id=v.id;
  if r.id is null or exists(select 1 from private.document_release_withdrawals where release_id=r.id)
    or (p_historical and r.id is not distinct from h.current_release_id)
    or (not p_historical and r.id is distinct from h.current_release_id) then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
  select * into g from private.document_release_grants where version_id=v.id and verified_sha256=v.verified_sha256
    and user_profile_id=profile and assigned_auth_user_id=actor and revoked_at is null and is_demo and authority_basis='synthetic_fixture'
    and grant_kind=case when p_historical then 'historical_recipient' else 'current_recipient' end
    and (p_historical or id=any(r.recipient_grant_ids)) for share;
  if not found then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
  if p_historical then
    if p_expected_sha256 is null or p_expected_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'Invalid release digest' using errcode='22023'; end if;
    if p_expected_sha256<>v.verified_sha256 then raise exception 'Document release conflict' using errcode='40001'; end if;
  end if;
  return jsonb_build_object('release_id',r.id,'document_id',r.document_id,'version_id',r.version_id,'verified_sha256',r.verified_sha256,
    'version_ordinal',v.version_ordinal,'release_class',r.release_class,'released_at',r.released_at,'release_revision',h.release_revision,
    'visibility',case when p_historical then 'historical' else 'current' end,'metadata_only',true,'released_download_available',false);
end;
$$;

-- Audience discovery is limited to this version's explicitly provisioned
-- recipients; it never enumerates the account directory or supplies authority.
create function private.document_release_audience_options(p_version_id uuid,p_expected_sha256 text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.private_object_authenticated_subject(); profile uuid; v private.document_versions%rowtype;
  h private.document_release_heads%rowtype; g private.document_release_grants%rowtype; recipient_auth uuid; recipient_name text;
  options jsonb:='[]'::jsonb; eligible boolean; document_revision bigint; review_revision bigint;
begin
  profile:=private.lock_document_review_human(p_version_id,p_expected_sha256,'decide');
  select * into strict v from private.document_versions where id=p_version_id;
  perform private.lock_document_release_scope(v,profile);
  document_revision:=private.lock_document_review_document_revision(v.document_id);
  select rh.review_revision into review_revision from private.document_review_heads rh where rh.version_id=v.id for share;
  select * into h from private.document_release_heads where document_id=v.document_id for share;
  perform private.lock_document_release_controller(v.id,profile,actor);
  for g in select * from private.document_release_grants where version_id=v.id and verified_sha256=v.verified_sha256
    and grant_kind='current_recipient' and authority_basis='synthetic_fixture' and revoked_at is null and is_demo order by id for share
  loop
    eligible:=true;
    begin
      recipient_auth:=private.lock_document_release_scope(v,g.user_profile_id);
      eligible:=recipient_auth=g.assigned_auth_user_id;
    exception when insufficient_privilege then eligible:=false; end;
    if eligible then
      select display_name into strict recipient_name from public.user_profiles where id=g.user_profile_id;
      options:=options||jsonb_build_array(jsonb_build_object('grant_id',g.id,'recipient_profile_id',g.user_profile_id,'recipient_display_name',recipient_name));
    end if;
  end loop;
  return jsonb_build_object('version_id',v.id,'document_id',v.document_id,'verified_sha256',v.verified_sha256,
    'document_revision',document_revision,'review_revision',coalesce(review_revision,0),
    'release_revision',coalesce(h.release_revision,0),'recipients',options,'metadata_only',true);
end;
$$;
create function public.document_release_audience_options(p_version_id uuid,p_expected_sha256 text)
returns jsonb language sql security invoker set search_path='' as $$ select private.document_release_audience_options(p_version_id,p_expected_sha256) $$;

create function public.provision_document_release_grant(p_version_id uuid,p_expected_sha256 text,p_profile_id uuid,p_grant_kind text,p_request_id uuid,p_expected_document_revision bigint,p_expected_release_revision bigint,p_authority_basis text)
returns jsonb language sql security invoker set search_path='' as $$ select private.provision_document_release_grant(p_version_id,p_expected_sha256,p_profile_id,p_grant_kind,p_request_id,p_expected_document_revision,p_expected_release_revision,p_authority_basis) $$;

create function public.revoke_document_release_grant(p_version_id uuid,p_grant_id uuid,p_expected_release_revision bigint)
returns jsonb language sql security invoker set search_path='' as $$ select private.revoke_document_release_grant(p_version_id,p_grant_id,p_expected_release_revision) $$;

create function public.release_document_version(p_version_id uuid,p_expected_sha256 text,p_expected_document_revision bigint,p_expected_review_revision bigint,p_expected_release_revision bigint,p_recipient_grant_ids uuid[],p_request_id uuid,p_attestation_code text)
returns jsonb language sql security invoker set search_path='' as $$ select private.release_document_version(p_version_id,p_expected_sha256,p_expected_document_revision,p_expected_review_revision,p_expected_release_revision,p_recipient_grant_ids,p_request_id,p_attestation_code) $$;

create function public.withdraw_document_release(p_release_id uuid,p_expected_release_revision bigint,p_request_id uuid,p_reason_code text)
returns jsonb language sql security invoker set search_path='' as $$ select private.withdraw_document_release(p_release_id,p_expected_release_revision,p_request_id,p_reason_code,false) $$;

create function public.retire_document_release(p_release_id uuid,p_expected_release_revision bigint,p_request_id uuid,p_reason_code text)
returns jsonb language sql security invoker set search_path='' as $$ select private.withdraw_document_release(p_release_id,p_expected_release_revision,p_request_id,p_reason_code,true) $$;

create function public.document_version_release_status(p_version_id uuid,p_expected_sha256 text)
returns jsonb language sql security invoker set search_path='' as $$ select private.document_version_release_status(p_version_id,p_expected_sha256) $$;

create function public.current_document_release(p_document_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.read_document_release(p_document_id,null,null,false) $$;

create function public.historical_document_release(p_version_id uuid,p_expected_sha256 text)
returns jsonb language sql security invoker set search_path='' as $$ select private.read_document_release(null,p_version_id,p_expected_sha256,true) $$;

revoke all on function private.document_release_audience_options(uuid,text),public.document_release_audience_options(uuid,text),
  private.lock_document_release_head(uuid),
  private.lock_document_release_scope(private.document_versions,uuid),
  private.lock_document_release_grantee(uuid,text,uuid,text),
  private.lock_document_release_controller(uuid,uuid,uuid),
  private.normalize_document_release_audience(uuid[]),
  private.lock_document_release_audience(private.document_versions,uuid[]),
  private.lock_document_release_context(uuid,text),
  private.document_release_receipt(private.document_releases),
  private.document_withdrawal_receipt(private.document_release_withdrawals),
  private.guard_document_release_history(),
  private.audit_document_release_change(),
  private.provision_document_release_grant(uuid,text,uuid,text,uuid,bigint,bigint,text),
  private.revoke_document_release_grant(uuid,uuid,bigint),
  private.release_document_version(uuid,text,bigint,bigint,bigint,uuid[],uuid,text),
  private.withdraw_document_release(uuid,bigint,uuid,text,boolean),
  private.document_version_release_status(uuid,text),
  private.read_document_release(uuid,uuid,text,boolean),
  public.provision_document_release_grant(uuid,text,uuid,text,uuid,bigint,bigint,text),
  public.revoke_document_release_grant(uuid,uuid,bigint),
  public.release_document_version(uuid,text,bigint,bigint,bigint,uuid[],uuid,text),
  public.withdraw_document_release(uuid,bigint,uuid,text),
  public.retire_document_release(uuid,bigint,uuid,text),
  public.document_version_release_status(uuid,text),
  public.current_document_release(uuid),
  public.historical_document_release(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.provision_document_release_grant(uuid,text,uuid,text,uuid,bigint,bigint,text),
  private.provision_document_release_grant(uuid,text,uuid,text,uuid,bigint,bigint,text),
  public.revoke_document_release_grant(uuid,uuid,bigint),
  private.revoke_document_release_grant(uuid,uuid,bigint),
  public.retire_document_release(uuid,bigint,uuid,text),
  private.withdraw_document_release(uuid,bigint,uuid,text,boolean) to service_role;
grant execute on function private.document_release_audience_options(uuid,text),public.document_release_audience_options(uuid,text),
  public.release_document_version(uuid,text,bigint,bigint,bigint,uuid[],uuid,text),
  private.release_document_version(uuid,text,bigint,bigint,bigint,uuid[],uuid,text),
  public.withdraw_document_release(uuid,bigint,uuid,text),
  public.document_version_release_status(uuid,text),
  private.document_version_release_status(uuid,text),
  public.current_document_release(uuid),
  public.historical_document_release(uuid,text),
  private.withdraw_document_release(uuid,bigint,uuid,text,boolean),
  private.read_document_release(uuid,uuid,text,boolean) to authenticated;

commit;
