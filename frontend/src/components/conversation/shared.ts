import { plainText } from '../../lib/markdown';
import { type Message } from '../../lib/types';
import { type EditDraft, type ReplyDraft } from '../chat/drafts';

export const fmtTime = (ts: number) =>
  new Date(ts || Date.now()).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/**
 * Ce qu'un message donne à lire quand il est cité : son texte, ou la nature de sa
 * pièce jointe. Le balisage est retiré (`plainText`) — un aperçu d'une ligne n'a
 * pas la place du style, et encore moins celle de ses marques.
 */
export const excerptOf = (m: Message) =>
  m.retracted ? 'Message retiré' : m.media ? (m.media.kind === 'video' ? 'Vidéo' : 'Photo') : plainText(m.text);

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

/**
 * Message dont on reprend le texte dans le champ de saisie. Même condition que
 * pour une citation : sans `msgId`, aucune ancre partagée avec l'autre bout, donc
 * rien à modifier chez lui.
 */
export const editDraft = (m: Message | null): EditDraft | null => (m && m.msgId ? { id: m.msgId, text: m.text } : null);

/* ---- Message cité (réponse) -------------------------------------------- */
/* La citation est résolue dans le fil local : rien de son contenu n'a transité par
   le réseau, seul l'identifiant du message l'a fait. Un message reçu avant l'arrivée
   du lecteur (ou déjà purgé) reste donc introuvable — on le dit plutôt que de
   reconstituer un historique que le produit ne conserve pas (RG-01). */
