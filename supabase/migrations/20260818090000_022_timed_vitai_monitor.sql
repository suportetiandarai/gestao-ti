create table public.system_monitors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  url text not null,
  current_status text not null default 'unknown'
    check (current_status in ('unknown','online','offline')),
  first_failure_at timestamptz,
  first_recovery_at timestamptz,
  offline_since timestamptz,
  last_check_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_recovered_at timestamptz,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  consecutive_successes integer not null default 0 check (consecutive_successes >= 0),
  failure_threshold integer not null default 3 check (failure_threshold between 2 and 10),
  recovery_threshold integer not null default 2 check (recovery_threshold between 1 and 10),
  check_interval_seconds integer not null default 60 check (check_interval_seconds >= 60),
  last_http_status integer,
  last_response_time_ms integer check (last_response_time_ms is null or last_response_time_ms >= 0),
  last_error text,
  enabled boolean not null default true,
  lock_execution_id uuid,
  lock_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.system_downtimes (
  id uuid primary key default gen_random_uuid(),
  monitor_id uuid not null references public.system_monitors(id) on delete restrict,
  down_at timestamptz not null,
  recovered_at timestamptz,
  duration_seconds bigint check (duration_seconds is null or duration_seconds >= 0),
  status text not null default 'open' check (status in ('open','closed')),
  failure_reason text,
  initial_http_status integer,
  final_http_status integer,
  sheet_synced boolean not null default false,
  sheet_row integer,
  sheet_synced_at timestamptz,
  sheet_sync_attempts integer not null default 0 check (sheet_sync_attempts >= 0),
  sheet_last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index system_downtimes_one_open_uidx
  on public.system_downtimes(monitor_id) where status='open';
create index system_downtimes_monitor_down_idx
  on public.system_downtimes(monitor_id,down_at desc);
create index system_downtimes_sheet_retry_idx
  on public.system_downtimes(sheet_synced,updated_at)
  where status='closed' and sheet_synced=false;

create trigger system_monitors_set_updated_at before update on public.system_monitors
for each row execute function private.set_updated_at();
create trigger system_downtimes_set_updated_at before update on public.system_downtimes
for each row execute function private.set_updated_at();

insert into public.system_monitors(
  name,url,current_status,failure_threshold,recovery_threshold,check_interval_seconds
) values (
  'TIMED',
  'https://hmandarai.vitai.care/vitai/pages/painel.do',
  'unknown',3,2,60
) on conflict (name) do update set
  url=excluded.url,
  failure_threshold=excluded.failure_threshold,
  recovery_threshold=excluded.recovery_threshold,
  check_interval_seconds=excluded.check_interval_seconds,
  enabled=true;

alter table public.system_monitors enable row level security;
alter table public.system_downtimes enable row level security;
revoke all on public.system_monitors from anon,authenticated;
revoke all on public.system_downtimes from anon,authenticated;
grant select on public.system_monitors to authenticated;
grant select on public.system_downtimes to authenticated;
grant all on public.system_monitors to service_role;
grant all on public.system_downtimes to service_role;

create policy system_monitors_authenticated_read on public.system_monitors
  for select to authenticated using (true);
create policy system_downtimes_authenticated_read on public.system_downtimes
  for select to authenticated using (true);

create or replace function public.acquire_system_monitor_lock(
  p_monitor_name text,
  p_execution_id uuid,
  p_lock_seconds integer default 55
) returns boolean
language plpgsql security definer
set search_path=public,pg_temp as $$
declare acquired boolean;
begin
  update public.system_monitors
     set lock_execution_id=p_execution_id,
         lock_expires_at=now()+make_interval(secs=>greatest(30,least(p_lock_seconds,120)))
   where name=p_monitor_name
     and enabled=true
     and (lock_expires_at is null or lock_expires_at < now() or lock_execution_id=p_execution_id)
  returning true into acquired;
  return coalesce(acquired,false);
end; $$;

create or replace function public.release_system_monitor_lock(
  p_monitor_name text,
  p_execution_id uuid
) returns boolean
language plpgsql security definer
set search_path=public,pg_temp as $$
declare released boolean;
begin
  update public.system_monitors
     set lock_execution_id=null,lock_expires_at=null
   where name=p_monitor_name and lock_execution_id=p_execution_id
  returning true into released;
  return coalesce(released,false);
end; $$;

create or replace function public.record_system_monitor_check(
  p_monitor_name text,
  p_execution_id uuid,
  p_checked_at timestamptz,
  p_is_success boolean,
  p_http_status integer,
  p_response_time_ms integer,
  p_error text default null
) returns jsonb
language plpgsql security definer
set search_path=public,pg_temp as $$
declare
  monitor public.system_monitors%rowtype;
  failures integer;
  successes integer;
  failure_started timestamptz;
  recovery_started timestamptz;
  downtime_id uuid;
  action text := 'none';
begin
  select * into monitor from public.system_monitors
   where name=p_monitor_name for update;
  if not found then raise exception 'Monitor não encontrado.'; end if;
  if monitor.lock_execution_id is distinct from p_execution_id then
    raise exception 'Execução não possui o lock do monitor.';
  end if;

  if p_is_success then
    successes := monitor.consecutive_successes + 1;
    recovery_started := coalesce(monitor.first_recovery_at,p_checked_at);
    if monitor.current_status='offline' and successes >= monitor.recovery_threshold then
      update public.system_downtimes
         set recovered_at=recovery_started,
             duration_seconds=greatest(0,extract(epoch from recovery_started-down_at)::bigint),
             status='closed',
             final_http_status=p_http_status,
             updated_at=now()
       where monitor_id=monitor.id and status='open'
       returning id into downtime_id;
      update public.system_monitors set
        current_status='online',first_failure_at=null,first_recovery_at=null,
        offline_since=null,last_check_at=p_checked_at,last_success_at=p_checked_at,
        last_recovered_at=recovery_started,consecutive_failures=0,consecutive_successes=0,
        last_http_status=p_http_status,last_response_time_ms=p_response_time_ms,last_error=null
       where id=monitor.id;
      action := 'recovered';
    else
      update public.system_monitors set
        current_status=case when current_status='unknown' then 'online' else current_status end,
        first_failure_at=null,
        first_recovery_at=case when current_status='offline' then recovery_started else null end,
        last_check_at=p_checked_at,last_success_at=p_checked_at,
        consecutive_failures=0,
        consecutive_successes=case when current_status='offline' then successes else 0 end,
        last_http_status=p_http_status,last_response_time_ms=p_response_time_ms,last_error=null
       where id=monitor.id;
      action := case when monitor.current_status='offline' then 'recovery_pending' else 'online' end;
    end if;
  else
    failures := monitor.consecutive_failures + 1;
    failure_started := coalesce(monitor.first_failure_at,p_checked_at);
    if monitor.current_status<>'offline' and failures >= monitor.failure_threshold then
      insert into public.system_downtimes(
        monitor_id,down_at,status,failure_reason,initial_http_status
      ) values (
        monitor.id,failure_started,'open',left(nullif(p_error,''),300),p_http_status
      ) on conflict (monitor_id) where status='open' do update set
        failure_reason=coalesce(public.system_downtimes.failure_reason,excluded.failure_reason)
      returning id into downtime_id;
      update public.system_monitors set
        current_status='offline',first_failure_at=failure_started,first_recovery_at=null,
        offline_since=failure_started,last_check_at=p_checked_at,last_failure_at=p_checked_at,
        consecutive_failures=failures,consecutive_successes=0,last_http_status=p_http_status,
        last_response_time_ms=p_response_time_ms,last_error=left(nullif(p_error,''),300)
       where id=monitor.id;
      action := 'offline_confirmed';
    else
      update public.system_monitors set
        first_failure_at=case when current_status='offline' then first_failure_at else failure_started end,
        first_recovery_at=null,last_check_at=p_checked_at,last_failure_at=p_checked_at,
        consecutive_failures=failures,consecutive_successes=0,last_http_status=p_http_status,
        last_response_time_ms=p_response_time_ms,last_error=left(nullif(p_error,''),300)
       where id=monitor.id;
      action := case when monitor.current_status='offline' then 'offline' else 'failure_pending' end;
    end if;
  end if;

  return jsonb_build_object(
    'monitor_id',monitor.id,'action',action,'downtime_id',downtime_id,
    'failures',case when p_is_success then 0 else failures end,
    'successes',case when p_is_success then successes else 0 end
  );
end; $$;

revoke all on function public.acquire_system_monitor_lock(text,uuid,integer) from public,anon,authenticated;
revoke all on function public.release_system_monitor_lock(text,uuid) from public,anon,authenticated;
revoke all on function public.record_system_monitor_check(text,uuid,timestamptz,boolean,integer,integer,text)
  from public,anon,authenticated;
grant execute on function public.acquire_system_monitor_lock(text,uuid,integer) to service_role;
grant execute on function public.release_system_monitor_lock(text,uuid) to service_role;
grant execute on function public.record_system_monitor_check(text,uuid,timestamptz,boolean,integer,integer,text)
  to service_role;

create or replace function private.invoke_timed_monitor()
returns bigint language plpgsql security definer
set search_path=private,public,vault,extensions,net,pg_temp as $$
declare project_url text; service_key text; request_id bigint;
begin
  select decrypted_secret into project_url from vault.decrypted_secrets
   where name='gestao_ti_project_url' order by created_at desc limit 1;
  select decrypted_secret into service_key from vault.decrypted_secrets
   where name='gestao_ti_service_role_key' order by created_at desc limit 1;
  if nullif(project_url,'') is null or nullif(service_key,'') is null then return null; end if;
  select net.http_post(
    url:=rtrim(project_url,'/')||'/functions/v1/timed-monitor',
    headers:=jsonb_build_object(
      'Content-Type','application/json','Authorization','Bearer '||service_key
    ),
    body:='{"origin":"supabase_cron"}'::jsonb,
    timeout_milliseconds:=50000
  ) into request_id;
  return request_id;
end; $$;
revoke all on function private.invoke_timed_monitor() from public,anon,authenticated;

do $$ declare job record; begin
  for job in select jobid from cron.job where jobname='gestao-ti-timed-monitor'
  loop perform cron.unschedule(job.jobid); end loop;
  perform cron.schedule(
    'gestao-ti-timed-monitor','* * * * *','select private.invoke_timed_monitor()'
  );
end $$;

notify pgrst,'reload schema';
