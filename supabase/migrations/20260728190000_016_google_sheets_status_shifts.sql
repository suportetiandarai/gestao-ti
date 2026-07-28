alter table public.google_sheet_requests
  add column if not exists normalized_status text not null default '',
  add column if not exists status_updated_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists hidden_after_shift timestamptz,
  add column if not exists is_source_present boolean not null default true;

alter table public.google_sheet_requests
  drop constraint if exists google_sheet_requests_dashboard_status_check;
alter table public.google_sheet_requests
  add constraint google_sheet_requests_dashboard_status_check check (
    dashboard_status in (
      'completed','pending','not_completed','scheduled','not_scheduled',
      'already_exists','no_contact','duplicate','other'
    )
  );

create index if not exists google_sheet_requests_operational_idx
  on public.google_sheet_requests(source, is_source_present, hidden_after_shift, sort_priority, requested_at desc);

create or replace function public.mark_missing_google_sheet_requests(
  p_source text,
  p_sync_marker uuid,
  p_cutoff_at timestamptz
) returns integer
language plpgsql security definer
set search_path=public,pg_temp as $$
declare affected integer;
begin
  update public.google_sheet_requests
     set is_source_present=false,
         updated_at=now()
   where source=p_source
     and requested_at >= p_cutoff_at
     and sync_marker <> p_sync_marker
     and is_source_present=true;
  get diagnostics affected = row_count;
  return affected;
end; $$;

revoke all on function public.mark_missing_google_sheet_requests(text,uuid,timestamptz)
  from public,anon,authenticated;
grant execute on function public.mark_missing_google_sheet_requests(text,uuid,timestamptz)
  to service_role;

notify pgrst,'reload schema';
