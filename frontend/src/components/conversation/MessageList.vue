<script setup lang="ts">
import { computed, defineComponent, h, onMounted, ref, watch, type VNode } from 'vue';
import { parseMarkdown, type Block, type Inline } from '../../lib/markdown';
import { splitMentions } from '../../lib/mentions';
import { REPORT_REASON_LABEL, type Message, type ReportReason } from '../../lib/types';
import { avatarColor, Modal } from '../ui';
import { excerptOf, fmtTime } from './shared';

const props = defineProps<{
  messages: Message[];
  showNames: boolean;
  onReport?: (m: Message, reason: ReportReason) => void;
  onReply?: (m: Message) => void;
  onEdit?: (m: Message) => void;
  /** `msgId` du message en cours de retouche — la bulle reste repérable pendant qu'on la réécrit. */
  editingId?: string;
  /** Pseudos reconnus comme mentions — les présents du salon ; vide en MP. */
  mentionPseudos?: string[];
  myPseudo?: string;
}>();
/* Écran vide (slot `empty`) : propre à chaque contexte, donc écrit par l'appelant
   (il connaît le nom). */

const scrollRef = ref<HTMLDivElement | null>(null);
const reportTarget = ref<Message | null>(null);
// Message mis en évidence après un saut vers une citation ; s'éteint tout seul.
const flash = ref<string | null>(null);
// « Accroché » au bas du fil : tant qu'on y est, on suit la conversation. Dès
// qu'on remonte lire, la position devient intouchable — un nouveau message ne
// doit jamais arracher le lecteur à l'historique ; il alimente la pastille.
let pinned = true;
let prevCount = 0;
const missed = ref(0);

function onScroll() {
  const el = scrollRef.value;
  if (!el) return;
  // Tolérance d'une bulle (~120 px) : « en bas » ne doit pas se perdre au
  // moindre pixel de dérive (clavier mobile, média qui finit de charger).
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  pinned = atBottom;
  if (atBottom) missed.value = 0;
}

function jumpToLatest() {
  const el = scrollRef.value;
  if (!el) return;
  pinned = true;
  missed.value = 0;
  el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
}

// `flush: 'post'` : la mesure et le recalage se font juste après la mise à jour
// du DOM, avant le rendu à l'écran — accroché, on ne voit jamais le fil
// « sauter » vers le bas.
function recompute() {
  const el = scrollRef.value;
  if (!el) return;
  const added = props.messages.length - prevCount;
  prevCount = props.messages.length;
  // Ses propres mots ramènent toujours en bas : on veut voir sa bulle partir.
  const justSpoke = added > 0 && props.messages[props.messages.length - 1]?.kind === 'me';
  if (pinned || justSpoke) {
    el.scrollTop = el.scrollHeight;
    pinned = true;
    missed.value = 0;
  } else if (added > 0) {
    // Seuls les messages d'autrui comptent : un avis système (arrivée,
    // départ) n'est pas une conversation manquée.
    const chat = props.messages.slice(-added).filter((m) => m.kind === 'them').length;
    if (chat > 0) missed.value += chat;
  } else if (added < 0) {
    // Fil raccourci (purge, remise à zéro) : la pastille n'a plus de référent.
    missed.value = 0;
  }
}
// Au montage, le DOM est prêt : premier recalage (l'équivalent du passage initial
// de l'effet de layout React). Ensuite, le fil MUTE en place (push Pinia) : le
// suivi doit être profond, une simple identité de tableau ne changerait jamais.
onMounted(recompute);
watch(() => props.messages, recompute, { deep: true, flush: 'post' });

const byId = computed(() => {
  const map = new Map<string, Message>();
  for (const m of props.messages) if (m.msgId) map.set(m.msgId, m);
  return map;
});

// La liste des présents est reconstruite à chaque rendu par l'appelant : on la
// stabilise sur son contenu, sinon chaque bulle redécouperait son texte pour rien.
const pseudoKey = computed(() => (props.mentionPseudos || []).join('\u0000'));
const pseudos = computed(() => (pseudoKey.value ? pseudoKey.value.split('\u0000') : []));

function jumpTo(id: string) {
  const el = scrollRef.value?.querySelector<HTMLElement>(`[data-msg="${id}"]`);
  if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  flash.value = id;
  window.setTimeout(() => {
    if (flash.value === id) flash.value = null;
  }, 1600);
}

