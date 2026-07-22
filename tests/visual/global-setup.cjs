module.exports = async () => {
  const { startStaticServer } = await import('../../scripts/serve.mjs');
  const server = await startStaticServer({ host: '127.0.0.1', port: 8000, root: process.cwd() });
  return () => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
};
