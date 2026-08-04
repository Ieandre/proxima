/**
 * Son de notification — synthétisé à la volée, jamais téléchargé.
 *
 * Un fichier audio aurait été plus simple à écrire, mais il coûte un asset à
 * servir, une entrée `media-src` de plus dans la CSP, et surtout il n'est plus
 * réglable : la moindre retouche du timbre demande de repasser par un éditeur.
 * Ici tout est paramétré — hauteurs, partiels, enveloppes, réverbération — et la
 * voix ne pèse rien dans le bundle.
 *
 * Le timbre visé est celui d'un glockenspiel doux : c'est ce qui distingue un
 * vrai son de notification d'un bip. Trois ingrédients y suffisent, et aucun
 * n'est décoratif :
 *
 *  - des **partiels aux décroissances distinctes** (les aigus s'éteignent bien
 *    avant le fondamental) — sans cela, l'oreille entend un oscillateur qui
 *    s'arrête, pas un objet qu'on a frappé ;
 *  - un **bruit de maillet** de 30 ms au tout début, qui donne le contact ;
 *  - une **réverbération courte**, générée depuis un bruit décroissant, qui pose
 *    le son dans un lieu au lieu de le laisser à sec contre le haut-parleur.
 *
 * Deux voix seulement, dans la même tonalité pour qu'elles restent le même
 * instrument : `message` (une note) pour un salon qui passe, `alert` (quinte
 * ascendante) quand quelqu'un s'adresse à nous — MP ou mention.
 */

export type Chime = 'message' | 'alert';

/* ---- Préférence -------------------------------------------------------- */

/* `sessionStorage` et pas `localStorage`, même doctrine que `theme.ts` : une clé
   qui survit à la visite rendrait fausse la promesse « vous fermez l'onglet, il
   ne reste rien ». Le son revient donc actif à la visite suivante, ce qui est de
   toute façon le réglage attendu d'une messagerie. */
const KEY = 'proxima:sound';

/** Peut lever à la seule lecture (Safari en navigation privée, tests) — l'absence
 *  de mémoire n'est pas une erreur, on retombe sur le défaut. */
function store(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/** Le son est actif par défaut ; seul un « off » explicite le coupe. */
export function soundMuted(): boolean {
  try {
    return store()?.getItem(KEY) === 'off';
  } catch {
    return false;
  }
}

export function setSoundMuted(muted: boolean): void {
  try {
    if (muted) store()?.setItem(KEY, 'off');
    else store()?.removeItem(KEY);
  } catch {
    /* stockage refusé : le choix vaudra pour cette page seulement */
  }
}

/* ---- Voix -------------------------------------------------------------- */

/** Attaque, plancher d'enveloppe (une rampe exponentielle n'atteint jamais 0). */
const ATTACK = 0.004;
const FLOOR = 0.0005;

/**
 * Partiels de la voix : `[rapport à la fondamentale, amplitude, décroissance]`.
 *
 * Les rapports supérieurs sont très légèrement désaccordés (3,01 plutôt que 3) :
 * un empilement parfaitement harmonique sonne synthétique, ce décalage d'un
 * centième donne le grain du métal frappé sans partir dans le cloche d'église.
 * Les décroissances sont décroissantes elles aussi — c'est là que se joue le
 * réalisme : le son s'ouvre brillant puis se retire sur une sinusoïde pure.
 */
const PARTIALS: ReadonlyArray<readonly [ratio: number, amp: number, decay: number]> = [
  [1, 1, 0.62],
  [2, 0.32, 0.34],
  [3.01, 0.11, 0.2],
  [4.03, 0.055, 0.13],
  [6.05, 0.025, 0.08],
];

/**
 * Les deux motifs. `at` est le retard de la note, en secondes.
 *
 * La seconde note de `alert` tombe pendant que la première résonne encore : les
 * deux se superposent en un accord au lieu de se succéder — c'est ce qui fait
 * qu'un motif de deux notes s'entend comme un geste et non comme deux bips. La
 * quinte ascendante (ré → la) est le geste montant le plus neutre qui soit ;
 * `message` part de la même fondamentale, donc du même instrument.
 */
const VOICES: Record<Chime, ReadonlyArray<{ freq: number; at: number; gain: number; pan: number }>> = {
  message: [{ freq: 587.33, at: 0, gain: 0.16, pan: 0 }],
  alert: [
    { freq: 587.33, at: 0, gain: 0.15, pan: -0.12 },
    { freq: 880, at: 0.11, gain: 0.13, pan: 0.12 },
  ],
};

/* Intervalle minimal entre deux sons. Sans lui, un salon animé mitraille : dix
   messages en rafale donneraient dix sons. Ce qui s'adresse à nous a droit à un
   seuil plus court — une mention ne doit pas être avalée par le passage d'un
   salon juste avant. */
const GAP: Record<Chime, number> = { message: 1400, alert: 400 };

/* ---- Graphe audio ------------------------------------------------------ */

type Rig = { ctx: AudioContext; dry: GainNode; wet: GainNode };

let rig: Rig | null = null;
let mallet: AudioBuffer | null = null;
let lastAt = 0;

/**
 * Réponse impulsionnelle de la réverbération : un bruit qui décroît.
 *
 * L'exposant fait tout. En rampe linéaire la queue s'entend comme un « shhh » de
 * bruit blanc ; élevée à la puissance ~3 elle se resserre en une réverbération
 * de petite pièce, qui accompagne le son sans se faire remarquer. Les deux
 * canaux sont tirés séparément, ce qui suffit à ouvrir l'image stéréo.
 */
function impulse(ctx: AudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * 1.1);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3.2);
    }
  }
  return buffer;
}

