const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const ts = require('typescript');

const root = join(__dirname, '..', '..');
const modulePath = join(root, 'supabase', 'functions', '_shared', 'dashboard-snapshot.ts');
const source = readFileSync(modulePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2023,
  },
  fileName: modulePath,
}).outputText;
const snapshotModule = { exports: {} };
new Function('exports', 'require', 'module', '__filename', '__dirname', compiled)(
  snapshotModule.exports,
  require,
  snapshotModule,
  modulePath,
  join(modulePath, '..'),
);
const {
  buildDashboardSnapshot,
  currentShiftWindow,
  snapshotHash,
  snapshotTicketFlags,
} = snapshotModule.exports;

const reference = new Date('2026-07-27T15:00:00Z'); // 12:00 em São Paulo

function ticket(id, overrides = {}) {
  return {
    glpi_id: id,
    title: `Chamado ${id}`,
    status_id: 2,
    status: 'Atribuído',
    technician_id: 10,
    technician_name: 'Técnico Atual',
    group_id: 1,
    opened_at: '2026-07-27T11:00:00Z',
    assigned_at: '2026-07-27T11:10:00Z',
    first_response_at: '2026-07-27T11:15:00Z',
    solved_at: null,
    closed_at: null,
    sla_due_at: '2026-07-27T17:00:00Z',
    attention_due_at: '2026-07-27T12:00:00Z',
    internal_sla_due_at: null,
    internal_attention_due_at: null,
    solving_technician_id: null,
    solving_technician_name: null,
    ...overrides,
  };
}

test('snapshot usa o plantão 07:00–19:00 em America/Sao_Paulo', () => {
  const shift = currentShiftWindow(reference);
  assert.equal(shift.type, 'Diurno');
  assert.equal(shift.start.toISOString(), '2026-07-27T10:00:00.000Z');
  assert.equal(shift.end.toISOString(), '2026-07-27T22:00:00.000Z');
});

test('snapshot contém cinco indicadores, gráfico por solucionador e somente dez chamados', () => {
  const tickets = [
    ticket(1),
    ticket(2, { status_id: 1, status: 'Novo', technician_id: null, technician_name: null }),
    ticket(3, {
      status_id: 4,
      status: 'Pendente',
      sla_due_at: '2026-07-27T12:00:00Z',
    }),
    ticket(4, {
      status_id: 5,
      status: 'Solucionado',
      solved_at: '2026-07-27T14:00:00Z',
      solving_technician_id: 20,
      solving_technician_name: 'VINICIUS SILVA',
    }),
    ticket(5, {
      status_id: 6,
      status: 'Fechado',
      solved_at: '2026-07-27T14:30:00Z',
      closed_at: '2026-07-27T14:45:00Z',
      solving_technician_id: 20,
      solving_technician_name: 'VINICIUS SILVA',
    }),
    ticket(6, { group_id: 99 }),
    ticket(7, {
      opened_at: '2026-07-26T11:00:00Z',
      sla_due_at: '2026-07-27T13:00:00Z',
    }),
    ...Array.from({ length: 10 }, (_, index) => ticket(100 + index)),
  ];
  const snapshot = buildDashboardSnapshot(
    tickets,
    1,
    '2026-07-27T15:00:00.000Z',
    reference,
  );
  assert.equal(snapshot.open_count, 15);
  assert.equal(snapshot.in_progress_count, 12);
  assert.equal(snapshot.waiting_count, 1);
  assert.equal(snapshot.pending_count, 1);
  assert.equal(snapshot.overdue_count, 1);
  assert.equal(snapshot.latest_tickets_json.length, 10);
  assert.deepEqual(snapshot.technicians_chart_json, [{
    technician_id: 20,
    label: 'VINICIUS SILVA',
    value: 2,
  }]);
  assert.equal(JSON.stringify(snapshot).includes('raw_payload'), false);
  assert.equal(JSON.stringify(snapshot).includes('requester'), false);
});

test('pendente vencido nunca é estourado nem fica em atendimento', () => {
  const flags = snapshotTicketFlags(ticket(30, {
    status_id: 4,
    status: 'Pendente',
    sla_due_at: '2026-07-27T12:00:00Z',
  }), reference);
  assert.equal(flags.isPending, true);
  assert.equal(flags.isOverdue, false);
  assert.equal(flags.isInProgress, false);
  assert.equal(flags.isWaiting, false);
});

test('ETag é estável quando somente o instante de sincronização muda', async () => {
  const first = buildDashboardSnapshot([ticket(1)], 1, '2026-07-27T15:00:00.000Z', reference);
  const second = buildDashboardSnapshot([ticket(1)], 1, '2026-07-27T15:01:00.000Z', reference);
  assert.equal(await snapshotHash(first), await snapshotHash(second));
  second.open_count += 1;
  assert.notEqual(await snapshotHash(first), await snapshotHash(second));
});

test('snapshot ausente não possui fallback para tickets ou GLPI na função pública', () => {
  const publicSource = readFileSync(
    join(root, 'supabase', 'functions', 'glpi-dashboard-public', 'index.ts'),
    'utf8',
  );
  assert.match(publicSource, /Dados ainda não sincronizados/);
  assert.match(publicSource, /state:\s*'not_ready'/);
  assert.doesNotMatch(publicSource, /glpi_tickets_dashboard|initSession|sync-incremental|raw_payload/);
});
