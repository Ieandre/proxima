'use strict';

const crypto = require('crypto');
const { client } = require('./infra/redis');
const config = require('./config');

/**
 * Confidentialité des IP (RG-08, §5.1) : aucune adresse IP n'est jamais
 * journalisée ni stockée en clair. Quand une IP est nécessaire (anti-spam),
 * seul un hash salé est manipulé, avec un sel rotatif et un TTL très court.
 */
let currentSalt = crypto.randomBytes(32);
let previousSalt = currentSalt;

/**
 * Préservation prospective (réquisition légale) : quand le sel
 * est « gelé », la rotation est suspendue afin que `hashIp` reste corrélable
 * À PARTIR DE l'instant du gel — jamais rétroactivement. C'est une exception
 * EXPLICITE et BORNÉE à RG-08 : déclenchée par l'opérateur, plafonnée par
 * `config.moderation.saltFreezeMaxSec`, avec retour automatique au sel rotatif.
 */
let frozen = false;
let unfreezeTimer = null;

/** Rotation du sel — primitive invoquée périodiquement, suspendue pendant un gel. */
function rotateSalt() {
  if (frozen) return;
  previousSalt = currentSalt;
  currentSalt = crypto.randomBytes(32);
}

const rotationTimer = setInterval(rotateSalt, config.ipSalt.rotateMs);
rotationTimer.unref();

/** Fige le sel IP pour une fenêtre de préservation prospective (exception bornée à RG-08). */
function freezeSalt() {
  frozen = true;
  if (unfreezeTimer) clearTimeout(unfreezeTimer);
  // Garde-fou : retour automatique au sel rotatif même si l'opérateur oublie de dégeler.
  unfreezeTimer = setTimeout(unfreezeSalt, config.moderation.saltFreezeMaxSec * 1000);
  unfreezeTimer.unref();
}

/** Rétablit la rotation normale du sel IP. */
function unfreezeSalt() {
  frozen = false;
  if (unfreezeTimer) {
    clearTimeout(unfreezeTimer);
    unfreezeTimer = null;
  }
}

/** État du gel — exposé pour la console opérateur et les tests. */
function isSaltFrozen() {
  return frozen;
}

/**
 * IP client réelle depuis un handshake Socket.IO, résistante au spoofing de
 * `X-Forwarded-For` (RG-08). Le client peut préfixer des maillons arbitraires à
 * l'en-tête ; on ne fait donc confiance qu'au maillon ajouté par NOS propres
 * proxys, en lisant le `config.trustedProxies`-ième élément EN PARTANT DE LA FIN.
 * 0 proxy => exposition directe, l'en-tête est ignoré au profit du pair TCP.
 * Résultat jamais journalisé ni stocké en clair (il ne sert qu'à `hashIp`).
 */
function clientIp(handshake) {
  const direct = (handshake && handshake.address) || 'unknown';
  const n = config.trustedProxies;
  if (!n || n < 1) return direct; // exposition directe : X-Forwarded-For non fiable
  const fwd = handshake && handshake.headers && handshake.headers['x-forwarded-for'];
  if (!fwd) return direct;
  const list = String(fwd)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!list.length) return direct;
  const idx = list.length - n;
  return list[idx >= 0 ? idx : 0] || direct;
}

/** Hash salé d'une IP — non réversible, et invalidé à chaque rotation de sel. */
function hashIp(ip) {
  return crypto.createHash('sha256').update(currentSalt).update(String(ip)).digest('base64url').slice(0, 22);
}

/**
 * Incrémente un seau à fenêtre glissante et dit si la limite est franchie.
 * Primitive commune au seau clearnet (par hash d'IP) et aux seaux onion.
 */
async function hitBucket(key, maxEvents) {
  const count = await client.incr(key);
  if (count === 1) await client.expire(key, config.rateLimit.windowSec);
  return count > maxEvents;
}

/**
 * Limitation de débit best-effort par hash d'IP éphémère.
 * Compteur Redis à TTL court (la fenêtre). Renvoie true si la limite est dépassée.
 */
async function isRateLimited(ip) {
  return hitBucket(`rl:${hashIp(ip)}`, config.rateLimit.maxEvents);
}

// ==========================================================================
// SERVICE ONION TOR
// ==========================================================================

const ONION_GLOBAL_BUCKET = 'rl:onion:all';

/**
 * Adresses de bouclage. Le trafic onion traverse `tor` puis Caddy, tous deux sur
 * la VM : vu de Node, il vient toujours de la boucle locale.
 */
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost']);

/** Pair TCP, que la source soit une requête Express ou un handshake Socket.IO. */
function peerAddress(source) {
  const s = source || {};
  return s.address || (s.socket && s.socket.remoteAddress) || (s.connection && s.connection.remoteAddress) || 'unknown';
}

