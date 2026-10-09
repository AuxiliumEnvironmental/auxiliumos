begin;

-- DOC-001D: independent exact-release synthetic content authorization.
-- No grants, metadata behavior, owner authority or provider I/O are changed.
create table private.document_release_content_authorizations (
  id uuid primary key,
  release_id uuid not null references private.document_releases(id),
  version_id uuid not null,
  document_id uuid not null,
  account_id uuid not null,
  object_id uuid not null,
  verified_sha256 text not null check(verified_sha256 ~ '^[0-9a-f]{64}$'),
  recipient_grant_id uuid not null references private.document_release_grants(id),
  visibility text not null check(visibility in ('current','historical')),
  byte_size integer not null check(byte_size between 1 and 65536),
  media_type text not null check(media_type='text/plain'),
  bucket_id text not null check(bucket_id='os-private-ingest'),
  object_key text not null,
  subject_profile_id uuid not null,
  subject_auth_user_id uuid not null,
  request_id uuid not null,
  authorized_at timestamptz not null,
  unique(subject_auth_user_id,request_id),
  foreign key(version_id,document_id,account_id,verified_sha256) references private.document_versions(id,document_id,account_id,verified_sha256),
  foreign key(object_id,account_id) references private.private_object_reservations(id,account_id),
  foreign key(account_id,subject_profile_id) references public.account_access(account_id,user_profile_id)
);
create index document_release_content_authorizations_release_idx on private.document_release_content_authorizations(release_id);
create index document_release_content_authorizations_grant_idx on private.document_release_content_authorizations(recipient_grant_id);
create index document_release_content_authorizations_version_idx on private.document_release_content_authorizations(version_id,document_id,account_id,verified_sha256);
create index document_release_content_authorizations_object_idx on private.document_release_content_authorizations(object_id,account_id);
create index document_release_content_authorizations_profile_idx on private.document_release_content_authorizations(account_id,subject_profile_id);
create table private.document_release_content_results (
  id uuid primary key,
  authorization_id uuid not null references private.document_release_content_authorizations(id),
  outcome text not null check(outcome in ('response_prepared','provider_failure','integrity_failure','access_changed')),
  recorded_at timestamptz not null,
  unique(authorization_id,outcome)
);
create table private.document_release_content_denials (
  id uuid primary key,
  request_id uuid not null,
  attempted_release_id uuid,
  observed_auth_user_id uuid,
  reason_code text not null check(reason_code in ('unauthenticated','forbidden_origin','method_not_allowed','invalid_request','not_found_or_unavailable','backend_unavailable')),
  recorded_at timestamptz not null
);
create index document_release_content_denials_request_idx on private.document_release_content_denials(request_id);
alter table private.document_release_content_authorizations enable row level security;
alter table private.document_release_content_results enable row level security;
alter table private.document_release_content_denials enable row level security;
revoke all on private.document_release_content_authorizations,private.document_release_content_results,private.document_release_content_denials from public,anon,authenticated,service_role;

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
      or (account_id is not null and is_demo and actor_kind='user' and object_type='document_release_content_authorization' and event_type='document_release_content_authorized')
      or (account_id is not null and is_demo and actor_kind='system' and object_type='document_release_content_result' and event_type='document_release_content_result_recorded')
      or (account_id is null and is_demo and actor_kind='system' and object_type='document_release_content_attempt' and event_type='document_release_content_denied')
    ))
  );


