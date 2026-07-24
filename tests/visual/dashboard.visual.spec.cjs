const { test, expect } = require('@playwright/test');

const viewports = [
  { name: 'desktop', width: 1920, height: 1080 },
  { name: 'notebook', width: 1366, height: 768 },
  { name: 'compacto', width: 1024, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'celular', width: 390, height: 844 },
];

async function preparePage(page, viewport) {
  await page.setViewportSize(viewport);
  await page.route('**/config.js', (route) => route.fulfill({ contentType: 'text/javascript', body: 'window.GESTAO_TI_CONFIG={SUPABASE_PUBLIC_KEY:""};' }));
  await page.route('https://cdn.jsdelivr.net/**', (route) => route.abort());
  await page.route('https://cdnjs.cloudflare.com/**', (route) => route.abort());
  await page.goto('/');
  await page.evaluate(() => {
    window.aplicarLayout('autenticado');
    window.perfilAtual = { role: 'admin', nome: 'Teste' };
    window.abrirAba('aba-glpi', false);
    window.glpiAbrirSubaba('diario');
  });
  await expect(page.locator('#glpi-view-diario')).toBeVisible();
}

async function prepareAuthenticatedDashboard(page, viewport) {
  await page.setViewportSize(viewport);
  await page.route('**/config.js', (route) => route.fulfill({ contentType: 'text/javascript', body: 'window.GESTAO_TI_CONFIG={SUPABASE_PUBLIC_KEY:""};' }));
  await page.route('https://cdn.jsdelivr.net/**', (route) => route.abort());
  await page.route('https://cdnjs.cloudflare.com/**', (route) => route.abort());
  await page.goto('/');
  await page.evaluate(() => {
    window.aplicarLayout('autenticado');
    window.perfilAtual = { role: 'admin', nome: 'Teste' };
    window.abrirAba('aba-glpi', false);
    window.glpiAbrirSubaba('geral');
  });
  await expect(page.locator('#glpi-view-geral')).toBeVisible();
}

async function preparePublicDashboard(
  page,
  viewport = { width: 1366, height: 768 },
  path = '/dashboard-diario',
) {
  await page.setViewportSize(viewport);
  await page.route('**/config.js', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: 'window.GESTAO_TI_CONFIG={SUPABASE_URL:"https://example.supabase.co",SUPABASE_PUBLIC_KEY:"sb_publishable_visual"};',
  }));
  const now = Date.now();
  const baseTicket = {
    title: null, group_id: 1, group_name: 'SUPORTE TI',
    opened_at: new Date(now - 65000).toISOString(),
    sla_due_at: null, attention_due_at: null,
    internal_sla_due_at: null, internal_attention_due_at: null,
    source_environment: 'real',
  };
  const tickets = [
    { ...baseTicket, glpi_id: 9001, status_id: 1, status: 'Novo', technician_id: null, technician_name: null, assigned_at: null, solved_at: null, closed_at: null },
    { ...baseTicket, glpi_id: 9002, status_id: 2, status: 'Atribuído', technician_id: 20, technician_name: 'Técnico Teste', assigned_at: new Date(now - 50000).toISOString(), solved_at: null, closed_at: null },
    { ...baseTicket, glpi_id: 9003, status_id: 4, status: 'Pendente', technician_id: 20, technician_name: 'Técnico Teste', assigned_at: new Date(now - 50000).toISOString(), solved_at: null, closed_at: null },
    { ...baseTicket, glpi_id: 9004, status_id: 5, status: 'Solucionado', technician_id: 20, technician_name: 'Técnico Teste', assigned_at: new Date(now - 50000).toISOString(), solved_at: new Date(now - 30000).toISOString(), closed_at: null },
    { ...baseTicket, glpi_id: 9005, status_id: 6, status: 'Fechado', technician_id: 20, technician_name: 'Técnico Teste', assigned_at: new Date(now - 50000).toISOString(), solved_at: new Date(now - 30000).toISOString(), closed_at: new Date(now - 10000).toISOString() },
  ];
  await page.route('https://example.supabase.co/functions/v1/glpi-dashboard', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      tickets,
      integrationState: { status: 'online', last_success_at: new Date(now).toISOString() },
      checkedAt: new Date(now).toISOString(),
    }),
  }));
  await page.route('https://cdn.jsdelivr.net/**', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: 'window.supabase={createClient:()=>{throw new Error("Auth client must not be created on the public route.");}};',
  }));
  await page.route('https://cdnjs.cloudflare.com/**', (route) => route.abort());
  await page.goto(path);
  await expect(page.locator('#glpi-view-diario')).toBeVisible();
}

