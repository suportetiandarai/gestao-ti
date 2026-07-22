const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../glpi-dashboard-core.js');

const NOW = new Date('2026-07-22T15:00:00-03:00');

function ticket(overrides = {}) {
  return {
    id: 1,
    status: 'Novo',
    technician: 'Ana Souza',
    technicianId: 10,
    openedAt: '2026-07-22T09:00:00-03:00',
    assignedAt: null,
    firstResponseAt: null,
    solvedAt: null,
    closedAt: null,
    attentionDueAt: null,
    slaDueAt: null,
    internalAttentionDueAt: null,
    internalSlaDueAt: null,
    ...overrides,
  };
}

test('intervalo diário usa America/Sao_Paulo de 00:00:00 a 23:59:59', () => {
  assert.equal(core.TIME_ZONE, 'America/Sao_Paulo');
  const range = core.todayRange(NOW);
  assert.equal(range.start.toISOString(), '2026-07-22T03:00:00.000Z');
  assert.equal(range.end.toISOString(), '2026-07-23T02:59:59.999Z');
  assert.equal(core.isBetween('2026-07-22T00:00:00-03:00', range.start, range.end), true);
  assert.equal(core.isBetween('2026-07-22T23:59:59-03:00', range.start, range.end), true);
  assert.equal(core.isBetween('2026-07-21T23:59:59-03:00', range.start, range.end), false);
});

test('calcula os cinco indicadores sem sobrepor atendimento e espera', () => {
  const rows = [
    ticket({ id: 1, status: 'Novo' }),
    ticket({ id: 2, status: 'Atribuído', firstResponseAt: null }),
    ticket({ id: 3, status: 'Planejado', firstResponseAt: '2026-07-22T10:00:00-03:00' }),
    ticket({ id: 4, status: 'Pendente' }),
    ticket({ id: 5, status: 'Atribuído', firstResponseAt: '2026-07-22T08:30:00-03:00', slaDueAt: '2026-07-22T14:00:00-03:00' }),
    ticket({ id: 6, openedAt: '2026-07-21T10:00:00-03:00' }),
  ];
  const metrics = core.dailyMetrics(rows, NOW);
  assert.equal(metrics.createdToday.length, 5);
  assert.deepEqual(metrics.inServiceNow.map(({ id }) => id), [3, 5]);
  assert.deepEqual(metrics.waitingNow.map(({ id }) => id), [1, 2, 6]);
  assert.deepEqual(metrics.pendingNow.map(({ id }) => id), [4]);
  assert.deepEqual(metrics.breachedNow.map(({ id }) => id), [5]);
});

for (const [name, field, completion] of [
  ['time_to_own', 'attentionDueAt', 'firstResponseAt'],
  ['time_to_resolve', 'slaDueAt', 'solvedAt'],
  ['internal_time_to_own', 'internalAttentionDueAt', 'firstResponseAt'],
  ['internal_time_to_resolve', 'internalSlaDueAt', 'solvedAt'],
]) {
  test(`detecta estouro pelo prazo ${name}`, () => {
    const row = ticket({ status: 'Atribuído', [field]: '2026-07-22T14:00:00-03:00' });
    assert.equal(core.isDeadlineBreached(row, field, completion, NOW), true);
    assert.equal(core.isTicketBreached(row, NOW), true);
  });
}

test('idade sem prazo e chamados finalizados não geram estouro', () => {
  assert.equal(core.isTicketBreached(ticket({ openedAt: '2020-01-01T00:00:00-03:00' }), NOW), false);
  assert.equal(core.isTicketBreached(ticket({ status: 'Fechado', slaDueAt: '2026-07-01T00:00:00-03:00' }), NOW), false);
});

test('gráfico usa somente date_assign do dia e deduplica técnico/chamado', () => {
  const duplicate = ticket({ id: 10, status: 'Solucionado', assignedAt: '2026-07-22T08:00:00-03:00', solvedAt: '2026-07-22T09:00:00-03:00' });
  const rows = [
    duplicate,
    { ...duplicate },
    ticket({ id: 11, assignedAt: '2026-07-22T10:00:00-03:00' }),
    ticket({ id: 12, assignedAt: '2026-07-21T10:00:00-03:00', solvedAt: '2026-07-22T10:00:00-03:00' }),
    ticket({ id: 13, assignedAt: null, followupAt: '2026-07-22T10:00:00-03:00', closedAt: '2026-07-22T11:00:00-03:00' }),
  ];
  assert.deepEqual(core.technicianAssignmentsToday(rows, NOW), [{ label: 'Ana Souza', value: 2 }]);
});

test('coordenador bloqueia concorrência e preserva dados após falha', async () => {
  const coordinator = core.createRefreshCoordinator();
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  const first = coordinator.run(['anterior'], async () => { await barrier; return ['novo']; });
  const concurrent = await coordinator.run(['anterior'], async () => ['duplicado']);
  assert.deepEqual(concurrent, { started: false, data: ['anterior'], error: null });
  release();
  assert.deepEqual(await first, { started: true, data: ['novo'], error: null });
  const failed = await coordinator.run(['último válido'], async () => { throw new Error('offline'); });
  assert.equal(failed.started, true);
  assert.deepEqual(failed.data, ['último válido']);
  assert.match(failed.error.message, /offline/);
});
