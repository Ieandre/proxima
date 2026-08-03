import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyTheme,
  initTheme,
  recallTheme,
  rememberTheme,
  resolveTheme,
  systemTheme,
  watchSystemTheme,
} from '../src/lib/theme';

/* L'environnement de test est `node` (cf. vitest.config.ts) : ni DOM ni
   sessionStorage ni matchMedia. On pose le strict minimum que le module consulte
   — ce qui vérifie aussi, par construction, qu'il ne demande rien de plus. */
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

/** Système en thème sombre ou clair, avec un émetteur de changement pilotable. */
function fakeMatchMedia(dark: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const mq = {
    matches: dark,
    addEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => void listeners.add(fn),
    removeEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => void listeners.delete(fn),
  };
  const emit = (nowDark: boolean) => {
    mq.matches = nowDark;
    for (const fn of listeners) fn({ matches: nowDark } as MediaQueryListEvent);
  };
  return { mq, emit, listenerCount: () => listeners.size };
}

function define(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

/** Document minimal : `applyTheme` ne touche que `documentElement` et une balise. */
function fakeDocument() {
  const meta = { content: '', setAttribute: (_: string, v: string) => void (meta.content = v) };
  return {
    documentElement: { dataset: {} as Record<string, string> },
    querySelector: (sel: string) => (sel === 'meta[name="theme-color"]' ? meta : null),
    _meta: meta,
  };
}

let doc: ReturnType<typeof fakeDocument>;

beforeEach(() => {
  define('sessionStorage', fakeStorage());
  define('matchMedia', () => fakeMatchMedia(false).mq);
  doc = fakeDocument();
  define('document', doc);
});

afterEach(() => {
  define('document', undefined);
  define('matchMedia', undefined);
});

describe('choix de thème mémorisé', () => {
  it('ne mémorise rien tant que rien n’a été choisi', () => {
    expect(recallTheme()).toBeNull();
  });

  it('rend le choix mémorisé', () => {
    rememberTheme('dark');
    expect(recallTheme()).toBe('dark');
    rememberTheme('light');
    expect(recallTheme()).toBe('light');
  });

  it('efface le choix quand on repasse au système', () => {
    rememberTheme('dark');
    rememberTheme(null);
    expect(recallTheme()).toBeNull();
  });

  it('refuse une mémoire trafiquée plutôt que de poser un thème inconnu', () => {
    for (const raw of ['', 'sombre', 'DARK', '{"theme":"dark"}', 'null']) {
      sessionStorage.setItem('proxima:theme', raw);
      expect(recallTheme(), raw).toBeNull();
    }
  });

  it('ne casse pas quand le stockage est refusé (navigation privée)', () => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      get() {
        throw new Error('accès refusé');
      },
      configurable: true,
    });
    expect(() => rememberTheme('dark')).not.toThrow();
    expect(recallTheme()).toBeNull();
  });
});

describe('thème effectif', () => {
  it('suit le système faute de choix exprimé', () => {
    define('matchMedia', () => fakeMatchMedia(true).mq);
    expect(systemTheme()).toBe('dark');
    expect(resolveTheme()).toBe('dark');
  });

  it('laisse le choix manuel contredire le système', () => {
    define('matchMedia', () => fakeMatchMedia(true).mq);
    rememberTheme('light');
    expect(resolveTheme()).toBe('light');
  });

  it('retombe sur le clair quand la requête média est indisponible', () => {
    define('matchMedia', undefined);
    expect(systemTheme()).toBe('light');
    expect(resolveTheme()).toBe('light');
  });
});

describe('application au document', () => {
  it('pose toujours `data-theme` — la feuille de style n’interroge que lui', () => {
    applyTheme('dark');
    expect(doc.documentElement.dataset.theme).toBe('dark');
    applyTheme('light');
    expect(doc.documentElement.dataset.theme).toBe('light');
  });

  it('accorde la couleur de la barre du navigateur au thème', () => {
    applyTheme('dark');
    expect(doc._meta.content).toBe('#080d17');
    applyTheme('light');
    expect(doc._meta.content).toBe('#0f6fdb');
  });

  it('applique le thème résolu au démarrage', () => {
    define('matchMedia', () => fakeMatchMedia(true).mq);
    expect(initTheme()).toBe('dark');
    expect(doc.documentElement.dataset.theme).toBe('dark');
  });

  it('ne casse pas hors navigateur (rendu sans DOM)', () => {
    define('document', undefined);
    expect(() => applyTheme('dark')).not.toThrow();
  });
});

describe('suivi du système', () => {
  it('signale les changements et se désabonne', () => {
    const media = fakeMatchMedia(false);
    define('matchMedia', () => media.mq);
    const vus: string[] = [];
    const stop = watchSystemTheme((t) => vus.push(t));

    media.emit(true);
    media.emit(false);
    expect(vus).toEqual(['dark', 'light']);

    stop();
    expect(media.listenerCount()).toBe(0);
    media.emit(true);
    expect(vus).toEqual(['dark', 'light']);
  });

  it('rend un désabonnement inoffensif quand la requête média est indisponible', () => {
    define('matchMedia', undefined);
    expect(() => watchSystemTheme(() => {})()).not.toThrow();
  });
});
