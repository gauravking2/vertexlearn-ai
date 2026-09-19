import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  // GitHub Pages project site serves from /vertexlearn-ai/. Local dev keeps '/'.
  // The Pages workflow sets GITHUB_PAGES=true so `npm run build` there emits
  // base-prefixed asset URLs while local `vite dev` / `vite build` are unchanged.
  base: process.env.GITHUB_PAGES === 'true' ? '/vertexlearn-ai/' : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
