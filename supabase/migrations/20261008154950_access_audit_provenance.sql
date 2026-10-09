begin;

-- SEC-001C-AUDIT / ADR-002. Extend, do not reconstruct, existing history.
-- The default keeps the unchanged privileged synthetic seed replayable. It
-- never asserts runtime provenance; every access trigger sets user/system.
alter table public.audit_events
  add column actor_kind text not null default 'legacy_fixture',
  add column actor_auth_user_id uuid,
  add column actor_system_key text,
  add column correlation_id uuid not null default gen_random_uuid(),
  alter column account_id drop not null,
  add constraint audit_events_actor_provenance_check check (
    (actor_kind = 'legacy_fixture'
      and actor_auth_user_id is null and actor_system_key is null)
    or (actor_kind = 'user' and actor_user_profile_id is not null
      and actor_auth_user_id is not null and actor_system_key is null)
    or (actor_kind = 'system' and actor_user_profile_id is null
      and actor_auth_user_id is null
      and actor_system_key is not null
      and actor_system_key = 'database_privileged_operation')
  ),
  add constraint audit_events_access_event_scope_check check (
    (actor_kind = 'legacy_fixture' and account_id is not null)
    or (actor_kind in ('user', 'system') and object_id is not null
      and is_internal_only and (
        (account_id is null and object_type = 'user_profile'
          and event_type in ('profile_created', 'profile_updated', 'profile_deleted'))
        or (account_id is not null and object_type = 'account_access'
          and event_type in ('account_access_created', 'account_access_updated', 'account_access_deleted'))
        or (account_id is not null and object_type = 'account_capability_grant'
          and event_type in ('capability_grant_created', 'capability_grant_updated',
            'capability_grant_revoked', 'capability_grant_restored', 'capability_grant_deleted'))
      ))
  );

-- Historical actor Auth UUIDs intentionally have no FK to auth.users. Keep the
-- existing account and actor-profile NO ACTION FKs: history is not cascade
-- deleted or rewritten by fixture cleanup. Object IDs remain historical values.
create index audit_events_correlation_idx on public.audit_events (correlation_id);

create function private.audit_access_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_control jsonb;
  after_control jsonb;
  old_account_id uuid;
  new_account_id uuid;
  old_object_id uuid;
  new_object_id uuid;
  event_object_type text;
  event_action text;
  event_demo boolean;
  event_actor_kind text;
  event_actor_profile_id uuid;
  event_actor_auth_id uuid;
  event_system_key text;
  request_role text := coalesce(nullif(pg_catalog.current_setting('role', true), 'none'), session_user::text);
  request_claims jsonb;
  event_correlation_id uuid := pg_catalog.gen_random_uuid();
  event_time timestamptz := pg_catalog.clock_timestamp();
  safe_metadata jsonb;
