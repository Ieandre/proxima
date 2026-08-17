<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { identify, peekInvite } from '../../lib/socket';
import { useStore } from '../../store/useStore';
import { randomPseudo } from '../../lib/pseudo';
import type { CitySuggestion } from '../../lib/types';
import { FAQ } from '../../lib/faq';
import SiteFooter from '../layout/SiteFooter.vue';
import TopBar from '../layout/TopBar.vue';
import { Icon, Logo } from '../ui';
import OnionDoor from './OnionDoor.vue';
import Lifeline from './Lifeline.vue';
import NetworkBackground from '../NetworkBackground.vue';


/* Comparaison de noms de ville insensible à la casse et aux accents, pour
   reconnaître « chalons » comme « Châlons » — même esprit que le `normalize`
   de `server/cities.js`, sans lequel une saisie complète mais non accentuée
   exigerait un clic de plus dans la liste. */
const norm = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

const st = useStore();

// Pseudo tiré au sort d'emblée : le champ cesse d'être un obstacle et devient
// une proposition — on la garde, on la relance (le dé) ou on l'écrase.
const pseudo = ref(randomPseudo());
const age = ref('');
const gender = ref<'F' | 'H' | 'A' | ''>('');
const city = ref('');
const cityChosen = ref<CitySuggestion | null>(null);
const suggestions = ref<CitySuggestion[]>([]);
const openSug = ref(false);
const highlighted = ref(0);
// Dernière requête réellement partie au serveur : distingue « pas encore
// cherché » de « cherché, rien trouvé ». Seul le second cas mérite d'expliquer
// quoi faire — l'afficher trop tôt ferait paniquer dès la deuxième lettre.
const searched = ref('');
const busy = ref(false);
const error = ref<string | null>(null);
const boxRef = ref<HTMLDivElement | null>(null);
// Le pseudo arrive déjà rempli : le premier champ à remplir est ici.
const ageRef = ref<HTMLInputElement | null>(null);
// Arrivée par un lien d'invitation (`?r=<salon>`) : on adapte l'accueil pour donner le
// contexte « vous rejoignez un salon » plutôt que la vitrine générique. Le nom du salon
// n'est révélé qu'après identification (le pré-vol serveur exige une session).
const invitedRoom = new URLSearchParams(window.location.search).has('r');
// Invitation à une conversation privée (`?i=<jeton>`). Ici le
// pré-vol n'exige aucune session : on affiche le pseudo de l'hôte AVANT le
// formulaire, pour qu'on sache à qui l'on répond avant de donner quoi que ce soit.
const inviteToken = new URLSearchParams(window.location.search).get('i');
const host = ref<string | null>(null);
const invited = invitedRoom || !!inviteToken;

/**
 * Ville pré-choisie par une page de ville (`/tchat/nancy`) : arriver par « tchat
 * Nancy » et trouver le champ déjà rempli est le service que cette page promet.
 *
 * Consommée puis effacée : sans cela, quitter la session pour recommencer
 * ailleurs réimposerait la ville de la page d'arrivée. On ne préremplit pas non
 * plus quand on vient d'une invitation — le contexte du salon primerait.
 */
onMounted(() => {
  const seed = st.citySeed;
  if (!seed || invited) return;
  city.value = seed.name;
  cityChosen.value = seed;
  st.clearCitySeed();
});

let cancelled = false;
onMounted(() => {
  ageRef.value?.focus();
  if (!inviteToken) return;
  peekInvite(inviteToken).then((res) => {
    if (cancelled) return;
    if (res.ok && res.pseudo) host.value = res.pseudo;
    else st.showToast(res.error || 'Cette invitation a expiré.', 'warn');
  });
});
onUnmounted(() => {
  cancelled = true;
});

