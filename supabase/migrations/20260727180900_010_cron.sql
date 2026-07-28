create or replace function private.invoke_glpi_scheduled_sync()
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
    url:=rtrim(project_url,'/')||'/functions/v1/glpi-dashboard',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||service_key),
    body:=jsonb_build_object('action','sync-incremental','origin','supabase_cron'),
    timeout_milliseconds:=50000
  ) into request_id;
  return request_id;
end; $$;
revoke all on function private.invoke_glpi_scheduled_sync() from public,anon,authenticated;

do $$ declare job record; begin
  for job in select jobid from cron.job where jobname in ('gestao-ti-glpi-sync','gestao-ti-maintenance')
  loop perform cron.unschedule(job.jobid); end loop;
  perform cron.schedule('gestao-ti-glpi-sync','* * * * *','select private.invoke_glpi_scheduled_sync()');
  perform cron.schedule('gestao-ti-maintenance','17 3 * * *','select private.purge_operational_history()');
end $$;

notify pgrst,'reload schema';