begin
  if tg_table_schema <> 'public' or tg_when <> 'AFTER' or tg_level <> 'ROW'
     or tg_op not in ('INSERT', 'UPDATE', 'DELETE') then
    raise exception 'Unsupported access audit trigger context' using errcode = '55000';
  end if;

  if tg_table_name = 'user_profiles' then
    event_object_type := 'user_profile';
    event_action := case tg_op when 'INSERT' then 'profile_created'
      when 'UPDATE' then 'profile_updated' else 'profile_deleted' end;
    if tg_op <> 'INSERT' then
      old_object_id := old.id;
      before_control := pg_catalog.jsonb_build_object(
        'id', old.id, 'auth_user_id', old.auth_user_id,
        'identity_status', old.identity_status,
        'auth_linked_once', old.auth_linked_once, 'is_demo', old.is_demo);
    end if;
    if tg_op <> 'DELETE' then
      new_object_id := new.id;
      after_control := pg_catalog.jsonb_build_object(
        'id', new.id, 'auth_user_id', new.auth_user_id,
        'identity_status', new.identity_status,
        'auth_linked_once', new.auth_linked_once, 'is_demo', new.is_demo);
      event_demo := new.is_demo;
    else
      event_demo := old.is_demo;
    end if;
  elsif tg_table_name = 'account_access' then
    event_object_type := 'account_access';
    event_action := case tg_op when 'INSERT' then 'account_access_created'
      when 'UPDATE' then 'account_access_updated' else 'account_access_deleted' end;
    if tg_op <> 'INSERT' then
      old_account_id := old.account_id;
      old_object_id := old.user_profile_id;
      before_control := pg_catalog.jsonb_build_object(
        'account_id', old.account_id, 'user_profile_id', old.user_profile_id,
        'membership_status', old.membership_status, 'is_demo', old.is_demo);
    end if;
    if tg_op <> 'DELETE' then
      new_account_id := new.account_id;
      new_object_id := new.user_profile_id;
      after_control := pg_catalog.jsonb_build_object(
        'account_id', new.account_id, 'user_profile_id', new.user_profile_id,
        'membership_status', new.membership_status, 'is_demo', new.is_demo);
      event_demo := new.is_demo;
    else
      event_demo := old.is_demo;
    end if;
  elsif tg_table_name = 'account_capability_grants' then
    event_object_type := 'account_capability_grant';
    event_action := case tg_op when 'INSERT' then 'capability_grant_created'
      when 'UPDATE' then 'capability_grant_updated' else 'capability_grant_deleted' end;
    if tg_op <> 'INSERT' then
      old_account_id := old.account_id;
      old_object_id := old.id;
      before_control := pg_catalog.jsonb_build_object(
        'id', old.id, 'account_id', old.account_id, 'user_profile_id', old.user_profile_id,
        'capability_key', old.capability_key, 'scope_kind', old.scope_kind,
        'facility_id', old.facility_id, 'revoked_at', old.revoked_at, 'is_demo', old.is_demo);
    end if;
    if tg_op <> 'DELETE' then
      new_account_id := new.account_id;
      new_object_id := new.id;
      after_control := pg_catalog.jsonb_build_object(
        'id', new.id, 'account_id', new.account_id, 'user_profile_id', new.user_profile_id,
        'capability_key', new.capability_key, 'scope_kind', new.scope_kind,
        'facility_id', new.facility_id, 'revoked_at', new.revoked_at, 'is_demo', new.is_demo);
      event_demo := new.is_demo;
    else
      event_demo := old.is_demo;
    end if;
    if tg_op = 'UPDATE' then
      if old.revoked_at is null and new.revoked_at is not null then
        event_action := 'capability_grant_revoked';
      elsif old.revoked_at is not null and new.revoked_at is null then
        event_action := 'capability_grant_restored';
      end if;
    end if;
  else
    raise exception 'Unsupported access audit relation' using errcode = '55000';
  end if;

  -- Display text and bookkeeping timestamps are deliberately absent. A touch
  -- trigger or UPDATE x = x does not fabricate a lifecycle change.
  if tg_op = 'UPDATE' and before_control is not distinct from after_control then
    return null;
  end if;

  -- auth.uid() alone is not proof of an Auth-validated request: arbitrary SQL
  -- callers can set request GUCs. Only the configured PostgREST gateway session
  -- in its authenticated request role may supply user provenance. No mutation
  -- endpoint or client grants are added here; future endpoints need independent
  -- transaction-local authorization. This is provenance, not business approval.
  if session_user = 'authenticator' and request_role = 'authenticated' then
    begin
      event_actor_auth_id := auth.uid();
      request_claims := auth.jwt();
      if event_actor_auth_id is null
         or pg_catalog.jsonb_typeof(request_claims) is distinct from 'object'
         or request_claims ->> 'role' is distinct from 'authenticated'
         or request_claims -> 'is_anonymous' is distinct from 'false'::jsonb
         or (request_claims ->> 'sub')::uuid is distinct from event_actor_auth_id then
        raise exception 'Invalid access audit actor' using errcode = '28000';
      end if;
    exception when invalid_text_representation then
      raise exception 'Invalid access audit actor' using errcode = '28000';
    end;
    select profile.id into event_actor_profile_id
      from public.user_profiles as profile
      where profile.auth_user_id = event_actor_auth_id
        and profile.identity_status = 'active' and profile.is_demo;
    -- AFTER triggers see self-suspension/unlink already applied. Only this
    -- changed row's valid prior linkage may preserve the actor for that change.
    if event_actor_profile_id is null and tg_table_name = 'user_profiles'
       and tg_op in ('UPDATE', 'DELETE') then
      if old.auth_user_id = event_actor_auth_id
         and old.identity_status = 'active' and old.is_demo then
        event_actor_profile_id := old.id;
      end if;
    end if;
    if event_actor_profile_id is null then
      raise exception 'Invalid access audit actor' using errcode = '28000';
    end if;
    event_actor_kind := 'user';
  elsif (session_user in ('postgres', 'supabase_admin', 'supabase_auth_admin', 'service_role')
         and request_role = session_user::text)
     or (session_user in ('postgres', 'supabase_admin', 'authenticator')
         and request_role = 'service_role') then
    -- Even a valid-looking/stale/forged sub on a privileged connection is not
    -- an authenticated human. Ignore claims altogether for system operations.
    event_actor_kind := 'system';
    event_system_key := 'database_privileged_operation';
  else
    raise exception 'Untrusted access audit session' using errcode = '28000';
  end if;

  safe_metadata := pg_catalog.jsonb_build_object(
    'before', before_control, 'after', after_control,
    'database_session_user', session_user::text, 'database_request_role', request_role);

  -- A privileged cross-account move retains an event for BOTH affected tenants.
  -- The shared server-generated correlation joins this one row transition; no
  -- caller-provided request/correlation/time/actor fields are consumed.
  if tg_op = 'UPDATE' and old_account_id is distinct from new_account_id then
    insert into public.audit_events (
      id, account_id, actor_user_profile_id, actor_kind, actor_auth_user_id,
      actor_system_key, object_type, object_id, event_type, event_metadata,
      occurred_at, correlation_id, is_internal_only, is_demo
    ) values (
      pg_catalog.gen_random_uuid(), old_account_id, event_actor_profile_id,
      event_actor_kind, event_actor_auth_id, event_system_key,
      event_object_type, old_object_id, event_action, safe_metadata,
      event_time, event_correlation_id, true, old.is_demo
    );
  end if;

  insert into public.audit_events (
    id, account_id, actor_user_profile_id, actor_kind, actor_auth_user_id,
    actor_system_key, object_type, object_id, event_type, event_metadata,
    occurred_at, correlation_id, is_internal_only, is_demo
  ) values (
    pg_catalog.gen_random_uuid(),
    case when tg_op = 'DELETE' then old_account_id else new_account_id end,
    event_actor_profile_id, event_actor_kind, event_actor_auth_id, event_system_key,
    event_object_type, coalesce(new_object_id, old_object_id), event_action, safe_metadata,
    event_time, event_correlation_id, true, event_demo
  );
  return null;
