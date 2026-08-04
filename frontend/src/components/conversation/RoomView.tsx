import { useState } from 'react';
import { useStore } from '../../store/useStore';
import {
  closeRoom,
  reportRoomMessage,
  sendRoomMedia,
  sendRoomMessage,
  sendTyping,
  setRoomPassword,
} from '../../lib/socket';
import { type JoinedRoom, type Message, type ReportReason } from '../../lib/types';
import { Composer } from '../chat/Composer';
import { RoomCard } from '../rooms/RoomCard';
import { Avatar, Icon, Modal } from '../ui';
import { EmptyState, BackBar, ThreadSheet, ThreadStart, TypingIndicator , replyDraft} from './shared';
import { MembersPanel } from './Members';
import { MessageList } from './MessageList';


export function RoomView({ roomId }: { roomId: string }) {
  const room = useStore((s) => s.joinedRooms[roomId]);
  const me = useStore((s) => s.me)!;
  const messages = useStore((s) => s.threads[`room:${roomId}`]) || [];
  const showToast = useStore((s) => s.showToast);
  // Mot de passe du salon chiffré conservé en RAM (pour « copier » / lien tout-en-un). Perdu au reload.
  const roomPassword = useStore((s) => s.roomPasswords[roomId]);
  // Liste des présents : colonne à droite en desktop, panneau glissant en mobile.
  // Ouverte d'office à partir de 1280 px : en dessous, elle prendrait 224 px à la
  // colonne de lecture sur les portables, là où ça coûte le plus. La barre de
  // présence de l'en-tête dit déjà qui est là, et permet de l'ouvrir d'un clic.
  //
  // Elle s'ouvre MÊME SEUL·E : la conditionner à l'affluence rendrait la mise en
  // page instable, l'initialiseur d'un `useState` ne s'évaluant qu'au montage —
  // on entrerait dans un salon vide sans colonne, et l'arrivée d'un second
  // présent ne l'ouvrirait pas pour autant.
  const [showMembers, setShowMembers] = useState(() => window.matchMedia('(min-width: 1280px)').matches);
  const [menu, setMenu] = useState(false);
  const [pwdModal, setPwdModal] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  // Sortir annonce le départ aux présents, et peut effacer le salon (RG-05) : la même
  // fiche que dans la liste le dit avant d'agir, plutôt qu'une ligne de menu muette.
  const listed = useStore((s) => s.publicRooms.find((r) => r.id === roomId));
  const homeRoom = useStore((s) => s.homeRoom);

  if (!room) return <EmptyState />;
  const isOwner = room.owner === me.id;

  const onReport = (m: Message, reason: ReportReason) =>
    reportRoomMessage(roomId, m.msgId || '', m.media ? '(média)' : m.text, m.fromId, reason).then((res) =>
      showToast(
        res.ok ? 'Signalement transmis à la modération.' : res.error || 'Échec du signalement.',
        res.ok ? 'info' : 'warn',
      ),
    );

  function copyText(text: string, okMsg: string) {
    navigator.clipboard?.writeText(text).then(
      () => showToast(okMsg),
      () => showToast(text, 'info'),
    );
    setMenu(false);
  }

  function shareLink() {
    if (room?.encrypted) {
      // Lien tout-en-un : le mot de passe voyage dans le fragment `#p=` (jamais envoyé au serveur).
      if (!roomPassword) {
        showToast('Ressaisissez le mot de passe pour générer le lien.', 'warn');
        return;
      }
      copyText(
        `${window.location.origin}/?r=${room.id}#p=${encodeURIComponent(roomPassword)}`,
        'Lien d’accès (mot de passe inclus) copié.',
      );
      return;
    }
    if (!room?.invite) {
      showToast("Lien d'invitation disponible uniquement pour le créateur.", 'warn');
      return;
    }
    copyText(`${window.location.origin}/?r=${room.id}&k=${room.invite}`, 'Lien d’invitation copié.');
  }

  return (
    <div className="flex h-full flex-col">
      <BackBar>
        <span
          className="grid h-9 w-9 flex-none place-items-center rounded-[9px]"
          style={{ background: 'var(--color-blue-tint)', color: 'var(--color-blue)' }}
        >
          <Icon name="hash" size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="thread-title truncate">{room.name}</h2>
            {room.encrypted ? (
              <span
                className="chip chip-verified"
                title="Chiffré de bout en bout — confidentialité de groupe (l'auteur d'un message n'est pas authentifié)"
              >
                <Icon name="lock" size={10} />
                chiffré
              </span>
            ) : (
              // Pas de second « # » ici : le bloc d'icône à gauche du nom le porte déjà.
              // Le cadenas de « privé », lui, ajoute une information que le mot seul ne
              // donne pas d'un coup d'œil.
              <span className={`chip ${room.type === 'private' ? '' : 'chip-blue'}`}>
                {room.type === 'private' && <Icon name="lock" size={10} />}
                {room.type === 'private' ? 'privé' : 'public'}
              </span>
            )}
          </div>
          <PresenceBar
            members={room.members}
            open={showMembers}
            onToggle={() => setShowMembers((v) => !v)}
          />
        </div>

        <div className="relative">
          <button className="btn btn-ghost px-2.5" onClick={() => setMenu((v) => !v)} aria-label="Options du salon">
            <Icon name="dots" size={18} />
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
              <div className="panel absolute right-0 z-20 mt-1.5 w-52 overflow-hidden p-1.5 text-sm">
                {room.encrypted ? (
                  <>
                    <MenuItem icon="key" label="Copier le lien d'accès" onClick={shareLink} />
                    {roomPassword && (
                      <MenuItem
                        icon="lock"
                        label="Copier le mot de passe"
                        onClick={() => copyText(roomPassword, 'Mot de passe copié.')}
                      />
                    )}
                  </>
                ) : (
                  <>
                    {isOwner && room.invite && <MenuItem icon="key" label="Partager le lien" onClick={shareLink} />}
                    {isOwner && room.type === 'private' && (
                      <MenuItem icon="lock" label="Mot de passe" onClick={() => { setPwdModal(true); setMenu(false); }} />
                    )}
                  </>
                )}
                <MenuItem
                  icon="logout"
                  label="Sortir du salon"
                  onClick={() => { setLeaving(true); setMenu(false); }}
                />
                {isOwner && (
                  <MenuItem
                    icon="close"
                    label="Fermer le salon"
                    danger
                    onClick={() => {
                      if (window.confirm('Fermer le salon pour tout le monde ?')) closeRoom(roomId);
                      setMenu(false);
                    }}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </BackBar>

      <div className="relative flex min-h-0 flex-1">
        {/* Zone de conversation (rétrécit en largeur, jamais en hauteur, quand le panneau est ouvert). */}
        <ThreadSheet>
          <MessageList
            messages={messages}
            showNames
            onReport={onReport}
            onReply={setReplyTo}
            mentionPseudos={room.members.map((m) => m.pseudo)}
            myPseudo={me.pseudo}
            empty={
              <ThreadStart title={`Personne n'a encore écrit dans ${room.name}.`}>
                Les messages vivent le temps de la séance. Il n'y a pas d'historique à remonter&nbsp;: ce qui se dit
                ici disparaît avec les présents.
              </ThreadStart>
            }
          />

          <TypingIndicator convKey={`room:${roomId}`} />
          <Composer
            placeholder={`Message dans ${room.name}`}
            onSend={(t) => {
              sendRoomMessage(roomId, t, replyTo?.msgId);
              setReplyTo(null);
            }}
            onTyping={() => sendTyping('room', roomId)}
            onMedia={(f) => {
              sendRoomMedia(roomId, f, replyTo?.msgId);
              setReplyTo(null);
            }}
            reply={replyDraft(replyTo)}
            onCancelReply={() => setReplyTo(null)}
            // On ne se propose pas à soi-même : s'interpeller n'apprend rien à personne.
            mentionables={room.members.filter((m) => m.id !== me.id)}
          />
        </ThreadSheet>

        {/* Liste des membres : colonne latérale (desktop) ou panneau glissant (mobile). */}
        <MembersPanel
          room={room}
          meId={me.id}
          isOwner={isOwner}
          roomId={roomId}
          open={showMembers}
          onClose={() => setShowMembers(false)}
        />
      </div>

      {pwdModal && (
        <PasswordModal
          roomId={roomId}
          onClose={() => setPwdModal(false)}
          onDone={() => showToast('Mot de passe du salon mis à jour.')}
        />
      )}

      {leaving && (
        <RoomCard
          room={{
            id: roomId,
            name: room.name,
            region: roomId === homeRoom?.id,
            official: !!listed?.persistent,
            encrypted: !!room.encrypted,
            private: room.type === 'private',
            count: room.members.length,
            // RG-05 : un salon éphémère laissé vide disparaît — jamais un permanent.
            alone: room.members.length <= 1 && !listed?.persistent,
          }}
          mode="leave"
          layout="dialog"
          onDone={() => setLeaving(false)}
          onCancel={() => setLeaving(false)}
        />
      )}
    </div>
  );
}

/* Qui est là, maintenant — la seule chose vraiment caractéristique d'un salon de
   proximité. Les visages portent la couleur déterministe de leur auteur, la même que
   le liseré de leurs bulles : la couleur devient le fil conducteur de l'écran. La
   barre *est* le compte et *est* la commande — l'ancien « 2 membres · masquer »
   faisait tenir une information et un verbe dans le même lien de 11 px. */

function PresenceBar({
  members,
  open,
  onToggle,
}: {
  members: JoinedRoom['members'];
  open: boolean;
  onToggle: () => void;
}) {
  const shown = members.slice(0, 5);
  const rest = members.length - shown.length;
  return (
    <button
      className="presence"
      onClick={onToggle}
      aria-expanded={open}
      title={open ? 'Masquer la liste des présents' : 'Voir la liste des présents'}
    >
      <span className="presence__stack">
        {shown.map((m) => (
          <Avatar key={m.id} id={m.id} pseudo={m.pseudo} size={20} />
        ))}
        {rest > 0 && <span className="presence__more">+{rest}</span>}
      </span>
      <span className="presence__count">
        {members.length} présent{members.length > 1 ? 's' : ''}
      </span>
    </button>
  );
}

/* Début de fil : posé juste au-dessus du champ de saisie (la conversation est ancrée
   en bas), donc là où le regard se trouve déjà et où l'on va agir. */

function MenuItem({ icon, label, onClick, danger }: { icon: string; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-paper-2 ${
        danger ? 'text-danger' : 'text-ink'
      }`}
      onClick={onClick}
    >
      <Icon name={icon} size={15} />
      {label}
    </button>
  );
}

function PasswordModal({ roomId, onClose, onDone }: { roomId: string; onClose: () => void; onDone: () => void }) {
  const [pwd, setPwd] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Mot de passe du salon" onClose={onClose}>
      <p className="mb-3 text-sm text-muted">
        Laissez vide pour retirer le mot de passe. Les personnes disposant du lien d'invitation pourront toujours
        entrer.
      </p>
      <input
        className="input mb-4"
        type="text"
        placeholder="Nouveau mot de passe"
        value={pwd}
        maxLength={64}
        onChange={(e) => setPwd(e.target.value)}
        autoFocus
      />
      <div className="flex justify-end gap-2">
        <button className="btn btn-ghost" onClick={onClose}>
          Annuler
        </button>
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const res = await setRoomPassword(roomId, pwd);
            setBusy(false);
            if (res.ok) {
              onDone();
              onClose();
            }
          }}
        >
          Enregistrer
        </button>
      </div>
    </Modal>
  );
}

/* ---- Indicateur « est en train d'écrire » ------------------------------ */
