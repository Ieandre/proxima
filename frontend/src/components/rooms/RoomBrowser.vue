<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useStore } from '../../store/useStore';
import { createRoom } from '../../lib/socket';
import { Icon, Modal } from '../ui';
import VisBtn from './VisBtn.vue';

/** Création de salon (modale). La découverte, elle, se fait dans la barre latérale. */
const props = defineProps<{ onClose: () => void }>();

const st = useStore();

const name = ref('');
const type = ref<'public' | 'private'>('public');
const password = ref('');
const encrypted = ref(false);
const busy = ref(false);
const error = ref<string | null>(null);

const nameField = ref<HTMLInputElement | null>(null);
onMounted(() => nameField.value?.focus());

async function doCreate() {
  if (name.value.trim().length < 2 || busy.value) return;
  // Tout salon est chiffré : la case ne choisit pas SI l'on chiffre, mais COMMENT la
  // clé s'obtient — dérivée du mot de passe (salon fermé, plafonné) au lieu d'être
  // transmise par les membres. Le mot de passe devient alors indispensable.
  const isEncrypted = type.value === 'private' && encrypted.value;
  if (isEncrypted && !password.value) {
    error.value = 'Une clé dérivée nécessite un mot de passe.';
    return;
  }
  busy.value = true;
  error.value = null;
  const res = await createRoom({
    name: name.value.trim(),
    type: type.value,
    password: type.value === 'private' ? password.value : '',
    encrypted: isEncrypted,
  });
  busy.value = false;
  if (res.ok) {
    st.showToast(
      isEncrypted
        ? 'Salon fermé créé. Partagez le lien et le mot de passe depuis le salon.'
        : type.value === 'private'
          ? 'Salon privé créé, chiffré de bout en bout. Partagez le lien depuis le salon.'
          : 'Salon créé, chiffré de bout en bout.',
    );
    props.onClose();
  } else error.value = res.error || 'Échec de la création.';
}
</script>

<template>
  <Modal title="Créer un salon" :onClose="onClose">
    <form @submit.prevent="doCreate">
      <label class="mb-1.5 block text-sm font-medium text-muted">Nom du salon</label>
      <input
        ref="nameField"
        class="input mb-4"
        placeholder="ex. Centre-ville ce soir"
        maxlength="32"
        v-model="name"
      />

      <label class="mb-1.5 block text-sm font-medium text-muted">Visibilité</label>
      <div class="mb-4 grid grid-cols-2 gap-2">
        <VisBtn :active="type === 'public'" icon="hash" label="Public" desc="Listé, libre d'accès" :onClick="() => (type = 'public')" />
        <VisBtn :active="type === 'private'" icon="lock" label="Privé" desc="Sur invitation" :onClick="() => (type = 'private')" />
      </div>

      <!-- Un salon public est chiffré d'office : il faut le dire ici, et dire aussi ce que
           cela coûte (aucune modération automatique) et ce que cela ne couvre pas (la clé
           est remise à quiconque entre). Promettre plus serait promettre à faux. -->
      <p v-if="type === 'public'" class="mb-4 text-[11px] leading-snug text-faint">
        Chiffré de bout en bout : le serveur relaie sans pouvoir lire. La clé est remise à chaque arrivant par les
        membres — entrer suffit donc pour l’obtenir. Pas de modération automatique du contenu.
      </p>

      <div v-if="type === 'private'" class="mb-4">
        <label class="mb-1.5 block text-sm font-medium text-muted">Mot de passe {{ encrypted ? '(obligatoire)' : '(optionnel)' }}</label>
        <input
          class="input"
          :type="encrypted ? 'password' : 'text'"
          :placeholder="encrypted ? 'requis pour dériver la clé' : 'laisser vide = accès par lien uniquement'"
          maxlength="64"
          v-model="password"
        />

        <label class="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-paper-2 p-3">
          <input type="checkbox" class="mt-0.5" v-model="encrypted" />
          <span>
            <span class="flex items-center gap-1.5 text-sm font-medium text-ink">
              <Icon name="lock" :size="13" />Dériver la clé du mot de passe
            </span>
            <span class="mt-0.5 block text-[12px] leading-snug text-muted">
              Le salon est chiffré dans les deux cas. Ici la clé se dérive du mot de passe au lieu d’être remise
              par les membres : personne n’entre sans lui, et le salon est plafonné à 16 participants. Accès par
              mot de passe uniquement — pas de lien d’invitation.
            </span>
          </span>
        </label>

        <p class="mt-1.5 text-[11px] leading-snug text-faint">
          {{ encrypted
            ? 'Salon listé (nom visible), fermé par le mot de passe.'
            : "Un lien d'invitation sera généré après création. Le contenu est chiffré ; la clé est remise à qui franchit la porte." }}
        </p>
      </div>

      <p v-if="error" class="mb-3 text-sm text-danger">{{ error }}</p>

      <button class="btn btn-primary w-full" :disabled="name.trim().length < 2 || busy">
        <Icon name="plus" :size="16" />Créer le salon
      </button>
    </form>
  </Modal>
</template>