end;
$$;

create trigger user_profiles_audit_access_change
  after insert or update or delete on public.user_profiles
  for each row execute function private.audit_access_change();
create trigger account_access_audit_access_change
  after insert or update or delete on public.account_access
  for each row execute function private.audit_access_change();
create trigger account_capability_grants_audit_access_change
  after insert or update or delete on public.account_capability_grants
  for each row execute function private.audit_access_change();

create function private.guard_audit_history()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'TRUNCATE' and tg_table_name <> 'audit_events' then
    raise exception 'Truncation would bypass access-change history' using errcode = '55000';
  end if;
  raise exception 'Audit history is append-only' using errcode = '55000';
end;
$$;

create trigger audit_events_immutable_rows
  before update or delete on public.audit_events
  for each row execute function private.guard_audit_history();
create trigger audit_events_no_truncate
  before truncate on public.audit_events
  for each statement execute function private.guard_audit_history();
-- TRUNCATE does not fire row-level DELETE triggers. Deny it rather than silently
-- losing the affected IDs/control values; privileged row DELETE remains audited.
create trigger user_profiles_no_truncate
  before truncate on public.user_profiles
  for each statement execute function private.guard_audit_history();
create trigger account_access_no_truncate
  before truncate on public.account_access
  for each statement execute function private.guard_audit_history();
create trigger account_capability_grants_no_truncate
  before truncate on public.account_capability_grants
  for each statement execute function private.guard_audit_history();

revoke all on function private.audit_access_change(), private.guard_audit_history()
  from public, anon, authenticated, service_role;

-- Table ACLs and column ACLs are independent; reset both, including provider
-- defaults for service_role. Triggers append as the trusted migration owner.
revoke all on public.audit_events from public, anon, authenticated, service_role;
revoke all (id, account_id, actor_user_profile_id, object_type, object_id,
  event_type, event_metadata, occurred_at, is_internal_only, is_demo,
  actor_kind, actor_auth_user_id, actor_system_key, correlation_id)
  on public.audit_events from public, anon, authenticated, service_role;
grant select on public.audit_events to service_role;
revoke truncate on public.user_profiles, public.account_access, public.account_capability_grants
  from service_role;
alter table public.audit_events enable row level security;

comment on column public.audit_events.actor_kind is
  'legacy_fixture asserts no runtime actor. user is a linked subject from the trusted gateway context; system is a privileged database operation, never human approval.';
comment on column public.audit_events.actor_auth_user_id is
  'Historical Auth subject value; intentionally no FK to deleted Auth users.';
comment on column public.audit_events.correlation_id is
  'Database-generated per changed row; a cross-account move shares one correlation across both tenant events. Not a request-wide collector ID.';
comment on function private.audit_access_change() is
  'Allowlisted access-control values only, committed with the mutation. Does not collect filtered reads or durable rejected attempts; no release/signature/scientific authority is implied.';

commit;
