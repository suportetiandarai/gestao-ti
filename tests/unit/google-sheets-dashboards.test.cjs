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
  assert.match(shared, /normalizeStatus/);
  assert.match(shared, /already_exists/);
  assert.match(shared, /no_contact/);
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
  assert.match(timed, /<h1>Solicitações TIMED<\/h1>[\s\S]*Solicitações recebidas a partir de 28\/07\/2026/);
  assert.match(training, /<h1>Solicitações de Treinamento<\/h1>[\s\S]*Solicitações recebidas a partir de 28\/07\/2026/);
  assert.doesNotMatch(training, /registros antigos|são ignorados/i);
  assert.match(ad, /<h1>Solicitações AD<\/h1>[\s\S]*Solicitações AD recebidas a partir de 28\/07\/2026/);
  assert.doesNotMatch(ad, /Acompanhamento operacional/);
});

test('estado público usa o último sucesso e participa do ETag', () => {
  const endpoint = read('supabase/functions/google-sheets-dashboard-public/index.ts');
  assert.match(endpoint, /age <= 180_000/);
  assert.match(endpoint, /age <= 900_000/);
  assert.match(endpoint, /snapshot\.snapshot_hash}-\$\{status}/);
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
  for (const allowed of ['requested_at', 'requester_name', 'sector', 'job_title', 'training_topic']) {
    assert.match(client, new RegExp(allowed));
  }
  assert.doesNotMatch(client, /email|telefone|cpf|cns|motivo|private_key|access_token/i);
});

test('dashboard AD expõe somente data, nome e status operacional', () => {
  const html = read('dashboard-ad/index.html');
  const endpoint = read('supabase/functions/google-sheets-dashboard-public/index.ts');
  assert.match(html, /Data da solicitação/);
  assert.match(html, /<th>Nome<\/th>/);
  assert.doesNotMatch(html, /CPF|Celular|E-mail|Observações/i);
  assert.match(endpoint, /source === 'timed'[\s\S]*requester_name,dashboard_status/);
});

test('entrada pública encaminha formulários sem expor segredo ou permitir origens arbitrárias', () => {
  const intake = read('supabase/functions/google-sheets-intake/index.ts');
  assert.match(intake, /https:\/\/suportetiandarai\.github\.io/);
  assert.match(intake, /GOOGLE_APPS_SCRIPT_SHARED_SECRET/);
  assert.match(intake, /DUPLICATE_/);
  assert.doesNotMatch(intake, /Access-Control-Allow-Origin': '\*'/);
});
