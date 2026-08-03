'use strict';

/**
 * Amorceur de développement LOCAL — lance le serveur complet sans aucun Redis.
 *
 * Pourquoi : `server/index.js` exige un Redis réel (présence, pub/sub, géo, TTL).
 * Sur un poste sans Redis installé, `npm run dev` échoue au `connectRedis()`.
 * Ce fichier réutilise le fake Redis en mémoire déjà éprouvé par les suites de
 * tests, puis charge `server/index.js` tel quel — aucun code de production n'est
 * modifié ni dupliqué, donc pas de dérive possible entre dev et prod.
 *
 * Deux substitutions dans le cache de modules de Node, AVANT tout require serveur :
 *
 *  1. `server/redis.js` -> fake Redis en mémoire (via test/helpers/inject-redis.js,
 *     le même mécanisme que test-e2e/helpers/e2e-server.js) ;
 *  2. `@socket.io/redis-adapter` -> `createAdapter()` renvoie `undefined`, ce qui
 *     fait retomber Socket.IO sur son adaptateur mémoire par défaut. Nécessaire
 *     car le fake n'implémente pas `subscribe`/`publish` : le backplane pub/sub
 *     ne sert qu'au scaling multi-instances, inutile en local.
 *
 * Limites assumées : une seule instance, et tout l'état disparaît à chaque
 * redémarrage de `--watch`. Sans conséquence, l'application étant éphémère par
 * conception (RG-01).
 *
 * Usage : npm run dev:local
 */

// 1. Fake Redis à la place de server/redis.js.
require('../test/helpers/inject-redis');

// 2. Neutralisation de l'adaptateur Redis de Socket.IO.
const adapterPath = require.resolve('@socket.io/redis-adapter');
require.cache[adapterPath] = {
  id: adapterPath,
  filename: adapterPath,
  loaded: true,
  children: [],
  exports: { createAdapter: () => undefined },
};

console.log('[dev-local] fake Redis en mémoire · adaptateur Redis neutralisé');

// 3. Le serveur réel, inchangé.
require('../server/index.js');
