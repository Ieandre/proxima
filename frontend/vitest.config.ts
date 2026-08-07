import { defineConfig } from 'vitest/config';

// Configuration de test isolée du build (pas de plugins Vite requis pour les tests
// de logique pure : crypto E2E, préparation média, store Pinia).
export default defineConfig({
  test: {
    globals: true,
    // Environnement Node : logique pure (crypto libsodium, préparation média, store).
    // Évite la divergence de realm de jsdom (TextEncoder -> Uint8Array non reconnu
    // par libsodium) ; File/Blob/TextEncoder natifs de Node suffisent.
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
  },
});
