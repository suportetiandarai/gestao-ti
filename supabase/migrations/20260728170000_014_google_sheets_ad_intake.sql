alter table public.google_sheet_requests
  drop constraint if exists google_sheet_requests_source_check;
alter table public.google_sheet_requests
  add constraint google_sheet_requests_source_check
  check (source in ('timed','training','ad'));

alter table public.google_sheet_sync_state
  drop constraint if exists google_sheet_sync_state_source_check;
alter table public.google_sheet_sync_state
  add constraint google_sheet_sync_state_source_check
  check (source in ('timed','training','ad'));

alter table public.google_sheet_sync_logs
  drop constraint if exists google_sheet_sync_logs_source_check;
alter table public.google_sheet_sync_logs
  add constraint google_sheet_sync_logs_source_check
  check (source in ('timed','training','ad'));

alter table public.google_sheet_dashboard_snapshots
  drop constraint if exists google_sheet_dashboard_snapshots_source_check;
alter table public.google_sheet_dashboard_snapshots
  add constraint google_sheet_dashboard_snapshots_source_check
  check (source in ('timed','training','ad'));

insert into public.google_sheet_sync_state(source)
values ('ad')
on conflict (source) do nothing;

notify pgrst,'reload schema';