for (const viewport of viewports) {
  test(`Dashboard Diário responsivo em ${viewport.name}`, async ({ page }) => {
    await preparePage(page, { width: viewport.width, height: viewport.height });
    await expect(page.locator('#glpi-view-diario .glpi-daily-kpi')).toHaveCount(5);
    await expect(page.locator('#glpi-daily-kpis .glpi-kpi')).toHaveCount(5);
    await expect(page.locator('#glpi-daily-kpis').getByText('Chamados abertos', { exact: true })).toBeVisible();
    await expect(page.locator('#glpi-view-diario .glpi-chart')).toHaveCount(1);
    await expect(page.locator('body')).not.toHaveClass(/glpi-panel-mode/);
    await expect(page.getByRole('button', { name: 'Modo Painel' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar em tela cheia' })).toBeVisible();
    await expect(page.getByText('DASHBOARD CHAMADOS DIÁRIO', { exact: true })).toBeVisible();
    await expect(page.getByText('Indicadores de chamados', { exact: true })).toBeVisible();
    if (viewport.name !== 'celular') await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.getByText('Últimos chamados registrados', { exact: true })).toBeVisible();
    await expect(page.locator('#glpi-view-diario .glpi-kpi-icon')).toHaveCount(0);
    await expect(page.getByText('Chamados colocados como pendentes', { exact: true })).toBeVisible();
    await expect(page.getByText(/Plantão atual: (Diurno|Noturno)/)).toBeVisible();
    await expect(page.getByText('Offline • GLPI', { exact: true })).toBeVisible();
    await expect(page.getByText('Modo demonstração ativo: dados fictícios não são gravados no banco.', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Ranking diário dos técnicos', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Chamados antigos ainda abertos', { exact: true })).toHaveCount(0);

    const layout = await page.locator('#glpi-view-diario').evaluate((element) => {
      const cards = [...element.querySelectorAll('.glpi-kpi')].map((card) => {
        const rect = card.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          scrollWidth: card.scrollWidth,
          title: card.querySelector('.glpi-kpi-title')?.textContent?.trim(),
        };
      });
      const chart = element.querySelector('.glpi-chart');
      const cardRows = [...new Set(cards.map((card) => Math.round(card.top || 0)))];
      return {
        bodyOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        cards,
        chartOverflow: chart ? chart.scrollWidth > chart.clientWidth : true,
        cardRows,
      };
    });
    expect(layout.bodyOverflow).toBe(false);
    expect(layout.chartOverflow).toBe(false);
    expect(layout.cards.every((card) => card.left >= 0 && card.right <= viewport.width + 1 && card.scrollWidth <= card.width + 1)).toBe(true);
    expect(layout.cards.map((card) => card.title)).toEqual([
      'Chamados abertos',
      'Em atendimento',
      'Aguardando atendimento',
      'Chamados estourados',
      'Pendentes',
    ]);
    if (viewport.width >= 1366) {
      expect(layout.cardRows).toHaveLength(1);
      expect(Math.max(...layout.cards.map((card) => card.width)) - Math.min(...layout.cards.map((card) => card.width))).toBeLessThanOrEqual(1);
      expect(Math.max(...layout.cards.map((card) => card.height)) - Math.min(...layout.cards.map((card) => card.height))).toBeLessThanOrEqual(1);
    }
    const titleAlignment = await page.locator('.glpi-daily-section-title').evaluateAll((titles) =>
      titles.map((title) => getComputedStyle(title).textAlign));
    expect(titleAlignment).toEqual(['center', 'center']);
  });
}

test('Dashboard Geral permanece responsivo nas resoluções suportadas', async ({ page }) => {
  for (const viewport of viewports) {
    await prepareAuthenticatedDashboard(page, { width: viewport.width, height: viewport.height });
    const overflow = await page.locator('#glpi-view-geral').evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow, `overflow horizontal em ${viewport.name}`).toBe(false);
  }
});

