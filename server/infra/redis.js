'use strict';

const { createClient } = require('redis');
const config = require('../config');

/**
 * Trois connexions Redis :
 *  - `client`    : commandes applicatives (présence GEO, salons, TTL...) ;
 *  - `pubClient` : publication pour l'adaptateur Socket.IO (backplane pub/sub, §4.3) ;
 *  - `subClient` : abonnement pour l'adaptateur (une connexion en mode subscribe
 *                  ne peut pas exécuter de commandes classiques, d'où la séparation).
 */
const client = createClient({ url: config.redisUrl });
const pubClient = createClient({ url: config.redisUrl });
const subClient = pubClient.duplicate();

for (const [name, c] of [['client', client], ['pubClient', pubClient], ['subClient', subClient]]) {
  c.on('error', (err) => console.error(`[redis:${name}]`, err.message));
}

async function connectRedis() {
  await Promise.all([client.connect(), pubClient.connect(), subClient.connect()]);
  // Le contenu utilisateur ne doit jamais toucher le disque (§5.1) : on désactive
  // la persistance au cas où le serveur Redis aurait été lancé avec une config par défaut.
  try {
    await client.configSet('save', '');
    await client.configSet('appendonly', 'no');
  } catch (_) {
    /* CONFIG SET peut être interdit sur certains hébergeurs managés — sans gravité. */
  }
  return { client, pubClient, subClient };
}

module.exports = { client, pubClient, subClient, connectRedis };
