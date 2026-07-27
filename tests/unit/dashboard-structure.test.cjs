const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..', '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const source = readFileSync(join(root, 'glpi-dashboard.js'), 'utf8');
const coreSource = readFileSync(join(root, 'glpi-dashboard-core.js'), 'utf8');
const edgeSource = readFileSync(join(root, 'supabase', 'functions', 'glpi-dashboard', 'index.ts'), 'utf8');
const publicEdgeSource = readFileSync(join(root, 'supabase', 'functions', 'glpi-dashboard-public', 'index.ts'), 'utf8');
const snapshotSource = readFileSync(join(root, 'supabase', 'functions', '_shared', 'dashboard-snapshot.ts'), 'utf8');
const snapshotMigration = readFileSync(join(root, 'supabase', 'migrations', '20260727150000_glpi_dashboard_snapshot.sql'), 'utf8');
const authSource = readFileSync(join(root, 'auth.js'), 'utf8');
const appSource = readFileSync(join(root, 'app.js'), 'utf8');
const serveSource = readFileSync(join(root, 'scripts', 'serve.mjs'), 'utf8');
const buildSource = readFileSync(join(root, 'scripts', 'build.mjs'), 'utf8');
const publicRouteSource = readFileSync(join(root, 'dashboard-diario', 'index.html'), 'utf8');
const styles = readFileSync(join(root, 'styles.css'), 'utf8');
const assignmentsMigration = readFileSync(join(root, 'supabase', 'migrations', '20260722110000_glpi_ticket_assignments.sql'), 'utf8');
const schedulerMigration = readFileSync(join(root, 'supabase', 'migrations', '20260727090000_glpi_backend_scheduler_stable.sql'), 'utf8');
const dailyView = html.match(/<div id="glpi-view-diario"[\s\S]*?<div id="glpi-view-geral"/)?.[0] || '';
const dailyRenderer = source.match(/function renderDailyDashboard\(\)[\s\S]*?function renderBarChart/)?.[0] || '';

test('Dashboard Diário contém somente a estrutura autorizada', () => {
  const labels = ['Chamados abertos', 'Em atendimento', 'Aguardando atendimento', 'Chamados estourados', 'Pendentes'];
  assert.equal((dailyView.match(/class="glpi-chart"/g) || []).length, 1);
  assert.match(dailyView, /id="glpi-current-shift"/);
  assert.match(dailyView, /Chamados resolvidos por técnico no plantão/);
  assert.match(dailyView, /Últimos chamados registrados/);
  assert.doesNotMatch(dailyView, /Ranking diário dos técnicos|Chamados antigos ainda abertos/);
  assert.equal(labels.filter((label) => dailyRenderer.includes(`['${label}'`)).length, 5);
});

test('título do Diário e modo painel compartilhado estão disponíveis', () => {
  assert.match(html, /id="glpi-dashboard-title">DASHBOARD CHAMADOS DIÁRIO/);
  assert.match(html, /id="glpi-dashboard-subtitle">Indicadores de chamados/);
  assert.match(html, /id="glpi-panel-button"[^>]*>Modo Painel/);
  assert.match(html, /id="glpi-fullscreen-button"[^>]*>Entrar em tela cheia/);
  assert.doesNotMatch(source, /O modo painel está disponível somente no Dashboard Geral/);
  assert.match(source, /requestFullscreen/);
  assert.match(source, /exitFullscreen/);
});