/* Tout ce qu'une bulle a besoin de savoir, calculé une fois par message — le
   template n'a pas de place pour des constantes locales, l'équivalent Vue des
   `const` du `map` React est cette liste dérivée. */
const rows = computed(() =>
  props.messages.map((m, i) => {
    const prev = props.messages[i - 1];
    const next = props.messages[i + 1];
    const sameSender = !!prev && prev.kind === m.kind && prev.fromId === m.fromId;
    // L'heure ne s'affiche qu'en fin de série : dans une séance qui dure quelques
    // minutes, la répéter sur chaque bulle ajoutait une ligne partout pour une
    // information qu'on ne relit jamais.
    const endsRun = !next || next.kind !== m.kind || next.fromId !== m.fromId;
    const mine = m.kind === 'me';
    const canReport = !!props.onReport && m.kind === 'them' && !m.retracted;
    // On ne cite que ce qui a une ancre partagée par les deux bouts : un
    // message sans `msgId` (échec de déchiffrement, client antérieur) ne
    // pourrait pas être retrouvé chez le destinataire.
    const canReply = !!props.onReply && !!m.msgId && !m.retracted;
    // On ne retouche que ses propres mots, et seulement du texte : une
    // pièce jointe n'a rien à remplacer, un message retiré est verrouillé.
    const canEdit = !!props.onEdit && mine && !!m.msgId && !m.retracted && !m.media;
    const editing = !!props.editingId && m.msgId === props.editingId;
    // Salons : couleur déterministe par auteur (même palette que les avatars).
    // Le pseudo coloré + le liseré sur chaque bulle permettent d'attribuer un
    // message même au milieu d'un groupe, là où le pseudo n'est plus répété.
    const authorColor = props.showNames && !mine && m.fromId ? avatarColor(m.fromId) : null;
    const accent = authorColor ? { borderLeftColor: authorColor, borderLeftWidth: '3px' } : undefined;
    const quoted = m.replyTo ? byId.value.get(m.replyTo) : undefined;
    return { m, sameSender, endsRun, mine, canReport, canReply, canEdit, editing, authorColor, accent, quoted };
  }),
);

/* ---- Modale de motif de signalement (DSA art.16) ----------------------- */

const reportReasons = Object.keys(REPORT_REASON_LABEL) as ReportReason[];

function pickReason(reason: ReportReason) {
  if (reportTarget.value) props.onReport?.(reportTarget.value, reason);
  reportTarget.value = null;
}

/**
 * Texte d'un message : balisage léger interprété (cf. `lib/markdown.ts`) et
 * mentions mises en évidence. L'arbre est rendu en nœuds Vue (`h`) — jamais du
 * HTML assemblé puis réinjecté —, ce qui est aussi ce qui rend l'opération sûre :
 * un message ne peut produire que les quelques balises prévues ici.
 */
const MessageText = defineComponent(
  (p: { text: string; pseudos: string[]; myPseudo?: string }) => {
    const blocks = computed(() => parseMarkdown(p.text));
    return () => blocks.value.map((b, i) => renderBlock(b, i, p.pseudos, p.myPseudo));
  },
  { props: ['text', 'pseudos', 'myPseudo'] },
);

function renderBlock(block: Block, key: number, pseudos: string[], myPseudo?: string): VNode {
  if (block.t === 'pre') {
    // Le nom de langage est conservé mais pas coloré : une coloration syntaxique
    // demanderait une grammaire par langage, pour un gain nul dans une bulle.
    return h('pre', { key, class: 'md-pre', 'data-lang': block.lang }, [h('code', block.v)]);
  }
  const kids = renderInline(block.kids, pseudos, myPseudo);
  if (block.t === 'quote') {
    return h('blockquote', { key, class: 'md-quote' }, kids);
  }
  return h('span', { key }, kids);
}

