-- OWNER-ONBOARD-001: run only against the independently verified auxiliumos-dev
-- project txofqxictwecgcnvezlb, as its genuine database operator, AFTER a
-- supported Dashboard invitation. Replace the single null UUID below with the
-- exact independently observed invited Auth UUID. The untouched template fails.
-- No Auth writes, secret values, session impersonation, new API or schema change.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$
declare
  v_expected_auth_id constant uuid := null;
  v_profile_id constant uuid := '80f693ae-4109-442c-b719-000000000101';
  v_account_id constant uuid := '80f693ae-4109-442c-b719-000000000001';
  v_facility_id constant uuid := '80f693ae-4109-442c-b719-000000000301';
  v_membership_id constant uuid := '80f693ae-4109-442c-b719-000000000201';
  v_owner_hash constant text := '25b94cb2f529c847c80f4581f9101ff74676472d0df211419fed1a522652c5d9';
  v_keys constant text[] := array['view_account','view_asset','submit_request','triage_request','ingest_private_object'];
  v_grant_ids constant uuid[] := array['80f693ae-4109-442c-b719-000000000701'::uuid,
    '80f693ae-4109-442c-b719-000000000702'::uuid,'80f693ae-4109-442c-b719-000000000703'::uuid,
    '80f693ae-4109-442c-b719-000000000704'::uuid,'80f693ae-4109-442c-b719-000000000705'::uuid];
  v_auth record;
  v_auth_matches integer := 0;
  v_auth_valid boolean := false;
  v_profile public.user_profiles%rowtype;
  v_profile_exists boolean;
  v_account public.client_accounts%rowtype;
  v_facility public.facilities%rowtype;
  v_access public.account_access%rowtype;
  v_member public.account_memberships%rowtype;
  v_grant public.account_capability_grants%rowtype;
  v_access_count integer := 0;
  v_member_count integer := 0;
  v_grant_count integer := 0;
  v_index integer;
