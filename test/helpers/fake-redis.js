'use strict';

/**
 * Fake Redis en mémoire pour les tests — implémente uniquement les commandes
 * utilisées par le serveur (hash, zset, set, string, GEO). Aucune dépendance
 * réseau ni npm : la suite tourne avec le seul runner natif `node:test`.
 *
 * Fidélité volontairement limitée à ce dont le code a besoin :
 *  - les valeurs de hash sont stockées en chaînes (comme node-redis) ;
 *  - `expire` ne fait pas expirer réellement : il renvoie 1 si la clé existe,
 *    0 sinon (suffisant pour la logique de heartbeat/TTL testée) ;
 *  - un index GEO partage sa clé avec un zset (comme Redis) : `zRem` retire
 *    aussi bien du zset que de l'index géospatial ;
 *  - `geoSearch` en mode FROMMEMBER calcule les distances par formule de
 *    Haversine et lève comme Redis si le membre de référence est absent.
 */

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // rayon terrestre moyen (km)
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

class FakeRedis {
  constructor() {
    this.__reset();
  }

  /** Vide tous les espaces de stockage — à appeler entre chaque test. */
  __reset() {
    this.hashes = new Map(); // key -> Map(field -> string)
    this.zsets = new Map(); // key -> Map(member -> score:number)
    this.sets = new Map(); // key -> Set(string)
    this.strings = new Map(); // key -> string
    this.geos = new Map(); // key -> Map(member -> { lon, lat })
  }

  /** Une clé est « présente » si l'un des espaces la connaît (pour EXPIRE/DEL). */
  __exists(key) {
    return (
      this.hashes.has(key) ||
      this.zsets.has(key) ||
      this.sets.has(key) ||
      this.strings.has(key) ||
      this.geos.has(key)
    );
  }

  // ---- Connexion / administration (no-op) --------------------------------
  async connect() {}
  async quit() {}
  async disconnect() {}
  duplicate() {
    return this;
  }
  on() {
    return this;
  }
  async configSet() {
    return 'OK';
  }

  /**
   * Balayage par curseur (`SCAN`). Le fake rend TOUT en un seul lot et un curseur de
   * retour à 0 : la boucle de `infra/scan.js` s'arrête au premier tour et les tests
   * restent déterministes. Seul le joker `*` du motif est interprété — le seul que le
   * serveur emploie.
   */
  async scan(_cursor, opts = {}) {
    const pattern = String(opts.MATCH || opts.match || '*');
    const re = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
    const keys = new Set();
    for (const store of [this.hashes, this.zsets, this.sets, this.strings, this.geos]) {
      for (const key of store.keys()) if (re.test(key)) keys.add(key);
    }
    return { cursor: 0, keys: [...keys] };
  }

  // ---- Chaînes -----------------------------------------------------------
  async incr(key) {
    const next = (Number(this.strings.get(key)) || 0) + 1;
    this.strings.set(key, String(next));
    return next;
  }

  // `null` sur clé absente, comme le vrai client (les compteurs onion de
  // `security.onionCounters` s'en servent pour rendre 0 plutôt que NaN).
  async get(key) {
    const v = this.strings.get(key);
    return v === undefined ? null : String(v);
  }

  async expire(key, _seconds) {
    return this.__exists(key) ? 1 : 0;
  }

  async del(...keys) {
    const flat = keys.flat();
    let removed = 0;
    for (const key of flat) {
      if (this.__exists(key)) removed++;
      this.hashes.delete(key);
      this.zsets.delete(key);
      this.sets.delete(key);
      this.strings.delete(key);
      this.geos.delete(key);
    }
    return removed;
  }

  // ---- Hash --------------------------------------------------------------
  async hSet(key, fieldOrObj, value) {
    let h = this.hashes.get(key);
    if (!h) {
      h = new Map();
      this.hashes.set(key, h);
    }
    if (fieldOrObj !== null && typeof fieldOrObj === 'object') {
      for (const [f, v] of Object.entries(fieldOrObj)) h.set(f, String(v));
      return Object.keys(fieldOrObj).length;
    }
    h.set(String(fieldOrObj), String(value));
    return 1;
  }

  async hGet(key, field) {
    const h = this.hashes.get(key);
    const v = h ? h.get(field) : undefined;
    return v === undefined ? null : v;
  }

  async hmGet(key, fields) {
    const h = this.hashes.get(key);
    return fields.map((f) => {
      const v = h ? h.get(f) : undefined;
      return v === undefined ? null : v;
    });
  }

