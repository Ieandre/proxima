'use strict';

const config = require('./config');
const analytics = require('./domain/analytics');
const security = require('./security');
const { FILE_BY_PATH } = require('./pages');
const { CITY_FILE_BY_PATH } = require('./city-pages');

/**
 * Collecte d'audience — la couche HTTP au-dessus de `domain/analytics.js`.
 *
 * Sa place hors de `domain/` est la même que celle de `security.js` : elle parle
 * Express (en-têtes, requête), ce qu'un module de domaine ne fait pas. Elle
 * décide de CE QU'ON COMPTE ; le domaine décide de COMMENT on le range.
 *
 * Trois filtres, dans cet ordre, et chacun retire du bruit que le suivant ne
 * saurait plus distinguer :
 *
 *  1. **Une route déclarée, et rien d'autre.** Le chemin est cherché dans les
 *     tables de `pages.js` et `city-pages.js` : c'est ce qui garantit qu'aucune
 *     chaîne venue de l'extérieur n'atteint Redis. Assets, API, console
 *     opérateur et 404 sont donc hors du compte (la 404 a son propre compteur,
 *     comme signal d'exploitation).
 *
 *  2. **Les explorateurs à part.** Sur un site de 78 pages indexables, les
 *     robots des moteurs pèsent plus lourd que les visiteurs. Les compter
 *     rendrait la courbe illisible au moment précis où elle devient utile —
 *     après une mise en ligne, quand l'exploration s'intensifie. L'en-tête
 *     `User-Agent` est LU pour ce tri, jamais conservé.
 *
 *  3. **Le référent, réduit à son domaine.** Ni chemin, ni requête : `Referer`
 *     peut transporter les paramètres de la page d'origine, dont on n'a que
 *     faire et qu'on n'a pas à stocker.
 *
 * Le comptage ne retarde jamais la réponse : il part sans être attendu, et une
 * erreur Redis y reste — une statistique manquée ne doit pas coûter une page.
 */

/**
 * Explorateurs et sondes. Volontairement large et grossier : le faux positif
 * coûte une visite non comptée, le faux négatif fausse toute une courbe.
 */
const BOT_RE = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora|pinterest|monitor|uptime|curl|wget|python-requests|headless|lighthouse|axios|okhttp/i;

/** `/cgu/` et `/cgu` sont la même page ; `/` reste `/`. Miroir de `index.js`. */
function canonicalPath(pathname) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') || '/' : pathname;
}

/**
 * La route déclarée correspondant à ce chemin, ou `null`. C'est la seule porte
 * d'entrée du comptage : un chemin qui n'est pas dans les tables n'existe pas
 * pour les statistiques.
 */
function declaredPath(pathname) {
  let clean;
  try {
    clean = canonicalPath(decodeURIComponent(pathname));
  } catch {
    return null; // séquence %XX invalide — rien à compter
  }
  if (FILE_BY_PATH.has(clean) || CITY_FILE_BY_PATH.has(clean)) return clean;
  return null;
}

/**
 * Domaine d'origine d'une arrivée, ou chaîne vide pour une arrivée directe.
 *
 * Le `www.` est retiré des deux côtés : sans cela `www.proximachat.eu` passerait
 * pour un site tiers qui nous envoie du monde, et le classement des backlinks —
 * la raison d'être de ce compteur — commencerait par nous-mêmes.
 */
function normalizeReferrer(raw, selfHost) {
  if (!raw) return '';
  let host;
  try {
    host = new URL(String(raw)).hostname.toLowerCase();
  } catch {
    return '';
  }
  host = host.replace(/^www\./, '');
  if (!host || host.length > 64) return '';
  // Un hôte légitime ne contient que ces caractères ; le reste est forgé.
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(host)) return '';
  if (host === String(selfHost || '').toLowerCase().replace(/^www\./, '')) return '';
  return host;
}

/**
 * Middleware de comptage. À monter AVANT le service des fichiers, pour voir la
 * requête quel que soit ce qui y répond ensuite.
 */
function pageViews() {
  return (req, res, next) => {
    if (!config.analytics.enabled || req.method !== 'GET') return next();

    const path = declaredPath(req.path);
    if (!path) return next();
    if (BOT_RE.test(String(req.headers['user-agent'] || ''))) return next();

    // Le hash d'IP à sel rotatif, jamais l'IP (RG-08). `clientIp` attend la forme
    // d'un handshake Socket.IO ; une requête Express en offre les deux champs.
    const ip = security.clientIp({ address: req.socket && req.socket.remoteAddress, headers: req.headers });

    analytics
      .recordPageView({
        path,
        ipHash: security.hashIp(ip),
        referrerHost: normalizeReferrer(req.headers.referer || req.headers.referrer, req.hostname),
      })
      .catch((err) => console.error('[audience]', err.message));

    next();
  };
}

/** Middleware de comptage des vraies 404, à monter avec le gestionnaire 404. */
function notFound() {
  return (req, _res, next) => {
    if (config.analytics.enabled && req.method === 'GET') {
      analytics.recordNotFound().catch((err) => console.error('[audience:404]', err.message));
    }
    next();
  };
}

let sampler = null;

/**
 * Démarre le relevé périodique de l'affluence. Indépendant du tableau de bord
 * opérateur, qui ne calcule rien quand personne ne regarde : une courbe creusée
 * chaque fois que la console est fermée ne vaudrait rien.
 *
 * Le timer est `unref` — il ne retient jamais le processus à l'arrêt.
 */
function startSampler() {
  if (!config.analytics.enabled || sampler) return sampler;
  const tick = () => analytics.sampleTraffic().catch((err) => console.error('[audience:sample]', err.message));
  tick(); // premier point immédiat : un redémarrage ne laisse pas de trou d'un pas
  sampler = setInterval(tick, config.analytics.sampleMs);
  if (typeof sampler.unref === 'function') sampler.unref();
  return sampler;
}

function stopSampler() {
  if (sampler) clearInterval(sampler);
  sampler = null;
}

module.exports = { pageViews, notFound, startSampler, stopSampler, normalizeReferrer, declaredPath, BOT_RE };
