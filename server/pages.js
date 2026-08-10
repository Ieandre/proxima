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
 *    propres titre, description et canonique, et en dérive `sitemap.xml` ;
 *  - `frontend/src/lib/router.ts` route côté client sur les mêmes chemins.
 *
 * `test/pages.test.js` vérifie l'accord des trois, plus celui du sitemap.
 *
 * Les pages par ville (`/tchat/nancy`) vivent à part, dans `city-pages.js` :
 * elles sont dérivées de la base géographique et non écrites à la main, et leur
 * nombre (67) interdit de les traiter comme celles-ci — la navigation qui lie
 * ici toutes les pages entre elles deviendrait un pied de page de 78 liens.
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
    // Pilier du champ générique (« chat anonyme », « tchat sans inscription »).
    // Page d'information, pas de vitrine : elle explique ce qu'est un chat
    // anonyme et à quoi en juger un. L'accueil, lui, vend le produit — les deux
    // ne visent pas la même intention, sans quoi elles se cannibaliseraient.
    path: '/chat-anonyme',
    file: 'chat-anonyme.html',
    title: 'Chat anonyme sans inscription : le guide — Proxima',
    description:
      "Ce qu'un chat anonyme protège vraiment, ce qu'il ne protège pas, et les six critères pour en juger un. Guide clair, sans jargon, exemples à l'appui.",
    heading: "Chat anonyme sans inscription : ce que ça veut dire vraiment",
    intro:
      "« Anonyme » est écrit sur presque tous les sites de discussion, et ne veut pas dire la même chose sur deux d'entre eux. Sur certains, cela signifie seulement qu'aucun pseudo n'est vérifié — le site lit vos messages, garde votre adresse IP et l'historique de vos conversations. Sur d'autres, le contenu est hors de portée de l'hébergeur lui-même. Cette page explique la différence, donne six critères pour juger n'importe quel service, et dit où Proxima se situe sur chacun.",
    nav: 'Chat anonyme',
  },
  {
    // Hub du champ « alternative » : une seule page peut se classer sur
    // l'ensemble des requêtes de marque orphelines, et distribue vers les pages
    // dédiées. Les fermetures citées sont toutes documentées publiquement.
    path: '/alternatives',
    file: 'alternatives.html',
    title: 'Les chats anonymes qui ont fermé, et par quoi les remplacer',
    description:
      "Omegle, Coco, ICQ : pourquoi les grands chats anonymes ont fermé, ce que chaque fermeture apprend, et comment choisir un remplaçant sérieux plutôt qu'un clone.",
    heading: 'Les chats anonymes ferment. Voici pourquoi, et par quoi les remplacer.',
    intro:
      "En trois ans, la plupart des grands lieux de discussion anonyme ont disparu : Omegle en novembre 2023, ICQ et Coco en juin 2024. Les raisons diffèrent — une fermeture judiciaire pour l'un, l'épuisement face aux abus pour l'autre, une simple décision commerciale pour le troisième — mais aucune n'est l'anonymat en soi. Cette page retrace ce qui est arrivé à chacun, ce que ces histoires apprennent, et les critères qui distinguent un remplaçant sérieux d'un clone opportuniste.",
    nav: 'Alternatives',
  },
  {
    path: '/alternative-omegle',
    file: 'alternative-omegle.html',
    title: 'Alternative à Omegle en français, sans webcam — Proxima',
    description:
      "Omegle a fermé le 8 novembre 2023. Proxima permet de parler à des inconnus près de chez soi, sans inscription — en texte, pas en webcam. Ce qui change.",
    heading: "Après Omegle : parler à des inconnus, autrement",
    intro:
      "Omegle a fermé le 8 novembre 2023, après quatorze ans, son fondateur expliquant que le site n'était plus tenable « ni financièrement, ni psychologiquement » face aux abus. Proxima répond à la même envie — parler à quelqu'un qu'on ne connaît pas — par un chemin différent, et il faut le dire d'emblée : ici c'est du texte, pas de la webcam, et les personnes en face sont près de chez vous plutôt que tirées au sort dans le monde entier.",
    nav: 'Alternative à Omegle',
  },
  {
    // Tête du maillage local : sans cette page, les 67 pages de ville
    // n'auraient aucun lien entrant depuis le site lui-même.
    path: '/villes',
    file: 'villes.html',
    title: 'Tchat par ville : France, Belgique, Suisse — Proxima',
    description:
      'Discuter près de chez vous : la liste des villes couvertes en France, Belgique, Suisse, Luxembourg et Monaco, avec les communes réellement à portée de chacune.',
    heading: 'Tchat anonyme, ville par ville',
    intro:
      "Proxima est un service de proximité : vous discutez avec les personnes présentes autour de la ville que vous déclarez, dans un rayon de 75 kilomètres. Toutes les communes de France, de Belgique, de Suisse, du Luxembourg et de Monaco sont utilisables à l'entrée — les villes listées ici ont en plus leur propre page, qui montre exactement quelles communes sont à portée depuis chacune, et à quelle distance.",
    nav: 'Villes',
  },
  {
    // Page d'acquisition : depuis la fermeture judiciaire de Coco (juin 2024),
    // « coco chat », « coco.gg » et « alternative coco » restent des requêtes
    // massives et sans réponse sérieuse. La page assume la comparaison — et le
    // fait honnêtement : aucun lien avec l'ancien site, et la différence de
    // fonctionnement (modération, signalement, éphémère) est le sujet central,
    // pas un détail. Elle attire le public légitime et décourage l'autre.
    path: '/alternative-coco',
    file: 'alternative-coco.html',
    title: 'Alternative à Coco : chat anonyme sans inscription — Proxima',
    description:
      "Coco (coco.gg) a fermé en juin 2024. Proxima reprend l'essentiel — discuter près de chez soi, sans inscription — et ajoute ce qui manquait : chiffrement et modération.",
    heading: "Après Coco : un chat anonyme qui n'en répète pas les erreurs",
    intro:
      "Coco a été fermé par la justice française le 25 juin 2024, après des années d'affaires criminelles que rien ne freinait : pas de modération réelle, pas de suite aux signalements. Proxima offre ce que ses habitués venaient chercher — parler aux gens de sa ville, sans créer de compte — sur des fondations opposées : messages chiffrés de bout en bout, rien de conservé après la fermeture de l'onglet, et des signalements suivis d'effet. Aucun lien avec l'ancien site : cette page explique ce qui change, et pourquoi.",
    nav: 'Alternative à Coco',
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
