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
  for (const status of ['scheduled', 'not_scheduled', 'no_contact', 'duplicate', 'other']) {
    assert.equal(core.shouldHideTrainingRequest({ dashboard_status: status, completed_at: completedAt }, nextShift), false, status);
  }
});
