begin;

create table public.client_accounts (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  is_demo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint client_accounts_display_name_not_blank
    check (char_length(btrim(display_name)) between 1 and 200)
);

create table public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  display_name text not null,
  is_demo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint user_profiles_display_name_not_blank
    check (char_length(btrim(display_name)) between 1 and 200)
);

create table public.account_memberships (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  user_profile_id uuid not null,
  role_key text not null,
  is_demo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint account_memberships_account_fk
    foreign key (account_id)
    references public.client_accounts (id),

  constraint account_memberships_user_profile_fk
    foreign key (user_profile_id)
    references public.user_profiles (id),

  constraint account_memberships_role_key_allowed
    check (
      role_key in (
        'system_admin',
        'intake_admin',
        'document_controller',
        'site_champion',
        'project_requester',
        'document_viewer',
        'removed_suspended'
      )
    ),

  constraint account_memberships_unique_assignment
    unique (account_id, user_profile_id, role_key)
);

create table public.facilities (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  display_name text not null,
  is_demo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint facilities_account_fk
    foreign key (account_id)
    references public.client_accounts (id),

  constraint facilities_display_name_not_blank
    check (char_length(btrim(display_name)) between 1 and 200),

  constraint facilities_id_account_unique
    unique (id, account_id)
);

create table public.incident_requests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  facility_id uuid,
  submitted_by_profile_id uuid,
  title text not null,
  request_status text not null default 'draft',
  is_demo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint incident_requests_account_fk
    foreign key (account_id)
    references public.client_accounts (id),

  constraint incident_requests_facility_account_fk
    foreign key (facility_id, account_id)
    references public.facilities (id, account_id),

  constraint incident_requests_submitter_fk
    foreign key (submitted_by_profile_id)
    references public.user_profiles (id),

  constraint incident_requests_title_not_blank
    check (char_length(btrim(title)) between 1 and 250),

  constraint incident_requests_status_not_blank
    check (char_length(btrim(request_status)) between 1 and 100),

  constraint incident_requests_id_account_unique
    unique (id, account_id)
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  facility_id uuid,
  incident_request_id uuid,
  title text not null,
  document_class text not null,
  version_label text not null default 'v1',
  release_state text not null default 'uploaded_unclassified',
  is_internal_only boolean not null default true,
  is_demo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint documents_account_fk
    foreign key (account_id)
    references public.client_accounts (id),

  constraint documents_facility_account_fk
    foreign key (facility_id, account_id)
    references public.facilities (id, account_id),

  constraint documents_request_account_fk
    foreign key (incident_request_id, account_id)
    references public.incident_requests (id, account_id),

  constraint documents_title_not_blank
    check (char_length(btrim(title)) between 1 and 250),

  constraint documents_class_not_blank
    check (char_length(btrim(document_class)) between 1 and 100),

  constraint documents_version_not_blank
    check (char_length(btrim(version_label)) between 1 and 100),

  constraint documents_release_state_not_blank
    check (char_length(btrim(release_state)) between 1 and 100),

  constraint documents_id_account_unique
    unique (id, account_id)
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  actor_user_profile_id uuid,
  object_type text not null,
  object_id uuid,
  event_type text not null,
  event_metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  is_internal_only boolean not null default true,
  is_demo boolean not null default true,

  constraint audit_events_account_fk
    foreign key (account_id)
    references public.client_accounts (id),

  constraint audit_events_actor_fk
    foreign key (actor_user_profile_id)
    references public.user_profiles (id),

  constraint audit_events_object_type_not_blank
    check (char_length(btrim(object_type)) between 1 and 100),

  constraint audit_events_event_type_not_blank
    check (char_length(btrim(event_type)) between 1 and 150)
);

create index account_memberships_account_idx
  on public.account_memberships (account_id);

create index account_memberships_user_profile_idx
  on public.account_memberships (user_profile_id);

create index facilities_account_idx
  on public.facilities (account_id);

create index incident_requests_account_idx
  on public.incident_requests (account_id);

create index incident_requests_facility_idx
  on public.incident_requests (facility_id);

create index incident_requests_status_idx
  on public.incident_requests (request_status);

create index documents_account_idx
  on public.documents (account_id);

create index documents_facility_idx
  on public.documents (facility_id);

create index documents_incident_request_idx
  on public.documents (incident_request_id);

create index documents_release_state_idx
  on public.documents (release_state);

create index audit_events_account_idx
  on public.audit_events (account_id);

create index audit_events_actor_idx
  on public.audit_events (actor_user_profile_id);

create index audit_events_object_idx
  on public.audit_events (object_type, object_id);

alter table public.client_accounts enable row level security;
alter table public.user_profiles enable row level security;
alter table public.account_memberships enable row level security;
alter table public.facilities enable row level security;
alter table public.incident_requests enable row level security;
alter table public.documents enable row level security;
alter table public.audit_events enable row level security;

comment on table public.client_accounts is
  'Dev-only candidate Client Account records. Fake/demo data only.';

comment on table public.user_profiles is
  'Dev-only candidate user profiles. Auth setup is deferred.';

comment on table public.account_memberships is
  'Dev-only account membership and static test-role assignments.';

comment on table public.facilities is
  'Dev-only candidate Asset/Facility records. Fake/demo data only.';

comment on table public.incident_requests is
  'Dev-only candidate Incident and Project Request records.';

comment on table public.documents is
  'Dev-only document metadata. Storage and client release remain deferred.';

comment on table public.audit_events is
  'Dev-only internal audit events. Client visibility remains deferred.';

commit;