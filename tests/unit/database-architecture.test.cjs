const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..', '..');
const migrationsDir = join(root, 'supabase', 'migrations');
const migrationFiles = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
const sql = migrationFiles.map((name) => readFileSync(join(migrationsDir, name), 'utf8')).join('\n');
const syncFunction = readFileSync(join(root, 'supabase', 'functions', 'glpi-dashboard', 'index.ts'), 'utf8');
const publicFunction = readFileSync(join(root, 'supabase', 'functions', 'glpi-dashboard-public', 'index.ts'), 'utf8');

test('bootstrap novo possui migrações ordenadas por responsabilidade e reparos remotos', () => {
  assert.equal(migrationFiles.length, 21);
  assert.deepEqual(migrationFiles.map((name) => name.match(/_(\d{3})_/)[1]), [
    '001', '002', '003', '004', '005', '006', '007', '008', '009', '010', '011', '012', '013', '014', '015', '016', '017', '018', '019', '020', '021'
  ]);
});

test('modelo GLPI é normalizado e payload bruto fica no schema privado', () => {
  for (const table of [
    'glpi_groups', 'glpi_technicians', 'glpi_tickets', 'glpi_ticket_technicians',
    'glpi_ticket_solutions', 'glpi_ticket_events', 'glpi_sync_state',
    'glpi_sync_logs', 'dashboard_shift_snapshots'
  ]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`));
  }
  assert.match(sql, /create table private\.glpi_ticket_raw_payloads/);
  assert.doesNotMatch(publicFunction, /raw_payload/);
});

test('RLS protege dados internos e acesso público é projetado pela função', () => {
  assert.match(sql, /alter table public\.dashboard_shift_snapshots enable row level security/);
  assert.match(sql, /revoke all on all tables in schema private from public,anon,authenticated/);
  assert.match(publicFunction, /\.select\(\[/);
  assert.doesNotMatch(publicFunction, /\.select\(['"]\*['"]\)/);
});

test('sincronização possui lock expirável, cursor incremental e cron único', () => {
  assert.match(sql, /lock_expires_at/);
  assert.match(sql, /last_cursor/);
  assert.match(syncFunction, /GLPI_SYNC_OVERLAP_SECONDS/);
  assert.match(syncFunction, /date_mod/);
  assert.match(sql, /cron\.schedule\('gestao-ti-glpi-sync','\* \* \* \* \*'/);
});

test('log de sincronização é idempotente por execution_id', () => {
  assert.match(sql, /glpi_sync_logs_execution_uidx[\s\S]*execution_id/);
  assert.match(syncFunction, /onConflict:\s*'execution_id'/);
});

test('snapshot e listagem não carregam histórico bruto', () => {
  assert.match(sql, /create or replace function public\.rebuild_shift_snapshot/);
  assert.match(sql, /create or replace function public\.get_shift_tickets/);
  assert.match(sql, /p_page_size integer default 50/);
  assert.match(publicFunction, /If-None-Match/);
  assert.match(publicFunction, /status: 304/);
});

test('prazos ausentes não produzem atraso nulo', () => {
  assert.match(sql, /coalesce\(t\.sla_attention_deadline < p_reference,false\)/);
  assert.match(sql, /coalesce\(t\.ola_solution_deadline < p_reference,false\)/);
});
