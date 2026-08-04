import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { splitMentions } from '../../lib/mentions';
import { REPORT_REASON_LABEL, type MediaAttachment, type Message, type ReportReason } from '../../lib/types';
import { avatarColor, Modal } from '../ui';
import { excerptOf, fmtTime } from './shared';


export function MessageList({
  messages,
  showNames,
  empty,
  onReport,
  onReply,
  onEdit,
  editingId,
  mentionPseudos,
  myPseudo,
}: {
  messages: Message[];
  showNames: boolean;
  /** Écran vide : propre à chaque contexte, donc écrit par l'appelant (il connaît le nom). */
  empty?: ReactNode;
  onReport?: (m: Message, reason: ReportReason) => void;
  onReply?: (m: Message) => void;
  onEdit?: (m: Message) => void;
  /** `msgId` du message en cours de retouche — la bulle reste repérable pendant qu'on la réécrit. */
  editingId?: string;
  /** Pseudos reconnus comme mentions — les présents du salon ; vide en MP. */
  mentionPseudos?: string[];
  myPseudo?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [reportTarget, setReportTarget] = useState<Message | null>(null);
  // Message mis en évidence après un saut vers une citation ; s'éteint tout seul.
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const byId = useMemo(() => {
    const map = new Map<string, Message>();
    for (const m of messages) if (m.msgId) map.set(m.msgId, m);
    return map;
  }, [messages]);

  // La liste des présents est reconstruite à chaque rendu par l'appelant : on la
  // stabilise sur son contenu, sinon chaque bulle redécouperait son texte pour rien.
  const pseudoKey = (mentionPseudos || []).join('\u0000');
  const pseudos = useMemo(() => (pseudoKey ? pseudoKey.split('\u0000') : []), [pseudoKey]);

  function jumpTo(id: string) {
    const el = ref.current?.querySelector<HTMLElement>(`[data-msg="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setFlash(id);
    window.setTimeout(() => setFlash((cur) => (cur === id ? null : cur)), 1600);
  }

  return (
    <>
      <div ref={ref} className="scroll flex-1 overflow-y-auto px-3 py-4 sm:px-5">
        {/* `justify-end` + `min-h-full` : la conversation pousse depuis le bas, contre le
            champ de saisie. Empilée par le haut, une pièce de deux messages laissait
            600 px de vide sous eux et donnait un salon à l'abandon. */}
        <div className="flex min-h-full w-full flex-col justify-end gap-1">
          {messages.length === 0 && empty}
          {messages.map((m, i) => {
            if (m.kind === 'system') {
              return (
                <div key={m.localId} className="bubble bubble-system my-1">
                  {m.text}
                </div>
              );
            }
            const prev = messages[i - 1];
            const next = messages[i + 1];
            const sameSender = !!prev && prev.kind === m.kind && prev.fromId === m.fromId;
            // L'heure ne s'affiche qu'en fin de série : dans une séance qui dure quelques
            // minutes, la répéter sur chaque bulle ajoutait une ligne partout pour une
            // information qu'on ne relit jamais.
            const endsRun = !next || next.kind !== m.kind || next.fromId !== m.fromId;
            const mine = m.kind === 'me';
            const canReport = !!onReport && m.kind === 'them' && !m.retracted;
            // On ne cite que ce qui a une ancre partagée par les deux bouts : un
            // message sans `msgId` (échec de déchiffrement, client antérieur) ne
            // pourrait pas être retrouvé chez le destinataire.
            const canReply = !!onReply && !!m.msgId && !m.retracted;
            // On ne retouche que ses propres mots, et seulement du texte : une
            // pièce jointe n'a rien à remplacer, un message retiré est verrouillé.
            const canEdit = !!onEdit && mine && !!m.msgId && !m.retracted && !m.media;
            const editing = !!editingId && m.msgId === editingId;
            // Salons : couleur déterministe par auteur (même palette que les avatars).
            // Le pseudo coloré + le liseré sur chaque bulle permettent d'attribuer un
            // message même au milieu d'un groupe, là où le pseudo n'est plus répété.
            const authorColor = showNames && !mine && m.fromId ? avatarColor(m.fromId) : null;
            const accent = authorColor ? { borderLeftColor: authorColor, borderLeftWidth: 3 } : undefined;
            const quoted = m.replyTo ? byId.get(m.replyTo) : undefined;
            const quote = m.replyTo ? (
              <Quote quoted={quoted} mine={mine} onJump={quoted ? () => jumpTo(m.replyTo!) : undefined} />
            ) : null;
            return (
              <div
                key={m.localId}
                data-msg={m.msgId}
                // Rythme de lecture : une suite de messages du même auteur se resserre,
                // un changement d'auteur respire. La grille dit qui parle avant qu'on lise.
                className={`msg flex flex-col ${mine ? 'items-end' : 'items-start'} ${
                  i > 0 && !sameSender ? 'mt-2.5' : ''
                } ${flash === m.msgId ? 'msg--flash' : ''} ${editing ? 'msg--editing' : ''}`}
              >
                {showNames && !mine && !sameSender && (
                  <span
                    className="mb-0.5 ml-1 text-[11px] font-semibold"
                    style={{ color: authorColor ?? undefined }}
                  >
                    {m.fromPseudo}
                  </span>
                )}
                {m.retracted ? (
                  <div className="bubble bubble-them text-faint italic" style={accent}>
                    Message retiré par la modération
                  </div>
                ) : m.media ? (
                  <MediaBubble media={m.media} mine={mine} ts={fmtTime(m.ts)} accent={authorColor} quote={quote} />
                ) : (
                  <div
                    className={`bubble ${mine ? 'bubble-me' : 'bubble-them'} ${m.mentionsMe ? 'bubble--mention' : ''}`}
                    style={accent}
                  >
                    {quote}
                    <MessageText text={m.text} pseudos={pseudos} myPseudo={myPseudo} />
                    {/* « modifié » se dit même au milieu d'une série, là où l'heure se
                        tait : c'est le seul indice qu'un texte n'est plus celui qu'on
                        a lu. L'horodatage reste celui de la diffusion d'origine. */}
                    {(endsRun || m.edited) && (
                      <span className="stamp-ts">{m.edited ? `modifié · ${fmtTime(m.ts)}` : fmtTime(m.ts)}</span>
                    )}
                  </div>
                )}
                {(canReply || canEdit || canReport) && (
                  <div className={`msg-actions ${mine ? 'mr-1' : 'ml-1'}`}>
                    {canReply && (
                      <button className="msg-action" onClick={() => onReply!(m)} title="Répondre à ce message">
                        répondre
                      </button>
                    )}
                    {canEdit && (
                      <button className="msg-action" onClick={() => onEdit!(m)} title="Modifier ce message">
                        modifier
                      </button>
                    )}
                    {canReport && (
                      <button
                        className="msg-action msg-action--danger"
                        onClick={() => setReportTarget(m)}
                        title="Signaler ce message à la modération"
                      >
                        signaler
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {reportTarget && onReport && (
        <ReportModal
          onClose={() => setReportTarget(null)}
          onPick={(reason) => {
            onReport(reportTarget, reason);
            setReportTarget(null);
          }}
        />
      )}
    </>
  );
}

function MessageText({ text, pseudos, myPseudo }: { text: string; pseudos: string[]; myPseudo?: string }) {
  const parts = useMemo(() => splitMentions(text, pseudos), [text, pseudos]);
  if (parts.length === 1 && !parts[0].pseudo) return <>{text}</>;
  return (
    <>
      {parts.map((p, i) =>
        p.pseudo ? (
          <span
            key={i}
            className={`mention ${p.pseudo.toLowerCase() === myPseudo?.toLowerCase() ? 'mention--me' : ''}`}
          >
            {p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

function Quote({ quoted, mine, onJump }: { quoted?: Message; mine: boolean; onJump?: () => void }) {
  const cls = `quote ${mine ? 'quote--mine' : ''}`;
  if (!quoted) return <div className={`${cls} quote--void`}>Message indisponible</div>;

  const author = quoted.kind === 'me' ? 'Vous' : quoted.fromPseudo || 'Inconnu';
  const content = (
    <>
      <span className="quote__author">{author}</span>
      <span className="quote__text">{excerptOf(quoted)}</span>
    </>
  );
  if (!onJump) return <div className={cls}>{content}</div>;
  return (
    <button type="button" className={cls} onClick={onJump} title="Aller au message cité">
      {content}
    </button>
  );
}

/* ---- Pièce jointe (photo / vidéo) -------------------------------------- */

function MediaBubble({
  media,
  mine,
  ts,
  accent,
  quote,
}: {
  media: MediaAttachment;
  mine: boolean;
  ts: string;
  accent?: string | null;
  quote?: ReactNode;
}) {
  return (
    <div
      className="overflow-hidden rounded-2xl border"
      style={{
        maxWidth: 'min(78%, 340px)',
        borderColor: mine ? 'var(--color-blue)' : 'var(--color-line)',
        ...(accent ? { borderLeftColor: accent, borderLeftWidth: 3 } : {}),
      }}
    >
      {quote && <div className="px-2 pb-1 pt-2">{quote}</div>}
      {media.kind === 'image' ? (
        <a href={media.url} target="_blank" rel="noreferrer" className="block">
          <img src={media.url} alt="Photo partagée" className="block max-h-[360px] w-full object-cover" loading="lazy" />
        </a>
      ) : (
        <video src={media.url} controls preload="metadata" className="block max-h-[360px] w-full bg-black" />
      )}
      <div
        className="px-2.5 py-1 text-right text-[10px] tabular-nums"
        style={{
          background: mine ? 'var(--color-blue)' : 'var(--color-paper-2)',
          color: mine ? 'rgba(255,255,255,0.8)' : 'var(--color-faint)',
        }}
      >
        {ts}
      </div>
    </div>
  );
}

/* ---- Modale de motif de signalement (DSA art.16) ----------------------- */

function ReportModal({ onClose, onPick }: { onClose: () => void; onPick: (reason: ReportReason) => void }) {
  return (
    <Modal title="Signaler ce message" onClose={onClose}>
      <p className="mb-3 text-sm text-muted">
        Votre signalement est transmis à la modération. Indiquez le motif :
      </p>
      <div className="flex flex-col gap-2">
        {(Object.keys(REPORT_REASON_LABEL) as ReportReason[]).map((r) => (
          <button
            key={r}
            className={`btn btn-ghost justify-start ${r === 'minor' || r === 'illegal' ? 'text-danger' : ''}`}
            onClick={() => onPick(r)}
          >
            {REPORT_REASON_LABEL[r]}
          </button>
        ))}
      </div>
    </Modal>
  );
}

/* ---- Liste de messages ------------------------------------------------- */
