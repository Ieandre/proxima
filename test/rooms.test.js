'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { fake } = require('./helpers/inject-redis');
const rooms = require('../server/domain/rooms');
const sessions = require('../server/domain/sessions');

beforeEach(() => fake.__reset());

const makeSession = (id, pseudo) =>
  sessions.createSession(id, {
    pseudo,
    age: 25,
    city: 'Paris',
    region: '11',
    country: 'FR',
    countryLabel: 'France',
    lon: 2.3488,
    lat: 48.85341,
    pub: 'PUB_' + id,
  });

test('createRoom public : métadonnées, propriétaire membre, indexé public', async () => {
  const { id } = await rooms.createRoom({ name: 'Général', type: 'public', password: '', ownerId: 'owner' });
  const room = await rooms.getRoom(id);
  assert.equal(room.name, 'Général');
  assert.equal(room.type, 'public');
  assert.equal(room.owner, 'owner');
  assert.equal(room.hasPassword, false);

  assert.equal(await rooms.isMember(id, 'owner'), true);
  assert.equal(await rooms.memberCount(id), 1);
  assert.equal(await rooms.ownerOf(id), 'owner');

  const publics = await rooms.listPublic();
  assert.ok(publics.find((r) => r.id === id), 'le salon public doit apparaître dans le listing');
});

test('createRoom private avec mot de passe : pas indexé public, vérif mdp', async () => {
  const { id } = await rooms.createRoom({
    name: 'Privé',
    type: 'private',
    password: 'secret',
    ownerId: 'owner',
  });
  const room = await rooms.getRoom(id);
  assert.equal(room.type, 'private');
  assert.equal(room.hasPassword, true);

  assert.equal(await rooms.verifyPassword(id, 'secret'), true);
  assert.equal(await rooms.verifyPassword(id, 'mauvais'), false);

  const publics = await rooms.listPublic();
  assert.equal(publics.find((r) => r.id === id), undefined, 'un salon privé ne doit pas être listé');
});

/**
 * PORTE et CLÉ sont deux choses distinctes, et c'est ce qui rend la cohérence possible :
 * un salon privé sur invitation garde sa porte (jeton ou mot de passe vérifié par le
 * serveur) tout en chiffrant son contenu comme les autres. Le mot de passe n'y devient
 * PAS la clé — sans quoi il faudrait choisir entre garder la porte et chiffrer.
 */
test('régimes de clé : aucun salon ne circule en clair', async () => {
  const pub = await rooms.createRoom({ name: 'Public', type: 'public', ownerId: 'o1' });
  const invite = await rooms.createRoom({ name: 'Invitation', type: 'private', password: 'porte', ownerId: 'o2' });
  const mdp = await rooms.createRoom({
    name: 'Fermé', type: 'private', ownerId: 'o3', encrypted: true, verifier: 'v', salt: 'sel',
  });

  const [rPub, rInvite, rMdp] = await Promise.all([
    rooms.getRoom(pub.id), rooms.getRoom(invite.id), rooms.getRoom(mdp.id),
  ]);

  assert.equal(rPub.keyMode, 'group');
  assert.equal(rInvite.keyMode, 'group', 'le privé sur invitation chiffre lui aussi');
  assert.equal(rMdp.keyMode, 'password');
  for (const r of [rPub, rInvite, rMdp]) assert.equal(r.encrypted, true);

  // La porte du privé sur invitation est intacte : le mot de passe reste vérifié côté
  // serveur, et n'est pas devenu le matériau de la clé.
  assert.equal(rInvite.hasPassword, true);
  assert.equal(await rooms.verifyPassword(invite.id, 'porte'), true);
  assert.equal(await rooms.verifyPassword(invite.id, 'mauvais'), false);
  // Le régime mot de passe, lui, n'a AUCUN mot de passe côté serveur : juste un verifier.
  assert.equal(rMdp.hasPassword, false);

  // Les deux régimes de groupe partent à l'époque 1 (leur créateur engendre la clé) ;
  // une clé dérivée n'a pas de génération.
  assert.equal(rPub.keyEpoch, 1);
  assert.equal(rInvite.keyEpoch, 1);
  assert.equal(rMdp.keyEpoch, 0);

  // Visibilité inchangée : seul le privé sur INVITATION reste hors annuaire.
  const publics = await rooms.listPublic();
  assert.ok(publics.find((r) => r.id === pub.id));
  assert.ok(publics.find((r) => r.id === mdp.id), 'un salon à mot de passe est listé (nom + cadenas)');
  assert.equal(publics.find((r) => r.id === invite.id), undefined);
});

