<script setup lang="ts">
import { computed, ref } from 'vue';
import { isOnionOrigin } from '../../lib/onion';
import { useStore } from '../../store/useStore';
import { Icon } from '../ui';

/* ==========================================================================
 * Accès par le service onion Tor.
 *
 * Deux règles de comportement, l'une et l'autre délibérées :
 *
 *  - masquée quand on est DÉJÀ sur l'onion — proposer à quelqu'un l'adresse de la
 *    page qu'il consulte est du bruit ;
 *  - l'adresse n'est PAS un lien. Un `<a href="http://…onion">` depuis un
 *    navigateur ordinaire produit une erreur de résolution : un clic qui échoue.
 *    On la donne à copier, pas à cliquer.
 * ======================================================================== */

const st = useStore();
const onionHost = computed(() => st.legal?.onionHost);
const copied = ref(false);

// Adresse absente (non configurée, ou `/api/legal` pas encore revenu) : rien à
// annoncer. Sur l'onion, la mention n'a pas lieu d'être.
const onOnion = isOnionOrigin();

const copy = () => {
  navigator.clipboard?.writeText(onionHost.value || '').then(
    () => {
      copied.value = true;
      setTimeout(() => (copied.value = false), 2000);
    },
    () => {},
  );
};
</script>

<template>
  <p v-if="onionHost && !onOnion" class="footer__onion">
    <span class="footer__onion-label"> <Icon name="shield" :size="12" /> Accès Tor </span>
    <!-- L'adresse complète, jamais tronquée : le préfixe `proxima` est lisible,
         donc imitable — c'est la fin qui distingue la vraie adresse d'une copie. -->
    <code class="footer__onion-addr">{{ onionHost }}</code>
    <button type="button" class="footer__onion-copy" aria-label="Copier l'adresse onion" @click="copy">
      {{ copied ? 'Copié' : 'Copier' }}
    </button>
  </p>
</template>
