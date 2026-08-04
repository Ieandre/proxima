import { useEffect, useMemo, useRef, useState } from 'react';
import { mediaFromClipboard } from '../../lib/media';
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
  /**
   * Média collé au presse-papiers, en attente de confirmation. Le trombone envoie
   * sur-le-champ — le choix du fichier est un geste explicite, avec son propre
   * aperçu dans la boîte de dialogue du système. Un Cmd+V, lui, est une frappe :
   * il peut lâcher dans un salon public une capture qu'on avait copiée pour tout
   * autre chose. D'où cet arrêt avant envoi, propre au collage.
   */
  const [pasted, setPasted] = useState<{ file: File; url: string; kind: 'image' | 'video' } | null>(null);
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

  // L'aperçu du collage tient par une URL d'objet : on la libère dès qu'elle est
  // remplacée, retirée ou que le champ disparaît.
  useEffect(() => {
    if (!pasted) return;
    return () => URL.revokeObjectURL(pasted.url);
  }, [pasted]);

  /** Retient le média collé, en libérant l'aperçu précédent (cf. l'effet ci-dessus). */
  function attach(file: File) {
    setPasted({ file, url: URL.createObjectURL(file), kind: file.type.startsWith('video/') ? 'video' : 'image' });
  }

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
    // Un collage en attente ne survit pas au passage en modification : contrairement
    // à un brouillon frappé, il est encore dans le presse-papiers — le recoller ne
    // coûte qu'une frappe, alors que le mettre de côté brouillerait ce que valide Entrée.
    setPasted(null);
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
    if (!t && !pasted) return;
    // Le média part avant le texte, qui le commente. Deux messages : sur le fil,
    // une pièce jointe ne transporte pas de légende.
    if (pasted) {
      onMedia?.(pasted.file);
      setPasted(null);
    }
    if (t) onSend(t.slice(0, 2000));
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

      {pasted && (
        <div className="reply-bar reply-bar--media fade-up">
          {pasted.kind === 'image' ? (
            <img className="reply-bar__thumb" src={pasted.url} alt="" />
          ) : (
            <video className="reply-bar__thumb" src={pasted.url} muted playsInline />
          )}
          <div className="reply-bar__body">
            <div className="reply-bar__title">{pasted.kind === 'image' ? 'Image collée' : 'Vidéo collée'}</div>
            <div className="reply-bar__text">Entrée pour envoyer, Échap pour retirer.</div>
          </div>
          <button
            className="reply-bar__close"
            onClick={() => setPasted(null)}
            aria-label="Retirer la pièce jointe collée"
            title="Retirer la pièce jointe collée"
          >
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
          onPaste={(e) => {
            // Coller une image ne vaut que là où une pièce jointe a un sens : pas en
            // modification, pas dans un fil qui n'en accepte pas.
            if (!onMedia || edit) return;
            const file = mediaFromClipboard(e.clipboardData);
            if (!file) return;
            // Le collage nous revient entièrement : au navigateur, plus rien à insérer.
            e.preventDefault();
            attach(file);
          }}
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
            } else if (e.key === 'Escape' && pasted) {
              // Le collage est le geste le plus récent : Échap le retire d'abord.
              e.preventDefault();
              setPasted(null);
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
          disabled={!text.trim() && !pasted}
          aria-label={edit ? 'Valider la modification' : 'Envoyer'}
        >
          <Icon name={edit ? 'check' : 'send'} size={17} />
        </button>
      </div>
    </div>
  );
}
