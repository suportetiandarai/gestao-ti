-- Técnicos atualmente vinculados ao chamado e data real do evento de atribuição.
-- GLPI 10.0.18 não expõe Ticket.date_assign na API desta instalação; a data é
-- obtida do Log.date_mod para id_search_option=5 e o técnico de Ticket_User tipo 2.
create table if not exists public.glpi_ticket_assignments_dashboard (
  ticket_glpi_id bigint not null references public.glpi_tickets_dashboard(glpi_id) on delete cascade,
  technician_id bigint not null,
  technician_name text,
  assigned_at timestamptz,
  assignment_source text not null default 'history'
    check (assignment_source in ('history', 'ticket_date_assign')),
  synced_at timestamptz not null default now(),
  primary key (ticket_glpi_id, technician_id)
);

create index if not exists glpi_ticket_assignments_assigned_idx
  on public.glpi_ticket_assignments_dashboard (assigned_at desc);

create index if not exists glpi_ticket_assignments_technician_idx
  on public.glpi_ticket_assignments_dashboard (technician_id);

alter table public.glpi_ticket_assignments_dashboard enable row level security;
grant select on public.glpi_ticket_assignments_dashboard to authenticated;
revoke all on public.glpi_ticket_assignments_dashboard from anon;

drop policy if exists glpi_ticket_assignments_read on public.glpi_ticket_assignments_dashboard;
create policy glpi_ticket_assignments_read
on public.glpi_ticket_assignments_dashboard for select to authenticated
using ((select private.is_dashboard_reader()));

comment on table public.glpi_ticket_assignments_dashboard is
  'Técnicos atuais por chamado, deduplicados pelo par chamado/técnico, com data do evento real de atribuição.';
