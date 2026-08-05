'use strict';

const { client } = require('./redis');

/**
 * Balayage de clés par motif. Module à part de `redis.js` pour une raison précise :
 * `redis.js` est ce que les tests remplacent dans le cache de modules (cf.
 * `test/helpers/inject-redis.js`), parce qu'il est le seul à charger le paquet npm
 * `redis`. Une primitive posée dedans serait donc à réécrire dans le harnais de test,
 * et la suite exercerait une imitation au lieu du code réel. Ici, elle reçoit le fake
 * comme le vrai client, sans rien savoir de la différence.
 */

/**
 * Toutes les clés correspondant à `pattern`.
 *
 * `SCAN` et jamais `KEYS` : `KEYS` bloque le serveur Redis le temps du parcours, et
 * ces balayages sont déclenchés depuis la console opérateur — un geste d'exploitation
 * ne doit pas pouvoir figer la plateforme. Le curseur peut rendre deux fois la même
 * clé (c'est une garantie de Redis, pas un défaut) : on dédoublonne, pour qu'un
 * appelant qui compte ou qui affiche n'ait pas à s'en soucier.
 */
async function scanKeys(pattern, { count = 500 } = {}) {
  const found = new Set();
  let cursor = 0;
  do {
    const batch = await client.scan(cursor, { MATCH: pattern, COUNT: count });
    cursor = Number(batch.cursor);
    for (const key of batch.keys) found.add(key);
  } while (cursor !== 0);
  return [...found];
}

module.exports = { scanKeys };
