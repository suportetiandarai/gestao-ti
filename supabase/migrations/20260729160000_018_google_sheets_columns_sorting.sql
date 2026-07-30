alter table public.google_sheet_requests
  add column if not exists scheduled_at timestamptz,
  add column if not exists sort_key bigint not null default 0;

alter table public.google_sheet_requests
  drop constraint if exists google_sheet_requests_dashboard_status_check;
alter table public.google_sheet_requests
  add constraint google_sheet_requests_dashboard_status_check check (
    dashboard_status in (
      'completed','pending','not_completed','scheduled','not_scheduled',
      'already_exists','no_contact','duplicate','other','withdrawal'
    )
  );

update public.google_sheet_requests
set
  sort_priority = case
    when source = 'training' then case dashboard_status
      when 'not_scheduled' then 1
      when 'pending' then 1
      when 'no_contact' then 2
      when 'duplicate' then 3
      when 'other' then 4
      when 'withdrawal' then 5
      when 'scheduled' then 6
      when 'completed' then 7
      else 5
    end
    when dashboard_status = 'not_completed' then 1
    when dashboard_status = 'pending' then 2
    else 3
  end,
  sort_key = case
    when dashboard_status in ('completed','already_exists')
      then -(extract(epoch from coalesce(completed_at,requested_at)) * 1000)::bigint
    else (extract(epoch from requested_at) * 1000)::bigint
  end;

drop index if exists public.google_sheet_requests_operational_idx;
create index google_sheet_requests_operational_idx
  on public.google_sheet_requests(
    source,
    is_source_present,
    hidden_after_shift,
    sort_priority,
    sort_key,
    source_row
  );

comment on column public.google_sheet_requests.scheduled_at is
  'Data e hora do agendamento, lida da coluna M da planilha de treinamento.';
comment on column public.google_sheet_requests.sort_key is
  'Chave numérica para ordenação operacional estável e paginada.';

notify pgrst,'reload schema';
