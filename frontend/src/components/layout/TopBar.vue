<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useStore } from '../../store/useStore';
import { Icon, Logo } from '../ui';
import SoundToggle from './SoundToggle.vue';
import ThemeToggle from './ThemeToggle.vue';

/* ==========================================================================
 * Barre supérieure — partagée par les quatre écrans (accueil, chat, « Comment
 * ça marche », pages juridiques).
 *
 * Elle existait en quatre copies divergentes : hauteurs différentes, deux
 * collantes sur quatre, et surtout la marque passait de gauche à droite selon
 * l'écran — le logo sautait donc à chaque navigation. Un seul composant, la
 * marque toujours à gauche, les actions toujours à droite.
 *
 * Elle porte en plus l'état réel du service (`status` du store) : pastille
 * verte silencieuse tant que la connexion tient, libellé rouge dès qu'elle
 * tombe. Sans elle, perdre le socket en remplissant le formulaire ne se voyait
 * nulle part — le bouton échouait sans explication.
 * ======================================================================== */

/* `quiet` : la barre ne prend la parole que sur un échec réel. Une connexion qui
   s'établit est un état transitoire d'une seconde ; l'annoncer serait du bruit.
   `label` reste court pour tenir dans la barre sur mobile ; `hint` (l'infobulle)
   porte l'explication complète et ce qui est en train de se passer. */
const SERVICE_STATE = {
  connecting: { tone: 'wait', label: 'Connexion…', hint: 'Connexion au service en cours', quiet: true },
  onboarding: { tone: 'ok', label: 'Service en ligne', hint: 'Service en ligne', quiet: true },
  live: { tone: 'ok', label: 'Service en ligne', hint: 'Service en ligne', quiet: true },
  disconnected: {
    tone: 'down',
    label: 'Hors ligne',
    hint: 'Service injoignable — nouvelle tentative de connexion automatique',
    quiet: false,
  },
} as const;

/* Accès par le service onion (badge « Via Tor » de la marque).
 *
 * VISIBLE DE SOI SEUL. Ce badge n'est jamais diffusé aux autres présents, et
 * c'est le cœur de l'arbitrage : afficher publiquement qui passe par Tor ferait
 * des quelques visiteurs onion d'un salon une classe repérable, rattachant tout
 * ce qu'ils déclarent par ailleurs (ville, âge, horaires) à un bit rare. Sur un
 * service dont la promesse est qu'on ne s'y distingue pas, ce serait à rebours.
 *
 * Il répond en revanche à un vrai besoin : l'interface étant identique des deux
 * côtés, rien d'autre ne permet de vérifier que le circuit fonctionne. */
const ONION_HINT =
  "Vous êtes connecté·e via le service onion Tor : votre adresse IP n'atteint jamais nos serveurs. Personne d'autre ne voit cette information.";

const props = withDefaults(
  defineProps<{
    /** Colonne de la barre : `wide` suit l'accueil, `text` la colonne de lecture,
     *  `app` le cadre du chat, `full` occupe toute la largeur. */
    column?: 'wide' | 'text' | 'app' | 'full';
    sticky?: boolean;
    /** Fourni hors de l'accueil : la marque devient le retour, comme partout sur le web. */
    onHome?: () => void;
  }>(),
  { column: 'wide', sticky: true },
);

const { status, onion } = storeToRefs(useStore());
const service = computed(() => SERVICE_STATE[status.value]);

const rail = computed(() =>
  props.column === 'text'
    ? 'topbar__rail--text max-w-3xl'
    : props.column === 'wide'
      ? 'max-w-6xl'
      : props.column === 'app'
        ? 'topbar__rail--app'
        : '',
);
</script>

<template>
  <header :class="`topbar${sticky ? ' topbar--sticky' : ''}`">
    <div :class="`topbar__rail ${rail}`">
      <button v-if="onHome" type="button" class="topbar__home" aria-label="Revenir à l'accueil" @click="onHome">
        <span class="topbar__brand">
          <Logo className="h-8 w-8 sm:h-9 sm:w-9" />
          <span class="topbar__word">Proxima</span>
          <span class="topbar__service" role="status" :title="service.hint">
            <span :class="`topbar__dot topbar__dot--${service.tone}`" aria-hidden="true" />
            <span v-if="service.quiet" class="sr-only">{{ service.hint }}</span>
            <span v-else class="topbar__service-label">{{ service.label }}</span>
          </span>
          <span v-if="onion" class="topbar__onion" :title="ONION_HINT"><Icon name="shield" :size="12" />Via Tor</span>
        </span>
      </button>
      <span v-else class="topbar__brand">
        <Logo className="h-8 w-8 sm:h-9 sm:w-9" />
        <span class="topbar__word">Proxima</span>
        <span class="topbar__service" role="status" :title="service.hint">
          <span :class="`topbar__dot topbar__dot--${service.tone}`" aria-hidden="true" />
          <span v-if="service.quiet" class="sr-only">{{ service.hint }}</span>
          <span v-else class="topbar__service-label">{{ service.label }}</span>
        </span>
        <span v-if="onion" class="topbar__onion" :title="ONION_HINT"><Icon name="shield" :size="12" />Via Tor</span>
      </span>
      <div class="topbar__actions">
        <!-- Le son ne se coupe que là où il peut sonner : hors session, un bouton
             de sourdine n'aurait rien à couper — ce serait du bruit d'interface
             dans la barre de l'accueil. -->
        <SoundToggle v-if="status === 'live'" />
        <ThemeToggle />
        <slot />
      </div>
    </div>
  </header>
</template>
