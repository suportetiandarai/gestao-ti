const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('rotas públicas são independentes do Auth e não possuem referências sensíveis', () => {
  for (const route of ['dashboard-timed/index.html', 'dashboard-treinamentos/index.html', 'dashboard-ad/index.html']) {
    const html = read(route);
    assert.match(html, /noindex, nofollow/);
    assert.doesNotMatch(html, /auth\.js|service_role|private_key|GLPI_.*TOKEN/i);
    assert.match(html, /sheets-dashboard\.js/);
  }
});

test('sincronizador aplica o corte e usa o texto normalizado como fonte do status', () => {
  const shared = read('supabase/functions/_shared/google-sheets.ts');
  const sync = read('supabase/functions/google-sheets-sync/index.ts');
  assert.match(sync, /2026-07-28T00:00:00-03:00/);
  assert.doesNotMatch(sync, /trainingColors|backgroundColor/);
  assert.match(shared, /classifyTrainingStatus/);
  assert.match(shared, /normalizeRequestStatus/);
  assert.match(shared, /already_exists/);
  assert.match(shared, /no_contact/);
  assert.match(shared, /normalized === 'pendente'/);
  assert.match(shared, /return 'not_completed'/);
  assert.match(shared, /minute\.padStart\(2, '0'\)/);
  assert.match(shared, /second\.padStart\(2, '0'\)/);
  assert.match(sync, /timedLegacyPending/);
  assert.match(sync, /!timedLegacyPending/);
});

test('endpoint público usa paginação, ETag e seleção explícita sem payload bruto', () => {
  const endpoint = read('supabase/functions/google-sheets-dashboard-public/index.ts');
  assert.match(endpoint, /If-None-Match/);
  assert.match(endpoint, /status: 304/);
  assert.match(endpoint, /page_size/);
  assert.match(endpoint, /limit=\$\{pageSize\}/);
  assert.match(endpoint, /hidden_after_shift\.gt/);
  assert.match(endpoint, /is_source_present=eq\.true/);
  assert.doesNotMatch(endpoint, /raw_payload|select=\*/);
});