test('getRoom : un salon né avant le chiffrement généralisé est rattrapé', async () => {
  // Sans cette déduction, un salon PERMANENT (aucun TTL) resterait en clair à vie.
  await fake.hSet('room:ancien-clair', { name: 'Ancien', type: 'private', owner: 'o' });
  await fake.hSet('room:ancien-mdp', { name: 'Fermé', type: 'private', owner: 'o', encrypted: '1', verifier: 'v' });

  const clair = await rooms.getRoom('ancien-clair');
  assert.equal(clair.keyMode, 'group', 'passe en régime de groupe');
  assert.equal(clair.encrypted, true);

  const mdp = await rooms.getRoom('ancien-mdp');
  assert.equal(mdp.keyMode, 'password', 'portait déjà `encrypted` : c\'était un salon à mot de passe');
});

test('verifyInvite : seul le jeton émis est accepté', async () => {
  const { id, invite } = await rooms.createRoom({ name: 'Privé', type: 'private', ownerId: 'owner' });
  assert.equal(await rooms.verifyInvite(id, invite), true);
  assert.equal(await rooms.verifyInvite(id, 'faux-jeton'), false);
  assert.equal(await rooms.verifyInvite(id, ''), false);
  assert.equal(await rooms.verifyInvite(id, undefined), false);
});

test('membres : add / isMember / removeMember / memberCount', async () => {
  const { id } = await rooms.createRoom({ name: 'S', type: 'public', ownerId: 'owner' });
  assert.equal(await rooms.isMember(id, 'm2'), false);

  await rooms.addMember(id, 'm2');
  assert.equal(await rooms.isMember(id, 'm2'), true);
  assert.equal(await rooms.memberCount(id), 2);

  await rooms.removeMember(id, 'm2');
  assert.equal(await rooms.isMember(id, 'm2'), false);
  assert.equal(await rooms.memberCount(id), 1);
});

test('memberIds : ordonnés par ancienneté (base du transfert RG-06)', async () => {
  const { id } = await rooms.createRoom({ name: 'S', type: 'public', ownerId: 'owner' });
  await rooms.addMember(id, 'm2');
  await rooms.addMember(id, 'm3');
  assert.deepEqual(await rooms.memberIds(id), ['owner', 'm2', 'm3']);
});

test('setOwner : transfère la propriété', async () => {
  const { id } = await rooms.createRoom({ name: 'S', type: 'public', ownerId: 'owner' });
  await rooms.setOwner(id, 'm2');
  assert.equal(await rooms.ownerOf(id), 'm2');
});

test('setPassword : modifie puis efface le mot de passe', async () => {
  const { id } = await rooms.createRoom({ name: 'P', type: 'private', password: 'secret', ownerId: 'owner' });
  await rooms.setPassword(id, 'nouveau');
  assert.equal(await rooms.verifyPassword(id, 'nouveau'), true);
  assert.equal(await rooms.verifyPassword(id, 'secret'), false);

  // Effacer le mot de passe : tout accès passe alors (verifyPassword renvoie true).
  await rooms.setPassword(id, '');
  assert.equal(await rooms.verifyPassword(id, 'peu importe'), true);
});

test('memberProfiles : nettoie les membres fantômes (sans session)', async () => {
  const { id } = await rooms.createRoom({ name: 'S', type: 'public', ownerId: 'owner' });
  await makeSession('owner', 'Alice');
  await rooms.addMember(id, 'fantome'); // membre indexé mais sans session
  assert.equal(await rooms.memberCount(id), 2);

  const profils = await rooms.memberProfiles(id);
  assert.equal(profils.length, 1);
  assert.equal(profils[0].id, 'owner');
  assert.equal(profils[0].pseudo, 'Alice');
  // Le fantôme a été retiré du salon.
  assert.equal(await rooms.memberCount(id), 1);
});

