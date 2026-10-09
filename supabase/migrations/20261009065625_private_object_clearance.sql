begin;

-- C01/C02/C07, M13/M19: synthetic security disposition, NOT professional
-- approval. Transport/reservation contracts (including pending-only fields)
-- remain unchanged. No content, download, release, adoption or destruction API.
alter table private.private_object_reservations add constraint private_object_reservations_id_account_unique unique(id,account_id);
alter table private.private_object_transports add constraint private_object_transports_finalized_digest_unique unique(object_id,verified_sha256,state);

create table private.private_object_security (
  object_id uuid primary key,
  account_id uuid not null,
  verified_sha256 text not null check(verified_sha256 ~ '^[0-9a-f]{64}$'),
  transport_state text not null default 'finalized' check(transport_state='finalized'),
  security_revision bigint not null default 0 check(security_revision>=0),
  scan_state text not null default 'pending' check(scan_state in ('pending','running','result')),
  current_scan_attempt_id uuid,
  current_scan_observation_id uuid,
  current_clearance_id uuid,
  phi_suspected boolean not null default false,
  visibility_restricted boolean not null default false,
  preservation_hold boolean not null default false,
  ingest_closed_at timestamptz,
  unique(object_id,account_id,verified_sha256),
  foreign key(object_id,account_id) references private.private_object_reservations(id,account_id),
  foreign key(object_id,verified_sha256,transport_state) references private.private_object_transports(object_id,verified_sha256,state),
  check((scan_state='pending' and current_scan_attempt_id is null and current_scan_observation_id is null)
    or (scan_state='running' and current_scan_attempt_id is not null and current_scan_observation_id is null)
    or (scan_state='result' and current_scan_attempt_id is not null and current_scan_observation_id is not null)),
  check(current_clearance_id is null or scan_state='result')
);
create index private_object_security_account_idx on private.private_object_security(account_id);

create table private.private_object_grants (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  object_id uuid not null,
  account_id uuid not null,
  user_profile_id uuid not null,
  capability_key text not null check(capability_key in ('inspect_cleared_object','inspect_quarantined_object','clear_object')),
  request_id uuid not null,
  requested_revision bigint not null check(requested_revision>=0),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  revoked_at timestamptz,
  revoked_from_revision bigint,
  is_demo boolean not null default true check(is_demo),
  unique(object_id,request_id),
  foreign key(object_id,account_id) references private.private_object_reservations(id,account_id),
  foreign key(account_id,user_profile_id) references public.account_access(account_id,user_profile_id),
  check((revoked_at is null and revoked_from_revision is null) or (revoked_at is not null and revoked_from_revision>=0))
);
create unique index private_object_grants_active_unique on private.private_object_grants(object_id,user_profile_id,capability_key) where revoked_at is null;
create index private_object_grants_subject_idx on private.private_object_grants(account_id,user_profile_id,object_id);

