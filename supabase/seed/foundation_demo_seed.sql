begin;

insert into public.client_accounts (
  id,
  display_name,
  is_demo
)
values (
  '00000000-0000-4000-8000-000000000001',
  'Demo Property Group',
  true
)
on conflict (id) do nothing;

insert into public.user_profiles (
  id,
  auth_user_id,
  display_name,
  is_demo
)
values
  (
    '00000000-0000-4000-8000-000000000101',
    null,
    'System Admin Demo',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    null,
    'Intake Admin Demo',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000103',
    null,
    'Document Controller Demo',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000104',
    null,
    'Site Champion Demo',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000105',
    null,
    'Project Requester Demo',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000106',
    null,
    'Document Viewer Demo',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000107',
    null,
    'Removed User Demo',
    true
  )
on conflict (id) do nothing;

insert into public.account_memberships (
  id,
  account_id,
  user_profile_id,
  role_key,
  is_demo
)
values
  (
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000101',
    'system_admin',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000102',
    'intake_admin',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000203',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000103',
    'document_controller',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000204',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000104',
    'site_champion',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000205',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000105',
    'project_requester',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000206',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000106',
    'document_viewer',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000207',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000107',
    'removed_suspended',
    true
  )
on conflict (id) do nothing;

insert into public.facilities (
  id,
  account_id,
  display_name,
  is_demo
)
values (
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000001',
  'North Wing Facility',
  true
)
on conflict (id) do nothing;

insert into public.incident_requests (
  id,
  account_id,
  facility_id,
  submitted_by_profile_id,
  title,
  request_status,
  is_demo
)
values (
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000105',
  'Water Intrusion Demo',
  'draft',
  true
)
on conflict (id) do nothing;

insert into public.documents (
  id,
  account_id,
  facility_id,
  incident_request_id,
  title,
  document_class,
  version_label,
  release_state,
  is_internal_only,
  is_demo
)
values
  (
    '00000000-0000-4000-8000-000000000501',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000401',
    'Document Placeholder 001',
    'internal_note',
    'v1',
    'internal_draft',
    true,
    true
  ),
  (
    '00000000-0000-4000-8000-000000000502',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000401',
    'Client Upload Placeholder',
    'client_upload',
    'v1',
    'uploaded_unclassified',
    true,
    true
  )
on conflict (id) do nothing;

insert into public.audit_events (
  id,
  account_id,
  actor_user_profile_id,
  object_type,
  object_id,
  event_type,
  event_metadata,
  is_internal_only,
  is_demo
)
values
  (
    '00000000-0000-4000-8000-000000000601',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000105',
    'incident_request',
    '00000000-0000-4000-8000-000000000401',
    'request_created',
    '{"source":"foundation_demo_seed"}'::jsonb,
    true,
    true
  ),
  (
    '00000000-0000-4000-8000-000000000602',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000103',
    'document',
    '00000000-0000-4000-8000-000000000501',
    'document_uploaded',
    '{"source":"foundation_demo_seed"}'::jsonb,
    true,
    true
  )
on conflict (id) do nothing;

commit;