test('Menu mobile permanece utilizável', async ({ page }) => {
  await prepareAuthenticatedDashboard(page, { width: 390, height: 844 });
  const menuButton = page.locator('.mobile-menu-button');
  await expect(menuButton).toBeVisible();
  await menuButton.click();
  await expect(page.locator('body')).toHaveClass(/mobile-menu-open/);
  await page.locator('.sidebar .tab-btn.active').click();
  await expect(page.locator('body')).not.toHaveClass(/mobile-menu-open/);
});

test('Tela cheia pode ser acionada no desktop', async ({ page }) => {
  await prepareAuthenticatedDashboard(page, { width: 1366, height: 768 });
  const fullscreenButton = page.getByRole('button', { name: 'Entrar em tela cheia' });
  await expect(fullscreenButton).toBeVisible();
  const fullscreenSupported = await page.evaluate(() => document.fullscreenEnabled);
  await fullscreenButton.click();
  if (fullscreenSupported) {
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    await page.evaluate(() => document.exitFullscreen());
  }
});

test('modo painel funciona no Diário sem redirecionar e continua no Geral', async ({ page }) => {
  await preparePage(page, { width: 1366, height: 768 });
  await page.getByRole('button', { name: 'Modo Painel' }).click();
  await expect(page.locator('body')).toHaveClass(/glpi-panel-mode/);
  await expect(page.locator('#glpi-view-diario')).toBeVisible();
  await expect(page.locator('.sidebar')).toBeHidden();
  await page.getByRole('button', { name: 'Sair do modo painel' }).click();
  await expect(page.locator('body')).not.toHaveClass(/glpi-panel-mode/);

  await prepareAuthenticatedDashboard(page, { width: 1366, height: 768 });
  await page.getByRole('button', { name: 'Modo Painel' }).click();
  await expect(page.locator('body')).toHaveClass(/glpi-panel-mode/);
  await expect(page.locator('#glpi-view-geral')).toBeVisible();
});

test('rota pública abre sem login, fica travada no Diário e atualiza contadores localmente', async ({ page }) => {
  await preparePublicDashboard(page);
  await expect(page.locator('#login-container')).toBeHidden();
  await expect(page.getByText('Online • GLPI', { exact: true })).toBeVisible();
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.locator('.glpi-subtabs')).toBeHidden();
  await expect(page.locator('#glpi-view-configuracoes')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Modo Painel' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar em tela cheia' })).toBeVisible();
  await expect(page.getByText('Tempo de atribuição', { exact: true })).toBeVisible();
  await expect(page.getByText('Tempo de solução', { exact: true })).toBeVisible();
  await expect(page.getByText('Tempo total', { exact: true })).toBeVisible();
  const runningAssignment = page.locator('[data-ticket-id="9001"][data-time-kind="assignment"]');
  const initial = await runningAssignment.textContent();
  await page.waitForTimeout(1100);
  const updated = await runningAssignment.textContent();
  expect(updated).not.toBe(initial);
  await expect(page.locator('.ticket-solved-label')).toHaveCount(2);
  await expect(page.locator('[data-ticket-id="9002"] .ticket-solved-label')).toHaveCount(0);
  await expect(page.locator('[data-ticket-id="9003"] .ticket-solved-label')).toHaveCount(0);
  await expect(page.locator('[data-ticket-id="9004"] .ticket-solved-label')).toHaveText('SOLUCIONADO');
  await expect(page.locator('[data-ticket-id="9005"] .ticket-solved-label')).toHaveText('SOLUCIONADO');
  const solvedColor = await page.locator('[data-ticket-id="9004"] .ticket-solved-label').evaluate((element) =>
    getComputedStyle(element).color);
  expect(solvedColor).toBe('rgb(22, 163, 74)');
  const solvedTotal = page.locator('[data-ticket-id="9004"][data-time-kind="total"] .glpi-ticket-time-value');
  const solvedInitial = await solvedTotal.textContent();
  await page.waitForTimeout(1100);
  await expect(solvedTotal).toHaveText(solvedInitial);
  await page.evaluate(() => {
    window.abrirAba('aba-admin');
    window.glpiAbrirSubaba('configuracoes');
  });
  await expect(page.locator('#glpi-view-diario')).toBeVisible();
  await expect(page.locator('#aba-admin')).toBeHidden();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  const browserState = await page.evaluate(() => ({
    cookie: document.cookie,
    supabaseStorageKeys: Object.keys(localStorage).filter((key) => key.startsWith('sb-')),
    publicMode: window.GESTAO_TI_PUBLIC_DASHBOARD,
  }));
  expect(browserState.cookie).toBe('');
  expect(browserState.supabaseStorageKeys).toEqual([]);
  expect(browserState.publicMode).toBe(true);
  await page.evaluate(() => {
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'sb-expired-auth-token',
      oldValue: '{"access_token":"expired"}',
      newValue: null,
    }));
    window.fazerLogout();
  });
  await expect(page.locator('#login-container')).toBeHidden();
  await expect(page.locator('#glpi-view-diario')).toBeVisible();
  await page.reload();
  await expect(page.locator('#login-container')).toBeHidden();
  await expect(page.getByText('Online • GLPI', { exact: true })).toBeVisible();
});