test('deleteRoom : supprime le salon et le retire du listing', async () => {
  const { id } = await rooms.createRoom({ name: 'S', type: 'public', ownerId: 'owner' });
  await rooms.deleteRoom(id);
  assert.equal(await rooms.getRoom(id), null);
  const publics = await rooms.listPublic();
  assert.equal(publics.find((r) => r.id === id), undefined);
});

test('listPublic : tri par affluence et suppression des salons vides (RG-05)', async () => {
  const calme = await rooms.createRoom({ name: 'Calme', type: 'public', ownerId: 'owner1' });
  const anime = await rooms.createRoom({ name: 'Animé', type: 'public', ownerId: 'owner2' });
  await rooms.addMember(anime.id, 'visiteur'); // 2 membres vs 1

  const publics = await rooms.listPublic();
  assert.equal(publics[0].id, anime.id, 'le salon le plus peuplé doit être en tête');
  assert.equal(publics[0].count, 2);
  assert.equal(publics[1].id, calme.id);
  assert.equal(publics[1].count, 1);

  // Vider un salon : il doit disparaître au prochain listing (RG-05).
  await rooms.removeMember(calme.id, 'owner1');
  const apres = await rooms.listPublic();
  assert.equal(apres.find((r) => r.id === calme.id), undefined);
  assert.equal(await rooms.getRoom(calme.id), null, 'le salon vide doit être supprimé');
});

// ---- Salons permanents (design 2026-06-25) -------------------------------

test('createPersistentRoom : public, owner=system, flag persistent, vide, indexé', async () => {
  const { id } = await rooms.createPersistentRoom({ slug: 'general', name: 'Général' });
  assert.equal(id, 'general');
  const room = await rooms.getRoom('general');
  assert.equal(room.name, 'Général');
  assert.equal(room.type, 'public');
  assert.equal(room.owner, 'system');
  assert.equal(room.persistent, true);
  assert.equal(rooms.isPersistentRoom(room), true);
  // Aucun membre à la création : un permanent existe vide.
  assert.equal(await rooms.memberCount('general'), 0);

  const publics = await rooms.listPublic();
  assert.ok(publics.find((r) => r.id === 'general'), 'le salon permanent doit être listé');
});

test('listPublic : un salon permanent vide reste listé (exception à RG-05)', async () => {
  await rooms.createPersistentRoom({ slug: 'general', name: 'Général' });
  const publics = await rooms.listPublic();
  const perm = publics.find((r) => r.id === 'general');
  assert.ok(perm, 'le permanent vide doit subsister dans le listing');
  assert.equal(perm.count, 0);
  assert.equal(perm.persistent, true);
  // Le salon n'a PAS été supprimé malgré 0 membre.
  assert.notEqual(await rooms.getRoom('general'), null);
});

test('isPersistentRoom : faux pour un salon éphémère et pour null', async () => {
  const { id } = await rooms.createRoom({ name: 'Éphémère', type: 'public', ownerId: 'owner' });
  assert.equal(rooms.isPersistentRoom(await rooms.getRoom(id)), false);
  assert.equal(rooms.isPersistentRoom(null), false);
});

test('setName : renomme un salon permanent', async () => {
  await rooms.createPersistentRoom({ slug: 'general', name: 'Général' });
  await rooms.setName('general', 'Salon Général');
  assert.equal((await rooms.getRoom('general')).name, 'Salon Général');
});

// ---- Salons privés chiffrés à mot de passe (design 2026-06-25) ------------

