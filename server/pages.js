'use strict';

/* ==========================================================================
 * Pages publiques indexables — source unique de vérité.
 *
 * Le service tient sur une seule application, mais la vitrine et les documents
 * juridiques sont du contenu autonome : ils méritent une URL propre. Servis
 * derrière un fragment (`#cgu`), ils étaient invisibles pour les moteurs, qui
 * ignorent tout ce qui suit le `#` — un seul document indexable pour l'ensemble
 * du site.
 *
 * Ce fichier est consommé par trois endroits qui doivent rester d'accord :
 *  - `server/index.js` déclare une route explicite par page (jamais de fallback
 *    `app.get('*')`, qui fabriquerait des « soft 404 ») ;
 *  - `scripts/prerender-routes.js` fabrique au build un HTML par page, avec ses
 *    propres titre, description et canonique ;
 *  - `frontend/src/lib/router.ts` route côté client sur les mêmes chemins.
 *
 * `test/pages.test.js` vérifie l'accord des trois, plus celui du sitemap.
 *
 * Pourquoi un titre et une description PAR page : servir le même HTML sous six
 * URLs ne crée pas six pages aux yeux de Google, mais six doublons qu'il
 * regroupe sous une seule — l'opération serait alors vaine. C'est la distinction
 * des métadonnées et du texte qui fait exister les pages, pas l'URL seule.
 * ======================================================================== */

/** Origine publique. Doit rester identique à index.html, robots.txt et sitemap.xml. */
const ORIGIN = 'https://proximachat.eu';

/**
 * `path`        — l'URL servie, sans slash final.
 * `file`        — le fichier produit dans `frontend/dist/`.
 * `title`       — balise `<title>`, sous ~60 caractères pour ne pas être tronquée.
 * `description` — `<meta name="description">`, 120-160 caractères.
 * `heading`     — le `<h1>` de la coquille statique.
 * `intro`       — le paragraphe de la coquille statique : du texte réel, propre à
 *                 la page. React remplace l'ensemble au montage ; cette coquille
 *                 est ce que voient les visiteurs sans JavaScript et ce que lit
 *                 un moteur avant d'exécuter le bundle.
 * `nav`         — libellé court de la page dans la navigation inter-pages.
 */
const PAGES = [
  {
    path: '/',
    file: 'index.html',
    title: 'Proxima — messagerie anonyme et chiffrée de proximité',
    description:
      "Proxima — messagerie anonyme de proximité. Aucune inscription, aucune trace. Messages privés chiffrés de bout en bout. Vous fermez l'onglet, il ne reste rien.",
    heading: 'Parlez aux gens autour de vous, sans rien révéler de vous.',
    intro: '',
    nav: 'Accueil',
  },
  {
    path: '/en-savoir-plus',
    file: 'en-savoir-plus.html',
    title: 'Comment ça marche : anonymat et chiffrement — Proxima',
    description:
      "Clés créées sur votre appareil, chiffrement de bout en bout des messages privés et des salons, rien de conservé : le fonctionnement de Proxima, expliqué et démontré en direct.",
    heading: 'Comment fonctionne Proxima',
    intro:
      "Proxima ne demande ni compte, ni email, ni numéro. À l'ouverture de la page, une paire de clés est fabriquée sur votre appareil et sa moitié privée n'en sort jamais : c'est ce qui permet de chiffrer les messages privés de bout en bout, sans que le serveur puisse les lire. Cette page détaille chaque mécanisme — identité éphémère, proximité sans géolocalisation, chiffrement de tous les salons — et le démontre en direct dans votre navigateur.",
    nav: 'Comment ça marche',
  },
  {
    path: '/cgu',
    file: 'cgu.html',
    title: "Conditions d'utilisation — Proxima",
    description:
      "Les conditions d'utilisation de Proxima : accès réservé aux 18 ans et plus, contenus interdits, signalement des abus, responsabilités et durée de vie des données.",
    heading: "Conditions d'utilisation",
    intro:
      "Les règles d'accès et d'usage du service : réservé aux personnes de 18 ans et plus, interdiction des contenus illégaux, signalement des abus, responsabilité de chacun sur ce qu'il publie, et l'effacement de tout à la fermeture de l'onglet.",
    nav: "Conditions d'utilisation",
  },
  {
    path: '/confidentialite',
    file: 'confidentialite.html',
    title: 'Politique de confidentialité (RGPD) — Proxima',
    description:
      "Quelles données Proxima traite, et pourquoi si peu : aucun compte, aucune adresse IP en clair, aucun message conservé. Vos droits RGPD et les durées de conservation.",
    heading: 'Politique de confidentialité',
    intro:
      "Proxima est conçu pour n'avoir presque rien à protéger : il n'existe aucune base de données de contenu, aucune adresse IP n'est manipulée en clair, et les messages ne survivent pas à la session. Cette page énumère les seules données traitées, leur base légale, leur durée de vie et les droits que le RGPD vous ouvre.",
    nav: 'Confidentialité',
  },
  {
    path: '/moderation',
    file: 'moderation.html',
    title: 'Politique de modération (DSA) — Proxima',
    description:
      "Comment Proxima modère sans pouvoir lire vos échanges : signalement, retrait des contenus illégaux, voies de recours, et ce que le chiffrement de bout en bout implique.",
    heading: 'Politique de modération',
    intro:
      "Anonyme ne veut pas dire ingouvernable. La modération de Proxima est réactive : elle n'inspecte pas les échanges mais agit sur signalement. Les messages privés comme les salons étant chiffrés de bout en bout, ils restent illisibles pour nous — cette page dit ce que cela permet, ce que cela empêche, et par quelles voies contester une décision.",
    nav: 'Modération',
  },
  {
    path: '/mentions-legales',
    file: 'mentions-legales.html',
    title: 'Mentions légales — Proxima',
    description:
      "Éditeur, hébergement, point de contact et sources de données de Proxima, messagerie anonyme et chiffrée de proximité.",
    heading: 'Mentions légales',
    intro:
      "Éditeur du service, hébergement, point de contact pour les signalements et les demandes des autorités, et provenance des données géographiques utilisées par la recherche de proximité.",
    nav: 'Mentions légales',
  },
];

/** L'accueil : produit par Vite, pas par le script de pré-rendu. */
const HOME = PAGES.find((p) => p.path === '/');

/** Les pages à fabriquer au build, l'accueil excepté. */
const PRERENDERED = PAGES.filter((p) => p.path !== '/');

/** Table chemin -> fichier de `dist/`, pour la négociation de contenu du serveur. */
const FILE_BY_PATH = new Map(PAGES.map((p) => [p.path, p.file]));

module.exports = { ORIGIN, PAGES, HOME, PRERENDERED, FILE_BY_PATH };
