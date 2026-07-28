-- A revogação defensiva da migração de RLS também removeu, por ordem de
-- execução, o acesso aos três helpers usados pelas próprias policies.
-- Restaura somente USAGE no namespace e EXECUTE nessas funções específicas.
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_dashboard_reader() to authenticated;
grant execute on function private.is_dashboard_manager() to authenticated;
