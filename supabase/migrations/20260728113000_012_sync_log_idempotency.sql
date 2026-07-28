-- Uma execução deve ocupar somente uma linha de log. Consolida os poucos
-- registros gerados antes da correção e impede duplicidade futura.
with ranked as (
  select
    id,
    row_number() over (
      partition by execution_id
      order by
        case status
          when 'success' then 4
          when 'error' then 4
          when 'skipped' then 3
          else 1
        end desc,
        coalesce(finished_at, started_at) desc,
        id desc
    ) as position
  from public.glpi_sync_logs
)
delete from public.glpi_sync_logs target
using ranked
where target.id = ranked.id
  and ranked.position > 1;

create unique index if not exists glpi_sync_logs_execution_uidx
  on public.glpi_sync_logs(execution_id);
