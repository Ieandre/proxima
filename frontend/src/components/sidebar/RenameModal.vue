<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { renamePseudo } from '../../lib/socket';
import { randomPseudo } from '../../lib/pseudo';
import { Icon, Modal } from '../ui';

const props = defineProps<{ current: string; onClose: () => void }>();

const value = ref(props.current);
const busy = ref(false);
const error = ref<string | null>(null);
const trimmed = computed(() => value.value.trim());
const valid = computed(() => trimmed.value.length >= 2 && trimmed.value !== props.current);

const input = ref<HTMLInputElement | null>(null);
onMounted(() => input.value?.focus());

async function submit() {
  if (!valid.value || busy.value) return;
  busy.value = true;
  error.value = null;
  const res = await renamePseudo(trimmed.value);
  if (res.ok) return props.onClose();
  error.value = res.error || 'Échec du changement de pseudo.';
  busy.value = false;
}

/**
 * Une ligne de salon, trois états qui s'empilent :
 *  - absent  : on n'y est pas — pastille sourde, la flèche paraît au survol ;
 *  - présent : un rail bleu au bord gauche, posé SANS rien déplacer ;
 *  - ouvert  : présent, et c'est la conversation à l'écran — la ligne se remplit.
 *
 * Chaque état n'ajoute qu'un signe au précédent, et aucun ne change la place de la
 * ligne. C'est le remplacement des deux anciennes listes (« à rejoindre » en bas,
 * « rejoints » en haut) entre lesquelles la ligne se téléportait au clic.
 */
</script>

<template>
  <Modal title="Changer de pseudo" :onClose="onClose">
    <form @submit.prevent="submit">
      <div class="relative">
        <input
          ref="input"
          v-model="value"
          class="input pr-11"
          maxlength="24"
          aria-label="Nouveau pseudo"
        />
        <button
          type="button"
          class="input-action"
          title="Un autre pseudo"
          aria-label="Proposer un autre pseudo"
          @click="value = randomPseudo()"
        >
          <Icon name="dice" :size="16" />
        </button>
      </div>

      <p class="mt-3 text-[12px] leading-snug text-faint">
        Vos messages déjà envoyés gardent l'ancien pseudo. Le changement est annoncé dans les salons que vous avez
        rejoints.
      </p>

      <div
        v-if="error"
        class="mt-3 rounded-lg border border-[color-mix(in_srgb,var(--color-danger)_35%,transparent)] bg-[var(--color-danger-tint)] px-3 py-2 text-sm text-danger"
      >
        {{ error }}
      </div>

      <div class="mt-4 flex justify-end gap-2">
        <button type="button" class="btn btn-ghost" @click="onClose">
          Annuler
        </button>
        <button class="btn btn-primary" :disabled="!valid || busy">
          {{ busy ? 'Changement…' : 'Changer' }}
        </button>
      </div>
    </form>
  </Modal>
</template>