test('cards e listagem usam a mesma visibilidade operacional após a troca de plantão', () => {
  const endpoint = read('supabase/functions/google-sheets-dashboard-public/index.ts');
  const migration = read('supabase/migrations/20260729160000_018_google_sheets_columns_sorting.sql');
  assert.match(endpoint, /rpc\/get_google_sheet_dashboard_summary/);
  assert.match(endpoint, /operationalSummary\.completed_count/);
  assert.match(endpoint, /const summaryVersion = \[/);
  assert.match(endpoint, /`"v2-\$\{snapshot\.snapshot_hash\}-\$\{summaryVersion\}/);
  assert.ok(
    endpoint.indexOf('rpc/get_google_sheet_dashboard_summary') <
      endpoint.indexOf("matchesEtag(request.headers.get('If-None-Match')"),
    'o resumo operacional deve participar do ETag antes de responder 304',
  );
  assert.doesNotMatch(endpoint, /completed: snapshot\.completed_count/);
  assert.match(migration, /request\.hidden_after_shift is null or request\.hidden_after_shift > p_now/);
  assert.match(migration, /request\.is_source_present=true/);
  assert.match(migration, /revoke all on function public\.get_google_sheet_dashboard_summary/);
});

test('migração preserva histórico e registra os horários de status e conclusão', () => {
  const migration = read('supabase/migrations/20260728190000_016_google_sheets_status_shifts.sql');
  assert.match(migration, /status_updated_at timestamptz/);
  assert.match(migration, /completed_at timestamptz/);
  assert.match(migration, /hidden_after_shift timestamptz/);
  assert.match(migration, /is_source_present boolean/);
  assert.match(migration, /mark_missing_google_sheet_requests/);
  assert.doesNotMatch(migration, /\bdelete\s+from\b/i);
});

test('títulos públicos contêm somente os textos operacionais solicitados', () => {
  const timed = read('dashboard-timed/index.html');
  const training = read('dashboard-treinamentos/index.html');
  const ad = read('dashboard-ad/index.html');
  assert.match(timed, /<h1>SOLICITAÇÕES TIMED<\/h1>[\s\S]*Solicitações recebidas a partir de 28\/07\/2026/);
  assert.match(training, /<h1>SOLICITAÇÕES DE TREINAMENTO<\/h1>[\s\S]*Solicitações recebidas a partir de 28\/07\/2026/);
  assert.doesNotMatch(training, /registros antigos|são ignorados/i);
  assert.match(ad, /<h1>SOLICITAÇÕES AD<\/h1>[\s\S]*Solicitações AD recebidas a partir de 28\/07\/2026/);
  assert.doesNotMatch(ad, /Acompanhamento operacional/);
});

test('estado público usa o último sucesso e participa do ETag', () => {
  const endpoint = read('supabase/functions/google-sheets-dashboard-public/index.ts');
  assert.match(endpoint, /age <= 180_000/);
  assert.match(endpoint, /age <= 900_000/);
  assert.match(endpoint, /snapshot\.snapshot_hash/);
  assert.match(endpoint, /summaryVersion}-\$\{status}/);
  assert.match(endpoint, /google_sheet_sync_state\?source=eq/);
});

test('banco impede leitura anônima direta e agenda uma sincronização única', () => {
  const migration = read('supabase/migrations/20260728150000_013_google_sheets_dashboards.sql');
  assert.match(migration, /revoke all on public\.google_sheet_requests from anon,authenticated/);
  assert.match(migration, /gestao-ti-google-sheets-sync/);
  assert.match(migration, /\* \* \* \* \*/);
  assert.match(migration, /lock_expires_at/);
  assert.match(migration, /unique \(source, source_row\)/);
});

test('somente os campos públicos autorizados são renderizados', () => {
  const client = read('sheets-dashboard.js');
  for (const allowed of ['requested_at', 'requester_name', 'sector', 'job_title', 'training_topic', 'scheduled_at', 'pending_reason']) {
    assert.match(client, new RegExp(allowed));
  }
  assert.doesNotMatch(client, /email|telefone|cpf|cns|private_key|access_token/i);
});

test('dashboard AD expõe data, nome, cargo, setor e status operacional', () => {
  const html = read('dashboard-ad/index.html');
  const endpoint = read('supabase/functions/google-sheets-dashboard-public/index.ts');
  assert.match(html, /Data da solicitação/);
  assert.match(html, /<th>Nome<\/th>/);
  assert.match(html, /<th>Cargo<\/th>/);
  assert.match(html, /<th>Setor<\/th>/);
  assert.doesNotMatch(html, /CPF|Celular|E-mail|Observações/i);
  assert.match(endpoint, /source_row,requested_at,requester_name,job_title,sector,dashboard_status/);
});

test('AD resolve e valida o layout atual por cabeçalhos sem expor dados pessoais', () => {
  const sync = read('supabase/functions/google-sheets-sync/index.ts');
  const endpoint = read('supabase/functions/google-sheets-dashboard-public/index.ts');
  assert.match(sync, /\['cpf'\]/);
  assert.match(sync, /\['celular', 'telefone'\]/);
  assert.match(sync, /\['e_mail', 'email'\]/);
  assert.match(sync, /\['observacoes', 'observacao'\]/);
  assert.match(sync, /function validateAdRow/);
  assert.match(sync, /cargo_looks_numeric/);
  assert.match(sync, /sector_looks_numeric/);
  assert.match(sync, /const columnIndexes = config\.headers\.map/);
  assert.match(sync, /values\/\$\{dataRange\}[\s\S]*majorDimension=ROWS/);
  assert.match(sync, /rows\.map\(\(row: unknown\[\]\) => \[row\?\.\[columnIndex\] \?\? ''\]\)/);
  assert.match(sync, /recordsRequested: Math\.max\(0, rowCount - 1\)/);
  assert.match(sync, /records_requested: requested/);
  assert.match(sync, /records_invalid_date: invalidDate/);
  assert.match(sync, /records_missing_name: missingName/);
  assert.match(sync, /records_before_cutoff: beforeCutoff/);
  assert.doesNotMatch(endpoint, /\bcpf\b|\bphone\b|\bemail\b|\bobservations\b/);
});

test('pendentes TIMED anteriores ao corte permanecem e saem quando o status muda', () => {
  const sync = read('supabase/functions/google-sheets-sync/index.ts');
  const migration = read('supabase/migrations/20260730110000_019_timed_legacy_pending.sql');
  assert.match(sync, /classifyTimedStatus\(columns\[4\]\?\.\[index\]\) === 'pending'/);
  assert.match(migration, /p_source='timed'/);
  assert.match(migration, /requested_at < p_cutoff_at/);
  assert.match(migration, /dashboard_status='pending'/);
  assert.doesNotMatch(migration, /\bdelete\s+from\b/i);
});

test('entrada pública encaminha formulários sem expor segredo ou permitir origens arbitrárias', () => {
  const intake = read('supabase/functions/google-sheets-intake/index.ts');
  assert.match(intake, /https:\/\/suportetiandarai\.github\.io/);
  assert.match(intake, /GOOGLE_APPS_SCRIPT_SHARED_SECRET/);
  assert.match(intake, /DUPLICATE_/);
  assert.doesNotMatch(intake, /Access-Control-Allow-Origin': '\*'/);
});

test('dashboards removem Total e mantêm exatamente os três cards operacionais', () => {
  const expectations = {
    'dashboard-timed/index.html': ['Realizados', 'Não realizados', 'Pendentes'],
    'dashboard-ad/index.html': ['Realizados', 'Não realizados', 'Pendentes'],
    'dashboard-treinamentos/index.html': ['Agendados', 'Não agendados', 'Realizados'],
  };
  for (const [file, labels] of Object.entries(expectations)) {
    const html = read(file);
    assert.doesNotMatch(html, /id="summary-total"|<span>Total<\/span>/);
    assert.equal((html.match(/class="sheet-summary-card"/g) || []).length, 3);
    for (const label of labels) assert.match(html, new RegExp(`<span>${label}</span>`));
    const positions = labels.map((label) => html.indexOf(`<span>${label}</span>`));
    assert.deepEqual(positions, [...positions].sort((left, right) => left - right), file);
  }
});

test('TIMED lê o motivo exclusivamente da coluna R e o expõe apenas na resposta autorizada', () => {
  const sync = read('supabase/functions/google-sheets-sync/index.ts');
  const endpoint = read('supabase/functions/google-sheets-dashboard-public/index.ts');
  const client = read('sheets-dashboard.js');
  assert.match(sync, /'Q:Q', 'R:R', 'T:T', 'U:U'/);
  assert.match(sync, /pendingReason = sanitizeText\(columns\[5\]/);
  assert.match(endpoint, /dashboard_status,pending_reason/);
  assert.match(client, /item\.dashboard_status === 'pending'/);
  assert.match(client, /Motivo não informado/);
});

test('migração adiciona motivo da pendência sem liberar leitura pública direta', () => {
  const migration = read('supabase/migrations/20260729123000_017_timed_pending_reason.sql');
  assert.match(migration, /add column if not exists pending_reason text/);
  assert.doesNotMatch(migration, /\bgrant\b[\s\S]*\banon\b/i);
});

test('badges aplicam cor ao status sem criar cor de linha', () => {
  const css = read('sheets-dashboard.css');
  const client = read('sheets-dashboard.js');
  assert.match(css, /\.sheet-status-badge/);
  assert.match(css, /\.status-not_completed,[\s\S]*background: #fee2e2/);
  assert.match(css, /\.status-pending,[\s\S]*background: #fef3c7/);
  assert.match(css, /\.status-completed[\s\S]*background: #dcfce7/);
  assert.match(client, /sheet-status-badge/);
  assert.doesNotMatch(client, /row\.className\s*=\s*.*status/);
});

test('treinamento usa agendamento da coluna M e libera somente a exceção estável da linha 121', () => {
  const sync = read('supabase/functions/google-sheets-sync/index.ts');
  const html = read('dashboard-treinamentos/index.html');
  assert.match(sync, /data_do_agendamento/);
  assert.match(sync, /Luciana Nunes de Sousa/);
  assert.match(sync, /2026-07-27T13:06:21\.000Z/);
  assert.match(sync, /new Date\(requestedAt\) < new Date\(cutoff\)[\s\S]*!legacyTrainingRequest[\s\S]*!timedLegacyPending/);
  assert.doesNotMatch(sync, /sourceRow\s*===\s*121/);
  assert.match(html, /Data e Hora da Solicitação/);
  assert.match(html, /Data e Hora do Agendamento/);
});

test('Desistência é normalizada, estilizada em cinza e excluída dos três indicadores', () => {
  const shared = read('supabase/functions/_shared/google-sheets.ts');
  const sync = read('supabase/functions/google-sheets-sync/index.ts');
  const css = read('sheets-dashboard.css');
  assert.match(shared, /desistencias: 'desistencia'/);
  assert.match(shared, /normalized === 'desistencia'\) return 'withdrawal'/);
  assert.match(css, /\.status-withdrawal/);
  assert.match(sync, /not_scheduled', 'pending', 'no_contact', 'duplicate', 'other'/);
  assert.doesNotMatch(sync, /\['not_scheduled', 'pending', 'no_contact', 'duplicate', 'other', 'withdrawal'\]/);
});

test('migração adiciona agendamento e ordenação paginada sem liberar dados privados', () => {
  const migration = read('supabase/migrations/20260729160000_018_google_sheets_columns_sorting.sql');
  assert.match(migration, /scheduled_at timestamptz/);
  assert.match(migration, /sort_key bigint/);
  assert.match(migration, /'withdrawal'/);
  assert.match(migration, /coalesce\(completed_at,requested_at\)/);
  assert.match(migration, /google_sheet_requests_operational_idx/);
  assert.match(migration, /get_google_sheet_dashboard_summary/);
  assert.doesNotMatch(migration, /\bgrant\b[\s\S]*\banon\b/i);
});
