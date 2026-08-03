/**
 * Thème clair / sombre. Suit `prefers-color-scheme` par défaut ; la bascule de la
 * barre supérieure ne sert qu'à contredire ce réglage.
 *
 * `sessionStorage` et pas `localStorage`, même doctrine que
 * [`identity.ts`](./identity.ts) : une clé `proxima:theme` survivant à la visite
 * rendrait fausse la promesse « vous fermez l'onglet, il ne reste rien » — et
 * c'est vérifiable en trois clics. Sans choix mémorisé on retombe sur le système,
 * qui est déjà le bon thème dans la quasi-totalité des cas.
 *
 * Hors du store Zustand : le thème doit être posé AVANT le premier rendu (sinon
 * l'écran clignote), et `reset()` purge le store en fin de session — ce qui
 * rejouerait l'apparence en pleine navigation.
 */

export type Theme = 'light' | 'dark';
/** `null` = aucun choix exprimé, on suit le système. */
export type ThemeChoice = Theme | null;

const KEY = 'proxima:theme';

/* Couleur de la barre de navigateur (Android, Safari iOS). En clair elle reste
   le bleu de marque — c'est un bandeau de marque au-dessus d'une page blanche ;
   en sombre elle doit disparaître dans la page, sans quoi le téléphone garde un
   bandeau bleu vif au-dessus d'une interface nuit. */
const CHROME: Record<Theme, string> = { light: '#0f6fdb', dark: '#080d17' };

/**
 * `sessionStorage` peut lever à la seule lecture (Safari en navigation privée,
 * stockage refusé, contexte sans DOM comme les tests). L'absence de mémoire
 * n'est pas une erreur : on suit le système, ce qui est déjà le défaut.
 */
function store(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/** Le thème du système, `light` par défaut si la requête média est indisponible. */
export function systemTheme(): Theme {
  try {
    return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** Relit le choix mémorisé. Toute valeur inattendue vaut « aucun choix ». */
export function recallTheme(): ThemeChoice {
  try {
    const raw = store()?.getItem(KEY);
    return raw === 'light' || raw === 'dark' ? raw : null;
  } catch {
    return null;
  }
}

/** Mémorise le choix pour la durée de l'onglet (`null` efface le choix). */
export function rememberTheme(choice: ThemeChoice): void {
  try {
    if (choice === null) store()?.removeItem(KEY);
    else store()?.setItem(KEY, choice);
  } catch {
    /* quota ou stockage refusé : le choix vaudra pour cette page seulement */
  }
}

/** Le thème effectif : le choix exprimé, sinon celui du système. */
export function resolveTheme(choice: ThemeChoice = recallTheme()): Theme {
  return choice ?? systemTheme();
}

/**
 * Applique le thème au document. L'attribut `data-theme` est TOUJOURS posé (et
 * jamais absent) : c'est lui seul que la feuille de style interroge, ce qui évite
 * d'avoir à départager une requête média et un choix manuel qui se contredisent.
 */
export function applyTheme(theme: Theme): void {
  const root = globalThis.document?.documentElement;
  if (!root) return;
  root.dataset.theme = theme;
  const meta = globalThis.document?.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', CHROME[theme]);
}

/**
 * Pose le thème avant le premier rendu. Appelé par `main.tsx`, en tête de bundle.
 */
export function initTheme(): Theme {
  const theme = resolveTheme();
  applyTheme(theme);
  return theme;
}

/**
 * Suit les changements du système (bascule automatique au coucher du soleil,
 * réglage modifié dans un autre onglet). Rend une fonction de désabonnement.
 * L'appelant n'agit que s'il n'y a pas de choix manuel : un choix explicite doit
 * tenir, y compris quand le système change d'avis pendant la visite.
 */
export function watchSystemTheme(onChange: (theme: Theme) => void): () => void {
  let mq: MediaQueryList | undefined;
  try {
    mq = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
  } catch {
    return () => {};
  }
  if (!mq) return () => {};
  const handler = (e: MediaQueryListEvent) => onChange(e.matches ? 'dark' : 'light');
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}
