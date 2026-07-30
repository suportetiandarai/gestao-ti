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
     and (
       requested_at >= p_cutoff_at
       or (
         p_source='timed'
         and requested_at < p_cutoff_at
         and dashboard_status='pending'
       )
     )
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
