<script setup lang="ts">
import { computed, ref } from 'vue';
import sodium from 'libsodium-wrappers';
import { B64, PAD, type Party } from './about-demo';
import { Icon } from '../ui';
import Field from './Field.vue';
import Lane from './Lane.vue';
import Mono from './Mono.vue';

const props = defineProps<{ alice: Party; bob: Party }>();

const text = ref('Rendez-vous demain à 18h ?');
const presets = ['oui', 'Salut 🙂', 'Rendez-vous demain à 18h ?'];

// Identifiants de session : 9 octets -> 12 caractères base64url, comme côté serveur
// (`crypto.randomBytes(9).toString('base64url')`). Dérivés des clés pour rester stables.
const ids = computed(() => ({
  from: sodium.to_base64(sodium.crypto_generichash(9, props.alice.publicKey, null), B64()),
  to: sodium.to_base64(sodium.crypto_generichash(9, props.bob.publicKey, null), B64()),
}));
const ts = Date.now();

const result = computed(() => {
  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
  const padded = sodium.pad(sodium.from_string(text.value || ''), PAD);
  const ct = sodium.crypto_box_easy(padded, nonce, props.bob.publicKey, props.alice.privateKey);
  let decrypted = '';
  try {
    decrypted = sodium.to_string(sodium.unpad(sodium.crypto_box_open_easy(ct, nonce, props.alice.publicKey, props.bob.privateKey), PAD));
  } catch {
    decrypted = '—';
  }
  return {
    nonceB64: sodium.to_base64(nonce, B64()),
    pubB64: sodium.to_base64(props.alice.publicKey, B64()),
    ctB64: sodium.to_base64(ct, B64()),
    bytes: ct.length,
    decrypted,
  };
});
</script>

<template>
  <div>
    <label class="mb-1.5 block text-xs font-medium text-muted">Votre message</label>
    <textarea class="input mb-2 resize-none" rows="2" v-model="text" maxlength="2000" />
    <div class="mb-4 flex flex-wrap gap-1.5">
      <button v-for="p in presets" :key="p" class="chip cursor-pointer hover:border-blue" @click="text = p">
        {{ p || '(vide)' }}
      </button>
    </div>

    <!-- Avant / après : le clair part de chez vous et arrive identique chez le destinataire. -->
    <div class="grid gap-3 sm:grid-cols-2">
      <Lane label="Sur votre appareil · avant envoi" icon="lock" tone="neutral">
        <p class="break-words text-[13px] text-ink"><template v-if="text">{{ text }}</template><span v-else class="text-faint">(vide)</span></p>
      </Lane>
      <Lane label="Chez le destinataire · après réception" icon="shield-check" tone="ok">
        <p class="break-words text-[13px] text-ink"><template v-if="result.decrypted">{{ result.decrypted }}</template><span v-else class="text-faint">—</span></p>
        <p class="mt-2 text-[11px] text-verified">✓ déchiffré localement</p>
      </Lane>
    </div>

    <!-- Le point central : TOUT ce que le serveur voit passer, champ par champ. -->
    <div class="mt-3 overflow-hidden rounded-xl border" :style="{ borderColor: 'color-mix(in srgb, var(--color-danger) 22%, transparent)' }">
      <div class="flex flex-wrap items-center justify-between gap-1 border-b px-3 py-2" :style="{ borderColor: 'color-mix(in srgb, var(--color-danger) 18%, transparent)', background: 'var(--color-danger-tint)' }">
        <div class="flex items-center gap-1.5 text-[11px] font-semibold text-danger">
          <Icon name="radar" :size="12" />
          Ce que le serveur voit passer
        </div>
        <span class="font-mono text-[10px] text-danger/80">événement pm:send</span>
      </div>
      <div class="px-3 py-2.5 text-[12px] leading-relaxed text-muted">
        On n'envoie pas « juste le message » : le serveur reçoit une <strong class="text-ink">enveloppe</strong>.
        Tout ce qui sert à <strong class="text-ink">acheminer</strong> (qui, à qui, quand) est
        <strong class="text-ink">en clair</strong> ; seul le <strong class="text-ink">contenu</strong> est un
        bloc chiffré.
      </div>
      <div class="flex flex-col gap-px" :style="{ background: 'color-mix(in srgb, var(--color-danger) 12%, transparent)' }">
        <Field name="toId" :value="ids.to" hint="à qui relayer — l'identifiant du destinataire" />
        <Field name="fromId" :value="ids.from" hint="de qui — votre session, connue du serveur via la connexion" />
        <Field name="env.pub" :value="result.pubB64" hint="votre clé publique de session (sert à vérifier l'origine)" />
        <Field name="env.n" :value="result.nonceB64" hint="nonce — aléa public, non secret" />
        <Field name="ts" :value="String(ts)" hint="horodatage de l'envoi" />
        <Field name="env.c" :value="result.ctB64" :hint="`le contenu du message · ${result.bytes} octets — verrouillé`" secret />
      </div>
    </div>

    <p class="mt-3 text-[12.5px] leading-snug text-muted">
      Le serveur sait donc <strong class="text-ink">qui écrit à qui, et quand</strong> — le minimum pour livrer un
      message. Mais le contenu (<Mono>env.c</Mono>) lui reste <strong class="text-ink">illisible</strong> : sans la
      clé privée du destinataire, ce bloc n'est que du bruit.
    </p>
  </div>
</template>
