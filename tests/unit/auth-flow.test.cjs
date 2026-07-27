const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..', '..');
const authSource = readFileSync(join(root, 'auth.js'), 'utf8');

test('login possui timeout de 15 segundos e mensagem sanitizada', () => {
  assert.match(authSource, /LOGIN_TIMEOUT_MS[\s\S]*15000/);
  assert.match(authSource, /class AuthTimeoutError/);
  assert.match(
    authSource,
    /Não foi possível concluir o acesso\. Verifique sua conexão e tente novamente\./,
  );
  assert.doesNotMatch(authSource, /Não foi possível entrar: \$\{error\.message\}/);
});

test('estado do botão é restaurado obrigatoriamente no finally', () => {
  const loginStart = authSource.indexOf('async function realizarLogin()');
  const loginEnd = authSource.indexOf('async function solicitarRedefinicaoSenha');
  const loginFunction = authSource.slice(loginStart, loginEnd);

  assert.ok(loginStart >= 0 && loginEnd > loginStart);
  assert.match(loginFunction, /finally\s*\{/);
  assert.match(loginFunction, /loginEmAndamento = false/);
  assert.match(loginFunction, /botao\.disabled = false/);
  assert.match(loginFunction, /botao\.textContent = 'Entrar'/);
  assert.doesNotMatch(loginFunction, /catch \(error\) \{\s*await supabase\.auth\.signOut/);
});

test('diagnóstico do login registra etapas sem credenciais ou sessão', () => {
  for (const stage of [
    'form_submitted',
    'authentication_started',
    'auth_response_received',
    'session_created',
    'profile_requested',
    'profile_loaded',
    'redirect_started',
    'dashboard_loaded',
  ]) {
    assert.match(authSource, new RegExp(`registrarEtapaLogin\\('${stage}'`));
  }

  const logger = authSource.match(
    /function registrarEtapaLogin[\s\S]*?\n}\n\nfunction comTimeout/,
  )?.[0] || '';
  assert.doesNotMatch(logger, /email|senha|password|token|session/i);
});

test('listener não duplica o carregamento do perfil durante login explícito', () => {
  assert.match(authSource, /evento === 'SIGNED_IN' && loginEmAndamento/);
  assert.match(authSource, /if \(loginEmAndamento\) return/);
});
