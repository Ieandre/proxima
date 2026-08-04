import { beforeEach, describe, expect, it, vi } from 'vitest';
import { armSound, chime, previewChime, setSoundMuted, soundMuted } from '../src/lib/sound';

/* L'environnement de test est `node` (cf. vitest.config.ts) : ni Web Audio ni
   sessionStorage. On pose le strict minimum que le module consulte — ce qui
   vérifie aussi, par construction, qu'il ne demande rien de plus.

   ATTENTION à l'ordre des blocs : `sound.ts` garde son graphe audio en mémoire
   dès qu'il a pu le monter une fois. Le cas « pas de Web Audio du tout » doit
   donc passer AVANT que le faux contexte soit installé. */

function define(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

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

/** Ce que le faux contexte a reçu : notes programmées, tampons créés. */
const notes: Array<{ freq: number; at: number }> = [];
const buffers: Float32Array[][] = [];

/** Paramètre automatisable : seule sa valeur courante nous intéresse. */
function param() {
  const p = {
    value: 0,
    setValueAtTime: () => p,
    linearRampToValueAtTime: () => p,
    exponentialRampToValueAtTime: () => p,
  };
  return p;
}

/* `connect` rend sa destination : le module chaîne (`osc.connect(env).connect(voice)`),
   comme le fait la vraie API. */
const sink = () => ({ connect: <T>(d: T) => d });

function fakeAudioContext() {
  return class {
    sampleRate = 8000;
    currentTime = 0;
    state = 'running';
    destination = sink();
    resume = () => Promise.resolve();
    createGain = () => ({ gain: param(), ...sink() });
    createStereoPanner = () => ({ pan: param(), ...sink() });
    createBiquadFilter = () => ({ type: '', frequency: param(), Q: param(), ...sink() });
    createConvolver = () => ({ buffer: null, ...sink() });
    createBufferSource = () => ({ buffer: null, start: () => {}, stop: () => {}, ...sink() });
    createOscillator = () => {
      const osc = {
        type: 'sine',
        frequency: param(),
        start: (at: number) => void notes.push({ freq: osc.frequency.value, at }),
        stop: () => {},
        ...sink(),
      };
      return osc;
    };
    createBuffer = (channels: number, length: number) => {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      buffers.push(data);
      return { numberOfChannels: channels, length, getChannelData: (ch: number) => data[ch] };
    };
  };
}

const lowest = () => Math.min(...notes.map((n) => n.freq));

/* Époque de référence des cas sonores. Elle doit être POSTÉRIEURE à l'horloge
   réelle du bloc précédent : l'intervalle anti-rafale est un état de module, et un
   temps figé dans le passé le rendrait indépassable — tous les sons seraient
   filtrés. */
const T0 = 4_000_000_000_000;

describe('sans Web Audio', () => {
  it('reste silencieux sans lever', () => {
    define('AudioContext', undefined);
    define('webkitAudioContext', undefined);
    define('sessionStorage', fakeStorage());
    expect(() => chime('message')).not.toThrow();
    expect(notes).toHaveLength(0);
  });
});

describe('préférence', () => {
  beforeEach(() => {
    define('sessionStorage', fakeStorage());
  });

  it('le son est actif par défaut', () => {
    expect(soundMuted()).toBe(false);
  });

  it('la sourdine fait un aller-retour', () => {
    setSoundMuted(true);
    expect(soundMuted()).toBe(true);
    setSoundMuted(false);
    expect(soundMuted()).toBe(false);
  });

  it('sans stockage, le défaut tient et rien ne lève', () => {
    define('sessionStorage', undefined);
    expect(() => setSoundMuted(true)).not.toThrow();
    expect(soundMuted()).toBe(false);
  });
});

describe('voix', () => {
  let clock = T0;

  beforeEach(() => {
    // Horloge figée : l'intervalle anti-rafale se mesure sur `Date.now()`. Chaque
    // cas part d'une minute plus tard, ce qui le laisse expirer d'un cas à l'autre.
    vi.useFakeTimers();
    clock += 60_000;
    vi.setSystemTime(clock);
    define('AudioContext', fakeAudioContext());
    define('sessionStorage', fakeStorage());
    notes.length = 0;
    // `buffers` n'est PAS vidé : le graphe audio est monté une seule fois pour la
    // durée du fichier, sa réponse impulsionnelle n'est donc créée qu'au premier son.
  });

  it('« message » frappe une note, tous partiels confondus', () => {
    chime('message');
    expect(notes).toHaveLength(5);
    expect(lowest()).toBeCloseTo(587.33, 2);
    // Les partiels d'une même note partent tous ensemble.
    expect(new Set(notes.map((n) => n.at)).size).toBe(1);
  });

  it('« alert » enchaîne deux notes en quinte, la seconde en retard', () => {
    chime('alert');
    expect(notes).toHaveLength(10);
    const starts = [...new Set(notes.map((n) => n.at))].sort((a, b) => a - b);
    expect(starts).toHaveLength(2);
    // La seconde tombe pendant que la première résonne (décroissance 0,62 s).
    expect(starts[1] - starts[0]).toBeCloseTo(0.11, 3);
    const fondamentales = notes.filter((n) => n.freq < 900).map((n) => Math.round(n.freq));
    expect(fondamentales).toContain(587);
    expect(fondamentales).toContain(880);
  });

  it('une rafale ne donne qu’un son', () => {
    chime('message');
    const first = notes.length;
    chime('message');
    chime('message');
    expect(notes).toHaveLength(first);
  });

  it('une mention passe outre l’intervalle d’un message', () => {
    chime('message');
    const first = notes.length;
    vi.setSystemTime(clock + 500); // trop tôt pour un message, assez pour une alerte
    chime('alert');
    expect(notes.length).toBeGreaterThan(first);
  });

  it('la sourdine coupe tout', () => {
    setSoundMuted(true);
    chime('alert');
    previewChime();
    expect(notes).toHaveLength(0);
  });

  it('l’écoute de contrôle répond toujours, intervalle ou non', () => {
    chime('message');
    const first = notes.length;
    previewChime();
    expect(notes.length).toBeGreaterThan(first);
  });

  it('le déverrouillage se débranche du premier geste qui l’a servi', () => {
    // Un écouteur qui survivrait au geste rejouerait le déverrouillage à chaque
    // clic de la session, alors qu'il n'y a plus rien à déverrouiller.
    const listeners = new Map<string, Set<() => void>>();
    define('document', {
      addEventListener: (type: string, fn: () => void) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(fn);
      },
      removeEventListener: (type: string, fn: () => void) => void listeners.get(type)?.delete(fn),
    });
    const count = () => [...listeners.values()].reduce((n, set) => n + set.size, 0);

    armSound();
    expect(count()).toBe(2); // pointeur et clavier : le premier des deux suffira
    for (const fn of [...(listeners.get('pointerdown') ?? [])]) fn();
    expect(count()).toBe(0);
  });

  it('sans document, le déverrouillage est inerte', () => {
    Reflect.deleteProperty(globalThis, 'document');
    expect(() => armSound()()).not.toThrow();
  });

  it('la réverbération décroît au lieu de traîner', () => {
    chime('message');
    // Le premier tampon créé est la réponse impulsionnelle (stéréo).
    const ir = buffers.find((b) => b.length === 2);
    expect(ir).toBeDefined();
    const tail = ir![0];
    const peak = (from: number, to: number) =>
      Math.max(...Array.from(tail.subarray(from, to), Math.abs));
    const span = Math.floor(tail.length * 0.05);
    expect(peak(0, span)).toBeGreaterThan(peak(tail.length - span, tail.length));
  });
});
