const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..', '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const source = readFileSync(join(root, 'glpi-dashboard.js'), 'utf8');
const dailyView = html.match(/<div id="glpi-view-diario"[\s\S]*?<div id="glpi-view-geral"/)?.[0] || '';
const dailyRenderer = source.match(/function renderDailyDashboard\(\)[\s\S]*?function renderBarChart/)?.[0] || '';

test('Dashboard Diário contém somente a estrutura autorizada', () => {
  const labels = ['Chamados abertos hoje', 'Em atendimento', 'Aguardando atendimento', 'Pendentes', 'Chamados estourados'];
  assert.equal((dailyView.match(/class="glpi-chart"/g) || []).length, 1);
  assert.match(dailyView, /Últimos chamados registrados/);
  assert.doesNotMatch(dailyView, /Ranking diário dos técnicos|Chamados antigos ainda abertos/);
  assert.equal(labels.filter((label) => dailyRenderer.includes(`['${label}'`)).length, 5);
});

test('HTML não contém IDs duplicados', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test('atualização é manual/automática, exclusiva e preserva o último estado', () => {
  assert.match(source, /state\.subtab === 'diario'\s*\? 30000/);
  assert.match(source, /if \(state\.refreshing\) return false/);
  assert.match(source, /window\.glpiAtualizarAgora = async function/);
  assert.match(source, /await refreshData\(!window\.GESTAO_TI_PUBLIC_DASHBOARD\)/);
  assert.match(source, /if \(!state\.tickets\.length\)/);
  assert.match(source, /últimos dados válidos/i);
});

test('módulo de regras é carregado antes do dashboard', () => {
  assert.ok(html.indexOf('glpi-dashboard-core.js') < html.indexOf('glpi-dashboard.js'));
});