test('createRoom chiffré : flag/sel exposés, verifier jamais exposé, pas de pass, type privé', async () => {
  const { id } = await rooms.createRoom({
    name: 'Secret',
    type: 'private',
    encrypted: true,
    verifier: 'VERIF_token_abc',
    salt: 'SEL16OCTETS_b64url',
    ownerId: 'owner',
  });
  const room = await rooms.getRoom(id);
  assert.equal(room.encrypted, true, 'le flag encrypted doit être exposé');
  assert.equal(room.salt, 'SEL16OCTETS_b64url', 'le sel public (fourni par le client) doit être exposé tel quel');
  assert.equal(room.type, 'private', 'un salon chiffré est toujours privé');
  assert.equal(room.hasPassword, false, 'pas de hash SHA-256 pour un salon chiffré');
  assert.equal(room.verifier, undefined, 'le verifier ne doit JAMAIS être exposé par getRoom');
});

test('verifyVerifier : accepte le bon verifier, rejette le mauvais, faux si non chiffré', async () => {
  const { id } = await rooms.createRoom({
    name: 'Secret',
    type: 'private',
    encrypted: true,
    verifier: 'VERIF_token_abc',
    salt: 'SEL16OCTETS_b64url',
    ownerId: 'owner',
  });
  assert.equal(await rooms.verifyVerifier(id, 'VERIF_token_abc'), true);
  assert.equal(await rooms.verifyVerifier(id, 'mauvais'), false);
  assert.equal(await rooms.verifyVerifier(id, ''), false);

  // Sur un salon non chiffré, la voie verifier ne s'applique pas.
  const pub = await rooms.createRoom({ name: 'Public', type: 'public', ownerId: 'owner' });
  assert.equal(await rooms.verifyVerifier(pub.id, 'VERIF_token_abc'), false);
});

test('listPublic : un salon chiffré est listé avec son sel public, jamais son verifier', async () => {
  const { id } = await rooms.createRoom({
    name: 'Secret',
    type: 'private',
    encrypted: true,
    verifier: 'VERIF_token_abc',
    salt: 'SEL16OCTETS_b64url',
    ownerId: 'owner',
  });
  const publics = await rooms.listPublic();
  const entry = publics.find((r) => r.id === id);
  assert.ok(entry, 'le salon chiffré doit apparaître dans le listing (annuaire verrouillé)');
  assert.equal(entry.encrypted, true);
  assert.equal(entry.salt, 'SEL16OCTETS_b64url', 'le sel public doit être dans le listing (dérivation directe)');
  assert.equal(entry.verifier, undefined, 'le verifier ne doit JAMAIS figurer dans le listing');
});

test('listPublic : un salon privé NON chiffré (sur invitation) reste hors listing', async () => {
  const { id } = await rooms.createRoom({ name: 'Privé', type: 'private', password: 'secret', ownerId: 'owner' });
  const publics = await rooms.listPublic();
  assert.equal(publics.find((r) => r.id === id), undefined);
});

// ---------------------------------------------------------------------------
// Salon de région (design 2026-07-23) — permanent créé à la volée
// ---------------------------------------------------------------------------
test('regionRoomId : slug déterministe préfixé par le pays', () => {
  assert.equal(rooms.regionRoomId('FR', '11'), 'rgn-fr-11');
  assert.equal(rooms.regionRoomId('CH', 'GE'), 'rgn-ch-ge');
  // Même code de région, pays différents => salons distincts.
  assert.notEqual(rooms.regionRoomId('CH', 'GR'), rooms.regionRoomId('LU', 'GR'));
  // Slug borné bien en deçà de la limite de 32.
  assert.ok(rooms.regionRoomId('FR', '11').length <= 32);
});

test('ensureRegionRoom : crée un salon permanent public, membre-libre', async () => {
  const slug = await rooms.ensureRegionRoom({ country: 'FR', code: '11', name: 'Île-de-France' });
  assert.equal(slug, 'rgn-fr-11');
  const room = await rooms.getRoom(slug);
  assert.ok(room, 'le salon de région doit exister');
  assert.equal(room.name, 'Île-de-France');
  assert.equal(room.type, 'public');
  assert.equal(room.owner, 'system');
  assert.equal(room.persistent, true);
  assert.equal(await rooms.memberCount(slug), 0, 'un salon de région naît vide');
  // Hors annuaire public : un salon de région n'apparaît JAMAIS dans listPublic
  // (chacun ne voit que le sien, reçu à l'identify) — mais il existe et n'est pas purgé.
  const publics = await rooms.listPublic();
  assert.equal(publics.find((r) => r.id === slug), undefined, 'un salon de région ne doit pas être listé');
  assert.ok(await rooms.getRoom(slug), 'le salon de région doit continuer d\'exister malgré son absence du listing');
});

