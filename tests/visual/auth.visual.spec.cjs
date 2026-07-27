const { test, expect } = require('@playwright/test');

const supabaseMock = `
(() => {
  const scenario = () => window.GESTAO_TI_CONFIG?.AUTH_TEST_SCENARIO || 'success';
  let authListener = null;

  function queryFor(table) {
    const query = {
      select() { return query; },
      eq() { return query; },
      order() { return query; },
      limit() { return query; },
      range() { return query; },
      maybeSingle() { return Promise.resolve({ data: null, error: null }); },
      single() {
        if (table === 'profiles' && scenario() === 'missing-profile') {
          return Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'No rows' } });
        }
        if (table === 'profiles') {
          return Promise.resolve({
            data: {
              id: 'user-test',
              nome: 'Usuário Teste',
              email: 'usuario@example.invalid',
              celular: null,
              cpf: null,
              turno: null,
              role: 'admin'
            },
            error: null
          });
        }
        return Promise.resolve({ data: null, error: null });
      },
      then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); }
    };
    return query;
  }

  const client = {
    auth: {
      onAuthStateChange(callback) {
        authListener = callback;
        return { data: { subscription: { unsubscribe() {} } } };
      },
      getSession() {
        return Promise.resolve({ data: { session: null }, error: null });
      },
      signInWithPassword() {
        if (scenario() === 'timeout') return new Promise(() => {});
        if (scenario() === 'network-error') return Promise.reject(new TypeError('Failed to fetch'));
        if (scenario() === 'invalid') {
          return Promise.resolve({
            data: { user: null, session: null },
            error: { code: 'invalid_credentials', message: 'Invalid login credentials' }
          });
        }
        const user = { id: 'user-test', email: 'usuario@example.invalid' };
        const session = { user };
        queueMicrotask(() => authListener?.('SIGNED_IN', session));
        return Promise.resolve({ data: { user, session }, error: null });
      },
      signOut() {
        if (scenario() === 'timeout') return new Promise(() => {});
        return Promise.resolve({ error: null });
      }
    },
    from(table) { return queryFor(table); }
  };

  window.supabase = { createClient() { return client; } };
})();
`;

async function openLogin(page, scenario) {
  await page.route('https://cdn.jsdelivr.net/**', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: supabaseMock,
  }));
  await page.route('https://cdnjs.cloudflare.com/**', (route) => route.abort());
  await page.route('**/config.js', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: `window.GESTAO_TI_CONFIG={
      SUPABASE_URL:"https://example.supabase.co",
      SUPABASE_PUBLIC_KEY:"sb_publishable_auth_test",
      LOGIN_TIMEOUT_MS:120,
      AUTH_TEST_SCENARIO:${JSON.stringify(scenario)}
    };`,
  }));
  await page.goto('/');
  await expect(page.locator('#login-container')).toBeVisible();
  await page.locator('#login-email').fill('usuario@example.invalid');
  await page.locator('#login-senha').fill('senha-de-teste');
}

test('login correto conclui e restaura o botão', async ({ page }) => {
  await openLogin(page, 'success');
  await page.locator('#btn-login').click();
  await expect(page.locator('#app-wrapper')).toBeVisible();
  await expect(page.locator('#btn-login')).toHaveText('Entrar');
  await expect(page.locator('#btn-login')).toBeEnabled();
});

for (const scenario of [
  {
    name: 'senha incorreta',
    value: 'invalid',
    message: 'E-mail ou senha incorretos.',
  },
  {
    name: 'Supabase indisponível',
    value: 'network-error',
    message: 'Não foi possível concluir o acesso.',
  },
  {
    name: 'timeout',
    value: 'timeout',
    message: 'Não foi possível concluir o acesso.',
  },
  {
    name: 'usuário sem perfil',
    value: 'missing-profile',
    message: 'perfil está bloqueado',
  },
]) {
  test(`${scenario.name} exibe erro e nunca mantém “Entrando...”`, async ({ page }) => {
    await openLogin(page, scenario.value);
    await page.locator('#btn-login').click();
    await expect(page.locator('#toast-container')).toContainText(scenario.message);
    await expect(page.locator('#btn-login')).toHaveText('Entrar');
    await expect(page.locator('#btn-login')).toBeEnabled();
    await expect(page.locator('#login-container')).toBeVisible();
  });
}
