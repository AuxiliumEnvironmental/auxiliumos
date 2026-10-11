import { createServer } from 'vite';
export default async function start() {
  const server = await createServer({ server: { host: '127.0.0.1', port: 4176, strictPort: true } });
  await server.listen(); return () => server.close();
}
