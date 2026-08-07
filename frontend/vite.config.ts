import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

// Le build est servi par le serveur Express (même origine). En dev, on proxifie
// l'API et le WebSocket vers le backend Node sur :3000.
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  build: {
    // Pas de polyfill modulepreload inline -> compatible avec la CSP stricte (script-src 'self').
    modulePreload: { polyfill: false },
    outDir: 'dist',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
});
