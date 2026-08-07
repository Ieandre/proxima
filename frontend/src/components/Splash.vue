<script setup lang="ts">
/* ==========================================================================
 * Écran d'attente, entre l'ouverture de la page et le socket établi.
 *
 * Il ne charge rien. Pendant ces quelques centaines de millisecondes,
 * libsodium se charge et une paire de clés X25519 est fabriquée SUR
 * L'APPAREIL, dont la moitié privée n'en sortira jamais (cf. lib/crypto.ts).
 * C'est le seul moment où le mécanisme central du produit se produit — d'où
 * un écran qui le nomme, plutôt qu'un « Connexion au service… » qui désignait
 * le système et pas la personne.
 *
 * La vraie contrainte est la durée, qui varie de deux ordres de grandeur :
 * ~400 ms sur le clearnet, mais jusqu'à une minute et demie sur l'onion à la
 * première résolution du descripteur (mesuré : 85 s). Un écran conçu pour le
 * cas rapide laisse l'utilisateur Tor devant une page qui paraît morte. D'où
 * la ligne d'explication qui n'apparaît qu'au-delà de SLOW_AFTER_MS, et qui
 * dit ce qui est vrai de l'accès emprunté.
 * ======================================================================== */
import { onMounted, onUnmounted, ref } from 'vue';
import { isOnionOrigin } from '../lib/onion';

// L'alphabet dans lequel les clés de session et l'adresse .onion de ce service
// sont réellement écrites (base64url). Les glyphes qui défilent ci-dessous ne
// sont donc pas un motif décoratif : c'est la matière du sujet.
const KEY_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const KEY_SLOTS = 8;
const SETTLE_MS = 190; // un glyphe se fixe toutes les 190 ms
const CHURN_MS = 55; // les glyphes non fixés changent à ~18 Hz
const HOLD_MS = 850; // pause clé entière avant de recommencer
const SLOW_AFTER_MS = 4000;

const pick = () => KEY_ALPHABET[Math.floor(Math.random() * KEY_ALPHABET.length)];

/**
 * Clé qui se tire du hasard : les glyphes défilent et se fixent un par un, de
 * gauche à droite, puis le cycle reprend. Lent et interlettré à dessein — le
 * texte qui « scramble » est un cliché quand il est frénétique et vert sur
 * noir ; ralenti, en encre sur papier, il redevient de la typographie.
 *
 * `prefers-reduced-motion` est déjà neutralisé globalement pour les animations
 * CSS, mais celle-ci vit en JavaScript : elle doit se désarmer elle-même.
 */
const glyphs = ref(Array.from({ length: KEY_SLOTS }, pick));
const settled = ref(0);
const slow = ref(false);

let timer: ReturnType<typeof setInterval> | null = null;
let slowTimer: ReturnType<typeof setTimeout> | null = null;

onMounted(() => {
  slowTimer = setTimeout(() => (slow.value = true), SLOW_AFTER_MS);

  if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    glyphs.value = Array.from({ length: KEY_SLOTS }, pick);
    settled.value = KEY_SLOTS;
    return;
  }
  let fixed = 0;
  let sinceSettle = 0;
  timer = setInterval(() => {
    sinceSettle += CHURN_MS;
    // Cycle terminé : on marque une pause, puis on repart d'une clé neuve.
    if (fixed >= KEY_SLOTS) {
      if (sinceSettle < HOLD_MS) return;
      fixed = 0;
      sinceSettle = 0;
    } else if (sinceSettle >= SETTLE_MS) {
      fixed += 1;
      sinceSettle = 0;
    }
    settled.value = fixed;
    // Seuls les glyphes non encore fixés changent : la partie gauche reste
    // stable, ce qui donne à voir une progression plutôt qu'un bruit.
    glyphs.value = glyphs.value.map((g, i) => (i < fixed ? g : pick()));
  }, CHURN_MS);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
  if (slowTimer) clearTimeout(slowTimer);
});
</script>

<template>
  <div class="splash">
    <div class="splash__inner">
      <p class="splash__key" aria-hidden="true">
        <span
          v-for="(g, i) in glyphs"
          :key="i"
          :class="i < settled ? 'splash__glyph splash__glyph--set' : 'splash__glyph'"
          >{{ g }}</span
        >
      </p>
      <h1 class="splash__title" role="status">On prépare vos clés.</h1>
      <p class="splash__note">Elles sont créées sur votre appareil et n'en sortent jamais.</p>
      <p v-if="slow" class="splash__slow">
        {{
          isOnionOrigin()
            ? 'Par Tor, la première connexion peut demander une minute. C’est normal, on continue.'
            : 'C’est plus long que d’habitude. On continue d’essayer.'
        }}
      </p>
    </div>
  </div>
</template>
