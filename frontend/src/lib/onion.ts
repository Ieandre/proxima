/**
 * Service onion Tor — côté client.
 *
 * Deux questions différentes, deux mécanismes, à ne pas confondre :
 *
 *  - « la page que je consulte est-elle servie par l'onion ? » → `isOnionOrigin()`,
 *    déduit de `location.hostname`. Disponible immédiatement, avant toute
 *    connexion : c'est ce qui permet de masquer l'invitation « Accès Tor » du pied
 *    de page quand on y est déjà.
 *  - « le serveur me voit-il arriver par l'onion ? » → le booléen `onion` du store,
 *    renseigné par l'accusé d'`identify`. C'est lui qui pilote le badge, et lui
 *    seul : un badge visible depuis le clearnet prouverait que le marqueur Caddy
 *    est forgeable, donc que l'anti-spam est contournable.
 */
export function isOnionOrigin(): boolean {
  return globalThis.location?.hostname?.endsWith('.onion') ?? false;
}
