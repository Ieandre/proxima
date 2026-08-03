// Import par défaut requis : libsodium peuple cet objet APRÈS `await sodium.ready`
// (un `import * as` figerait un namespace aux fonctions encore indéfinies).
// Variante `-sumo` (surensemble de `libsodium-wrappers`) : nécessaire pour Argon2id
// (crypto_pwhash) utilisé par le chiffrement des salons à mot de passe — absent de la
// variante standard. Les MP (crypto_box) restent identiques.
import sodium from 'libsodium-wrappers-sumo';

/**
 * Chiffrement de bout en bout des messages privés (§4.4, RG-07) — via libsodium.
 *
 * - Paire de clés X25519 générée à chaque session, côté client (crypto_box_keypair).
 *   La clé privée ne quitte jamais le navigateur.
 * - Chiffrement authentifié `crypto_box` (X25519 + XSalsa20-Poly1305) : le MAC
 *   garantit l'intégrité et l'origine du message pour le couple émetteur/destinataire.
 * - Le serveur ne relaie qu'une enveloppe opaque { n, c, pub } : il lui est
 *   cryptographiquement impossible de lire ou de forger le contenu.
 * - Bourrage (padding) à taille fixe : le clair est arrondi à un multiple de
 *   PAD_BLOCK octets avant chiffrement, de sorte que la taille du ciphertext ne
 *   révèle pas la longueur réelle du message (protection contre l'analyse de trafic).
 */

export type Envelope = { n: string; c: string; pub: string };

type SessionKeys = { publicKey: Uint8Array; privateKey: Uint8Array; keyType: string };

const B64 = () => sodium.base64_variants.URLSAFE_NO_PADDING;

// Toutes les longueurs de message sont arrondies à un multiple de 256 octets.
// La grande majorité des messages (< 256 octets) deviennent ainsi indistinguables.
const PAD_BLOCK = 256;

let ready = false;
let keyPair: SessionKeys | null = null;

/** Génère la paire de clés de session. À appeler une fois, avant tout chiffrement. */
export async function initCrypto(): Promise<void> {
  await sodium.ready;
  ready = true;
  keyPair = sodium.crypto_box_keypair();
}

function kp(): SessionKeys {
  if (!ready || !keyPair) throw new Error('crypto non initialisé');
  return keyPair;
}

/** Clé publique de session, encodée base64 url-safe (transmise lors de l'identification). */
export function exportPublicKey(): string {
  return sodium.to_base64(kp().publicKey, B64());
}

/** Chiffre un message texte à destination d'un pair (identifié par sa clé publique). */
export function encryptFor(peerPubB64: string, plaintext: string): Envelope {
  const peerPub = sodium.from_base64(peerPubB64, B64());
  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
  // Bourrage à taille fixe AVANT chiffrement -> la taille du ciphertext ne fuit plus.
  const padded = sodium.pad(sodium.from_string(plaintext), PAD_BLOCK);
  const ct = sodium.crypto_box_easy(padded, nonce, peerPub, kp().privateKey);
  return { n: sodium.to_base64(nonce, B64()), c: sodium.to_base64(ct, B64()), pub: exportPublicKey() };
}

/** Déchiffre une enveloppe reçue d'un pair (lève une erreur si le MAC est invalide). */
export function decryptFrom(env: Envelope): string {
  const peerPub = sodium.from_base64(env.pub, B64());
  const padded = sodium.crypto_box_open_easy(
    sodium.from_base64(env.c, B64()),
    sodium.from_base64(env.n, B64()),
    peerPub,
    kp().privateKey,
  );
  return sodium.to_string(sodium.unpad(padded, PAD_BLOCK));
}

/**
 * Variante binaire pour les pièces jointes (photos/vidéos) en MP.
 * Le clair n'est pas rembourré : la taille d'un média est de toute façon variable,
 * un padding par bloc ne la masquerait pas utilement.
 */