// Autocomplétion de ville (debounce) sur la base embarquée.
watch([city, cityChosen], (_cur, _prev, onCleanup) => {
  if (cityChosen.value && city.value === cityChosen.value.name) return;
  const q = city.value.trim();
  if (q.length < 2) {
    suggestions.value = [];
    searched.value = '';
    return;
  }
  const t = setTimeout(async () => {
    try {
      const r = await fetch(`/api/cities?q=${encodeURIComponent(q)}`);
      const data = await r.json();
      const results: CitySuggestion[] = data.results || [];
      suggestions.value = results;
      highlighted.value = 0;
      searched.value = q;
      // Nom complet tapé à la main, ou code postal ne menant qu'à une seule commune :
      // on le reconnaît au lieu d'exiger un clic de plus. On recopie le nom canonique,
      // ce qui referme la boucle de cet observateur (la garde ci-dessus) en plus de
      // corriger la casse, les accents — et de remplacer le code par le nom de la commune.
      //
      // Un nom porté par plusieurs communes ne décide de rien, en revanche : depuis
      // que la base les couvre toutes, « Sainte-Colombe » en désigne douze. La liste
      // reste alors ouverte pour qu'on choisisse la sienne, au lieu d'en choisir une
      // à sa place — silencieusement, et à 500 km.
      const memeNom = results.filter((c) => norm(c.name) === norm(q));
      const exact =
        (memeNom.length === 1 ? memeNom[0] : undefined) ||
        (results.length === 1 && results[0].postal === q ? results[0] : undefined);
      if (exact) {
        city.value = exact.name;
        cityChosen.value = exact;
        openSug.value = false;
      } else {
        openSug.value = true;
      }
    } catch {
      /* hors-ligne : on ignore */
    }
  }, 160);
  onCleanup(() => clearTimeout(t));
});

const onWindowClick = (e: MouseEvent) => {
  if (boxRef.value && !boxRef.value.contains(e.target as Node)) openSug.value = false;
};
onMounted(() => window.addEventListener('mousedown', onWindowClick));
onUnmounted(() => window.removeEventListener('mousedown', onWindowClick));

function choose(sgg: CitySuggestion) {
  city.value = sgg.name;
  cityChosen.value = sgg;
  openSug.value = false;
}

function onCityInput(e: Event) {
  city.value = (e.target as HTMLInputElement).value;
  cityChosen.value = null;
}

function onCityFocus() {
  if (suggestions.value.length > 0) openSug.value = true;
}

function onCityKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    openSug.value = false;
    return;
  }
  if (!openSug.value || suggestions.value.length === 0) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    highlighted.value = Math.min(highlighted.value + 1, suggestions.value.length - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    highlighted.value = Math.max(highlighted.value - 1, 0);
  } else if (e.key === 'Enter') {
    // Sans cela, Entrée soumettrait le formulaire avec le texte brut (« met »),
    // que le serveur rejetterait faute de savoir le géocoder : le réflexe le plus
    // courant du clavier produisait l'échec le plus courant du formulaire.
    e.preventDefault();
    choose(suggestions.value[Math.min(highlighted.value, suggestions.value.length - 1)]);
  }
}

// Département/canton et pays de la commune retenue. Assemblé plutôt qu'écrit en
// gabarit : une commune pré-choisie depuis une page de ville n'a pas toujours de
// subdivision distincte de son nom (Paris, Monaco), et « — , France » se verrait.
const chosenSituation = computed(() => {
  const chosen = cityChosen.value;
  if (!chosen) return '';
  return [chosen.admin, chosen.countryLabel].filter(Boolean).join(', ');
});

const ageNum = computed(() => Number(age.value));
// La ville doit venir de la base : on le vérifie ici plutôt que de laisser le
// serveur refuser après le clic. Le genre et le pseudo ne bloquent plus rien.
const valid = computed(
  () =>
    pseudo.value.trim().length >= 2 &&
    Number.isInteger(ageNum.value) &&
    ageNum.value >= 18 &&
    ageNum.value <= 120 &&
    cityChosen.value !== null,
);

