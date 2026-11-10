import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Serves the order dashboard (admin.html) at /admin during development, like the Node server does in production.
const adminRoute = (): Plugin => ({
  name: 'prime-admin-route',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url === '/admin' || req.url === '/admin/' || req.url?.startsWith('/admin#')) req.url = '/admin.html';
      next();
    });
  },
});

export default defineConfig({
  plugins: [react(), adminRoute()],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        admin: fileURLToPath(new URL('./admin.html', import.meta.url)),
      },
    },
  },
  server: {
    port: 3000,
    open: false,
    host: true,
    // Enquiry + admin API (node server/index.js) during development
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
});
