<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useStore } from './store/useStore';
import { connect } from './lib/socket';
import { Onboarding } from './components/onboarding';
import Chat from './components/chat/Chat.vue';
import About from './components/pages/About.vue';
import Legal from './components/pages/Legal.vue';
import { isLegalPath } from './components/pages/legal-tabs';
import Splash from './components/Splash.vue';
import { installLinkDelegate } from './lib/router';
import { useRoute } from './composables/route';
import { armSound } from './lib/sound';

const ABOUT_PATH = '/en-savoir-plus';

const st = useStore();
const { status, toast } = storeToRefs(st);
const route = useRoute();

onMounted(() => connect());

// Le son des notifications doit être déverrouillé par un geste (contrainte iOS) :
// on prend le premier de la visite, quel qu'il soit.
let disarmSound: (() => void) | null = null;
onMounted(() => {
  disarmSound = armSound();
});

/**
 * Configuration publique (point de contact DSA + adresse onion), chargée UNE
 * fois pour toute l'application. Elle était lue séparément par `About` et
 * `Legal` ; le pied de page en ayant besoin à son tour — et étant monté sur deux
 * écrans — l'appel partait trois fois. Le store la distribue désormais.
 */
let alive = true;
onMounted(() => {
  fetch('/api/legal')
    .then((r) => r.json())
    .then((d) => alive && st.setLegal(d))
    .catch(() => {});
});

// Les liens internes restent de vrais `<a href="/cgu">` — explorables par un
// moteur — mais ne rechargent pas la page : un rechargement détruirait la
// session éphémère (cf. lib/router.ts).
let removeLinkDelegate: (() => void) | null = null;
onMounted(() => {
  removeLinkDelegate = installLinkDelegate();
});

onUnmounted(() => {
  alive = false;
  disarmSound?.();
  removeLinkDelegate?.();
});
</script>

<template>
  <About v-if="route === ABOUT_PATH" />
  <Legal v-else-if="isLegalPath(route)" :path="route" />
  <template v-else>
    <Splash v-if="status === 'connecting'" />
    <Onboarding v-if="status === 'onboarding' || status === 'disconnected'" />
    <Chat v-if="status === 'live'" />

    <div v-if="toast" class="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 fade-up px-4" @click="st.hideToast()">
      <div
        class="panel flex items-center gap-2.5 px-4 py-2.5 text-sm"
        :style="{
          borderColor:
            toast.tone === 'warn' ? 'color-mix(in srgb, var(--color-danger) 40%, transparent)' : undefined,
          color: toast.tone === 'warn' ? 'var(--color-danger)' : 'var(--color-ink)',
        }"
      >
        <span
          class="live-dot"
          :style="{ background: toast.tone === 'warn' ? 'var(--color-danger)' : 'var(--color-verified)' }"
        />
        {{ toast.text }}
      </div>
    </div>
  </template>
</template>
