import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig({
  plugins: [react()],
  define: { __ZP_VERSION__: JSON.stringify(pkg.version) },
  server: {
    port: 5484,
    proxy: {
      '/api': 'http://127.0.0.1:8484',
    },
  },
  build: {
    sourcemap: true,
  },
});
