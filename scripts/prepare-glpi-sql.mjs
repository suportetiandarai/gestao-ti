import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const migrationsDir = join(root, 'supabase', 'migrations');
const outputDir = join(root, 'supabase', '.temp');
const migrationNames = [
  '20260720090000_glpi_dashboard.sql',
  '20260722090000_glpi_daily_dashboard_deadlines.sql',
  '20260722100000_glpi_sync_state.sql',
  '20260722110000_glpi_ticket_assignments.sql',
];

const migrations = await Promise.all(
  migrationNames.map((name) => readFile(join(migrationsDir, name), 'utf8')),
);
const body = migrations.join('\n\n');

const dryRun = `begin;
${body}

do $$ begin
  if to_regclass('public.glpi_tickets_dashboard') is null
     or to_regclass('public.glpi_sync_state') is null
     or to_regclass('public.glpi_ticket_assignments_dashboard') is null then
    raise exception 'dry-run validation failed';
  end if;
end $$;
rollback;

select
  'dry_run_rolled_back' as result,
  to_regclass('public.glpi_tickets_dashboard') is null as tickets_not_persisted,
  to_regclass('public.glpi_ticket_assignments_dashboard') is null as assignments_not_persisted;
`;

const apply = `begin;
${body}
commit;

select
  to_regclass('public.glpi_tickets_dashboard') is not null as tickets_table,
  to_regclass('public.glpi_sync_state') is not null as sync_state_table,
  to_regclass('public.glpi_ticket_assignments_dashboard') is not null as assignments_table,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'glpi_tickets_dashboard'
      and column_name = 'internal_attention_due_at'
  ) as deadline_columns,
  (select relrowsecurity from pg_class where oid = 'public.glpi_tickets_dashboard'::regclass) as tickets_rls,
  (select relrowsecurity from pg_class where oid = 'public.glpi_ticket_assignments_dashboard'::regclass) as assignments_rls;
`;

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(join(outputDir, 'glpi-dry-run.sql'), dryRun, 'utf8'),
  writeFile(join(outputDir, 'glpi-apply.sql'), apply, 'utf8'),
]);

console.log(`SQLs preparados a partir de ${migrationNames.length} migrações.`);