test('cards do Diário usam cinco colunas na ordem operacional antes do gráfico', () => {
  const cards = dailyView.indexOf('glpi-daily-kpis');
  const graph = dailyView.indexOf('Chamados resolvidos por técnico no plantão');
  assert.ok(cards >= 0 && graph > cards);
  assert.match(styles, /\.glpi-daily-kpi-grid\s*\{[\s\S]*repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
  assert.ok(
    ['Chamados abertos', 'Em atendimento', 'Aguardando atendimento', 'Chamados estourados', 'Pendentes']
      .every((label, index, labels) => index === 0 || dailyRenderer.indexOf(`['${labels[index - 1]}'`) < dailyRenderer.indexOf(`['${label}'`))
  );
  assert.match(styles, /\.glpi-daily-kpi\s*\{[\s\S]*min-height:\s*108px/);
  assert.match(styles, /body\.glpi-daily-active \.glpi-header h3[\s\S]*clamp/);
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
  assert.match(source, /const DAILY_REFRESH_SECONDS = 30/);
  assert.match(source, /state\.subtab === 'diario'\s*\? DAILY_REFRESH_SECONDS \* 1000/);
  assert.match(source, /if \(state\.refreshing\) return false/);
  assert.match(source, /window\.glpiAtualizarAgora = async function/);
  assert.match(source, /await refreshData\(false\)/);
  assert.match(source, /if \(!state\.tickets\.length\)/);
  assert.match(source, /últimos dados válidos/i);
  assert.equal((source.match(/state\.countdownTimer = setInterval/g) || []).length, 1);
  assert.match(source, /renderDailyTimers\(\)/);
});

test('dados fictícios exigem ativação explícita e falha real permanece offline', () => {
  assert.match(source, /if \(state\.localConfig\.demoEnabled\)/);
  assert.match(source, /Modo demonstração ativado explicitamente/);
  assert.match(source, /Nenhum dado fictício foi carregado/);
  assert.match(source, /Offline • GLPI/);
  assert.match(source, /label: 'Demonstração'/);
  assert.match(source, /CORE\.calculateSyncHealth/);
  assert.doesNotMatch(source, /Offline • Demonstração/);
  assert.doesNotMatch(source, /Nenhum chamado real sincronizado\. Modo demonstração ativado/);
});

test('atualização inicial, automática e pública leem somente o cache', () => {
  assert.match(source, /await refreshData\(false\)/);
  assert.match(source, /setInterval\(\(\) => \{[\s\S]*refreshData\(false\)/);
  assert.match(source, /window\.glpiAtualizarAgora = async function[\s\S]*refreshData\(false\)/);
  assert.match(source, /window\.glpiSincronizarAgora = async function[\s\S]*refreshData\(true\)/);
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
  assert.match(edgeSource, /String\(left\.date_mod\)\.localeCompare\(String\(right\.date_mod\)\)/);
  assert.match(edgeSource, /_dashboard_first_assigned_at/);
  assert.match(edgeSource, /Number\(relation\.type\) === 2/);
  assert.match(assignmentsMigration, /primary key \(ticket_glpi_id, technician_id\)/i);
  assert.match(source, /glpi_ticket_assignments_dashboard/);
});

test('rota pública é exclusiva, não exige usuário e recebe somente payload sanitizado', () => {
  assert.match(authSource, /\/dashboard-diario/);
  assert.match(authSource, /GESTAO_TI_PUBLIC_DASHBOARD = true/);
  assert.match(appSource, /if \(window\.GESTAO_TI_PUBLIC_DASHBOARD\)[\s\S]*idAba = 'aba-glpi'/);
  assert.match(source, /name !== 'diario'/);
  assert.match(serveSource, /dashboard-diario/);
  assert.match(buildSource, /dashboard-diario/);
  assert.doesNotMatch(edgeSource, /action === 'public-dashboard'/);
  assert.match(publicEdgeSource, /PUBLIC_DASHBOARD_ENABLED/);
  assert.match(publicEdgeSource, /gestao_ti_dashboard_snapshot/);
  assert.doesNotMatch(publicEdgeSource, /GLPI_(?:APP|USER)_TOKEN|initSession|raw_payload/);
  assert.match(source, /async function fetchPublicDashboard/);
  assert.match(source, /functions\/v1\/glpi-dashboard-public/);
  assert.match(source, /Authorization: `Bearer \$\{publicKey\}`/);
  assert.doesNotMatch(source.match(/if \(state\.publicMode\)[\s\S]*?\n {8}\}/)?.[0] || '', /supabase\.functions\.invoke/);
  assert.match(authSource, /SUPABASE_CONFIGURADO && !ROTA_DASHBOARD_PUBLICO/);
  assert.doesNotMatch(publicEdgeSource, /requester|description|followup|session-token/i);
  assert.match(html, /meta name="robots" content="noindex,nofollow"/);
});

test('GitHub Pages possui entrada estática para /dashboard-diario/', () => {
  assert.match(publicRouteSource, /meta name="robots" content="noindex, nofollow"/);
  assert.match(publicRouteSource, /fetch\('\.\.\/index\.html'/);
  assert.match(publicRouteSource, /<base href="\.\.\/">/);
  assert.match(publicRouteSource, /history\.replaceState/);
  assert.doesNotMatch(publicRouteSource, /TOKEN|SERVICE_ROLE|APP_TOKEN|USER_TOKEN/i);
});

test('listagem diária contém tempos e remove entidade maior literal', () => {
  assert.match(dailyRenderer, /Tempo de atribuição/);
  assert.match(dailyRenderer, /Tempo de solução/);
  assert.match(dailyRenderer, /Tempo total/);
  assert.match(source, /calculateTicketDurations/);
  assert.doesNotMatch(html, /&#62;?|&gt;/i);
  assert.match(source, /replace\(\/\(\?:&#0\*62;\?\|&gt;\)\/gi, ''\)/);
});

test('cards diários não exibem emojis, ocultam diagnóstico de pendência e centralizam seções', () => {
  assert.doesNotMatch(source, /📥|🛠️|⏳|⏸️|⚠️/u);
  assert.doesNotMatch(source, /Status real 4 • classificação exclusiva/);
  assert.match(source, /Chamados colocados como pendentes/);
  assert.equal((dailyView.match(/class="glpi-daily-section-title"/g) || []).length, 2);
  assert.match(styles, /\.glpi-daily-section-title\s*\{\s*text-align:\s*center/);
});

test('cards centralizam conteúdo e Tempo total sinaliza somente solução registrada', () => {
  assert.match(styles, /\.glpi-daily-kpi\s*\{[\s\S]*display:\s*flex/);
  assert.match(styles, /\.glpi-daily-kpi\s*\{[\s\S]*align-items:\s*center/);
  assert.match(styles, /\.glpi-daily-kpi\s*\{[\s\S]*justify-content:\s*center/);
  assert.match(styles, /\.glpi-daily-kpi\s*\{[\s\S]*text-align:\s*center/);
  assert.match(source, /statusId === CORE\.STATUS_CODE\.SOLVED/);
  assert.match(source, /statusId === CORE\.STATUS_CODE\.CLOSED/);
  assert.match(source, /resolvedStatus && Boolean\(parseDate\(ticket\?\.solvedAt\)\)/);
  assert.match(source, /className = 'ticket-solved-label'/);
  assert.match(styles, /\.ticket-solved-label\s*\{[\s\S]*color:\s*var\(--glpi-success\)/);
});

test('listagem diária prioriza atraso e usa indicadores exclusivos no Tempo total', () => {
  assert.match(source, /CORE\.sortDailyDashboardTickets\(createdInShift, reference\)/);
  assert.match(source, /className = 'ticket-overdue-label'/);
  assert.match(source, /label\.textContent = 'CHAMADO ATRASADO'/);
  assert.match(styles, /\.ticket-overdue-label\s*\{[\s\S]*color:\s*var\(--glpi-danger\)/);
  assert.match(coreSource, /function sortDailyDashboardTickets/);
  assert.match(coreSource, /if \(flags\.isOverdue\) return 1/);
  assert.match(coreSource, /if \(flags\.isResolved\) return 3/);
});

test('dashboard público libera somente título e técnico completos', () => {
  assert.match(snapshotSource, /title: text\(ticket\.title\)/);
  assert.match(snapshotSource, /technician_name: text\(ticket\.technician_name\)/);
  assert.doesNotMatch(snapshotSource, /requester|email|phone|description|followup|token/i);
  assert.doesNotMatch(snapshotSource, /raw_payload/);
  assert.match(coreSource, /title: ticket\.title/);
  assert.match(coreSource, /technician: ticket\.technician/);
  assert.doesNotMatch(source, /Título restrito/);
  assert.match(source, /title: row\.title \|\| row\.name \|\| `Chamado #\$\{row\.ticket_id \|\| row\.glpi_id \|\| row\.id\}`/);
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

test('snapshot resumido e listagem paginada são separados, usam ETag e não carregam payload bruto', () => {
  assert.match(snapshotMigration, /create table if not exists public\.gestao_ti_dashboard_snapshot/i);
  assert.match(snapshotMigration, /create table if not exists public\.gestao_ti_dashboard_shift_tickets/i);
  assert.match(snapshotMigration, /unique \(scope, group_id\)/i);
  assert.doesNotMatch(snapshotMigration, /shift_tickets_json/i);
  assert.match(snapshotMigration, /primary key \(scope, group_id, shift_start, ticket_id\)/i);
  assert.doesNotMatch(snapshotSource, /shiftTickets[\s\S]{0,120}\.slice\(0,\s*10\)/);
  assert.doesNotMatch(source, /createdInShift\.slice\(0,\s*10\)/);
  assert.match(snapshotMigration, /enable row level security/i);
  assert.match(snapshotMigration, /to anon[\s\S]*scope = 'daily_public'/i);
  assert.match(publicEdgeSource, /\.maybeSingle\(\)/);
  assert.match(publicEdgeSource, /resource === 'tickets'/);
  assert.match(publicEdgeSource, /DEFAULT_PAGE_SIZE = 50/);
  assert.match(publicEdgeSource, /\.range\(first, first \+ pageSize - 1\)/);
  assert.match(publicEdgeSource, /gestao_ti_dashboard_shift_tickets/);
  assert.match(publicEdgeSource, /If-None-Match/);
  assert.match(publicEdgeSource, /status: 304/);
  assert.match(publicEdgeSource, /Cache-Control': 'public, max-age=15, stale-while-revalidate=45'/);
  assert.doesNotMatch(publicEdgeSource, /select\(['"]\*['"]\)|raw_payload|limit\(2000\)/);
  assert.match(source, /If-None-Match/);
  assert.match(source, /response\.status === 304/);
  assert.match(source, /resource', 'tickets'/);
  assert.match(source, /pageSize', String\(state\.dailyTicketsPageSize\)/);
  assert.match(source, /glpiPaginaChamadosPlantao/);
});

test('sincronização gera resumo e listagem transacional antes de registrar sucesso', () => {
  const refreshPosition = edgeSource.lastIndexOf("stage = 'refresh-dashboard-snapshot'");
  const successPosition = edgeSource.lastIndexOf("stage = 'update-sync-state'");
  assert.ok(refreshPosition > 0 && successPosition > refreshPosition);
  assert.match(edgeSource, /\.select\(SNAPSHOT_TICKET_COLUMNS\)[\s\S]*\.eq\('group_id', groupId\)/);
  assert.match(edgeSource, /\.in\('status_id', \[1, 2, 3, 4\]\)/);
  assert.match(edgeSource, /opened_at\.gte[\s\S]*assigned_at\.gte[\s\S]*solved_at\.gte[\s\S]*operational_updated_at\.gte/);
  assert.match(edgeSource, /replace_gestao_ti_dashboard_snapshot/);
  assert.match(snapshotMigration, /create or replace function public\.replace_gestao_ti_dashboard_snapshot/i);
  assert.match(snapshotMigration, /grant execute on function public\.replace_gestao_ti_dashboard_snapshot\(jsonb, jsonb\)\s+to service_role/i);
  assert.doesNotMatch(SNAPSHOT_TICKET_COLUMNS_FOR_TEST(edgeSource), /raw_payload/);
});

function SNAPSHOT_TICKET_COLUMNS_FOR_TEST(value) {
  return value.match(/const SNAPSHOT_TICKET_COLUMNS[\s\S]*?\.join\(','\)/)?.[0]
    || snapshotSource.match(/export const SNAPSHOT_TICKET_COLUMNS[\s\S]*?\.join\(','\)/)?.[0]
    || '';
}

test('sincronização centralizada usa cron único de um minuto e lock expirável', () => {
  assert.match(schedulerMigration, /where jobname = 'gestao-ti-glpi-sync'/);
  assert.match(schedulerMigration, /cron\.unschedule\(existing_job\.jobid\)/);
  assert.match(schedulerMigration, /'\* \* \* \* \*'/);
  assert.match(schedulerMigration, /drop function if exists private\.invoke_glpi_scheduled_sync\(integer\)/);
  assert.match(schedulerMigration, /'expectedIntervalSeconds', 60/);
  assert.match(schedulerMigration, /timeout_milliseconds := 50000/);
  assert.match(edgeSource, /GLPI_SYNC_OVERLAP_SECONDS/);
  assert.match(edgeSource, /Sessão GLPI expirada; autenticação renovada/);
});

test('bootstrap limita a carga inicial e informa a etapa de falha sem expor credenciais', () => {
  assert.match(edgeSource, /GLPI_SYNC_INITIAL_MAX_PAGES/);
  assert.match(edgeSource, /stage = 'fetch-tickets'/);
  assert.match(edgeSource, /trustedOperationalCall \? \{ diagnostic: message \}/);
  assert.match(edgeSource, /safeError\(error\)/);
  assert.match(edgeSource, /cache: \{/);
  assert.match(edgeSource, /technicians: technicianIds\.size/);
});
