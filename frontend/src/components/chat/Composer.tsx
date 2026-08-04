import { useEffect, useMemo, useRef, useState } from 'react';
import { applyMention, mentionQuery } from '../../lib/mentions';
import type { RoomMember } from '../../lib/types';
import { Avatar, Icon } from '../ui';

/** Message auquel on répond, tel qu'il s'affiche au-dessus du champ de saisie. */
export type ReplyDraft = { id: string; author: string; excerpt: string };

/** Message que l'on retouche : son texte revient dans le champ, tel qu'il a été envoyé. */
export type EditDraft = { id: string; text: string };

const MAX_SUGGESTIONS = 6;

/** Le champ prend la hauteur de son contenu, borné — à la frappe comme au chargement d'un texte à retoucher. */
function fitHeight(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 160) + 'px';
}

export function Composer({
  onSend,
  placeholder,
  onTyping,
  onMedia,
  reply,
  onCancelReply,
  edit,
  onCancelEdit,
  mentionables,
}: {
  onSend: (text: string) => void;
  placeholder: string;
  onTyping?: () => void;
  onMedia?: (file: File) => void;
  reply?: ReplyDraft | null;
  onCancelReply?: () => void;
  /**
   * Modification en cours. Le champ de saisie sert aussi à retoucher : la
   * frappe, l'auto-complétion des mentions et Entrée valent déjà là, et une
   * seconde zone d'édition dans la bulle les redemanderait toutes.
   */
  edit?: EditDraft | null;
  onCancelEdit?: () => void;
  /** Présents que l'on peut interpeller — absent en MP, où il n'y a qu'un interlocuteur. */
  mentionables?: RoomMember[];
}) {
  const [text, setText] = useState('');
  // Mention en cours de frappe : position du « @ » et requête saisie derrière.
  const [pending, setPending] = useState<{ start: number; query: string; caret: number } | null>(null);
  const [highlighted, setHighlighted] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  // Message en cours de rédaction, mis de côté le temps d'une modification.
  // `null` = on ne modifie rien, donc rien n'est en attente d'être rendu.
  const parkedDraft = useRef<string | null>(null);

  const suggestions = useMemo(() => {
    if (!pending || !mentionables?.length) return [];
    const q = pending.query.toLowerCase();
    return mentionables.filter((m) => m.pseudo.toLowerCase().includes(q)).slice(0, MAX_SUGGESTIONS);
  }, [pending, mentionables]);

  const open = suggestions.length > 0;

  /** Relit la mention en cours à partir de l'état réel du champ (frappe, clic, flèches). */
  function syncPending(el: HTMLTextAreaElement) {
    if (!mentionables?.length) return;
    const caret = el.selectionStart ?? el.value.length;
    const found = mentionQuery(el.value, caret);
    setPending(found ? { ...found, caret } : null);
    setHighlighted(0);
  }

  function pick(pseudo: string) {
    if (!pending) return;
    const next = applyMention(text, pending.start, pending.caret, pseudo);
    setText(next.text);
    setPending(null);
    const el = areaRef.current;
    if (el) {
      // Le curseur doit repartir derrière le pseudo inséré, pas en fin de champ :
      // on complète souvent une mention au milieu d'une phrase déjà écrite.
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(next.caret, next.caret);
      });
    }
  }

  // Cliquer « répondre » doit poser le curseur dans le champ : sans cela, l'action
  // se voit mais ne mène nulle part — il faut encore aller cliquer pour écrire.
  useEffect(() => {
    if (reply) areaRef.current?.focus();
  }, [reply?.id]);

  /**
   * Entrer en modification charge le texte d'origine ; en sortir — validée ou
   * abandonnée — rend le brouillon qu'on avait en cours. Sans cette mise de côté,
   * cliquer « modifier » au milieu d'une phrase l'effacerait sans recours.
   */
  useEffect(() => {
    if (edit) {
      // Seulement à l'ENTRÉE : passer d'un message à l'autre ne doit pas prendre
      // la retouche en cours pour un brouillon.
      if (parkedDraft.current === null) parkedDraft.current = text;
      setText(edit.text);
      areaRef.current?.focus();
    } else if (parkedDraft.current !== null) {
      setText(parkedDraft.current);
      parkedDraft.current = null;
    } else {
      return; // premier rendu, rien à charger ni à rendre
    }
    setPending(null);
    // La hauteur se règle une image plus tard : le texte qu'on vient de poser
    // n'est pas encore dans le DOM, `scrollHeight` mesurerait l'ancien.
    requestAnimationFrame(() => {
      if (areaRef.current) fitHeight(areaRef.current);
    });
    // Le texte n'est PAS une dépendance : cet effet ne joue qu'au passage d'un
    // état à l'autre, sinon chaque frappe rechargerait le texte d'origine.
  }, [edit?.id]);

  function send() {
    const t = text.trim();
    if (!t) return;
    onSend(t.slice(0, 2000));
    // Une modification validée n'a pas à effacer le champ elle-même : le parent
    // referme l'édition, ce qui rend son brouillon (cf. l'effet ci-dessus).
    if (!edit) setText('');
    setPending(null);
    if (areaRef.current) areaRef.current.style.height = 'auto';
  }

  return (
    <div className="thread-composer relative border-t border-line bg-card px-3 py-3 sm:px-4">
      {open && (
        <ul className="mention-list fade-up" role="listbox" aria-label="Personnes à mentionner">
          {suggestions.map((m, i) => (
            <li key={m.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === highlighted}
                className={`mention-option ${i === highlighted ? 'mention-option--on' : ''}`}
                // `mousedown` plutôt que `click` : au `blur` du champ la liste se
                // ferme, et le clic n'arriverait jamais jusqu'ici.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(m.pseudo);
                }}
                onMouseEnter={() => setHighlighted(i)}
              >
                <Avatar id={m.id} pseudo={m.pseudo} size={22} />
                <span className="truncate">{m.pseudo}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {edit && (
        <div className="reply-bar reply-bar--edit fade-up">
          <div className="reply-bar__body">
            <div className="reply-bar__title">Modification du message</div>
            <div className="reply-bar__text">Entrée pour valider, Échap pour abandonner.</div>
          </div>
          <button
            className="reply-bar__close"
            onClick={onCancelEdit}
            aria-label="Abandonner la modification"
            title="Abandonner la modification"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      {reply && !edit && (
        <div className="reply-bar fade-up">
          <div className="reply-bar__body">
            <div className="reply-bar__title">Réponse à {reply.author}</div>
            <div className="reply-bar__text">{reply.excerpt || '—'}</div>
          </div>
          <button className="reply-bar__close" onClick={onCancelReply} aria-label="Annuler la réponse" title="Annuler la réponse">
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        {onMedia && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onMedia(f);
                e.target.value = '';
              }}
            />
            <button
              className="btn btn-ghost h-[44px] px-3"
              onClick={() => fileRef.current?.click()}
              // Une pièce jointe ne remplace pas un texte : le bouton reste en
              // place mais inerte, plutôt que de disparaître sous le curseur.
              disabled={!!edit}
              aria-label="Joindre une photo ou une vidéo"
              title={edit ? 'Modification en cours' : 'Joindre une photo ou une vidéo'}
            >
              <Icon name="paperclip" size={18} />
            </button>
          </>
        )}
        <textarea
          ref={areaRef}
          className="scroll input max-h-40 min-h-[44px] flex-1 resize-none py-3 leading-snug"
          aria-label={placeholder}
          rows={1}
          placeholder={placeholder}
          value={text}
          maxLength={2000}
          onChange={(e) => {
            setText(e.target.value);
            if (e.target.value.trim()) onTyping?.();
            syncPending(e.target);
            fitHeight(e.target);
          }}
          onSelect={(e) => syncPending(e.currentTarget)}
          onBlur={() => setPending(null)}
          onKeyDown={(e) => {
            // La liste de mentions capte d'abord les touches de navigation : sans
            // cela, Entrée enverrait le message au lieu de valider le pseudo visé.
            if (open) {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const step = e.key === 'ArrowDown' ? 1 : suggestions.length - 1;
                setHighlighted((h) => (h + step) % suggestions.length);
                return;
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                pick(suggestions[highlighted].pseudo);
                return;
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setPending(null);
                return;
              }
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            } else if (e.key === 'Escape' && (edit || reply)) {
              // Échap abandonne la retouche ou la réponse en cours avant de
              // fermer quoi que ce soit d'autre.
              e.preventDefault();
              if (edit) onCancelEdit?.();
              else onCancelReply?.();
            }
          }}
        />
        <button
          className="btn btn-primary h-[44px] px-4"
          onClick={send}
          disabled={!text.trim()}
          aria-label={edit ? 'Valider la modification' : 'Envoyer'}
        >
          <Icon name={edit ? 'check' : 'send'} size={17} />
        </button>
      </div>
    </div>
  );
}
