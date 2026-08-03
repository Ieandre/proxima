'use strict';

const crypto = require('crypto');

/**
 * Primitives de protocole Socket.IO, partagées par les deux transports : les
 * handlers du namespace public (`handlers/`) et la console opérateur (`admin.js`).
 *
 * Source unique délibérée : tout ce qui touche à la troncature d'une entrée non
 * fiable ne doit se corriger qu'à un seul endroit.
 */

/**
 * Tronque une valeur venue du client. Toute entrée est traitée comme une chaîne
 * (`null`/`undefined` → ''), puis coupée à `max` — première barrière contre un
 * payload démesuré, appliquée AVANT toute autre validation.
 */
const clamp = (s, max) => String(s == null ? '' : s).slice(0, max);

/**
 * Répond à un accusé de réception. Le callback est OPTIONNEL côté client : un
 * émetteur qui n'attend pas de réponse n'en fournit pas, et l'appeler serait un
 * `TypeError` au milieu d'un handler.
 */
const ack = (cb, payload) => {
  if (typeof cb === 'function') cb(payload);
};

/**
 * Identifiant opaque, non devinable et sans structure lisible : 9 octets
 * aléatoires en base64url (12 caractères). Sert aux sessions, aux messages, aux
 * salons et aux signalements — tout ce qui doit être désigné sans rien révéler.
 * `bytes` permet d'élargir (invitation de salon : 16 octets).
 */
const genId = (bytes = 9) => crypto.randomBytes(bytes).toString('base64url');

module.exports = { clamp, ack, genId };
