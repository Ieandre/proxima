<script setup lang="ts">
import { reactive } from 'vue';
import { kickMember, openPmWithMember } from '../../lib/socket';
import { type JoinedRoom, type RoomMember } from '../../lib/types';
import { Avatar, Icon } from '../ui';

const props = defineProps<{
  room: JoinedRoom;
  meId: string;
  isOwner: boolean;
  roomId: string;
  open: boolean;
  onClose: () => void;
}>();

/**
 * Une ligne de présent, et les gestes qu'on peut avoir envers la personne
 *.
 *
 * « Écrire en privé » est ici et pas ailleurs parce que c'est ici qu'on cherche
 * quelqu'un dont on vient de lire un message. La ligne entière n'est pas cliquable :
 * ce panneau répond d'abord à « qui est là », et transformer sa consultation en
 * ouverture de conversation privée aurait fait du parcours des yeux un acte.
 *
 * Les deux commandes tiennent donc dans un rail à droite, révélé au survol comme la
 * sortie de salon dans la barre latérale — et toujours visible au doigt, où le
 * survol n'existe pas. L'exclusion s'y range aussi : deux icônes allumées en
 * permanence sur chaque ligne auraient chargé le panneau d'un bruit constant pour
 * un geste rare.
 */

// Ouverture de MP en cours, par présent — l'état que chaque ligne portait pour
// elle-même dans la version React (les deux rendus, colonne et panneau, le partagent).
const opening = reactive<Record<string, boolean>>({});

async function writeInPrivate(member: RoomMember) {
  if (opening[member.id]) return;
  opening[member.id] = true;
  const res = await openPmWithMember(props.roomId, member, props.room.name);
  // Succès : le fil remplace le salon à l'écran, cette ligne est démontée avec
  // lui — il n'y a plus d'état à rendre. On ne relâche donc qu'en cas d'échec
  // (personne partie entre-temps), où la ligne, elle, est toujours là.
  if (!res.ok) opening[member.id] = false;
}
</script>

<template>
  <template v-if="open">
    <!-- Desktop : colonne latérale à droite, scroll indépendant (n'impacte pas la hauteur de lecture). -->
    <aside class="hidden w-56 flex-none flex-col border-l border-line bg-paper md:flex lg:w-64">
      <!-- « Présents » et non « membres » : on n'adhère à rien ici, on est là ou on n'y est
           plus. Le même mot est employé dans le panneau de gauche et dans l'en-tête. -->
      <div class="mb-1.5 flex items-center px-2 pt-2.5 text-[11px] font-semibold text-faint">
        Présents · {{ room.members.length }}
      </div>
      <div class="scroll min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <ul class="flex flex-col gap-0.5">
          <li v-for="m in room.members" :key="m.id" class="member-row">
            <Avatar :id="m.id" :pseudo="m.pseudo" :size="28" />
            <span class="member-row__name">
              <span v-if="room.owner === m.id" class="flex-none text-blue" title="Propriétaire du salon">
                <Icon name="crown" :size="12" />
              </span>
              <span class="truncate">{{ m.pseudo }}</span>
              <span v-if="m.id === meId" class="flex-none text-[11px] text-faint">(vous)</span>
            </span>

            <span v-if="m.id !== meId" class="member-row__actions">
              <button
                class="member-row__action"
                :disabled="!!opening[m.id]"
                :title="`Écrire à ${m.pseudo} en privé`"
                :aria-label="`Écrire à ${m.pseudo} en privé`"
                @click="writeInPrivate(m)"
              >
                <Icon name="chat" :size="14" />
              </button>
              <button
                v-if="isOwner"
                class="member-row__action member-row__action--danger"
                :title="`Exclure ${m.pseudo} du salon`"
                :aria-label="`Exclure ${m.pseudo} du salon`"
                @click="kickMember(roomId, m.id)"
              >
                <Icon name="kick" :size="14" />
              </button>
            </span>
          </li>
        </ul>
      </div>
    </aside>

    <!-- Mobile : panneau glissant en superposition, fermé par le fond ou la croix. -->
    <div class="md:hidden">
      <div class="absolute inset-0 z-20 bg-black/40" aria-hidden="true" @click="onClose" />
      <aside class="fade-up absolute inset-y-0 right-0 z-30 flex w-64 max-w-[82%] flex-col border-l border-line bg-card shadow-2xl">
        <div class="flex items-center border-b border-line px-3 py-2.5">
          <span class="text-[11px] font-semibold text-faint">
            Présents · {{ room.members.length }}
          </span>
          <button class="ml-auto text-faint hover:text-ink" aria-label="Fermer la liste" @click="onClose">
            <Icon name="close" :size="16" />
          </button>
        </div>
        <div class="scroll min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          <ul class="flex flex-col gap-0.5">
            <li v-for="m in room.members" :key="m.id" class="member-row">
              <Avatar :id="m.id" :pseudo="m.pseudo" :size="28" />
              <span class="member-row__name">
                <span v-if="room.owner === m.id" class="flex-none text-blue" title="Propriétaire du salon">
                  <Icon name="crown" :size="12" />
                </span>
                <span class="truncate">{{ m.pseudo }}</span>
                <span v-if="m.id === meId" class="flex-none text-[11px] text-faint">(vous)</span>
              </span>

              <span v-if="m.id !== meId" class="member-row__actions">
                <button
                  class="member-row__action"
                  :disabled="!!opening[m.id]"
                  :title="`Écrire à ${m.pseudo} en privé`"
                  :aria-label="`Écrire à ${m.pseudo} en privé`"
                  @click="writeInPrivate(m)"
                >
                  <Icon name="chat" :size="14" />
                </button>
                <button
                  v-if="isOwner"
                  class="member-row__action member-row__action--danger"
                  :title="`Exclure ${m.pseudo} du salon`"
                  :aria-label="`Exclure ${m.pseudo} du salon`"
                  @click="kickMember(roomId, m.id)"
                >
                  <Icon name="kick" :size="14" />
                </button>
              </span>
            </li>
          </ul>
        </div>
      </aside>
    </div>
  </template>
</template>
