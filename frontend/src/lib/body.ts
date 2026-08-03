/**
 * Corps de message scellé — MP et salons chiffrés (RG-07, « serveur aveugle »).
 *
 * Le clair transporte plus que du texte : un identifiant de message (les MP n'en
 * ont aucun côté serveur) et la référence du message cité. Ces métadonnées
 * décrivent le contenu, elles voyagent donc À L'INTÉRIEUR de l'enveloppe —
 * sinon le serveur reconstruirait le graphe des réponses d'une conversation
 * qu'il est censé ne pas pouvoir lire.
 *
 * Seule la RÉFÉRENCE circule, jamais l'extrait cité : chaque client résout la
 * citation dans son propre fil. L'absence d'historique (RG-01) vaut donc aussi
 * pour les réponses.
 *
 * Sérialisation : un caractère de contrôle en marqueur (intapable au clavier)
 * suivi d'un JSON compact ; un clair sans marqueur est rendu tel quel. Le
 * bourrage à 256 octets appliqué avant chiffrement (cf. `lib/crypto`) absorbe
 * l'enveloppe JSON — à taille de ciphertext inchangée dans la quasi-totalité
 * des cas.
 */

export type MessageBody = {
  /** Identifiant du message — MP : généré ici ; salon chiffré : id serveur (hors enveloppe). */
  id?: string;
  text: string;
  /** Identifiant du message cité, s'il s'agit d'une réponse. */
  replyTo?: string;
};

const MARK = '\u0001p1:';

export function encodeBody(body: MessageBody): string {
  const payload: { t: string; i?: string; r?: string } = { t: body.text };
  if (body.id) payload.i = body.id;
  if (body.replyTo) payload.r = body.replyTo;
  return MARK + JSON.stringify(payload);
}

export function decodeBody(raw: string): MessageBody {
  if (!raw.startsWith(MARK)) return { text: raw };
  try {
    const o = JSON.parse(raw.slice(MARK.length)) as Record<string, unknown>;
    return {
      text: typeof o.t === 'string' ? o.t : '',
      id: typeof o.i === 'string' ? o.i : undefined,
      replyTo: typeof o.r === 'string' ? o.r : undefined,
    };
  } catch {
    // Corps marqué mais illisible : on n'a rien de sensé à montrer, et surtout
    // pas le JSON brut. L'appelant affichera une bulle vide plutôt qu'un débris.
    return { text: '' };
  }
}

/**
 * Identifiant de message généré côté client (MP) — 9 octets aléatoires en
 * base64 url-safe, soit la même forme que l'`id` serveur des salons, pour que
 * les deux mondes se citent avec un identifiant de même nature.
 */
export function newMessageId(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
