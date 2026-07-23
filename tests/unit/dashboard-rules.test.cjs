const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../glpi-dashboard-core.js');

const NOW = new Date('2026-07-23T12:00:00-03:00');

function ticket(overrides = {}) {
  return {
    id: 1,
    status: 'Novo',
    technician: 'Não disponível',
    technicianId: null,
    currentTechnicians: [],
    currentTechnicianCount: 0,
    groupId: 1,
    technicalGroupIds: [1],
    openedAt: '2026-07-23T09:00:00-03:00',
    solvedAt: null,
    closedAt: null,
    solutionTechnician: null,
    solutionTechnicianId: null,
    attentionDueAt: null,
    slaDueAt: null,
    internalAttentionDueAt: null,
    internalSlaDueAt: null,
    ...overrides,
  };
}

function at(localDateTime) {
  return new Date(`${localDateTime}-03:00`);
}

test('plantões usam America/Sao_Paulo e limites 07:00–19:00 / 19:00–07:00', () => {
  assert.equal(core.TIME_ZONE, 'America/Sao_Paulo');
  const day = core.currentShift(at('2026-07-23T12:00:00'));
  assert.equal(day.type, 'Diurno');
  assert.equal(day.start.toISOString(), '2026-07-23T10:00:00.000Z');
  assert.equal(day.end.toISOString(), '2026-07-23T22:00:00.000Z');

  const night = core.currentShift(at('2026-07-23T23:00:00'));
  assert.equal(night.type, 'Noturno');
  assert.equal(night.start.toISOString(), '2026-07-23T22:00:00.000Z');
  assert.equal(night.end.toISOString(), '2026-07-24T10:00:00.000Z');

  const afterMidnight = core.currentShift(at('2026-07-24T00:00:00'));
  assert.equal(afterMidnight.start.toISOString(), night.start.toISOString());
  assert.equal(afterMidnight.end.toISOString(), night.end.toISOString());
});

for (const [time, expected] of [
  ['2026-07-23T07:59:00', 'Diurno'],
  ['2026-07-23T08:00:00', 'Diurno'],
  ['2026-07-23T12:00:00', 'Diurno'],
  ['2026-07-23T19:59:00', 'Noturno'],
  ['2026-07-23T20:00:00', 'Noturno'],
  ['2026-07-23T23:59:00', 'Noturno'],
  ['2026-07-24T00:00:00', 'Noturno'],
  ['2026-07-24T07:59:00', 'Diurno'],
]) {
  test(`seleciona plantão ${expected} às ${time.slice(11)}`, () => {
    assert.equal(core.currentShift(at(time)).type, expected);
  });
}

test('passagens solicitadas permanecem no mesmo plantão sob os limites confirmados', () => {
  assert.equal(core.currentShift(at('2026-07-23T19:59:00')).type, 'Noturno');
  assert.equal(core.currentShift(at('2026-07-23T20:00:00')).type, 'Noturno');
  assert.equal(core.currentShift(at('2026-07-24T07:59:00')).type, 'Diurno');
  assert.equal(core.currentShift(at('2026-07-24T08:00:00')).type, 'Diurno');
});

test('troca automaticamente nos limites reais 06:59→07:00 e 18:59→19:00', () => {
  assert.equal(core.currentShift(at('2026-07-23T06:59:59')).type, 'Noturno');
  assert.equal(core.currentShift(at('2026-07-23T07:00:00')).type, 'Diurno');
  assert.equal(core.currentShift(at('2026-07-23T18:59:59')).type, 'Diurno');
  assert.equal(core.currentShift(at('2026-07-23T19:00:00')).type, 'Noturno');
});

test('filtra grupo técnico 1 e classifica finalizado, atendimento e espera sem sobreposição', () => {
  const rows = [
    ticket({ id: 1 }),
    ticket({ id: 2, technician: 'Ana Souza', technicianId: 10, currentTechnicians: [{ id: 10 }], currentTechnicianCount: 1 }),
    ticket({ id: 3, status: 'Solucionado', technician: 'Ana Souza', technicianId: 10, solvedAt: '2026-07-23T10:00:00-03:00' }),
    ticket({ id: 4, status: 'Fechado', technician: 'Bruno Lima', technicianId: 11, closedAt: '2026-07-23T11:00:00-03:00' }),
    ticket({ id: 5, status: 'Pendente', technician: 'Ana Souza', technicianId: 10, currentTechnicians: [{ id: 10 }], currentTechnicianCount: 1 }),
    ticket({ id: 6, groupId: 3, technicalGroupIds: [3] }),
  ];
  const metrics = core.shiftMetrics(rows, NOW, 1);
  assert.deepEqual(metrics.groupTickets.map(({ id }) => id), [1, 2, 3, 4, 5]);
  assert.deepEqual(metrics.waitingNow.map(({ id }) => id), [1]);
  assert.deepEqual(metrics.inServiceNow.map(({ id }) => id), [2, 5]);
  assert.deepEqual(metrics.resolvedNow.map(({ id }) => id), [3, 4]);
  assert.deepEqual(metrics.pendingNow.map(({ id }) => id), [5]);
});

