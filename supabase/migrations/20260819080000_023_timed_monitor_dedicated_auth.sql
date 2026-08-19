create or replace function private.invoke_timed_monitor()
returns bigint language plpgsql security definer
set search_path=private,public,vault,extensions,net,pg_temp as $$
declare project_url text; monitor_key text; request_id bigint;
begin
  select decrypted_secret into project_url from vault.decrypted_secrets
   where name='gestao_ti_project_url' order by created_at desc limit 1;
  select decrypted_secret into monitor_key from vault.decrypted_secrets
   where name='gestao_ti_timed_monitor_key' order by created_at desc limit 1;
  if nullif(project_url,'') is null or nullif(monitor_key,'') is null then return null; end if;
  select net.http_post(
    url:=rtrim(project_url,'/')||'/functions/v1/timed-monitor',
    headers:=jsonb_build_object(
      'Content-Type','application/json','Authorization','Bearer '||monitor_key
    ),
    body:='{"origin":"supabase_cron"}'::jsonb,
    timeout_milliseconds:=50000
  ) into request_id;
  return request_id;
end; $$;

revoke all on function private.invoke_timed_monitor() from public,anon,authenticated;