begin
  if session_user not in ('postgres','supabase_admin') or current_user<>session_user
    or coalesce(nullif(pg_catalog.current_setting('role',true),'none'),session_user::text)<>session_user::text then
    raise exception 'Owner provisioning requires the genuine database operator' using errcode='42501';
  end if;
  if v_expected_auth_id is null or v_expected_auth_id='00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'Supply the independently observed invited owner Auth UUID' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(827109,101);
  -- Read/lock Auth before its application dependents. Never write auth.users.
  for v_auth in select id,is_anonymous,deleted_at,banned_until,email_change,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.lower(email),'UTF8')),'hex') as recipient_hash
    from auth.users where id=v_expected_auth_id
      or pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.lower(email),'UTF8')),'hex')=v_owner_hash
    order by id for share loop
    if v_auth.recipient_hash=v_owner_hash then v_auth_matches:=v_auth_matches+1; end if;
    if v_auth.id=v_expected_auth_id and v_auth.recipient_hash=v_owner_hash
      and v_auth.is_anonymous is false and v_auth.deleted_at is null
      and coalesce(v_auth.email_change,'')='' and (v_auth.banned_until is null or v_auth.banned_until<=pg_catalog.clock_timestamp()) then
      v_auth_valid:=true;
    end if;
  end loop;
  if v_auth_matches<>1 or not v_auth_valid then
    raise exception 'Invited owner identity requires independent reconciliation' using errcode='42501';
  end if;

  select * into v_profile from public.user_profiles where id=v_profile_id for update;
  v_profile_exists:=found;
  if exists(select 1 from public.user_profiles where auth_user_id=v_expected_auth_id and id<>v_profile_id)
    or (v_profile_exists and (v_profile.auth_user_id is distinct from v_expected_auth_id
      or not v_profile.auth_linked_once or not v_profile.is_demo or v_profile.display_name<>'Development owner'
      or v_profile.identity_status not in ('suspended','active'))) then
    raise exception 'Owner profile cannot be adopted, relinked or restored' using errcode='42501';
  end if;
  select * into v_account from public.client_accounts where id=v_account_id for share;
  if found and (not v_account.is_demo or v_account.display_name<>'AuxiliumOS Development') then
    raise exception 'Reserved owner account differs' using errcode='42501';
  end if;
  -- Profile/access UPDATE locks serialize FK-dependent inserts and lifecycle
  -- edits; the same deterministic row order is used by the existing contracts.
  for v_access in select * from public.account_access where user_profile_id=v_profile_id order by account_id for update loop
    v_access_count:=v_access_count+1;
    if v_access.account_id<>v_account_id or v_access.membership_status<>'active' or not v_access.is_demo then
      raise exception 'Owner account access cannot be restored or expanded' using errcode='42501';
    end if;
  end loop;
  if v_access_count>1 then raise exception 'Owner account scope differs' using errcode='42501'; end if;
  select * into v_facility from public.facilities where id=v_facility_id for share;
  if found and (v_facility.account_id<>v_account_id or not v_facility.is_demo or v_facility.display_name<>'Owner Workflow Sandbox') then
    raise exception 'Reserved owner facility differs' using errcode='42501';
  end if;
  for v_member in select * from public.account_memberships where user_profile_id=v_profile_id or id=v_membership_id order by id for share loop
    v_member_count:=v_member_count+1;
    if v_member.id<>v_membership_id or v_member.user_profile_id<>v_profile_id or v_member.account_id<>v_account_id
      or v_member.role_key<>'system_admin' or not v_member.is_demo then
      raise exception 'Owner administrative designation differs' using errcode='42501';
    end if;
  end loop;
  if v_member_count>1 then raise exception 'Owner administrative designation differs' using errcode='42501'; end if;
  for v_grant in select * from public.account_capability_grants where user_profile_id=v_profile_id or id=any(v_grant_ids) order by id for share loop
    v_grant_count:=v_grant_count+1;
    v_index:=array_position(v_grant_ids,v_grant.id);
    if v_index is null or v_grant.account_id<>v_account_id or v_grant.user_profile_id<>v_profile_id
      or v_grant.capability_key<>v_keys[v_index] or not v_grant.is_demo or v_grant.revoked_at is not null
      or v_grant.scope_kind<>(case when v_index=1 then 'account' else 'facility' end)
      or v_grant.facility_id is distinct from (case when v_index=1 then null::uuid else v_facility_id end) then
      raise exception 'Owner capabilities cannot be replaced, restored or expanded' using errcode='42501';
    end if;
  end loop;

  if exists(select 1 from public.audit_events where (object_id=v_profile_id or object_id=any(v_grant_ids))
    and (event_type like '%deleted%' or event_type like '%revoked%' or event_type like '%restored%'))
    or exists(select 1 from public.audit_events e where e.object_type='account_capability_grant'
      and e.object_id=any(v_grant_ids) and not exists(select 1 from public.account_capability_grants g where g.id=e.object_id))
    or exists(select 1 from public.audit_events where object_type='account_access' and object_id=v_profile_id
      and (v_access_count<>1 or event_metadata->'after' is null or not(event_metadata->'after' @>
        jsonb_build_object('account_id',v_account_id,'user_profile_id',v_profile_id,'membership_status','active','is_demo',true)))) then
    raise exception 'Owner access history requires independent review' using errcode='42501';
  end if;
  if v_profile_exists then
    if not exists(select 1 from public.audit_events where object_type='user_profile' and object_id=v_profile_id
      and event_type='profile_created' and actor_kind='system' and actor_system_key='database_privileged_operation'
      and event_metadata->'after' @> jsonb_build_object('id',v_profile_id,'auth_user_id',v_expected_auth_id,
        'identity_status','suspended','auth_linked_once',true,'is_demo',true))
      or exists(select 1 from public.audit_events where object_type='user_profile' and object_id=v_profile_id
        and ((event_metadata->'before'->>'identity_status')='removed' or (event_metadata->'after'->>'identity_status')='removed'))
      or (v_profile.identity_status='suspended' and exists(select 1 from public.audit_events
        where object_type='user_profile' and object_id=v_profile_id and
          ((event_metadata->'before'->>'identity_status')='active' or (event_metadata->'after'->>'identity_status')='active'))) then
      raise exception 'Owner profile history cannot be recreated or restored' using errcode='42501';
    end if;
    if v_profile.identity_status='active' then
      if v_account.id is null or v_facility.id is null or v_access_count<>1 or v_member_count<>1 or v_grant_count<>5 then
        raise exception 'Active owner configuration is incomplete; no silent repair' using errcode='42501';
      end if;
      return; -- Exact completed setup is a read-only idempotent result.
    end if;
  elsif exists(select 1 from public.audit_events where object_type='user_profile' and object_id=v_profile_id) then
    raise exception 'Historical owner profile cannot be recreated' using errcode='42501';
  end if;

  -- All inserts and final activation are one transaction. Failure rolls back
  -- application rows and their audit events together; the Auth invite remains.
  if v_account.id is null then
    insert into public.client_accounts(id,display_name,is_demo) values(v_account_id,'AuxiliumOS Development',true);
  end if;
  if v_facility.id is null then
    insert into public.facilities(id,account_id,display_name,is_demo) values(v_facility_id,v_account_id,'Owner Workflow Sandbox',true);
  end if;
  if not v_profile_exists then
    insert into public.user_profiles(id,auth_user_id,display_name,identity_status,is_demo)
      values(v_profile_id,v_expected_auth_id,'Development owner','suspended',true);
  end if;
  if v_access_count=0 then
    insert into public.account_access(account_id,user_profile_id,membership_status,is_demo) values(v_account_id,v_profile_id,'active',true);
  end if;
  if v_member_count=0 then
    insert into public.account_memberships(id,account_id,user_profile_id,role_key,is_demo)
      values(v_membership_id,v_account_id,v_profile_id,'system_admin',true);
  end if;
  for v_index in 1..5 loop
    if not exists(select 1 from public.account_capability_grants where id=v_grant_ids[v_index]) then
      insert into public.account_capability_grants(id,account_id,user_profile_id,capability_key,scope_kind,facility_id,is_demo)
        values(v_grant_ids[v_index],v_account_id,v_profile_id,v_keys[v_index],
          case when v_index=1 then 'account' else 'facility' end,case when v_index=1 then null::uuid else v_facility_id end,true);
    end if;
  end loop;
  update public.user_profiles set identity_status='active'
    where id=v_profile_id and auth_user_id=v_expected_auth_id and identity_status='suspended' and auth_linked_once and is_demo;
  if not found then raise exception 'Owner initial activation was not confirmed' using errcode='42501'; end if;
end $$;
commit;

-- Safe application readback only. This is not password or first-login evidence.
select p.id as profile_id,p.identity_status,a.account_id,f.id as facility_id,
  array(select g.capability_key from public.account_capability_grants g
    where g.user_profile_id=p.id and g.revoked_at is null order by g.id) as capabilities
from public.user_profiles p join public.account_access a on a.user_profile_id=p.id
join public.facilities f on f.account_id=a.account_id and f.id='80f693ae-4109-442c-b719-000000000301'
where p.id='80f693ae-4109-442c-b719-000000000101';
