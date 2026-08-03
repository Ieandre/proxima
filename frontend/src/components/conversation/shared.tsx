import { useEffect, useState, type ReactNode } from 'react';
import { useStore } from '../../store/useStore';
import { type Message } from '../../lib/types';
import { type ReplyDraft } from '../chat/Composer';
import { NetworkBackground } from '../NetworkBackground';
import { Icon, Logo } from '../ui';



export const fmtTime = (ts: number) =>
  new Date(ts || Date.now()).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** Ce qu'un message donne à lire quand il est cité : son texte, ou la nature de sa pièce jointe. */
export const excerptOf = (m: Message) =>
  m.retracted ? 'Message retiré' : m.media ? (m.media.kind === 'video' ? 'Vidéo' : 'Photo') : m.text;

/**
 * Texte d'un message, mentions mises en évidence. La reconnaissance se fait contre
 * les PRÉSENTS (cf. lib/mentions) : rien dans le message ne signale une mention,
 * elle n'a donc jamais quitté les navigateurs.
 */

/** Brouillon de réponse affiché au-dessus du champ de saisie. */
export const replyDraft = (m: Message | null): ReplyDraft | null =>
  m && m.msgId
    ? { id: m.msgId, author: m.kind === 'me' ? 'votre message' : m.fromPseudo || 'ce message', excerpt: excerptOf(m) }
    : null;

export function EmptyState() {
  const me = useStore((s) => s.me);
  const radiusKm = useStore((s) => s.radiusKm);
  const setRoomBrowser = useStore((s) => s.setRoomBrowser);

  return (
    <div className="relative grid h-full place-items-center overflow-hidden p-8 text-center">
      {/* Fond vivant : réseau de nœuds reliés qui suit le curseur (réutilisé de l'onboarding). */}
      <NetworkBackground />

      <div className="fade-up relative z-10 max-w-md">
        <Logo className="mx-auto mb-6 h-16 w-16" />
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          {me ? `Bonjour, ${me.pseudo}` : 'Bienvenue dans Proxima'}
        </h2>
        <p className="mx-auto mt-2.5 max-w-sm text-[15px] leading-relaxed text-muted">
          {me?.city ? (
            <>
              Vous êtes connecté·e depuis <strong className="text-ink">{me.city}</strong>. Les salons et les personnes
              à portée sont ceux d'un rayon de {radiusKm} km.
            </>
          ) : (
            <>Choisissez un salon ou une personne à portée pour commencer à écrire.</>
          )}
        </p>

        <button className="btn btn-primary mt-7" onClick={() => setRoomBrowser(true)}>
          <Icon name="plus" size={16} />
          Créer un salon
        </button>
        <p className="mx-auto mt-4 max-w-xs text-[12.5px] leading-relaxed text-faint">
          À gauche, les salons ouverts autour de vous et les personnes à portée. Cliquez un salon pour voir ce qu'il
          est avant d'y entrer.
        </p>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
export function BackBar({ children }: { children: ReactNode }) {
  const setActive = useStore((s) => s.setActive);
  return (
    <div className="flex items-center gap-3 border-b border-line bg-card px-3 py-2.5 sm:px-4">
      <button className="btn btn-ghost px-2.5 md:hidden" onClick={() => setActive(null)} aria-label="Retour">
        <Icon name="back" size={16} />
      </button>
      {children}
    </div>
  );
}

/* ---- Messages privés (chiffrés E2E) ----------------------------------- */

export function ThreadStart({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-1 max-w-md">
      <p className="text-[13.5px] font-semibold text-ink">{title}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-faint">{children}</p>
    </div>
  );
}

/* ---- Panneau des membres (style IRC) ----------------------------------- */

export function TypingIndicator({ convKey }: { convKey: string }) {
  const typing = useStore((s) => s.typing[convKey]);
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const now = Date.now();
  const names = typing ? Object.values(typing).filter((v) => v.until > now).map((v) => v.pseudo) : [];
  if (names.length === 0) return null;

  const label =
    names.length === 1
      ? `${names[0]} est en train d'écrire`
      : names.length === 2
        ? `${names[0]} et ${names[1]} sont en train d'écrire`
        : 'Plusieurs personnes écrivent';

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 text-[12px] text-muted">
      <span className="typing-dots" aria-hidden>
        <span>•</span>
        <span>•</span>
        <span>•</span>
      </span>
      {label}…
    </div>
  );
}

/* ---- Message cité (réponse) -------------------------------------------- */
/* La citation est résolue dans le fil local : rien de son contenu n'a transité par
   le réseau, seul l'identifiant du message l'a fait. Un message reçu avant l'arrivée
   du lecteur (ou déjà purgé) reste donc introuvable — on le dit plutôt que de
   reconstituer un historique que le produit ne conserve pas (RG-01). */
