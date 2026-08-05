'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');

const config = require('./config');
const { PAGES, FILE_BY_PATH } = require('./pages');
const { connectRedis, pubClient, subClient } = require('./infra/redis');
const cities = require('./domain/cities');
const security = require('./security');
const { registerHandlers } = require('./handlers');
const { registerAdminNamespace } = require('./admin');
const permanentRooms = require('./domain/permanent-rooms');

/**
 * En-têtes de cache du build front (Core Web Vitals : évite de retélécharger
 * le bundle à chaque visite). Vite hache le nom des fichiers de `/assets/`, ils
 * sont donc immuables et cachables un an. Le HTML, lui, ne doit jamais être
 * figé : c'est lui qui référence les noms hachés du moment.
 */
function cacheHeaders(res, filePath) {
  if (filePath.includes(`${path.sep}assets${path.sep}`)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (/\.html(\.br|\.gz)?$/.test(filePath)) {
    res.setHeader('Cache-Control', 'no-cache');
  } else {
    // Icônes, manifeste, robots.txt, sitemap : noms stables, cache court.
    res.setHeader('Cache-Control', 'public, max-age=3600');
  }
}

/** `/cgu/` et `/cgu` désignent la même page ; `/` reste `/`. */
function stripTrailingSlash(pathname) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') || '/' : pathname;
}

/**
 * Sert la variante pré-compressée (`.br`/`.gz`) générée par
 * `scripts/precompress.js` quand le client l'accepte et qu'elle existe. On se
 * contente de réécrire `req.url` et de poser les en-têtes de négociation :
 * `express.static` fait tout le reste (ETag, Range, 304).
 *
 * Les pages publiques passent par `FILE_BY_PATH` : leur URL (`/cgu`) ne porte pas
 * le nom du fichier pré-rendu (`cgu.html`). Sans cette table, elles seraient les
 * seules réponses HTML non compressées du site.
 */
function preferPrecompressed(dist) {
  const variants = [
    { encoding: 'br', ext: '.br' },
    { encoding: 'gzip', ext: '.gz' },
  ];

  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    // Toute réponse négociée sur Accept-Encoding doit varier là-dessus, sinon
    // un cache intermédiaire peut servir du Brotli à un client qui n'en veut pas.
    res.setHeader('Vary', 'Accept-Encoding');

    const accepted = String(req.headers['accept-encoding'] || '');

    let rel;
    let target;
    try {
      const decoded = decodeURIComponent(req.path);
      // Une page publique désigne son fichier pré-rendu ; `/` désigne index.html,
      // comme le fait express.static pour tout chemin terminé par `/`. `rel` est
      // toujours relatif à dist, sans slash initial.
      rel = (FILE_BY_PATH.get(stripTrailingSlash(decoded)) || decoded.replace(/\/$/, '/index.html')).replace(
        /^\/+/,
        '',
      );
      target = path.join(dist, rel);
    } catch {
      return next(); // séquence %XX invalide : laisser express répondre
    }

    // Garde-fou de traversée de chemin : le fichier résolu doit rester dans dist.
    const inside = path.relative(dist, target);
    if (!inside || inside.startsWith('..') || path.isAbsolute(inside)) return next();

    for (const variant of variants) {
      if (!accepted.includes(variant.encoding)) continue;
      if (!fs.existsSync(target + variant.ext)) continue;
      // Le type doit être celui du fichier d'origine, pas celui de l'archive.
      res.type(path.extname(target));
      res.setHeader('Content-Encoding', variant.encoding);
      req.url = `/${rel}${variant.ext}`;
      break;
    }

    next();
  };
}

/**
 * Vraie 404, hors indexation. `X-Robots-Tag` en plus du `<meta robots>` : il
 * couvre aussi les réponses non-HTML, qu'un moteur pourrait sinon indexer.
 */
function notFound(_req, res) {
  res.status(404);
  res.setHeader('X-Robots-Tag', 'noindex');
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(
    // Page autonome : ni bundle, ni script (la CSP interdit le script inline).
    '<!doctype html><html lang="fr"><head><meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<meta name="robots" content="noindex, follow">' +
      '<title>Page introuvable — Proxima</title>' +
      '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fbfcfd;' +
      "color:#1a2230;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;text-align:center;padding:24px}" +
      'a{color:#0f6fdb}</style></head><body><main>' +
      '<h1 style="font-size:1.5rem;font-weight:600;margin:0 0 8px">Cette page n\'existe pas</h1>' +
      '<p style="color:#5b6676;margin:0 0 24px">L\'adresse demandée ne correspond à aucune page de Proxima.</p>' +
      '<p><a href="/">Retour à l\'accueil</a></p>' +
      '</main></body></html>',
  );
}

