begin;

-- SEC-001A / ADR-002: synthetic, read-only account/facility directory.
-- No legacy role activates an identity, membership, or capability. Access-change
-- audit provenance is a separate SEC-001C migration; this does not claim it.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

alter table public.user_profiles
  add column identity_status text not null default 'suspended',
  add column auth_linked_once boolean not null default false,
  add constraint user_profiles_identity_status_allowed
    check (identity_status in ('active', 'suspended', 'removed'));

-- Preserve observed linkage history before installing its immutable guard.
-- Clearing a link, including Auth's ON DELETE SET NULL action, must never make
-- the profile eligible to pass its existing memberships/grants to another user.
update public.user_profiles set auth_linked_once = true
  where auth_user_id is not null;

-- A pre-existing orphan Auth link must fail the migration, not invent an Auth
-- user or silently discard the link. The transaction leaves the old schema intact.
alter table public.user_profiles
  add constraint user_profiles_auth_link_history_consistent
    check (auth_user_id is null or auth_linked_once),
  add constraint user_profiles_auth_user_fk
    foreign key (auth_user_id) references auth.users (id) on delete set null;

create table public.account_access (
  account_id uuid not null,
  user_profile_id uuid not null,
  membership_status text not null default 'invited',
  is_demo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint account_access_pkey primary key (account_id, user_profile_id),
  constraint account_access_account_fk foreign key (account_id)
    references public.client_accounts (id),
  constraint account_access_user_profile_fk foreign key (user_profile_id)
    references public.user_profiles (id),
  constraint account_access_membership_status_allowed
    check (membership_status in ('invited', 'active', 'suspended', 'removed'))
);

insert into public.account_access (
  account_id, user_profile_id, membership_status, is_demo, created_at, updated_at
)
select
  membership.account_id,
  membership.user_profile_id,
  case when bool_or(membership.role_key = 'removed_suspended')
    then 'suspended' else 'invited' end,
  bool_and(membership.is_demo),
  min(membership.created_at),
  max(membership.updated_at)
from public.account_memberships as membership
group by membership.account_id, membership.user_profile_id;

alter table public.account_memberships
  add constraint account_memberships_access_fk
    foreign key (account_id, user_profile_id)
    references public.account_access (account_id, user_profile_id);

create table public.account_capability_grants (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  user_profile_id uuid not null,
  capability_key text not null,
  scope_kind text not null,
  facility_id uuid,
  revoked_at timestamptz,
  is_demo boolean not null default true,
  created_at timestamptz not null default now(),

  constraint account_capability_grants_access_fk
    foreign key (account_id, user_profile_id)
    references public.account_access (account_id, user_profile_id),
  constraint account_capability_grants_facility_account_fk
    foreign key (facility_id, account_id)
    references public.facilities (id, account_id),
  constraint account_capability_grants_scope_allowed check (
    (capability_key = 'view_account' and scope_kind = 'account'
      and facility_id is null)
    or (capability_key = 'view_asset' and scope_kind = 'facility'
      and facility_id is not null)
    or (capability_key = 'view_asset' and scope_kind = 'all_facilities'
      and facility_id is null)
  )
);

-- The two partial indexes enforce active uniqueness even with null facility_id.
create unique index account_capability_grants_active_facility_unique
  on public.account_capability_grants
    (account_id, user_profile_id, capability_key, scope_kind, facility_id)
  where revoked_at is null and facility_id is not null;
create unique index account_capability_grants_active_account_unique
  on public.account_capability_grants
    (account_id, user_profile_id, capability_key, scope_kind)
  where revoked_at is null and facility_id is null;
create index account_access_user_profile_account_idx
  on public.account_access (user_profile_id, account_id);
create index account_capability_grants_active_lookup_idx
  on public.account_capability_grants
    (user_profile_id, account_id, capability_key, scope_kind, facility_id)
  where revoked_at is null;

-- Keep unchanged foundation seed/provisioning scripts usable after migrations.
-- Only a caller already allowed to write both tables can invoke this path.
-- Existing lifecycle rows are never updated, even when another legacy role or
-- removed_suspended marker is inserted. Roles never generate capability grants.
create function private.initialize_legacy_account_access()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.account_access (
    account_id, user_profile_id, membership_status, is_demo
  ) values (
    new.account_id, new.user_profile_id,
    case when new.role_key = 'removed_suspended'
      then 'suspended' else 'invited' end,
    new.is_demo
  ) on conflict (account_id, user_profile_id) do nothing;
  return new;
