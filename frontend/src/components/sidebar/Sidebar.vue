<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useStore } from '../../store/useStore';
import { createInvite, joinRoom, leaveRoom, refreshPresence } from '../../lib/socket';
import { fingerprint } from '../../lib/crypto';
import { buildRoomList, communityStart, filterRooms, normalize, type RoomEntry } from '../../lib/rooms';
import { splitPeople } from '../../lib/people';
import { GENDER_LABEL, type Gender } from '../../lib/types';
import { Avatar, Icon } from '../ui';
import RoomBrowser from '../rooms/RoomBrowser.vue';
import RoomCard from '../rooms/RoomCard.vue';
import { type RoomCardMode } from '../rooms/card';
import InviteCard from '../chat/InviteCard.vue';
import RenameModal from './RenameModal.vue';
import RoomRow from './RoomRow.vue';
import SectionTitle from './SectionTitle.vue';
import PersonRow from './PersonRow.vue';
import Empty from './Empty.vue';


const st = useStore();
const me = computed(() => st.me!);
const {
  people,
  pmPeers,
  joinedRooms,
  publicRooms,
  threads,
  unread,
  mentioned,
  active,
  // Salon de région, épinglé en tête de la liste des salons.
  homeRoom,
  // Création de salon, ouvrable aussi depuis l'écran d'accueil.
  roomBrowser: browser,
  // Invitation par lien : un seul lien vivant à la fois, d'où
  // le bouton qui s'efface au profit de la fiche tant qu'une invitation est ouverte.
  invite,
  awaitingInvite: awaiting,
} = storeToRefs(st);

const fp = ref('········');
// Explication de l'empreinte de session : ouverte au survol, ou épinglée au clic
// (seule voie au tactile, où le survol n'existe pas).
const hoverKey = ref(false);
const pinKey = ref(false);
const keyOpen = computed(() => hoverKey.value || pinKey.value);
const roomsOpen = ref(true);
const renaming = ref(false);
// Fiche dépliée sous une ligne, quand il y a un mot de passe à demander ou un
// salon à détruire en sortant. Sinon, la ligne agit seule (cf. `enterRoom`).
const card = ref<{ id: string; mode: RoomCardMode } | null>(null);
// Salon dont l'entrée est en cours : la ligne le dit, le temps de l'aller-retour.
const joining = ref<string | null>(null);
const roomQuery = ref('');
const hereOnly = ref(false);
const inviting = ref(false);

// Recherche par pseudo + filtres (genre, âge) sur la proximité.
const search = ref('');
const showFilters = ref(false);
const genders = ref<Set<Gender>>(new Set());
const ageMin = ref('');
const ageMax = ref('');

const GENDERS = ['F', 'H', 'A'] as const;

onMounted(() => {
  try {
    fp.value = fingerprint();
  } catch {
    /* crypto pas encore prêt — sans gravité */
  }
});

/**
 * Clic sur une ligne de salon — un seul geste, trois issues.
 *
 * Entrer dans un salon en clair n'annonce plus rien à personne (le serveur ne
 * diffuse aucune arrivée) et se défait d'un clic : il n'y a donc rien à faire
 * confirmer, et la ligne fait ce qu'elle a l'air de faire. Seul un salon chiffré
 * garde sa fiche, parce qu'elle a quelque chose à DEMANDER — le mot de passe dont
 * la clé se dérive ici.
 *
 * L'ouverture du panneau de droite est le retour d'état : `joinRoom` rend le salon
 * actif dès l'accusé. D'ici là, la ligne porte l'attente ; en cas de refus (salon
 * fermé entre-temps, exclusion), on reste où l'on était avec un message.
 */
async function enterRoom(r: RoomEntry) {
  if (r.here) return st.setActive({ kind: 'room', id: r.id });
  // Seul un salon VERROUILLÉ passe par la carte : elle n'y sert qu'à réclamer le mot
  // de passe. Un salon public est chiffré lui aussi, mais sa clé ne s'y demande pas —
  // elle lui sera remise par un membre, et le clic doit donc entrer directement.
  if (r.locked) {
    card.value = { id: r.id, mode: 'enter' };
    return;
  }
  if (joining.value) return;
  joining.value = r.id;
  const res = await joinRoom({ roomId: r.id });
  joining.value = null;
  if (!res.ok) st.showToast(res.error || "L'entrée a échoué.", 'warn');
}

