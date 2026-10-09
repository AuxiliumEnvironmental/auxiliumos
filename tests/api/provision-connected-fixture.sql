-- Authorized development fixture only. Execute as the trusted database operator
-- in auxiliumos-dev (txofqxictwecgcnvezlb), never in Moldo or production.
-- No existing context, document revision, grant, byte or history is overwritten.
begin;
do $$
declare
  v_account_id constant uuid := '8f161092-30f1-4e67-83c6-000000000001';
  v_facility_id constant uuid := '8f161092-30f1-4e67-83c6-000000000301';
  v_document_id constant uuid := '8f161092-30f1-4e67-83c6-000000000501';
begin
  perform pg_catalog.pg_advisory_xact_lock(827109,501);
  insert into public.client_accounts(id,display_name,is_demo)
    values(v_account_id,'Connected workflow synthetic development',true) on conflict(id) do nothing;
  if not exists(select 1 from public.client_accounts a where a.id=v_account_id
    and a.display_name='Connected workflow synthetic development' and a.is_demo) then
    raise exception 'Connected fixture account mismatch';
  end if;
  insert into public.facilities(id,account_id,display_name,is_demo)
    values(v_facility_id,v_account_id,'Synthetic connected facility',true) on conflict(id) do nothing;
  if not exists(select 1 from public.facilities f where f.id=v_facility_id and f.account_id=v_account_id
    and f.display_name='Synthetic connected facility' and f.is_demo) then
    raise exception 'Connected fixture facility mismatch';
  end if;
  insert into public.documents(id,account_id,facility_id,title,document_class,is_internal_only,is_demo)
    values(v_document_id,v_account_id,v_facility_id,'Synthetic version API fixture '||v_document_id,
      'internal_note',true,true) on conflict(id) do nothing;
  if not exists(select 1 from public.documents d where d.id=v_document_id and d.account_id=v_account_id
    and d.facility_id=v_facility_id and d.title='Synthetic version API fixture '||v_document_id
    and d.document_class='internal_note' and d.is_internal_only and d.is_demo
    and d.incident_request_id is null and d.release_state='uploaded_unclassified') then
    raise exception 'Connected fixture document mismatch';
  end if;
end $$;
commit;
-- Use this observed revision for the next protected run. Never reset it.
select d.id as document_id,coalesce(h.document_revision,0) as document_revision,
  d.account_id,d.facility_id,d.is_demo,d.is_internal_only,d.release_state
from public.documents d left join private.document_version_heads h on h.document_id=d.id
where d.id='8f161092-30f1-4e67-83c6-000000000501';
