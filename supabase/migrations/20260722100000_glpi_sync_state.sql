-- Estado e lock atômico da sincronização incremental GLPI.
create table if not exists public.glpi_sync_state (
  id smallint primary key default 1 check (id = 1),
  status text not null default 'offline' check (status in ('online', 'delayed', 'offline', 'syncing')),
  locked_until timestamptz,
  last_started_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_cursor timestamptz,
  last_records_processed integer not null default 0,
  last_error text,
  updated_at timestamptz not null default now()
);

insert into public.glpi_sync_state (id)
values (1)
on conflict (id) do nothing;

alter table public.glpi_sync_state enable row level security;
grant select on public.glpi_sync_state to authenticated;
revoke all on public.glpi_sync_state from anon;

drop policy if exists glpi_sync_state_read on public.glpi_sync_state;
create policy glpi_sync_state_read
on public.glpi_sync_state for select to authenticated
using ((select private.is_dashboard_reader()));

create or replace function public.acquire_glpi_sync_lock(lock_seconds integer default 120)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acquired boolean;
begin
  update public.glpi_sync_state
  set locked_until = now() + make_interval(secs => greatest(30, least(lock_seconds, 600))),
      last_started_at = now(),
      status = 'syncing',
      updated_at = now()
  where id = 1
    and (locked_until is null or locked_until < now());

  acquired := found;
  return acquired;
end;
$$;

revoke all on function public.acquire_glpi_sync_lock(integer) from public, anon, authenticated;
grant execute on function public.acquire_glpi_sync_lock(integer) to service_role;

comment on table public.glpi_sync_state is
  'Linha única com cursor, saúde e lock da sincronização incremental GLPI.';
