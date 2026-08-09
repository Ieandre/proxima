/**
 * Corps de message scellé — MP et salons chiffrés (RG-07, « serveur aveugle »).
 *
 * Le clair transporte plus que du texte : un identifiant de message (les MP n'en
 * ont aucun côté serveur), la référence du message cité et, pour un vocal, la
 * silhouette du son. Ces métadonnées décrivent le contenu, elles voyagent donc
 * À L'INTÉRIEUR de l'enveloppe — sinon le serveur reconstruirait le graphe des
 * réponses, ou la découpe parole/silence d'une voix, dans une conversation
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

import { packPeaks, unpackPeaks } from './voice';

export type MessageBody = {
  /** Identifiant du message — MP : généré ici ; salon chiffré : id serveur (hors enveloppe). */
  id?: string;
  text: string;
  /** Identifiant du message cité, s'il s'agit d'une réponse. */
  replyTo?: string;
  /**
   * Message vocal : silhouette du son et durée. Elles décrivent le contenu — où
   * l'on parle, où l'on se tait, combien de temps — et sont donc scellées avec
   * lui plutôt que posées à côté, où elles auraient livré au serveur la découpe
   * d'un message qu'il ne peut pas lire.
   */
  voice?: { peaks: Uint8Array; seconds: number };
};

const MARK = '\u0001p1:';

export function encodeBody(body: MessageBody): string {
  const payload: { t: string; i?: string; r?: string; v?: string; d?: number } = { t: body.text };
  if (body.id) payload.i = body.id;
  if (body.replyTo) payload.r = body.replyTo;
  if (body.voice) {
    payload.v = packPeaks(body.voice.peaks);
    // Durée au dixième de seconde : la précision qu'affiche un compteur, portée
    // par un entier plutôt que par un flottant à rallonge dans le JSON.
    payload.d = Math.max(0, Math.round(body.voice.seconds * 10));
  }
  return MARK + JSON.stringify(payload);
}

export function decodeBody(raw: string): MessageBody {
  if (!raw.startsWith(MARK)) return { text: raw };
  try {
    const o = JSON.parse(raw.slice(MARK.length)) as Record<string, unknown>;
    const peaks = typeof o.v === 'string' ? unpackPeaks(o.v) : null;
    return {
      text: typeof o.t === 'string' ? o.t : '',
      id: typeof o.i === 'string' ? o.i : undefined,
      replyTo: typeof o.r === 'string' ? o.r : undefined,
      voice: peaks ? { peaks, seconds: typeof o.d === 'number' && o.d > 0 ? o.d / 10 : 0 } : undefined,
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