export function encryptBytesFor(peerPubB64: string, bytes: Uint8Array): { nonce: string; cipher: Uint8Array } {
  const peerPub = sodium.from_base64(peerPubB64, B64());
  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
  const cipher = sodium.crypto_box_easy(bytes, nonce, peerPub, kp().privateKey);
  return { nonce: sodium.to_base64(nonce, B64()), cipher };
}

export function decryptBytes(nonceB64: string, peerPubB64: string, cipher: Uint8Array): Uint8Array {
  const peerPub = sodium.from_base64(peerPubB64, B64());
  return sodium.crypto_box_open_easy(cipher, sodium.from_base64(nonceB64, B64()), peerPub, kp().privateKey);
}

/** Empreinte courte de notre clé publique de session (affichée dans la carte d'identité). */
export function fingerprint(): string {
  const hex = sodium.to_hex(sodium.crypto_generichash(16, kp().publicKey, null)).toUpperCase();
  return hex.slice(0, 8).replace(/(.{2})(?=.)/g, '$1 '); // « 5F 9E 41 BB »
}

function cmp(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

/**
 * Empreinte de sécurité d'une conversation (« safety number ») : hash des deux
 * clés publiques dans un ordre canonique, donc identique des deux côtés.
 * Si un relais malveillant substitue une clé (MITM), les deux empreintes diffèrent
 * — d'où l'intérêt de la comparer hors-bande.
 */
export function safetyNumber(peerPubB64: string): string {
  const mine = kp().publicKey;
  const theirs = sodium.from_base64(peerPubB64, B64());
  const [a, b] = cmp(mine, theirs) <= 0 ? [mine, theirs] : [theirs, mine];
  const cat = new Uint8Array(a.length + b.length);
  cat.set(a, 0);
  cat.set(b, a.length);
  const hex = sodium.to_hex(sodium.crypto_generichash(16, cat, null)).toUpperCase();
  return hex.replace(/(.{4})(?=.)/g, '$1 '); // 8 groupes de 4 hex
}

/**
 * Chiffrement de bout en bout des salons PRIVÉS PROTÉGÉS PAR MOT DE PASSE
 * (RG-07 étendu aux salons à mot de passe). Conception « dérivation directe » :
 *
 *     master   = Argon2id(motDePasse, salt 16 o public)         (crypto_pwhash)
 *     verifier = KDF(master, ctx "VRFYAUTH", subkey 1)  -> preuve d'accès, transmise au serveur
 *     key      = KDF(master, ctx "ROOMKEYS", subkey 2)  -> clé crypto_secretbox, jamais transmise
 *
 * - Le `verifier` prouve la connaissance du mot de passe SANS permettre de déchiffrer
 *   (séparé de `key` par deux dérivations KDF à contextes distincts). Le serveur ne voit
 *   jamais le mot de passe, ni `master`, ni `key` : il ne stocke que `verifier` et relaie
 *   des enveloppes opaques { n, c } (comme pour les MP).
 * - Chiffrement symétrique authentifié `crypto_secretbox` (XSalsa20-Poly1305). À la
 *   différence des MP (crypto_box asymétrique), il n'y a PAS d'authentification de l'auteur :
 *   la clé partagée garantit la confidentialité de groupe, pas l'attribution d'un message.
 * - Paramètres Argon2id et contextes KDF FIGÉS À VIE : tout changement rendrait les salons
 *   existants illisibles (clé divergente) et les `verifier` rejetés au join.
 */

export type RoomEnvelope = { n: string; c: string };

// Paramètres de dérivation FIGÉS. Les contextes KDF font crypto_kdf_CONTEXTBYTES (8 octets)
// EXACTEMENT ; le master fait crypto_kdf_KEYBYTES (32 octets). Les presets Argon2id
// (OPS/MEM/ALG) sont lus dans deriveRoomMaterial car les constantes sodium ne sont peuplées
// qu'après `await sodium.ready` (cf. en-tête de fichier) — ils restent figés (INTERACTIVE + ARGON2ID13).
export const ROOM_KDF = Object.freeze({
  CTX_VERIFIER: 'VRFYAUTH', // 8 octets — sous-clé « preuve d'accès »
  CTX_KEY: 'ROOMKEYS', // 8 octets — sous-clé « clé de chiffrement »
  SUBKEY_VERIFIER: 1,
  SUBKEY_KEY: 2,
});

/** Génère un sel Argon2id public de 16 octets (crypto_pwhash_SALTBYTES), encodé base64 url-safe. */
export function genRoomSalt(): string {
  return sodium.to_base64(sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES), B64());
}

