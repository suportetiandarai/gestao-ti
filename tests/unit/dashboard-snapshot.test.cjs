const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const ts = require('typescript');

const root = join(__dirname, '..', '..');
const modulePath = join(root, 'supabase', 'functions', '_shared', 'dashboard-snapshot.ts');
const source = readFileSync(modulePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 },
  fileName: modulePath,
}).outputText;
const snapshotModule = { exports: {} };
new Function('exports', 'require', 'module', '__filename', '__dirname', compiled)(
  snapshotModule.exports, require, snapshotModule, modulePath, join(modulePath, '..'),
);
const {
  buildDashboardSnapshot,
  contentHash,
  currentShiftWindow,
  getDashboardTicketStatus,
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
    operational_updated_at: null,
    ...overrides,
  };
}

test('plantão usa 07:00–19:00 em America/Sao_Paulo', () => {
  const shift = currentShiftWindow(reference);
  assert.equal(shift.type, 'Diurno');
  assert.equal(shift.start.toISOString(), '2026-07-27T10:00:00.000Z');
  assert.equal(shift.end.toISOString(), '2026-07-27T22:00:00.000Z');
});

test('resumo contém indicadores e gráfico; listagem separada contém todos os relacionados ao plantão', () => {
  const rows = [
    ticket(1),
    ticket(2, { status_id: 1, status: 'Novo', technician_id: null, technician_name: null }),
    ticket(3, { status_id: 4, status: 'Pendente', sla_due_at: '2026-07-27T12:00:00Z' }),
    ticket(4, {
      opened_at: '2026-07-26T11:00:00Z',
      assigned_at: '2026-07-26T11:10:00Z',
      status_id: 5,
      status: 'Solucionado',
      solved_at: '2026-07-27T14:00:00Z',
      solving_technician_id: 20,
      solving_technician_name: 'VINICIUS SILVA',
    }),
    ticket(5, {
      opened_at: '2026-07-26T11:00:00Z',
      assigned_at: '2026-07-27T13:00:00Z',
    }),
    ticket(6, { group_id: 99 }),
    ticket(7, {
      opened_at: '2026-07-26T11:00:00Z',
      assigned_at: '2026-07-26T11:10:00Z',
      operational_updated_at: '2026-07-27T14:30:00Z',
    }),
    ticket(8, {
      opened_at: '2026-07-26T11:00:00Z',
      assigned_at: '2026-07-26T11:10:00Z',
      status_id: 6,
      status: 'Fechado',
      solved_at: '2026-07-26T14:00:00Z',
      closed_at: '2026-07-27T14:00:00Z',
    }),
  ];
  const { snapshot, shiftTickets } = buildDashboardSnapshot(
    rows, 1, '2026-07-27T15:00:00.000Z', reference,
  );
  assert.equal(snapshot.open_count, 3);
  assert.equal(snapshot.tickets_count, 6);
  assert.deepEqual(shiftTickets.map(({ ticket_id }) => ticket_id).sort((a, b) => a - b), [1, 2, 3, 4, 5, 7]);
  assert.deepEqual(snapshot.technicians_chart_json, [{
    technician_id: 20,
    label: 'VINICIUS SILVA',
    value: 1,
  }]);
  assert.equal(JSON.stringify(snapshot).includes('shiftTickets'), false);
  assert.equal(JSON.stringify(shiftTickets).includes('raw_payload'), false);
  assert.equal(JSON.stringify(shiftTickets).includes('requester'), false);
});