test('entrada estática do GitHub Pages carrega a rota pública sem autenticação', async ({ page }) => {
  await preparePublicDashboard(
    page,
    { width: 1366, height: 768 },
    '/dashboard-diario/index.html',
  );
  await expect(page).toHaveURL(/\/dashboard-diario\/$/);
  await expect(page.locator('#login-container')).toBeHidden();
  await expect(page.locator('#glpi-view-diario')).toBeVisible();
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.locator('#glpi-daily-kpis .glpi-kpi')).toHaveCount(5);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});

test('cards e fontes do Diário possuem aumento moderado', async ({ page }) => {
  await preparePage(page, { width: 1920, height: 1080 });
  const dimensions = await page.locator('#glpi-view-diario').evaluate((view) => {
    const card = view.querySelector('.glpi-daily-kpi');
    const value = card?.querySelector('strong');
    const title = document.querySelector('#glpi-dashboard-title');
    return {
      cardHeight: card?.getBoundingClientRect().height || 0,
      valueFont: Number.parseFloat(getComputedStyle(value).fontSize),
      titleFont: Number.parseFloat(getComputedStyle(title).fontSize),
    };
  });
  expect(dimensions.cardHeight).toBeGreaterThanOrEqual(105);
  expect(dimensions.cardHeight).toBeLessThanOrEqual(124);
  expect(dimensions.valueFont).toBeGreaterThanOrEqual(32);
  expect(dimensions.valueFont).toBeLessThanOrEqual(35);
  expect(dimensions.titleFont).toBeGreaterThanOrEqual(30);
  expect(dimensions.titleFont).toBeLessThanOrEqual(34);
});

test('Conectar serviços é responsivo e não exibe credenciais', async ({ page }) => {
  for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
    await prepareAuthenticatedDashboard(page, viewport);
    await page.evaluate(() => window.glpiAbrirSubaba('configuracoes'));
    await expect(page.getByText('Conectar serviços', { exact: true })).toBeVisible();
    await expect(page.locator('.glpi-service-card')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Abrir Supabase' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir GLPI' })).toBeVisible();
    const serviceView = await page.locator('.glpi-connect-services').evaluate((element) => ({
      overflow: element.scrollWidth > element.clientWidth,
      text: element.textContent,
    }));
    expect(serviceView.overflow).toBe(false);
    expect(serviceView.text).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}|GLPI_(?:APP|USER)_TOKEN\s*=\s*\S+/);
  }
});
