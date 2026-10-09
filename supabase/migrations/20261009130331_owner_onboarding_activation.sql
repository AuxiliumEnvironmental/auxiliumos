begin;

-- The existing access tables remain authoritative. This is one development
-- owner's atomic INITIAL activation, never a public administrator bootstrap.
create function private.activate_development_owner(p_auth_user_id uuid, p_preflight boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_profile constant uuid := '80f693ae-4109-442c-b719-000000000101';
  owner_account constant uuid := '80f693ae-4109-442c-b719-000000000001';
  owner_facility constant uuid := '80f693ae-4109-442c-b719-000000000301';
  owner_membership constant uuid := '80f693ae-4109-442c-b719-000000000201';
  profile public.user_profiles%rowtype;
  capability public.account_capability_grants%rowtype;
  expected_key text;
  expected_id uuid;
  actual_count integer := 0;
begin
  perform private.private_object_service_context();
  if p_preflight is true then
    if p_auth_user_id is not null then raise exception 'Invalid owner activation preflight' using errcode='22023'; end if;
    return jsonb_build_object('ready',true,'scope','development_owner_initial_activation');
  end if;
  if p_preflight is null or p_auth_user_id is null then
    raise exception 'Invalid owner activation request' using errcode='22023';
  end if;

  -- Auth is only read, never inserted/edited by SQL. Lock first to serialize
  -- against email changes/deletion before locking its application FK dependent.
  perform id from auth.users where id=p_auth_user_id
    and pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.lower(email),'UTF8')),'hex')
      ='25b94cb2f529c847c80f4581f9101ff74676472d0df211419fed1a522652c5d9'
    for share;
  if not found then raise exception 'Owner activation unavailable' using errcode='42501'; end if;
  select * into profile from public.user_profiles where id=owner_profile for update;
  if not found or profile.auth_user_id is distinct from p_auth_user_id or not profile.auth_linked_once
    or not profile.is_demo or profile.display_name<>'Development owner'
    or profile.identity_status not in ('suspended','active') then
    raise exception 'Owner activation unavailable' using errcode='42501';
  end if;
  perform id from public.client_accounts where id=owner_account and is_demo and display_name='AuxiliumOS Development' for share;
  if not found then raise exception 'Owner activation unavailable' using errcode='42501'; end if;
  -- FOR UPDATE also conflicts with FK key-share locks from new memberships or
  -- capability inserts, preventing extra-access phantoms during final checking.
  perform account_id from public.account_access where user_profile_id=owner_profile order by account_id for update;
  if (select count(*) from public.account_access where user_profile_id=owner_profile)<>1
    or not exists(select 1 from public.account_access where user_profile_id=owner_profile
      and account_id=owner_account and membership_status='active' and is_demo) then
    raise exception 'Owner activation unavailable' using errcode='42501';
  end if;
  perform id from public.facilities where id=owner_facility and account_id=owner_account
    and is_demo and display_name='Owner Workflow Sandbox' for share;
  if not found then raise exception 'Owner activation unavailable' using errcode='42501'; end if;
  perform id from public.account_memberships where user_profile_id=owner_profile order by id for share;
  if (select count(*) from public.account_memberships where user_profile_id=owner_profile)<>1
    or not exists(select 1 from public.account_memberships where id=owner_membership
      and user_profile_id=owner_profile and account_id=owner_account and role_key='system_admin' and is_demo) then
    raise exception 'Owner activation unavailable' using errcode='42501';
  end if;
  for capability in select * from public.account_capability_grants where user_profile_id=owner_profile order by id for share loop
    actual_count:=actual_count+1;
    expected_key:=case actual_count when 1 then 'view_account' when 2 then 'view_asset'
      when 3 then 'submit_request' when 4 then 'triage_request' when 5 then 'ingest_private_object' else null end;
    expected_id:=('80f693ae-4109-442c-b719-00000000070'||actual_count::text)::uuid;
    if expected_key is null or capability.id<>expected_id or capability.account_id<>owner_account
      or capability.capability_key<>expected_key or not capability.is_demo or capability.revoked_at is not null
      or capability.scope_kind<>(case when actual_count=1 then 'account' else 'facility' end)
      or capability.facility_id is distinct from (case when actual_count=1 then null::uuid else owner_facility end) then
      raise exception 'Owner activation unavailable' using errcode='42501';
    end if;
  end loop;
  if actual_count<>5 then raise exception 'Owner activation unavailable' using errcode='42501'; end if;

  if not exists(select 1 from public.audit_events where object_type='user_profile' and object_id=owner_profile
    and event_type='profile_created' and actor_kind='system' and actor_system_key='database_privileged_operation'
    and event_metadata->'after' @> jsonb_build_object('id',owner_profile,'auth_user_id',p_auth_user_id,
      'identity_status','suspended','auth_linked_once',true,'is_demo',true))
    or exists(select 1 from public.audit_events where object_id in (owner_profile,
      '80f693ae-4109-442c-b719-000000000701'::uuid,'80f693ae-4109-442c-b719-000000000702'::uuid,
      '80f693ae-4109-442c-b719-000000000703'::uuid,'80f693ae-4109-442c-b719-000000000704'::uuid,
      '80f693ae-4109-442c-b719-000000000705'::uuid)
      and (event_type like '%deleted%' or event_type like '%revoked%' or event_type like '%restored%'))
    or exists(select 1 from public.audit_events where object_type='account_access' and object_id=owner_profile
      and (event_metadata->'after' is null or not(event_metadata->'after' @>
        jsonb_build_object('account_id',owner_account,'user_profile_id',owner_profile,'membership_status','active','is_demo',true))))
    then raise exception 'Owner activation history requires independent review' using errcode='42501';
  end if;
  -- An already-active exact setup is an idempotent read. A suspended profile
  -- that was ever active cannot be restored by this onboarding operation.
  if profile.identity_status='active' then
    return jsonb_build_object('profile_id',owner_profile,'active',true,'changed',false);
  end if;
  if exists(select 1 from public.audit_events where object_type='user_profile' and object_id=owner_profile
    and ((event_metadata->'before'->>'identity_status') in ('active','removed')
      or (event_metadata->'after'->>'identity_status') in ('active','removed'))) then
    raise exception 'Owner activation history requires independent review' using errcode='42501';
  end if;
  update public.user_profiles set identity_status='active' where id=owner_profile;
  return jsonb_build_object('profile_id',owner_profile,'active',true,'changed',true);
end;
$$;

create function public.activate_development_owner(p_auth_user_id uuid, p_preflight boolean default false)
returns jsonb language sql security invoker set search_path='' as $$
  select private.activate_development_owner(p_auth_user_id,p_preflight)
$$;
revoke all on function private.activate_development_owner(uuid,boolean),public.activate_development_owner(uuid,boolean)
  from public,anon,authenticated,service_role;
grant execute on function private.activate_development_owner(uuid,boolean),public.activate_development_owner(uuid,boolean) to service_role;
comment on function public.activate_development_owner(uuid,boolean) is
  'Service-only initial activation for the authorized owner in the dedicated synthetic development workspace. Exact scoped grants, immutable history and system audit remain authoritative; no professional approval, live data, Auth SQL writes or privilege bootstrap.';

commit;
