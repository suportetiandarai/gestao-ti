create table public.glpi_groups (
  id uuid primary key default gen_random_uuid(),
  glpi_group_id bigint not null unique, name text not null,
  is_active boolean not null default true,
  is_dashboard_group boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index glpi_one_dashboard_group_uidx on public.glpi_groups (is_dashboard_group)
where is_dashboard_group;

create table public.glpi_technicians (
  id uuid primary key default gen_random_uuid(),
  glpi_user_id bigint not null unique, firstname text, realname text,
  full_name text not null, is_active boolean not null default true,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.glpi_tickets (
  id uuid primary key default gen_random_uuid(),
  glpi_ticket_id bigint not null unique, title text,
  glpi_status_id integer not null, glpi_status_name text not null,
  dashboard_status text not null default 'Aguardando Atribuição'
    check (dashboard_status in ('Aguardando Atribuição','Em atendimento','Pendente','Solucionado')),
  group_id uuid not null references public.glpi_groups(id) on delete restrict,
  category_id bigint, category_name text, entity_id bigint, entity_name text,
  location_id bigint, location_name text, priority integer, urgency integer, impact integer,
  opened_at timestamptz not null, first_assigned_at timestamptz, first_response_at timestamptz,
  solved_at timestamptz, closed_at timestamptz,
  sla_attention_deadline timestamptz, sla_solution_deadline timestamptz,
  ola_attention_deadline timestamptz, ola_solution_deadline timestamptz,
  is_pending boolean not null default false, is_overdue boolean not null default false,
  requester_count integer not null default 0 check (requester_count >= 0),
  last_glpi_update timestamptz not null, source_environment text not null default 'real'
    check (source_environment in ('real','demo')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.glpi_ticket_technicians (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.glpi_tickets(id) on delete cascade,
  technician_id uuid not null references public.glpi_technicians(id) on delete restrict,
  relation_type text not null check (relation_type in ('assigned','requester','observer','solution_author','last_updater')),
  assigned_at timestamptz, removed_at timestamptz, is_current boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique nulls not distinct (ticket_id, technician_id, relation_type, assigned_at)
);

create table public.glpi_ticket_solutions (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.glpi_tickets(id) on delete cascade,
  glpi_solution_id bigint not null,
  solved_at timestamptz not null,
  solved_by_technician_id uuid references public.glpi_technicians(id) on delete restrict,
  solution_type text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (ticket_id, glpi_solution_id)
);

create table public.glpi_ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.glpi_tickets(id) on delete cascade,
  event_type text not null check (event_type in ('assignment','unassignment','status','pending','solution','closure','group')),
  old_value text, new_value text,
  technician_id uuid references public.glpi_technicians(id) on delete set null,
  occurred_at timestamptz not null, source text not null,
  source_event_id text,
  created_at timestamptz not null default now(),
  unique (ticket_id, source, source_event_id)
);

create table private.glpi_ticket_raw_payloads (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.glpi_tickets(id) on delete cascade,
  payload jsonb not null, payload_hash text not null,
  captured_at timestamptz not null default now(), expires_at timestamptz not null,
  unique (ticket_id, payload_hash)
);

create table public.glpi_filter_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null, filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), unique(user_id, name)
);

create table public.glpi_dashboard_settings (
  id uuid primary key default gen_random_uuid(),
  public_metadata jsonb not null default '{}'::jsonb,
  sync_interval_seconds integer not null default 60 check (sync_interval_seconds between 30 and 3600),
  attended_rule text not null default 'solved' check (attended_rule in ('assigned','solved','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.glpi_dashboard_settings(public_metadata) values ('{}'::jsonb);
