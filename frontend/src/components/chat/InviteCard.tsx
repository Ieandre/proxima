import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import { acceptInvite, revokeInvite } from '../../lib/socket';
import { inviteUrl } from '../../lib/links';
import { Avatar, Icon } from '../ui';
import { Note } from '../rooms/RoomCard';

/**
 * Fiche d'invitation à une conversation privée. Dépliée sous son bouton dans la
 * barre latérale, même mécanique que `RoomCard` : ancrée dans un conteneur
 * défilant, elle ne peut ni se détacher ni être rognée.
 *
 * Les deux temps du rendez-vous tiennent dans un seul cadre — le lien à donner,
 * puis la personne qui l'a ouvert — parce que c'est une seule attente. Un
 * dialogue surgissant à l'arrivée ferait sursauter l'écran au moment précis où
 * l'on doit lire un pseudo avant de décider.
 *
 * La paire de nœuds en tête affiche l'état du rendez-vous (place tenue, place
 * vide qui respire, place occupée) : c'est le seul endroit du produit où
 * l'attente doit se lire sans phrase.
 */
export function InviteCard() {
  const invite = useStore((s) => s.invite);
  const awaiting = useStore((s) => s.awaitingInvite);
  const me = useStore((s) => s.me);
  const showToast = useStore((s) => s.showToast);

  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const frame = useRef<HTMLDivElement | null>(null);

  // Dépliée en bas d'une liste défilante, la fiche naîtrait hors de l'écran. Le
  // composant reste monté en permanence (il ne rend rien sans rendez-vous en
  // cours) : c'est donc l'apparition de la fiche qu'on suit, pas le montage.
  useEffect(() => {
    frame.current?.scrollIntoView({ block: 'nearest' });
  }, [invite?.token, awaiting?.pseudo]);

  // Le retour de la copie s'efface de lui-même : c'est un accusé, pas un état.
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2200);
    return () => clearTimeout(t);
  }, [copied]);

  if (!me) return null;

  // Versant invité : on s'est présenté, la main est à l'autre. Même cadre et même
  // paire de nœuds que côté hôte — c'est le même rendez-vous, vu de l'autre bout.
  if (!invite && awaiting) {
    return (
      <div className="invite-card" ref={frame}>
        <div className="invite-pair" aria-hidden="true">
          <Avatar id={me.id} pseudo={me.pseudo} size={30} />
          <span className="invite-pair__wire" />
          <span className="invite-pair__empty" />
        </div>
        <p className="invite-card__lede" role="status">
          En attente de <strong>{awaiting.pseudo}</strong>, qui doit confirmer l'ouverture.
        </p>
        <div className="room-card__notes">
          <Note icon="info">
            {awaiting.pseudo} vérifie qu'il s'agit bien de vous, sur le canal où le lien vous a été envoyé.
          </Note>
        </div>
      </div>
    );
  }

  if (!invite) return null;

  const url = inviteUrl(invite.token);
  const guest = invite.guest;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Presse-papiers refusé (contexte non sécurisé, permission) : l'adresse
      // reste sélectionnable à l'écran, on le dit plutôt que d'échouer en silence.
      showToast('Copie impossible — sélectionnez l’adresse pour la copier.', 'warn');
    }
  }

  async function open() {
    if (busy || !invite) return;
    setBusy(true);
    setError(null);
    const res = await acceptInvite(invite.token);
    setBusy(false);
    if (!res.ok) setError(res.error || "L'ouverture a échoué.");
  }

  return (
    <div className="invite-card" ref={frame}>
      {/* ---- État du rendez-vous : deux places, un lien ------------------ */}
      <div className="invite-pair" aria-hidden="true">
        <Avatar id={me.id} pseudo={me.pseudo} size={30} />
        <span className={`invite-pair__wire${guest ? ' invite-pair__wire--live' : ''}`} />
        {guest ? (
          <Avatar id={guest.id} pseudo={guest.pseudo} size={30} />
        ) : (
          <span className="invite-pair__empty" />
        )}
      </div>

      {guest ? (
        <>
          <p className="invite-card__lede" role="status">
            <strong>{guest.pseudo}</strong> a ouvert votre lien.
          </p>
          <div className="room-card__notes">
            <Note icon="info">
              Vérifiez sur le canal où vous avez envoyé le lien qu'il s'agit bien de la bonne personne.
            </Note>
            <Note icon="lock">En ouvrant, vous échangez vos clés de chiffrement — rien d'autre.</Note>
          </div>

          {error && <p className="room-card__error">{error}</p>}

          <div className="room-card__actions">
            <button type="button" className="btn btn-ghost" onClick={() => revokeInvite(invite.token)} disabled={busy}>
              Refuser
            </button>
            <button type="button" className="btn btn-primary" onClick={open} disabled={busy}>
              <Icon name="arrowRight" size={15} />
              {busy ? 'Ouverture…' : 'Ouvrir'}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="invite-card__lede">Envoyez cette adresse à la personne de votre choix.</p>

          {/* Une adresse est une donnée, pas une phrase : elle est en chasse fixe,
              sélectionnable, et se lit caractère par caractère. */}
          <div className="invite-url">
            <span className="invite-url__text">{url}</span>
            <button type="button" className="invite-url__copy" onClick={copy}>
              <Icon name={copied ? 'check' : 'copy'} size={14} />
              {copied ? 'Copié' : 'Copier'}
            </button>
          </div>

          <div className="room-card__notes">
            <Note icon="users">La première personne qui ouvre ce lien prend la place.</Note>
            <Note icon="check">Vous confirmerez avant que la conversation s'ouvre.</Note>
            <Note icon="clock">Le lien ne vit que tant que cet onglet reste ouvert.</Note>
          </div>

          <div className="room-card__actions">
            <button type="button" className="btn btn-ghost" onClick={() => revokeInvite(invite.token)}>
              Retirer le lien
            </button>
          </div>
        </>
      )}
    </div>
  );
}
