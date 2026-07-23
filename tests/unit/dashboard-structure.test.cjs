const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..', '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const source = readFileSync(join(root, 'glpi-dashboard.js'), 'utf8');
const edgeSource = readFileSync(join(root, 'supabase', 'functions', 'glpi-dashboard', 'index.ts'), 'utf8');
const assignmentsMigration = readFileSync(join(root, 'supabase', 'migrations', '20260722110000_glpi_ticket_assignments.sql'), 'utf8');
const dailyView = html.match(/<div id="glpi-view-diario"[\s\S]*?<div id="glpi-view-geral"/)?.[0] || '';
const dailyRenderer = source.match(/function renderDailyDashboard\(\)[\s\S]*?function renderBarChart/)?.[0] || '';

test('Dashboard Diário contém somente a estrutura autorizada', () => {
  const labels = ['Chamados abertos no plantão', 'Em atendimento', 'Aguardando atendimento', 'Pendentes', 'Chamados estourados'];
  assert.equal((dailyView.match(/class="glpi-chart"/g) || []).length, 1);
  assert.match(dailyView, /id="glpi-current-shift"/);
  assert.match(dailyView, /Chamados resolvidos por técnico no plantão/);
  assert.match(dailyView, /Últimos chamados registrados/);
  assert.doesNotMatch(dailyView, /Ranking diário dos técnicos|Chamados antigos ainda abertos/);
  assert.equal(labels.filter((label) => dailyRenderer.includes(`['${label}'`)).length, 5);
});

test('modo painel não existe no Diário e permanece disponível no Geral', () => {
  assert.match(html, /class="[^"]*glpi-general-panel-action[^"]*"[^>]*>Modo Painel/);
  assert.match(source, /if \(state\.subtab === 'diario'\)/);
  assert.match(source, /O modo painel está disponível somente no Dashboard Geral/);
  assert.doesNotMatch(dailyView, />Modo Painel</);
  assert.doesNotMatch(dailyView, />Tela cheia</);
});

test('texto detalhado de diagnóstico não aparece na interface', () => {
  assert.doesNotMatch(html, /id="glpi-diagnostic"|Diagnóstico: versão GLPI/);
  assert.doesNotMatch(source, /function renderDiagnostics/);
});

test('HTML não contém IDs duplicados', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test('atualização é manual/automática, exclusiva e preserva o último estado', () => {
  assert.match(source, /state\.subtab === 'diario'\s*\? 30000/);
  assert.match(source, /if \(state\.refreshing\) return false/);
  assert.match(source, /window\.glpiAtualizarAgora = async function/);
  assert.match(source, /await refreshData\(canTriggerSync\(\)\)/);
  assert.match(source, /if \(!state\.tickets\.length\)/);
  assert.match(source, /últimos dados válidos/i);
});

test('dados fictícios exigem ativação explícita e falha real permanece offline', () => {
  assert.match(source, /if \(state\.localConfig\.demoEnabled\)/);
  assert.match(source, /Modo demonstração ativado explicitamente/);
  assert.match(source, /Nenhum dado fictício foi carregado/);
  assert.match(source, /Offline • GLPI/);
  assert.match(source, /integrationStatus === 'online' && lastSuccess && hasRealTickets/);
  assert.doesNotMatch(source, /Nenhum chamado real sincronizado\. Modo demonstração ativado/);
});

test('sincronização inicial e automática não ficam bloqueadas pelo cache vazio', () => {
  assert.match(source, /await refreshData\(canTriggerSync\(\)\)/);
  assert.match(source, /setInterval\(\(\) => \{[\s\S]*refreshData\(canTriggerSync\(\)\)/);
  assert.doesNotMatch(source, /refreshData\(!state\.demo/);
});

test('módulo de regras é carregado antes do dashboard', () => {
  assert.ok(html.indexOf('glpi-dashboard-core.js') < html.indexOf('glpi-dashboard.js'));
});

test('administração oferece conexão segura com Supabase e GLPI', () => {
  assert.match(html, /Conectar serviços/);
  assert.equal((html.match(/class="glpi-service-card"/g) || []).length, 2);
  assert.match(html, /Abrir Supabase/);
  assert.match(html, /Ver instruções de autenticação/);
  assert.match(html, /Abrir GLPI/);
  assert.match(html, /Abrir configuração da API/);
  assert.match(source, /https:\/\/supabase\.com\/dashboard\/account\/tokens/);
  assert.doesNotMatch(html, /GLPI_(?:APP|USER)_TOKEN\s*=\s*[^<\s]+/);
});

test('atribuição real usa relações e histórico quando date_assign não é exposto', () => {
  assert.match(edgeSource, /Ticket\/\$\{ticketId\}\/Ticket_User/);
  assert.match(edgeSource, /Ticket\/\$\{ticketId\}\/Log\?range=0-99/);
  assert.match(edgeSource, /Number\(entry\.id_search_option\) === 5/);
  assert.match(edgeSource, /Number\(relation\.type\) === 2/);
  assert.match(assignmentsMigration, /primary key \(ticket_glpi_id, technician_id\)/i);
  assert.match(source, /glpi_ticket_assignments_dashboard/);
});

test('grupo técnico e responsável pela solução usam as relações reais do GLPI', () => {
  assert.match(edgeSource, /Group_Ticket/);
  assert.match(edgeSource, /Number\(relation\.type\) === 2/);
  assert.match(edgeSource, /ITILSolution/);
  assert.match(edgeSource, /latestSolution/);
  assert.match(edgeSource, /GLPI_TECH_GROUP_ID/);
  assert.match(edgeSource, /GLPI_TECH_GROUP_NAME/);
  assert.match(edgeSource, /Grupo técnico .* não localizado no GLPI/);
});

test('nome do técnico usa firstname antes de realname', () => {
  assert.match(edgeSource, /\[clean\(user\.firstname\), clean\(user\.realname\)\]/);
  assert.doesNotMatch(edgeSource, /\[label\(user\.realname\), label\(user\.firstname\)\]/);
});

test('Edge Function aceita chamada operacional validada pelo gateway sem liberar acesso anônimo', () => {
  assert.match(edgeSource, /trustedOperationalCall/);
  assert.match(edgeSource, /\['service_role', 'postgres'\]\.includes\(operationalRole\)/);
  assert.match(edgeSource, /if \(!supabaseUrl \|\| !serviceKey \|\| !auth\).*401/);
  assert.match(edgeSource, /Acesso restrito a administradores e gestores/);
});

test('bootstrap limita a carga inicial e informa a etapa de falha sem expor credenciais', () => {
  assert.match(edgeSource, /GLPI_SYNC_INITIAL_MAX_PAGES/);
  assert.match(edgeSource, /stage = 'fetch-tickets'/);
  assert.match(edgeSource, /trustedOperationalCall \? \{ diagnostic: message \}/);
  assert.match(edgeSource, /safeError\(error\)/);
  assert.match(edgeSource, /cache: \{/);
  assert.match(edgeSource, /technicians: technicianIds\.size/);
});
