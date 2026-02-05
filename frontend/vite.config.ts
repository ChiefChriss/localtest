import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

// Custom plugin to handle SPA routing on refresh
function spaFallbackPlugin(): Plugin {
  return {
    name: 'spa-fallback',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';
        
        // Skip if it's a file request (has extension) or Vite internal routes
        if (
          url.includes('.') || 
          url.startsWith('/@') || 
          url.startsWith('/node_modules') ||
          url.startsWith('/src') ||
          url.startsWith('/components')
        ) {
          return next();
        }
        
        // For all other routes, let Vite's default SPA handling work
        // by rewriting to root
        req.url = '/';
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [
    spaFallbackPlugin(),
    react(),
  ],
  root: '.',
  build: {
    outDir: 'dist',
  },
  appType: 'spa',
});


