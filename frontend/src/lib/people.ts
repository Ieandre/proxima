import type { Person, RoomMember } from './types';

/**
 * Répartition des personnes entre les deux listes de la barre latérale. Pendant
 * de `buildRoomList` pour les salons : la logique vit hors du composant pour être
 * verrouillée par des tests, parce que c'est un invariant d'interface — pas un
 * détail de rendu.
 *
 * Le critère est **« ai-je un fil avec cette personne ? »**, jamais sa distance.
 * Une conversation naît dans « Conversations privées » et n'en sort jamais ; la
 * présence est un ÉTAT de la ligne (`offRadar`), et « À proximité » ne contient
 * que les gens qu'on n'a pas encore abordés.
 *
 * Un critère géographique ferait bouger la ligne toute seule, sous l'effet du
 * déplacement d'autrui plutôt que d'un clic — c'est ce qu'on évite ici.
 */

export type PeopleSplit = {
  /** Correspondants avec un fil, présents ou non. Ordre alphabétique stable. */
  conversations: Person[];
  /** Personnes présentes qu'on n'a pas encore abordées. */
  nearby: Person[];
};

export type SplitInput = {
  people: Record<string, Person>;
  pmPeers: Record<string, Person>;
  threads: Record<string, unknown[]>;
};

/** Un fil existe dès qu'il porte au moins un message (le système compte : il ouvre la conversation). */
export const hasThread = (threads: SplitInput['threads'], id: string) => (threads[`pm:${id}`]?.length ?? 0) > 0;

/**
 * Correspondant né d'un salon, quand on
 * n'a de lui que ce que la liste des présents et `pm:key` en disent : un pseudo et
 * une clé publique.
 *
 * Les champs géographiques restent vides, et ce n'est pas un pis-aller : le
 * serveur ne divulgue ni ville ni âge d'un co-présent hors rayon, et l'interface
 * sait déjà dire cet état — `PersonRow` et l'en-tête du fil affichent alors
 * « hors de portée », ce qui est exact pour quelqu'un rencontré dans un salon
 * ouvert à tous. Si la personne est dans le rayon, ce profil réduit n'est jamais
 * construit : `people` porte déjà le profil complet, et il gagne partout
 * (`splitPeople`, `resolvePmPeer`).
 */
export function peerFromMember(member: RoomMember & { pub: string }): Person {
  return {
    id: member.id,
    pseudo: member.pseudo,
    pub: member.pub,
    age: 0,
    gender: 'A',
    city: '',
    region: '',
    country: '',
    countryLabel: '',
  };
}

export function splitPeople({ people, pmPeers, threads }: SplitInput): PeopleSplit {
  const byId = new Map<string, Person>();
  // Le souvenir d'abord, le profil vivant ensuite : quand la personne est présente,
  // c'est lui qui porte la ville et l'âge à jour, là où `pmPeers` ne garde que ce
  // qu'on savait d'elle au moment de l'échange.
  for (const p of Object.values(pmPeers)) if (hasThread(threads, p.id)) byId.set(p.id, p);
  for (const p of Object.values(people)) if (hasThread(threads, p.id)) byId.set(p.id, p);

  return {
    // Ordre alphabétique, donc stable. Trier par activité récente ferait remonter une
    // ligne à chaque message reçu — on cliquerait à côté. La pastille de non-lus
    // signale déjà l'activité sans rien déplacer.
    conversations: [...byId.values()].sort((a, b) => a.pseudo.localeCompare(b.pseudo, 'fr')),
    nearby: Object.values(people).filter((p) => !hasThread(threads, p.id)),
  };
}
