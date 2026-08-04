import { beforeAll, describe, expect, it } from 'vitest';
import sodium from 'libsodium-wrappers-sumo';
import {
  decryptBytes,
  decryptFrom,
  decryptRoom,
  decryptRoomBytes,
  deriveRoomMaterial,
  encryptBytesFor,
  encryptFor,
  encryptRoom,
  encryptRoomBytes,
  exportPublicKey,
  fingerprint,
  genGroupKey,
  genRoomSalt,
  initCrypto,
  safetyNumber,
  unwrapGroupKey,
  wrapGroupKey,
  type Envelope,
} from '../src/lib/crypto';

// libsodium doit être prêt avant toute opération (peuple les constantes/fonctions).
beforeAll(async () => {
  await sodium.ready;
  await initCrypto(); // génère la paire de clés de session « locale »
});

// Simule un pair distinct (autre navigateur) avec sa propre paire de clés.
function makePeer() {
  const kp = sodium.crypto_box_keypair();
  const B64 = sodium.base64_variants.URLSAFE_NO_PADDING;
  return {
    pub: sodium.to_base64(kp.publicKey, B64),
    priv: kp.privateKey,
    publicKey: kp.publicKey,
  };
}

describe('crypto MP (crypto_box X25519)', () => {
  it('exporte une clé publique base64 url-safe stable', () => {
    const a = exportPublicKey();
    const b = exportPublicKey();
    expect(a).toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('chiffre pour un pair puis déchiffre le même clair (aller-retour)', () => {
    const peer = makePeer();
    const plaintext = 'Message secret de proximité — accents inclus : éàü';
    const env = encryptFor(peer.pub, plaintext);

    // Le pair déchiffre avec SA clé privée et la clé publique embarquée dans l'enveloppe.
    const B64 = sodium.base64_variants.URLSAFE_NO_PADDING;
    const opened = sodium.crypto_box_open_easy(
      sodium.from_base64(env.c, B64),
      sodium.from_base64(env.n, B64),
      sodium.from_base64(env.pub, B64),
      peer.priv,
    );
    expect(sodium.to_string(sodium.unpad(opened, 256))).toBe(plaintext);
  });

  it('le bourrage masque la longueur : deux messages courts distincts ont un ciphertext de même taille', () => {
    const peer = makePeer();
    const e1 = encryptFor(peer.pub, 'a');
    const e2 = encryptFor(peer.pub, 'bonjour tout le monde');
    const len = (b64: string) => sodium.from_base64(b64, sodium.base64_variants.URLSAFE_NO_PADDING).length;
    expect(len(e1.c)).toBe(len(e2.c)); // < 256 octets -> même bloc rembourré
  });

  it('une enveloppe altérée (MAC invalide) fait échouer le déchiffrement', () => {
    const peer = makePeer();
    const env = encryptFor(peer.pub, 'intègre');
    const tampered: Envelope = { ...env, c: env.c.slice(0, -2) + (env.c.endsWith('A') ? 'B' : 'A') };
    expect(() => decryptFrom(tampered)).toThrow();
  });

  it('aller-retour binaire (pièce jointe) chiffré/déchiffré', () => {
    const peer = makePeer();
    const bytes = new Uint8Array([1, 2, 3, 250, 128, 0, 42]);
    const { nonce, cipher } = encryptBytesFor(peer.pub, bytes);
    // On déchiffre côté « nous » avec la clé publique du pair.
    const out = decryptBytes(nonce, peer.pub, cipher);
    expect(Array.from(out)).toEqual(Array.from(bytes));
  });

  it('fingerprint : 4 octets hex groupés, stable pour une session', () => {
    const f = fingerprint();
    expect(f).toMatch(/^[0-9A-F]{2}( [0-9A-F]{2}){3}$/);
  });

  it('safetyNumber : identique quel que soit l\'ordre des deux clés (canonique)', () => {
    const peer = makePeer();
    const mine = safetyNumber(peer.pub);
    // Recalcul « côté pair » : hash des deux clés dans le même ordre canonique.
    const B64 = sodium.base64_variants.URLSAFE_NO_PADDING;
    const a = sodium.from_base64(exportPublicKey(), B64);
    const b = peer.publicKey;
    const cmp = (x: Uint8Array, y: Uint8Array) => {
      const n = Math.min(x.length, y.length);
      for (let i = 0; i < n; i++) if (x[i] !== y[i]) return x[i] - y[i];
      return x.length - y.length;
    };
    const [lo, hi] = cmp(a, b) <= 0 ? [a, b] : [b, a];
    const cat = new Uint8Array(lo.length + hi.length);
    cat.set(lo, 0);
    cat.set(hi, lo.length);
    const expected = sodium
      .to_hex(sodium.crypto_generichash(16, cat, null))
      .toUpperCase()
      .replace(/(.{4})(?=.)/g, '$1 ');
    expect(mine).toBe(expected);
  });
});

describe('crypto salons chiffrés (Argon2id + crypto_secretbox)', () => {
  it('genRoomSalt produit un sel base64 url-safe de 16 octets', () => {
    const salt = genRoomSalt();
    expect(sodium.from_base64(salt, sodium.base64_variants.URLSAFE_NO_PADDING).length).toBe(16);
  });

  it('deriveRoomMaterial : déterministe pour (mot de passe, sel) donné', async () => {
    const salt = genRoomSalt();
    const m1 = await deriveRoomMaterial('motdepasse-secret', salt);
    const m2 = await deriveRoomMaterial('motdepasse-secret', salt);
    expect(m1.verifier).toBe(m2.verifier);
    expect(Array.from(m1.key)).toEqual(Array.from(m2.key));
  });

  it('un mot de passe erroné produit un verifier ET une clé différents', async () => {
    const salt = genRoomSalt();
    const good = await deriveRoomMaterial('bon-mot-de-passe', salt);
    const bad = await deriveRoomMaterial('mauvais-mot-de-passe', salt);
    expect(bad.verifier).not.toBe(good.verifier);
    expect(Array.from(bad.key)).not.toEqual(Array.from(good.key));
  });

  it('verifier et clé sont dérivés séparément (le verifier ne révèle pas la clé)', async () => {
    const salt = genRoomSalt();
    const { verifier, key } = await deriveRoomMaterial('pw', salt);
    const verifierBytes = sodium.from_base64(verifier, sodium.base64_variants.URLSAFE_NO_PADDING);
    // Domaines KDF distincts -> aucune égalité entre la preuve d'accès et la clé.
    expect(Array.from(verifierBytes)).not.toEqual(Array.from(key));
  });

  it('aller-retour texte de salon avec la clé symétrique', async () => {
    const { key } = await deriveRoomMaterial('pw', genRoomSalt());
    const env = encryptRoom(key, 'salut le salon');
    expect(decryptRoom(key, env)).toBe('salut le salon');
  });

  it('une mauvaise clé de salon fait échouer le déchiffrement', async () => {
    const salt = genRoomSalt();
    const { key } = await deriveRoomMaterial('pw', salt);
    const other = await deriveRoomMaterial('autre-pw', salt);
    const env = encryptRoom(key, 'contenu');
    expect(() => decryptRoom(other.key, env)).toThrow();
  });

  it('aller-retour binaire de salon (média)', async () => {
    const { key } = await deriveRoomMaterial('pw', genRoomSalt());
    const bytes = new Uint8Array([9, 8, 7, 255, 0, 1]);
    const { nonce, cipher } = encryptRoomBytes(key, bytes);
    expect(Array.from(decryptRoomBytes(key, nonce, cipher))).toEqual(Array.from(bytes));
  });
});

describe('clé de groupe des salons publics', () => {
  it('engendre une clé secretbox de la bonne taille, jamais deux fois la même', () => {
    const a = genGroupKey();
    const b = genGroupKey();
    expect(a.length).toBe(sodium.crypto_secretbox_KEYBYTES);
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it('aller-retour : la clé enveloppée pour un membre est rendue à l’identique', () => {
    // Enveloppée pour NOTRE propre clé publique : `unwrapGroupKey` déchiffre avec la clé
    // privée de session, exactement comme le ferait le membre destinataire.
    const key = genGroupKey();
    const env = wrapGroupKey(exportPublicKey(), key);
    expect(Array.from(unwrapGroupKey(env))).toEqual(Array.from(key));
  });

  it('l’enveloppe ne contient la clé en clair sous aucune forme', () => {
    const key = genGroupKey();
    const env = wrapGroupKey(exportPublicKey(), key);
    const B64 = sodium.base64_variants.URLSAFE_NO_PADDING;
    expect(env.c).not.toContain(sodium.to_base64(key, B64));
  });

  it('une enveloppe scellée pour QUELQU’UN D’AUTRE est rejetée', () => {
    const peer = makePeer();
    const env = wrapGroupKey(peer.pub, genGroupKey());
    // `env.pub` est notre clé publique ; seul `peer` détient la privée qui l'ouvre.
    expect(() => unwrapGroupKey(env)).toThrow();
  });

  it('une enveloppe altérée est rejetée (MAC invalide)', () => {
    const env = wrapGroupKey(exportPublicKey(), genGroupKey());
    const broken: Envelope = { ...env, c: env.c.slice(0, -2) + (env.c.endsWith('A') ? 'BB' : 'AA') };
    expect(() => unwrapGroupKey(broken)).toThrow();
  });

  it('une enveloppe valide qui ne contient PAS une clé de la bonne taille est rejetée', () => {
    // Sans cette vérification, tout le fil deviendrait silencieusement illisible.
    const env = wrapGroupKey(exportPublicKey(), new Uint8Array(8));
    expect(() => unwrapGroupKey(env)).toThrow(/taille/);
  });

  it('la clé de groupe chiffre le fil comme n’importe quelle clé de salon', () => {
    // `encryptRoom`/`decryptRoom` ignorent l'origine de la clé : c'est ce qui permet au
    // régime de groupe de réutiliser tout le transport du régime mot de passe.
    const key = genGroupKey();
    const text = 'salon public chiffré — accents : éàü';
    expect(decryptRoom(key, encryptRoom(key, text))).toBe(text);
  });

  it('deux générations de clé ne se lisent pas l’une l’autre', () => {
    const first = genGroupKey();
    const second = genGroupKey();
    const env = encryptRoom(first, 'ancienne génération');
    expect(() => decryptRoom(second, env)).toThrow();
  });
});
