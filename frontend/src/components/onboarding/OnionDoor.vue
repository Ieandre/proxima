<script setup lang="ts">
import { computed, ref } from 'vue';
import { useStore } from '../../store/useStore';
import { isOnionOrigin } from '../../lib/onion';
import { Icon } from '../ui';

const st = useStore();
const onionHost = computed(() => st.legal?.onionHost);
const copied = ref(false);

// Rien à annoncer sans adresse configurée ; et sur l'onion, proposer l'adresse
// de la page qu'on consulte serait du bruit.
const onOnion = isOnionOrigin();

const copy = () => {
  navigator.clipboard?.writeText(onionHost.value ?? '').then(
    () => {
      copied.value = true;
      setTimeout(() => (copied.value = false), 2200);
    },
    () => {},
  );
};

/* Cycle de vie d'une identité de session : trois moments dans l'ordre où ils arrivent.
   Ce n'est pas une liste d'arguments mais une chronologie — l'ordre porte le sens, et
   l'épine dorsale s'efface au dernier repère (la donnée ne survit pas à l'onglet). */
</script>

<template>
  <section v-if="onionHost && !onOnion" class="onion-door fade-up" :style="{ animationDelay: '440ms' }">
    <span class="onion-door__label">
      <Icon name="shield" :size="12" />
      Accès Tor
    </span>
    <p class="onion-door__body">
      Votre adresse IP arrive jusqu'à nos serveurs, comme sur n'importe quel site. Par le réseau Tor, elle n'y
      arrive <strong>pas du tout</strong>.
    </p>
    <!-- Adresse à copier, jamais un lien : depuis un navigateur ordinaire, un
        href vers .onion produit une erreur de résolution, donc un clic qui échoue. -->
    <div class="onion-door__row">
      <code class="onion-door__addr">{{ onionHost }}</code>
      <button type="button" class="onion-door__copy" aria-label="Copier l’adresse onion" @click="copy">
        <Icon :name="copied ? 'check' : 'copy'" :size="12" />
        {{ copied ? 'Copié' : 'Copier' }}
      </button>
    </div>
  </section>
</template>
