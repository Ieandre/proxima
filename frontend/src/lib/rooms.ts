import type { JoinedRoom, RoomSummary } from './types';

/**
 * Liste UNIQUE des salons.
 *
 * L'écran affichait deux listes — « à rejoindre » en bas, « rejoints » en haut —
 * séparées par une frontière que la ligne traversait au moment du clic. Entrer
 * dans un salon le faisait donc téléporter d'un bloc à l'autre en changeant
 * d'apparence, pendant que le panneau de droite basculait : trois mouvements
 * simultanés pour une seule intention.
 *
 * Ici, une seule liste dont l'ordre ne dépend PAS de `here` : entrer ou sortir
 * ne change que l'état visuel de la ligne, jamais sa position.
 */
export type RoomEntry = {
  id: string;
  name: string;
  /** Vous êtes présent·e dans ce salon (par opposition à « listé, pas encore entré »). */
  here: boolean;
  /** Nombre de présents, vous compris — `null` quand il est inconnu (salon de région quitté). */
  count: number | null;
  /** Salon de votre région : entrée et sortie silencieuses. */
  region: boolean;
  /** Salon permanent défini par l'administrateur. */
  official: boolean;
  encrypted: boolean;
  private: boolean;
  /** Sel Argon2id public — nécessaire pour dériver la clé à l'entrée d'un salon chiffré. */
  salt?: string;
  /** Vous êtes le seul présent : sortir efface le salon (RG-05, sauf permanent). */
  alone: boolean;
};

/** Comparaison insensible à la casse et aux accents (recherche de pseudo comme de salon). */
export const normalize = (s: string) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/**
 * Rang de section. La région d'abord (c'est « chez soi »), puis les salons
 * officiels, puis le reste : trois strates stables que rien n'échange en cours
 * de session.
 */
function tier(e: RoomEntry): number {
  if (e.region) return 0;
  if (e.official) return 1;
  return 2;
}

/**
 * Clé de tri au sein d'une strate : le nombre de présents SANS SOI.
 *
 * C'est le détail qui tient toute la promesse. Trier sur `count` brut ferait
 * qu'entrer dans un salon incrémente sa propre clé de tri et peut le faire
 * doubler son voisin — la ligne bougerait à cause du clic, exactement ce que
 * cette refonte supprime. En s'excluant du compte, sa position est identique
 * avant et après l'entrée.
 */
function others(e: RoomEntry): number {
  return (e.count ?? 0) - (e.here ? 1 : 0);
}

const byOrder = (a: RoomEntry, b: RoomEntry) =>
  tier(a) - tier(b) ||
  others(b) - others(a) ||
  a.name.localeCompare(b.name, 'fr') ||
  a.id.localeCompare(b.id);

/**
 * Fusionne les trois sources en une liste ordonnée :
 *  - `joinedRooms` — les salons où l'on est (seuls à connaître la composition
 *    exacte, et seuls à porter les salons privés, hors annuaire public) ;
 *  - `publicRooms` — l'annuaire, pour tout ce que l'on n'a pas encore ouvert ;
 *  - `homeRoom` — le salon de région, que l'annuaire n'expose jamais : sans lui
 *    la ligne disparaîtrait dès qu'on en sort.
 */
export function buildRoomList({
  publicRooms,
  joinedRooms,
  homeRoom,
}: {
  publicRooms: RoomSummary[];
  joinedRooms: Record<string, JoinedRoom>;
  homeRoom: { id: string; name: string } | null;
}): RoomEntry[] {
  const summaries = new Map(publicRooms.map((r) => [r.id, r]));
  const out: RoomEntry[] = [];

  for (const room of Object.values(joinedRooms)) {
    const listed = summaries.get(room.id);
    out.push({
      id: room.id,
      name: room.name,
      here: true,
      // La composition reçue fait foi pour un salon où l'on est : elle est tenue à
      // jour par `room:members`, là où l'annuaire ne l'est qu'à chaque diffusion.
      count: room.members.length,
      region: room.id === homeRoom?.id,
      official: !!listed?.persistent,
      encrypted: !!room.encrypted,
      private: room.type === 'private',
      salt: room.salt || listed?.salt,
      alone: room.members.length <= 1 && !listed?.persistent,
    });
  }

  for (const r of publicRooms) {
    if (joinedRooms[r.id]) continue;
    out.push({
      id: r.id,
      name: r.name,
      here: false,
      count: r.count,
      region: r.id === homeRoom?.id,
      official: !!r.persistent,
      encrypted: !!r.encrypted,
      private: r.type === 'private',
      salt: r.salt,
      alone: false,
    });
  }

  // Salon de région quitté : absent de l'annuaire ET des salons rejoints. On le
  // reconstitue depuis le seul nom mémorisé pour garder le chemin du retour.
  if (homeRoom && !joinedRooms[homeRoom.id] && !summaries.has(homeRoom.id)) {
    out.push({
      id: homeRoom.id,
      name: homeRoom.name,
      here: false,
      // Hors annuaire : on ne sait plus combien de monde s'y trouve, et l'inventer
      // (« 0 présent ») serait faux. La ligne le dira franchement.
      count: null,
      region: true,
      official: true,
      encrypted: false,
      private: false,
      alone: false,
    });
  }

  return out.sort(byOrder);
}

/** Filtre d'affichage : recherche par nom, et restriction aux salons où l'on est. */
export function filterRooms(
  entries: RoomEntry[],
  { query = '', hereOnly = false }: { query?: string; hereOnly?: boolean },
): RoomEntry[] {
  const q = normalize(query.trim());
  return entries.filter((e) => (!hereOnly || e.here) && (!q || normalize(e.name).includes(q)));
}
