import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { offlineWorkspace } from './offlinePlugin';
export default defineConfig({ base: './', plugins: [react(), offlineWorkspace()], server: { host: '127.0.0.1', port: 4173, strictPort: true }, build: { sourcemap: true, target: 'es2022' } });
