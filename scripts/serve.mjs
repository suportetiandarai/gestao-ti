import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const valueAfter = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const mime = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

export async function startStaticServer({ host = '0.0.0.0', port = 8000, root = '.' } = {}) {
  const resolvedRoot = resolve(root);
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
      const requested = decodeURIComponent(url.pathname);
      const relative = requested === '/' || requested.startsWith('/dashboard/publico/') ? 'index.html' : requested.replace(/^\/+/, '');
      const file = resolve(resolvedRoot, relative);
      if (file !== resolvedRoot && !file.startsWith(`${resolvedRoot}${sep}`)) throw new Error('Caminho inválido.');
      const info = await stat(file);
      if (!info.isFile()) throw new Error('Arquivo inválido.');
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': mime[extname(file).toLowerCase()] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(await readFile(file));
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Não encontrado');
    }
  });

  await new Promise((resolveListening, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolveListening);
  });
  return server;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const host = valueAfter('--host', '0.0.0.0');
  const port = Number(valueAfter('--port', '8000'));
  const root = valueAfter('--root', '.');
  const server = await startStaticServer({ host, port, root });
  console.log(`GESTÃO TI disponível em http://${host}:${port}`);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close(() => process.exit(0)));
  }
}
