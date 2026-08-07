import { onScopeDispose, ref, type Ref } from 'vue';
import { currentPath, subscribeRoute } from '../lib/router';

/**
 * Chemin courant, réactif. Équivalent Vue du `useSyncExternalStore(subscribeRoute,
 * currentPath)` d'origine : la source de vérité reste `lib/router.ts`, ce
 * composable ne fait que la refléter dans une ref.
 */
export function useRoute(): Ref<string> {
  const route = ref(currentPath());
  const unsubscribe = subscribeRoute(() => {
    route.value = currentPath();
  });
  onScopeDispose(unsubscribe);
  return route;
}
