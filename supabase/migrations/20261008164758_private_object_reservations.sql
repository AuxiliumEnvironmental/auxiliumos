begin;

-- SEC-001C-OBJECT-RESERVATIONS: synthetic metadata only. No bytes, Storage
-- policies, upload/finalization, scanner, clearance, version or release path.
alter table public.account_capability_grants
  drop constraint account_capability_grants_scope_allowed,
  add constraint account_capability_grants_scope_allowed check (
    (capability_key = 'view_account' and scope_kind = 'account' and facility_id is null)
    or (capability_key = 'view_asset' and scope_kind = 'facility' and facility_id is not null)
    or (capability_key = 'view_asset' and scope_kind = 'all_facilities' and facility_id is null)
    or (capability_key = 'ingest_private_object' and scope_kind = 'facility' and facility_id is not null)
  );
-- Deliberately do not replace either directory authorization helper.

create table private.private_object_reservation_config (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  singleton boolean not null unique default true check (singleton),
  enabled boolean not null default false,
  max_bytes integer not null default 65536 check (max_bytes between 1 and 65536),
  reservation_ttl_seconds integer not null default 900
    check (reservation_ttl_seconds between 1 and 3600),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);

create table private.private_object_reservations (
  id uuid primary key,
  account_id uuid not null references public.client_accounts (id),
  facility_id uuid not null,
  created_by_profile_id uuid not null references public.user_profiles (id),
  -- Historical value, deliberately not an Auth FK: unlinking preserves history.
  created_by_auth_user_id uuid not null,
  idempotency_key uuid not null,
  declared_byte_size integer not null check (declared_byte_size between 1 and 65536),
  declared_media_type text not null check (declared_media_type = 'text/plain'),
  canonical_request jsonb not null,
  bucket_id text not null check (bucket_id = 'os-private-ingest'),
  object_key text not null unique,
  state text not null check (state = 'reserved'),
  state_revision bigint not null check (state_revision = 1),
  created_at timestamptz not null,
  expires_at timestamptz not null,
  is_demo boolean not null check (is_demo),
  constraint private_object_reservations_facility_account_fk
    foreign key (facility_id, account_id) references public.facilities (id, account_id),
  constraint private_object_reservations_creator_access_fk
    foreign key (account_id, created_by_profile_id)
    references public.account_access (account_id, user_profile_id),
  constraint private_object_reservations_idempotency_unique
    unique (account_id, created_by_profile_id, idempotency_key),
  constraint private_object_reservations_key_check check (
    object_key = account_id::text || '/' || facility_id::text || '/' || id::text || '/payload'),
  constraint private_object_reservations_expiry_check check (
    expires_at > created_at and expires_at <= created_at + interval '1 hour'),
  constraint private_object_reservations_request_check check (
    canonical_request = pg_catalog.jsonb_build_object('schema_version', 1,
      'account_id', account_id, 'facility_id', facility_id,
      'byte_size', declared_byte_size, 'media_type', declared_media_type))
);
create index private_object_reservations_facility_account_idx
  on private.private_object_reservations (facility_id, account_id);
create index private_object_reservations_creator_idx
  on private.private_object_reservations (created_by_profile_id);

alter table private.private_object_reservation_config enable row level security;
alter table private.private_object_reservations enable row level security;
revoke all on private.private_object_reservation_config,
  private.private_object_reservations from public, anon, authenticated, service_role;
-- Newly created columns have no independent grants. Explicit table revocation
-- also removes privileges inherited from broad provider/default table ACLs.

alter table public.audit_events
  drop constraint audit_events_access_event_scope_check,
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
        or (account_id is not null and object_type = 'private_object'
          and event_type = 'private_object_reserved' and actor_kind = 'user' and is_demo)
        or (account_id is null and object_type = 'private_object_reservation_config'
          and event_type in ('private_object_reservation_config_created',
            'private_object_reservation_config_updated') and actor_kind = 'system' and is_demo)
      ))
  );