-- Reuse the existing recipient scope/safety/head/grant lock order. The exact
-- release argument prevents a moving current pointer from selecting new bytes.
create function private.lock_document_release_content_access(p_release_id uuid,p_expected_sha256 text,p_visibility text)
returns table(profile_id uuid,recipient_grant_id uuid) language plpgsql security invoker set search_path='' as $$
declare actor uuid:=private.private_object_authenticated_subject(); r private.document_releases%rowtype; seen jsonb;
begin
  if p_release_id is null or p_expected_sha256 is null or p_expected_sha256 !~ '^[0-9a-f]{64}$'
    or p_visibility is null or p_visibility not in ('current','historical') then raise exception 'Invalid release content request' using errcode='22023'; end if;
  select * into r from private.document_releases where id=p_release_id and is_demo;
  if not found then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
  -- Supplied digest mismatch remains the same unavailable result, after the
  -- existing helper has checked current entitlement to this exact release.
  seen:=private.read_document_release(r.document_id,r.version_id,r.verified_sha256,p_visibility='historical');
  if seen->>'release_id'<>r.id::text or r.verified_sha256<>p_expected_sha256 then
    raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
  select id into strict profile_id from public.user_profiles where auth_user_id=actor and identity_status='active' and is_demo;
  select g.id into recipient_grant_id from private.document_release_grants g where g.version_id=r.version_id
    and g.verified_sha256=r.verified_sha256 and g.user_profile_id=profile_id and g.assigned_auth_user_id=actor
    and g.revoked_at is null and g.is_demo and g.authority_basis='synthetic_fixture'
    and g.grant_kind=case when p_visibility='historical' then 'historical_recipient' else 'current_recipient' end
    and (p_visibility='historical' or g.id=any(r.recipient_grant_ids)) for share;
  if not found then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
  return next;
end;
$$;

create function private.guard_document_release_content_history()
returns trigger language plpgsql security definer set search_path='' as $$
declare a private.document_release_content_authorizations%rowtype; r private.document_releases%rowtype;
  v private.document_versions%rowtype; obj private.private_object_reservations%rowtype; access record;
begin
  if tg_table_schema<>'private' or tg_when<>'BEFORE' or tg_op<>'INSERT' then
    raise exception 'Release content history is immutable' using errcode='55000'; end if;
  if tg_table_name='document_release_content_authorizations' then
    if new.request_id is null then raise exception 'Invalid release content request' using errcode='22023'; end if;
    select * into access from private.lock_document_release_content_access(new.release_id,new.verified_sha256,new.visibility);
    select * into strict r from private.document_releases where id=new.release_id;
    select * into strict v from private.document_versions where id=r.version_id;
    select * into strict obj from private.private_object_reservations where id=v.object_id;
    new.id:=pg_catalog.gen_random_uuid();new.version_id:=v.id;new.document_id:=v.document_id;new.account_id:=v.account_id;new.object_id:=v.object_id;
    new.recipient_grant_id:=access.recipient_grant_id;new.subject_profile_id:=access.profile_id;
    new.subject_auth_user_id:=private.private_object_authenticated_subject();new.authorized_at:=pg_catalog.clock_timestamp();
    new.byte_size:=v.byte_size;new.media_type:=v.media_type;new.bucket_id:=obj.bucket_id;new.object_key:=obj.object_key;
  elsif tg_table_name='document_release_content_results' then
    perform private.private_object_service_context();
    if new.authorization_id is null or new.outcome is null or new.outcome not in ('response_prepared','provider_failure','integrity_failure','access_changed') then
      raise exception 'Invalid release content result' using errcode='22023'; end if;
    select * into a from private.document_release_content_authorizations where id=new.authorization_id;
    if not found then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
    new.id:=pg_catalog.gen_random_uuid();new.recorded_at:=pg_catalog.clock_timestamp();
  elsif tg_table_name='document_release_content_denials' then
    perform private.private_object_service_context();
    if new.request_id is null or new.reason_code is null or new.reason_code not in ('unauthenticated','forbidden_origin','method_not_allowed','invalid_request','not_found_or_unavailable','backend_unavailable') then
      raise exception 'Invalid release content denial' using errcode='22023'; end if;
    new.id:=pg_catalog.gen_random_uuid();new.recorded_at:=pg_catalog.clock_timestamp();
  else raise exception 'Unsupported release content relation' using errcode='55000'; end if;
  return new;
end;
$$;
create function private.audit_document_release_content_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid; profile uuid; tenant uuid; metadata jsonb; kind text:='system'; object_type text; event_name text;
  a private.document_release_content_authorizations%rowtype;
