import { createServer } from 'vite';
export default async function start() {
  if (process.env.SPATIAL_TEST_URL) return;
  const server = await createServer({ server: { host: '127.0.0.1', port: 4175, strictPort: true } });
  await server.listen();
  return () => server.close();
}