create function private.private_object_authenticated_subject()
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  subject_id uuid;
  claims jsonb;
begin
  -- Built-in role state, not an application GUC or user_metadata. SECURITY
  -- DEFINER changes current_user; it does not change the SET ROLE setting.
  if session_user <> 'authenticator'
     or pg_catalog.current_setting('role', true) is distinct from 'authenticated' then
    raise exception 'Invalid private object actor' using errcode = '28000';
  end if;
  begin
    subject_id := auth.uid();
    claims := auth.jwt();
    if subject_id is null or pg_catalog.jsonb_typeof(claims) is distinct from 'object'
       or claims ->> 'role' is distinct from 'authenticated'
       or claims -> 'is_anonymous' is distinct from 'false'::jsonb
       or (claims ->> 'sub')::uuid is distinct from subject_id then
      raise exception 'Invalid private object actor' using errcode = '28000';
    end if;
  exception when invalid_text_representation then
    raise exception 'Invalid private object actor' using errcode = '28000';
  end;
  return subject_id;
end;
$$;

create function private.lock_private_object_ingest(p_account_id uuid, p_facility_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  subject_id uuid := private.private_object_authenticated_subject();
  profile_id uuid;
  candidate record;
  has_account boolean := false;
  has_facility boolean := false;
  has_ingest boolean := false;
begin
  -- Consistent transaction lock order for reserve AND status: config, profile,
  -- account, membership, facility, relevant grants ordered by UUID. SHARE (not
  -- KEY SHARE) blocks non-key status/revocation updates until commit. A waiter
  -- rechecks the updated predicate at READ COMMITTED; higher isolation may abort.
  perform 1 from private.private_object_reservation_config as config
    where config.singleton and config.enabled for share;
  if not found then return null; end if;
  select profile.id into profile_id from public.user_profiles as profile
    where profile.auth_user_id = subject_id and profile.identity_status = 'active'
      and profile.is_demo for share;
  if not found then return null; end if;
  perform 1 from public.client_accounts as account
    where account.id = p_account_id and account.is_demo for share;
  if not found then return null; end if;
  perform 1 from public.account_access as access
    where access.account_id = p_account_id and access.user_profile_id = profile_id
      and access.membership_status = 'active' and access.is_demo for share;
  if not found then return null; end if;
  perform 1 from public.facilities as facility
    where facility.id = p_facility_id and facility.account_id = p_account_id
      and facility.is_demo for share;
  if not found then return null; end if;
  for candidate in
    select capability.capability_key from public.account_capability_grants as capability
    where capability.account_id = p_account_id and capability.user_profile_id = profile_id
      and capability.revoked_at is null and capability.is_demo and (
        (capability.capability_key = 'view_account' and capability.scope_kind = 'account'
          and capability.facility_id is null)
        or (capability.capability_key = 'view_asset' and (
          (capability.scope_kind = 'facility' and capability.facility_id = p_facility_id)
          or (capability.scope_kind = 'all_facilities' and capability.facility_id is null)))
        or (capability.capability_key = 'ingest_private_object' and capability.scope_kind = 'facility'
          and capability.facility_id = p_facility_id))
    order by capability.id for share
  loop
    if candidate.capability_key = 'view_account' then has_account := true;
    elsif candidate.capability_key = 'view_asset' then has_facility := true;
    elsif candidate.capability_key = 'ingest_private_object' then has_ingest := true;
    end if;
  end loop;
  if has_account and has_facility and has_ingest then return profile_id; end if;
  return null;
end;
$$;

create function private.prepare_private_object_reservation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  config private.private_object_reservation_config%rowtype;
begin
  if tg_table_schema <> 'private' or tg_table_name <> 'private_object_reservations'
     or tg_when <> 'BEFORE' or tg_op <> 'INSERT' or tg_level <> 'ROW' then
    raise exception 'Unsupported reservation context' using errcode = '55000';
  end if;
  new.created_by_profile_id := private.lock_private_object_ingest(new.account_id, new.facility_id);
  if new.created_by_profile_id is null then
    raise exception 'Private object reservation unavailable' using errcode = '42501';
  end if;
  select * into strict config from private.private_object_reservation_config where singleton;
  if new.idempotency_key is null or new.declared_byte_size is null
     or new.declared_byte_size not between 1 and config.max_bytes
     or new.declared_media_type is distinct from 'text/plain' then
    raise exception 'Invalid private object request' using errcode = '22023';
  end if;
  -- Every authoritative value is assigned here, even for a privileged direct
  -- INSERT. There is no client actor/time/path/state override surface.
  new.id := pg_catalog.gen_random_uuid();
  new.created_by_auth_user_id := private.private_object_authenticated_subject();
  new.created_at := pg_catalog.clock_timestamp();
  new.expires_at := new.created_at + pg_catalog.make_interval(secs => config.reservation_ttl_seconds);
  new.is_demo := true;
  new.bucket_id := 'os-private-ingest';
  new.object_key := new.account_id::text || '/' || new.facility_id::text || '/' || new.id::text || '/payload';
  new.state := 'reserved';
  new.state_revision := 1;
  new.canonical_request := pg_catalog.jsonb_build_object('schema_version', 1,
    'account_id', new.account_id, 'facility_id', new.facility_id,
    'byte_size', new.declared_byte_size, 'media_type', new.declared_media_type);
  return new;
end;
$$;

create function private.guard_private_object_reservation_history()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'Private object reservation history is immutable' using errcode = '55000';
end;
$$;
create trigger private_object_reservations_prepare
  before insert on private.private_object_reservations
  for each row execute function private.prepare_private_object_reservation();
create trigger private_object_reservations_immutable
  before update or delete on private.private_object_reservations
  for each row execute function private.guard_private_object_reservation_history();
create trigger private_object_reservations_no_truncate
  before truncate on private.private_object_reservations
  for each statement execute function private.guard_private_object_reservation_history();

create function private.guard_private_object_reservation_config()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op not in ('INSERT', 'UPDATE') then
    raise exception 'Private object configuration is preserved' using errcode = '55000';
  end if;
  if session_user not in ('postgres', 'supabase_admin')
     or coalesce(nullif(pg_catalog.current_setting('role', true), 'none'), session_user::text)
       <> session_user::text then
    raise exception 'Untrusted private object configuration session' using errcode = '28000';
  end if;
  if tg_op = 'INSERT' then
    new.id := pg_catalog.gen_random_uuid();
    new.singleton := true;
    new.revision := 1;
  else
    if new.id is distinct from old.id or new.singleton is distinct from old.singleton
       or new.revision is distinct from old.revision or new.updated_at is distinct from old.updated_at then
      raise exception 'Private object configuration provenance is server assigned' using errcode = '23514';
    end if;
    if (new.enabled, new.max_bytes, new.reservation_ttl_seconds)
       is not distinct from (old.enabled, old.max_bytes, old.reservation_ttl_seconds) then
      return old;
    end if;
    new.revision := old.revision + 1;
  end if;
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;
create trigger private_object_reservation_config_guard
  before insert or update or delete on private.private_object_reservation_config
  for each row execute function private.guard_private_object_reservation_config();
create trigger private_object_reservation_config_no_truncate
  before truncate on private.private_object_reservation_config
  for each statement execute function private.guard_private_object_reservation_config();

create function private.audit_private_object_reservation_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  event_account uuid;
  event_profile uuid;
  event_auth uuid;
  event_kind text;
  event_system text;
  event_type text;
  object_type text;
  safe_metadata jsonb;
  request_role text := coalesce(nullif(pg_catalog.current_setting('role', true), 'none'), session_user::text);
begin
  if tg_table_schema <> 'private' or tg_when <> 'AFTER' or tg_level <> 'ROW' then
    raise exception 'Unsupported private object audit context' using errcode = '55000';
  end if;
  if tg_table_name = 'private_object_reservations' and tg_op = 'INSERT' then
    event_auth := private.private_object_authenticated_subject();
    if event_auth is distinct from new.created_by_auth_user_id then
      raise exception 'Invalid private object actor' using errcode = '28000';
    end if;
    event_kind := 'user';
    event_account := new.account_id;
    event_profile := new.created_by_profile_id;
    event_type := 'private_object_reserved';
    object_type := 'private_object';
    safe_metadata := pg_catalog.jsonb_build_object('operation_source', 'reserve_private_object',
      'facility_id', new.facility_id, 'state', new.state, 'state_revision', new.state_revision,
      'expires_at', new.expires_at, 'declared_byte_size', new.declared_byte_size,
      'declared_media_type', new.declared_media_type);
  elsif tg_table_name = 'private_object_reservation_config' and tg_op in ('INSERT', 'UPDATE') then
    if tg_op = 'UPDATE' and new.revision = old.revision then return null; end if;
    if session_user not in ('postgres', 'supabase_admin') or request_role <> session_user::text then
      raise exception 'Untrusted private object configuration session' using errcode = '28000';
    end if;
    event_kind := 'system';
    event_system := 'database_privileged_operation';
    object_type := 'private_object_reservation_config';
    event_type := case tg_op when 'INSERT' then 'private_object_reservation_config_created'
      else 'private_object_reservation_config_updated' end;
    safe_metadata := pg_catalog.jsonb_build_object('operation_source', 'private_object_reservation_config',
      'before', case when tg_op = 'UPDATE' then pg_catalog.jsonb_build_object(
        'enabled', old.enabled, 'max_bytes', old.max_bytes,
        'reservation_ttl_seconds', old.reservation_ttl_seconds, 'revision', old.revision) else null end,
      'after', pg_catalog.jsonb_build_object('enabled', new.enabled, 'max_bytes', new.max_bytes,
        'reservation_ttl_seconds', new.reservation_ttl_seconds, 'revision', new.revision));
  else
    raise exception 'Unsupported private object audit relation' using errcode = '55000';
  end if;
  insert into public.audit_events (id, account_id, actor_user_profile_id, actor_kind,
    actor_auth_user_id, actor_system_key, object_type, object_id, event_type,
    event_metadata, occurred_at, correlation_id, is_internal_only, is_demo)
  values (pg_catalog.gen_random_uuid(), event_account, event_profile, event_kind,
    event_auth, event_system, object_type, new.id, event_type,
    safe_metadata || pg_catalog.jsonb_build_object('database_session_user', session_user::text,
      'database_request_role', request_role), pg_catalog.clock_timestamp(),
    pg_catalog.gen_random_uuid(), true, true);
  return null;
end;
$$;
create trigger private_object_reservations_audit
  after insert on private.private_object_reservations
  for each row execute function private.audit_private_object_reservation_change();
create trigger private_object_reservation_config_audit
  after insert or update on private.private_object_reservation_config
  for each row execute function private.audit_private_object_reservation_change();
insert into private.private_object_reservation_config (enabled) values (false);

create function private.reserve_private_object(
  p_account_id uuid, p_facility_id uuid, p_idempotency_key uuid,
  p_byte_size integer, p_media_type text
)
returns table (object_id uuid, state text, state_revision bigint, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  profile_id uuid;
  reservation private.private_object_reservations%rowtype;
  requested_identity jsonb;
begin
  profile_id := private.lock_private_object_ingest(p_account_id, p_facility_id);
  if profile_id is null then
    raise exception 'Private object reservation unavailable' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_byte_size is null or p_byte_size not between 1 and 65536
     or p_media_type is distinct from 'text/plain' then
    raise exception 'Invalid private object request' using errcode = '22023';
  end if;
  requested_identity := pg_catalog.jsonb_build_object('schema_version', 1,
    'account_id', p_account_id, 'facility_id', p_facility_id,
    'byte_size', p_byte_size, 'media_type', p_media_type);
  select * into reservation from private.private_object_reservations as existing
    where existing.account_id = p_account_id and existing.created_by_profile_id = profile_id
      and existing.idempotency_key = p_idempotency_key;
  if not found then
    insert into private.private_object_reservations
      (account_id, facility_id, idempotency_key, declared_byte_size, declared_media_type)
      values (p_account_id, p_facility_id, p_idempotency_key, p_byte_size, p_media_type)
      on conflict on constraint private_object_reservations_idempotency_unique do nothing
      returning * into reservation;
    if not found then
      -- ON CONFLICT waits for the winner; this new READ COMMITTED statement
      -- reads its immutable row. No duplicate AFTER INSERT audit is emitted.
      select * into strict reservation from private.private_object_reservations as existing
        where existing.account_id = p_account_id and existing.created_by_profile_id = profile_id
          and existing.idempotency_key = p_idempotency_key;
    end if;
  end if;
  if reservation.canonical_request is distinct from requested_identity then
    raise exception 'Private object idempotency conflict' using errcode = '23505';
  end if;
  return query select reservation.id,
    case when reservation.expires_at <= pg_catalog.clock_timestamp() then 'expired' else 'reserved' end,
    reservation.state_revision, reservation.expires_at;
end;
$$;

create function private.private_object_status(p_object_id uuid)
returns table (object_id uuid, state text, state_revision bigint, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  subject_id uuid := private.private_object_authenticated_subject();
  profile_id uuid;
  reservation private.private_object_reservations%rowtype;
begin
  -- No lock is required to discover this immutable row's authorization scope.
  select * into reservation from private.private_object_reservations where id = p_object_id;
  if found and reservation.created_by_auth_user_id = subject_id then
    profile_id := private.lock_private_object_ingest(reservation.account_id, reservation.facility_id);
    if profile_id = reservation.created_by_profile_id then
      return query select reservation.id,
        case when reservation.expires_at <= pg_catalog.clock_timestamp() then 'expired' else 'reserved' end,
        reservation.state_revision, reservation.expires_at;
      return;
    end if;
  end if;
  return query select null::uuid, 'not_found_or_unavailable'::text, null::bigint, null::timestamptz;
end;
$$;

create function public.reserve_private_object(
  p_account_id uuid, p_facility_id uuid, p_idempotency_key uuid,
  p_byte_size integer, p_media_type text
)
returns table (object_id uuid, state text, state_revision bigint, expires_at timestamptz)
language sql security invoker set search_path = '' as $$
  select * from private.reserve_private_object(p_account_id, p_facility_id, p_idempotency_key, p_byte_size, p_media_type)
$$;
create function public.private_object_status(p_object_id uuid)
returns table (object_id uuid, state text, state_revision bigint, expires_at timestamptz)
language sql security invoker set search_path = '' as $$
  select * from private.private_object_status(p_object_id)
$$;

revoke all on function private.private_object_authenticated_subject(),
  private.lock_private_object_ingest(uuid, uuid), private.prepare_private_object_reservation(),
  private.guard_private_object_reservation_history(), private.guard_private_object_reservation_config(),
  private.audit_private_object_reservation_change(),
  private.reserve_private_object(uuid, uuid, uuid, integer, text), private.private_object_status(uuid),
  public.reserve_private_object(uuid, uuid, uuid, integer, text), public.private_object_status(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.reserve_private_object(uuid, uuid, uuid, integer, text),
  private.private_object_status(uuid), public.reserve_private_object(uuid, uuid, uuid, integer, text),
  public.private_object_status(uuid) to authenticated;

comment on table private.private_object_reservations is
  'Immutable synthetic metadata reservations only; no uploaded bytes or finalized evidence. Expiry is operational, never deletion authority. No direct client/service-role access.';
comment on table private.private_object_reservation_config is
  'Trusted owner-only synthetic reservation controls, disabled initially. Bounds are engineering fixture limits, not approved live formats, retention or commitments. Meaningful changes are audited.';
comment on table public.account_capability_grants is
  'Explicit synthetic directory grants and exact-facility ingest reservation grants; active identity/membership still required. No file reading, release or business authority.';

commit;