test('ensureRegionRoom : idempotent, ne réécrit pas un renommage à chaud', async () => {
  const slug = await rooms.ensureRegionRoom({ country: 'FR', code: '11', name: 'Île-de-France' });
  await rooms.setName(slug, 'Renommé à chaud');
  const again = await rooms.ensureRegionRoom({ country: 'FR', code: '11', name: 'Île-de-France' });
  assert.equal(again, slug);
  const room = await rooms.getRoom(slug);
  assert.equal(room.name, 'Renommé à chaud', 'ensureRegionRoom ne doit pas réécrire un salon existant');
});

test('ensureRegionRoom : renvoie null sans code ni nom (pas de rattachement)', async () => {
  assert.equal(await rooms.ensureRegionRoom({ country: 'FR', code: '', name: 'x' }), null);
  assert.equal(await rooms.ensureRegionRoom({ country: 'FR', code: '11', name: null }), null);
});

test('isRegionRoomId : reconnaît les salons de région, rejette les autres', () => {
  assert.equal(rooms.isRegionRoomId('rgn-fr-11'), true);
  assert.equal(rooms.isRegionRoomId(rooms.regionRoomId('CH', 'GE')), true);
  assert.equal(rooms.isRegionRoomId('general'), false);
  assert.equal(rooms.isRegionRoomId(''), false);
  assert.equal(rooms.isRegionRoomId(null), false);
});

test('listAll : voit les salons hors annuaire, et ne les modifie pas', async () => {
  const { id: pub } = await rooms.createRoom({ name: 'Kiosque', type: 'public', password: '', ownerId: 'a' });
  const { id: priv } = await rooms.createRoom({ name: 'Entre nous', type: 'private', password: 'porte', ownerId: 'b' });
  const region = await rooms.ensureRegionRoom({ country: 'FR', code: '11', name: 'Île-de-France' });
  // Salon vide et non permanent : `listPublic` le supprimerait (RG-05), `listAll` non.
  const { id: vide } = await rooms.createRoom({ name: 'Désert', type: 'public', password: '', ownerId: 'c' });
  await rooms.removeMember(vide, 'c');

  const all = await rooms.listAll();
  const byId = new Map(all.map((r) => [r.id, r]));

  assert.ok(byId.has(pub));
  assert.ok(byId.has(priv), 'un privé sur invitation est absent de rooms:pub mais visible ici');
  assert.equal(byId.get(priv).hasPassword, true);
  assert.equal(byId.get(region).region, true);
  assert.equal(byId.get(region).persistent, true);
  assert.equal(byId.get(vide).count, 0);
  assert.ok(await rooms.getRoom(vide), 'listAll est en lecture seule : aucune purge RG-05');
  // Les clés de membres partagent le préfixe `room:` sans être des salons.
  assert.equal(all.filter((r) => r.id.includes(':')).length, 0);
});

test('purgeAll : efface salons, membres et index public, et les dénombre', async () => {
  const { id: a } = await rooms.createRoom({ name: 'Un', type: 'public', password: '', ownerId: 'x' });
  await rooms.createRoom({ name: 'Deux', type: 'private', password: '', ownerId: 'y' });
  await rooms.createPersistentRoom({ slug: 'general', name: 'Général' });

  assert.equal(await rooms.purgeAll(), 3, 'les permanents partent avec les autres');
  assert.equal(await rooms.getRoom(a), null);
  assert.equal(await rooms.getRoom('general'), null);
  assert.equal(await rooms.memberCount(a), 0);
  assert.deepEqual(await rooms.listPublic(), []);
  assert.deepEqual(await rooms.listAll(), []);
});