end;
$$;

create trigger account_memberships_initialize_access
  before insert on public.account_memberships
  for each row execute function private.initialize_legacy_account_access();

create function private.guard_profile_auth_link()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    -- This applies to every writer, including service_role. Only the trigger
    -- may advance false -> true; no SQL payload can clear or fabricate history.
    if new.auth_linked_once is distinct from old.auth_linked_once then
      raise exception 'Auth linkage history is immutable'
        using errcode = '23514';
    end if;

    if new.auth_user_id is not null
       and old.auth_user_id is distinct from new.auth_user_id then
      if old.auth_linked_once then
        raise exception 'A previously linked profile cannot receive another Auth link'
          using errcode = '23514';
      end if;
      if old.identity_status <> 'suspended' or new.identity_status <> 'suspended' then
        raise exception 'Only a suspended profile may receive an initial Auth link'
          using errcode = '23514';
      end if;
      new.auth_linked_once := true;
    end if;
  else
    if new.auth_linked_once is distinct from false then
      raise exception 'Auth linkage history is assigned by the database'
        using errcode = '23514';
    end if;
    if new.auth_user_id is not null then
      if new.identity_status <> 'suspended' then
        raise exception 'A new linked profile must begin suspended'
          using errcode = '23514';
      end if;
      new.auth_linked_once := true;
    end if;
  end if;
  return new;
end;
$$;

create trigger user_profiles_guard_auth_link
  before insert or update of auth_user_id, identity_status, auth_linked_once on public.user_profiles
  for each row execute function private.guard_profile_auth_link();

create function private.touch_account_access()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

create trigger account_access_touch_updated_at
  before update on public.account_access
  for each row execute function private.touch_account_access();

-- SECURITY DEFINER is limited to the two read-only authorization helpers.
-- The trusted migration owner must own these functions and the application
-- tables so their internal reads bypass RLS without recursive policies.
-- Neither accepts an actor/profile argument or reads user-editable metadata.
create function private.current_subject_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select profile.id
  from public.user_profiles as profile
  where profile.auth_user_id = (select auth.uid())
    and profile.identity_status = 'active'
    and profile.is_demo
    -- Supabase's protected top-level JWT claim distinguishes anonymous Auth
    -- identities (which also use authenticated). Missing/unknown values deny.
    -- https://supabase.com/docs/guides/auth/auth-anonymous#access-control
    and (select auth.jwt() -> 'is_anonymous') = 'false'::jsonb
$$;

create function private.has_directory_capability(
  p_account_id uuid,
  p_capability_key text,
  p_facility_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.account_access as access
    join public.client_accounts as account on account.id = access.account_id
    where access.account_id = p_account_id
      and access.user_profile_id = (select private.current_subject_id())
      and access.membership_status = 'active'
      and access.is_demo
      and account.is_demo
      and exists (
        select 1 from public.account_capability_grants as account_grant
        where account_grant.account_id = access.account_id
          and account_grant.user_profile_id = access.user_profile_id
          and account_grant.capability_key = 'view_account'
          and account_grant.scope_kind = 'account'
          and account_grant.facility_id is null
          and account_grant.revoked_at is null
          and account_grant.is_demo
      )
      and case
        when p_capability_key = 'view_account' then p_facility_id is null
        when p_capability_key = 'view_asset' then
          p_facility_id is not null
          and exists (
            select 1 from public.facilities as facility
            where facility.id = p_facility_id
              and facility.account_id = access.account_id
              and facility.is_demo
          )
          and exists (
            select 1 from public.account_capability_grants as asset_grant
            where asset_grant.account_id = access.account_id
              and asset_grant.user_profile_id = access.user_profile_id
              and asset_grant.capability_key = 'view_asset'
              and asset_grant.revoked_at is null
              and asset_grant.is_demo
              and (
                (asset_grant.scope_kind = 'facility'
                  and asset_grant.facility_id = p_facility_id)
                or (asset_grant.scope_kind = 'all_facilities'
                  and asset_grant.facility_id is null)
              )
          )
        else false
      end
  )
