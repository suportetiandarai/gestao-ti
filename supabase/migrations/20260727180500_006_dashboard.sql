create table public.dashboard_shift_snapshots (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.glpi_groups(id) on delete cascade,
  shift_type text not null check (shift_type in ('Diurno','Noturno')),
  shift_start timestamptz not null, shift_end timestamptz not null,
  open_count integer not null default 0 check (open_count >= 0),
  in_progress_count integer not null default 0 check (in_progress_count >= 0),
  waiting_assignment_count integer not null default 0 check (waiting_assignment_count >= 0),
  overdue_count integer not null default 0 check (overdue_count >= 0),
  pending_count integer not null default 0 check (pending_count >= 0),
  technician_chart jsonb not null default '[]'::jsonb check (jsonb_typeof(technician_chart)='array'),
  snapshot_hash text not null, snapshot_version bigint not null default 1,
  integration_status text not null default 'offline'
    check (integration_status in ('online','delayed','offline','not_ready')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(group_id, shift_start, shift_end)
);

create view public.glpi_tickets_dashboard
with (security_invoker=true) as
select
  ticket.glpi_ticket_id as glpi_id,
  ticket.title,
  ticket.glpi_status_id as status_id,
  ticket.dashboard_status as status,
  assigned.glpi_user_id as technician_id,
  assigned.full_name as technician_name,
  dashboard_group.glpi_group_id as group_id,
  dashboard_group.name as group_name,
  ticket.category_id,ticket.category_name,ticket.priority,ticket.urgency,ticket.impact,
  ticket.entity_id,ticket.entity_name,ticket.location_id,ticket.location_name,
  ticket.opened_at,ticket.first_assigned_at as assigned_at,ticket.first_response_at,
  ticket.solved_at,ticket.closed_at,ticket.last_glpi_update as modified_at,
  ticket.sla_solution_deadline as sla_due_at,
  ticket.sla_attention_deadline as attention_due_at,
  ticket.ola_solution_deadline as internal_sla_due_at,
  ticket.ola_attention_deadline as internal_attention_due_at,
  solution.glpi_user_id as solving_technician_id,
  solution.full_name as solving_technician_name,
  ticket.is_pending,ticket.is_overdue,ticket.source_environment
from public.glpi_tickets ticket
join public.glpi_groups dashboard_group on dashboard_group.id=ticket.group_id
left join lateral (
  select technician.glpi_user_id,technician.full_name
  from public.glpi_ticket_technicians relation
  join public.glpi_technicians technician on technician.id=relation.technician_id
  where relation.ticket_id=ticket.id and relation.relation_type='assigned'
    and relation.is_current and relation.removed_at is null
  order by relation.assigned_at nulls last,technician.glpi_user_id
  limit 1
) assigned on true
left join lateral (
  select technician.glpi_user_id,technician.full_name
  from public.glpi_ticket_solutions ticket_solution
  join public.glpi_technicians technician on technician.id=ticket_solution.solved_by_technician_id
  where ticket_solution.ticket_id=ticket.id
  order by ticket_solution.solved_at desc
  limit 1
) solution on true;

create view public.glpi_ticket_assignments_dashboard
with (security_invoker=true) as
select
  ticket.glpi_ticket_id as ticket_glpi_id,
  technician.glpi_user_id as technician_id,
  technician.full_name as technician_name,
  relation.assigned_at
from public.glpi_ticket_technicians relation
join public.glpi_tickets ticket on ticket.id=relation.ticket_id
join public.glpi_technicians technician on technician.id=relation.technician_id
where relation.relation_type='assigned' and relation.is_current and relation.removed_at is null;

create or replace function public.get_current_shift(p_reference timestamptz default now())
returns table(shift_type text, shift_start timestamptz, shift_end timestamptz)
language sql stable set search_path=pg_catalog as $$
with local_time as (
  select p_reference at time zone 'America/Sao_Paulo' as local_reference
), bounds as (
  select
    case when local_reference::time >= time '07:00' and local_reference::time < time '19:00'
      then 'Diurno' else 'Noturno' end as kind,
    case
      when local_reference::time >= time '07:00' and local_reference::time < time '19:00'
        then local_reference::date + time '07:00'
      when local_reference::time >= time '19:00'
        then local_reference::date + time '19:00'
      else (local_reference::date - 1) + time '19:00'
    end as local_start
  from local_time
)
select kind,
  local_start at time zone 'America/Sao_Paulo',
  (local_start + interval '12 hours') at time zone 'America/Sao_Paulo'
from bounds;
$$;

create or replace function private.calculate_dashboard_status(p_ticket_id uuid)
returns text language sql stable security definer
set search_path=public,pg_temp as $$
select case
  when t.solved_at is not null or t.glpi_status_id in (5,6) then 'Solucionado'
  when t.is_pending or t.glpi_status_id=4 then 'Pendente'
  when exists (
    select 1 from public.glpi_ticket_technicians r
    where r.ticket_id=t.id and r.relation_type='assigned' and r.is_current and r.removed_at is null
  ) then 'Em atendimento'
  else 'Aguardando Atribuição'
end
from public.glpi_tickets t where t.id=p_ticket_id;
$$;

create or replace function public.refresh_ticket_classification(p_ticket_id uuid, p_reference timestamptz default now())
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.glpi_tickets t
  set dashboard_status=private.calculate_dashboard_status(t.id),
      is_pending=(t.glpi_status_id=4),
      is_overdue=(
        t.solved_at is null and t.closed_at is null and t.glpi_status_id not in (4,5,6)
        and (
          (
            t.first_response_at is null
            and (
              coalesce(t.sla_attention_deadline < p_reference,false)
              or coalesce(t.ola_attention_deadline < p_reference,false)
            )
          )
          or (
            t.solved_at is null
            and (
              coalesce(t.sla_solution_deadline < p_reference,false)
              or coalesce(t.ola_solution_deadline < p_reference,false)
            )
          )
        )
      ),
      updated_at=now()
  where t.id=p_ticket_id;
end;
$$;

create or replace function public.get_shift_tickets(
  p_shift_start timestamptz, p_shift_end timestamptz,
  p_page integer default 1, p_page_size integer default 50
) returns table(
  ticket_id bigint, title text, dashboard_status text, glpi_status_name text,
  technician_id bigint, technician_name text, opened_at timestamptz, first_assigned_at timestamptz,
  solved_at timestamptz, closed_at timestamptz,
  sla_deadline timestamptz, ola_deadline timestamptz,
  is_overdue boolean, is_pending boolean,
  assignment_time_seconds bigint, solution_time_seconds bigint, total_time_seconds bigint,
  total_count bigint
) language sql stable security definer set search_path=public,pg_temp as $$
with eligible as (
  select t.*,
    (select min(gt.glpi_user_id)
     from public.glpi_ticket_technicians rel
     join public.glpi_technicians gt on gt.id=rel.technician_id
     where rel.ticket_id=t.id and rel.relation_type='assigned'
       and rel.is_current and rel.removed_at is null) as tech_id,
    (select string_agg(gt.full_name, ', ' order by gt.full_name)
     from public.glpi_ticket_technicians rel
     join public.glpi_technicians gt on gt.id=rel.technician_id
     where rel.ticket_id=t.id and rel.relation_type='assigned'
       and rel.is_current and rel.removed_at is null) as tech_names
  from public.glpi_tickets t
  join public.glpi_groups g on g.id=t.group_id and g.is_dashboard_group and g.is_active
  where (
    (t.opened_at >= p_shift_start and t.opened_at < p_shift_end)
    or (t.first_assigned_at >= p_shift_start and t.first_assigned_at < p_shift_end)
    or (t.solved_at >= p_shift_start and t.solved_at < p_shift_end)
    or exists (
      select 1 from public.glpi_ticket_events e
      where e.ticket_id=t.id and e.occurred_at>=p_shift_start and e.occurred_at<p_shift_end
        and e.event_type in ('assignment','unassignment','status','pending','solution','group')
    )
  )
), ranked as (
  select e.*, count(*) over() as total_rows,
    case when e.is_overdue and e.solved_at is null then 1
         when e.solved_at is null then 2 else 3 end as bucket
  from eligible e
)
select glpi_ticket_id,title,dashboard_status,glpi_status_name,
  tech_id,coalesce(tech_names,'Aguardando atendimento'),opened_at,first_assigned_at,solved_at,closed_at,
  sla_solution_deadline,ola_solution_deadline,is_overdue,is_pending,
  greatest(0,extract(epoch from (coalesce(first_assigned_at,least(coalesce(solved_at,p_shift_end),now()))-opened_at)))::bigint,
  case when first_assigned_at is null then 0 else
    greatest(0,extract(epoch from (coalesce(solved_at,now())-first_assigned_at)))::bigint end,
  greatest(0,extract(epoch from (coalesce(solved_at,now())-opened_at)))::bigint,
  total_rows
from ranked
order by bucket,
  case when bucket=1 then least(sla_solution_deadline,ola_solution_deadline) end asc nulls last,
  case when bucket=2 then opened_at end asc nulls last,
  case when bucket=3 then solved_at end desc nulls last,
  glpi_ticket_id
limit greatest(1,least(p_page_size,100))
offset (greatest(1,p_page)-1)*greatest(1,least(p_page_size,100));
$$;

create or replace function public.rebuild_shift_snapshot(
  p_group_id uuid,
  p_synced_at timestamptz default now()
) returns public.dashboard_shift_snapshots
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  v_shift record;
  v_chart jsonb;
  v_payload jsonb;
  v_hash text;
  v_result public.dashboard_shift_snapshots;
begin
  select * into v_shift from public.get_current_shift(p_synced_at);

  select coalesce(jsonb_agg(item order by (item->>'value')::integer desc, item->>'label'), '[]'::jsonb)
  into v_chart
  from (
    select jsonb_build_object(
      'technician_id', tech.glpi_user_id,
      'label', tech.full_name,
      'value', count(distinct sol.ticket_id)
    ) item
    from public.glpi_ticket_solutions sol
    join public.glpi_tickets ticket on ticket.id=sol.ticket_id and ticket.group_id=p_group_id
    join public.glpi_technicians tech on tech.id=sol.solved_by_technician_id
    where sol.solved_at>=v_shift.shift_start and sol.solved_at<v_shift.shift_end
    group by tech.glpi_user_id,tech.full_name
  ) chart_rows;

  select jsonb_build_object(
    'group_id',p_group_id,
    'shift_type',v_shift.shift_type,
    'shift_start',v_shift.shift_start,
    'shift_end',v_shift.shift_end,
    'open_count',count(*) filter (
      where ticket.opened_at>=v_shift.shift_start and ticket.opened_at<v_shift.shift_end
    ),
    'in_progress_count',count(*) filter (where ticket.dashboard_status='Em atendimento'),
    'waiting_assignment_count',count(*) filter (where ticket.dashboard_status='Aguardando Atribuição'),
    'overdue_count',count(*) filter (where ticket.is_overdue),
    'pending_count',count(*) filter (where ticket.dashboard_status='Pendente'),
    'technician_chart',v_chart
  )
  into v_payload
  from public.glpi_tickets ticket
  where ticket.group_id=p_group_id
    and (ticket.solved_at is null and ticket.closed_at is null or ticket.opened_at>=v_shift.shift_start);

  v_hash:=encode(digest(convert_to(v_payload::text,'UTF8'),'sha256'),'hex');

  insert into public.dashboard_shift_snapshots(
    group_id,shift_type,shift_start,shift_end,
    open_count,in_progress_count,waiting_assignment_count,overdue_count,pending_count,
    technician_chart,snapshot_hash,snapshot_version,integration_status,last_synced_at
  ) values (
    p_group_id,v_shift.shift_type,v_shift.shift_start,v_shift.shift_end,
    (v_payload->>'open_count')::integer,
    (v_payload->>'in_progress_count')::integer,
    (v_payload->>'waiting_assignment_count')::integer,
    (v_payload->>'overdue_count')::integer,
    (v_payload->>'pending_count')::integer,
    v_chart,v_hash,1,'online',p_synced_at
  )
  on conflict(group_id,shift_start,shift_end) do update set
    open_count=excluded.open_count,
    in_progress_count=excluded.in_progress_count,
    waiting_assignment_count=excluded.waiting_assignment_count,
    overdue_count=excluded.overdue_count,
    pending_count=excluded.pending_count,
    technician_chart=excluded.technician_chart,
    snapshot_version=case
      when dashboard_shift_snapshots.snapshot_hash=excluded.snapshot_hash
        then dashboard_shift_snapshots.snapshot_version
      else dashboard_shift_snapshots.snapshot_version+1
    end,
    snapshot_hash=excluded.snapshot_hash,
    integration_status='online',
    last_synced_at=excluded.last_synced_at,
    updated_at=now()
  returning * into v_result;
  return v_result;
end;
$$;

revoke all on function private.calculate_dashboard_status(uuid) from public,anon,authenticated;
revoke all on function public.refresh_ticket_classification(uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.rebuild_shift_snapshot(uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.get_current_shift(timestamptz) from public,anon;
revoke all on function public.get_shift_tickets(timestamptz,timestamptz,integer,integer) from public,anon;
grant execute on function public.refresh_ticket_classification(uuid,timestamptz) to service_role;
grant execute on function public.rebuild_shift_snapshot(uuid,timestamptz) to service_role;
grant execute on function public.get_current_shift(timestamptz) to authenticated;
grant execute on function public.get_shift_tickets(timestamptz,timestamptz,integer,integer) to authenticated,service_role;
