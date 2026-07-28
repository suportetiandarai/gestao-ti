import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist');
const assets = [
  'index.html',
  'styles.css',
  'auth.js',
  'app.js',
  'config.js',
  'config.example.js',
  'glpi-dashboard-core.js',
  'glpi-dashboard.js',
  'sheets-dashboard.js',
  'sheets-dashboard.css',
  'inventory-scanner.js',
  'inventory-transfer.js',
  'signature.js',
  'fundo.png',
  'logo-aba.png',
];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const asset of assets) {
  const source = join(root, asset);
  await stat(source);
  await cp(source, join(dist, asset));
}

const html = await readFile(join(dist, 'index.html'), 'utf8');
for (const asset of assets.filter((name) =>
  /\.(?:js|css|png)$/.test(name) &&
  !['config.example.js', 'sheets-dashboard.js', 'sheets-dashboard.css'].includes(name)
)) {
  if (!html.includes(asset) && !['fundo.png'].includes(asset)) {
    throw new Error(`Artefato não referenciado no HTML: ${asset}`);
  }
}

const publicRoute = join(dist, 'dashboard-diario');
await mkdir(publicRoute, { recursive: true });
await writeFile(
  join(publicRoute, 'index.html'),
  html.replace('<head>', '<head>\n    <base href="../">'),
  'utf8',
);

for (const route of ['dashboard-timed', 'dashboard-treinamentos', 'dashboard-ad']) {
  const target = join(dist, route);
  await mkdir(target, { recursive: true });
  await cp(join(root, route, 'index.html'), join(target, 'index.html'));
}

console.log(`Build estático criado em dist/ com ${assets.length + 4} arquivos e quatro rotas públicas.`);
