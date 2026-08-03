/* ==========================================================================
 * Liens externes du site.
 *
 * Un lien vide ⇒ le lien n'est pas rendu du tout (même posture que
 * `OPERATOR_SECRET` vide côté serveur : inerte plutôt qu'à moitié câblé).
 * On évite ainsi un lien mort en production si l'invitation n'est pas encore
 * renseignée, ou si elle expire et qu'on préfère la retirer.
 *
 * Rappel : un simple lien sortant, jamais un widget embarqué. La CSP
 * (`default-src 'self'`) bloquerait l'iframe, et celui-ci divulguerait l'IP de
 * chaque visiteur à un tiers dès le chargement de la page — contraire à la
 * promesse du service. Le `Referrer-Policy: no-referrer` global fait déjà que
 * la destination ignore d'où vient le clic.
 * ======================================================================== */

/**
 * Invitation vers le serveur Discord de la communauté, renseignée au build via
 * `VITE_DISCORD_INVITE`. Hors du dépôt : une invitation en dur y serait
 * moissonnable, et l'instance qu'on héberge n'est pas forcément la vôtre.
 */
export const DISCORD_INVITE = import.meta.env.VITE_DISCORD_INVITE ?? '';

/**
 * Code source du service.
 *
 * Contrairement à l'invitation Discord, ce lien a une valeur par défaut : sous
 * AGPL-3.0, quiconque expose Proxima sur un réseau doit en offrir les sources aux
 * utilisateurs (art. 13). Un lien absent serait donc un manquement, pas une
 * simple omission d'affichage.
 *
 * Une instance dérivée DOIT pointer vers SON dépôt via `VITE_SOURCE_URL` : c'est
 * son code qui tourne, pas celui-ci.
 */
export const SOURCE_URL = import.meta.env.VITE_SOURCE_URL ?? 'https://github.com/Ieandre/proxima';

/**
 * Lien d'invitation à une conversation privée.
 *
 * Un paramètre de requête sur la racine, jamais un chemin : une seule URL est
 * indexable (`/`), et tout autre chemin renvoie une vraie 404 côté serveur —
 * `/i/<jeton>` produirait donc un lien mort.
 */
export const inviteUrl = (token: string) => `${window.location.origin}/?i=${token}`;
