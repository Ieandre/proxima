<script setup lang="ts">
import { computed, ref } from 'vue';
import sodium from 'libsodium-wrappers';
import { PAD, type Party } from './about-demo';
import Gauge from './Gauge.vue';
import Lane from './Lane.vue';

const props = defineProps<{ alice: Party; bob: Party }>();

const text = ref('oui');
const presets = ['ok', 'à ce soir alors', 'un message nettement plus long que les précédents pour la démonstration'];

const sizes = computed(() => {
  const plain = sodium.from_string(text.value || '');
  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
  const ct = sodium.crypto_box_easy(sodium.pad(plain, PAD), nonce, props.bob.publicKey, props.alice.privateKey);
  return { plainBytes: plain.length, ctBytes: ct.length };
});
</script>

<template>
  <div>
    <label class="mb-1.5 block text-xs font-medium text-muted">Votre message</label>
    <input class="input mb-2" v-model="text" maxlength="2000" />
    <div class="mb-4 flex flex-wrap gap-1.5">
      <button v-for="p in presets" :key="p" class="chip cursor-pointer hover:border-blue" @click="text = p">
        {{ p.length > 22 ? p.slice(0, 22) + '…' : p }}
      </button>
    </div>

    <div class="grid gap-3 sm:grid-cols-2">
      <Lane label="Longueur réelle du message" icon="hash" tone="neutral">
        <Gauge :value="sizes.plainBytes" :max="300" unit="octets" color="var(--color-faint)" />
      </Lane>
      <Lane label="Taille transmise au serveur" icon="radar" tone="ok">
        <Gauge :value="sizes.ctBytes" :max="600" unit="octets" color="var(--color-blue)" />
      </Lane>
    </div>
    <p class="mt-3 text-[12.5px] leading-snug text-muted">
      Tant que votre message tient dans un bloc, la taille transmise reste <strong class="text-ink">constante</strong>
      ({{ sizes.ctBytes }} octets). Le serveur ne peut donc pas distinguer «&nbsp;oui&nbsp;» d'une phrase entière.
    </p>
  </div>
</template>
