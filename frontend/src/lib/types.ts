export type Gender = 'F' | 'H' | 'A';

export const GENDER_LABEL: Record<Gender, string> = { F: 'Femme', H: 'Homme', A: 'Autre' };

export type Person = {
  id: string;
  pseudo: string;
  age: number;
  gender: Gender;
  city: string;
  region: string;
  country: string;
  countryLabel: string;
  pub: string;
};

export type RoomSummary = {
  id: string;
  name: string;
  type: 'public' | 'private';
  count: number;
  persistent?: boolean; // salon permanent défini par l'administrateur
  encrypted?: boolean; // salon privé chiffré E2E à mot de passe
  salt?: string; // sel Argon2id public — présent seulement si chiffré (dérivation directe de la clé)
};

export type RoomMember = { id: string; pseudo: string };

export type JoinedRoom = {
  id: string;
  name: string;
  type: 'public' | 'private';
  hasPassword: boolean;
  owner: string;
  members: RoomMember[];
  invite?: string;
  encrypted?: boolean; // salon chiffré E2E (badge distinct ; mot de passe figé)
  salt?: string; // sel Argon2id public du salon chiffré
};

export type MediaAttachment = {
  url: string; // object URL local (blob:)
  mime: string;
  kind: 'image' | 'video';
};

export type Message = {
  localId: string;
  /**
   * Identifiant partagé par les deux bouts de la conversation — salon : généré par
   * le serveur (cible du retrait ciblé par la modération) ; MP : généré par le client
   * émetteur et scellé dans l'enveloppe chiffrée (le serveur ne le voit jamais).
   * Sert aussi d'ancre aux réponses citées.
   */
  msgId?: string;
  kind: 'me' | 'them' | 'system';
  fromId?: string;
  fromPseudo?: string;
  text: string;
  ts: number;
  encrypted?: boolean;
  media?: MediaAttachment;
  retracted?: boolean; // message retiré par la modération
  /** Texte remplacé par son auteur après diffusion — dit à voix haute dans la bulle. */
  edited?: boolean;
  /** `msgId` du message cité — la citation elle-même est résolue localement, jamais transmise. */
  replyTo?: string;
  /** Le message m'interpelle par mon pseudo (calculé à la réception, jamais transmis). */
  mentionsMe?: boolean;
};

export type ReportReason = 'illegal' | 'minor' | 'harassment' | 'spam' | 'other';

export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  illegal: 'Contenu illégal',
  minor: 'Mineur en danger',
  harassment: 'Harcèlement',
  spam: 'Spam',
  other: 'Autre',
};

export type ActiveKey = { kind: 'pm'; id: string } | { kind: 'room'; id: string } | null;

export type CitySuggestion = {
  /**
   * Identifiant stable de la commune (`FR-57463`, code INSEE ou GeoNames). C'est
   * lui qu'on renvoie à l'identification : 3 675 communes françaises portent un
   * nom qu'une autre porte aussi, un nom seul ne désigne donc pas un lieu.
   */
  id: string;
  name: string;
  /** Département, province ou canton — ce qui distingue deux communes homonymes. */
  admin: string;
  country: string;
  countryLabel: string;
  region: string;
  /** Code postal ayant mené à cette commune, quand la recherche s'est faite par code. */
  postal?: string;
  /** Localité du code postal, quand elle est rattachée à une commune voisine. */
  via?: string;
};