/**
 * Dérive le matériel cryptographique d'un salon à partir du mot de passe et du sel public.
 * Renvoie le `verifier` (base64 url-safe, transmis au serveur) et la `key` secretbox
 * (octets bruts, conservée uniquement en RAM, jamais sérialisée ni transmise).
 * Opération volontairement coûteuse (Argon2id INTERACTIVE) : à n'appeler qu'au join/à la création.
 */
export async function deriveRoomMaterial(
  password: string,
  saltB64: string,
): Promise<{ verifier: string; key: Uint8Array }> {
  await sodium.ready;
  const salt = sodium.from_base64(saltB64, B64());
  const master = sodium.crypto_pwhash(
    sodium.crypto_kdf_KEYBYTES, // 32 octets
    password,
    salt,
    sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  );
  const verifierBytes = sodium.crypto_kdf_derive_from_key(
    32,
    ROOM_KDF.SUBKEY_VERIFIER,
    ROOM_KDF.CTX_VERIFIER,
    master,
  );
  const key = sodium.crypto_kdf_derive_from_key(
    sodium.crypto_secretbox_KEYBYTES,
    ROOM_KDF.SUBKEY_KEY,
    ROOM_KDF.CTX_KEY,
    master,
  );
  return { verifier: sodium.to_base64(verifierBytes, B64()), key };
}

/** Chiffre un message texte de salon avec la clé symétrique du salon (enveloppe opaque { n, c }). */
export function encryptRoom(key: Uint8Array, plaintext: string): RoomEnvelope {
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  // Bourrage à taille fixe AVANT chiffrement, comme pour les MP (anti analyse de trafic).
  const padded = sodium.pad(sodium.from_string(plaintext), PAD_BLOCK);
  const ct = sodium.crypto_secretbox_easy(padded, nonce, key);
  return { n: sodium.to_base64(nonce, B64()), c: sodium.to_base64(ct, B64()) };
}

/** Déchiffre une enveloppe de salon (lève une erreur si le MAC est invalide). */
export function decryptRoom(key: Uint8Array, env: RoomEnvelope): string {
  const padded = sodium.crypto_secretbox_open_easy(
    sodium.from_base64(env.c, B64()),
    sodium.from_base64(env.n, B64()),
    key,
  );
  return sodium.to_string(sodium.unpad(padded, PAD_BLOCK));
}

/**
 * Variante binaire pour les médias de salon (photos/vidéos). Le clair n'est pas rembourré
 * (taille de média variable, cf. encryptBytesFor des MP). Le cipher reste en octets bruts
 * pour transiter tel quel (champ `data` du payload), comme pour les MP.
 */
export function encryptRoomBytes(key: Uint8Array, bytes: Uint8Array): { nonce: string; cipher: Uint8Array } {
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const cipher = sodium.crypto_secretbox_easy(bytes, nonce, key);
  return { nonce: sodium.to_base64(nonce, B64()), cipher };
}

export function decryptRoomBytes(key: Uint8Array, nonceB64: string, cipher: Uint8Array): Uint8Array {
  return sodium.crypto_secretbox_open_easy(cipher, sodium.from_base64(nonceB64, B64()), key);
}
