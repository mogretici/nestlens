/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Custom plugin to redirect /nestlens to /nestlens/
const trailingSlashRedirect = () => ({
  name: 'trailing-slash-redirect',
  configureServer(server: any) {
    server.middlewares.use((req: any, res: any, next: any) => {
      if (req.url === '/nestlens') {
        res.writeHead(301, { Location: '/nestlens/' });
        res.end();
        return;
      }
      next();
    });
  },
});

export default defineConfig({
  plugins: [react(), trailingSlashRedirect()],
  base: '/nestlens/',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  server: {
    proxy: {
      '/__nestlens__': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
    // Handle SPA routing - redirect all routes to index.html
    middlewareMode: false,
  },
  preview: {
    // Same for preview mode
  },
  // Ensure trailing slash redirect
  appType: 'spa',
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [resolve(__dirname, 'src/__tests__/setup.ts')],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    root: __dirname,
  },
});