  async hGetAll(key) {
    const h = this.hashes.get(key);
    if (!h) return {};
    return Object.fromEntries(h.entries());
  }

  /**
   * Incrément atomique — c'est l'atomicité qui sert de coordination : deux clients
   * qui réclament une génération de clé au même instant obtiennent deux valeurs
   * distinctes, jamais la même (cf. `rooms.bumpKeyEpoch`).
   */
  async hIncrBy(key, field, by) {
    let h = this.hashes.get(key);
    if (!h) {
      h = new Map();
      this.hashes.set(key, h);
    }
    const next = Number(h.get(field) || 0) + Number(by);
    h.set(String(field), String(next));
    return next;
  }

  /** Pose le champ SEULEMENT s'il est absent. Renvoie true si posé (comme node-redis). */
  async hSetNX(key, field, value) {
    let h = this.hashes.get(key);
    if (!h) {
      h = new Map();
      this.hashes.set(key, h);
    }
    if (h.has(String(field))) return false;
    h.set(String(field), String(value));
    return true;
  }

  // ---- Sorted sets (et index GEO partagé) --------------------------------
  async zAdd(key, members) {
    let z = this.zsets.get(key);
    if (!z) {
      z = new Map();
      this.zsets.set(key, z);
    }
    const arr = Array.isArray(members) ? members : [members];
    let added = 0;
    for (const { score, value } of arr) {
      if (!z.has(value)) added++;
      z.set(value, Number(score));
    }
    return added;
  }

  async zRem(key, member) {
    let removed = 0;
    const z = this.zsets.get(key);
    if (z && z.delete(member)) removed++;
    // Un index GEO repose sur un zset : on retire aussi la position.
    const g = this.geos.get(key);
    if (g) g.delete(member);
    return removed;
  }

  async zScore(key, member) {
    const z = this.zsets.get(key);
    if (!z || !z.has(member)) return null;
    return z.get(member);
  }

  async zCard(key) {
    const z = this.zsets.get(key);
    if (z) return z.size;
    // Un index GEO est un zset côté Redis réel : ZCARD compte ses membres.
    const g = this.geos.get(key);
    return g ? g.size : 0;
  }

  async zRange(key, start, stop) {
    const z = this.zsets.get(key);
    if (!z) return [];
    // Tri par score croissant, départage lexicographique du membre (comme Redis).
    const ordered = [...z.entries()].sort(
      (a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
    );
    const members = ordered.map(([m]) => m);
    const end = stop === -1 ? members.length : stop + 1;
    return members.slice(start, end);
  }

  // ---- Sets --------------------------------------------------------------
  async sAdd(key, member) {
    let s = this.sets.get(key);
    if (!s) {
      s = new Set();
      this.sets.set(key, s);
    }
    const had = s.has(member);
    s.add(member);
    return had ? 0 : 1;
  }

  async sRem(key, member) {
    const s = this.sets.get(key);
    return s && s.delete(member) ? 1 : 0;
  }

  async sIsMember(key, member) {
    const s = this.sets.get(key);
    return s ? s.has(member) : false;
  }

  async sMembers(key) {
    const s = this.sets.get(key);
    return s ? [...s] : [];
  }

  // ---- GEO ---------------------------------------------------------------
  async geoAdd(key, { longitude, latitude, member }) {
    let g = this.geos.get(key);
    if (!g) {
      g = new Map();
      this.geos.set(key, g);
    }
    g.set(member, { lon: Number(longitude), lat: Number(latitude) });
    return 1;
  }

  /**
   * Mode FROMMEMBER + BYRADIUS uniquement (le seul usage du serveur).
   * `from` est la chaîne du membre de référence ; lève si elle est absente,
   * comme le vrai Redis (« could not decode requested zset member »).
   */
  async geoSearch(key, from, by) {
    const g = this.geos.get(key);
    const origin = g && g.get(from);
    if (!origin) {
      throw new Error('ERR could not decode requested zset member');
    }
    const unit = (by && by.unit) || 'm';
    const radius = Number(by && by.radius);
    const factor = unit === 'km' ? 1 : unit === 'm' ? 0.001 : 1;
    const radiusKm = radius * factor;
    const out = [];
    for (const [member, pos] of g.entries()) {
      if (haversineKm(origin.lat, origin.lon, pos.lat, pos.lon) <= radiusKm) {
        out.push(member);
      }
    }
    return out;
  }
}

function createFakeRedis() {
  return new FakeRedis();
}

module.exports = { createFakeRedis, FakeRedis, haversineKm };
