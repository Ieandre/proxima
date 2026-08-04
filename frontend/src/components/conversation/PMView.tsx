import { useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import { reportPM, sendPM, sendPMMedia, sendTyping } from '../../lib/socket';
import { safetyNumber } from '../../lib/crypto';
import { GENDER_LABEL, type Message, type ReportReason } from '../../lib/types';
import { Composer } from '../chat/Composer';
import { Avatar, Icon } from '../ui';
import { BackBar, ThreadSheet, ThreadStart, TypingIndicator , replyDraft} from './shared';
import { MessageList } from './MessageList';


export function PMView({ peerId }: { peerId: string }) {
  const peer = useStore((s) => s.people[peerId] || s.pmPeers[peerId]);
  const messages = useStore((s) => s.threads[`pm:${peerId}`]) || [];
  const showToast = useStore((s) => s.showToast);
  const [showVerify, setShowVerify] = useState(false);
  const [verified, setVerified] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);

  const onReport = (m: Message, reason: ReportReason) =>
    reportPM(peerId, m.msgId || m.localId, m.media ? '(média)' : m.text, reason).then((res) =>
      showToast(
        res.ok ? 'Signalement transmis à la modération.' : res.error || 'Échec du signalement.',
        res.ok ? 'info' : 'warn',
      ),
    );

  const sn = useMemo(() => {
    try {
      return peer?.pub ? safetyNumber(peer.pub) : '';
    } catch {
      return '';
    }
  }, [peer?.pub]);

  return (
    <div className="flex h-full flex-col">
      <BackBar>
        {peer && <Avatar id={peer.id} pseudo={peer.pseudo} size={38} />}
        <div className="min-w-0 flex-1">
          <h2 className="thread-title truncate">{peer?.pseudo || 'Inconnu'}</h2>
          <div className="mt-0.5 text-[11.5px] text-faint">
            {peer?.city ? `${peer.city} · ${peer.age} ans · ${GENDER_LABEL[peer.gender]}` : 'hors de portée'}
          </div>
        </div>
        <button
          className={`chip ${verified ? 'chip-verified' : 'chip-blue'} cursor-pointer`}
          onClick={() => setShowVerify((v) => !v)}
          title="Empreinte de sécurité de la conversation"
        >
          <Icon name={verified ? 'check' : 'lock'} size={11} />
          {verified ? 'vérifié' : 'chiffré'}
        </button>
      </BackBar>

      {showVerify && (
        <div className="fade-up border-b border-line bg-paper-2 px-4 py-3.5">
          <div className="flex items-start gap-3">
            <span
              className="grid h-9 w-9 flex-none place-items-center rounded-[9px]"
              style={{ background: 'var(--color-verified-tint)', color: 'var(--color-verified)' }}
            >
              <Icon name="shield-check" size={18} />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold">Empreinte de sécurité</div>
              <p className="mt-0.5 text-[12px] leading-snug text-muted">
                Comparez ce code avec {peer?.pseudo || 'votre interlocuteur·rice'} par un autre canal (à voix haute, en
                personne…). S'il diffère de son côté, la connexion est peut-être interceptée.
              </p>
              <div className="mt-2 select-all font-mono text-[13px] tracking-wider text-ink">{sn || '—'}</div>
              <button
                className="btn btn-ghost mt-2.5 px-3 py-1.5 text-xs"
                onClick={() => setVerified((v) => !v)}
                disabled={!sn}
              >
                <Icon name={verified ? 'close' : 'check'} size={13} />
                {verified ? 'Retirer la vérification' : 'Marquer comme vérifié'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ThreadSheet>
        <MessageList
          messages={messages}
          showNames={false}
          onReport={onReport}
          onReply={setReplyTo}
          empty={
            <ThreadStart title={`Votre conversation avec ${peer?.pseudo || 'cette personne'} commence ici.`}>
              Chaque message est chiffré sur votre appareil&nbsp;: le serveur transporte un bloc qu'il ne peut pas
              ouvrir. Pour être sûr·e de parler à la bonne personne, comparez l'empreinte de sécurité.
            </ThreadStart>
          }
        />

        <TypingIndicator convKey={`pm:${peerId}`} />
        <Composer
          placeholder={`Message chiffré à ${peer?.pseudo || '…'}`}
          onSend={(t) => {
            sendPM(peerId, t, replyTo?.msgId);
            setReplyTo(null);
          }}
          onTyping={() => sendTyping('pm', peerId)}
          onMedia={(f) => {
            sendPMMedia(peerId, f, replyTo?.msgId);
            setReplyTo(null);
          }}
          reply={replyDraft(replyTo)}
          onCancelReply={() => setReplyTo(null)}
        />
      </ThreadSheet>
    </div>
  );
}

/* ---- Salons ------------------------------------------------------------ */
