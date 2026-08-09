import { onUnmounted, ref, shallowRef } from 'vue';
import { startVoiceRecording, type VoiceSession, type VoiceTake } from '../lib/voice';
import { store } from '../store/useStore';

/**
 * Prise de son du champ de saisie.
 *
 * Trois états, et le passage de l'un à l'autre est tout le propos : on capture,
 * puis on ÉCOUTE ce qu'on vient de dire, puis seulement on envoie. Un vocal est
 * plus exposant qu'une phrase tapée — on ne peut ni le relire du coin de l'œil
 * ni le corriger après coup —, donc il suit la même règle que le collage :
 * un arrêt avant l'envoi, jamais de départ au relâchement du doigt.
 */
export type VoiceState = 'idle' | 'recording' | 'ready';

/** Ce que le micro a refusé, dit à la personne qui peut y remédier. */
function micError(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return "Micro refusé. Autorisez l'accès au micro dans votre navigateur, puis réessayez.";
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'Aucun micro détecté sur cet appareil.';
  if (name === 'NotReadableError') return "Le micro est déjà utilisé par une autre application.";
  return "Le micro n'a pas pu démarrer.";
}

export function useVoiceRecorder() {
  const state = ref<VoiceState>('idle');
  /** Silhouette vive pendant la capture — les derniers instants, pas toute la prise. */
  const livePeaks = shallowRef<number[]>([]);
  const seconds = ref(0);
  const take = shallowRef<VoiceTake | null>(null);
  /** Aperçu écoutable de la prise en attente. */
  const previewUrl = ref('');

  let session: VoiceSession | null = null;
  /**
   * Abandon demandé avant que le micro ne se soit ouvert. L'autorisation est une
   * boîte de dialogue du navigateur : on peut renoncer pendant qu'elle est à
   * l'écran, et il ne faut pas qu'une prise commence dans son dos.
   */
  let aborted = false;

  function dropPreview() {
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
    previewUrl.value = '';
    take.value = null;
  }

  async function start() {
    if (state.value !== 'idle') return;
    aborted = false;
    state.value = 'recording';
    seconds.value = 0;
    livePeaks.value = [];
    try {
      const started = await startVoiceRecording({
        onTick: (peaks, elapsed) => {
          livePeaks.value = peaks;
          seconds.value = elapsed;
        },
        // Le plafond atteint, la prise se ferme d'elle-même et se présente à
        // l'écoute : ce qui a été dit n'est pas perdu, c'est la suite qui manque.
        onLimit: () => void finish(),
      });
      if (aborted) return started.cancel();
      session = started;
    } catch (e) {
      state.value = 'idle';
      session = null;
      store().showToast(micError(e), 'warn');
    }
  }

  async function finish() {
    if (state.value !== 'recording' || !session) return;
    const current = session;
    session = null;
    try {
      const result = await current.stop();
      dropPreview();
      take.value = result;
      previewUrl.value = URL.createObjectURL(result.file);
      seconds.value = result.seconds;
      state.value = 'ready';
    } catch (e) {
      state.value = 'idle';
      store().showToast(micError(e), 'warn');
    }
  }

  /** Renonce, à n'importe quel stade : rien n'a quitté cette fonction. */
  function discard() {
    aborted = true;
    session?.cancel();
    session = null;
    dropPreview();
    livePeaks.value = [];
    seconds.value = 0;
    state.value = 'idle';
  }

  onUnmounted(discard);

  return { state, livePeaks, seconds, take, previewUrl, start, finish, discard };
}
