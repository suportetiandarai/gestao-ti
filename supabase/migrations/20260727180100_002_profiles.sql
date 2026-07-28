create table public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null check (btrim(full_name) <> ''),
  email text not null unique,
  role text not null default 'operacional'
    check (role in ('admin', 'gestor', 'supervisor', 'tecnico', 'operacional')),
  shift text,
  phone text,
  cpf text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index user_profiles_email_lower_uidx on public.user_profiles (lower(email));

-- Compatibilidade temporária com a UI atual. View simples e atualizável; a
-- segurança é aplicada na tabela user_profiles.
create view public.profiles
with (security_invoker = true)
as
select
  auth_user_id as id,
  full_name as nome,
  email,
  phone as celular,
  cpf,
  shift as turno,
  role,
  is_active as ativo,
  created_at,
  updated_at
from public.user_profiles;

create or replace function private.is_admin()
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.user_profiles
    where auth_user_id = (select auth.uid()) and role = 'admin' and is_active
  );
$$;

create or replace function private.is_dashboard_reader()
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.user_profiles
    where auth_user_id = (select auth.uid())
      and role in ('admin','gestor','supervisor','tecnico','operacional')
      and is_active
  );
$$;

create or replace function private.is_dashboard_manager()
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.user_profiles
    where auth_user_id = (select auth.uid())
      and role in ('admin','gestor') and is_active
  );
$$;

grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_dashboard_reader() to authenticated;
grant execute on function private.is_dashboard_manager() to authenticated;

create trigger user_profiles_updated_at
before update on public.user_profiles
for each row execute function private.set_updated_at();
