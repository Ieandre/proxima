import { Fragment, useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import { createInvite, joinRoom, leaveRoom, refreshPresence } from '../../lib/socket';
import { fingerprint } from '../../lib/crypto';
import { buildRoomList, communityStart, filterRooms, normalize, type RoomEntry } from '../../lib/rooms';
import { splitPeople } from '../../lib/people';
import { GENDER_LABEL, type Gender } from '../../lib/types';
import { Avatar, Icon } from '../ui';
import { RoomBrowser } from '../rooms/RoomBrowser';
import { RoomCard, type RoomCardMode } from '../rooms/RoomCard';
import { InviteCard } from '../chat/InviteCard';
import { RenameModal } from './RenameModal';
import { RoomRow, SectionTitle, PersonRow, Empty } from './rows';


export function Sidebar() {
  const me = useStore((s) => s.me)!;
  const people = useStore((s) => s.people);
  const pmPeers = useStore((s) => s.pmPeers);
  const joinedRooms = useStore((s) => s.joinedRooms);
  const publicRooms = useStore((s) => s.publicRooms);
  const threads = useStore((s) => s.threads);
  const unread = useStore((s) => s.unread);
  const mentioned = useStore((s) => s.mentioned);
  const active = useStore((s) => s.active);
  const setActive = useStore((s) => s.setActive);
  // Salon de région, épinglé en tête de la liste des salons.
  const homeRoom = useStore((s) => s.homeRoom);
  // Création de salon, ouvrable aussi depuis l'écran d'accueil.
  const browser = useStore((s) => s.roomBrowser);
  const setBrowser = useStore((s) => s.setRoomBrowser);
  // Invitation par lien : un seul lien vivant à la fois, d'où
  // le bouton qui s'efface au profit de la fiche tant qu'une invitation est ouverte.
  const invite = useStore((s) => s.invite);
  const awaiting = useStore((s) => s.awaitingInvite);
  const showToast = useStore((s) => s.showToast);

  const [fp, setFp] = useState('········');
  // Explication de l'empreinte de session : ouverte au survol, ou épinglée au clic
  // (seule voie au tactile, où le survol n'existe pas).
  const [hoverKey, setHoverKey] = useState(false);
  const [pinKey, setPinKey] = useState(false);
  const keyOpen = hoverKey || pinKey;
  const [roomsOpen, setRoomsOpen] = useState(true);
  const [renaming, setRenaming] = useState(false);
  // Fiche dépliée sous une ligne, quand il y a un mot de passe à demander ou un
  // salon à détruire en sortant. Sinon, la ligne agit seule (cf. `enterRoom`).
  const [card, setCard] = useState<{ id: string; mode: RoomCardMode } | null>(null);
  // Salon dont l'entrée est en cours : la ligne le dit, le temps de l'aller-retour.
  const [joining, setJoining] = useState<string | null>(null);
  const [roomQuery, setRoomQuery] = useState('');
  const [hereOnly, setHereOnly] = useState(false);
  const [inviting, setInviting] = useState(false);

  // Recherche par pseudo + filtres (genre, âge) sur la proximité.
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [genders, setGenders] = useState<Set<Gender>>(new Set());
  const [ageMin, setAgeMin] = useState('');
  const [ageMax, setAgeMax] = useState('');

  useEffect(() => {
    try {
      setFp(fingerprint());
    } catch {
      /* crypto pas encore prêt — sans gravité */
    }
  }, []);

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
    if (r.here) return setActive({ kind: 'room', id: r.id });
    // Seul un salon VERROUILLÉ passe par la carte : elle n'y sert qu'à réclamer le mot
    // de passe. Un salon public est chiffré lui aussi, mais sa clé ne s'y demande pas —
    // elle lui sera remise par un membre, et le clic doit donc entrer directement.
    if (r.locked) return setCard({ id: r.id, mode: 'enter' });
    if (joining) return;
    setJoining(r.id);
    const res = await joinRoom({ roomId: r.id });
    setJoining(null);
    if (!res.ok) showToast(res.error || "L'entrée a échoué.", 'warn');
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
    const spoke = (threads[`room:${r.id}`] || []).some((m) => m.kind === 'me');
    if (r.alone || r.locked || (!r.region && spoke)) return setCard({ id: r.id, mode: 'leave' });
    leaveRoom(r.id);
  }

  async function startInvite() {
    if (inviting) return;
    setInviting(true);
    const res = await createInvite();
    setInviting(false);
    if (!res.ok) showToast(res.error || "Le lien n'a pas pu être créé.", 'warn');
  }

  const toggleGender = (g: Gender) =>
    setGenders((prev) => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });
  const resetFilters = () => {
    setGenders(new Set());
    setAgeMin('');
    setAgeMax('');
  };
  const activeFilters = genders.size + (ageMin ? 1 : 0) + (ageMax ? 1 : 0);

  // Répartition des personnes : « ai-je un fil ? », jamais la distance. Logique et
  // justification dans `lib/people.ts`, avec ses tests.
  const { conversations, nearby } = useMemo(
    () => splitPeople({ people, pmPeers, threads }),
    [people, pmPeers, threads],
  );

  const presentCount = Object.keys(people).length;
  const q = normalize(search.trim());
  const min = ageMin ? Number(ageMin) : 0;
  const max = ageMax ? Number(ageMax) : 999;
  const filteredNearby = nearby.filter(
    (p) =>
      (!q || normalize(p.pseudo).includes(q)) &&
      (genders.size === 0 || genders.has(p.gender)) &&
      p.age >= min &&
      p.age <= max,
  );

  // Liste UNIQUE des salons, d'ordre stable : y entrer ne déplace jamais la ligne
  // (cf. `lib/rooms`). Un seul rang à parcourir des yeux, quel que soit son état.
  const rooms = useMemo(
    () => buildRoomList({ publicRooms, joinedRooms, homeRoom }),
    [publicRooms, joinedRooms, homeRoom],
  );
  const visibleRooms = filterRooms(rooms, { query: roomQuery, hereOnly });
  const communityFrom = communityStart(visibleRooms);
  const hereCount = rooms.filter((r) => r.here).length;
  // Les outils accompagnent la liste dès qu'elle existe, comme la recherche de pseudos
  // au-dessus : les faire apparaître passé un seuil aurait déplacé la liste sous eux, au
  // moment précis où elle s'allonge. Sur une liste vide, en revanche, il n'y a rien à filtrer.
  const showTools = rooms.length > 0;


  const isActive = (kind: 'pm' | 'room', id: string) => active?.kind === kind && active.id === id;

  return (
    <div className="flex h-full flex-col bg-paper">
      <div className="scroll flex-1 overflow-y-auto px-3 py-4">
        {/* ---- À proximité --------------------------------------------- */}
        <SectionTitle
          icon="pin"
          title="À proximité"
          count={nearby.length}
          action={
            <button className="text-faint transition-colors hover:text-blue" onClick={refreshPresence} title="Actualiser">
              <Icon name="radar" size={15} />
            </button>
          }
        />

        {/* Recherche + filtres */}
        <div className="list-tools">
          <div className="list-tools__field">
            <span className="list-tools__icon">
              <Icon name="search" size={14} />
            </span>
            <input
              className="input"
              placeholder="Rechercher un pseudo…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            className={`list-tools__btn${activeFilters || showFilters ? ' list-tools__btn--on' : ''}`}
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            title="Filtrer par genre et âge"
          >
            <Icon name="filter" size={15} />
            {activeFilters > 0 && <span className="list-tools__count">{activeFilters}</span>}
          </button>
        </div>

        {showFilters && (
          <div className="mb-3 rounded-xl border border-line bg-card p-3">
            <div className="mb-1.5 text-[11px] font-medium text-faint">Genre</div>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {(['F', 'H', 'A'] as const).map((g) => {
                const on = genders.has(g);
                return (
                  <button
                    key={g}
                    onClick={() => toggleGender(g)}
                    className="chip cursor-pointer"
                    style={
                      on
                        ? {
                            borderColor: 'var(--color-blue)',
                            background: 'var(--color-blue-tint)',
                            color: 'var(--color-blue)',
                          }
                        : undefined
                    }
                  >
                    {GENDER_LABEL[g]}
                  </button>
                );
              })}
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <div>
                <div className="mb-1 text-[11px] font-medium text-faint">Âge min</div>
                <input
                  className="input py-1.5 text-sm"
                  type="number"
                  min={18}
                  placeholder="18"
                  value={ageMin}
                  onChange={(e) => setAgeMin(e.target.value)}
                />
              </div>
              <div>
                <div className="mb-1 text-[11px] font-medium text-faint">Âge max</div>
                <input
                  className="input py-1.5 text-sm"
                  type="number"
                  min={18}
                  placeholder="99"
                  value={ageMax}
                  onChange={(e) => setAgeMax(e.target.value)}
                />
              </div>
            </div>
            {activeFilters > 0 && (
              <button className="text-xs font-medium text-blue hover:underline" onClick={resetFilters}>
                Réinitialiser les filtres
              </button>
            )}
          </div>
        )}

        {presentCount === 0 ? (
          <Empty text="Personne près de vous pour l'instant." />
        ) : nearby.length === 0 ? (
          /* Il y a du monde autour, mais on a déjà un fil avec chacun : le dire,
             plutôt que de laisser croire que le rayon s'est vidé. */
          <Empty text="Personne de nouveau autour de vous." />
        ) : filteredNearby.length === 0 ? (
          <Empty text="Aucune personne ne correspond à votre recherche." />
        ) : (
          <ul className="mb-5 flex flex-col gap-1">
            {filteredNearby.map((p) => (
              <PersonRow
                key={p.id}
                p={p}
                active={isActive('pm', p.id)}
                unread={unread[`pm:${p.id}`] || 0}
                onClick={() => setActive({ kind: 'pm', id: p.id })}
              />
            ))}
          </ul>
        )}

        {/* ---- Salons (liste unique, repliable) ------------------------ */}
        <div className="mb-2 mt-1 flex items-center gap-2 px-1">
          <button
            className="flex flex-1 items-center gap-2 text-left"
            onClick={() => setRoomsOpen((v) => !v)}
            aria-expanded={roomsOpen}
            title={roomsOpen ? 'Replier les salons' : 'Déplier les salons'}
          >
            <span
              className="text-faint transition-transform"
              style={{ transform: roomsOpen ? 'rotate(90deg)' : 'none' }}
            >
              <Icon name="arrowRight" size={13} />
            </span>
            <span className="text-[12px] font-semibold text-muted">Salons</span>
            <span className="text-[11px] tabular-nums text-faint">{rooms.length}</span>
          </button>
          <button
            className="text-faint transition-colors hover:text-blue"
            onClick={() => setBrowser(true)}
            title="Créer un salon"
          >
            <Icon name="plus" size={16} />
          </button>
        </div>

        {roomsOpen && (
          <div className="mb-5">
            {showTools && (
              <div className="list-tools">
                <div className="list-tools__field">
                  <span className="list-tools__icon">
                    <Icon name="search" size={14} />
                  </span>
                  <input
                    className="input"
                    placeholder="Rechercher un salon…"
                    value={roomQuery}
                    onChange={(e) => setRoomQuery(e.target.value)}
                  />
                </div>
                {/* Un filtre, pas un regroupement : l'ordre reste le même dans les deux vues.
                    Désactivé tant qu'on n'est nulle part — un filtre dont le seul résultat
                    possible est une liste vide ne doit pas se laisser presser. */}
                <button
                  className={`list-tools__btn${hereOnly ? ' list-tools__btn--on' : ''}`}
                  onClick={() => setHereOnly((v) => !v)}
                  aria-pressed={hereOnly}
                  disabled={hereCount === 0 && !hereOnly}
                  title="N'afficher que les salons où vous êtes présent·e"
                >
                  J'y suis
                  <span className="list-tools__count">{hereCount}</span>
                </button>
              </div>
            )}

            {rooms.length === 0 ? (
              <p className="mb-2 px-1 text-[13px] leading-snug text-faint">
                Aucun salon ouvert pour l'instant. Créez le premier.
              </p>
            ) : visibleRooms.length === 0 ? (
              <p className="mb-2 px-1 text-[13px] leading-snug text-faint">Aucun salon ne correspond.</p>
            ) : (
              <ul className="mb-2 flex flex-col gap-1">
                {visibleRooms.map((r, i) => (
                  <Fragment key={r.id}>
                    {i === communityFrom && <li className="room-divider">Créés par la communauté</li>}
                    <li>
                      <RoomRow
                        room={r}
                        open={isActive('room', r.id)}
                        peeking={card?.id === r.id}
                        joining={joining === r.id}
                        unread={unread[`room:${r.id}`] || 0}
                        mention={!!mentioned[`room:${r.id}`]}
                        onEnter={() => enterRoom(r)}
                        onLeave={() => exitRoom(r)}
                      />
                      {card?.id === r.id && (
                        <RoomCard
                          room={r}
                          mode={card.mode}
                          onDone={() => setCard(null)}
                          onCancel={() => setCard(null)}
                        />
                      )}
                    </li>
                  </Fragment>
                ))}
              </ul>
            )}

            <button className="btn btn-ghost mt-1 w-full" onClick={() => setBrowser(true)}>
              <Icon name="plus" size={15} />
              Créer un salon
            </button>
          </div>
        )}

        {/* ---- Conversations privées ----------------------------------- */}
        {/* Toutes les conversations, présents et absents confondus (cf. `conversations`) :
            un fil ne change plus de section quand son correspondant se déplace.

            Section permanente, et terminée par « Inviter quelqu'un » en miroir exact de
            « Créer un salon » sous la liste des salons : deux listes, deux commandes de
            création, même grammaire. Conditionnée à son contenu comme elle l'était, le
            geste n'aurait eu nulle part où s'accrocher tant qu'on n'avait parlé à
            personne — précisément l'état de qui veut inviter quelqu'un. */}
        <SectionTitle icon="lock" title="Conversations privées" count={conversations.length || undefined} />
        {conversations.length > 0 && (
          <ul className="mb-2 flex flex-col gap-1">
            {conversations.map((p) => (
              <PersonRow
                key={p.id}
                p={p}
                /* Hors de portée = un état de la ligne, pas une place dans la
                   colonne : la personne peut s'éloigner et revenir sans que sa
                   conversation ne bouge d'un pixel. */
                offRadar={!people[p.id]}
                active={isActive('pm', p.id)}
                unread={unread[`pm:${p.id}`] || 0}
                onClick={() => setActive({ kind: 'pm', id: p.id })}
              />
            ))}
          </ul>
        )}
        {/* La fiche remplace le bouton au lieu de s'ajouter sous lui : un rendez-vous
            en cours EST l'état de cette section, et deux commandes empilées auraient
            laissé croire que la fiche appartenait au bouton. */}
        {!invite && !awaiting && (
          <button className="btn btn-ghost mt-1 w-full" onClick={startInvite} disabled={inviting}>
            <Icon name="plus" size={15} />
            {inviting ? 'Ouverture…' : 'Inviter quelqu’un'}
          </button>
        )}
        <InviteCard />
      </div>

      {/* ---- Carte d'identité de session ------------------------------- */}
      <div className="border-t border-line bg-card px-3 py-3">
        <div className="flex items-center gap-2.5">
          <Avatar id={me.id} pseudo={me.pseudo} size={36} />
          <div className="min-w-0 flex-1">
            {/* On entre souvent sous un pseudo tiré au sort : il faut pouvoir le
                remplacer par le sien une fois installé. */}
            <button
              className="group flex min-w-0 max-w-full items-center gap-1.5 text-left"
              onClick={() => setRenaming(true)}
              title="Changer de pseudo"
            >
              <span className="truncate text-sm font-semibold">{me.pseudo}</span>
              <span className="flex-none text-faint transition-colors group-hover:text-blue">
                <Icon name="pencil" size={12} />
              </span>
            </button>
            <div className="text-[11px] text-faint">
              {me.city} · {me.age} ans
            </div>
          </div>
          {/* Empreinte : le mono est fonctionnel ici — elle se compare caractère par
              caractère. Brute, « D2 BD 4F 48 » ne dit rien à qui arrive : le survol
              (ou le clic, au tactile) déplie l'explication au-dessus, sans décaler la
              carte. Pas de `title` — l'infobulle native ferait doublon au survol. */}
          <div
            className="relative flex-none"
            onMouseEnter={() => setHoverKey(true)}
            onMouseLeave={() => setHoverKey(false)}
          >
            <button
              className="chip chip-verified cursor-help font-mono"
              onClick={() => setPinKey((v) => !v)}
              onFocus={() => setHoverKey(true)}
              onBlur={() => setHoverKey(false)}
              aria-expanded={keyOpen}
            >
              <Icon name="lock" size={10} /> {fp}
            </button>
            {keyOpen && (
              <div className="popover-anchor">
                <div className="popover fade-up">
                  <div className="text-[12px] font-semibold">Votre clé de session</div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                    L'empreinte de la clé qui chiffre vos messages privés, générée sur votre appareil à l'arrivée. Le
                    serveur ne la voit jamais. Elle ne vous identifie pas et change à chaque session.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
        {/* Le seul avertissement d'éphémérité de l'application — à sa place, là où
            l'identité vit. Il dit la CONSÉQUENCE et non la propriété : « session
            détruite » se lisait comme une garantie de confidentialité, déjà donnée
            trois fois ailleurs (entrée, infobulle de l'empreinte, « Comment ça
            marche »). Ce que personne n'anticipe, c'est l'absence d'historique —
            rien où revenir demain, et aucun garde-fou à la fermeture de l'onglet. */}
        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          Aucun historique&nbsp;: fermer l'onglet efface la session et les conversations.
        </p>
      </div>

      {browser && <RoomBrowser onClose={() => setBrowser(false)} />}
      {renaming && <RenameModal current={me.pseudo} onClose={() => setRenaming(false)} />}
    </div>
  );
}

/**
 * Changement de pseudo en cours de session. Deux choses sont dites franchement,
 * parce qu'elles surprendraient sinon : les messages déjà envoyés gardent l'ancien
 * nom (rien n'est réécrit), et le changement est annoncé dans les salons où l'on
 * est présent — c'est cette annonce qui empêche de changer d'identité au milieu
 * d'une conversation sans que personne ne le voie.
 */