/**
 * Clic sur la porte de sortie d'une ligne — même règle que l'entrée : la fiche ne
 * s'ouvre que quand elle a quelque chose à dire AVANT d'agir. Sortir d'un salon où
 * l'on n'a rien écrit ne prévient personne et se défait d'un clic sur la ligne : il
 * n'y a rien à confirmer. Restent les trois sorties qui coûtent quelque chose :
 * détruire le salon en le laissant vide (RG-05), annoncer son départ aux présents
 * (on y a pris la parole), ou perdre l'accès faute de mot de passe ressaisi.
 */
function exitRoom(r: RoomEntry) {
  const spoke = (threads.value[`room:${r.id}`] || []).some((m) => m.kind === 'me');
  if (r.alone || r.locked || (!r.region && spoke)) {
    card.value = { id: r.id, mode: 'leave' };
    return;
  }
  leaveRoom(r.id);
}

async function startInvite() {
  if (inviting.value) return;
  inviting.value = true;
  const res = await createInvite();
  inviting.value = false;
  if (!res.ok) st.showToast(res.error || "Le lien n'a pas pu être créé.", 'warn');
}

const toggleGender = (g: Gender) => {
  const next = new Set(genders.value);
  next.has(g) ? next.delete(g) : next.add(g);
  genders.value = next;
};
const resetFilters = () => {
  genders.value = new Set();
  ageMin.value = '';
  ageMax.value = '';
};
const activeFilters = computed(() => genders.value.size + (ageMin.value ? 1 : 0) + (ageMax.value ? 1 : 0));

// Répartition des personnes : « ai-je un fil ? », jamais la distance. Logique et
// justification dans `lib/people.ts`, avec ses tests.
const peopleSplit = computed(() =>
  splitPeople({ people: people.value, pmPeers: pmPeers.value, threads: threads.value }),
);
const conversations = computed(() => peopleSplit.value.conversations);
const nearby = computed(() => peopleSplit.value.nearby);

const presentCount = computed(() => Object.keys(people.value).length);
const q = computed(() => normalize(search.value.trim()));
const min = computed(() => (ageMin.value ? Number(ageMin.value) : 0));
const max = computed(() => (ageMax.value ? Number(ageMax.value) : 999));
const filteredNearby = computed(() =>
  nearby.value.filter(
    (p) =>
      (!q.value || normalize(p.pseudo).includes(q.value)) &&
      (genders.value.size === 0 || genders.value.has(p.gender)) &&
      p.age >= min.value &&
      p.age <= max.value,
  ),
);

// Liste UNIQUE des salons, d'ordre stable : y entrer ne déplace jamais la ligne
// (cf. `lib/rooms`). Un seul rang à parcourir des yeux, quel que soit son état.
const rooms = computed(() =>
  buildRoomList({ publicRooms: publicRooms.value, joinedRooms: joinedRooms.value, homeRoom: homeRoom.value }),
);
const visibleRooms = computed(() => filterRooms(rooms.value, { query: roomQuery.value, hereOnly: hereOnly.value }));
const communityFrom = computed(() => communityStart(visibleRooms.value));
const hereCount = computed(() => rooms.value.filter((r) => r.here).length);
// Les outils accompagnent la liste dès qu'elle existe, comme la recherche de pseudos
// au-dessus : les faire apparaître passé un seuil aurait déplacé la liste sous eux, au
// moment précis où elle s'allonge. Sur une liste vide, en revanche, il n'y a rien à filtrer.
const showTools = computed(() => rooms.value.length > 0);


const isActive = (kind: 'pm' | 'room', id: string) => active.value?.kind === kind && active.value.id === id;

