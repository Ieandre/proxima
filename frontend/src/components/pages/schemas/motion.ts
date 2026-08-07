import { onMounted, onUnmounted, ref, type Ref } from 'vue';
// (`useReveal` ne crée plus sa ref : il observe la ref de template qu'on lui passe.)

/* ---- Composables ------------------------------------------------------- */

/** Révèle l'élément quand il entre dans le viewport (pose la classe « in »). */
export function useReveal(el: Readonly<Ref<HTMLElement | null>>): void {
  let io: IntersectionObserver | null = null;
  onMounted(() => {
    const node = el.value;
    if (!node) return;
    if (!('IntersectionObserver' in window)) {
      node.classList.add('in');
      return;
    }
    io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            node.classList.add('in');
            io?.unobserve(node);
          }
        });
      },
      { threshold: 0.16, rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(node);
  });
  onUnmounted(() => io?.disconnect());
}

export function usePrefersReducedMotion(): Ref<boolean> {
  const reduced = ref(false);
  let mq: MediaQueryList | null = null;
  const sync = () => {
    reduced.value = mq?.matches ?? false;
  };
  onMounted(() => {
    mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    sync();
    mq.addEventListener('change', sync);
  });
  onUnmounted(() => mq?.removeEventListener('change', sync));
  return reduced;
}
