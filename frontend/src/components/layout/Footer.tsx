import { useState } from 'react';
import { DISCORD_INVITE } from '../../lib/links';
import { isOnionOrigin } from '../../lib/onion';
import { useStore } from '../../store/useStore';
import { DiscordGlyph, Icon } from '../ui';

/* ==========================================================================
 * Pied de page du site — partagé par l'accueil et les pages juridiques.
 *
 * Deux registres séparés, volontairement : la communauté d'abord, les
 * documents juridiques ensuite. Noyer « Discord » au milieu de « CGU ·
 * Confidentialité · Modération » le rendrait invisible — ce n'est pas un
 * document de conformité, c'est une porte d'entrée.
 * ======================================================================== */

export function SiteFooter() {
  return (
    <footer className="relative z-10 border-t border-line/60 px-5 py-5 text-center text-[11px] text-faint sm:px-8">
      {/* Invitation vide ⇒ rien à afficher (cf. lib/links.ts) : pas de lien mort. */}
      {DISCORD_INVITE && (
        <p className="mb-3.5">
          <a className="discord-link" href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer">
            <DiscordGlyph size={16} />
            Rejoindre la communauté sur Discord
          </a>
        </p>
      )}
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
