-- RBAC de banco: a UI melhora a experiência, mas estas políticas são a barreira de segurança real.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and lower(role) = 'admin'
  );
$$;

revoke all on function private.is_admin() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;

alter table public.profiles enable row level security;
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.profiles to authenticated;
revoke all on table public.profiles from anon;

do $$
declare policy_record record;
begin
  for policy_record in select policyname from pg_policies where schemaname = 'public' and tablename = 'profiles'
  loop
    execute format('drop policy if exists %I on public.profiles', policy_record.policyname);
  end loop;
end $$;

create policy profiles_select_self_or_admin
on public.profiles for select to authenticated
using ((select auth.uid()) = id or (select private.is_admin()));

create policy profiles_update_self_or_admin
on public.profiles for update to authenticated
using ((select auth.uid()) = id or (select private.is_admin()))
with check ((select auth.uid()) = id or (select private.is_admin()));

create policy profiles_insert_admin
on public.profiles for insert to authenticated
with check ((select private.is_admin()));

create policy profiles_delete_admin
on public.profiles for delete to authenticated
using ((select private.is_admin()));

create or replace function private.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.role := lower(trim(new.role));
  if new.role not in ('admin', 'operacional') then
    raise exception 'Perfil de acesso inválido';
  end if;

  if tg_op = 'UPDATE' and new.role is distinct from old.role
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     and not private.is_admin() then
    raise exception 'Somente administradores podem alterar perfis de acesso';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_role_trigger on public.profiles;
create trigger protect_profile_role_trigger
before insert or update on public.profiles
for each row execute function private.protect_profile_role();

-- Todas as áreas abaixo são operacionais e exigem uma sessão autenticada.
do $$
declare
  table_name text;
  policy_record record;
begin
  foreach table_name in array array[
    'cadastro_toner', 'chamado_simpress', 'chamados_ti', 'chaves', 'inventario',
    'movimentacao_chaves', 'ocorrencias', 'plantoes', 'registro_troca_toner',
    'solicitacoes_ad', 'solicitacoes_cadastro', 'solicitacoes_treinamento',
    'tipos_equipamento', 'treinamentos'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);
    execute format('revoke all on table public.%I from anon', table_name);
    for policy_record in select policyname from pg_policies where schemaname = 'public' and tablename = table_name
    loop
      execute format('drop policy if exists %I on public.%I', policy_record.policyname, table_name);
    end loop;
    execute format(
      'create policy authenticated_operational_access on public.%I for all to authenticated using (true) with check (true)',
      table_name
    );
  end loop;
end $$;

-- Buckets utilizados pelo sistema: nenhuma operação anônima.
drop policy if exists authenticated_signature_files on storage.objects;
create policy authenticated_signature_files
on storage.objects for all to authenticated
using (bucket_id in ('assinaturas', 'documentos_externos'))
with check (bucket_id in ('assinaturas', 'documentos_externos'));
