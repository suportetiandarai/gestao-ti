alter table public.user_profiles enable row level security;
create policy user_profiles_read_self_or_admin on public.user_profiles for select to authenticated
using (auth_user_id=(select auth.uid()) or (select private.is_admin()));
create policy user_profiles_update_self_or_admin on public.user_profiles for update to authenticated
using (auth_user_id=(select auth.uid()) or (select private.is_admin()))
with check (auth_user_id=(select auth.uid()) or (select private.is_admin()));
create policy user_profiles_admin_insert on public.user_profiles for insert to authenticated
with check ((select private.is_admin()));
create policy user_profiles_admin_delete on public.user_profiles for delete to authenticated
using ((select private.is_admin()));
grant select,insert,update,delete on public.user_profiles to authenticated;
grant select,insert,update,delete on public.profiles to authenticated;

do $$ declare t text; begin
  foreach t in array array[
    'tipos_equipamento','inventario','inventario_historico','plantoes','chaves',
    'movimentacao_chaves','ocorrencias','cadastro_toner','registro_troca_toner',
    'chamado_simpress','solicitacoes_cadastro','solicitacoes_ad',
    'solicitacoes_treinamento','treinamentos'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('grant select,insert,update,delete on public.%I to authenticated',t);
    execute format('create policy authenticated_operational_access on public.%I for all to authenticated using ((select private.is_dashboard_reader())) with check ((select private.is_dashboard_reader()))',t);
  end loop;
end $$;

alter table public.system_settings enable row level security;
create policy settings_admin_only on public.system_settings for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
grant select,insert,update,delete on public.system_settings to authenticated;

do $$ declare t text; begin
  foreach t in array array[
    'glpi_groups','glpi_technicians','glpi_tickets','glpi_ticket_technicians',
    'glpi_ticket_solutions','glpi_ticket_events','glpi_sync_state','glpi_sync_logs',
    'glpi_dashboard_settings'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy dashboard_authenticated_read on public.%I for select to authenticated using ((select private.is_dashboard_reader()))',t);
  end loop;
end $$;
grant select on public.glpi_tickets_dashboard,public.glpi_ticket_assignments_dashboard to authenticated;

alter table public.glpi_filter_favorites enable row level security;
grant select,insert,update,delete on public.glpi_filter_favorites to authenticated;
create policy favorites_owner on public.glpi_filter_favorites for all to authenticated
using (user_id=(select auth.uid()) or (select private.is_dashboard_manager()))
with check (user_id=(select auth.uid()) or (select private.is_dashboard_manager()));

alter table public.dashboard_shift_snapshots enable row level security;
revoke all on public.dashboard_shift_snapshots from anon;
grant select on public.dashboard_shift_snapshots to authenticated,service_role;
create policy authenticated_snapshot_read on public.dashboard_shift_snapshots for select to authenticated
using ((select private.is_dashboard_reader()));

grant usage on schema public to anon,authenticated;
grant insert on public.solicitacoes_cadastro,public.solicitacoes_ad,public.solicitacoes_treinamento to anon;
create policy public_cadastro_insert on public.solicitacoes_cadastro for insert to anon with check (true);
create policy public_ad_insert on public.solicitacoes_ad for insert to anon with check (true);
create policy public_treinamento_insert on public.solicitacoes_treinamento for insert to anon with check (true);

insert into storage.buckets(id,name,public,file_size_limit)
values ('assinaturas','assinaturas',true,5242880),
       ('documentos_externos','documentos_externos',true,10485760)
on conflict(id) do update set file_size_limit=excluded.file_size_limit;
create policy authenticated_storage_insert on storage.objects for insert to authenticated
with check (bucket_id in ('assinaturas','documentos_externos'));
create policy authenticated_storage_update on storage.objects for update to authenticated
using (bucket_id in ('assinaturas','documentos_externos'))
with check (bucket_id in ('assinaturas','documentos_externos'));
create policy authenticated_storage_delete on storage.objects for delete to authenticated
using (bucket_id in ('assinaturas','documentos_externos'));

revoke all on all tables in schema private from public,anon,authenticated;
revoke all on all functions in schema private from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_dashboard_reader() to authenticated;
grant execute on function private.is_dashboard_manager() to authenticated;
