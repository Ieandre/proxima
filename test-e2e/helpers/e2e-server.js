'use strict';

/**
 * Serveur Socket.IO RÉEL pour les tests de bout en bout : même câblage que la
 * production (`registerHandlers` de server/handlers/) sur un vrai transport
 * WebSocket, mais avec le fake-Redis injecté (aucun Redis réel, aucun réseau
 * externe) et sans adaptateur Redis (une seule instance suffit aux tests).
 *
 * Le fake-Redis est injecté par le helper partagé test/helpers/inject-redis.js :
 * son `require.resolve('../../server/infra/redis')` cible ce module quelle que
 * soit l'origine du require, donc l'injection reste valide depuis test-e2e/.
 */

const http = require('node:http');

// IMPORTANT : injecter le fake AVANT de charger la chaîne serveur.
const { fake } = require('../../test/helpers/inject-redis');
const { Server } = require('socket.io');
const { registerHandlers } = require('../../server/handlers');

/** Démarre un serveur sur un port éphémère ; renvoie { io, httpServer, port, url, fake }. */
async function startServer() {
  const httpServer = http.createServer();
  const io = new Server(httpServer, {
    maxHttpBufferSize: 16 * 1024 * 1024,
    cors: { origin: true },
    // Réactivité en test : ping court pour détecter vite les fermetures.
    pingInterval: 2000,
    pingTimeout: 2000,
  });
  registerHandlers(io);
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = httpServer.address();
  return { io, httpServer, port, url: `http://127.0.0.1:${port}`, fake };
}

/** Ferme proprement le serveur. */
async function stopServer({ io, httpServer }) {
  await io.close();
  await new Promise((resolve) => httpServer.close(resolve));
}

module.exports = { startServer, stopServer, fake };
