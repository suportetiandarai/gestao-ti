const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..', '..');
const migration = readFileSync(join(root, 'supabase', 'migrations', '20260818090000_022_timed_vitai_monitor.sql'), 'utf8');
const monitorFunction = readFileSync(join(root, 'supabase', 'functions', 'timed-monitor', 'index.ts'), 'utf8');
const dashboard = readFileSync(join(root, 'glpi-dashboard.js'), 'utf8');
const html = readFileSync(join(root, 'index.html'), 'utf8');

function initialState(overrides = {}) {
  return {
    status: 'online',
    failures: 0,
    successes: 0,
    firstFailureAt: null,
    firstRecoveryAt: null,
    event: null,
    ...overrides,
  };
}

function observe(state, success, at) {
  const next = structuredClone(state);
  if (success) {
    next.failures = 0;
    next.firstFailureAt = null;
    if (next.status !== 'offline') {
      next.status = 'online';
      next.successes = 0;
      return next;
    }
    next.successes += 1;
    next.firstRecoveryAt ||= at;
    if (next.successes >= 2) {
      next.status = 'online';
      next.event.recoveredAt = next.firstRecoveryAt;
      next.event.durationSeconds = Math.floor((new Date(next.firstRecoveryAt) - new Date(next.event.downAt)) / 1000);
      next.successes = 0;
      next.firstRecoveryAt = null;
    }
    return next;
  }
  next.successes = 0;
  next.firstRecoveryAt = null;
  next.failures += 1;
  next.firstFailureAt ||= at;
  if (next.status !== 'offline' && next.failures >= 3) {
    next.status = 'offline';
    next.event ||= { downAt: next.firstFailureAt, recoveredAt: null, durationSeconds: null };
  }
  return next;
}

function sequence(values, state = initialState()) {
  return values.reduce((current, [success, at]) => observe(current, success, at), state);
}

test('ONLINE → ONLINE não cria indisponibilidade', () => {
  const state = sequence([[true, '2026-08-18T13:00:00Z']]);
  assert.equal(state.status, 'online');
  assert.equal(state.event, null);
});

test('ONLINE → FAIL → ONLINE não cria indisponibilidade', () => {
  const state = sequence([
    [false, '2026-08-18T13:00:00Z'],
    [true, '2026-08-18T13:01:00Z'],
  ]);
  assert.equal(state.status, 'online');
  assert.equal(state.event, null);
});

test('três falhas confirmam uma única queda no horário da primeira falha', () => {
  const state = sequence([
    [false, '2026-08-18T13:00:00Z'],
    [false, '2026-08-18T13:01:00Z'],
    [false, '2026-08-18T13:02:00Z'],
    [false, '2026-08-18T13:03:00Z'],
  ]);
  assert.equal(state.status, 'offline');
  assert.equal(state.event.downAt, '2026-08-18T13:00:00Z');
  assert.equal(state.event.recoveredAt, null);
});

test('OFFLINE → ONLINE → FAIL continua offline', () => {
  const offline = sequence([
    [false, '2026-08-18T13:00:00Z'],
    [false, '2026-08-18T13:01:00Z'],
    [false, '2026-08-18T13:02:00Z'],
  ]);
  const state = sequence([
    [true, '2026-08-18T13:03:00Z'],
    [false, '2026-08-18T13:04:00Z'],
  ], offline);
  assert.equal(state.status, 'offline');
  assert.equal(state.event.recoveredAt, null);
});

test('duas respostas positivas fecham a queda usando o primeiro retorno e atravessam meia-noite', () => {
  const offline = sequence([
    [false, '2026-08-19T02:57:00Z'],
    [false, '2026-08-19T02:58:00Z'],
    [false, '2026-08-19T02:59:00Z'],
  ]);
  const state = sequence([
    [true, '2026-08-19T03:07:30Z'],
    [true, '2026-08-19T03:08:30Z'],
  ], offline);
  assert.equal(state.status, 'online');
  assert.equal(state.event.recoveredAt, '2026-08-19T03:07:30Z');
  assert.equal(state.event.durationSeconds, 630);
});

test('migration persiste estado, lock, evento único e cron de um minuto', () => {
  assert.match(migration, /create table public\.system_monitors/);
  assert.match(migration, /create table public\.system_downtimes/);
  assert.match(migration, /failure_threshold integer not null default 3/);
  assert.match(migration, /recovery_threshold integer not null default 2/);
  assert.match(migration, /first_failure_at/);
  assert.match(migration, /first_recovery_at/);
  assert.match(migration, /system_downtimes_one_open_uidx[\s\S]*where status='open'/);
  assert.match(migration, /lock_expires_at/);
  assert.match(migration, /duration_seconds=greatest\(0,extract\(epoch from recovery_started-down_at\)::bigint\)/);
  assert.match(migration, /cron\.schedule\([\s\S]*'gestao-ti-timed-monitor','\* \* \* \* \*'/);
  assert.doesNotMatch(migration, /\*\/30/);
});

test('Edge Function valida autorização, timeout e redirecionamento sem polling no navegador', () => {
  assert.match(monitorFunction, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(monitorFunction, /TIMED_MONITOR_TIMEOUT_MS/);
  assert.match(monitorFunction, /redirect: 'follow'/);
  assert.match(monitorFunction, /\[401, 403\]\.includes/);
  assert.match(monitorFunction, /acquire_system_monitor_lock/);
  assert.match(monitorFunction, /release_system_monitor_lock/);
  assert.doesNotMatch(dashboard, /hmandarai\.vitai\.care/);
  assert.doesNotMatch(dashboard, /timed-monitor[^\n]*fetch/);
});

test('Google Sheets é destino idempotente e falhas permanecem pendentes', () => {
  assert.match(monitorFunction, /1IlfI3FfxAf93uQPX8Pd-DaB76D2acsLqFj3-1P93vjI/);
  assert.match(monitorFunction, /GOOGLE_SERVICE_ACCOUNT_JSON_B64/);
  assert.match(monitorFunction, /GOOGLE_TIMED_MONITOR_SPREADSHEET_ID/);
  assert.match(monitorFunction, /'ID Evento'/);
  assert.match(monitorFunction, /\.eq\('sheet_synced', false\)/);
  assert.match(monitorFunction, /sheet_sync_attempts: Number\(downtime\.sheet_sync_attempts \|\| 0\) \+ 1/);
  assert.match(monitorFunction, /sheet_synced: true/);
});

test('Dashboard autenticado exibe status e histórico sem executar o monitor', () => {
  assert.match(html, /id="timed-monitor-panel"/);
  assert.match(dashboard, /\.from\('system_monitors'\)/);
  assert.match(dashboard, /\.from\('system_downtimes'\)/);
  assert.match(dashboard, /Últimas indisponibilidades/);
  assert.match(dashboard, /state\.publicMode[\s\S]*panel\.classList\.add\('hidden'\)/);
});
