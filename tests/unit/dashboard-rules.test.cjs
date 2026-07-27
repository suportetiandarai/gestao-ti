const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../glpi-dashboard-core.js');

const NOW = new Date('2026-07-23T12:00:00-03:00');

function ticket(overrides = {}) {
  const row = {
    id: 1,
    status: 'Novo',
    statusId: 1,
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
  if (Object.hasOwn(overrides, 'status') && !Object.hasOwn(overrides, 'statusId')) {
    row.statusId = {
      Novo: 1,
      Atribuído: 2,
      Planejado: 3,
      Pendente: 4,
      Solucionado: 5,
      Fechado: 6,
    }[overrides.status];
  }
  return row;
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

test('filtra grupo técnico 1 e classifica finalizado, pendente, atendimento e espera sem sobreposição', () => {
  const rows = [
    ticket({ id: 1 }),
    ticket({ id: 2, technician: 'Ana Souza', technicianId: 10, currentTechnicians: [{ id: 10 }], currentTechnicianCount: 1 }),
    ticket({ id: 3, status: 'Solucionado', technician: 'Ana Souza', technicianId: 10, solvedAt: '2026-07-23T10:00:00-03:00' }),
    ticket({ id: 4, status: 'Fechado', technician: 'Bruno Lima', technicianId: 11, closedAt: '2026-07-23T11:00:00-03:00' }),
    ticket({ id: 5, status: 'Pendente', technician: 'Ana Souza', technicianId: 10, currentTechnicians: [{ id: 10 }], currentTechnicianCount: 1, slaDueAt: '2026-07-23T11:00:00-03:00' }),
    ticket({ id: 6, groupId: 3, technicalGroupIds: [3] }),
  ];
  const metrics = core.shiftMetrics(rows, NOW, 1);
  assert.deepEqual(metrics.groupTickets.map(({ id }) => id), [1, 2, 3, 4, 5]);
  assert.deepEqual(metrics.waitingNow.map(({ id }) => id), [1]);
  assert.deepEqual(metrics.inServiceNow.map(({ id }) => id), [2]);
  assert.deepEqual(metrics.resolvedNow.map(({ id }) => id), [3, 4]);
  assert.deepEqual(metrics.pendingNow.map(({ id }) => id), [5]);
  assert.deepEqual(metrics.breachedNow.map(({ id }) => id), []);
});

test('status real 4 tem prioridade sobre texto e identifica pendência', () => {
  const flags = core.calculateTicketFlags(ticket({
    status: 'Texto traduzido divergente',
    statusId: 4,
    technician: 'Ana Souza',
    technicianId: 10,
    currentTechnicians: [{ id: 10 }],
    slaDueAt: '2026-07-23T11:00:00-03:00',
  }), NOW);
  assert.equal(core.STATUS_CODE.PENDING, 4);
  assert.equal(flags.statusCode, 4);
  assert.equal(flags.isPending, true);
  assert.equal(flags.isInProgress, false);
  assert.equal(flags.isWaiting, false);
  assert.equal(flags.isOverdue, false);
});

for (const scenario of [
  {
    name: 'pendente com técnico e SLA vencido aparece somente em Pendentes',
    row: { status: 'Pendente', statusId: 4, technician: 'Ana Souza', technicianId: 10, currentTechnicians: [{ id: 10 }], slaDueAt: '2026-07-23T11:00:00-03:00' },
    expected: { isPending: true, isInProgress: false, isWaiting: false, isOverdue: false },
  },
  {
    name: 'pendente sem técnico e SLA vencido aparece somente em Pendentes',
    row: { status: 'Pendente', statusId: 4, slaDueAt: '2026-07-23T11:00:00-03:00' },
    expected: { isPending: true, isInProgress: false, isWaiting: false, isOverdue: false },
  },
  {
    name: 'em andamento com técnico e SLA válido aparece em atendimento',
    row: { status: 'Atribuído', statusId: 2, technician: 'Ana Souza', technicianId: 10, currentTechnicians: [{ id: 10 }], slaDueAt: '2026-07-23T13:00:00-03:00' },
    expected: { isPending: false, isInProgress: true, isWaiting: false, isOverdue: false },
  },
  {
    name: 'em andamento com técnico e SLA vencido aparece em atendimento e estourado',
    row: { status: 'Atribuído', statusId: 2, technician: 'Ana Souza', technicianId: 10, currentTechnicians: [{ id: 10 }], slaDueAt: '2026-07-23T11:00:00-03:00' },
    expected: { isPending: false, isInProgress: true, isWaiting: false, isOverdue: true },
  },
  {
    name: 'solucionado com técnico e SLA vencido não aparece nos três cards',
    row: { status: 'Solucionado', statusId: 5, technician: 'Ana Souza', technicianId: 10, currentTechnicians: [{ id: 10 }], slaDueAt: '2026-07-23T11:00:00-03:00' },
    expected: { isPending: false, isInProgress: false, isWaiting: false, isOverdue: false },
  },
  {
    name: 'novo sem técnico e SLA válido fica aguardando atendimento',
    row: { status: 'Novo', statusId: 1, slaDueAt: '2026-07-23T13:00:00-03:00' },
    expected: { isPending: false, isInProgress: false, isWaiting: true, isOverdue: false },
  },
]) {
  test(scenario.name, () => {
    const flags = core.calculateTicketFlags(ticket(scenario.row), NOW);
    assert.deepEqual({
      isPending: flags.isPending,
      isInProgress: flags.isInProgress,
      isWaiting: flags.isWaiting,
      isOverdue: flags.isOverdue,
    }, scenario.expected);
  });
}

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

test('listagem diária prioriza estourados, não solucionados e solucionados com ordem interna estável', () => {
  const rows = [
    ticket({ id: 1, status: 'Solucionado', openedAt: '2026-07-23T07:10:00-03:00', solvedAt: '2026-07-23T10:00:00-03:00' }),
    ticket({ id: 2, status: 'Atribuído', openedAt: '2026-07-23T09:00:00-03:00', slaDueAt: '2026-07-23T11:30:00-03:00' }),
    ticket({ id: 3, status: 'Novo', openedAt: '2026-07-23T07:30:00-03:00' }),
    ticket({ id: 4, status: 'Atribuído', openedAt: '2026-07-23T08:00:00-03:00', slaDueAt: '2026-07-23T10:00:00-03:00' }),
    ticket({ id: 5, status: 'Solucionado', openedAt: '2026-07-23T07:20:00-03:00', solvedAt: '2026-07-23T11:00:00-03:00' }),
    ticket({ id: 6, status: 'Pendente', openedAt: '2026-07-23T08:30:00-03:00', slaDueAt: '2026-07-23T09:00:00-03:00' }),
    ticket({ id: 7, status: 'Atribuído', openedAt: '2026-07-23T08:30:00-03:00' }),
  ];

  assert.deepEqual(core.sortDailyDashboardTickets(rows, NOW).map(({ id }) => id), [
    4, 2,
    3, 6, 7,
    5, 1,
  ]);
  assert.equal(core.dailyDashboardTicketPriority(rows[3], NOW), 1);
  assert.equal(core.dailyDashboardTicketPriority(rows[5], NOW), 2);
  assert.equal(core.dailyDashboardTicketPriority(rows[0], NOW), 3);
  assert.equal(core.expiredDeadlineAt(rows[3], NOW).toISOString(), '2026-07-23T13:00:00.000Z');
});

test('gráfico usa solved_at no plantão, autor da solução e deduplica técnico/chamado', () => {
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
    ticket({
      id: 11,
      status: 'Fechado',
      technician: 'Técnico Atual',
      technicianId: 91,
      solutionTechnician: 'Bruno Lima',
      solutionTechnicianId: 11,
      solvedAt: '2026-07-23T10:00:00-03:00',
      closedAt: '2026-07-23T10:30:00-03:00',
    }),
    ticket({ id: 12, status: 'Solucionado', technician: 'Ana Souza', technicianId: 10, solvedAt: '2026-07-23T06:59:00-03:00' }),
    ticket({
      id: 13,
      status: 'Solucionado',
      solutionTechnician: 'Ana Souza',
      solutionTechnicianId: 10,
      solvedAt: '2026-07-23T10:00:00-03:00',
      groupId: 5,
      technicalGroupIds: [5],
    }),
  ];
  assert.deepEqual(core.technicianResolutionsInShift(rows, NOW, 1), [
    { label: 'Ana Souza', value: 1 },
    { label: 'Bruno Lima', value: 1 },
  ]);
});

test('fechamento no plantão não move solução antiga para a produtividade atual', () => {
  const rows = [
    ticket({
      id: 20,
      status: 'Fechado',
      technician: 'Cabrine Lopo Mendes',
      technicianId: 46,
      solutionTechnician: 'Cabrine Lopo Mendes',
      solutionTechnicianId: 46,
      solvedAt: '2026-07-22T10:00:00-03:00',
      closedAt: '2026-07-23T10:00:00-03:00',
    }),
  ];
  assert.deepEqual(core.technicianResolutionsInShift(rows, NOW, 1), []);
});

test('técnico atual, último atualizador e membro do grupo não substituem autor da solução', () => {
  const rows = [
    ticket({
      id: 21,
      status: 'Solucionado',
      technician: 'Técnico atualmente atribuído',
      technicianId: 43,
      solvedAt: '2026-07-23T09:30:00-03:00',
      usersIdLastUpdater: 43,
    }),
    ticket({
      id: 22,
      status: 'Solucionado',
      technician: 'Técnico removido antes da solução',
      technicianId: 44,
      solutionTechnician: 'Autora Real',
      solutionTechnicianId: 45,
      solvedAt: '2026-07-23T10:30:00-03:00',
      usersIdLastUpdater: 43,
    }),
  ];
  assert.deepEqual(core.technicianResolutionsInShift(rows, NOW, 1), [
    { label: 'Autora Real', value: 1 },
  ]);
});

test('técnicos citados só aparecem com solução própria válida no plantão', () => {
  const invalidNames = [
    ['Cabrine Lopo Mendes', 46],
    ['Rafael Correa', 22],
    ['Joao Vitor Araujo', 39],
    ['João Monteiro', 45],
    ['Joatan Renan Oliveira da Silva', 47],
  ];
  const rows = invalidNames.map(([name, id], index) => ticket({
    id: 100 + index,
    status: 'Fechado',
    technician: name,
    technicianId: id,
    solutionTechnician: name,
    solutionTechnicianId: id,
    solvedAt: '2026-07-22T10:00:00-03:00',
    closedAt: '2026-07-23T10:00:00-03:00',
  }));
  assert.deepEqual(core.technicianResolutionsInShift(rows, NOW, 1), []);
});

test('formata nome pelos campos oficiais sem inverter palavras', () => {
  assert.equal(core.formatTechnicianName({ firstname: 'VINICIUS', realname: 'SILVA PASCOAL MANOEL' }), 'VINICIUS SILVA PASCOAL MANOEL');
  assert.equal(core.formatTechnicianName({ firstname: ' Maria  Clara ', realname: ' de  Souza ' }), 'Maria Clara de Souza');
  assert.equal(core.formatTechnicianName({ display_name: 'Nome Completo Oficial', firstname: 'Ignorado' }), 'Nome Completo Oficial');
  assert.equal(core.formatTechnicianName({ firstname: null, realname: undefined, name: 'usuario' }), 'usuario');
});

test('tempo de atribuição continua contando enquanto não há técnico', () => {
  const durations = core.calculateTicketDurations(ticket({
    openedAt: '2026-07-23T08:10:00-03:00',
    assignedAt: null,
  }), new Date('2026-07-23T08:32:00-03:00'));
  assert.equal(durations.assignmentSeconds, 22 * 60);
  assert.equal(durations.solutionSeconds, 0);
  assert.equal(durations.totalSeconds, 22 * 60);
});

test('tempo de atribuição congela na primeira atribuição', () => {
  const durations = core.calculateTicketDurations(ticket({
    openedAt: '2026-07-23T08:10:00-03:00',
    firstAssignedAt: '2026-07-23T08:40:00-03:00',
  }), new Date('2026-07-23T12:00:00-03:00'));
  assert.equal(durations.assignmentSeconds, 30 * 60);
});

test('tempo de solução conta após atribuição e congela na solução', () => {
  const inProgress = ticket({
    openedAt: '2026-07-23T08:40:00-03:00',
    firstAssignedAt: '2026-07-23T09:00:00-03:00',
  });
  assert.equal(
    core.calculateTicketDurations(inProgress, new Date('2026-07-23T10:15:00-03:00')).solutionSeconds,
    75 * 60,
  );
  const solved = ticket({
    status: 'Solucionado',
    openedAt: '2026-07-23T08:40:00-03:00',
    firstAssignedAt: '2026-07-23T09:00:00-03:00',
    solvedAt: '2026-07-23T11:00:00-03:00',
  });
  assert.equal(
    core.calculateTicketDurations(solved, new Date('2026-07-23T15:00:00-03:00')).solutionSeconds,
    2 * 3600,
  );
});

test('tempo total equivale à atribuição mais solução', () => {
  const durations = core.calculateTicketDurations(ticket({
    status: 'Solucionado',
    openedAt: '2026-07-23T08:40:00-03:00',
    firstAssignedAt: '2026-07-23T09:00:00-03:00',
    solvedAt: '2026-07-23T11:00:00-03:00',
  }), new Date('2026-07-23T15:00:00-03:00'));
  assert.equal(durations.totalSeconds, durations.assignmentSeconds + durations.solutionSeconds);
  assert.equal(core.formatElapsedTime(durations.totalSeconds), '02:20:00');
  assert.equal(core.formatElapsedTime(2 * 86400 + 4 * 3600 + 15 * 60 + 20), '2d 04:15:20');
  assert.equal(core.formatElapsedTime(null), 'Não disponível');
});

test('saúde da sincronização respeita três ciclos de tolerância e recupera após sucesso', () => {
  const reference = new Date('2026-07-23T15:00:00Z');
  assert.equal(core.calculateSyncHealth({
    status: 'online',
    last_success_at: '2026-07-23T14:59:40Z',
  }, reference, 90), 'online');
  assert.equal(core.calculateSyncHealth({
    status: 'online',
    last_success_at: '2026-07-23T14:59:25Z',
  }, reference, 90), 'online');
  assert.equal(core.calculateSyncHealth({
    status: 'online',
    last_success_at: '2026-07-23T14:58:29Z',
  }, reference, 90), 'delayed');
  assert.equal(core.calculateSyncHealth({
    status: 'offline',
    last_success_at: '2026-07-23T14:59:55Z',
  }, reference, 90), 'offline');
  assert.equal(core.calculateSyncHealth({
    status: 'online',
    last_success_at: '2026-07-23T14:59:59Z',
  }, reference, 90), 'online');
});

test('saúde da sincronização compara instantes sem aplicar fuso duas vezes', () => {
  assert.equal(core.calculateSyncHealth({
    status: 'online',
    last_success_at: '2026-07-23T11:59:30-03:00',
  }, new Date('2026-07-23T15:00:00Z'), 90), 'online');
  assert.equal(core.calculateSyncHealth({ status: 'online', last_success_at: null }, NOW, 90), 'offline');
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
