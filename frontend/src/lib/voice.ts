/**
 * Message vocal — capture au micro, silhouette du son, durée.
 *
 * La SILHOUETTE (`peaks`) est relevée pendant l'enregistrement, à la source, et
 * voyage scellée dans l'enveloppe (cf. `lib/body.ts`). Deux raisons, et la
 * seconde est la vraie :
 *  - le destinataire redessine la forme sans toucher aux octets audio — aucun
 *    décodage, donc rien à payer à la réception ;
 *  - la forme d'une voix décrit son contenu : elle dit où l'on parle et où l'on
 *    se tait. Posée à côté de l'enveloppe, elle livrerait au serveur la découpe
 *    d'un message qu'il n'est pas censé pouvoir lire.
 *
 * Rien n'est stocké : les octets partent chiffrés puis relayés, comme toute
 * pièce jointe.
 */

/**
 * Barres de la silhouette. Trente-deux tiennent dans la bulle la plus étroite
 * (mobile) sans que la barre ne devienne plus fine que son écart, et le nombre
 * est le même aux deux bouts du fil : c'est ce qui permet de n'envoyer que les
 * hauteurs, sans les décrire.
 */
export const WAVE_BARS = 32;

/** Cadence de relevé. Assez fine pour que la barre suive la voix, assez lâche pour ne rien coûter. */
const SAMPLE_MS = 50;

/** Plafond de durée. Au-delà, un vocal n'est plus un tour de parole mais un monologue qu'on n'écoutera pas. */
export const MAX_VOICE_SECONDS = 180;

/**
 * Formats de capture, par ordre de préférence. Opus d'abord (le plus léger à
 * qualité de voix égale) ; `audio/mp4` est le repli de Safari, qui n'enregistre
 * pas en WebM.
 */
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/mp4'];

export type VoiceTake = {
  file: File;
  seconds: number;
  peaks: Uint8Array;
};

export type VoiceSession = {
  /** Termine la prise et rend le fichier prêt à joindre. */
  stop(): Promise<VoiceTake>;
  /** Abandonne : le micro est relâché, les octets ne quittent jamais la fonction. */
  cancel(): void;
};

export type VoiceOptions = {
  /** Appelé à chaque relevé : silhouette vive (les derniers instants) et durée écoulée. */
  onTick?: (peaks: number[], seconds: number) => void;
  /** Appelé quand le plafond de durée est atteint — la prise s'arrête d'elle-même. */
  onLimit?: () => void;
};

/** Format retenu par ce navigateur, ou `null` s'il n'enregistre pas d'audio. */
export function pickAudioMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const mime of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported?.(mime)) return mime;
  }
  // Un enregistreur sans type déclaré reste utilisable : il choisira le sien.
  return '';
}

/** Le navigateur sait-il enregistrer la voix ? Décide de l'affichage du bouton micro. */
export function canRecordVoice(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    pickAudioMime() !== null
  );
}

/**
 * Ramène un relevé de longueur quelconque aux `bars` hauteurs affichées.
 *
 * Maximum par intervalle, et non moyenne : une moyenne lisse les attaques et
 * rend toutes les voix semblables, alors que c'est le relief qui distingue un
 * mot d'un silence. La normalisation ramène ensuite la plus haute barre en haut
 * — sans elle, une voix douce donnerait une ligne plate. En deçà d'un plancher,
 * on ne normalise pas : un enregistrement réellement silencieux doit se voir
 * silencieux, pas être amplifié jusqu'à ressembler à de la parole.
 */
export function resamplePeaks(raw: readonly number[], bars = WAVE_BARS): Uint8Array {
  const out = new Uint8Array(bars);
  if (!raw.length) return out;

  for (let i = 0; i < bars; i++) {
    const from = Math.floor((i * raw.length) / bars);
    const to = Math.max(from + 1, Math.floor(((i + 1) * raw.length) / bars));
    let peak = 0;
    for (let j = from; j < to && j < raw.length; j++) {
      if (raw[j] > peak) peak = raw[j];
    }
    out[i] = Math.min(255, Math.max(0, Math.round(peak)));
  }

  let max = 0;
  for (const v of out) if (v > max) max = v;
  if (max >= 12) {
    const scale = 255 / max;
    for (let i = 0; i < bars; i++) out[i] = Math.min(255, Math.round(out[i] * scale));
  }
  return out;
}

/**
 * Silhouette compactée pour le fil : 4 bits par barre, deux barres par octet,
 * en base64 url-safe.
 *
 * Seize niveaux sont indiscernables à l'œil sur une barre de 3 px, et cette
 * économie a une conséquence concrète : le corps scellé tient dans le premier
 * bloc de bourrage de 256 octets (cf. `lib/crypto`). Une silhouette plus fine
 * ferait grossir le ciphertext sans rien montrer de plus.
 */