// Cherché, rien trouvé : la base couvrant toutes les communes, c'est désormais
// l'orthographe qui est en cause. Il faut le dire, et surtout dire quoi faire —
// sans quoi la liste vide est un cul-de-sac muet.
const cityMiss = computed(
  () =>
    !cityChosen.value && suggestions.value.length === 0 && searched.value !== '' && searched.value === city.value.trim(),
);

async function submit() {
  if (!valid.value || busy.value || !cityChosen.value) return;
  busy.value = true;
  error.value = null;
  const res = await identify({
    pseudo: pseudo.value.trim(),
    age: ageNum.value,
    // Genre laissé de côté : « Autre » est la valeur qui n'affirme rien.
    gender: gender.value || 'A',
    city: cityChosen.value.name,
    // L'identifiant tranche entre les homonymes ; le nom reste envoyé, il sert
    // de repli au serveur et de valeur lisible dans la mémoire d'onglet.
    cityId: cityChosen.value.id,
  });
  if (!res.ok) {
    error.value = res.error || 'Échec de la connexion.';
    busy.value = false;
  }
}

const genders = [
  ['F', 'Femme'],
  ['H', 'Homme'],
  ['A', 'Autre'],
] as const;

/* Contenus de la chronologie : le `what` était un fragment JSX (ReactNode), il
   devient du HTML statique rendu par `v-html` — même balisage, même rendu. */
const inviteItems = [
  {
    when: 'avant d’entrer',
    what: `Cette conversation n'existe que par le lien que vous avez suivi. <strong>Personne d'autre ne peut y entrer</strong>, et elle n'apparaît dans aucun annuaire.`,
  },
  {
    when: 'pendant la conversation',
    what: `Vos messages sont chiffrés sur votre appareil. Le serveur ne fait que transporter des enveloppes qu'il ne peut pas ouvrir.`,
  },
  {
    when: 'à la fermeture de l’onglet',
    what: `Votre identité de session disparaît, et vous redevenez un inconnu.`,
  },
];
const roomItems = [
  {
    when: 'avant d’entrer',
    what: `Ce salon n'est accessible que par l'adresse que vous avez suivie. Il <strong>n'apparaît dans aucun annuaire</strong>, et personne ne peut le trouver en cherchant.`,
  },
  {
    when: 'dans le salon',
    what: `Les échanges sont chiffrés sur votre appareil. Le serveur ne fait que transporter des enveloppes qu'il ne peut pas ouvrir.`,
  },
  {
    when: 'à la fermeture de l’onglet',
    what: `Votre identité de session disparaît, et vous redevenez un inconnu.`,
  },
];
const defaultItems = [
  {
    when: 'à l’ouverture',
    what: `Un pseudo, un âge, une ville. <strong>Aucun compte, aucun email</strong> — rien qui vous relie à hier ni à demain.`,
  },
  {
    when: 'pendant la visite',
    what: `Vos messages privés sont chiffrés sur votre appareil. Le serveur ne fait que transporter des enveloppes qu'il ne peut pas ouvrir.`,
  },
  {
    when: 'à la fermeture de l’onglet',
    what: `Identité, salons et conversations sont effacés. Il n'y a rien à réclamer, rien à revendre, rien à faire fuiter.`,
  },
];

/* ==========================================================================
 * Accès Tor, sur l'accueil.
 *
 * Placé APRÈS la chronologie, et pas dedans : la Lifeline énumère ce qui
 * disparaît, moment par moment. L'accès onion n'est pas un moment — c'est la
 * réponse à ce que la chronologie laisse ouvert. La page « En savoir plus »
 * l'admet noir sur blanc : une chose nous parvient encore, l'adresse IP. Ce
 * bloc est l'endroit où cette dernière réserve se lève.
 *
 * L'adresse elle-même est le sujet visuel, pas une note technique reléguée en
 * petit : c'est ce que le lecteur doit emporter. D'où l'inversion de hiérarchie
 * — la chaîne en mono tient la place que prendrait ailleurs un titre.
 *
 * Le préfixe `proxima` n'est délibérément PAS mis en valeur. Ce serait le geste
 * évident, et il est nuisible : une adresse vanity est imitable, et habituer
 * l'œil à reconnaître le début l'habitue à ne plus lire la fin — seule partie
 * qui distingue la vraie adresse d'une contrefaçon.
 * ======================================================================== */
