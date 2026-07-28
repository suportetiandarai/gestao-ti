import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const errors = [];
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];

if (!/^<!doctype html>/i.test(html.trimStart())) errors.push('index.html não possui DOCTYPE HTML.');
if (!/<html\s+lang="pt-BR"/i.test(html)) errors.push('Idioma pt-BR não está declarado.');
if (!/<meta\s+name="viewport"/i.test(html)) errors.push('Meta viewport ausente.');
if (duplicates.length) errors.push(`IDs duplicados: ${duplicates.join(', ')}.`);

const dailyView = html.match(/<div id="glpi-view-diario"[\s\S]*?<div id="glpi-view-geral"/)?.[0] || '';
if (!dailyView) errors.push('Dashboard Diário não encontrado.');
if ((dailyView.match(/class="glpi-panel"/g) || []).length !== 2) errors.push('Dashboard Diário deve possuir dois painéis de conteúdo.');
if ((dailyView.match(/class="glpi-chart"/g) || []).length !== 1) errors.push('Dashboard Diário deve possuir exatamente um gráfico.');
if (!dailyView.includes('Últimos chamados registrados')) errors.push('Seção de últimos chamados ausente.');
if (/Ranking diário dos técnicos|Chamados antigos ainda abertos/.test(dailyView)) errors.push('Componente removido reapareceu no Dashboard Diário.');

for (const route of ['dashboard-timed', 'dashboard-treinamentos', 'dashboard-ad']) {
  const routeHtml = await readFile(new URL(`../${route}/index.html`, import.meta.url), 'utf8');
  if (!/<meta\s+name="robots"\s+content="noindex, nofollow"/i.test(routeHtml)) {
    errors.push(`${route}: proteção contra indexação ausente.`);
  }
  if (!routeHtml.includes('sheets-dashboard.js') || !routeHtml.includes('sheets-dashboard.css')) {
    errors.push(`${route}: assets do dashboard ausentes.`);
  }
  if (/auth\.js|service_role|private_key|GLPI_.*TOKEN/i.test(routeHtml)) {
    errors.push(`${route}: referência sensível ou autenticação administrativa indevida.`);
  }
}

if (errors.length) {
  errors.forEach((error) => console.error(error));
  process.exitCode = 1;
} else {
  console.log(`HTML válido: ${ids.length} IDs únicos e estrutura diária autorizada.`);
}