$$;

revoke all on function private.initialize_legacy_account_access() from public, anon, authenticated;
revoke all on function private.guard_profile_auth_link() from public, anon, authenticated;
revoke all on function private.touch_account_access() from public, anon, authenticated;
revoke all on function private.current_subject_id() from public, anon, authenticated;
revoke all on function private.has_directory_capability(uuid, text, uuid) from public, anon, authenticated;
grant execute on function private.current_subject_id() to authenticated;
grant execute on function private.has_directory_capability(uuid, text, uuid) to authenticated;

alter table public.account_access enable row level security;
alter table public.account_capability_grants enable row level security;

-- Supabase may have granted broad table privileges through default ACLs.
-- Revoke both table AND pre-existing column ACLs before granting the exact
-- directory surface. RLS and privileges are independent required controls.
revoke all on table
  public.user_profiles, public.client_accounts, public.facilities,
  public.account_access, public.account_capability_grants,
  public.account_memberships, public.incident_requests, public.documents,
  public.audit_events
  from public, anon, authenticated;

revoke all (id, auth_user_id, display_name, is_demo, created_at, updated_at, identity_status, auth_linked_once)
  on public.user_profiles from public, anon, authenticated;
revoke all (id, display_name, is_demo, created_at, updated_at)
  on public.client_accounts from public, anon, authenticated;
revoke all (id, account_id, display_name, is_demo, created_at, updated_at)
  on public.facilities from public, anon, authenticated;
revoke all (account_id, user_profile_id, membership_status, is_demo, created_at, updated_at)
  on public.account_access from public, anon, authenticated;
revoke all (id, account_id, user_profile_id, capability_key, scope_kind, facility_id, revoked_at, is_demo, created_at)
  on public.account_capability_grants from public, anon, authenticated;
revoke all (id, account_id, user_profile_id, role_key, is_demo, created_at, updated_at)
  on public.account_memberships from public, anon, authenticated;
revoke all (id, account_id, facility_id, submitted_by_profile_id, title, request_status, is_demo, created_at, updated_at)
  on public.incident_requests from public, anon, authenticated;
revoke all (id, account_id, facility_id, incident_request_id, title, document_class, version_label, release_state, is_internal_only, is_demo, created_at, updated_at)
  on public.documents from public, anon, authenticated;
revoke all (id, account_id, actor_user_profile_id, object_type, object_id, event_type, event_metadata, occurred_at, is_internal_only, is_demo)
  on public.audit_events from public, anon, authenticated;

grant select (id, display_name, identity_status, is_demo)
  on public.user_profiles to authenticated;
grant select (id, display_name, is_demo)
  on public.client_accounts to authenticated;
grant select (id, account_id, display_name, is_demo)
  on public.facilities to authenticated;

-- Trusted server-only fixture provisioning must not depend on provider default
-- grants. service_role remains a server credential, never a browser role/key.
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on table
  public.user_profiles, public.client_accounts, public.facilities,
  public.account_access, public.account_capability_grants, public.account_memberships
  to service_role;

create policy user_profiles_directory_select
  on public.user_profiles for select to authenticated
  using (id = (select private.current_subject_id()));
create policy client_accounts_directory_select
  on public.client_accounts for select to authenticated
  using (is_demo and private.has_directory_capability(id, 'view_account', null));
create policy facilities_directory_select
  on public.facilities for select to authenticated
  using (is_demo and private.has_directory_capability(account_id, 'view_asset', id));

comment on table public.account_access is
  'Authoritative account access lifecycle; legacy roles confer no runtime capabilities. Clients cannot read or write this table.';
comment on table public.account_capability_grants is
  'Explicit synthetic directory grants only. Nonrevoked grants still require active identity and account access; no document or business authority.';
comment on column public.user_profiles.identity_status is
  'Server-controlled OS identity state, initially suspended. A null Auth link always denies access.';
comment on column public.user_profiles.auth_linked_once is
  'Immutable linkage history, set by migration backfill or first attachment. Unlinking never permits relinking; recovery requires a later explicit contract.';

commit;
