import { createApp } from 'vue';
import './index.css';
import App from './App.vue';
import { pinia } from './store/useStore';
import { initTheme } from './lib/theme';
import { migrateLegacyHash } from './lib/router';

// Avant le premier rendu : sinon l'écran s'affiche en clair puis bascule.
initTheme();

// Avant le premier rendu également : un ancien lien `/#cgu` mis en favori doit
// afficher la page, pas l'accueil.
migrateLegacyHash();

createApp(App).use(pinia).mount('#root');
