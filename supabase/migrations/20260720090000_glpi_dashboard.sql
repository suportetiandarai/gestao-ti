-- Dashboard GLPI RioSaúde: cache operacional, filtros favoritos e logs de sincronização.

alter table public.profiles
drop constraint if exists profiles_role_check;

create table if not exists public.glpi_dashboard_settings (
  id uuid primary key default gen_random_uuid(),
  public_metadata jsonb not null default '{}'::jsonb,
  sync_interval_seconds integer not null default 60 check (sync_interval_seconds between 30 and 3600),
  attended_rule text not null default 'solved' check (attended_rule in ('assigned', 'solved', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.glpi_tickets_dashboard (
  glpi_id bigint primary key,
  title text,
  status_id integer,
  status text,
  technician_id bigint,
  technician_name text,
  group_id bigint,
  group_name text,
  requester_id bigint,
  requester_name text,
  category_id bigint,
  category_name text,
  priority integer,
  priority_name text,
  urgency integer,
  urgency_name text,
  impact integer,
  impact_name text,
  entity_id bigint,
  entity_name text,
  unit_name text,
  location_id bigint,
  location_name text,
  type_id integer,
  type_name text,
  opened_at timestamptz,
  assigned_at timestamptz,
  first_response_at timestamptz,
  solved_at timestamptz,
  closed_at timestamptz,
  modified_at timestamptz,
  sla_due_at timestamptz,
  sla_status text not null default 'unavailable' check (sla_status in ('ok', 'warning', 'breached', 'unavailable')),
  pending_reason text,
  glpi_url text,
  raw_payload jsonb not null default '{}'::jsonb,
  source_environment text not null default 'real' check (source_environment in ('real', 'demo')),
  synced_at timestamptz not null default now()
);

create index if not exists glpi_tickets_dashboard_modified_idx on public.glpi_tickets_dashboard (modified_at desc);
create index if not exists glpi_tickets_dashboard_status_idx on public.glpi_tickets_dashboard (status_id);
create index if not exists glpi_tickets_dashboard_technician_idx on public.glpi_tickets_dashboard (technician_id);
create index if not exists glpi_tickets_dashboard_opened_idx on public.glpi_tickets_dashboard (opened_at desc);

create table if not exists public.glpi_sync_logs (
  id bigint generated always as identity primary key,
  level text not null default 'info' check (level in ('info', 'aviso', 'erro')),
  message text not null,
  records_processed integer not null default 0,
  last_cursor timestamptz,
  technical_detail text,
  created_at timestamptz not null default now()
);

create table if not exists public.glpi_filter_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function private.is_dashboard_manager()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and lower(role) in ('admin', 'gestor')
  );
$$;

create or replace function private.is_dashboard_reader()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and lower(role) in ('admin', 'gestor', 'supervisor', 'tecnico', 'operacional')
  );
$$;

create or replace function private.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.role := lower(trim(new.role));
  if new.role not in ('admin', 'gestor', 'supervisor', 'tecnico', 'operacional') then
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

grant execute on function private.is_dashboard_manager() to authenticated;
grant execute on function private.is_dashboard_reader() to authenticated;

alter table public.glpi_dashboard_settings enable row level security;
alter table public.glpi_tickets_dashboard enable row level security;
alter table public.glpi_sync_logs enable row level security;
alter table public.glpi_filter_favorites enable row level security;

grant select on public.glpi_dashboard_settings to authenticated;
grant select on public.glpi_tickets_dashboard to authenticated;
grant select on public.glpi_sync_logs to authenticated;
grant select, insert, update, delete on public.glpi_filter_favorites to authenticated;
revoke all on public.glpi_dashboard_settings from anon;
revoke all on public.glpi_tickets_dashboard from anon;
revoke all on public.glpi_sync_logs from anon;
revoke all on public.glpi_filter_favorites from anon;

drop policy if exists glpi_settings_read on public.glpi_dashboard_settings;
create policy glpi_settings_read
on public.glpi_dashboard_settings for select to authenticated
using ((select private.is_dashboard_reader()));

drop policy if exists glpi_tickets_read on public.glpi_tickets_dashboard;
create policy glpi_tickets_read
on public.glpi_tickets_dashboard for select to authenticated
using ((select private.is_dashboard_reader()));

drop policy if exists glpi_sync_logs_read on public.glpi_sync_logs;
create policy glpi_sync_logs_read
on public.glpi_sync_logs for select to authenticated
using ((select private.is_dashboard_manager()));

drop policy if exists glpi_filter_favorites_owner on public.glpi_filter_favorites;
create policy glpi_filter_favorites_owner
on public.glpi_filter_favorites for all to authenticated
using (user_id = (select auth.uid()) or (select private.is_dashboard_manager()))
with check (user_id = (select auth.uid()) or (select private.is_dashboard_manager()));

insert into public.glpi_dashboard_settings (public_metadata)
select jsonb_build_object(
  'glpi_version', '10.0.18',
  'api_enabled', 'Pendente de validação no ambiente real',
  'api_url', '{GLPI_BASE_URL}/apirest.php',
  'auth_method', 'App-Token + User-Token',
  'sync_strategy', 'Sincronização incremental pela Edge Function glpi-dashboard',
  'permissions', 'Usuário de API somente leitura com acesso a chamados, usuários, grupos, categorias, entidades, localizações e SLA'
)
where not exists (select 1 from public.glpi_dashboard_settings);