export function packPeaks(peaks: Uint8Array): string {
  const bytes = new Uint8Array(Math.ceil(peaks.length / 2));
  for (let i = 0; i < peaks.length; i++) {
    const nibble = peaks[i] >> 4;
    if (i % 2 === 0) bytes[i >> 1] = nibble << 4;
    else bytes[i >> 1] |= nibble;
  }
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Silhouette relue depuis le fil, ou `null` si elle est absente ou abîmée. */
export function unpackPeaks(packed: string, bars = WAVE_BARS): Uint8Array | null {
  if (!packed) return null;
  try {
    const bin = atob(packed.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(bars);
    for (let i = 0; i < bars; i++) {
      const byte = bin.charCodeAt(i >> 1);
      if (Number.isNaN(byte)) break;
      const nibble = i % 2 === 0 ? byte >> 4 : byte & 0x0f;
      // Recentré dans son palier : une barre pleine doit se lire pleine.
      out[i] = (nibble << 4) | (nibble ? 0x0f : 0);
    }
    return out;
  } catch {
    // Une silhouette illisible n'empêche pas d'écouter : l'appelant dessinera
    // une forme neutre plutôt que de refuser le message.
    return null;
  }
}

/** Durée parlée, en minutes et secondes — la forme qu'on lit sur un lecteur. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Durée dite en toutes lettres, pour les lecteurs d'écran. */
export function spokenDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const min = Math.floor(total / 60);
  const sec = total % 60;
  const parts = [];
  if (min) parts.push(`${min} minute${min > 1 ? 's' : ''}`);
  if (sec || !min) parts.push(`${sec} seconde${sec > 1 ? 's' : ''}`);
  return parts.join(' ');
}

/**
 * Ouvre le micro et commence à enregistrer.
 *
 * Lève si l'accès est refusé ou indisponible — l'appelant le dit à l'écran, il
 * est le seul à savoir où le message a sa place.
 */
export async function startVoiceRecording(opts: VoiceOptions = {}): Promise<VoiceSession> {
  const mime = pickAudioMime();
  if (mime === null) throw new Error("Ce navigateur n'enregistre pas l'audio.");

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });

  // À partir d'ici le micro est ouvert : tout chemin de sortie doit le relâcher.
  let audioCtx: AudioContext | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let recorder: MediaRecorder;

  const release = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
    for (const track of stream.getTracks()) track.stop();
    audioCtx?.close().catch(() => {});
    audioCtx = null;
  };

  try {
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  } catch (e) {
    release();
    throw e;
  }

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };

  const raw: number[] = [];
  const startedAt = performance.now();
  const elapsed = () => (performance.now() - startedAt) / 1000;

  // Relevé d'amplitude : l'écart au repos (128) du signal temporel, ce qui donne
  // le volume instantané sans passer par une analyse fréquentielle dont on n'a
  // que faire pour dessiner une barre.
  try {
    audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);

    timer = setInterval(() => {
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) {
        const d = Math.abs(v - 128);
        if (d > peak) peak = d;
      }
      raw.push(Math.min(255, peak * 2));
      // La barre vive montre les derniers instants, pas toute la prise : c'est
      // ce défilement qui dit « ça écoute maintenant ». La forme d'ensemble
      // n'apparaît qu'à l'arrêt, une fois la prise devenue un objet.
      opts.onTick?.(raw.slice(-WAVE_BARS), elapsed());
      if (elapsed() >= MAX_VOICE_SECONDS) opts.onLimit?.();
    }, SAMPLE_MS);
  } catch {
    // Sans analyse, on enregistre quand même : la silhouette sera plate, le
    // message reste audible. Perdre la forme ne vaut pas perdre la voix.
  }

  recorder.start();

  return {
    stop() {
      return new Promise<VoiceTake>((resolve, reject) => {
        const seconds = elapsed();
        const peaks = resamplePeaks(raw);
        recorder.onstop = () => {
          release();
          const type = recorder.mimeType || mime || 'audio/webm';
          const blob = new Blob(chunks, { type });
          // Extension alignée sur le conteneur : le fichier ne sert qu'à traverser
          // la même porte que les autres pièces jointes, mais un nom cohérent évite
          // qu'un téléchargement arrive sans rien pour l'ouvrir.
          const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
          resolve({ file: new File([blob], `vocal.${ext}`, { type }), seconds, peaks });
        };
        recorder.onerror = () => {
          release();
          reject(new Error("L'enregistrement a échoué."));
        };
        try {
          recorder.stop();
        } catch (e) {
          release();
          reject(e as Error);
        }
      });
    },
    cancel() {
      // Aucun `onstop` : les morceaux déjà collectés meurent avec la fonction.
      recorder.onstop = null;
      try {
        if (recorder.state !== 'inactive') recorder.stop();
      } catch {
        /* déjà arrêté */
      }
      release();
    },
  };
}
