import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useStore } from '../../store/useStore';
import { joinRoom, leaveRoom } from '../../lib/socket';
import type { RoomEntry } from '../../lib/rooms';
import { Icon, Modal } from '../ui';

/**
 * Fiche d'entrée / de sortie d'un salon.
 *
 * Entrer annonce publiquement votre pseudo aux présents (`room:system`) : le
 * geste est irréversible pour les autres. Cette fiche cite la phrase exacte
 * qu'ils vont lire, AVANT d'agir, et laisse repartir sans que personne n'ait
 * rien su.
 *
 * Elle sert les deux sens et les trois chemins d'entrée — liste latérale
 * (`layout="inline"`), lien `?r=`, menu du salon (`layout="dialog"`) — pour
 * qu'un seul texte porte la même promesse partout.
 *
 * Elle n'affiche JAMAIS qui est présent dans un salon où l'on n'est pas encore,
 * seulement combien : la discrétion est réciproque.
 */

export type RoomCardMode = 'enter' | 'leave';

/** Le strict nécessaire pour décrire un salon : une entrée de liste, ou un pré-vol de lien. */
export type RoomCardTarget = Pick<RoomEntry, 'id' | 'name' | 'region' | 'official' | 'encrypted' | 'private'> &
  Partial<Pick<RoomEntry, 'count' | 'salt' | 'alone'>>;

export function RoomCard({
  room,
  mode,
  layout = 'inline',
  initialPassword,
  onDone,
  onCancel,
}: {
  room: RoomCardTarget;
  mode: RoomCardMode;
  layout?: 'inline' | 'dialog';
  /** Mot de passe transporté par le fragment `#p=` d'un lien d'accès (jamais envoyé au serveur). */
  initialPassword?: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const me = useStore((s) => s.me);
  // Un salon chiffré exige la dérivation locale de la clé : son sel public est donc
  // la condition du champ de mot de passe (sans sel, rien à dériver).
  const needsPassword = mode === 'enter' && room.encrypted && !!room.salt;

  const [password, setPassword] = useState(initialPassword || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstField = useRef<HTMLInputElement | null>(null);
  const confirm = useRef<HTMLButtonElement | null>(null);
  const frame = useRef<HTMLDivElement | null>(null);

  // Dépliée sous la dernière ligne d'une liste défilante, la fiche naîtrait hors de
  // l'écran : on la ramène dans le champ de vision, sans plus de défilement que
  // nécessaire (`nearest`), pour ne pas déplacer une liste déjà lisible.
  useEffect(() => {
    frame.current?.scrollIntoView({ block: 'nearest' });
  }, []);

  // Échap referme : la sortie doit être aussi immédiate que l'ouverture, sinon la
  // fiche devient un piège plutôt qu'un temps d'arrêt.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  // Le clavier arrive directement sur l'action : saisir puis Entrée suffit.
  useEffect(() => {
    (needsPassword ? firstField.current : confirm.current)?.focus();
  }, [needsPassword]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (mode === 'leave') {
      leaveRoom(room.id);
      onDone();
      return;
    }
    if (needsPassword && !password) return;
    setBusy(true);
    setError(null);
    const res = await joinRoom(
      needsPassword ? { roomId: room.id, password, salt: room.salt } : { roomId: room.id },
    );
    setBusy(false);
    if (res.ok) onDone();
    else setError(res.error || "L'entrée a échoué.");
  }

  const pseudo = me?.pseudo || 'Vous';
  const nature = room.encrypted
    ? 'Chiffré de bout en bout'
    : room.region
      ? 'Salon de votre région'
      : room.private
        ? 'Salon privé'
        : 'Salon public';

  const body = (
    <form onSubmit={submit}>
      {/* Pas de titre : dépliée, la fiche est collée sous la ligne qui porte déjà le nom
          et ses étiquettes ; en dialogue, c'est l'en-tête de la modale qui le porte.
          L'écrire une troisième fois ne ferait qu'éloigner la conséquence du bouton. */}
      <p className="room-card__meta">
        {nature}
        {room.count ? ` · ${room.count} présent${room.count > 1 ? 's' : ''}` : ''}
      </p>

      {needsPassword && (
        <input
          ref={firstField}
          className="input mt-3"
          type="password"
          placeholder="Mot de passe du salon"
          maxLength={64}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      )}

      <div className="room-card__notes">
        {room.region ? (
          <Note icon="eye-off">
            {mode === 'enter'
              ? 'Entrée et sortie discrètes : le salon de votre région ne prévient personne.'
              : 'Sortie discrète : personne ne sera prévenu·e. Vous pourrez revenir depuis cette liste.'}
          </Note>
        ) : (
          <Note icon="info">
            {mode === 'enter' ? 'En entrant, ' : 'En sortant, '}les présents verront{' '}
            {/* Espaces insécables à l'intérieur des guillemets : la typographie française
                les impose, et elles empêchent au passage le « de rester seul en fin de ligne. */}
            <span className="room-card__quote">
              «&nbsp;{pseudo} {mode === 'enter' ? 'est entré·e dans le salon' : 'est sorti·e du salon'}&nbsp;»
            </span>
            .
          </Note>
        )}

        {needsPassword && (
          <Note icon="lock">Le mot de passe ne quitte pas votre appareil : la clé est dérivée ici.</Note>
        )}
        {mode === 'leave' && room.alone && (
          <Note icon="clock">Vous êtes seul·e ici : le salon disparaîtra en sortant.</Note>
        )}
        {mode === 'leave' && room.encrypted && (
          <Note icon="key">Il faudra ressaisir le mot de passe pour revenir.</Note>
        )}
      </div>

      {error && <p className="room-card__error">{error}</p>}

      <div className="room-card__actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Annuler
        </button>
        <button
          ref={confirm}
          type="submit"
          className={`btn ${mode === 'leave' ? 'btn-danger' : 'btn-primary'}`}
          disabled={busy || (needsPassword && !password)}
        >
          {mode === 'leave' ? (
            <>
              <Icon name="logout" size={15} />
              Sortir
            </>
          ) : (
            <>
              <Icon name="arrowRight" size={15} />
              {busy ? 'Entrée…' : 'Entrer'}
            </>
          )}
        </button>
      </div>
    </form>
  );

  if (layout === 'dialog') {
    return (
      <Modal
        title={mode === 'leave' ? `Sortir de « ${room.name} »` : `Entrer dans « ${room.name} »`}
        onClose={onCancel}
      >
        {body}
      </Modal>
    );
  }
  return (
    <div className="room-card" ref={frame}>
      {body}
    </div>
  );
}

/* Une conséquence par ligne, chacune avec son signe : la personne doit pouvoir en
   compter les effets d'un coup d'œil plutôt que lire un paragraphe.
   Exporté et partagé avec la fiche d'invitation (`InviteCard`) : les deux fiches
   énoncent le même genre de promesse, elles doivent le faire de la même façon. */
export function Note({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <p className="room-card__note">
      <span className="room-card__note-icon">
        <Icon name={icon} size={13} />
      </span>
      <span>{children}</span>
    </p>
  );
}