test('mais de 10 solucionados e mais de 50 chamados são preservados e deduplicados', () => {
  const solved = Array.from({ length: 15 }, (_, index) => ticket(100 + index, {
    opened_at: '2026-07-26T11:00:00Z',
    assigned_at: '2026-07-26T12:00:00Z',
    status_id: 5,
    status: 'Solucionado',
    solved_at: `2026-07-27T${String(12 + Math.floor(index / 6)).padStart(2, '0')}:${String((index * 7) % 60).padStart(2, '0')}:00Z`,
    solving_technician_id: 20,
    solving_technician_name: 'VINICIUS SILVA',
  }));
  const opened = Array.from({ length: 60 }, (_, index) => ticket(200 + index));
  const { snapshot, shiftTickets } = buildDashboardSnapshot(
    [...solved, ...opened, { ...solved[0] }],
    1,
    '2026-07-27T15:00:00.000Z',
    reference,
  );
  assert.equal(snapshot.tickets_count, 75);
  assert.equal(shiftTickets.length, 75);
  assert.equal(new Set(shiftTickets.map(({ ticket_id }) => ticket_id)).size, 75);
  assert.equal(snapshot.technicians_chart_json[0].value, 15);
});

test('ordenação operacional prioriza estourado, aberto antigo e solução recente', () => {
  const { shiftTickets } = buildDashboardSnapshot([
    ticket(1, { opened_at: '2026-07-27T12:00:00Z', sla_due_at: '2026-07-27T13:00:00Z' }),
    ticket(2, { opened_at: '2026-07-27T10:30:00Z', attention_due_at: null }),
    ticket(3, {
      status_id: 5, status: 'Solucionado', solved_at: '2026-07-27T13:00:00Z',
      solving_technician_id: 20, solving_technician_name: 'Ana',
    }),
    ticket(4, {
      status_id: 5, status: 'Solucionado', solved_at: '2026-07-27T14:00:00Z',
      solving_technician_id: 20, solving_technician_name: 'Ana',
    }),
  ], 1, reference.toISOString(), reference);
  assert.deepEqual(shiftTickets.map(({ ticket_id }) => ticket_id), [1, 2, 4, 3]);
});

test('status exibido distingue técnico individual do grupo atribuído', () => {
  assert.equal(getDashboardTicketStatus(ticket(20, {
    technician_id: null,
    technician_name: null,
  }), reference).dashboardStatus, 'Aguardando Atribuição');
  assert.equal(getDashboardTicketStatus(ticket(21), reference).dashboardStatus, 'Em atendimento');
  assert.equal(getDashboardTicketStatus(ticket(22, {
    status_id: 4,
    status: 'Pendente',
  }), reference).dashboardStatus, 'Pendente');
  assert.equal(getDashboardTicketStatus(ticket(23, {
    status_id: 5,
    status: 'Solucionado',
    solved_at: '2026-07-27T14:00:00Z',
  }), reference).dashboardStatus, 'Solucionado');
});

test('pendente vencido nunca é estourado nem fica em atendimento', () => {
  const flags = snapshotTicketFlags(ticket(30, {
    status_id: 4,
    status: 'Pendente',
    sla_due_at: '2026-07-27T12:00:00Z',
  }), reference);
  assert.deepEqual(
    { pending: flags.isPending, overdue: flags.isOverdue, progress: flags.isInProgress, waiting: flags.isWaiting },
    { pending: true, overdue: false, progress: false, waiting: false },
  );
});

test('ETag é estável quando somente o instante de sincronização muda', async () => {
  const first = buildDashboardSnapshot([ticket(1)], 1, '2026-07-27T15:00:00.000Z', reference);
  const second = buildDashboardSnapshot([ticket(1)], 1, '2026-07-27T15:01:00.000Z', reference);
  first.snapshot.list_hash = await contentHash(first.shiftTickets);
  second.snapshot.list_hash = await contentHash(second.shiftTickets);
  assert.equal(await snapshotHash(first.snapshot), await snapshotHash(second.snapshot));
  second.snapshot.open_count += 1;
  assert.notEqual(await snapshotHash(first.snapshot), await snapshotHash(second.snapshot));
});

test('snapshot ausente não possui fallback para tickets ou GLPI na função pública', () => {
  const publicSource = readFileSync(
    join(root, 'supabase', 'functions', 'glpi-dashboard-public', 'index.ts'), 'utf8',
  );
  assert.match(publicSource, /Dados ainda não sincronizados/);
  assert.match(publicSource, /state:\s*'not_ready'/);
  assert.doesNotMatch(publicSource, /glpi_tickets_dashboard|initSession|sync-incremental|raw_payload/);
});