create table private.private_object_scan_attempts (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  object_id uuid not null,
  account_id uuid not null,
  verified_sha256 text not null,
  request_id uuid not null,
  requested_revision bigint not null check(requested_revision>=0),
  adapter_kind text not null check(adapter_kind='synthetic_fixture'),
  adapter_version text not null check(adapter_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
  ruleset_version text not null check(ruleset_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
  claimed_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique(object_id,request_id),
  unique(id,object_id,account_id,verified_sha256),
  foreign key(object_id,account_id,verified_sha256) references private.private_object_security(object_id,account_id,verified_sha256)
);
create table private.private_object_scan_observations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  object_id uuid not null,
  account_id uuid not null,
  verified_sha256 text not null,
  scan_attempt_id uuid not null unique,
  adapter_kind text not null check(adapter_kind='synthetic_fixture'),
  adapter_version text not null check(adapter_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
  ruleset_version text not null check(ruleset_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
  malware_outcome text not null check(malware_outcome in ('pass','blocked','error')),
  phi_signal text not null check(phi_signal in ('no_signal','suspected','not_checked')),
  reason_code text not null,
  recorded_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique(id,object_id,account_id,verified_sha256),
  unique(id,object_id,account_id,verified_sha256,scan_attempt_id),
  foreign key(scan_attempt_id,object_id,account_id,verified_sha256) references private.private_object_scan_attempts(id,object_id,account_id,verified_sha256),
  check((malware_outcome='pass' and ((phi_signal='no_signal' and reason_code='synthetic_no_signal')
    or (phi_signal='suspected' and reason_code='synthetic_phi_signal')
    or (phi_signal='not_checked' and reason_code='synthetic_phi_not_checked')))
    or (malware_outcome='blocked' and phi_signal='not_checked' and reason_code='synthetic_malware_blocked')
    or (malware_outcome='error' and phi_signal='not_checked' and reason_code in ('synthetic_scan_error','synthetic_scan_timeout')))
);
create index private_object_scan_observations_object_idx on private.private_object_scan_observations(object_id,account_id,verified_sha256);

create table private.private_object_clearance_decisions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  object_id uuid not null,
  account_id uuid not null,
  verified_sha256 text not null,
  scan_observation_id uuid not null,
  request_id uuid not null,
  requested_revision bigint not null check(requested_revision>=0),
  decision text not null check(decision in ('cleared_no_phi','rejected','suspected_phi')),
  reason_code text not null,
  reviewer_profile_id uuid not null,
  reviewer_auth_user_id uuid not null,
  decided_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique(object_id,reviewer_profile_id,request_id),
  unique(id,object_id,account_id,verified_sha256,scan_observation_id),
  foreign key(scan_observation_id,object_id,account_id,verified_sha256) references private.private_object_scan_observations(id,object_id,account_id,verified_sha256),
  foreign key(account_id,reviewer_profile_id) references public.account_access(account_id,user_profile_id),
  check((decision='cleared_no_phi' and reason_code in ('reviewed_no_phi','false_positive_reviewed'))
    or (decision='rejected' and reason_code='review_rejected')
    or (decision='suspected_phi' and reason_code='human_phi_suspected'))
);
create index private_object_clearance_observation_idx on private.private_object_clearance_decisions(scan_observation_id,object_id,account_id,verified_sha256);
create index private_object_clearance_reviewer_idx on private.private_object_clearance_decisions(account_id,reviewer_profile_id);

alter table private.private_object_security
  add foreign key(current_scan_attempt_id,object_id,account_id,verified_sha256) references private.private_object_scan_attempts(id,object_id,account_id,verified_sha256),
  add foreign key(current_scan_observation_id,object_id,account_id,verified_sha256,current_scan_attempt_id) references private.private_object_scan_observations(id,object_id,account_id,verified_sha256,scan_attempt_id),
  add foreign key(current_clearance_id,object_id,account_id,verified_sha256,current_scan_observation_id) references private.private_object_clearance_decisions(id,object_id,account_id,verified_sha256,scan_observation_id);
create index private_object_security_attempt_idx on private.private_object_security(current_scan_attempt_id);
create index private_object_security_observation_idx on private.private_object_security(current_scan_observation_id);
create index private_object_security_clearance_idx on private.private_object_security(current_clearance_id);

alter table private.private_object_security enable row level security;
alter table private.private_object_grants enable row level security;
alter table private.private_object_scan_attempts enable row level security;
alter table private.private_object_scan_observations enable row level security;
alter table private.private_object_clearance_decisions enable row level security;
revoke all on private.private_object_security,private.private_object_grants,private.private_object_scan_attempts,
  private.private_object_scan_observations,private.private_object_clearance_decisions from public,anon,authenticated,service_role;

-- Preserve every preceding event family; add only this bounded capability.
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
        (actor_kind='user' and event_type in ('private_object_reserved','private_object_upload_claimed','private_object_finalized'))
        or (actor_kind='system' and event_type in ('private_object_upload_claimed','private_object_upload_received','private_object_failed','private_object_scan_claimed','private_object_restriction_changed','private_object_hold_changed','private_object_ingest_closed'))
        or event_type='private_object_phi_suspected'))
      or (account_id is not null and is_demo and actor_kind='system' and (
        (object_type='private_object_grant' and event_type in ('private_object_grant_created','private_object_grant_revoked'))
        or (object_type='private_object_scan' and event_type='private_object_scan_recorded')))
      or (account_id is not null and is_demo and actor_kind='user' and object_type='private_object_clearance' and event_type='private_object_clearance_recorded')
      or (account_id is null and object_type='private_object_reservation_config' and event_type in ('private_object_reservation_config_created','private_object_reservation_config_updated') and actor_kind='system' and is_demo)
    ))
  );

create function private.lock_private_object_security_config()
returns void language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from private.private_object_reservation_config where singleton and enabled for share;
  if not found then raise exception 'Private object unavailable' using errcode='42501'; end if;
end;
$$;

-- Private target-profile helper is not a caller-selected actor. Provisioning
-- uses it for the grant recipient; human callers resolve their own Auth link.
create function private.lock_private_object_security_profile(p_profile uuid,p_account uuid,p_facility uuid)
returns table(directory_allowed boolean,ingest_allowed boolean)
language plpgsql security invoker set search_path='' as $$
declare g record; has_account boolean:=false; has_facility boolean:=false; has_ingest boolean:=false;
begin
  perform 1 from public.user_profiles where id=p_profile and auth_user_id is not null and identity_status='active' and is_demo for share;
  if not found then return query select false,false; return; end if;
  perform 1 from public.client_accounts where id=p_account and is_demo for share;
  if not found then return query select false,false; return; end if;
  perform 1 from public.account_access where account_id=p_account and user_profile_id=p_profile and membership_status='active' and is_demo for share;
  if not found then return query select false,false; return; end if;
  perform 1 from public.facilities where id=p_facility and account_id=p_account and is_demo for share;
  if not found then return query select false,false; return; end if;
  for g in select capability_key from public.account_capability_grants
    where account_id=p_account and user_profile_id=p_profile and revoked_at is null and is_demo and (
      (capability_key='view_account' and scope_kind='account' and facility_id is null)
      or (capability_key='view_asset' and ((scope_kind='facility' and facility_id=p_facility) or (scope_kind='all_facilities' and facility_id is null)))
      or (capability_key='ingest_private_object' and scope_kind='facility' and facility_id=p_facility))
    order by id for share
  loop
    if g.capability_key='view_account' then has_account:=true;
    elsif g.capability_key='view_asset' then has_facility:=true;
    elsif g.capability_key='ingest_private_object' then has_ingest:=true; end if;
  end loop;
  return query select has_account and has_facility,has_account and has_facility and has_ingest;
end;
$$;