/** Bruit court réutilisé par chaque coup de maillet. */
function malletNoise(ctx: AudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * 0.05);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/**
 * Monte le graphe une fois pour toutes : deux départs (direct et réverbéré) vers
 * un même maître. Le contexte est créé paresseusement, au premier son — donc
 * bien après le clic « Entrer », ce qui le fait naître déjà autorisé par la
 * politique de lecture automatique des navigateurs.
 *
 * Il est ensuite gardé en vie pour la durée de la session : sans nœud programmé
 * il ne coûte presque rien, alors qu'un contexte suspendu puis réveillé est le
 * moyen le plus sûr de rendre les notifications muettes sur iOS.
 */
function graph(): Rig | null {
  if (rig) return rig;
  try {
    const Ctor =
      globalThis.AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();

    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);

    const dry = ctx.createGain();
    dry.gain.value = 0.85;
    dry.connect(master);

    // Départ réverbéré, filtré AVANT la convolution : la queue doit être plus
    // sourde que le son direct (sinon les partiels aigus traînent et sifflent) et
    // sans grave, qui n'y apporterait que de la boue.
    const wet = ctx.createGain();
    wet.gain.value = 0.3;
    const cut = ctx.createBiquadFilter();
    cut.type = 'highpass';
    cut.frequency.value = 280;
    const dark = ctx.createBiquadFilter();
    dark.type = 'lowpass';
    dark.frequency.value = 3200;
    const hall = ctx.createConvolver();
    hall.buffer = impulse(ctx);
    wet.connect(cut).connect(dark).connect(hall).connect(master);

    mallet = malletNoise(ctx);
    rig = { ctx, dry, wet };
    return rig;
  } catch {
    // Web Audio indisponible ou refusé : pas de son, et surtout pas d'erreur —
    // l'interface prévient déjà par la pastille de non-lus et le titre d'onglet.
    return null;
  }
}

