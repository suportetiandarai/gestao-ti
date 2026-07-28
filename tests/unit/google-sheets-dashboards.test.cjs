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

test('sincronizador aplica o corte, ignora vermelho e mantém os status esperados', () => {
  const shared = read('supabase/functions/_shared/google-sheets.ts');
  const sync = read('supabase/functions/google-sheets-sync/index.ts');
  assert.match(sync, /2026-07-28T00:00:00-03:00/);
  assert.match(sync, /colorStatus === 'ignore'/);
  assert.match(shared, /CADASTRADO/);
  assert.match(shared, /PENDENTE/);
  assert.match(shared, /return 'scheduled'/);
  assert.match(shared, /return 'not_scheduled'/);
});

test('endpoint público usa paginação, ETag e seleção explícita sem payload bruto', () => {
  const endpoint = read('supabase/functions/google-sheets-dashboard-public/index.ts');
  assert.match(endpoint, /If-None-Match/);
  assert.match(endpoint, /status: 304/);
  assert.match(endpoint, /page_size/);
  assert.match(endpoint, /limit=\$\{pageSize\}/);
  assert.doesNotMatch(endpoint, /raw_payload|select=\*/);
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