/**
 * Compteurs agrégés lus par `metrics.js` (aucune PII : de simples dénombrements).
 * TTL glissant — comme tout le reste du projet, rien ne s'accumule indéfiniment.
 */
const COUNTER_ONION_GLOBAL_RL = 'metrics:onion:global-rl';
const COUNTER_ONION_UNMARKED = 'metrics:onion:unmarked';

async function bumpCounter(key) {
  const count = await client.incr(key);
  if (count === 1) await client.expire(key, config.ttl.onionMetricsSec);
  return count;
}

/**
 * Le trafic arrive-t-il par NOTRE service onion ?
 *
 * Deux conditions, délibérément redondantes. Le reverse-proxy retire déjà le
 * marqueur inconditionnellement côté clearnet et ne le pose que sur un bloc lié à
 * la boucle locale : un en-tête forgé depuis Internet n'atteint donc pas Node.
 * Mais cette garantie tient à une ligne de configuration hors du dépôt. On la
 * double ici en exigeant AUSSI une origine loopback — sans quoi la contre-mesure
 * serait intestable depuis le code.
 *
 * Contrepartie assumée : déporter `tor` sur une autre machine cesserait d'honorer
 * le marqueur (repli sur le compteur d'anti-spam commun). Changement de topologie
 * à traiter comme tel, pas bug.
 */
function isOnionRequest(source) {
  const headers = (source && source.headers) || {};
  if (headers[config.onion.marker] !== '1') return false;
  return LOOPBACK.has(String(clientIp({ headers, address: peerAddress(source) })));
}

/** Idem depuis un handshake Socket.IO (mêmes en-têtes, autre porteur). */
function isOnionHandshake(handshake) {
  return isOnionRequest(handshake);
}

/**
 * Limitation du trafic onion : deux seaux, évalués ensemble. Derrière l'onion
 * tous les visiteurs partagent une IP.
 *
 *  - `rl:onion:<id de connexion>` les isole, sans quoi un seul bavard ferait taire
 *    tout le trafic Tor. Contournable en se reconnectant : best-effort assumé.
 *  - `rl:onion:all` borne le dégât maximal sans faire taire un isolé.
 *
 * Les DEUX sont incrémentés dans tous les cas : court-circuiter le second quand le
 * premier a déclenché fausserait le plafond global, l'abuseur cessant d'être
 * compté au moment précis où il pèse le plus.
 */
async function isOnionRateLimited(connectionId) {
  const [perConnection, global] = await Promise.all([
    hitBucket(`rl:onion:${connectionId}`, config.rateLimit.maxEvents),
    hitBucket(ONION_GLOBAL_BUCKET, config.onion.globalRlMax),
  ]);
  if (global) await bumpCounter(COUNTER_ONION_GLOBAL_RL);
  return perConnection || global;
}

/**
 * Sonde du marqueur manquant — le mode d'échec qui compte.
 *
 * Bloc de reverse-proxy oublié ou perdu à la restauration ⇒ le trafic onion
 * arrive non marqué et retombe sur le compteur de 127.0.0.1 : exactement le déni
 * de service collectif que ce dispositif existe pour empêcher, et sans signal. On
 * détecte le symptôme (loopback + `ONION_HOST` renseigné + marqueur absent) et on
 * le rend bruyant. Faux positif possible (un `curl` local) : coûte une ligne de
 * log, jamais un blocage.
 */
let lastUnmarkedLog = 0;

async function noteUnmarkedLoopback(ip) {
  if (!config.onion.host) return false; // pas d'onion annoncé : rien à surveiller
  if (!LOOPBACK.has(String(ip))) return false;
  await bumpCounter(COUNTER_ONION_UNMARKED);
  // Une ligne par fenêtre, pas une par connexion : sous charge, le symptôme ne
  // doit pas noyer le journal qui sert à le diagnostiquer.
  const now = Date.now();
  if (now - lastUnmarkedLog > config.rateLimit.windowSec * 1000) {
    lastUnmarkedLog = now;
    console.warn(
      '[onion] connexion en loopback SANS le marqueur alors que ONION_HOST est renseigné — ' +
        'le bloc onion du Caddyfile ne s\'applique probablement pas. Tout le trafic Tor partage ' +
        'alors un seul compteur d\'anti-spam.',
    );
  }
  return true;
}

/** Compteurs onion pour le tableau de bord opérateur (lecture seule). */
async function onionCounters() {
  const [globalRl, unmarked] = await Promise.all([
    client.get(COUNTER_ONION_GLOBAL_RL),
    client.get(COUNTER_ONION_UNMARKED),
  ]);
  return {
    enabled: !!config.onion.host,
    globalRateLimited: Number(globalRl) || 0,
    unmarkedLoopback: Number(unmarked) || 0,
  };
}