create function private.lock_private_object_security_actor(p_object_id uuid,p_action text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare subject uuid:=private.private_object_authenticated_subject(); profile uuid;
  r private.private_object_reservations%rowtype; access record; g record; allowed boolean:=false;
begin
  if p_action not in ('status','report_phi','clear_object') then raise exception 'Invalid private object action' using errcode='22023'; end if;
  perform private.lock_private_object_security_config();
  -- Reservation identity/scope is immutable, so discovery does not lock it.
  select * into r from private.private_object_reservations where id=p_object_id;
  if not found then raise exception 'Private object unavailable' using errcode='42501'; end if;
  select id into profile from public.user_profiles where auth_user_id=subject and identity_status='active' and is_demo for share;
  if not found then raise exception 'Private object unavailable' using errcode='42501'; end if;
  select * into access from private.lock_private_object_security_profile(profile,r.account_id,r.facility_id);
  if not access.directory_allowed then raise exception 'Private object unavailable' using errcode='42501'; end if;
  allowed:=p_action in ('status','report_phi') and access.ingest_allowed and r.created_by_profile_id=profile and r.created_by_auth_user_id=subject;
  for g in select capability_key from private.private_object_grants where object_id=r.id and account_id=r.account_id
    and user_profile_id=profile and revoked_at is null and is_demo order by id for share
  loop
    if p_action in ('status','report_phi') or g.capability_key='clear_object' then allowed:=true; end if;
  end loop;
  if not allowed then raise exception 'Private object unavailable' using errcode='42501'; end if;
  return profile;
end;
$$;

-- Every mutator locks finalized transport before security; no provider I/O is
-- performed while locks are held. Missing initial state has revision zero.
create function private.lock_private_object_security(p_object_id uuid)
returns private.private_object_security language plpgsql security invoker set search_path='' as $$
declare r private.private_object_reservations%rowtype; t private.private_object_transports%rowtype; s private.private_object_security%rowtype;
begin
  select * into r from private.private_object_reservations where id=p_object_id;
  if not found then raise exception 'Private object unavailable' using errcode='42501'; end if;
  perform 1 from public.client_accounts where id=r.account_id and is_demo for share;
  if not found then raise exception 'Private object unavailable' using errcode='42501'; end if;
  perform 1 from public.facilities where id=r.facility_id and account_id=r.account_id and is_demo for share;
  if not found then raise exception 'Private object unavailable' using errcode='42501'; end if;
  select * into t from private.private_object_transports where object_id=r.id and state='finalized' for share;
  if not found then raise exception 'Private object not finalized' using errcode='55000'; end if;
  insert into private.private_object_security(object_id,account_id,verified_sha256) values(r.id,r.account_id,t.verified_sha256)
    on conflict(object_id) do nothing;
  select * into strict s from private.private_object_security where object_id=r.id for update;
  return s;
end;
$$;

create function private.private_object_security_snapshot(p_object_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s private.private_object_security%rowtype; t private.private_object_transports%rowtype;
  o private.private_object_scan_observations%rowtype; d private.private_object_clearance_decisions%rowtype; reason text; eligible boolean;
begin
  select * into t from private.private_object_transports where object_id=p_object_id;
  select * into s from private.private_object_security where object_id=p_object_id;
  select * into o from private.private_object_scan_observations where id=s.current_scan_observation_id;
  select * into d from private.private_object_clearance_decisions where id=s.current_clearance_id;
  eligible:=coalesce(t.state='finalized' and s.scan_state='result' and o.malware_outcome='pass'
    and d.decision='cleared_no_phi' and not s.phi_suspected and not s.visibility_restricted and s.ingest_closed_at is null,false);
  reason:=case when t.state is distinct from 'finalized' then 'not_finalized'
    when s.ingest_closed_at is not null then 'ingest_closed'
    when o.malware_outcome='error' then 'scan_failed'
    when o.malware_outcome='blocked' then 'malware_blocked'
    when s.phi_suspected then 'phi_suspected'
    when s.scan_state='running' then 'scan_running'
    when s.object_id is null or s.scan_state='pending' then 'scan_pending'
    when d.decision='rejected' then 'rejected'
    when s.visibility_restricted then 'restricted'
    when eligible then 'security_clearance_eligible' else 'human_review_required' end;
  return pg_catalog.jsonb_build_object('object_id',p_object_id,'state',reason,
    'security_revision',coalesce(s.security_revision,0),'verified_sha256',case when t.state='finalized' then t.verified_sha256 else null end,
    'scan_state',coalesce(s.scan_state,'pending'),'scan_attempt_id',s.current_scan_attempt_id,
    'scan_observation_id',s.current_scan_observation_id,'clearance_decision_id',s.current_clearance_id,
    'malware_outcome',o.malware_outcome,'phi_signal',o.phi_signal,'clearance_decision',d.decision,
    'visibility_restricted',coalesce(s.visibility_restricted,false),'preservation_hold',coalesce(s.preservation_hold,false),
    'ingest_closed',s.ingest_closed_at is not null,'security_clearance_eligible',eligible,'quarantined',not eligible,
    'next_action',case when eligible then 'await_separate_document_authority' when reason='human_review_required' then 'designated_human_review' else 'await_authorized_security_handling' end);
end;
$$;

create function private.private_object_security_status(p_object_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.private_object_authenticated_subject();
  begin perform private.lock_private_object_security_actor(p_object_id,'status');
  exception when insufficient_privilege then return pg_catalog.jsonb_build_object('object_id',null,'state','not_found_or_unavailable'); end;
  -- Read-only: no lazy state insert, no audit mutation, no revision advance.
  perform 1 from private.private_object_transports where object_id=p_object_id for share;
  perform 1 from private.private_object_security where object_id=p_object_id for share;
  return private.private_object_security_snapshot(p_object_id);
end;
$$;

create function private.provision_private_object_grant(p_object_id uuid,p_profile_id uuid,p_capability text,p_request_id uuid,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.private_object_reservations%rowtype; s private.private_object_security%rowtype; g private.private_object_grants%rowtype; access record;
begin
  perform private.private_object_service_context(); perform private.lock_private_object_security_config();
  select * into r from private.private_object_reservations where id=p_object_id;
  if not found then raise exception 'Private object unavailable' using errcode='42501'; end if;
  select * into access from private.lock_private_object_security_profile(p_profile_id,r.account_id,r.facility_id);
  if not access.directory_allowed then raise exception 'Private object unavailable' using errcode='42501'; end if;
  if p_capability is null or p_capability not in ('inspect_cleared_object','inspect_quarantined_object','clear_object') or p_request_id is null or p_expected_revision is null or p_expected_revision<0 then
    raise exception 'Invalid private object grant' using errcode='22023'; end if;
  -- Grant row lock precedes security row lock, also for revocation.
  perform 1 from private.private_object_grants where object_id=p_object_id and user_profile_id=p_profile_id order by id for update;
  s:=private.lock_private_object_security(p_object_id);
  select * into g from private.private_object_grants where object_id=p_object_id and request_id=p_request_id;
  if found then
    if (g.user_profile_id,g.capability_key,g.requested_revision) is distinct from (p_profile_id,p_capability,p_expected_revision) then
      raise exception 'Private object request conflict' using errcode='23505'; end if;
    return pg_catalog.jsonb_build_object('grant_id',g.id,'security_revision',s.security_revision,'revoked',g.revoked_at is not null);
  end if;
  if s.security_revision<>p_expected_revision then raise exception 'Private object conflict' using errcode='40001'; end if;
  if s.ingest_closed_at is not null then raise exception 'Private object ingest closed' using errcode='55000'; end if;
  insert into private.private_object_grants(object_id,account_id,user_profile_id,capability_key,request_id,requested_revision)
    values(p_object_id,r.account_id,p_profile_id,p_capability,p_request_id,p_expected_revision) returning * into g;
  update private.private_object_security set security_revision=security_revision+1 where object_id=p_object_id;
  return pg_catalog.jsonb_build_object('grant_id',g.id,'security_revision',s.security_revision+1,'revoked',false);
end;
$$;

create function private.revoke_private_object_grant(p_object_id uuid,p_grant_id uuid,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g private.private_object_grants%rowtype; s private.private_object_security%rowtype;
begin
  perform private.private_object_service_context(); perform private.lock_private_object_security_config();
  -- Revocation narrows access and must remain possible for suspended recipients.
  select * into g from private.private_object_grants where id=p_grant_id and object_id=p_object_id for update;
  if not found then raise exception 'Private object unavailable' using errcode='42501'; end if;
  s:=private.lock_private_object_security(p_object_id);
  if g.revoked_at is not null and g.revoked_from_revision=p_expected_revision then
    return pg_catalog.jsonb_build_object('grant_id',g.id,'security_revision',s.security_revision,'revoked',true); end if;
  if p_expected_revision is null or s.security_revision<>p_expected_revision then raise exception 'Private object conflict' using errcode='40001'; end if;
  if g.revoked_at is not null then raise exception 'Private object grant already revoked' using errcode='55000'; end if;
  update private.private_object_grants set revoked_at=pg_catalog.clock_timestamp(),revoked_from_revision=p_expected_revision where id=g.id;
  update private.private_object_security set security_revision=security_revision+1 where object_id=p_object_id;
  return pg_catalog.jsonb_build_object('grant_id',g.id,'security_revision',s.security_revision+1,'revoked',true);
end;
$$;

create function private.claim_private_object_scan(p_object_id uuid,p_expected_revision bigint,p_request_id uuid,p_adapter_kind text,p_adapter_version text,p_ruleset_version text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.private_object_security%rowtype; a private.private_object_scan_attempts%rowtype;
begin
  perform private.private_object_service_context(); perform private.lock_private_object_security_config();
  if p_expected_revision is null or p_expected_revision<0 or p_request_id is null or p_adapter_kind is distinct from 'synthetic_fixture'
    or p_adapter_version is null or p_adapter_version !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
    or p_ruleset_version is null or p_ruleset_version !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' then
    raise exception 'Invalid synthetic scan request' using errcode='22023'; end if;
  s:=private.lock_private_object_security(p_object_id);
  select * into a from private.private_object_scan_attempts where object_id=p_object_id and request_id=p_request_id;
  if found then
    if (a.requested_revision,a.adapter_kind,a.adapter_version,a.ruleset_version) is distinct from (p_expected_revision,p_adapter_kind,p_adapter_version,p_ruleset_version) then
      raise exception 'Private object request conflict' using errcode='23505'; end if;
    return pg_catalog.jsonb_build_object('scan_attempt_id',a.id,'verified_sha256',a.verified_sha256,'security_revision',s.security_revision,'current',s.current_scan_attempt_id=a.id);
  end if;
  if s.security_revision<>p_expected_revision then raise exception 'Private object conflict' using errcode='40001'; end if;
  if s.ingest_closed_at is not null then raise exception 'Private object ingest closed' using errcode='55000'; end if;
  insert into private.private_object_scan_attempts(object_id,account_id,verified_sha256,request_id,requested_revision,adapter_kind,adapter_version,ruleset_version)
    values(s.object_id,s.account_id,s.verified_sha256,p_request_id,p_expected_revision,p_adapter_kind,p_adapter_version,p_ruleset_version) returning * into a;
  update private.private_object_security set security_revision=security_revision+1,scan_state='running',current_scan_attempt_id=a.id,
    current_scan_observation_id=null,current_clearance_id=null where object_id=p_object_id;
  return pg_catalog.jsonb_build_object('scan_attempt_id',a.id,'verified_sha256',a.verified_sha256,'security_revision',s.security_revision+1,'current',true);
end;
$$;

create function private.record_private_object_scan(p_object_id uuid,p_scan_attempt_id uuid,p_verified_sha256 text,p_malware_outcome text,p_phi_signal text,p_reason_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.private_object_security%rowtype; a private.private_object_scan_attempts%rowtype; o private.private_object_scan_observations%rowtype;
begin
  perform private.private_object_service_context(); perform private.lock_private_object_security_config();
  s:=private.lock_private_object_security(p_object_id);
  if s.ingest_closed_at is not null then raise exception 'Private object ingest closed' using errcode='55000'; end if;
  if p_scan_attempt_id is null or p_scan_attempt_id is distinct from s.current_scan_attempt_id or p_verified_sha256 is distinct from s.verified_sha256 then
    raise exception 'Private object scan conflict' using errcode='40001'; end if;
  select * into strict a from private.private_object_scan_attempts where id=p_scan_attempt_id;
  select * into o from private.private_object_scan_observations where scan_attempt_id=a.id;
  if found then
    if (o.malware_outcome,o.phi_signal,o.reason_code) is distinct from (p_malware_outcome,p_phi_signal,p_reason_code) then
      raise exception 'Private object observation conflict' using errcode='23505'; end if;
    return pg_catalog.jsonb_build_object('scan_observation_id',o.id,'security_revision',s.security_revision);
  end if;
  if s.scan_state<>'running' then raise exception 'Private object scan conflict' using errcode='40001'; end if;
  if p_malware_outcome is null or p_phi_signal is null or p_reason_code is null or not (
    (p_malware_outcome='pass' and ((p_phi_signal='no_signal' and p_reason_code='synthetic_no_signal')
      or (p_phi_signal='suspected' and p_reason_code='synthetic_phi_signal') or (p_phi_signal='not_checked' and p_reason_code='synthetic_phi_not_checked')))
    or (p_malware_outcome='blocked' and p_phi_signal='not_checked' and p_reason_code='synthetic_malware_blocked')
    or (p_malware_outcome='error' and p_phi_signal='not_checked' and p_reason_code in ('synthetic_scan_error','synthetic_scan_timeout'))) then
    raise exception 'Invalid synthetic scan observation' using errcode='22023'; end if;
  insert into private.private_object_scan_observations(object_id,account_id,verified_sha256,scan_attempt_id,adapter_kind,adapter_version,ruleset_version,malware_outcome,phi_signal,reason_code)
    values(s.object_id,s.account_id,s.verified_sha256,a.id,a.adapter_kind,a.adapter_version,a.ruleset_version,p_malware_outcome,p_phi_signal,p_reason_code) returning * into o;
  update private.private_object_security set security_revision=security_revision+1,scan_state='result',current_scan_observation_id=o.id,current_clearance_id=null,
    phi_suspected=phi_suspected or p_phi_signal='suspected',visibility_restricted=visibility_restricted or p_phi_signal='suspected' where object_id=p_object_id;
  return pg_catalog.jsonb_build_object('scan_observation_id',o.id,'security_revision',s.security_revision+1);
end;
$$;

create function private.decide_private_object_clearance(p_object_id uuid,p_scan_observation_id uuid,p_verified_sha256 text,p_expected_revision bigint,p_request_id uuid,p_decision text,p_reason_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare profile uuid; s private.private_object_security%rowtype; o private.private_object_scan_observations%rowtype; d private.private_object_clearance_decisions%rowtype;
begin
  profile:=private.lock_private_object_security_actor(p_object_id,'clear_object');
  s:=private.lock_private_object_security(p_object_id);
  if p_request_id is null or p_expected_revision is null or p_expected_revision<0 or p_decision is null or p_reason_code is null or not (
    (p_decision='cleared_no_phi' and p_reason_code in ('reviewed_no_phi','false_positive_reviewed'))
    or (p_decision='rejected' and p_reason_code='review_rejected') or (p_decision='suspected_phi' and p_reason_code='human_phi_suspected')) then
    raise exception 'Invalid human security disposition' using errcode='22023'; end if;
  select * into d from private.private_object_clearance_decisions where object_id=p_object_id and reviewer_profile_id=profile and request_id=p_request_id;
  if found then
    if (d.scan_observation_id,d.verified_sha256,d.requested_revision,d.decision,d.reason_code) is distinct from
      (p_scan_observation_id,p_verified_sha256,p_expected_revision,p_decision,p_reason_code) then
      raise exception 'Private object request conflict' using errcode='23505'; end if;
    -- A historical replay never reinstalls an invalidated clearance.
    return pg_catalog.jsonb_build_object('decision_id',d.id,'security_revision',s.security_revision,'current',coalesce(s.current_clearance_id=d.id,false));
  end if;
  if p_expected_revision<>s.security_revision or p_verified_sha256 is distinct from s.verified_sha256
    or p_scan_observation_id is null or p_scan_observation_id is distinct from s.current_scan_observation_id then
    raise exception 'Private object clearance conflict' using errcode='40001'; end if;
  if s.ingest_closed_at is not null then raise exception 'Private object ingest closed' using errcode='55000'; end if;
  select * into o from private.private_object_scan_observations where id=s.current_scan_observation_id;
  if s.scan_state<>'result' or o.malware_outcome is distinct from 'pass' then raise exception 'Private object requires malware pass' using errcode='55000'; end if;
  if p_decision='cleared_no_phi' and (s.phi_suspected or o.phi_signal='suspected') and p_reason_code<>'false_positive_reviewed' then
    raise exception 'False-positive review reason required' using errcode='22023'; end if;
  insert into private.private_object_clearance_decisions(object_id,account_id,verified_sha256,scan_observation_id,request_id,requested_revision,decision,reason_code,reviewer_profile_id,reviewer_auth_user_id)
    values(s.object_id,s.account_id,s.verified_sha256,o.id,p_request_id,p_expected_revision,p_decision,p_reason_code,profile,private.private_object_authenticated_subject()) returning * into d;
  update private.private_object_security set security_revision=security_revision+1,
    current_clearance_id=case when p_decision='suspected_phi' then null else d.id end,
    phi_suspected=case when p_decision='cleared_no_phi' then false when p_decision='suspected_phi' then true else phi_suspected end,
    visibility_restricted=visibility_restricted or p_decision='suspected_phi' where object_id=p_object_id;
  return pg_catalog.jsonb_build_object('decision_id',d.id,'security_revision',s.security_revision+1,'current',p_decision<>'suspected_phi');
end;
$$;

create function private.report_private_object_phi(p_object_id uuid,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.lock_private_object_security_actor(p_object_id,'report_phi');
  declare s private.private_object_security%rowtype:=private.lock_private_object_security(p_object_id);
  begin
    if p_expected_revision is distinct from s.security_revision then raise exception 'Private object conflict' using errcode='40001'; end if;
    if s.ingest_closed_at is not null then raise exception 'Private object ingest closed' using errcode='55000'; end if;
    if not s.phi_suspected or not s.visibility_restricted or s.current_clearance_id is not null then
      update private.private_object_security set security_revision=security_revision+1,current_clearance_id=null,phi_suspected=true,visibility_restricted=true where object_id=p_object_id;
    end if;
  end;
  return private.private_object_security_snapshot(p_object_id);
end;
$$;

create function private.set_private_object_controls(p_object_id uuid,p_expected_revision bigint,p_visibility_restricted boolean,p_preservation_hold boolean,p_ingest_closed boolean)
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
      current_clearance_id=case when p_ingest_closed then null else current_clearance_id end where object_id=p_object_id;
  end if;
  return private.private_object_security_snapshot(p_object_id);
end;
$$;

-- History guards deny direct editing even to the migration owner. Application
-- roles have no base-table permissions. Provenance is never a caller input.
create function private.guard_private_object_security_history()
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
        raise exception 'Human disposition cannot change technical controls' using errcode='42501'; end if;
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

create function private.audit_private_object_security()
returns trigger language plpgsql security definer set search_path='' as $$
declare event_object text; event_id uuid; names text[]:=array[]::text[]; event_name text; metadata jsonb; human boolean;
  actor_auth uuid; actor_profile uuid; correlation uuid:=pg_catalog.gen_random_uuid();
begin
  if tg_table_schema<>'private' or tg_when<>'AFTER' or tg_level<>'ROW' or tg_op not in ('INSERT','UPDATE') then
    raise exception 'Unsupported security audit context' using errcode='55000'; end if;
  metadata:=pg_catalog.jsonb_build_object('object_id',new.object_id,'component_version','private-object-clearance-v1');
  if tg_table_name='private_object_grants' then
    event_object:='private_object_grant';event_id:=new.id;
    names:=array[case when tg_op='INSERT' then 'private_object_grant_created' else 'private_object_grant_revoked' end];
    metadata:=metadata||pg_catalog.jsonb_build_object('capability',new.capability_key,'subject_profile_id',new.user_profile_id,
      'security_revision',coalesce(new.revoked_from_revision,new.requested_revision)+1);
  elsif tg_table_name='private_object_scan_attempts' and tg_op='INSERT' then
    event_object:='private_object';event_id:=new.object_id;names:=array['private_object_scan_claimed'];
    metadata:=metadata||pg_catalog.jsonb_build_object('scan_attempt_id',new.id,'verified_sha256',new.verified_sha256,'adapter_kind',new.adapter_kind,
      'adapter_version',new.adapter_version,'ruleset_version',new.ruleset_version,'security_revision',new.requested_revision+1,'clearance_invalidated',true);
  elsif tg_table_name='private_object_scan_observations' and tg_op='INSERT' then
    event_object:='private_object_scan';event_id:=new.id;names:=array['private_object_scan_recorded'];
    metadata:=metadata||pg_catalog.jsonb_build_object('scan_attempt_id',new.scan_attempt_id,'verified_sha256',new.verified_sha256,
      'adapter_kind',new.adapter_kind,'adapter_version',new.adapter_version,'ruleset_version',new.ruleset_version,
      'malware_outcome',new.malware_outcome,'phi_signal',new.phi_signal,'reason_code',new.reason_code);
  elsif tg_table_name='private_object_clearance_decisions' and tg_op='INSERT' then
    event_object:='private_object_clearance';event_id:=new.id;names:=array['private_object_clearance_recorded'];
    metadata:=metadata||pg_catalog.jsonb_build_object('scan_observation_id',new.scan_observation_id,'verified_sha256',new.verified_sha256,
      'decision',new.decision,'reason_code',new.reason_code,'security_revision',new.requested_revision+1);
  elsif tg_table_name='private_object_security' and tg_op='UPDATE' then
    event_object:='private_object';event_id:=new.object_id;
    metadata:=metadata||pg_catalog.jsonb_build_object('security_revision',new.security_revision,'verified_sha256',new.verified_sha256,
      'visibility_restricted',new.visibility_restricted,'preservation_hold',new.preservation_hold,'ingest_closed',new.ingest_closed_at is not null);
    if new.phi_suspected and (not old.phi_suspected or not old.visibility_restricted or old.current_clearance_id is not null) then names:=pg_catalog.array_append(names,'private_object_phi_suspected'); end if;
    -- Suspicion's automatic restriction is already represented by its event.
    if new.visibility_restricted is distinct from old.visibility_restricted and not (new.phi_suspected and new.visibility_restricted) then names:=pg_catalog.array_append(names,'private_object_restriction_changed'); end if;
    if new.preservation_hold is distinct from old.preservation_hold then names:=pg_catalog.array_append(names,'private_object_hold_changed'); end if;
    if new.ingest_closed_at is distinct from old.ingest_closed_at then names:=pg_catalog.array_append(names,'private_object_ingest_closed'); end if;
  else raise exception 'Unsupported security audit relation' using errcode='55000'; end if;
  if pg_catalog.cardinality(names)=0 then return null; end if;
  human:=session_user='authenticator' and pg_catalog.current_setting('role',true)='authenticated';
  if human then
    actor_auth:=private.private_object_authenticated_subject();
    select id into strict actor_profile from public.user_profiles where auth_user_id=actor_auth and identity_status='active' and is_demo;
  else perform private.private_object_service_context(); end if;
  foreach event_name in array names loop
    insert into public.audit_events(id,account_id,actor_user_profile_id,actor_kind,actor_auth_user_id,actor_system_key,object_type,object_id,event_type,event_metadata,occurred_at,correlation_id,is_internal_only,is_demo)
    values(pg_catalog.gen_random_uuid(),new.account_id,actor_profile,case when human then 'user' else 'system' end,actor_auth,
      case when human then null else 'database_privileged_operation' end,event_object,event_id,event_name,
      metadata||pg_catalog.jsonb_build_object('operation_source',tg_table_name,'database_session_user',session_user::text,'database_request_role',pg_catalog.current_setting('role',true)),
      pg_catalog.clock_timestamp(),correlation,true,true);
  end loop;
  return null;
end;
$$;

create trigger private_object_security_guard before insert or update or delete on private.private_object_security for each row execute function private.guard_private_object_security_history();
create trigger private_object_security_no_truncate before truncate on private.private_object_security for each statement execute function private.guard_private_object_security_history();
create trigger private_object_security_audit after update on private.private_object_security for each row execute function private.audit_private_object_security();
create trigger private_object_grants_guard before insert or update or delete on private.private_object_grants for each row execute function private.guard_private_object_security_history();
create trigger private_object_grants_no_truncate before truncate on private.private_object_grants for each statement execute function private.guard_private_object_security_history();
create trigger private_object_grants_audit after insert or update on private.private_object_grants for each row execute function private.audit_private_object_security();
create trigger private_object_scan_attempts_guard before insert or update or delete on private.private_object_scan_attempts for each row execute function private.guard_private_object_security_history();
create trigger private_object_scan_attempts_no_truncate before truncate on private.private_object_scan_attempts for each statement execute function private.guard_private_object_security_history();
create trigger private_object_scan_attempts_audit after insert on private.private_object_scan_attempts for each row execute function private.audit_private_object_security();
create trigger private_object_scan_observations_guard before insert or update or delete on private.private_object_scan_observations for each row execute function private.guard_private_object_security_history();
create trigger private_object_scan_observations_no_truncate before truncate on private.private_object_scan_observations for each statement execute function private.guard_private_object_security_history();
create trigger private_object_scan_observations_audit after insert on private.private_object_scan_observations for each row execute function private.audit_private_object_security();
create trigger private_object_clearance_decisions_guard before insert or update or delete on private.private_object_clearance_decisions for each row execute function private.guard_private_object_security_history();
create trigger private_object_clearance_decisions_no_truncate before truncate on private.private_object_clearance_decisions for each statement execute function private.guard_private_object_security_history();
create trigger private_object_clearance_decisions_audit after insert on private.private_object_clearance_decisions for each row execute function private.audit_private_object_security();

create function public.private_object_security_status(p_object_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.private_object_security_status(p_object_id) $$;
create function public.provision_private_object_grant(p_object_id uuid,p_profile_id uuid,p_capability text,p_request_id uuid,p_expected_revision bigint) returns jsonb language sql security invoker set search_path='' as $$ select private.provision_private_object_grant(p_object_id,p_profile_id,p_capability,p_request_id,p_expected_revision) $$;
create function public.revoke_private_object_grant(p_object_id uuid,p_grant_id uuid,p_expected_revision bigint) returns jsonb language sql security invoker set search_path='' as $$ select private.revoke_private_object_grant(p_object_id,p_grant_id,p_expected_revision) $$;
create function public.claim_private_object_scan(p_object_id uuid,p_expected_revision bigint,p_request_id uuid,p_adapter_kind text,p_adapter_version text,p_ruleset_version text) returns jsonb language sql security invoker set search_path='' as $$ select private.claim_private_object_scan(p_object_id,p_expected_revision,p_request_id,p_adapter_kind,p_adapter_version,p_ruleset_version) $$;
create function public.record_private_object_scan(p_object_id uuid,p_scan_attempt_id uuid,p_verified_sha256 text,p_malware_outcome text,p_phi_signal text,p_reason_code text) returns jsonb language sql security invoker set search_path='' as $$ select private.record_private_object_scan(p_object_id,p_scan_attempt_id,p_verified_sha256,p_malware_outcome,p_phi_signal,p_reason_code) $$;
create function public.decide_private_object_clearance(p_object_id uuid,p_scan_observation_id uuid,p_verified_sha256 text,p_expected_revision bigint,p_request_id uuid,p_decision text,p_reason_code text) returns jsonb language sql security invoker set search_path='' as $$ select private.decide_private_object_clearance(p_object_id,p_scan_observation_id,p_verified_sha256,p_expected_revision,p_request_id,p_decision,p_reason_code) $$;
create function public.report_private_object_phi(p_object_id uuid,p_expected_revision bigint) returns jsonb language sql security invoker set search_path='' as $$ select private.report_private_object_phi(p_object_id,p_expected_revision) $$;
create function public.set_private_object_controls(p_object_id uuid,p_expected_revision bigint,p_visibility_restricted boolean,p_preservation_hold boolean,p_ingest_closed boolean) returns jsonb language sql security invoker set search_path='' as $$ select private.set_private_object_controls(p_object_id,p_expected_revision,p_visibility_restricted,p_preservation_hold,p_ingest_closed) $$;

revoke all on function private.lock_private_object_security_config(),private.lock_private_object_security_profile(uuid,uuid,uuid),private.lock_private_object_security_actor(uuid,text),private.lock_private_object_security(uuid),private.private_object_security_snapshot(uuid),private.guard_private_object_security_history(),private.audit_private_object_security(),
  private.private_object_security_status(uuid),private.provision_private_object_grant(uuid,uuid,text,uuid,bigint),private.revoke_private_object_grant(uuid,uuid,bigint),private.claim_private_object_scan(uuid,bigint,uuid,text,text,text),private.record_private_object_scan(uuid,uuid,text,text,text,text),private.decide_private_object_clearance(uuid,uuid,text,bigint,uuid,text,text),private.report_private_object_phi(uuid,bigint),private.set_private_object_controls(uuid,bigint,boolean,boolean,boolean),
  public.private_object_security_status(uuid),public.provision_private_object_grant(uuid,uuid,text,uuid,bigint),public.revoke_private_object_grant(uuid,uuid,bigint),public.claim_private_object_scan(uuid,bigint,uuid,text,text,text),public.record_private_object_scan(uuid,uuid,text,text,text,text),public.decide_private_object_clearance(uuid,uuid,text,bigint,uuid,text,text),public.report_private_object_phi(uuid,bigint),public.set_private_object_controls(uuid,bigint,boolean,boolean,boolean) from public,anon,authenticated,service_role;
grant execute on function private.private_object_security_status(uuid),private.decide_private_object_clearance(uuid,uuid,text,bigint,uuid,text,text),private.report_private_object_phi(uuid,bigint),public.private_object_security_status(uuid),public.decide_private_object_clearance(uuid,uuid,text,bigint,uuid,text,text),public.report_private_object_phi(uuid,bigint) to authenticated;
grant execute on function private.provision_private_object_grant(uuid,uuid,text,uuid,bigint),private.revoke_private_object_grant(uuid,uuid,bigint),private.claim_private_object_scan(uuid,bigint,uuid,text,text,text),private.record_private_object_scan(uuid,uuid,text,text,text,text),private.set_private_object_controls(uuid,bigint,boolean,boolean,boolean),public.provision_private_object_grant(uuid,uuid,text,uuid,bigint),public.revoke_private_object_grant(uuid,uuid,bigint),public.claim_private_object_scan(uuid,bigint,uuid,text,text,text),public.record_private_object_scan(uuid,uuid,text,text,text,text),public.set_private_object_controls(uuid,bigint,boolean,boolean,boolean) to service_role;

comment on table private.private_object_security is 'Synthetic security state and CAS revision, independent of immutable pending-only transport. Clearance eligibility is not document adoption, release or professional approval. No destruction path.';
comment on table private.private_object_scan_observations is 'Immutable typed synthetic_fixture observations. No actual malware/PHI detection or external scanner contract is implemented or claimed; provider/unknown adapters are rejected.';
comment on table private.private_object_clearance_decisions is 'Immutable current-human security dispositions bound to exact object/account/verified digest/observation. Service-role work is never a human clearance.';
commit;
