import { useState } from 'react';
import { DISCORD_INVITE, SOURCE_URL } from '../../lib/links';
import { isOnionOrigin } from '../../lib/onion';
import { useStore } from '../../store/useStore';
import { DiscordGlyph, GitHubGlyph, Icon } from '../ui';

/* ==========================================================================
 * Pied de page du site — partagé par l'accueil et les pages juridiques.
 *
 * Trois registres séparés, volontairement : les deux portes sortantes d'abord,
 * les documents juridiques ensuite, l'accès Tor en dernier. Noyer « Discord » ou
 * « Code source » au milieu de « CGU · Confidentialité · Modération » les
 * rendrait invisibles — ce ne sont pas des documents de conformité.
 *
 * Les deux portes ne se ressemblent pas, et c'est le sujet : Discord porte sa
 * couleur de marque (on la reconnaît avant de la lire), le code source reste en
 * encre. Ce site affirme ne pas pouvoir lire vos messages ; le code est ce qui
 * rend l'affirmation vérifiable, et une preuve n'a pas à être colorée pour
 * exister. L'accent bleu reste au produit.
 * ======================================================================== */

export function SiteFooter() {
  return (
    <footer className="relative z-10 border-t border-line/60 px-5 py-5 text-center text-[11px] text-faint sm:px-8">
      <p className="mb-3.5 flex flex-wrap items-center justify-center gap-2">
        {/* Invitation vide ⇒ rien à afficher (cf. lib/links.ts) : pas de lien mort.
            Le code source, lui, a toujours une valeur : l'AGPL en fait une
            obligation, pas un ornement. */}
        {DISCORD_INVITE && (
          <a className="discord-link" href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer">
            <DiscordGlyph size={16} />
            Rejoindre la communauté sur Discord
          </a>
        )}
        <a className="source-link" href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
          <GitHubGlyph size={15} />
          Code source
          <span className="source-link__licence">AGPL-3.0</span>
        </a>
      </p>
      <p>
        <a href="#cgu" className="hover:text-blue">Conditions d'utilisation</a> ·{' '}
        <a href="#confidentialite" className="hover:text-blue">Confidentialité</a> ·{' '}
        <a href="#moderation" className="hover:text-blue">Modération</a> ·{' '}
        <a href="#mentions-legales" className="hover:text-blue">Mentions légales</a>
      </p>
      <OnionAccess />
    </footer>
  );
}

/* ==========================================================================
 * Accès par le service onion Tor.
 *
 * Deux règles de comportement, l'une et l'autre délibérées :
 *
 *  - masquée quand on est DÉJÀ sur l'onion — proposer à quelqu'un l'adresse de la
 *    page qu'il consulte est du bruit ;
 *  - l'adresse n'est PAS un lien. Un `<a href="http://…onion">` depuis un
 *    navigateur ordinaire produit une erreur de résolution : un clic qui échoue.
 *    On la donne à copier, pas à cliquer.
 * ======================================================================== */
function OnionAccess() {
  const onionHost = useStore((s) => s.legal?.onionHost);
  const [copied, setCopied] = useState(false);

  // Adresse absente (non configurée, ou `/api/legal` pas encore revenu) : rien à
  // annoncer. Sur l'onion, la mention n'a pas lieu d'être.
  if (!onionHost || isOnionOrigin()) return null;

  const copy = () => {
    navigator.clipboard?.writeText(onionHost).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => {},
    );
  };

  return (
    <p className="footer__onion">
      <span className="footer__onion-label">
        <Icon name="shield" size={12} /> Accès Tor
      </span>
      {/* L'adresse complète, jamais tronquée : le préfixe `proxima` est lisible,
          donc imitable — c'est la fin qui distingue la vraie adresse d'une copie. */}
      <code className="footer__onion-addr">{onionHost}</code>
      <button type="button" className="footer__onion-copy" onClick={copy} aria-label="Copier l'adresse onion">
        {copied ? 'Copié' : 'Copier'}
      </button>
    </p>
  );
}
