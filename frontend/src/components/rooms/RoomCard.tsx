import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useStore } from '../../store/useStore';
import { joinRoom, leaveRoom } from '../../lib/socket';
import type { RoomEntry } from '../../lib/rooms';
import { Icon, Modal } from '../ui';

/**
 * Fiche d'entrée / de sortie d'un salon.
 *
 * Elle ne s'ouvre plus que quand elle a quelque chose à DEMANDER ou à DÉTRUIRE.
 * Un salon en clair s'ouvre d'un clic sur sa ligne : le serveur n'annonce aucune
 * arrivée, et sortir se fait dans le même geste — il n'y avait donc rien à faire
 * confirmer, seulement une route à barrer.
 *
 * Restent ses deux cas porteurs :
 *  - ENTRER dans un salon chiffré, où le mot de passe est la condition de la clé
 *    (dérivée ici, jamais envoyée) ;
 *  - SORTIR, qui peut effacer le salon (RG-05), coûter la ressaisie du mot de
 *    passe, et — pour qui a pris la parole — s'annoncer aux présents.
 *
 * Elle sert les deux sens et les deux chemins (liste latérale `layout="inline"`,
 * lien `?r=` et menu du salon `layout="dialog"`), pour qu'un seul texte porte la
 * même promesse partout.
 *
 * Elle n'affiche JAMAIS qui est présent dans un salon où l'on n'est pas encore,
 * seulement combien : la discrétion est réciproque.
 */

export type RoomCardMode = 'enter' | 'leave';

/** Le strict nécessaire pour décrire un salon : une entrée de liste, ou un pré-vol de lien. */
export type RoomCardTarget = Pick<RoomEntry, 'id' | 'name' | 'region' | 'official' | 'encrypted' | 'locked' | 'private'> &
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
  // A-t-on pris la parole ici ? C'est ce qui décide si le départ sera annoncé aux
  // présents (le serveur applique la même règle, cf. `announceLeave`). Lu dans le
  // fil local plutôt que compté à part : un message à soi y est déjà marqué `me`,
  // et le fil survit à une sortie — comme la mémoire qu'en garde le serveur.
  const spoke = useStore((s) => (s.threads[`room:${room.id}`] || []).some((m) => m.kind === 'me'));

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
  // La nature dit ce QU'EST le salon. Le chiffrement n'en fait plus partie : tous le
  // sont, et l'annoncer ici évincerait la seule information que la fiche donnait
  // (région, privé, public). Il est dit plus bas, avec sa portée exacte.
  const nature = room.region
    ? 'Salon de votre région'
    : room.locked
      ? 'Salon privé chiffré'
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
        {/* Rien sur l'entrée : elle ne prévient personne, dans aucun salon. La
            présence se lit dans la liste des présents, une fois dedans. */}
        {mode === 'leave' &&
          (room.region || !spoke ? (
            <Note icon="eye-off">
              Sortie discrète : personne ne sera prévenu·e.
              {room.region
                ? ' Vous pourrez revenir depuis cette liste.'
                : " Vous n'avez rien écrit ici."}
            </Note>
          ) : (
            <Note icon="info">
              En sortant, les présents verront{' '}
              {/* Espaces insécables à l'intérieur des guillemets : la typographie française
                  les impose, et elles empêchent au passage le « de rester seul en fin de ligne. */}
              <span className="room-card__quote">«&nbsp;{pseudo} est sorti·e du salon&nbsp;»</span>.
            </Note>
          ))}

        {needsPassword && (
          <Note icon="lock">Le mot de passe ne quitte pas votre appareil : la clé est dérivée ici.</Note>
        )}
        {mode === 'leave' && room.alone && (
          <Note icon="clock">Vous êtes seul·e ici : le salon disparaîtra en sortant.</Note>
        )}
        {/* Ce que le chiffrement d'un salon PUBLIC protège, dit sans le survendre : il met
            le contenu hors de portée de l'hébergeur, et de personne d'autre — puisque
            entrer suffit pour recevoir la clé. */}
        {mode === 'enter' && room.encrypted && !room.locked && (
          <Note icon="lock">
            Chiffré de bout en bout : l’hébergeur ne peut pas lire ce salon. Toute personne qui y entre, en revanche,
            en reçoit la clé.
          </Note>
        )}
        {mode === 'leave' && room.locked && (
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
