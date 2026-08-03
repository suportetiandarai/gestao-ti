const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../sheets-dashboard-core.js');

function local(iso) {
  return new Date(`${iso}-03:00`);
}

test('normaliza status ignorando caixa, espaços e acentos', () => {
  assert.equal(core.normalizeStatus(' REALIZADO '), 'realizado');
  assert.equal(core.normalizeStatus('Já Existente'), 'ja_existente');
  assert.equal(core.normalizeStatus('SEM CONTATO'), 'sem_contato');
  assert.equal(core.normalizeStatus(' DESISTÊNCIA '), 'desistencia');
  assert.equal(core.normalizeStatus(' desisntencia '), 'withdrawal');
});

test('seleciona plantões exatamente às 07:00 e 19:00 em São Paulo', () => {
  const cases = [
    ['2026-07-28T06:59:59', 'night', '2026-07-27T22:00:00.000Z', '2026-07-28T10:00:00.000Z'],
    ['2026-07-28T07:00:00', 'day', '2026-07-28T10:00:00.000Z', '2026-07-28T22:00:00.000Z'],
    ['2026-07-28T12:00:00', 'day', '2026-07-28T10:00:00.000Z', '2026-07-28T22:00:00.000Z'],
    ['2026-07-28T18:59:59', 'day', '2026-07-28T10:00:00.000Z', '2026-07-28T22:00:00.000Z'],
    ['2026-07-28T19:00:00', 'night', '2026-07-28T22:00:00.000Z', '2026-07-29T10:00:00.000Z'],
    ['2026-07-28T23:59:59', 'night', '2026-07-28T22:00:00.000Z', '2026-07-29T10:00:00.000Z'],
    ['2026-07-29T00:00:00', 'night', '2026-07-28T22:00:00.000Z', '2026-07-29T10:00:00.000Z'],
    ['2026-07-29T06:59:59', 'night', '2026-07-28T22:00:00.000Z', '2026-07-29T10:00:00.000Z']
  ];
  for (const [time, type, start, end] of cases) {
    const shift = core.getCurrentShift(local(time));
    assert.equal(shift.type, type, time);
    assert.equal(shift.start.toISOString(), start, `${time} início`);
    assert.equal(shift.end.toISOString(), end, `${time} fim`);
  }
});

test('retorna o intervalo e o subtítulo exato do plantão', () => {
  const day = core.getCurrentShiftRange(local('2026-07-30T12:00:00'));
  assert.equal(day.shiftStart.toISOString(), '2026-07-30T10:00:00.000Z');
  assert.equal(day.shiftEnd.toISOString(), '2026-07-30T22:00:00.000Z');
  assert.equal(day.shiftLabel, '30/07/2026, 07:00 até 30/07/2026, 19:00');

  const night = core.getCurrentShiftRange(local('2026-07-30T23:00:00'));
  assert.equal(night.shiftStart.toISOString(), '2026-07-30T22:00:00.000Z');
  assert.equal(night.shiftEnd.toISOString(), '2026-07-31T10:00:00.000Z');
  assert.equal(night.shiftLabel, '30/07/2026, 19:00 até 31/07/2026, 07:00');
});

test('oculta concluídos somente depois da troca e mantém pendentes', () => {
  const beforeDayEnd = local('2026-07-28T18:59:59');
  const atNightStart = local('2026-07-28T19:00:00');
  const completedDay = { dashboard_status: 'completed', completed_at: local('2026-07-28T15:00:00').toISOString() };
  assert.equal(core.shouldHideTimedRequest(completedDay, beforeDayEnd), false);
  assert.equal(core.shouldHideTimedRequest(completedDay, atNightStart), true);
  assert.equal(core.shouldHideTimedRequest({ dashboard_status: 'pending', completed_at: null }, atNightStart), false);
  assert.equal(core.shouldHideTimedRequest({ dashboard_status: 'completed', completed_at: null }, atNightStart), false);
});

