import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const base = process.env.VITE_BASE_PATH || '/';
const localMode = process.env.VITE_LOCAL_MODE === 'true';

export default defineConfig({
  base,
  plugins: [
    react(),
    // Inject the local-mode meta tag when running `npm run dev:local`.
    // The Hono server injects this itself in production; here Vite does it
    // so that isLocalMode() returns true and auth is bypassed.
    localMode
      ? {
          name: 'local-mode-meta',
          transformIndexHtml(html: string): string {
            return html.replace(
              '<head>',
              '<head>\n    <meta name="redraft-mode" content="local">',
            );
          },
        }
      : null,
  ],
  server: {
    // Forward local-mode API and WebSocket calls to the Hono server.
    // In remote mode these paths are never requested, so the proxy is inert.
    proxy: {
      '/api': { target: 'http://localhost:5174', changeOrigin: true },
      '/ws': { target: 'ws://localhost:5174', ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    css: true,
    exclude: ['e2e/**', 'node_modules/**', 'test-results/**'],
  },
});
