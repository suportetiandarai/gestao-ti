const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../glpi-dashboard-core.js');

test('registro público contém somente campos operacionais autorizados', () => {
  const source = {
    id: 99,
    title: 'Conteúdo confidencial',
    status: 'Novo',
    technician: 'Nome Completo',
    openedAt: '2026-07-22T10:00:00-03:00',
    category: 'Suporte',
    unit: 'Andaraí',
    requester: 'Paciente Exemplo',
    email: 'pessoa@example.test',
    phone: '21999999999',
    description: 'Informação clínica',
    internalFollowup: 'Acompanhamento interno',
    token: 'segredo',
  };
  const result = core.publicTicket(source, { techMode: 'hidden', showTitle: false, showCategory: true, showUnit: false });
  assert.deepEqual(Object.keys(result).sort(), ['category', 'id', 'openedAt', 'status', 'technician']);
  assert.equal(result.technician, 'Técnico');
  assert.doesNotMatch(JSON.stringify(result), /Paciente|example\.test|219999|clínica|interno|segredo/);
});