function renderInline(nodes: Inline[], pseudos: string[], myPseudo?: string): VNode[] {
  return nodes.map((n, i) => {
    switch (n.t) {
      // Dans du code, un « @pseudo » reste un `@pseudo` : c'est tout l'intérêt
      // de l'avoir écrit là.
      case 'code':
        return h('code', { key: i, class: 'md-code' }, n.v);
      case 'b':
        return h('strong', { key: i }, renderInline(n.kids, pseudos, myPseudo));
      case 'i':
        return h('em', { key: i }, renderInline(n.kids, pseudos, myPseudo));
      case 'u':
        return h('u', { key: i }, renderInline(n.kids, pseudos, myPseudo));
      case 's':
        return h('s', { key: i }, renderInline(n.kids, pseudos, myPseudo));
      case 'spoiler':
        return h(Spoiler, { key: i }, () => renderInline(n.kids, pseudos, myPseudo));
      default:
        return h(Mentions, { key: i, text: n.v, pseudos, myPseudo });
    }
  });
}

/** Segment de texte ordinaire, mentions reconnues contre les présents. */
const Mentions = defineComponent(
  (p: { text: string; pseudos: string[]; myPseudo?: string }) => {
    return () => {
      const parts = splitMentions(p.text, p.pseudos);
      if (parts.length === 1 && !parts[0].pseudo) return p.text;
      return parts.map((part, i) =>
        part.pseudo
          ? h(
              'span',
              {
                key: i,
                class: `mention ${part.pseudo.toLowerCase() === p.myPseudo?.toLowerCase() ? 'mention--me' : ''}`,
              },
              part.text,
            )
          : h('span', { key: i }, part.text),
      );
    };
  },
  { props: ['text', 'pseudos', 'myPseudo'] },
);

/**
 * Contenu masqué. Il est dans le DOM dès le départ — on ne peut pas faire
 * autrement sans le demander au serveur, qui ne l'a pas — donc le masque est un
 * affichage, pas un secret : il protège d'un regard, pas d'un curieux déterminé.
 */
const Spoiler = defineComponent((_p, { slots }) => {
  const shown = ref(false);
  return () =>
    shown.value
      ? h('span', { class: 'md-spoiler md-spoiler--on' }, slots.default?.())
      : h(
          'button',
          {
            type: 'button',
            class: 'md-spoiler',
            onClick: () => {
              shown.value = true;
            },
            title: 'Afficher le contenu masqué',
            'aria-label': 'Contenu masqué : afficher',
          },
          slots.default?.(),
        );
});

const Quote = defineComponent(
  (p: { quoted?: Message; mine: boolean; onJump?: () => void }) => {
    return () => {
      const cls = `quote ${p.mine ? 'quote--mine' : ''}`;
      if (!p.quoted) return h('div', { class: `${cls} quote--void` }, 'Message indisponible');

      const author = p.quoted.kind === 'me' ? 'Vous' : p.quoted.fromPseudo || 'Inconnu';
      const content = [
        h('span', { class: 'quote__author' }, author),
        h('span', { class: 'quote__text' }, excerptOf(p.quoted)),
      ];
      if (!p.onJump) return h('div', { class: cls }, content);
      return h('button', { type: 'button', class: cls, onClick: p.onJump, title: 'Aller au message cité' }, content);
    };
  },
  { props: ['quoted', 'mine', 'onJump'] },
);
</script>

