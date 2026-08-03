/**
 * Mentions « @pseudo » dans les salons.
 *
 * Une mention n'est **rien d'autre que du texte** : aucune liste d'identifiants
 * ne double le message, ni en clair ni dans l'enveloppe. Le serveur n'apprend
 * donc rien de nouveau — en salon chiffré, il ne voit même pas qu'il y a eu
 * mention.
 *
 * La résolution se fait à l'affichage, contre la liste des présents : sans
 * balisage dans le texte, on ne peut pas deviner où s'arrête un pseudo (ils
 * peuvent contenir des espaces) autrement qu'en le reconnaissant. D'où :
 *
 * - `@quelquun` sans correspondance reste du texte ordinaire ;
 * - une personne partie cesse d'être mise en évidence ;
 * - deux présents homonymes se sentent tous deux concernés — rien ne rend un
 *   pseudo unique ;
 * - un renommage déplace la mention avec la personne, y compris dans les
 *   messages déjà affichés.
 */

/** Un segment de texte : soit du texte ordinaire, soit une mention reconnue. */
export type Segment = { text: string; pseudo?: string };

const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}_]/u.test(c);

/**
 * Reconnaît un pseudo à la position `at` (juste après le `@`). Le plus long
 * gagne, pour qu'un « @Ali » ne soit pas préféré à « @Alice » quand les deux
 * sont présents ; le caractère suivant ne doit pas prolonger un mot, sans quoi
 * « @Alicia » se ferait passer pour une mention d'« Alice ».
 */
function matchPseudo(text: string, at: number, pseudos: string[]): string | null {
  let best: string | null = null;
  const lower = text.toLowerCase();
  for (const pseudo of pseudos) {
    if (best && pseudo.length <= best.length) continue;
    if (!lower.startsWith(pseudo.toLowerCase(), at)) continue;
    if (isWordChar(text[at + pseudo.length])) continue;
    best = pseudo;
  }
  return best;
}

/**
 * Découpe un texte en segments pour l'affichage. Les segments ordinaires sont
 * fusionnés : le rendu ne produit donc qu'un nœud par mention.
 */
export function splitMentions(text: string, pseudos: string[]): Segment[] {
  if (!text || pseudos.length === 0) return text ? [{ text }] : [];
  const out: Segment[] = [];
  let plain = '';
  let i = 0;
  while (i < text.length) {
    // Un « @ » collé à un mot (une adresse e-mail, par exemple) n'ouvre pas une mention.
    if (text[i] === '@' && !isWordChar(text[i - 1])) {
      const pseudo = matchPseudo(text, i + 1, pseudos);
      if (pseudo) {
        if (plain) {
          out.push({ text: plain });
          plain = '';
        }
        out.push({ text: text.slice(i, i + 1 + pseudo.length), pseudo });
        i += 1 + pseudo.length;
        continue;
      }
    }
    plain += text[i];
    i++;
  }
  if (plain) out.push({ text: plain });
  return out;
}

/** Le texte interpelle-t-il ce pseudo ? Sert à la pastille et à l'alerte de mention. */
export function mentionsPseudo(text: string, pseudo: string): boolean {
  return splitMentions(text, [pseudo]).some((s) => s.pseudo);
}

/**
 * Mention en cours de frappe : le « @ » ouvert le plus proche à gauche du curseur.
 * La requête s'arrête au premier blanc — on ne cherche donc pas à traverser
 * l'espace d'un pseudo composé : on tape « @jea » et l'on choisit « Jean Pierre »
 * dans la liste, qui l'insère en entier.
 */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  for (let i = caret - 1; i >= 0; i--) {
    const c = text[i];
    if (c === '@') {
      if (isWordChar(text[i - 1])) return null;
      return { start: i, query: text.slice(i + 1, caret) };
    }
    if (/\s/.test(c)) return null;
  }
  return null;
}

/** Remplace la mention en cours de frappe par le pseudo choisi (+ une espace). */
export function applyMention(
  text: string,
  start: number,
  caret: number,
  pseudo: string,
): { text: string; caret: number } {
  const inserted = `@${pseudo} `;
  return { text: text.slice(0, start) + inserted + text.slice(caret), caret: start + inserted.length };
}
