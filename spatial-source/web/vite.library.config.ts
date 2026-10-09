import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], build: { outDir: 'dist-library', target: 'es2022', sourcemap: true,
  lib: { entry: 'src/library.ts', formats: ['es'], fileName: 'spatial-workspace', cssFileName: 'spatial-workspace' },
  rollupOptions: { external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'] }
} });
