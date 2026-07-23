const { test, expect } = require('@playwright/test');

const viewports = [
  { name: 'desktop', width: 1920, height: 1080 },
  { name: 'notebook', width: 1366, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'celular', width: 390, height: 844 },
];

async function preparePage(page, viewport) {
  await page.setViewportSize(viewport);
  await page.route('**/config.js', (route) => route.fulfill({ contentType: 'text/javascript', body: 'window.GESTAO_TI_CONFIG={SUPABASE_PUBLIC_KEY:""};' }));
  await page.route('https://cdn.jsdelivr.net/**', (route) => route.abort());
  await page.route('https://cdnjs.cloudflare.com/**', (route) => route.abort());
  await page.addInitScript(() => {
    localStorage.setItem('glpiPublicDashboardConfig', JSON.stringify({
      enabled: true,
      token: 'visual-test',
      techMode: 'first',
      showTitle: false,
      showCategory: true,
      showUnit: true,
    }));
  });
  await page.goto('/?painel_publico=visual-test');
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

for (const viewport of viewports) {
  test(`Dashboard Diário responsivo em ${viewport.name}`, async ({ page }) => {
    await preparePage(page, { width: viewport.width, height: viewport.height });
    await expect(page.locator('#glpi-daily-kpis .glpi-kpi')).toHaveCount(5);
    await expect(page.locator('#glpi-view-diario .glpi-chart')).toHaveCount(1);
    await expect(page.locator('.glpi-subtabs')).toBeHidden();
    await expect(page.locator('body')).toHaveClass(/glpi-panel-mode/);
    await expect(page.locator('#sidebar')).toBeHidden();
    await expect(page.getByText('Últimos chamados registrados', { exact: true })).toBeVisible();
    await expect(page.getByText('Offline • GLPI', { exact: true })).toBeVisible();
    await expect(page.getByText('Modo demonstração ativo: dados fictícios não são gravados no banco.', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Ranking diário dos técnicos', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Chamados antigos ainda abertos', { exact: true })).toHaveCount(0);

    const layout = await page.locator('#glpi-view-diario').evaluate((element) => {
      const cards = [...element.querySelectorAll('.glpi-kpi')].map((card) => {
        const rect = card.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width, scrollWidth: card.scrollWidth };
      });
      const chart = element.querySelector('.glpi-chart');
      return {
        bodyOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        cards,
        chartOverflow: chart ? chart.scrollWidth > chart.clientWidth : true,
      };
    });
    expect(layout.bodyOverflow).toBe(false);
    expect(layout.chartOverflow).toBe(false);
    expect(layout.cards.every((card) => card.left >= 0 && card.right <= viewport.width + 1 && card.scrollWidth <= card.width + 1)).toBe(true);
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
  const fullscreenButton = page.getByRole('button', { name: 'Tela cheia' });
  await expect(fullscreenButton).toBeVisible();
  const fullscreenSupported = await page.evaluate(() => document.fullscreenEnabled);
  await fullscreenButton.click();
  if (fullscreenSupported) {
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    await page.evaluate(() => document.exitFullscreen());
  }
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
