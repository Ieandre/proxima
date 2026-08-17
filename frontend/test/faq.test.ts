import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FAQ } from '../src/lib/faq';

/* La FAQ vit à deux endroits : le <dl> de la coquille statique d'index.html
   (adossé au FAQPage du JSON-LD, vérifié par test/csp-jsonld.test.js côté
   serveur) et le module lib/faq.ts que l'application affiche une fois montée.
   Google exige que les questions du FAQPage soient visibles sur la page rendue :
   ce test garantit que les deux exemplaires restent identiques au caractère près. */

const decode = (s: string) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();

const shellFaq = () => {
  const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
  const dl = html.match(/<dl[^>]*>([\s\S]*?)<\/dl>/);
  if (!dl) throw new Error('dl de la FAQ introuvable dans index.html');
  return [...dl[1].matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g)].map((m) => ({
    q: decode(m[1]),
    a: decode(m[2]),
  }));
};

describe('faq — accord avec la coquille statique', () => {
  it('reprend mot pour mot le <dl> d’index.html', () => {
    expect(FAQ).toEqual(shellFaq());
  });

  it('couvre les sept questions', () => {
    expect(FAQ).toHaveLength(7);
  });
});
