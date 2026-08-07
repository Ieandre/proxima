<script setup lang="ts">
import { computed, ref } from 'vue';
import sodium from 'libsodium-wrappers';
import type { Party } from './about-demo';
import { Icon } from '../ui';
import Lane from './Lane.vue';

const props = defineProps<{ alice: Party; bob: Party; mitm: Party }>();

function safetyNumber(a: Uint8Array, b: Uint8Array): string {
  const [x, y] = sodium.compare(a, b) <= 0 ? [a, b] : [b, a];
  const cat = new Uint8Array(x.length + y.length);
  cat.set(x, 0);
  cat.set(y, x.length);
  return sodium.to_hex(sodium.crypto_generichash(16, cat, null)).toUpperCase().replace(/(.{4})(?=.)/g, '$1 ');
}

const intercepted = ref(false);

const state = computed(() => {
  if (!intercepted.value) {
    const v = safetyNumber(props.alice.publicKey, props.bob.publicKey);
    return { aliceSees: v, bobSees: v, match: true };
  }
  // Un intercepteur présente SA clé à chacun : les deux calculent une empreinte différente.
  const a = safetyNumber(props.alice.publicKey, props.mitm.publicKey);
  const b = safetyNumber(props.bob.publicKey, props.mitm.publicKey);
  return { aliceSees: a, bobSees: b, match: a === b };
});
</script>

<template>
  <div>
    <div class="mb-4 inline-flex rounded-xl border border-line bg-paper-2 p-1 text-sm">
      <button
        type="button"
        @click="intercepted = false"
        :class="`rounded-lg px-3 py-1.5 font-semibold transition-colors ${!intercepted ? 'bg-card text-blue shadow-sm' : 'text-muted'}`"
      >
        Connexion normale
      </button>
      <button
        type="button"
        @click="intercepted = true"
        :class="`rounded-lg px-3 py-1.5 font-semibold transition-colors ${intercepted ? 'bg-card text-danger shadow-sm' : 'text-muted'}`"
      >
        Avec un intercepteur
      </button>
    </div>

    <div class="grid gap-3 sm:grid-cols-2">
      <Lane label="Empreinte vue par Alice" icon="lock" tone="neutral">
        <p class="break-all font-mono text-[12px] tracking-wider text-ink">{{ state.aliceSees }}</p>
      </Lane>
      <Lane label="Empreinte vue par Bob" icon="lock" tone="neutral">
        <p class="break-all font-mono text-[12px] tracking-wider text-ink">{{ state.bobSees }}</p>
      </Lane>
    </div>

    <div
      class="mt-3 flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-semibold"
      :style="{
        borderColor: state.match
          ? 'color-mix(in srgb, var(--color-verified) 35%, transparent)'
          : 'color-mix(in srgb, var(--color-danger) 35%, transparent)',
        background: state.match ? 'var(--color-verified-tint)' : 'var(--color-danger-tint)',
        color: state.match ? 'var(--color-verified)' : 'var(--color-danger)',
      }"
    >
      <Icon :name="state.match ? 'check' : 'close'" :size="16" />
      {{ state.match
        ? 'Les empreintes correspondent — personne ne s’est intercalé.'
        : 'Les empreintes diffèrent — une interception est détectée !' }}
    </div>
    <p class="mt-2 text-[12.5px] leading-snug text-muted">
      {{ intercepted
        ? "L'intercepteur ne peut pas forger une empreinte identique des deux côtés : la comparaison de vive voix le trahit."
        : 'En vous lisant ce code à voix haute, vous confirmez que vos clés n’ont pas été substituées.' }}
    </p>
  </div>
</template>
