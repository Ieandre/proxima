import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { initTheme } from './lib/theme';
import { migrateLegacyHash } from './lib/router';

// Avant le premier rendu : sinon l'écran s'affiche en clair puis bascule.
initTheme();

// Avant le premier rendu également : un ancien lien `/#cgu` mis en favori doit
// afficher la page, pas l'accueil.
migrateLegacyHash();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
