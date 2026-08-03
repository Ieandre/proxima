import { useState } from 'react';
import { useStore } from '../../store/useStore';
import { isOnionOrigin } from '../../lib/onion';
import { Icon } from '../ui';


export function OnionDoor() {
  const onionHost = useStore((s) => s.legal?.onionHost);
  const [copied, setCopied] = useState(false);

  // Rien à annoncer sans adresse configurée ; et sur l'onion, proposer l'adresse
  // de la page qu'on consulte serait du bruit.
  if (!onionHost || isOnionOrigin()) return null;

  const copy = () => {
    navigator.clipboard?.writeText(onionHost).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2200);
      },
      () => {},
    );
  };

  return (
    <section className="onion-door fade-up" style={{ animationDelay: '440ms' }}>
      <span className="onion-door__label">
        <Icon name="shield" size={12} />
        Accès Tor
      </span>
      <p className="onion-door__body">
        Votre adresse IP arrive jusqu'à nos serveurs, comme sur n'importe quel site. Par le réseau Tor, elle n'y
        arrive <strong>pas du tout</strong>.
      </p>
      {/* Adresse à copier, jamais un lien : depuis un navigateur ordinaire, un
          href vers .onion produit une erreur de résolution, donc un clic qui échoue. */}
      <div className="onion-door__row">
        <code className="onion-door__addr">{onionHost}</code>
        <button type="button" className="onion-door__copy" onClick={copy} aria-label="Copier l’adresse onion">
          <Icon name={copied ? 'check' : 'copy'} size={12} />
          {copied ? 'Copié' : 'Copier'}
        </button>
      </div>
    </section>
  );
}

/* Cycle de vie d'une identité de session : trois moments dans l'ordre où ils arrivent.
   Ce n'est pas une liste d'arguments mais une chronologie — l'ordre porte le sens, et
   l'épine dorsale s'efface au dernier repère (la donnée ne survit pas à l'onglet). */
