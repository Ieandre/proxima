'use strict';

const fs = require('fs');
const config = require('../config');
const rooms = require('./rooms');

/**
 * Salons permanents. Source de vérité HYBRIDE :
 *  - un fichier JSON versionné (`config.permanentRoomsFile`) est la **liste de
 *    référence** des salons officiels ;
 *  - au boot, on réconcilie en mode **seed-only** : on crée les salons absents,
 *    on ne réécrit ni ne supprime jamais un salon existant (l'édition à chaud
 *    via la console `/admin` prime).
 *
 * Retirer une entrée du JSON est inerte à chaud ; pour qu'un salon disparaisse
 * durablement, il faut l'ôter du JSON (un `admin:room:remove` sur un salon
 * encore listé est transitoire : il est recréé au prochain reboot).
 */

/** Charte de slug : minuscules, chiffres, tirets ; 1 à 32 caractères. */
const SLUG_RE = /^[a-z0-9-]{1,32}$/;

/**
 * Lit et valide la liste de référence. Tolérant à l'absence du fichier (renvoie
 * `[]`, comme un déploiement sans `OPERATOR_SECRET`). Les entrées invalides
 * (slug hors charte, nom vide, doublon) sont ignorées avec un avertissement.
 */
function loadSeed(file = config.permanentRoomsFile) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn(`[permanent-rooms] fichier ${file} absent — aucun salon permanent à semer.`);
      return [];
    }
    throw err;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`[permanent-rooms] JSON invalide dans ${file} : ${err.message}`);
    return [];
  }
  if (!Array.isArray(parsed)) {
    console.error(`[permanent-rooms] ${file} doit contenir un tableau.`);
    return [];
  }

  const seen = new Set();
  const valid = [];
  for (const entry of parsed) {
    const slug = entry && typeof entry.slug === 'string' ? entry.slug.trim().toLowerCase() : '';
    const name = entry && typeof entry.name === 'string' ? entry.name.trim() : '';
    if (!SLUG_RE.test(slug)) {
      console.warn(`[permanent-rooms] entrée ignorée (slug invalide) : ${JSON.stringify(entry)}`);
      continue;
    }
    if (!name) {
      console.warn(`[permanent-rooms] entrée ignorée (nom vide) pour le slug « ${slug} ».`);
      continue;
    }
    if (seen.has(slug)) {
      console.warn(`[permanent-rooms] entrée ignorée (slug dupliqué) : « ${slug} ».`);
      continue;
    }
    seen.add(slug);
    valid.push({ slug, name });
  }
  return valid;
}

/**
 * Réconciliation au boot (seed-only). Idempotent et sûr en multi-instance :
 * `getRoom` + `createPersistentRoom` convergent. Ne réécrit ni ne supprime rien.
 */
async function seedAtBoot(file = config.permanentRoomsFile) {
  const defs = loadSeed(file);
  let created = 0;
  for (const { slug, name } of defs) {
    if (await rooms.getRoom(slug)) continue; // existe déjà -> l'admin gagne, on ne touche à rien
    await rooms.createPersistentRoom({ slug, name });
    created++;
  }
  if (defs.length) {
    console.log(
      `[permanent-rooms] ${created} salon(s) permanent(s) créé(s), ${defs.length - created} déjà présent(s).`,
    );
  }
  return { total: defs.length, created };
}

module.exports = { loadSeed, seedAtBoot, SLUG_RE };
