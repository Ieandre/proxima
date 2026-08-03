/**
 * Mémoire d'onglet de l'identité déclarée (pseudo, âge, genre, ville), pour
 * refaire l'`identify` tout seul après un rechargement ou une coupure réseau.
 *
 * `sessionStorage` et pas `localStorage` : sa durée de vie est exactement celle
 * que le service promet — l'onglet. `localStorage` survivrait à la visite et
 * rendrait fausse la phrase « votre identité vit le temps d'une visite ».
 *
 * On mémorise **ce que l'utilisateur a déclaré**, jamais ce que la session est
 * devenue : aucun identifiant de session, aucune clé, aucun message, aucun salon
 * (RG-01/RG-02). La reprise crée une session serveur neuve.
 */

import type { Gender } from './types';

/**
 * Les quatre valeurs saisies au formulaire d'entrée, et rien d'autre.
 *
 * `cityId` accompagne le nom depuis que la base couvre l'entièreté des communes :
 * 3 675 communes françaises sont homonymes, et reprendre la session sur le seul
 * nom renverrait à la plus peuplée. Il reste optionnel — une mémoire écrite avant
 * ce changement doit encore pouvoir servir, le nom suffisant au serveur en repli.
 */
export type DeclaredIdentity = { pseudo: string; age: number; gender: Gender; city: string; cityId?: string };

const KEY = 'proxima:identite';

/**
 * `sessionStorage` peut lever à la seule lecture (Safari en navigation privée,
 * cookies tiers bloqués, contexte sans DOM comme les tests). L'absence de mémoire
 * n'est pas une erreur : on retombe simplement sur le formulaire.
 */
function store(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/** Mémorise l'identité déclarée pour la durée de l'onglet. */
export function rememberIdentity(id: DeclaredIdentity): void {
  try {
    store()?.setItem(KEY, JSON.stringify(id));
  } catch {
    /* quota ou stockage refusé : la reprise sera manuelle, sans gravité */
  }
}

/**
 * Relit l'identité mémorisée. Le contenu est revalidé au même niveau que le
 * formulaire : une valeur tronquée ou trafiquée doit rendre la main à l'écran
 * d'entrée, pas partir en boucle d'`identify` refusés.
 */
export function recallIdentity(): DeclaredIdentity | null {
  const raw = (() => {
    try {
      return store()?.getItem(KEY) ?? null;
    } catch {
      return null;
    }
  })();
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<DeclaredIdentity>;
    if (typeof v?.pseudo !== 'string' || v.pseudo.trim().length < 2) return null;
    if (!Number.isInteger(v.age) || (v.age as number) < 18 || (v.age as number) > 120) return null;
    if (v.gender !== 'F' && v.gender !== 'H' && v.gender !== 'A') return null;
    if (typeof v.city !== 'string' || v.city.trim().length < 2) return null;
    const cityId = typeof v.cityId === 'string' && v.cityId ? v.cityId : undefined;
    return { pseudo: v.pseudo, age: v.age as number, gender: v.gender, city: v.city, ...(cityId ? { cityId } : {}) };
  } catch {
    return null;
  }
}

/**
 * Efface la mémoire. Appelé quand la reprise échoue, et surtout quand on quitte
 * volontairement : « quitter et tout détruire » recharge la page, il ne faudrait
 * pas se faire ré-identifier dans la foulée.
 */
export function forgetIdentity(): void {
  try {
    store()?.removeItem(KEY);
  } catch {
    /* rien à effacer */
  }
}