async function main() {
  /**
   * Filet de dernier recours (défense en profondeur). Les handlers Socket.IO sont
   * `async` : une promesse rejetée par un listener (erreur Redis transitoire, cas non
   * prévu) remonte en `unhandledRejection`, que Node ≥ 15 transforme en arrêt du
   * processus par défaut. Sur un chat éphémère, une erreur ponctuelle ne doit JAMAIS
   * couper toutes les sessions vivantes : on journalise et on continue. La validation
   * d'entrée (`protocol.isValidId`) reste la vraie barrière ; ceci n'est que le filet.
   */
  process.on('unhandledRejection', (err) => {
    console.error('[unhandledRejection]', err && err.message ? err.message : err);
  });
  process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err && err.message ? err.message : err);
  });

  await connectRedis();
  console.log('[redis] connecté');

  // Réconciliation des salons permanents (seed-only : l'admin gagne sur l'existant).
  await permanentRooms.seedAtBoot();

  const app = express();
  app.disable('x-powered-by');
  app.use(security.securityHeaders);

  // Autocomplétion de communes (base embarquée, hors-ligne). Dix propositions et
  // non huit : les homonymes vont jusqu'à douze communes (« Sainte-Colombe »), et
  // rogner la liste à huit cachait la bonne à ceux qui en avaient le plus besoin.
  app.get('/api/cities', (req, res) => {
    const q = String(req.query.q || '');
    res.json({ results: cities.suggest(q, 10) });
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // Point de contact & mentions légales (DSA art.11-12/14) — consommé par About.tsx,
  // Legal.tsx et le pied de page (via App.tsx, qui fait l'appel une seule fois).
  //
  // `onionHost` s'invite ici faute de mieux : ce n'est pas une donnée « légale »,
  // mais lui dédier un `/api/config` coûterait une route et un aller-retour pour
  // une différence purement sémantique. À reconsidérer si un troisième champ
  // non-légal devait s'y greffer. Vide = aucune annonce.
  app.get('/api/legal', (_req, res) =>
    res.json({ contactEmail: config.contactEmail, lastUpdated: '2026-08-03', onionHost: config.onion.host }),
  );

  // Console opérateur (hors SPA) : page statique servie AVANT le fallback SPA.
  // Le JS est un fichier séparé (operator/app.js) car la CSP interdit le script inline.
  app.use('/operator', express.static(path.join(__dirname, 'operator')));

  // Service du build React (production). En dev, on utilise le serveur Vite.
  const dist = path.join(__dirname, '..', 'frontend', 'dist');
  if (fs.existsSync(dist)) {
    const indexHtml = path.join(dist, 'index.html');

    // La non-indexation des liens d'invitation (`?r=` salon, `?i=` conversation
    // privée) est portée par `security.robotsDirective`, source unique : elle
    // s'applique quel que soit l'état du build front (`noindex, follow`).
    app.use(preferPrecompressed(dist));
    app.use(express.static(dist, { setHeaders: cacheHeaders }));

    // Une route explicite par page publique (`server/pages.js`), et rien d'autre :
    // l'invitation passe par la query (`/?r=…&k=…`, `/?i=…`), jamais par le chemin.
    // Un fallback `app.get('*')` vers index.html fabriquerait autant de « soft
    // 404 » — pages dupliquées sans contenu propre, mauvais signal pour les
    // moteurs. Tout le reste est une vraie 404.
    //
    // Chaque page a son propre HTML pré-rendu (titre, description, canonique,
    // texte), produit par `scripts/prerender-routes.js`. Un build antérieur à ce
    // script n'en contient pas : on le dit au démarrage et on retombe sur
    // index.html, où le routage client affichera quand même la bonne page — un
    // build périmé ne doit pas rendre les documents juridiques inatteignables.
    const missing = PAGES.filter((page) => !fs.existsSync(path.join(dist, page.file)));
    if (missing.length) {
      console.warn(
        `[server] build sans pages pré-rendues (${missing.map((p) => p.file).join(', ')}) —` +
          ' relancez `npm run build` dans frontend/ pour des métadonnées propres à chaque page.',
      );
    }

    for (const page of PAGES) {
      const file = path.join(dist, page.file);
      app.get(page.path, (_req, res) => {
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(fs.existsSync(file) ? file : indexHtml);
      });
    }
    app.use(notFound);
  } else {
    app.get('/', (_req, res) =>
      res
        .status(200)
        .send('Frontend non build. Lancez `npm run build` dans frontend/ ou le serveur Vite (`npm run dev`).'),
    );
  }

  const server = http.createServer(app);
  const io = new Server(server, {
    // Backplane Redis : pub/sub partagé entre instances (scaling horizontal §4.3).
    adapter: createAdapter(pubClient, subClient),
    // Autorise le relais de pièces jointes (photos/vidéos) ; défaut = 1 Mo, trop bas.
    maxHttpBufferSize: 16 * 1024 * 1024,
    cors:
      process.env.NODE_ENV === 'production'
        ? undefined
        : { origin: ['http://localhost:5173', 'http://127.0.0.1:5173'], methods: ['GET', 'POST'] },
    // La console opérateur (page statique) charge le client Socket.IO en same-origin
    // (/socket.io/socket.io.js) ; la SPA, elle, embarque son propre client.
    serveClient: true,
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  registerHandlers(io);
  registerAdminNamespace(io); // namespace /admin (inerte si OPERATOR_SECRET absent)

  server.listen(config.port, () => {
    console.log(`[server] écoute sur http://localhost:${config.port} (rayon ${config.radiusKm} km)`);
  });

  const shutdown = () => {
    console.log('\n[server] arrêt…');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