<template>
  <div class="relative flex min-h-0 min-w-0 flex-1 flex-col">
    <div ref="scrollRef" class="scroll flex-1 overflow-y-auto px-3 py-4 sm:px-5" @scroll="onScroll">
      <!-- `justify-end` + `min-h-full` : la conversation pousse depuis le bas, contre le
           champ de saisie. Empilée par le haut, une pièce de deux messages laissait
           600 px de vide sous eux et donnait un salon à l'abandon. -->
      <div class="flex min-h-full w-full flex-col justify-end gap-1">
        <slot v-if="messages.length === 0" name="empty" />
        <template v-for="(row, i) in rows" :key="row.m.localId">
          <div v-if="row.m.kind === 'system'" class="bubble bubble-system my-1">
            {{ row.m.text }}
          </div>
          <!-- Rythme de lecture : une suite de messages du même auteur se resserre,
               un changement d'auteur respire. La grille dit qui parle avant qu'on lise. -->
          <div
            v-else
            :data-msg="row.m.msgId"
            :class="`msg flex flex-col ${row.mine ? 'items-end' : 'items-start'} ${
              i > 0 && !row.sameSender ? 'mt-2.5' : ''
            } ${flash === row.m.msgId ? 'msg--flash' : ''} ${row.editing ? 'msg--editing' : ''}`"
          >
            <span
              v-if="showNames && !row.mine && !row.sameSender"
              class="mb-0.5 ml-1 text-[11px] font-semibold"
              :style="{ color: row.authorColor ?? undefined }"
            >
              {{ row.m.fromPseudo }}
            </span>
            <div v-if="row.m.retracted" class="bubble bubble-them text-faint italic" :style="row.accent">
              Message retiré par la modération
            </div>
            <!-- ---- Pièce jointe (photo / vidéo) ---- -->
            <div
              v-else-if="row.m.media"
              class="overflow-hidden rounded-2xl border"
              :style="[
                {
                  maxWidth: 'min(78%, 340px)',
                  borderColor: row.mine ? 'var(--color-blue)' : 'var(--color-line)',
                },
                row.accent,
              ]"
            >
              <div v-if="row.m.replyTo" class="px-2 pb-1 pt-2">
                <Quote :quoted="row.quoted" :mine="row.mine" :onJump="row.quoted ? () => jumpTo(row.m.replyTo!) : undefined" />
              </div>
              <a v-if="row.m.media.kind === 'image'" :href="row.m.media.url" target="_blank" rel="noreferrer" class="block">
                <img :src="row.m.media.url" alt="Photo partagée" class="block max-h-[360px] w-full object-cover" loading="lazy" />
              </a>
              <video v-else :src="row.m.media.url" controls preload="metadata" class="block max-h-[360px] w-full bg-black" />
              <div
                class="px-2.5 py-1 text-right text-[10px] tabular-nums"
                :style="{
                  background: row.mine ? 'var(--color-blue)' : 'var(--color-paper-2)',
                  color: row.mine ? 'rgba(255,255,255,0.8)' : 'var(--color-faint)',
                }"
              >
                {{ fmtTime(row.m.ts) }}
              </div>
            </div>
            <div
              v-else
              :class="`bubble ${row.mine ? 'bubble-me' : 'bubble-them'} ${row.m.mentionsMe ? 'bubble--mention' : ''}`"
              :style="row.accent"
            >
              <Quote
                v-if="row.m.replyTo"
                :quoted="row.quoted"
                :mine="row.mine"
                :onJump="row.quoted ? () => jumpTo(row.m.replyTo!) : undefined"
              />
              <MessageText :text="row.m.text" :pseudos="pseudos" :myPseudo="myPseudo" />
              <!-- « modifié » se dit même au milieu d'une série, là où l'heure se
                   tait : c'est le seul indice qu'un texte n'est plus celui qu'on
                   a lu. L'horodatage reste celui de la diffusion d'origine. -->
              <span v-if="row.endsRun || row.m.edited" class="stamp-ts">{{
                row.m.edited ? `modifié · ${fmtTime(row.m.ts)}` : fmtTime(row.m.ts)
              }}</span>
            </div>
            <div v-if="row.canReply || row.canEdit || row.canReport" :class="`msg-actions ${row.mine ? 'mr-1' : 'ml-1'}`">
              <button v-if="row.canReply" class="msg-action" title="Répondre à ce message" @click="onReply!(row.m)">
                répondre
              </button>
              <button v-if="row.canEdit" class="msg-action" title="Modifier ce message" @click="onEdit!(row.m)">
                modifier
              </button>
              <button
                v-if="row.canReport"
                class="msg-action msg-action--danger"
                title="Signaler ce message à la modération"
                @click="reportTarget = row.m"
              >
                signaler
              </button>
            </div>
          </div>
        </template>
      </div>
    </div>

    <button v-if="missed > 0" type="button" class="jump-latest" @click="jumpToLatest">
      ↓ {{ missed === 1 ? '1 nouveau message' : `${missed} nouveaux messages` }}
    </button>

    <Modal v-if="reportTarget && onReport" title="Signaler ce message" :onClose="() => (reportTarget = null)">
      <p class="mb-3 text-sm text-muted">
        Votre signalement est transmis à la modération. Indiquez le motif :
      </p>
      <div class="flex flex-col gap-2">
        <button
          v-for="r in reportReasons"
          :key="r"
          :class="`btn btn-ghost justify-start ${r === 'minor' || r === 'illegal' ? 'text-danger' : ''}`"
          @click="pickReason(r)"
        >
          {{ REPORT_REASON_LABEL[r] }}
        </button>
      </div>
    </Modal>
  </div>
</template>
