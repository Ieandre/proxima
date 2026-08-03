'use strict';

const { io: Client } = require('socket.io-client');

/** Ouvre un client Socket.IO connecté au serveur de test (WebSocket seul). */
function connect(url) {
  const socket = Client(url, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
  return socket;
}

/** Attend la connexion effective. */
function ready(socket) {
  return new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
}

/** Émission avec accusé (dernier argument = callback) sous forme de Promise. */
function rpc(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

/** Émission avec accusé pour les handlers dont l'unique argument est le callback. */
function rpcCb(socket, event) {
  return new Promise((resolve) => socket.emit(event, resolve));
}

/** Attend le prochain événement `event` (avec délai de garde). */
function once(socket, event, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timeout en attente de « ${event} »`));
    }, timeoutMs);
    function handler(payload) {
      clearTimeout(timer);
      resolve(payload);
    }
    socket.once(event, handler);
  });
}

/** Identification standard (valeurs par défaut Paris/majeur). */
function identify(socket, overrides = {}) {
  return rpc(socket, 'identify', {
    pseudo: 'Alice',
    age: 30,
    gender: 'F',
    city: 'Paris',
    pub: 'PUB_ALICE',
    ...overrides,
  });
}

module.exports = { connect, ready, rpc, rpcCb, once, identify };
