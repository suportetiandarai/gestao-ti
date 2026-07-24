-- Sincronização GLPI independente de navegador via Supabase Cron + pg_net.
-- Requer os secrets gestao_ti_project_url e gestao_ti_service_role_key no Vault.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

alter table public.glpi_sync_state
  add column if not exists last_duration_ms bigint,
  add column if not exists last_records_changed integer not null default 0,
  add column if not exists sync_origin text,
  add column if not exists next_run_at timestamptz,
  add column if not exists scheduler_interval_seconds integer,
  add column if not exists last_scheduler_request_id bigint;

create or replace function private.invoke_glpi_scheduled_sync(expected_interval_seconds integer default 30)
returns bigint
language plpgsql
security definer
set search_path = private, public, vault, extensions, net, pg_temp
as $$
declare
  project_url text;
  service_role_key text;
  request_id bigint;
  interval_seconds integer := greatest(30, least(expected_interval_seconds, 60));
begin
  select decrypted_secret into project_url
  from vault.decrypted_secrets
  where name = 'gestao_ti_project_url'
  order by created_at desc
  limit 1;

  select decrypted_secret into service_role_key
  from vault.decrypted_secrets
  where name = 'gestao_ti_service_role_key'
  order by created_at desc
  limit 1;

  if nullif(project_url, '') is null or nullif(service_role_key, '') is null then
    update public.glpi_sync_state
    set status = 'offline',
        last_error_at = now(),
        last_error = 'Agendamento GLPI sem credenciais no Vault.',
        sync_origin = 'supabase_cron',
        scheduler_interval_seconds = interval_seconds,
        next_run_at = now() + make_interval(secs => interval_seconds),
        updated_at = now()
    where id = 1;
    return null;
  end if;

  select net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/glpi-dashboard',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', service_role_key,
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object(
      'action', 'sync-incremental',
      'origin', 'supabase_cron',
      'expectedIntervalSeconds', interval_seconds
    ),
    timeout_milliseconds := 25000
  ) into request_id;

  update public.glpi_sync_state
  set sync_origin = 'supabase_cron',
      scheduler_interval_seconds = interval_seconds,
      next_run_at = now() + make_interval(secs => interval_seconds),
      last_scheduler_request_id = request_id,
      updated_at = now()
  where id = 1;

  return request_id;
end;
$$;

revoke all on function private.invoke_glpi_scheduled_sync(integer)
from public, anon, authenticated;

do $$
begin
  begin
    perform cron.schedule(
      'gestao-ti-glpi-sync',
      '30 seconds',
      'select private.invoke_glpi_scheduled_sync(30)'
    );
    update public.glpi_sync_state
    set scheduler_interval_seconds = 30,
        next_run_at = now() + interval '30 seconds',
        updated_at = now()
    where id = 1;
  exception when others then
    perform cron.schedule(
      'gestao-ti-glpi-sync',
      '* * * * *',
      'select private.invoke_glpi_scheduled_sync(60)'
    );
    update public.glpi_sync_state
    set scheduler_interval_seconds = 60,
        next_run_at = date_trunc('minute', now()) + interval '1 minute',
        updated_at = now()
    where id = 1;
  end;
end;
$$;

comment on function private.invoke_glpi_scheduled_sync(integer) is
  'Invoca a sincronização incremental GLPI pelo Supabase Cron; não é acessível pelos papéis do navegador.';
