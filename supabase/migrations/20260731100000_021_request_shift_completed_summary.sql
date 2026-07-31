update public.google_sheet_requests
set
  completed_at = status_updated_at,
  hidden_after_shift = (
    select shift_end from public.get_current_shift(status_updated_at)
  )
where dashboard_status = 'completed'
  and completed_at is null
  and status_updated_at is not null;

update public.google_sheet_requests
set sort_key = case
  when dashboard_status in ('completed','already_exists')
    then -(extract(epoch from coalesce(completed_at,requested_at)) * 1000)::bigint
  when source = 'training'
    then (extract(epoch from coalesce(scheduled_at,requested_at)) * 1000)::bigint
  else (extract(epoch from requested_at) * 1000)::bigint
end;

create or replace function public.get_google_sheet_dashboard_summary(
  p_source text,
  p_now timestamptz default now()
) returns table(
  total_count bigint,
  completed_count bigint,
  pending_count bigint,
  not_started_count bigint
)
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  with local_clock as (
    select p_now at time zone 'America/Sao_Paulo' as local_now
  ), shift_bounds as (
    select case
      when local_now::time >= time '07:00' and local_now::time < time '19:00'
        then local_now::date + time '07:00'
      when local_now::time >= time '19:00'
        then local_now::date + time '19:00'
      else (local_now::date - 1) + time '19:00'
    end as local_start
    from local_clock
  ), bounds as (
    select
      local_start at time zone 'America/Sao_Paulo' as shift_start,
      (local_start + interval '12 hours') at time zone 'America/Sao_Paulo' as shift_end
    from shift_bounds
  )
  select
    count(*) filter (
      where request.hidden_after_shift is null or request.hidden_after_shift > p_now
    ) as total_count,
    count(*) filter (
      where request.dashboard_status='completed'
        and request.completed_at >= bounds.shift_start
        and request.completed_at < bounds.shift_end
    ) as completed_count,
    count(*) filter (
      where (request.hidden_after_shift is null or request.hidden_after_shift > p_now)
        and case
          when p_source='training' then request.dashboard_status='scheduled'
          else request.dashboard_status='pending'
        end
    ) as pending_count,
    count(*) filter (
      where (request.hidden_after_shift is null or request.hidden_after_shift > p_now)
        and case
          when p_source='training' then request.dashboard_status in (
            'not_scheduled','pending','no_contact','duplicate','other'
          )
          else request.dashboard_status='not_completed'
        end
    ) as not_started_count
  from public.google_sheet_requests request
  cross join bounds
  where request.source=p_source
    and request.is_source_present=true;
$$;

revoke all on function public.get_google_sheet_dashboard_summary(text,timestamptz)
  from public,anon,authenticated;
grant execute on function public.get_google_sheet_dashboard_summary(text,timestamptz)
  to service_role;

notify pgrst,'reload schema';
