-- Prazos reais usados pelo Dashboard Diário. GLPI chama SLA de prazo externo
-- e OLA de prazo interno; ambos podem ter meta de atendimento (TTO) e solução (TTR).
alter table public.glpi_tickets_dashboard
  add column if not exists attention_due_at timestamptz,
  add column if not exists internal_attention_due_at timestamptz,
  add column if not exists internal_sla_due_at timestamptz;

comment on column public.glpi_tickets_dashboard.attention_due_at is
  'Prazo externo de atendimento (Ticket.time_to_own / SLA TTO).';
comment on column public.glpi_tickets_dashboard.sla_due_at is
  'Prazo externo de solução (Ticket.time_to_resolve / SLA TTR).';
comment on column public.glpi_tickets_dashboard.internal_attention_due_at is
  'Prazo interno de atendimento (Ticket.internal_time_to_own / OLA TTO).';
comment on column public.glpi_tickets_dashboard.internal_sla_due_at is
  'Prazo interno de solução (Ticket.internal_time_to_resolve / OLA TTR).';