begin
  if tg_table_schema<>'private' or tg_when<>'AFTER' or tg_level<>'ROW' or tg_op<>'INSERT' then
    raise exception 'Unsupported release content audit context' using errcode='55000'; end if;
  if tg_table_name='document_release_content_authorizations' then
    actor:=private.private_object_authenticated_subject();profile:=new.subject_profile_id;kind:='user';tenant:=new.account_id;
    if actor is distinct from new.subject_auth_user_id then raise exception 'Invalid release content actor' using errcode='28000'; end if;
    object_type:='document_release_content_authorization';event_name:='document_release_content_authorized';
    metadata:=jsonb_build_object('release_id',new.release_id,'version_id',new.version_id,'document_id',new.document_id,'object_id',new.object_id,
      'verified_sha256',new.verified_sha256,'recipient_grant_id',new.recipient_grant_id,'visibility',new.visibility,'request_id',new.request_id,'meaning','authorization_only');
  elsif tg_table_name='document_release_content_results' then
    perform private.private_object_service_context();select * into strict a from private.document_release_content_authorizations where id=new.authorization_id;
    tenant:=a.account_id;object_type:='document_release_content_result';event_name:='document_release_content_result_recorded';
    metadata:=jsonb_build_object('authorization_id',a.id,'release_id',a.release_id,'version_id',a.version_id,'object_id',a.object_id,'verified_sha256',a.verified_sha256,
      'visibility',a.visibility,'outcome',new.outcome,'meaning','system_observation_not_delivery');
  elsif tg_table_name='document_release_content_denials' then
    perform private.private_object_service_context();object_type:='document_release_content_attempt';event_name:='document_release_content_denied';
    -- Subject/attempted release are observations, never human authority. Do not
    -- resolve another account or expose existence through a denial probe.
    metadata:=jsonb_build_object('request_id',new.request_id,'attempted_release_id',new.attempted_release_id,
      'observed_auth_user_id',new.observed_auth_user_id,'reason_code',new.reason_code,'meaning','system_observation_not_human_authority');
  else raise exception 'Unsupported release content audit relation' using errcode='55000'; end if;
  insert into public.audit_events(id,account_id,actor_user_profile_id,actor_kind,actor_auth_user_id,actor_system_key,object_type,object_id,event_type,event_metadata,occurred_at,correlation_id,is_internal_only,is_demo)
  values(gen_random_uuid(),tenant,profile,kind,actor,case when kind='system' then 'database_privileged_operation' else null end,
    object_type,new.id,event_name,metadata||jsonb_build_object('component_version','document-release-content-v1','operation_source',tg_table_name,
      'database_session_user',session_user::text,'database_request_role',current_setting('role',true)),clock_timestamp(),gen_random_uuid(),true,true);
  return null;
end;
$$;
create trigger document_release_content_authorizations_guard before insert or update or delete on private.document_release_content_authorizations for each row execute function private.guard_document_release_content_history();
create trigger document_release_content_authorizations_no_truncate before truncate on private.document_release_content_authorizations for each statement execute function private.guard_document_release_content_history();
create trigger document_release_content_authorizations_audit after insert on private.document_release_content_authorizations for each row execute function private.audit_document_release_content_change();
create trigger document_release_content_results_guard before insert or update or delete on private.document_release_content_results for each row execute function private.guard_document_release_content_history();
create trigger document_release_content_results_no_truncate before truncate on private.document_release_content_results for each statement execute function private.guard_document_release_content_history();
create trigger document_release_content_results_audit after insert on private.document_release_content_results for each row execute function private.audit_document_release_content_change();
create trigger document_release_content_denials_guard before insert or update or delete on private.document_release_content_denials for each row execute function private.guard_document_release_content_history();
create trigger document_release_content_denials_no_truncate before truncate on private.document_release_content_denials for each statement execute function private.guard_document_release_content_history();
create trigger document_release_content_denials_audit after insert on private.document_release_content_denials for each row execute function private.audit_document_release_content_change();