test('AD e Treinamento respeitam estados conclusivos e persistentes', () => {
  const nextShift = local('2026-07-28T19:00:00');
  const completedAt = local('2026-07-28T15:00:00').toISOString();
  assert.equal(core.shouldHideAdRequest({ dashboard_status: 'already_exists', completed_at: completedAt }, nextShift), true);
  assert.equal(core.shouldHideAdRequest({ dashboard_status: 'not_completed', completed_at: null }, nextShift), false);
  assert.equal(core.shouldHideTrainingRequest({ dashboard_status: 'completed', completed_at: completedAt }, nextShift), true);
  assert.equal(core.shouldHideTrainingRequest({ dashboard_status: 'withdrawal', completed_at: null }, nextShift), true);
  assert.equal(core.shouldHideTrainingRequest({ dashboard_status: 'desistencia', completed_at: null }, nextShift), true);
  assert.equal(core.shouldHideTrainingRequest({ dashboard_status: 'desisntencia', completed_at: null }, nextShift), true);
  for (const status of ['scheduled', 'not_scheduled', 'no_contact', 'duplicate', 'other']) {
    assert.equal(core.shouldHideTrainingRequest({ dashboard_status: status, completed_at: completedAt }, nextShift), false, status);
  }
});

test('ordena AD e TIMED por prioridade operacional e conclusão mais recente', () => {
  const rows = [
    { source_row: 4, dashboard_status: 'completed', requested_at: '2026-07-28T10:00:00Z', completed_at: '2026-07-28T13:00:00Z' },
    { source_row: 2, dashboard_status: 'pending', requested_at: '2026-07-28T09:00:00Z' },
    { source_row: 1, dashboard_status: 'not_completed', requested_at: '2026-07-28T11:00:00Z' },
    { source_row: 5, dashboard_status: 'completed', requested_at: '2026-07-28T08:00:00Z', completed_at: '2026-07-28T15:00:00Z' },
    { source_row: 3, dashboard_status: 'not_completed', requested_at: '2026-07-28T07:00:00Z' }
  ];
  assert.deepEqual(core.sortAdRequests(rows).map((row) => row.source_row), [3, 1, 2, 5, 4]);
  assert.deepEqual(core.sortTimedRequests(rows).map((row) => row.source_row), [3, 1, 2, 5, 4]);
});

test('ordena treinamento e mantém Desistência fora dos três grupos principais', () => {
  const rows = [
    { source_row: 7, dashboard_status: 'completed', requested_at: '2026-07-28T10:00:00Z' },
    { source_row: 6, dashboard_status: 'scheduled', requested_at: '2026-07-28T10:00:00Z' },
    { source_row: 5, dashboard_status: 'withdrawal', requested_at: '2026-07-28T10:00:00Z' },
    { source_row: 4, dashboard_status: 'other', requested_at: '2026-07-28T10:00:00Z' },
    { source_row: 3, dashboard_status: 'duplicate', requested_at: '2026-07-28T10:00:00Z' },
    { source_row: 2, dashboard_status: 'no_contact', requested_at: '2026-07-28T10:00:00Z' },
    { source_row: 1, dashboard_status: 'not_scheduled', requested_at: '2026-07-28T10:00:00Z' }
  ];
  assert.deepEqual(core.sortTrainingRequests(rows).map((row) => row.dashboard_status), [
    'not_scheduled', 'no_contact', 'duplicate', 'other', 'withdrawal', 'scheduled', 'completed'
  ]);
});

test('ordena treinamento por agendamento crescente e realizados por conclusão decrescente', () => {
  const rows = [
    { source_row: 1, dashboard_status: 'not_scheduled', requested_at: '2026-08-10T10:00:00Z' },
    { source_row: 2, dashboard_status: 'not_scheduled', requested_at: '2026-07-31T10:00:00Z' },
    { source_row: 3, dashboard_status: 'scheduled', requested_at: '2026-07-28T10:00:00Z', scheduled_at: '2026-08-10T12:00:00Z' },
    { source_row: 4, dashboard_status: 'scheduled', requested_at: '2026-07-29T10:00:00Z', scheduled_at: '2026-08-02T12:00:00Z' },
    { source_row: 5, dashboard_status: 'completed', completed_at: '2026-07-30T11:00:00Z' },
    { source_row: 6, dashboard_status: 'completed', completed_at: '2026-07-30T15:00:00Z' },
  ];
  assert.deepEqual(core.sortTrainingRequests(rows).map((row) => row.source_row), [2, 1, 4, 3, 6, 5]);
});