/**
 * Changement de pseudo en cours de session. Deux choses sont dites franchement,
 * parce qu'elles surprendraient sinon : les messages déjà envoyés gardent l'ancien
 * nom (rien n'est réécrit), et le changement est annoncé dans les salons où l'on
 * est présent — c'est cette annonce qui empêche de changer d'identité au milieu
 * d'une conversation sans que personne ne le voie.
 */
</script>

<template>
  <div class="flex h-full flex-col bg-paper">
    <div class="scroll flex-1 overflow-y-auto px-3 py-4">
      <!-- ---- À proximité --------------------------------------------- -->
      <SectionTitle icon="pin" title="À proximité" :count="nearby.length">
        <template #action>
          <button class="text-faint transition-colors hover:text-blue" title="Actualiser" @click="refreshPresence">
            <Icon name="radar" :size="15" />
          </button>
        </template>
      </SectionTitle>

      <!-- Recherche + filtres -->
      <div class="list-tools">
        <div class="list-tools__field">
          <span class="list-tools__icon">
            <Icon name="search" :size="14" />
          </span>
          <input
            v-model="search"
            class="input"
            placeholder="Rechercher un pseudo…"
          />
        </div>
        <button
          :class="`list-tools__btn${activeFilters || showFilters ? ' list-tools__btn--on' : ''}`"
          :aria-expanded="showFilters"
          title="Filtrer par genre et âge"
          @click="showFilters = !showFilters"
        >
          <Icon name="filter" :size="15" />
          <span v-if="activeFilters > 0" class="list-tools__count">{{ activeFilters }}</span>
        </button>
      </div>

      <div v-if="showFilters" class="mb-3 rounded-xl border border-line bg-card p-3">
        <div class="mb-1.5 text-[11px] font-medium text-faint">Genre</div>
        <div class="mb-3 flex flex-wrap gap-1.5">
          <button
            v-for="g in GENDERS"
            :key="g"
            class="chip cursor-pointer"
            :style="
              genders.has(g)
                ? {
                    borderColor: 'var(--color-blue)',
                    background: 'var(--color-blue-tint)',
                    color: 'var(--color-blue)',
                  }
                : undefined
            "
            @click="toggleGender(g)"
          >
            {{ GENDER_LABEL[g] }}
          </button>
        </div>
        <div class="mb-3 grid grid-cols-2 gap-2">
          <div>
            <div class="mb-1 text-[11px] font-medium text-faint">Âge min</div>
            <input
              v-model="ageMin"
              class="input py-1.5 text-sm"
              type="number"
              min="18"
              placeholder="18"
            />
          </div>
          <div>
            <div class="mb-1 text-[11px] font-medium text-faint">Âge max</div>
            <input
              v-model="ageMax"
              class="input py-1.5 text-sm"
              type="number"
              min="18"
              placeholder="99"
            />
          </div>
        </div>
        <button v-if="activeFilters > 0" class="text-xs font-medium text-blue hover:underline" @click="resetFilters">
          Réinitialiser les filtres
        </button>
      </div>

      <Empty v-if="presentCount === 0" text="Personne près de vous pour l'instant." />
      <!-- Il y a du monde autour, mais on a déjà un fil avec chacun : le dire,
           plutôt que de laisser croire que le rayon s'est vidé. -->
      <Empty v-else-if="nearby.length === 0" text="Personne de nouveau autour de vous." />
      <Empty v-else-if="filteredNearby.length === 0" text="Aucune personne ne correspond à votre recherche." />
      <ul v-else class="mb-5 flex flex-col gap-1">
        <PersonRow
          v-for="p in filteredNearby"
          :key="p.id"
          :p="p"
          :active="isActive('pm', p.id)"
          :unread="unread[`pm:${p.id}`] || 0"
          :onClick="() => st.setActive({ kind: 'pm', id: p.id })"
        />
      </ul>

      <!-- ---- Salons (liste unique, repliable) ------------------------ -->
      <div class="mb-2 mt-1 flex items-center gap-2 px-1">
        <button
          class="flex flex-1 items-center gap-2 text-left"
          :aria-expanded="roomsOpen"
          :title="roomsOpen ? 'Replier les salons' : 'Déplier les salons'"
          @click="roomsOpen = !roomsOpen"
        >
          <span
            class="text-faint transition-transform"
            :style="{ transform: roomsOpen ? 'rotate(90deg)' : 'none' }"
          >
            <Icon name="arrowRight" :size="13" />
          </span>
          <span class="text-[12px] font-semibold text-muted">Salons</span>
          <span class="text-[11px] tabular-nums text-faint">{{ rooms.length }}</span>
        </button>
        <button
          class="text-faint transition-colors hover:text-blue"
          title="Créer un salon"
          @click="st.setRoomBrowser(true)"
        >
          <Icon name="plus" :size="16" />
        </button>
      </div>

      <div v-if="roomsOpen" class="mb-5">
        <div v-if="showTools" class="list-tools">
          <div class="list-tools__field">
            <span class="list-tools__icon">
              <Icon name="search" :size="14" />
            </span>
            <input
              v-model="roomQuery"
              class="input"
              placeholder="Rechercher un salon…"
            />
          </div>
          <!-- Un filtre, pas un regroupement : l'ordre reste le même dans les deux vues.
               Désactivé tant qu'on n'est nulle part — un filtre dont le seul résultat
               possible est une liste vide ne doit pas se laisser presser. -->
          <button
            :class="`list-tools__btn${hereOnly ? ' list-tools__btn--on' : ''}`"
            :aria-pressed="hereOnly"
            :disabled="hereCount === 0 && !hereOnly"
            title="N'afficher que les salons où vous êtes présent·e"
            @click="hereOnly = !hereOnly"
          >
            J'y suis
            <span class="list-tools__count">{{ hereCount }}</span>
          </button>
        </div>

        <p v-if="rooms.length === 0" class="mb-2 px-1 text-[13px] leading-snug text-faint">
          Aucun salon ouvert pour l'instant. Créez le premier.
        </p>
        <p v-else-if="visibleRooms.length === 0" class="mb-2 px-1 text-[13px] leading-snug text-faint">Aucun salon ne correspond.</p>
        <ul v-else class="mb-2 flex flex-col gap-1">
          <template v-for="(r, i) in visibleRooms" :key="r.id">
            <li v-if="i === communityFrom" class="room-divider">Créés par la communauté</li>
            <li>
              <RoomRow
                :room="r"
                :open="isActive('room', r.id)"
                :peeking="card?.id === r.id"
                :joining="joining === r.id"
                :unread="unread[`room:${r.id}`] || 0"
                :mention="!!mentioned[`room:${r.id}`]"
                :onEnter="() => enterRoom(r)"
                :onLeave="() => exitRoom(r)"
              />
              <RoomCard
                v-if="card?.id === r.id"
                :room="r"
                :mode="card!.mode"
                :onDone="() => (card = null)"
                :onCancel="() => (card = null)"
              />
            </li>
          </template>
        </ul>

        <button class="btn btn-ghost mt-1 w-full" @click="st.setRoomBrowser(true)">
          <Icon name="plus" :size="15" />
          Créer un salon
        </button>
      </div>

      <!-- ---- Conversations privées ----------------------------------- -->
      <!-- Toutes les conversations, présents et absents confondus (cf. `conversations`) :
           un fil ne change plus de section quand son correspondant se déplace.

           Section permanente, et terminée par « Inviter quelqu'un » en miroir exact de
           « Créer un salon » sous la liste des salons : deux listes, deux commandes de
           création, même grammaire. Conditionnée à son contenu comme elle l'était, le
           geste n'aurait eu nulle part où s'accrocher tant qu'on n'avait parlé à
           personne — précisément l'état de qui veut inviter quelqu'un. -->
      <SectionTitle icon="lock" title="Conversations privées" :count="conversations.length || undefined" />
      <ul v-if="conversations.length > 0" class="mb-2 flex flex-col gap-1">
        <!-- Hors de portée = un état de la ligne, pas une place dans la
             colonne : la personne peut s'éloigner et revenir sans que sa
             conversation ne bouge d'un pixel. -->
        <PersonRow
          v-for="p in conversations"
          :key="p.id"
          :p="p"
          :offRadar="!people[p.id]"
          :active="isActive('pm', p.id)"
          :unread="unread[`pm:${p.id}`] || 0"
          :onClick="() => st.setActive({ kind: 'pm', id: p.id })"
        />
      </ul>
      <!-- La fiche remplace le bouton au lieu de s'ajouter sous lui : un rendez-vous
           en cours EST l'état de cette section, et deux commandes empilées auraient
           laissé croire que la fiche appartenait au bouton. -->
      <button v-if="!invite && !awaiting" class="btn btn-ghost mt-1 w-full" :disabled="inviting" @click="startInvite">
        <Icon name="plus" :size="15" />
        {{ inviting ? 'Ouverture…' : 'Inviter quelqu’un' }}
      </button>
      <InviteCard />
    </div>

    <!-- ---- Carte d'identité de session ------------------------------- -->
    <div class="border-t border-line bg-card px-3 py-3">
      <div class="flex items-center gap-2.5">
        <Avatar :id="me.id" :pseudo="me.pseudo" :size="36" />
        <div class="min-w-0 flex-1">
          <!-- On entre souvent sous un pseudo tiré au sort : il faut pouvoir le
               remplacer par le sien une fois installé. -->
          <button
            class="group flex min-w-0 max-w-full items-center gap-1.5 text-left"
            title="Changer de pseudo"
            @click="renaming = true"
          >
            <span class="truncate text-sm font-semibold">{{ me.pseudo }}</span>
            <span class="flex-none text-faint transition-colors group-hover:text-blue">
              <Icon name="pencil" :size="12" />
            </span>
          </button>
          <div class="text-[11px] text-faint">
            {{ me.city }} · {{ me.age }} ans
          </div>
        </div>
        <!-- Empreinte : le mono est fonctionnel ici — elle se compare caractère par
             caractère. Brute, « D2 BD 4F 48 » ne dit rien à qui arrive : le survol
             (ou le clic, au tactile) déplie l'explication au-dessus, sans décaler la
             carte. Pas de `title` — l'infobulle native ferait doublon au survol. -->
        <div
          class="relative flex-none"
          @mouseenter="hoverKey = true"
          @mouseleave="hoverKey = false"
        >
          <button
            class="chip chip-verified cursor-help font-mono"
            :aria-expanded="keyOpen"
            @click="pinKey = !pinKey"
            @focus="hoverKey = true"
            @blur="hoverKey = false"
          >
            <Icon name="lock" :size="10" /> {{ fp }}
          </button>
          <div v-if="keyOpen" class="popover-anchor">
            <div class="popover fade-up">
              <div class="text-[12px] font-semibold">Votre clé de session</div>
              <p class="mt-0.5 text-[11px] leading-relaxed text-muted">
                L'empreinte de la clé qui chiffre vos messages privés, générée sur votre appareil à l'arrivée. Le
                serveur ne la voit jamais. Elle ne vous identifie pas et change à chaque session.
              </p>
            </div>
          </div>
        </div>
      </div>
      <!-- Le seul avertissement d'éphémérité de l'application — à sa place, là où
           l'identité vit. Il dit la CONSÉQUENCE et non la propriété : « session
           détruite » se lisait comme une garantie de confidentialité, déjà donnée
           trois fois ailleurs (entrée, infobulle de l'empreinte, « Comment ça
           marche »). Ce que personne n'anticipe, c'est l'absence d'historique —
           rien où revenir demain, et aucun garde-fou à la fermeture de l'onglet. -->
      <p class="mt-2 text-[11px] leading-relaxed text-faint">
        Aucun historique&nbsp;: fermer l'onglet efface la session et les conversations.
      </p>
    </div>

    <RoomBrowser v-if="browser" :onClose="() => st.setRoomBrowser(false)" />
    <RenameModal v-if="renaming" :current="me.pseudo" :onClose="() => (renaming = false)" />
  </div>
</template>