test('abertos no plantão usam intervalo semiaberto e somente SUPORTE TI', () => {
  const rows = [
    ticket({ id: 1, openedAt: '2026-07-23T07:00:00-03:00' }),
    ticket({ id: 2, openedAt: '2026-07-23T18:59:59-03:00' }),
    ticket({ id: 3, openedAt: '2026-07-23T19:00:00-03:00' }),
    ticket({ id: 4, groupId: 3, technicalGroupIds: [3] }),
  ];
  assert.deepEqual(core.shiftMetrics(rows, NOW, 1).createdInShift.map(({ id }) => id), [1, 2]);
});

for (const [name, field, completion] of [
  ['time_to_own', 'attentionDueAt', 'firstResponseAt'],
  ['time_to_resolve', 'slaDueAt', 'solvedAt'],
  ['internal_time_to_own', 'internalAttentionDueAt', 'firstResponseAt'],
  ['internal_time_to_resolve', 'internalSlaDueAt', 'solvedAt'],
]) {
  test(`detecta estouro pelo prazo ${name}`, () => {
    const row = ticket({ status: 'Atribuído', [field]: '2026-07-23T11:00:00-03:00' });
    assert.equal(core.isDeadlineBreached(row, field, completion, NOW), true);
    assert.equal(core.isTicketBreached(row, NOW), true);
  });
}

test('idade sem prazo e chamados finalizados não geram estouro', () => {
  assert.equal(core.isTicketBreached(ticket({ openedAt: '2020-01-01T00:00:00-03:00' }), NOW), false);
  assert.equal(core.isTicketBreached(ticket({ status: 'Fechado', slaDueAt: '2026-07-01T00:00:00-03:00' }), NOW), false);
});

test('gráfico usa solução/fechamento no plantão, autor da solução e deduplica técnico/chamado', () => {
  const duplicate = ticket({
    id: 10,
    status: 'Solucionado',
    technician: 'Técnico Atual',
    technicianId: 90,
    solutionTechnician: 'Ana Souza',
    solutionTechnicianId: 10,
    solvedAt: '2026-07-23T09:00:00-03:00',
  });
  const rows = [
    duplicate,
    { ...duplicate },
    ticket({ id: 11, status: 'Fechado', technician: 'Bruno Lima', technicianId: 11, closedAt: '2026-07-23T10:00:00-03:00' }),
    ticket({ id: 12, status: 'Solucionado', technician: 'Ana Souza', technicianId: 10, solvedAt: '2026-07-23T06:59:00-03:00' }),
    ticket({ id: 13, status: 'Solucionado', technician: 'Ana Souza', technicianId: 10, solvedAt: '2026-07-23T10:00:00-03:00', groupId: 5, technicalGroupIds: [5] }),
  ];
  assert.deepEqual(core.technicianResolutionsInShift(rows, NOW, 1), [
    { label: 'Ana Souza', value: 1 },
    { label: 'Bruno Lima', value: 1 },
  ]);
});

test('formata nome pelos campos oficiais sem inverter palavras', () => {
  assert.equal(core.formatTechnicianName({ firstname: 'VINICIUS', realname: 'SILVA PASCOAL MANOEL' }), 'VINICIUS SILVA PASCOAL MANOEL');
  assert.equal(core.formatTechnicianName({ firstname: ' Maria  Clara ', realname: ' de  Souza ' }), 'Maria Clara de Souza');
  assert.equal(core.formatTechnicianName({ display_name: 'Nome Completo Oficial', firstname: 'Ignorado' }), 'Nome Completo Oficial');
  assert.equal(core.formatTechnicianName({ firstname: null, realname: undefined, name: 'usuario' }), 'usuario');
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
