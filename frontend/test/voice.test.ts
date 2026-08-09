import { describe, expect, it } from 'vitest';
import {
  canRecordVoice,
  formatDuration,
  packPeaks,
  pickAudioMime,
  resamplePeaks,
  spokenDuration,
  unpackPeaks,
  WAVE_BARS,
} from '../src/lib/voice';

describe('silhouette du son', () => {
  it('ramène un relevé de longueur quelconque au nombre de barres affichées', () => {
    expect(resamplePeaks(new Array(1000).fill(40)).length).toBe(WAVE_BARS);
    expect(resamplePeaks([9]).length).toBe(WAVE_BARS);
    expect(resamplePeaks([]).length).toBe(WAVE_BARS);
  });

  it('retient le maximum de chaque intervalle : une attaque brève ne se fait pas lisser', () => {
    // Un pic isolé au milieu d'un relevé calme doit rester visible sur sa barre —
    // une moyenne l'aurait noyé et toutes les voix se ressembleraient.
    const raw = new Array(320).fill(10);
    raw[160] = 200;
    const out = resamplePeaks(raw);
    expect(Math.max(...out)).toBe(255); // normalisé au sommet
    expect(out.filter((v) => v === 255).length).toBe(1);
  });

  it('normalise vers le haut : une voix douce ne donne pas une ligne plate', () => {
    const out = resamplePeaks(new Array(200).fill(30));
    expect(Math.max(...out)).toBe(255);
  });

  it("un enregistrement silencieux reste silencieux (pas d'amplification du bruit)", () => {
    const out = resamplePeaks(new Array(200).fill(3));
    expect(Math.max(...out)).toBeLessThan(12);
  });

  it('borne les valeurs hors plage plutôt que de les propager', () => {
    const out = resamplePeaks([-50, 900, 10]);
    for (const v of out) expect(v).toBeGreaterThanOrEqual(0);
    for (const v of out) expect(v).toBeLessThanOrEqual(255);
  });
});

describe('silhouette compactée pour le fil', () => {
  it('aller-retour : la forme survit à la quantification 4 bits', () => {
    const peaks = resamplePeaks(Array.from({ length: 300 }, (_, i) => (i * 7) % 256));
    const back = unpackPeaks(packPeaks(peaks));
    expect(back).not.toBeNull();
    expect(back!.length).toBe(WAVE_BARS);
    // Seize niveaux : chaque hauteur revient dans son palier, jamais ailleurs.
    for (let i = 0; i < WAVE_BARS; i++) expect(Math.abs(back![i] - peaks[i])).toBeLessThanOrEqual(15);
  });

  it('forme base64 url-safe et sans remplissage (comme le reste du fil)', () => {
    expect(packPeaks(resamplePeaks(new Array(64).fill(200)))).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('reste compacte : une silhouette pèse moins qu\'un identifiant de message', () => {
    // C'est ce qui lui permet de tenir dans le premier bloc de bourrage de
    // 256 octets, donc de ne pas faire grossir le ciphertext (cf. `lib/crypto`).
    expect(packPeaks(resamplePeaks(new Array(500).fill(180))).length).toBeLessThanOrEqual(24);
  });

  it('silhouette absente ou abîmée : rien, plutôt qu\'une forme inventée', () => {
    expect(unpackPeaks('')).toBeNull();
    // Une chaîne tronquée donne une forme partielle, jamais une exception : le
    // message reste écoutable même si sa silhouette est perdue.
    expect(unpackPeaks('AA')).toBeInstanceOf(Uint8Array);
  });
});

describe('durée', () => {
  it('affichée en minutes et secondes', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(7.4)).toBe('0:07');
    expect(formatDuration(83)).toBe('1:23');
    expect(formatDuration(600)).toBe('10:00');
  });

  it('jamais de durée négative au compteur', () => {
    expect(formatDuration(-5)).toBe('0:00');
  });

  it('dite en toutes lettres pour les lecteurs d\'écran', () => {
    expect(spokenDuration(1)).toBe('1 seconde');
    expect(spokenDuration(7)).toBe('7 secondes');
    expect(spokenDuration(60)).toBe('1 minute');
    expect(spokenDuration(83)).toBe('1 minute 23 secondes');
    expect(spokenDuration(0)).toBe('0 seconde');
  });
});

describe('capacité du navigateur', () => {
  it('sans MediaRecorder, le micro ne se propose pas', () => {
    // L'environnement de test n'en a pas : c'est exactement le cas qu'on veut
    // voir traité — un bouton qui n'ouvrirait rien ne doit pas s'afficher.
    expect(pickAudioMime()).toBeNull();
    expect(canRecordVoice()).toBe(false);
  });
});
