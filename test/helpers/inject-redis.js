'use strict';

/**
 * Injecte le fake Redis À LA PLACE du module `server/redis.js` dans le cache de
 * modules de Node, AVANT que tout module serveur ne soit chargé. Comme chaque
 * module fait `const { client } = require('./redis')` au chargement, il suffit
 * que cette entrée de cache soit présente en amont pour que toute la chaîne
 * (sessions, rooms, geo, security…) reçoive le client en mémoire.
 *
 * `node --test` exécutant chaque fichier de test dans un processus isolé, le
 * cache n'est jamais partagé entre fichiers : il suffit d'appeler `reset()`
 * entre les tests d'un même fichier pour repartir d'un état propre.
 *
 * Usage (en tout premier `require` du fichier de test) :
 *   const { fake } = require('./helpers/inject-redis');
 *   const rooms = require('../../server/domain/rooms'); // reçoit le fake
 *   beforeEach(() => fake.__reset());
 */

const { createFakeRedis } = require('./fake-redis');

const fake = createFakeRedis();

const redisPath = require.resolve('../../server/infra/redis');
require.cache[redisPath] = {
  id: redisPath,
  filename: redisPath,
  loaded: true,
  children: [],
  exports: {
    client: fake,
    pubClient: fake,
    subClient: fake,
    connectRedis: async () => ({ client: fake, pubClient: fake, subClient: fake }),
  },
};

module.exports = { fake };