/**
 * Chemins et URL qui ne doivent JAMAIS apparaître dans un moteur de recherche.
 *
 * `robots.txt` demande de ne pas explorer, `X-Robots-Tag` garantit la
 * non-indexation même quand l'URL est découverte autrement : une URL bloquée par
 * robots.txt mais liée ailleurs peut malgré tout être listée.
 *
 * Les liens d'invitation sont dans le lot — salon (`/?r=<salon>&k=<clé>`) comme
 * conversation privée (`/?i=<jeton>`) : ce sont des accès à des espaces privés.
 * Source unique volontaire (`robotsDirective` ci-dessous) pour que la prochaine
 * forme de lien privé ne soit pas oubliée dans l'une des deux copies.
 */
function isInviteLink(url) {
  return /[?&][ri]=/.test(url);
}

function isUnindexable(req) {
  const url = String((req && (req.originalUrl || req.url)) || '');
  const pathname = url.split('?')[0];
  return (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/operator') ||
    pathname.startsWith('/socket.io') ||
    isInviteLink(url)
  );
}

/**
 * Valeur du `X-Robots-Tag`, ou null s'il ne faut pas en émettre.
 *
 * `follow` pour une invitation, `nofollow` pour les chemins techniques : une page
 * d'invitation reste une page du site — on ne veut pas qu'elle soit indexée, mais
 * rien ne justifie de couper la circulation vers l'accueil. Un `/api/` ou un
 * `/socket.io`, si.
 */
function robotsDirective(req) {
  const url = String((req && (req.originalUrl || req.url)) || '');
  if (isInviteLink(url)) return 'noindex, follow';
  return isUnindexable(req) ? 'noindex, nofollow' : null;
}

/** En-têtes HTTP de durcissement (CSP stricte, pas de tiers — §5.1). */
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      // 'wasm-unsafe-eval' : autorise uniquement la compilation WebAssembly
      // (chemin éventuel de libsodium) — n'autorise PAS eval()/new Function().
      // Le hash sha256 autorise UNIQUEMENT le bloc <script type="application/ld+json">
      // de données structurées (SEO) présent dans frontend/index.html — pas d'unsafe-inline.
      // ⚠ À recalculer si ce bloc JSON-LD change (cf. frontend/index.html) : le hash porte
      // sur les octets exacts du contenu de la balise. C'est pourquoi ce contenu tient sur
      // une seule ligne, sans indentation — sinon le hash dépendrait des fins de ligne
      // (CRLF en dev Windows contre LF sur la VM). `test/csp-jsonld.test.js` verrouille
      // la correspondance : il échoue si l'un des deux change sans l'autre.
      "script-src 'self' 'wasm-unsafe-eval' 'sha256-bn1OB6a5kryvART3H99SKDfPU9mznp7eIPRPJm6UNds='",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "font-src 'self' data:",
      "connect-src 'self' ws: wss:",
      // Aucun plugin/embed : neutralise <object>/<embed>/<applet> (surface XSS legacy).
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  );
  const onion = isOnionRequest(req);

  // HSTS jamais sur l'onion. La RFC 6797 impose déjà à l'agent d'ignorer un HSTS
  // reçu hors TLS, donc l'effet est nul en pratique — mais si un navigateur
  // l'appliquait à l'hôte `.onion`, il forcerait `https://…onion`, qui ne peut
  // présenter aucun certificat : site inaccessible. Précaution réelle.
  if (config.hsts && !onion) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  /**
   * `Onion-Location` : Tor Browser propose alors la bascule vers l'onion. Trois
   * garde-fous — jamais sur l'onion lui-même (auto-référence), jamais sans adresse
   * configurée, et uniquement sur `/`, seule route de la SPA : l'en-tête n'est
   * honoré que sur une navigation de premier niveau, le poser sur `/api/legal` ou
   * sur une 404 serait du bruit sans effet.
   */
  if (config.onion.host && !onion && req.path === '/') {
    res.setHeader('Onion-Location', `http://${config.onion.host}/`);
  }

  const robots = robotsDirective(req);
  if (robots) res.setHeader('X-Robots-Tag', robots);
  next();
}

module.exports = {
  clientIp,
  hashIp,
  isRateLimited,
  securityHeaders,
  isUnindexable,
  robotsDirective,
  rotateSalt,
  freezeSalt,
  unfreezeSalt,
  isSaltFrozen,
  // Service onion Tor
  isOnionRequest,
  isOnionHandshake,
  isOnionRateLimited,
  noteUnmarkedLoopback,
  onionCounters,
};
