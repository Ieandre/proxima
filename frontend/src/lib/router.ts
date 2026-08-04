/* ==========================================================================
 * Routage des pages publiques.
 *
 * Ces pages ont une URL réelle (`/cgu`, `/en-savoir-plus`…) et non un fragment :
 * les moteurs de recherche ignorent tout ce qui suit un `#`, et le contenu des
 * documents juridiques comme celui de la page « comment ça marche » n'existait
 * donc dans aucun index. La liste doit rester identique à celle de
 * `server/pages.js`, qui déclare les routes côté serveur et pré-rend un HTML par
 * page au build (`test/pages.test.js` vérifie l'accord des deux).
 *
 * On navigue par l'API History, sans rechargement : une vraie navigation
 * détruirait la session éphémère — socket fermé, clés régénérées, fils perdus.
 * C'est aussi pourquoi les liens vers l'accueil sont interceptés comme les
 * autres.
 * ======================================================================== */

/** Pages autres que l'accueil. Ordre = ordre de la navigation inter-pages. */
export const PAGE_PATHS = [
  '/en-savoir-plus',
  '/cgu',
  '/confidentialite',
  '/moderation',
  '/mentions-legales',
] as const;

export type PagePath = (typeof PAGE_PATHS)[number];

/** Événement interne : `pushState` n'émet rien, contrairement au bouton « retour ». */
const ROUTE_EVENT = 'proxima:route';

/** Chemin sans slash final — `/cgu/` et `/cgu` désignent la même page. */
function normalize(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') || '/' : pathname;
}

export function isPagePath(pathname: string): pathname is PagePath {
  return (PAGE_PATHS as readonly string[]).includes(normalize(pathname));
}

export function currentPath(): string {
  return normalize(window.location.pathname);
}

/** Navigation interne, sans rechargement. */
export function navigate(to: string): void {
  if (to === window.location.pathname + window.location.search) return;
  window.history.pushState(null, '', to);
  window.dispatchEvent(new Event(ROUTE_EVENT));
}

/**
 * Fermeture d'une page : on remonte l'historique quand c'est possible. C'est
 * préférable à un `navigate('/')` car cela restitue l'URL d'origine telle
 * quelle — en particulier la query d'un lien d'invitation (`/?r=…&k=…`) et son
 * fragment (`#p=…`, le mot de passe, qui n'est jamais envoyé au serveur).
 */
export function closePage(): void {
  if (window.history.length > 1) window.history.back();
  else navigate('/');
}

export function subscribeRoute(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange);
  window.addEventListener(ROUTE_EVENT, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(ROUTE_EVENT, onChange);
  };
}

/**
 * Anciens liens par fragment (`https://proximachat.eu/#cgu`) : ils ont pu être
 * partagés ou mis en favori avant le passage aux vraies URLs. On les convertit
 * en place, sans entrée d'historique supplémentaire.
 *
 * `#p=…` (mot de passe d'un lien de salon) n'est évidemment pas concerné : seuls
 * les fragments qui correspondent exactement à une page le sont.
 */
export function migrateLegacyHash(): void {
  const hash = window.location.hash;
  if (!hash) return;
  const candidate = `/${hash.slice(1)}`;
  if (!isPagePath(candidate)) return;
  window.history.replaceState(null, '', candidate);
}

/**
 * Interception globale des clics sur les liens internes.
 *
 * Un délégué unique sur le document plutôt qu'un composant `<Link>` : les liens
 * restent de vrais `<a href="/cgu">` dans le HTML, donc explorables par un
 * moteur et ouvrables dans un nouvel onglet — ce qu'un `<span onClick>` perdrait.
 * Toutes les façons délibérées d'ouvrir un lien autrement (clic du milieu, Ctrl,
 * Cmd, Maj, `target`, `download`) sont laissées au navigateur.
 */
export function installLinkDelegate(): () => void {
  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const anchor = (event.target as Element | null)?.closest?.('a');
    if (!anchor) return;
    if (anchor.hasAttribute('download')) return;
    const target = anchor.getAttribute('target');
    if (target && target !== '_self') return;

    const href = anchor.getAttribute('href');
    if (!href || href.startsWith('#')) return;

    let url: URL;
    try {
      url = new URL(href, window.location.href);
    } catch {
      return;
    }
    if (url.origin !== window.location.origin) return;

    const path = normalize(url.pathname);
    if (path !== '/' && !isPagePath(path)) return;

    event.preventDefault();
    navigate(`${path}${url.search}${url.hash}`);
  };

  document.addEventListener('click', onClick);
  return () => document.removeEventListener('click', onClick);
}
