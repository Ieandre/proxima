/* ==========================================================================
 * Identité documentaire de la page courante — titre, description, canonique.
 *
 * Le pré-rendu (scripts/prerender-routes.js) donne à chaque URL ses propres
 * balises, mais elles ne valent que pour le document chargé : une navigation
 * interne passe par pushState sans rechargement (cf. lib/router.ts), et
 * laisserait l'onglet, l'historique et les favoris au titre de la page
 * d'entrée. Ce module rejoue la substitution côté client.
 *
 * PAGE_META reprend mot pour mot server/pages.js — bloc JSON pur, relu et
 * comparé par test/pages.test.js. Les pages de ville portent leurs méta dans
 * cities-seo.ts (généré), même verrou par test/city-pages.test.js.
 * ======================================================================== */

import { cityFromPath } from './cities-seo';

export const PAGE_META = {
  "/": {
    "title": "Proxima — messagerie anonyme et chiffrée de proximité",
    "description": "Proxima — messagerie anonyme de proximité. Aucune inscription, aucune trace. Messages privés chiffrés de bout en bout. Vous fermez l'onglet, il ne reste rien."
  },
  "/en-savoir-plus": {
    "title": "Comment ça marche : anonymat et chiffrement — Proxima",
    "description": "Clés créées sur votre appareil, chiffrement de bout en bout des messages privés et des salons, rien de conservé : le fonctionnement de Proxima, expliqué et démontré en direct."
  },
  "/chat-anonyme": {
    "title": "Chat anonyme sans inscription : le guide — Proxima",
    "description": "Ce qu'un chat anonyme protège vraiment, ce qu'il ne protège pas, et les six critères pour en juger un. Guide clair, sans jargon, exemples à l'appui."
  },
  "/alternatives": {
    "title": "Les chats anonymes qui ont fermé, et par quoi les remplacer",
    "description": "Omegle, Coco, ICQ : pourquoi les grands chats anonymes ont fermé, ce que chaque fermeture apprend, et comment choisir un remplaçant sérieux plutôt qu'un clone."
  },
  "/alternative-omegle": {
    "title": "Alternative à Omegle en français, sans webcam — Proxima",
    "description": "Omegle a fermé le 8 novembre 2023. Proxima permet de parler à des inconnus près de chez soi, sans inscription — en texte, pas en webcam. Ce qui change."
  },
  "/villes": {
    "title": "Tchat par ville : France, Belgique, Suisse — Proxima",
    "description": "Discuter près de chez vous : la liste des villes couvertes en France, Belgique, Suisse, Luxembourg et Monaco, avec les communes réellement à portée de chacune."
  },
  "/alternative-coco": {
    "title": "Alternative à Coco : chat anonyme sans inscription — Proxima",
    "description": "Coco (coco.gg) a fermé en juin 2024. Proxima reprend l'essentiel — discuter près de chez soi, sans inscription — et ajoute ce qui manquait : chiffrement et modération."
  },
  "/cgu": {
    "title": "Conditions d'utilisation — Proxima",
    "description": "Les conditions d'utilisation de Proxima : accès réservé aux 18 ans et plus, contenus interdits, signalement des abus, responsabilités et durée de vie des données."
  },
  "/confidentialite": {
    "title": "Politique de confidentialité (RGPD) — Proxima",
    "description": "Quelles données Proxima traite, et pourquoi si peu : aucun compte, aucune adresse IP en clair, aucun message conservé. Vos droits RGPD et les durées de conservation."
  },
  "/moderation": {
    "title": "Politique de modération (DSA) — Proxima",
    "description": "Comment Proxima modère sans pouvoir lire vos échanges : signalement, retrait des contenus illégaux, voies de recours, et ce que le chiffrement de bout en bout implique."
  },
  "/mentions-legales": {
    "title": "Mentions légales — Proxima",
    "description": "Éditeur, hébergement, point de contact et sources de données de Proxima, messagerie anonyme et chiffrée de proximité."
  }
} as const;

function metaFor(path: string): { title: string; description: string } | null {
  if (path in PAGE_META) return PAGE_META[path as keyof typeof PAGE_META];
  const city = cityFromPath(path);
  return city ? { title: city.title, description: city.description } : null;
}

/** Aligne titre, description et canonique sur le chemin courant. Un chemin
    inconnu ne touche à rien : le serveur en aurait fait une 404. */
export function syncHead(path: string): void {
  const meta = metaFor(path);
  if (!meta) return;

  document.title = meta.title;
  document.querySelector('meta[name="description"]')?.setAttribute('content', meta.description);

  // L'origine canonique est relue de la balise pré-rendue plutôt que redéclarée
  // ici : server/pages.js reste sa seule source (l'accueil s'écrit avec son
  // slash final, comme dans le sitemap).
  const link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (link) link.href = new URL(path === '/' ? '/' : path, link.href).href;
}