/** Une note frappée : partiels sous enveloppe, plus le contact du maillet. */
function strike(
  { ctx, dry, wet }: Rig,
  { freq, at, gain, pan }: { freq: number; at: number; gain: number; pan: number },
): void {
  const voice = ctx.createGain();
  voice.gain.value = gain;

  // Panoramique léger : les deux notes du motif ne sortent pas du même point, ce
  // qui leur donne une largeur que le mono n'a pas. Absent des vieux Safari — on
  // branche alors en direct, le son y est simplement centré.
  let head: AudioNode = voice;
  if (typeof ctx.createStereoPanner === 'function') {
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    voice.connect(panner);
    head = panner;
  }
  head.connect(dry);
  head.connect(wet);

  for (const [ratio, amp, decay] of PARTIALS) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq * ratio;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(amp, at + ATTACK);
    env.gain.exponentialRampToValueAtTime(FLOOR, at + decay);
    // La rampe exponentielle s'arrête au plancher, pas à zéro : sans ce dernier
    // segment linéaire, couper l'oscillateur produirait un clic.
    env.gain.linearRampToValueAtTime(0, at + decay + 0.01);

    osc.connect(env).connect(voice);
    osc.start(at);
    osc.stop(at + decay + 0.03);
  }

  if (!mallet) return;
  const hit = ctx.createBufferSource();
  hit.buffer = mallet;
  const body = ctx.createBiquadFilter();
  body.type = 'bandpass';
  body.frequency.value = freq * 4;
  body.Q.value = 0.7;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(0.07, at + 0.002);
  env.gain.exponentialRampToValueAtTime(FLOOR, at + 0.03);
  hit.connect(body).connect(env).connect(voice);
  hit.start(at);
  hit.stop(at + 0.05);
}

/** Joue un motif, sans condition — le tri est fait par les appelants. */
function ring(kind: Chime): void {
  const r = graph();
  if (!r) return;
  const { ctx } = r;

  // L'onglet a pu être ouvert avant tout geste (reprise de session, lien direct) :
  // le contexte naît alors suspendu. Les notes programmées pendant la suspension
  // ne sont pas perdues, l'horloge est simplement à l'arrêt — elles sortiront au
  // réveil. On n'attend donc pas la promesse.
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});

  const start = ctx.currentTime + 0.02;
  for (const note of VOICES[kind]) strike(r, { ...note, at: start + note.at });
}

/**
 * Signale un message. Silencieux si le son est coupé ou si l'on vient tout juste
 * de sonner.
 */
export function chime(kind: Chime = 'message'): void {
  if (soundMuted()) return;
  const now = Date.now();
  if (now - lastAt < GAP[kind]) return;
  lastAt = now;
  ring(kind);
}

/**
 * Fait entendre le son au moment où on le rétablit : un réglage sonore qui ne
 * s'entend pas oblige à attendre un message pour savoir ce qu'on a réglé. Passe
 * outre l'intervalle minimal — le geste est délibéré, il doit toujours répondre.
 */
export function previewChime(): void {
  if (soundMuted()) return;
  lastAt = Date.now();
  ring('alert');
}

/**
 * Déverrouille l'audio au premier geste de la visite, et se débranche aussitôt.
 *
 * Sans cela, les notifications seraient muettes sur iOS pour toute la session :
 * Safari n'autorise un contexte audio que s'il est créé ou réveillé PENDANT une
 * interaction. Or le premier son arrive par définition sans geste — c'est un
 * message reçu. Monter le graphe au premier clic (n'importe lequel : le formulaire
 * d'entrée, un salon, une touche) le fait naître autorisé, et il le reste.
 *
 * L'écouteur est passif et à usage unique : il ne coûte rien et ne survit pas au
 * geste qui l'a consommé.
 */
export function armSound(): () => void {
  const target = globalThis.document;
  if (!target?.addEventListener) return () => {};

  const unlock = () => {
    const r = graph();
    if (r && r.ctx.state === 'suspended') void r.ctx.resume().catch(() => {});
    off();
  };
  const off = () => {
    target.removeEventListener('pointerdown', unlock);
    target.removeEventListener('keydown', unlock);
  };

  target.addEventListener('pointerdown', unlock, { once: true, passive: true });
  target.addEventListener('keydown', unlock, { once: true });
  return off;
}
