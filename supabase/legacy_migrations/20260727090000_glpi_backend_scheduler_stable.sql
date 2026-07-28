-- Sincronização GLPI centralizada no back-end.
-- O pg_cron suporta agendamento seguro por minuto neste projeto; o front-end
-- continua lendo o cache a cada 30 segundos sem iniciar chamadas ao GLPI.
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

-- Uma implantação anterior deixou uma sobrecarga com argumento opcional. Como
-- o valor padrão também aceitava chamadas sem argumento, o cron não conseguia
-- escolher entre as assinaturas e falhava antes de iniciar a Edge Function.
drop function if exists private.invoke_glpi_scheduled_sync(integer);

create or replace function private.invoke_glpi_scheduled_sync()
returns bigint
language plpgsql
security definer
set search_path = private, public, vault, extensions, net, pg_temp
as $$
declare
  project_url text;
  service_role_key text;
  request_id bigint;
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
        scheduler_interval_seconds = 60,
        next_run_at = date_trunc('minute', now()) + interval '1 minute',
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
      'expectedIntervalSeconds', 60
    ),
    timeout_milliseconds := 50000
  ) into request_id;

  update public.glpi_sync_state
  set sync_origin = 'supabase_cron',
      scheduler_interval_seconds = 60,
      next_run_at = date_trunc('minute', now()) + interval '1 minute',
      last_scheduler_request_id = request_id,
      updated_at = now()
  where id = 1;

  return request_id;
end;
$$;

revoke all on function private.invoke_glpi_scheduled_sync()
from public, anon, authenticated;

do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid
    from cron.job
    where jobname = 'gestao-ti-glpi-sync'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;

  perform cron.schedule(
    'gestao-ti-glpi-sync',
    '* * * * *',
    'select private.invoke_glpi_scheduled_sync()'
  );

  update public.glpi_sync_state
  set sync_origin = 'supabase_cron',
      scheduler_interval_seconds = 60,
      next_run_at = date_trunc('minute', now()) + interval '1 minute',
      updated_at = now()
  where id = 1;
end;
$$;

comment on function private.invoke_glpi_scheduled_sync() is
  'Invoca uma única sincronização incremental GLPI por minuto; indisponível aos papéis do navegador.';
