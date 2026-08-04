import { type ReactNode } from 'react';
import { type RoomEntry } from '../../lib/rooms';
import { GENDER_LABEL, type Gender, type Person } from '../../lib/types';
import { Avatar, Icon } from '../ui';


export function RoomRow({
  room,
  open,
  peeking,
  joining,
  unread,
  mention,
  onEnter,
  onLeave,
}: {
  room: RoomEntry;
  open: boolean;
  peeking: boolean;
  /** Entrée en cours : la ligne est le seul endroit où l'attente peut se voir. */
  joining?: boolean;
  unread: number;
  mention?: boolean;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const icon = room.region ? 'pin' : room.encrypted || room.private ? 'lock' : 'hash';
  const meta = [
    room.count === null
      ? "vous n'y êtes plus"
      : room.count === 0
        ? 'vide'
        : `${room.count} présent${room.count > 1 ? 's' : ''}`,
    !room.here && room.encrypted ? 'mot de passe' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className={`room-row${room.here ? ' room-row--here' : ''}${open ? ' room-row--open' : ''}${
        peeking ? ' room-row--peeking' : ''
      }`}
    >
      <button
        className="room-row__main"
        onClick={onEnter}
        disabled={joining}
        /* Un salon chiffré est le seul dont le clic n'entre pas tout de suite : il
           demande le mot de passe dont la clé se dérive. Ailleurs, la ligne ouvre. */
        title={
          room.here
            ? `Ouvrir ${room.name}`
            : room.encrypted
              ? `Entrer dans ${room.name} (mot de passe)`
              : `Entrer dans ${room.name}`
        }
      >
        <span className="room-row__tile">
          <Icon name={icon} size={15} />
        </span>
        <span className="room-row__body">
          <span className="room-row__title">
            <span className="truncate">{room.name}</span>
            {room.region && <span className="room-tag room-tag--region">Votre région</span>}
            {room.official && !room.region && <span className="room-tag">officiel</span>}
          </span>
          <span className="room-row__meta">{meta}</span>
        </span>
        <UnreadBadge n={unread} mention={mention} />
      </button>

      {/* Ouvrir un salon où l'on est doit rester un clic sur la ligne : la sortie est
          donc une commande à part, discrète, révélée au survol (toujours visible au
          doigt — un survol n'existe pas, et une action invisible non plus). */}
      <span className="room-row__aside">
        {joining ? (
          /* Toujours visible, contrairement au chevron : c'est le seul signe que le
             clic a été pris pendant que l'accusé du serveur se fait attendre. */
          <span className="room-row__go room-row__go--busy spin" role="status" aria-label="Entrée en cours">
            <Icon name="clock" size={15} />
          </span>
        ) : room.here ? (
          <button
            className="room-row__more"
            onClick={onLeave}
            aria-label={`Sortir de ${room.name}`}
            title="Sortir du salon"
          >
            <Icon name="dots" size={16} />
          </button>
        ) : (
          <span className="room-row__go" aria-hidden="true">
            <Icon name="arrowRight" size={15} />
          </span>
        )}
      </span>
    </div>
  );
}

export function SectionTitle({
  icon,
  title,
  count,
  action,
}: {
  icon: string;
  title: string;
  /* Omis plutôt que 0 quand la section n'a rien à dénombrer : « Conversations
     privées 0 » compterait une absence, là où « À proximité 0 » constate un vide
     réel autour de soi. */
  count?: number;
  action?: ReactNode;
}) {
  return (
    <div className="mb-2 mt-1 flex items-center gap-2 px-1">
      <span className="text-faint">
        <Icon name={icon} size={14} />
      </span>
      <span className="text-[12px] font-semibold text-muted">{title}</span>
      {count !== undefined && <span className="text-[11px] tabular-nums text-faint">{count}</span>}
      <span className="ml-auto">{action}</span>
    </div>
  );
}

export function PersonRow({
  p,
  active,
  unread,
  offRadar,
  onClick,
}: {
  p: Person;
  active: boolean;
  unread: number;
  offRadar?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors ${
        active ? 'border-[var(--color-blue)] bg-blue-tint' : 'border-transparent hover:bg-card'
      }`}
    >
      <Avatar id={p.id} pseudo={p.pseudo} size={34} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold">{p.pseudo}</span>
          {!offRadar && <GenderTag g={p.gender} />}
        </span>
        <span className="text-[11px] text-faint">
          {offRadar || !p.city ? 'hors de portée' : `${p.city} · ${p.age} ans`}
        </span>
      </span>
      <UnreadBadge n={unread} />
    </button>
  );
}

function GenderTag({ g }: { g: Gender }) {
  return (
    <span
      className="flex-none rounded px-1 text-[9.5px] font-semibold uppercase leading-tight"
      style={{ border: '1px solid var(--color-line-strong)', color: 'var(--color-muted)' }}
      title={GENDER_LABEL[g]}
    >
      {g}
    </span>
  );
}

/* Deux informations distinctes dans une même pastille : combien de messages, et
   s'il y en a un qui vous nomme. Le « @ » et la teinte violette suffisent à faire
   remonter le salon dans l'attention sans ajouter un second marqueur à côté. */

function UnreadBadge({ n, mention }: { n: number; mention?: boolean }) {
  if (!n) return null;
  return (
    <span
      className="grid h-5 min-w-[20px] flex-none place-items-center rounded-full px-1.5 text-[10px] tabular-nums font-semibold text-white"
      style={{ background: mention ? 'var(--color-accent)' : 'var(--color-blue)' }}
      title={mention ? 'On vous a mentionné·e' : undefined}
    >
      {mention ? '@' : ''}
      {n > 9 ? '9+' : n}
    </span>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="mb-5 px-1 text-[13px] leading-snug text-faint">{text}</p>;
}
