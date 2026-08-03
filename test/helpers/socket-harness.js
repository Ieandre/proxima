'use strict';

/**
 * Harness Socket.IO en mémoire — émule STRICTEMENT la surface d'API que
 * `server/handlers/` (et `room-actions.js`) utilisent, sans réseau ni dépendance
 * npm. But : piloter les handlers de bout en bout (identification, présence, MP
 * chiffrés, salons, modération, gouvernance) comme le ferait un vrai client, en
 * observant les événements émis et l'état du fake-Redis.
 *
 * Fidélité volontairement bornée au besoin des handlers :
 *  - `io.to(x)` / `io.in(x)` / `socket.to(x)` diffusent aux sockets présents dans
 *    la « room » `x` (au sens Socket.IO : `user:<id>`, `room:<id>`, `lobby`…) ;
 *  - `socket.to(x)` exclut l'émetteur (comme le vrai Socket.IO) ;
 *  - `io.of('/admin').to('operators').emit(...)` est capturé dans `io.adminEmits` ;
 *  - `io.in(x).socketsLeave(y)` retire de la room `y` tous les sockets de `x` ;
 *  - chaque socket possède une « inbox » : la liste ordonnée des { event, payload }
 *    qu'il a reçus (via son propre `emit` ou une diffusion de room).
 *
 * Chaque socket expose des aides de test :
 *  - `deliver(event, payload)`  : déclenche un handler sans accusé (fire-and-forget) ;
 *  - `rpc(event, payload)`      : déclenche un handler `(payload, cb)` et renvoie l'accusé ;
 *  - `rpcCb(event)`             : déclenche un handler `(cb)` (ex. room:list) et renvoie l'accusé ;
 *  - `received(event?)`         : événements reçus (filtrés par nom si fourni) ;
 *  - `last(event)`              : dernier payload reçu pour `event` ;
 *  - `clearInbox()`             : vide l'inbox (pratique entre deux phases).
 */

class Hub {
  constructor() {
    this.rooms = new Map(); // nom de room -> Set<FakeSocket>
    this.sockets = new Set();
    this.adminEmits = []; // { ns, room, event, payload }
  }

  members(name) {
    return this.rooms.get(name) || new Set();
  }

  join(name, sock) {
    if (!this.rooms.has(name)) this.rooms.set(name, new Set());
    this.rooms.get(name).add(sock);
  }

  leave(name, sock) {
    const s = this.rooms.get(name);
    if (s) s.delete(sock);
  }

  emitToRoom(name, event, payload, except) {
    for (const sock of this.members(name)) {
      if (sock === except) continue;
      sock.inbox.push({ event, payload });
    }
  }
}

/** Émetteur renvoyé par io.to/io.in : diffuse et sait faire sortir des sockets. */
function roomEmitter(hub, name) {
  return {
    emit: (event, payload) => hub.emitToRoom(name, event, payload, null),
    socketsLeave: (target) => {
      for (const sock of [...hub.members(name)]) hub.leave(target, sock);
    },
  };
}

// Identifiant de connexion, comme en attribue le vrai Socket.IO. Compteur plutôt
// qu'aléatoire : les tests restent déterministes. `socket.js` s'en sert comme clé
// du seau d'anti-spam par connexion sur l'onion — sans lui, toutes les connexions
// du harness partageraient `rl:onion:undefined` et le test correspondant serait
// vert pour la mauvaise raison.
let socketSeq = 0;

class FakeSocket {
  constructor(hub, opts = {}) {
    this._hub = hub;
    this.id = opts.id || `sock${++socketSeq}`;
    this.data = {};
    this.handlers = new Map();
    this.inbox = [];
    this.handshake = {
      headers: {
        ...(opts.forwardedFor ? { 'x-forwarded-for': opts.forwardedFor } : {}),
        // Marqueur du bloc Caddy onion (design 2026-07-29). `onion: true` simule
        // une arrivée par le service onion : en-tête posé ET origine loopback,
        // les deux conditions exigées par `security.isOnionRequest`.
        ...(opts.onion ? { 'x-proxima-onion': '1' } : {}),
      },
      address: opts.address || '127.0.0.1',
    };
  }

  // ---- Surface Socket.IO consommée par socket.js -------------------------
  on(event, handler) {
    this.handlers.set(event, handler);
    return this;
  }

  emit(event, payload) {
    this.inbox.push({ event, payload });
    return true;
  }

  join(name) {
    this._hub.join(name, this);
  }

  leave(name) {
    this._hub.leave(name, this);
  }

  /** socket.to(x) : diffusion à la room x en EXCLUANT l'émetteur. */
  to(name) {
    return { emit: (event, payload) => this._hub.emitToRoom(name, event, payload, this) };
  }

  // ---- Aides de test -----------------------------------------------------
  async deliver(event, payload) {
    return this._fire(event, payload);
  }

  async rpc(event, payload) {
    let ackVal;
    const cb = (v) => {
      ackVal = v;
    };
    await this._fire(event, payload, cb);
    return ackVal;
  }

  async rpcCb(event) {
    let ackVal;
    const cb = (v) => {
      ackVal = v;
    };
    await this._fire(event, cb);
    return ackVal;
  }

  async _fire(event, ...args) {
    const handler = this.handlers.get(event);
    if (!handler) throw new Error(`Aucun handler enregistré pour '${event}'`);
    return handler(...args);
  }

  received(event) {
    return event ? this.inbox.filter((m) => m.event === event) : this.inbox.slice();
  }

  last(event) {
    const list = this.received(event);
    return list.length ? list[list.length - 1].payload : undefined;
  }

  count(event) {
    return this.received(event).length;
  }

  clearInbox() {
    this.inbox = [];
  }
}

/**
 * Crée un harness : renvoie `{ io, connect, hub }`.
 * `connect(opts)` crée un socket, exécute le callback `connection` (qui enregistre
 * tous les handlers) et renvoie le socket prêt à être piloté.
 */
function createHarness() {
  const hub = new Hub();
  let onConnection = null;

  const io = {
    on(event, cb) {
      if (event === 'connection') onConnection = cb;
    },
    to: (name) => roomEmitter(hub, name),
    in: (name) => roomEmitter(hub, name),
    of: (ns) => ({
      to: (room) => ({
        emit: (event, payload) => hub.adminEmits.push({ ns, room, event, payload }),
      }),
    }),
    // Exposés pour les assertions.
    adminEmits: hub.adminEmits,
    hub,
  };

  const connect = (opts = {}) => {
    if (!onConnection) throw new Error('registerHandlers(io) doit être appelé avant connect()');
    const socket = new FakeSocket(hub, opts);
    hub.sockets.add(socket);
    onConnection(socket);
    return socket;
  };

  return { io, connect, hub };
}

module.exports = { createHarness, FakeSocket, Hub };
