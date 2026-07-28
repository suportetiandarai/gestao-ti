create table public.glpi_sync_state (
  id uuid primary key default gen_random_uuid(),
  sync_name text not null unique,
  status text not null default 'idle' check (status in ('idle','running','success','error')),
  last_attempt_at timestamptz, last_success_at timestamptz, last_error_at timestamptz,
  last_error_message text, last_cursor timestamptz,
  locked_at timestamptz, lock_expires_at timestamptz, execution_id uuid,
  records_processed integer not null default 0, records_inserted integer not null default 0,
  records_updated integer not null default 0, duration_ms bigint,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.glpi_sync_state(sync_name) values ('glpi_incremental');

create table public.glpi_sync_logs (
  id bigint generated always as identity primary key,
  execution_id uuid not null, started_at timestamptz not null, finished_at timestamptz,
  status text not null check (status in ('running','success','error','skipped')),
  records_requested integer not null default 0, records_processed integer not null default 0,
  records_inserted integer not null default 0, records_updated integer not null default 0,
  error_code text, error_message text, duration_ms bigint,
  created_at timestamptz not null default now()
);

create or replace function public.acquire_glpi_sync_lock(
  p_sync_name text default 'glpi_incremental',
  p_lock_seconds integer default 120
) returns uuid language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_execution uuid := gen_random_uuid();
begin
  update public.glpi_sync_state
  set status='running', last_attempt_at=now(), locked_at=now(),
      lock_expires_at=now()+make_interval(secs => greatest(30, least(p_lock_seconds, 600))),
      execution_id=v_execution, updated_at=now()
  where sync_name=p_sync_name
    and (status <> 'running' or lock_expires_at is null or lock_expires_at < now());
  if not found then return null; end if;
  return v_execution;
end; $$;

create or replace function public.finish_glpi_sync(
  p_execution_id uuid, p_success boolean, p_cursor timestamptz,
  p_processed integer, p_inserted integer, p_updated integer,
  p_duration_ms bigint, p_error text default null
) returns boolean language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  update public.glpi_sync_state
  set status=case when p_success then 'success' else 'error' end,
      last_success_at=case when p_success then now() else last_success_at end,
      last_error_at=case when p_success then null else now() end,
      last_error_message=case when p_success then null else left(p_error,500) end,
      last_cursor=case when p_success then p_cursor else last_cursor end,
      records_processed=p_processed, records_inserted=p_inserted, records_updated=p_updated,
      duration_ms=p_duration_ms, locked_at=null, lock_expires_at=null, execution_id=null, updated_at=now()
  where execution_id=p_execution_id;
  return found;
end; $$;

revoke all on function public.acquire_glpi_sync_lock(text,integer) from public,anon,authenticated;
revoke all on function public.finish_glpi_sync(uuid,boolean,timestamptz,integer,integer,integer,bigint,text) from public,anon,authenticated;
grant execute on function public.acquire_glpi_sync_lock(text,integer) to service_role;
grant execute on function public.finish_glpi_sync(uuid,boolean,timestamptz,integer,integer,integer,bigint,text) to service_role;
