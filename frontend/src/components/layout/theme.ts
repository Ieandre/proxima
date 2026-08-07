import { onMounted, onUnmounted, ref, type Ref } from 'vue';
import {
  applyTheme,
  recallTheme,
  rememberTheme,
  resolveTheme,
  watchSystemTheme,
  type Theme,
} from '../../lib/theme';

/* Le thème vit hors du store : il est posé avant le premier rendu, et `reset()`
   purge le store en fin de session — ce qui rejouerait l'apparence en pleine
   navigation. La barre n'en garde donc qu'un reflet local. */
export function useTheme(): readonly [Ref<Theme>, () => void] {
  const theme = ref<Theme>(resolveTheme());

  // Le système change d'avis (coucher du soleil, réglage modifié ailleurs) : on ne
  // le suit que faute de choix exprimé — sinon la bascule manuelle serait annulée.
  let stop: (() => void) | undefined;
  onMounted(() => {
    stop = watchSystemTheme((system) => {
      if (recallTheme() !== null) return;
      applyTheme(system);
      theme.value = system;
    });
  });
  onUnmounted(() => stop?.());

  return [
    theme,
    () => {
      const next: Theme = theme.value === 'dark' ? 'light' : 'dark';
      rememberTheme(next);
      applyTheme(next);
      theme.value = next;
    },
  ] as const;
}
