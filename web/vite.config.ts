import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