</script>

<template>
  <div class="relative flex min-h-full flex-col">
    <!-- Fond animé : réseau de nœuds reliés qui flotte et se rassemble autour du curseur. -->
    <div class="onb-atmos" aria-hidden="true">
      <NetworkBackground />
    </div>

    <TopBar>
      <a href="/en-savoir-plus" class="link-quiet">Comment ça marche</a>
    </TopBar>

    <div
      class="relative z-10 mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-5 py-10 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16"
    >
      <!-- ---- Volet gauche : message de confiance ---------------------- -->
      <section class="order-2 lg:order-1">
        <template v-if="inviteToken">
          <span class="eyebrow-stamp fade-up" :style="{ animationDelay: '40ms' }">
            <Icon name="lock" :size="13" />
            Invitation à une conversation privée
          </span>
          <h1 class="hero-title fade-up mt-5" :style="{ animationDelay: '90ms' }">
            <!-- Le pseudo dès qu'on le connaît : savoir à qui l'on répond est la
                première chose à vérifier, avant même de choisir son propre nom. -->
            {{ host ? `${host} veut vous parler en privé.` : 'Une conversation privée vous attend.' }}
          </h1>
          <p class="hero-lede fade-up" :style="{ animationDelay: '150ms' }">
            Créez d'abord une identité de session — anonyme et éphémère. {{ host || 'Votre correspondant·e' }} confirmera
            que c'est bien vous, et la conversation s'ouvrira.
          </p>
          <Lifeline :items="inviteItems" />
        </template>
        <template v-else-if="invitedRoom">
          <span class="eyebrow-stamp fade-up" :style="{ animationDelay: '40ms' }">
            <Icon name="key" :size="13" />
            Invitation à un salon privé
          </span>
          <h1 class="hero-title fade-up mt-5" :style="{ animationDelay: '90ms' }">Un salon privé vous attend.</h1>
          <p class="hero-lede fade-up" :style="{ animationDelay: '150ms' }">
            Vous avez suivi un lien d'invitation. Créez d'abord une identité de session — anonyme et éphémère — et vous
            rejoindrez le salon aussitôt.
          </p>
          <Lifeline :items="roomItems" />
        </template>
        <template v-else>
          <h1 class="hero-title fade-up" :style="{ animationDelay: '40ms' }">
            Parlez aux gens autour de vous, sans rien révéler de vous.
          </h1>
          <p class="hero-lede fade-up" :style="{ animationDelay: '150ms' }">
            Choisissez un pseudo, entrez, discutez avec votre ville. Votre identité vit le temps d'une visite, puis il
            n'en reste rien.
          </p>
          <Lifeline :items="defaultItems" />
          <OnionDoor />
        </template>
      </section>

      <!-- ---- Volet droit : formulaire d'entrée -------------------------- -->
      <section class="order-1 lg:order-2">
        <form class="panel door relative fade-up" :style="{ animationDelay: '120ms' }" @submit.prevent="submit">
          <div class="relative z-10">
            <div class="flex items-center gap-3.5">
              <Logo className="h-10 w-10" />
              <div class="min-w-0">
                <h2 class="font-display text-xl font-semibold leading-tight tracking-tight">
                  {{ invited ? 'Créez votre identité' : 'Rejoindre Proxima' }}
                </h2>
                <p class="mt-1 text-[13px] leading-snug text-faint">Valable le temps de cet onglet.</p>
              </div>
            </div>
            <hr class="door__rule" />

            <label for="champ-pseudo" class="mb-1.5 block text-sm font-medium text-muted">Pseudo</label>
            <div class="relative mb-4">
              <input id="champ-pseudo" class="input pr-11" placeholder="ex. VoisinBleu" maxlength="24" v-model="pseudo" />
              <button
                type="button"
                class="input-action"
                title="Un autre pseudo"
                aria-label="Proposer un autre pseudo"
                @click="pseudo = randomPseudo()"
              >
                <Icon name="dice" :size="16" />
              </button>
            </div>

            <div class="mb-4 grid grid-cols-[100px_1fr] gap-3">
              <div>
                <label for="champ-age" class="mb-1.5 block text-sm font-medium text-muted">Âge</label>
                <input
                  id="champ-age"
                  ref="ageRef"
                  class="input"
                  type="number"
                  inputmode="numeric"
                  min="18"
                  max="120"
                  placeholder="18"
                  :value="age"
                  @input="age = ($event.target as HTMLInputElement).value"
                />
              </div>
              <div ref="boxRef" class="relative">
                <label for="champ-ville" class="mb-1.5 block text-sm font-medium text-muted">Ville</label>
                <input
                  id="champ-ville"
                  class="input"
                  placeholder="Commune ou code postal"
                  :value="city"
                  autocomplete="off"
                  role="combobox"
                  :aria-expanded="openSug && suggestions.length > 0"
                  aria-controls="liste-villes"
                  aria-autocomplete="list"
                  :aria-activedescendant="openSug && suggestions.length > 0 ? `ville-${highlighted}` : undefined"
                  @input="onCityInput"
                  @keydown="onCityKey"
                  @focus="onCityFocus"
                />
                <ul
                  v-if="openSug && suggestions.length > 0"
                  id="liste-villes"
                  role="listbox"
                  aria-label="Communes proposées"
                  class="panel scroll absolute z-20 mt-1.5 max-h-72 w-full overflow-auto p-1.5 text-sm"
                >
                  <!-- `role="presentation"` sur le <li> : une option doit être fille
                      directe de la liste, l'élément ne doit pas s'intercaler dans
                      l'arbre ARIA. -->
                  <li v-for="(sgg, i) in suggestions" :key="`${sgg.name}-${i}`" role="presentation">
                    <button
                      type="button"
                      :id="`ville-${i}`"
                      role="option"
                      :aria-selected="i === highlighted"
                      tabindex="-1"
                      :class="`block w-full rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-paper-2 ${
                        i === highlighted ? 'bg-paper-2' : ''
                      }`"
                      @mouseenter="highlighted = i"
                      @click="choose(sgg)"
                    >
                      <!-- Le clavier reste dans le champ : la sélection se déplace par
                          `aria-activedescendant`, ces boutons ne se prennent pas le focus. -->
                      <span class="flex items-baseline justify-between gap-2">
                        <span class="min-w-0 truncate text-ink">{{ sgg.name }}</span>
                        <span v-if="sgg.postal" class="flex-none text-[11px] text-faint">{{ sgg.postal }}</span>
                      </span>
                      <!-- Deuxième ligne : ce qui distingue deux communes du même nom.
                          Le pays reste dit même en recherche par code — « 1000 » est à
                          la fois Bruxelles et Lausanne. -->
                      <!-- Localité rattachée à une commune voisine : il faut le dire,
                          sinon la proposition a l'air de tomber du ciel. -->
                      <span class="block truncate text-[11.5px] leading-tight text-faint"
                        >{{ sgg.admin }} · {{ sgg.countryLabel }}{{ sgg.via ? ` — pour ${sgg.via}` : '' }}</span
                      >
                    </button>
                  </li>
                </ul>
              </div>
            </div>

            <!-- La commune retenue est redite en clair : l'autocomplétion reconnaît un nom
                tapé en entier, et douze communes s'appellent « Sainte-Colombe » — on doit
                pouvoir vérifier d'un coup d'œil que c'est bien la sienne. -->
            <p v-if="cityChosen" class="-mt-2 mb-4 text-[12px] leading-snug text-muted">
              Vous entrerez depuis <strong class="font-medium text-ink">{{ cityChosen.name }}</strong
              ><span v-if="chosenSituation" class="text-faint"> — {{ chosenSituation }}</span
              >.
            </p>
            <p v-else-if="cityMiss" class="-mt-2 mb-4 text-[12px] leading-snug text-muted">
              Rien sous ce nom. Toutes les communes de France, Belgique, Suisse, Luxembourg et Monaco sont dans la
              liste : vérifiez l'orthographe, ou tapez votre <strong class="font-medium">code postal</strong>.
            </p>

            <span class="mb-1.5 block text-sm font-medium text-muted" id="lbl-genre"
              >Genre <span class="font-normal text-faint">— facultatif</span></span
            >
            <div class="segmented mb-5" role="radiogroup" aria-labelledby="lbl-genre">
              <!-- Re-cliquer sur le choix actif le retire : un champ facultatif doit
                  pouvoir redevenir vide, sinon il ne l'est qu'avant le premier clic. -->
              <button
                v-for="[val, label] in genders"
                :key="val"
                type="button"
                role="radio"
                :aria-checked="gender === val"
                @click="gender = gender === val ? '' : val"
              >
                {{ label }}
              </button>
            </div>

            <div
              v-if="error"
              class="mb-4 flex items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--color-danger)_35%,transparent)] bg-[var(--color-danger-tint)] px-3 py-2 text-sm text-danger"
            >
              {{ error }}
            </div>

            <button class="btn btn-primary w-full" :disabled="!valid || busy">
              <span v-if="busy" class="spin"><Icon name="clock" /></span>
              <Icon v-else name="arrowRight" />
              <!-- « Entrer » partout, comme dans les salons et leurs annonces
 : un seul verbe pour un seul geste. -->
              {{
                busy
                  ? 'Connexion…'
                  : inviteToken
                    ? 'Entrer dans la conversation'
                    : invitedRoom
                      ? 'Entrer dans le salon'
                      : 'Entrer dans le service'
              }}
            </button>

            <!-- Une seule déclaration de majorité (RG-04) : le champ âge suffit, une case à
                cocher redirait la même chose. Elle porte sur le geste d'entrer, et se place
                sous le bouton pour rester sous les yeux au moment du clic. -->
            <p class="mt-3.5 text-[11.5px] leading-relaxed text-faint">
              En entrant, je certifie avoir <strong class="text-muted">18 ans ou plus</strong> et j'accepte les
              <a href="/cgu" class="underline underline-offset-2 hover:text-blue">conditions d'utilisation</a> et la
              <a href="/moderation" class="underline underline-offset-2 hover:text-blue">politique de modération</a>.
              Les contenus illégaux sont interdits et signalables.
            </p>
          </div>
        </form>
      </section>
    </div>

    <!-- La FAQ de la coquille statique, réaffichée par l'application : le FAQPage
        du JSON-LD n'est valable que si les questions restent visibles sur la page
        rendue, et la coquille disparaît au montage (cf. lib/faq.ts). Absente des
        arrivées par invitation, comme la vitrine qu'elle prolonge. Repliée par
        défaut : le contenu est dans le DOM (ce que demande Google), sans disputer
        l'écran au geste d'entrer. -->
    <section v-if="!invited" class="relative z-10 mx-auto w-full max-w-2xl px-5 pb-16 sm:px-8">
      <h2 class="text-center text-[13px] font-semibold text-faint">Questions fréquentes</h2>
      <div class="mt-4">
        <details v-for="item in FAQ" :key="item.q" class="group border-b border-line/60">
          <summary
            class="flex cursor-pointer list-none items-baseline justify-between gap-4 py-3 text-[14px] font-medium text-ink transition-colors hover:text-blue [&::-webkit-details-marker]:hidden"
          >
            {{ item.q }}
            <span
              aria-hidden="true"
              class="flex-none text-[15px] font-normal text-faint transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none"
              >+</span
            >
          </summary>
          <p class="pb-4 pr-8 text-[13.5px] leading-relaxed text-muted">{{ item.a }}</p>
        </details>
      </div>
    </section>

    <SiteFooter />
  </div>
</template>