create function private.document_release_content_receipt(a private.document_release_content_authorizations)
returns jsonb language sql immutable security invoker set search_path='' as $$
  select jsonb_build_object('authorization_id',a.id,'release_id',a.release_id,'version_id',a.version_id,'recipient_grant_id',a.recipient_grant_id,
    'visibility',a.visibility,'object_id',a.object_id,'verified_sha256',a.verified_sha256,'byte_size',a.byte_size,'media_type',a.media_type,'bucket_id',a.bucket_id,'object_key',a.object_key)
$$;
create function private.authorize_document_release_content(p_release_id uuid,p_expected_sha256 text,p_visibility text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare subject uuid:=private.private_object_authenticated_subject(); a private.document_release_content_authorizations%rowtype; access record;
begin
  if p_request_id is null then raise exception 'Invalid release content request' using errcode='22023'; end if;
  select * into a from private.document_release_content_authorizations where subject_auth_user_id=subject and request_id=p_request_id;
  if found and (a.release_id,a.verified_sha256,a.visibility) is distinct from (p_release_id,p_expected_sha256,p_visibility) then
    raise exception 'Release content request conflict' using errcode='23505'; end if;
  select * into access from private.lock_document_release_content_access(p_release_id,p_expected_sha256,p_visibility);
  if a.id is null then
    insert into private.document_release_content_authorizations(release_id,verified_sha256,visibility,request_id)
      values(p_release_id,p_expected_sha256,p_visibility,p_request_id)
      on conflict(subject_auth_user_id,request_id) do nothing returning * into a;
    if not found then
      select * into strict a from private.document_release_content_authorizations where subject_auth_user_id=subject and request_id=p_request_id;
      if (a.release_id,a.verified_sha256,a.visibility) is distinct from (p_release_id,p_expected_sha256,p_visibility) then
        raise exception 'Release content request conflict' using errcode='23505'; end if;
    end if;
  end if;
  -- A replacement historical grant may authorize a new request; it cannot
  -- revive a receipt recorded under a retired grant or a different profile.
  if (a.recipient_grant_id,a.subject_profile_id) is distinct from (access.recipient_grant_id,access.profile_id) then
    raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
  return private.document_release_content_receipt(a);
end;
$$;
create function private.record_document_release_content_result(p_authorization_id uuid,p_outcome text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.document_release_content_results%rowtype;
begin
  perform private.private_object_service_context();
  if p_authorization_id is null or p_outcome is null or p_outcome not in ('response_prepared','provider_failure','integrity_failure','access_changed') then
    raise exception 'Invalid release content result' using errcode='22023'; end if;
  insert into private.document_release_content_results(authorization_id,outcome) values(p_authorization_id,p_outcome)
    on conflict(authorization_id,outcome) do nothing returning * into r;
  if not found then select * into strict r from private.document_release_content_results where authorization_id=p_authorization_id and outcome=p_outcome; end if;
  return jsonb_build_object('result_id',r.id,'authorization_id',r.authorization_id,'outcome',r.outcome);
end;
$$;
create function private.record_document_release_content_denial(p_request_id uuid,p_attempted_release_id uuid,p_observed_auth_user_id uuid,p_reason_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d private.document_release_content_denials%rowtype;
begin
  perform private.private_object_service_context();
  if p_request_id is null or p_reason_code is null or p_reason_code not in ('unauthenticated','forbidden_origin','method_not_allowed','invalid_request','not_found_or_unavailable','backend_unavailable') then
    raise exception 'Invalid release content denial' using errcode='22023'; end if;
  insert into private.document_release_content_denials(request_id,attempted_release_id,observed_auth_user_id,reason_code)
    values(p_request_id,p_attempted_release_id,p_observed_auth_user_id,p_reason_code) returning * into d;
  return jsonb_build_object('denial_id',d.id,'request_id',d.request_id,'reason_code',d.reason_code);
end;
$$;
create function public.authorize_document_release_content(p_release_id uuid,p_expected_sha256 text,p_visibility text,p_request_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.authorize_document_release_content(p_release_id,p_expected_sha256,p_visibility,p_request_id) $$;
create function public.record_document_release_content_result(p_authorization_id uuid,p_outcome text)
returns jsonb language sql security invoker set search_path='' as $$ select private.record_document_release_content_result(p_authorization_id,p_outcome) $$;
create function public.record_document_release_content_denial(p_request_id uuid,p_attempted_release_id uuid,p_observed_auth_user_id uuid,p_reason_code text)
returns jsonb language sql security invoker set search_path='' as $$ select private.record_document_release_content_denial(p_request_id,p_attempted_release_id,p_observed_auth_user_id,p_reason_code) $$;

revoke all on function private.lock_document_release_content_access(uuid,text,text),private.guard_document_release_content_history(),
  private.audit_document_release_content_change(),private.document_release_content_receipt(private.document_release_content_authorizations),
  private.authorize_document_release_content(uuid,text,text,uuid),private.record_document_release_content_result(uuid,text),private.record_document_release_content_denial(uuid,uuid,uuid,text),
  public.authorize_document_release_content(uuid,text,text,uuid),public.record_document_release_content_result(uuid,text),public.record_document_release_content_denial(uuid,uuid,uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function private.authorize_document_release_content(uuid,text,text,uuid),public.authorize_document_release_content(uuid,text,text,uuid) to authenticated;
grant execute on function private.record_document_release_content_result(uuid,text),private.record_document_release_content_denial(uuid,uuid,uuid,text),
  public.record_document_release_content_result(uuid,text),public.record_document_release_content_denial(uuid,uuid,uuid,text) to service_role;

-- Narrow withdrawal discovery deliberately mirrors the human withdrawal path:
-- current logical scope/ingest gate -> existing release head -> exact controller.
-- Content configuration/grants, scan and clearance are not prerequisites for
-- narrowing access. This read never creates or advances a head.
create function private.document_release_withdrawal_status(p_version_id uuid,p_expected_sha256 text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.private_object_authenticated_subject(); profile uuid; v private.document_versions%rowtype;
  h private.document_release_heads%rowtype; r private.document_releases%rowtype; state text;
begin
  if p_version_id is null or p_expected_sha256 is null or p_expected_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid withdrawal status request' using errcode='22023'; end if;
  select * into v from private.document_versions where id=p_version_id and is_demo;
  if not found then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
  begin
    profile:=private.lock_document_version_actor(v.document_id,'view_versions');
  exception when insufficient_privilege then raise exception 'not_found_or_unavailable' using errcode='42501'; end;
  select * into h from private.document_release_heads where document_id=v.document_id for share;
  if not found then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
  perform private.lock_document_release_controller(v.id,profile,actor);
  if v.verified_sha256<>p_expected_sha256 then raise exception 'not_found_or_unavailable' using errcode='42501'; end if;
  select * into r from private.document_releases where version_id=v.id;
  state:=case when r.id is null then 'unreleased'
    when exists(select 1 from private.document_release_withdrawals where release_id=r.id) then 'withdrawn'
    when r.id=h.current_release_id then 'current' else 'superseded' end;
  return jsonb_build_object('version_id',v.id,'document_id',v.document_id,'verified_sha256',v.verified_sha256,
    'release_id',r.id,'release_revision',h.release_revision,'release_state',state,'can_withdraw',state in ('current','superseded'));
end;
$$;
create function public.document_release_withdrawal_status(p_version_id uuid,p_expected_sha256 text)
returns jsonb language sql security invoker set search_path='' as $$ select private.document_release_withdrawal_status(p_version_id,p_expected_sha256) $$;
revoke all on function private.document_release_withdrawal_status(uuid,text),public.document_release_withdrawal_status(uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function private.document_release_withdrawal_status(uuid,text),public.document_release_withdrawal_status(uuid,text) to authenticated;
commit;
