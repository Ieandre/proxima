'use strict';

const path = require('path');

/**
 * Configuration centrale. Tout est surchargeable par variables d'environnement
 * pour faciliter le déploiement (TLS terminé en amont, Redis distant, etc.).
 */
const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

module.exports = {
  port: num(process.env.PORT, 3000),
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',

  // Salons permanents : fichier JSON de référence chargé et réconcilié au boot.
  permanentRoomsFile: process.env.PERMANENT_ROOMS_FILE || path.join(__dirname, 'data', 'permanent-rooms.json'),

  // Présence de proximité — rayon fixe en v1 (RG-03).
  radiusKm: num(process.env.RADIUS_KM, 75),

  // Accès réservé aux majeurs (RG-04) — déclaratif en v1.
  minAge: num(process.env.MIN_AGE, 18),
  maxAge: 120,

  // Renommage en cours de session : délai minimal entre deux changements de pseudo.
  // Chaque changement laisse une trace dans les salons où l'on est présent ; sans ce
  // délai, on pourrait les inonder de messages système.
  renameCooldownMs: num(process.env.RENAME_COOLDOWN_MS, 30000),

  // Durées de vie (TTL) — tout est volatil (RG-01, §4.1).
  ttl: {
    sessionSec: num(process.env.SESSION_TTL, 90), // rafraîchi par heartbeat client
    roomSec: num(process.env.ROOM_TTL, 86400), // garde-fou ; un salon vide est supprimé immédiatement (RG-05)
    // Invitation à une conversation privée. Plafond seulement :
    // l'invitation meurt de toute façon avec la session de son auteur (90 s sans
    // heartbeat), un lien collé ailleurs n'a donc aucune valeur une fois l'onglet fermé.
    inviteSec: num(process.env.INVITE_TTL, 1800), // 30 min
    // Modération : rétention courte d'un signalement (sans IP), purge automatique.
    reportSec: num(process.env.REPORT_TTL, 48 * 3600), // 48 h par défaut (24-72 h)
    incidentSec: num(process.env.INCIDENT_TTL, 72 * 3600), // incident de réquisition prospective
    banSec: num(process.env.BAN_TTL, 90), // exclusion volatile best-effort, aligné sur la session
    // Compteurs onion du tableau de bord opérateur : fenêtre glissante de 24 h.
    // Rien ne s'accumule indéfiniment, y compris les métriques (RG-01).
    onionMetricsSec: num(process.env.ONION_METRICS_TTL, 24 * 3600),
  },

  // Tableau de bord opérateur : cadence de rafraîchissement des métriques AGRÉGÉES
  // poussées vers la console `/admin` (aucune PII, que des compteurs — cf. metrics.js).
  metrics: {
    refreshMs: num(process.env.METRICS_REFRESH_MS, 5000),
  },

  /**
   * Audience et usage dans le temps (`domain/analytics.js`). Mesure maison, côté
   * serveur : ni script tiers, ni cookie, ni identifiant de visiteur — c'est ce qui
   * permet à la page de confidentialité de rester vraie mot pour mot.
   */
  analytics: {
    // `ANALYTICS=0` coupe toute la collecte (les lectures rendent alors des zéros).
    enabled: process.env.ANALYTICS !== '0',
    // Fenêtre de conservation. Un mois : de quoi voir une tendance de référencement
    // sans rien accumuler (RG-01 vaut aussi pour les statistiques).
    retentionDays: num(process.env.ANALYTICS_RETENTION_DAYS, 30),
    // Pas d'échantillonnage de l'affluence. Il fixe aussi le nombre de créneaux par
    // jour (86 400 000 / pas), donc la taille bornée du hash journalier.
    sampleMs: num(process.env.ANALYTICS_SAMPLE_MS, 5 * 60 * 1000),
    // Fuseau de découpe des journées : celui de l'exploitant, pas UTC — un tableau
    // de bord dont la journée commence à 2 h du matin ne se lit pas.
    timeZone: process.env.ANALYTICS_TZ || 'Europe/Paris',
    // Plafond de domaines référents distincts par jour. Le champ est alimenté par un
    // tiers (l'en-tête `Referer`) : sans plafond, sa cardinalité ne serait pas bornée.
    maxReferrerHosts: num(process.env.ANALYTICS_MAX_REFERRERS, 200),
  },

  rooms: {
    // Plafond de membres d'un salon à MOT DE PASSE : borne la diffusion d'un espace de
    // groupe non modérable. Ne s'applique qu'à ce régime — un salon en régime de groupe
    // (public ou privé sur invitation) n'est pas plafonné, sa clé ne gardant pas l'entrée.
    encryptedMaxMembers: num(process.env.ENCRYPTED_ROOM_MAX_MEMBERS, 16),
    // Membres sollicités pour servir la clé d'un salon public à un arrivant. Plus d'un
    // pour ne pas dépendre d'un membre injoignable ; l'arrivant retient la première
    // réponse valide, les autres coûtent une petite enveloppe chacune.
    keyResponders: num(process.env.ROOM_KEY_RESPONDERS, 3),
  },

  // Sécurité IP : jamais de log en clair, hash salé à sel rotatif et TTL court (RG-08, §5.1).
  ipSalt: {
    rotateMs: num(process.env.IP_SALT_ROTATE_MS, 5 * 60 * 1000), // sel rotatif toutes les 5 min
  },

  // Nombre de reverse-proxys de confiance en amont (TLS terminé par Caddy/Nginx).
  // Détermine quel maillon de `X-Forwarded-For` est l'IP client RÉELLE : on lit le
  // n-ième élément EN PARTANT DE LA FIN (le maillon ajouté par NOTRE proxy), jamais
  // le premier — forgeable par le client, il permettrait de contourner l'anti-spam
  // ou d'empoisonner le compteur d'autrui (RG-08). 0 = exposition directe (X-Forwarded-For
  // ignoré). Prod derrière Caddy = 1. À ajuster si la chaîne de proxys change.
  trustedProxies: num(process.env.TRUSTED_PROXIES, 1),

  // Anti-spam léger basé sur le hash d'IP éphémère.
  rateLimit: {
    windowSec: num(process.env.RL_WINDOW_SEC, 10),
    maxEvents: num(process.env.RL_MAX, 30), // messages / fenêtre / hash IP
  },

  /**
   * Service onion Tor. Le trafic onion arrive par `tor` puis
   * Caddy en loopback : TOUS les visiteurs partagent donc l'IP 127.0.0.1, et donc
   * un seul compteur d'anti-spam — un utilisateur bavard ferait taire tous les
   * autres. On bascule sur deux seaux dédiés (par connexion + plafond global).
   *
   * `marker` est l'en-tête posé par le bloc Caddy onion et RETIRÉ par le bloc
   * clearnet. Même raisonnement que `trustedProxies` : on ne fait confiance qu'à
   * ce que NOS proxys ont écrit. Sans le retrait côté clearnet, n'importe quel
   * visiteur échapperait à la limitation par IP en forgeant l'en-tête.
   */
  onion: {
    // Adresse `.onion` publiée (annonce `Onion-Location` + mention dans l'UI).
    // Vide => aucune annonce, et la sonde de marquage ci-dessous reste muette.
    host: process.env.ONION_HOST || '',
    // En-tête de marquage. Minuscules : Node normalise les noms d'en-tête entrants.
    marker: 'x-proxima-onion',
    // Plafond global du trafic onion par fenêtre `rateLimit.windowSec`. Borne le
    // dégât maximal sans jamais faire taire un utilisateur isolé (que protège le
    // seau par connexion). Le ×50 est posé à l'intuition : à réviser sur les
    // compteurs de `metrics.js` plutôt qu'au jugé (design, point ouvert n°2).
    globalRlMax: num(process.env.ONION_RL_GLOBAL_MAX, num(process.env.RL_MAX, 30) * 50),
  },

  // En-tête HSTS (activé seulement derrière TLS, cf. §5.1).
  hsts: process.env.HSTS === '1',

  // Modération & conformité (DSA/RGPD)
  // Jeton unique de la console opérateur (namespace /admin). Vide => console inerte (refus total).
  operatorSecret: process.env.OPERATOR_SECRET || '',
  // Point de contact publié (DSA art.11-12). Canal opérateur hors-application, distinct du zéro-PII utilisateur.
  contactEmail: process.env.CONTACT_EMAIL || 'proximachat@proton.me',
  // Aucun filtre de mots-clés n'est configurable : tout salon étant chiffré, le serveur
  // ne voit aucun contenu à analyser. La modération passe intégralement par le
  // signalement (DSA art.16).
  moderation: {
    // Plafond de gel du sel IP pour une préservation prospective (exception bornée à RG-08).
    saltFreezeMaxSec: num(process.env.SALT_FREEZE_MAX_SEC, 72 * 3600),
  },
};
