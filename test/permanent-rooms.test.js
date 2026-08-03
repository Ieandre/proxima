'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { fake } = require('./helpers/inject-redis');
const rooms = require('../server/domain/rooms');
const permanentRooms = require('../server/domain/permanent-rooms');

beforeEach(() => fake.__reset());

// Écrit un fichier de seed temporaire et renvoie son chemin (nettoyé par chaque test).
let seedCounter = 0;
function writeSeed(content) {
  const file = path.join(os.tmpdir(), `perm-rooms-test-${process.pid}-${seedCounter++}.json`);
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content), 'utf8');
  return file;
}

test('loadSeed : filtre les entrées invalides (slug hors charte, nom vide, doublon)', () => {
  const file = writeSeed([
    { slug: 'general', name: 'Général' },
    { slug: 'MAUVAIS SLUG', name: 'Espaces interdits' },
    { slug: 'sansnom', name: '   ' },
    { slug: 'general', name: 'Doublon' },
    { slug: 'aide', name: 'Aide' },
  ]);
  try {
    assert.deepEqual(permanentRooms.loadSeed(file), [
      { slug: 'general', name: 'Général' },
      { slug: 'aide', name: 'Aide' },
    ]);
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test('loadSeed : fichier absent -> tableau vide, sans erreur', () => {
  const defs = permanentRooms.loadSeed(path.join(os.tmpdir(), 'inexistant-perm-rooms-xyz.json'));
  assert.deepEqual(defs, []);
});

test('seedAtBoot : crée les salons absents puis est idempotent', async () => {
  const file = writeSeed([
    { slug: 'general', name: 'Général' },
    { slug: 'aide', name: 'Aide' },
  ]);
  try {
    const r1 = await permanentRooms.seedAtBoot(file);
    assert.equal(r1.total, 2);
    assert.equal(r1.created, 2);
    assert.equal((await rooms.getRoom('general')).persistent, true);

    // 2e passage : tout existe déjà, rien à recréer.
    const r2 = await permanentRooms.seedAtBoot(file);
    assert.equal(r2.created, 0);
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test('seedAtBoot : ne réécrit pas un salon modifié à chaud (seed-only, l\'admin gagne)', async () => {
  const file = writeSeed([{ slug: 'general', name: 'Général' }]);
  try {
    await permanentRooms.seedAtBoot(file);
    await rooms.setName('general', 'Renommé par admin'); // édition à chaud
    const r = await permanentRooms.seedAtBoot(file);
    assert.equal(r.created, 0, 'aucun salon recréé');
    assert.equal((await rooms.getRoom('general')).name, 'Renommé par admin', 'le nom modifié est préservé');
  } finally {
    fs.rmSync(file, { force: true });
  }
});
