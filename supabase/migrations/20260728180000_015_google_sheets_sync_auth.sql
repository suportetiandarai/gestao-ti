create or replace function private.invoke_google_sheets_sync()
returns bigint language plpgsql security definer
set search_path=private,public,vault,extensions,net,pg_temp as $$
declare
  project_url text;
  sync_key text;
  request_id bigint;
begin
  select decrypted_secret into project_url
    from vault.decrypted_secrets
   where name='gestao_ti_project_url'
   order by created_at desc
   limit 1;

  select decrypted_secret into sync_key
    from vault.decrypted_secrets
   where name='gestao_ti_google_sheets_sync_key'
   order by created_at desc
   limit 1;

  if nullif(project_url,'') is null or nullif(sync_key,'') is null then
    return null;
  end if;

  select net.http_post(
    url:=rtrim(project_url,'/')||'/functions/v1/google-sheets-sync',
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'X-Sync-Key',sync_key
    ),
    body:='{"origin":"supabase_cron"}'::jsonb,
    timeout_milliseconds:=50000
  ) into request_id;

  return request_id;
end;
$$;

revoke all on function private.invoke_google_sheets_sync() from public,anon,authenticated;

notify pgrst,'reload schema';
