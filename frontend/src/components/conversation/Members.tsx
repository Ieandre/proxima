import { useState } from 'react';
import { kickMember, openPmWithMember } from '../../lib/socket';
import { type JoinedRoom, type RoomMember } from '../../lib/types';
import { Avatar, Icon } from '../ui';


export function MembersPanel({
  room,
  meId,
  isOwner,
  roomId,
  open,
  onClose,
}: {
  room: JoinedRoom;
  meId: string;
  isOwner: boolean;
  roomId: string;
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  const list = <MembersList room={room} meId={meId} isOwner={isOwner} roomId={roomId} />;
  // « Présents » et non « membres » : on n'adhère à rien ici, on est là ou on n'y est
  // plus. Le même mot est employé dans le panneau de gauche et dans l'en-tête.
  const title = (
    <div className="mb-1.5 flex items-center px-2 pt-2.5 text-[11px] font-semibold text-faint">
      Présents · {room.members.length}
    </div>
  );

  return (
    <>
      {/* Desktop : colonne latérale à droite, scroll indépendant (n'impacte pas la hauteur de lecture). */}
      <aside className="hidden w-56 flex-none flex-col border-l border-line bg-paper md:flex lg:w-64">
        {title}
        {list}
      </aside>

      {/* Mobile : panneau glissant en superposition, fermé par le fond ou la croix. */}
      <div className="md:hidden">
        <div className="absolute inset-0 z-20 bg-black/40" onClick={onClose} aria-hidden />
        <aside className="fade-up absolute inset-y-0 right-0 z-30 flex w-64 max-w-[82%] flex-col border-l border-line bg-card shadow-2xl">
          <div className="flex items-center border-b border-line px-3 py-2.5">
            <span className="text-[11px] font-semibold text-faint">
              Présents · {room.members.length}
            </span>
            <button className="ml-auto text-faint hover:text-ink" onClick={onClose} aria-label="Fermer la liste">
              <Icon name="close" size={16} />
            </button>
          </div>
          {list}
        </aside>
      </div>
    </>
  );
}

function MembersList({
  room,
  meId,
  isOwner,
  roomId,
}: {
  room: JoinedRoom;
  meId: string;
  isOwner: boolean;
  roomId: string;
}) {
  return (
    <div className="scroll min-h-0 flex-1 overflow-y-auto px-2 pb-2">
      <ul className="flex flex-col gap-0.5">
        {room.members.map((m) => (
          <MemberRow key={m.id} member={m} room={room} meId={meId} isOwner={isOwner} roomId={roomId} />
        ))}
      </ul>
    </div>
  );
}

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

function MemberRow({
  member,
  room,
  meId,
  isOwner,
  roomId,
}: {
  member: RoomMember;
  room: JoinedRoom;
  meId: string;
  isOwner: boolean;
  roomId: string;
}) {
  const [opening, setOpening] = useState(false);
  const isMe = member.id === meId;

  async function writeInPrivate() {
    if (opening) return;
    setOpening(true);
    const res = await openPmWithMember(roomId, member, room.name);
    // Succès : le fil remplace le salon à l'écran, cette ligne est démontée avec
    // lui — il n'y a plus d'état à rendre. On ne relâche donc qu'en cas d'échec
    // (personne partie entre-temps), où la ligne, elle, est toujours là.
    if (!res.ok) setOpening(false);
  }

  return (
    <li className="member-row">
      <Avatar id={member.id} pseudo={member.pseudo} size={28} />
      <span className="member-row__name">
        {room.owner === member.id && (
          <span className="flex-none text-blue" title="Propriétaire du salon">
            <Icon name="crown" size={12} />
          </span>
        )}
        <span className="truncate">{member.pseudo}</span>
        {isMe && <span className="flex-none text-[11px] text-faint">(vous)</span>}
      </span>

      {!isMe && (
        <span className="member-row__actions">
          <button
            className="member-row__action"
            onClick={writeInPrivate}
            disabled={opening}
            title={`Écrire à ${member.pseudo} en privé`}
            aria-label={`Écrire à ${member.pseudo} en privé`}
          >
            <Icon name="chat" size={14} />
          </button>
          {isOwner && (
            <button
              className="member-row__action member-row__action--danger"
              onClick={() => kickMember(roomId, member.id)}
              title={`Exclure ${member.pseudo} du salon`}
              aria-label={`Exclure ${member.pseudo} du salon`}
            >
              <Icon name="kick" size={14} />
            </button>
          )}
        </span>
      )}
    </li>
  );
}
