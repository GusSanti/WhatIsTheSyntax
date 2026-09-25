import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: { outDir: '../dist/web', emptyOutDir: true, sourcemap: false },
  server: {
    port: Number(process.env.WEB_PORT || 5173),
    strictPort: true,
    proxy: { '/api': `http://127.0.0.1:${process.env.PORT || 3001}` },
    fs: {
      strict: true,
      allow: [resolve('web'), resolve('shared'), resolve('node_modules')],
      deny: ['**/.env*', '**/server/**', '**/database/**', '**/.data/**', '**/*.pem'],
    },
  },
});
