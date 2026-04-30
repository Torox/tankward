import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 5173,
    open: true,
    host: true
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: true
  }
});
