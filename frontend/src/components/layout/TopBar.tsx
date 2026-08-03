import { useEffect, useState, type ReactNode } from 'react';
import { useStore } from '../../store/useStore';
import {
  applyTheme,
  recallTheme,
  rememberTheme,
  resolveTheme,
  watchSystemTheme,
  type Theme,
} from '../../lib/theme';
import { Icon, Logo } from '../ui';

/* ==========================================================================
 * Barre supérieure — partagée par les quatre écrans (accueil, chat, « Comment
 * ça marche », pages juridiques).
 *
 * Elle existait en quatre copies divergentes : hauteurs différentes, deux
 * collantes sur quatre, et surtout la marque passait de gauche à droite selon
 * l'écran — le logo sautait donc à chaque navigation. Un seul composant, la
 * marque toujours à gauche, les actions toujours à droite.
 *
 * Elle porte en plus l'état réel du service (`status` du store) : pastille
 * verte silencieuse tant que la connexion tient, libellé rouge dès qu'elle
 * tombe. Sans elle, perdre le socket en remplissant le formulaire ne se voyait
 * nulle part — le bouton échouait sans explication.
 * ======================================================================== */

/* `quiet` : la barre ne prend la parole que sur un échec réel. Une connexion qui
   s'établit est un état transitoire d'une seconde ; l'annoncer serait du bruit.
   `label` reste court pour tenir dans la barre sur mobile ; `hint` (l'infobulle)
   porte l'explication complète et ce qui est en train de se passer. */
const SERVICE_STATE = {
  connecting: { tone: 'wait', label: 'Connexion…', hint: 'Connexion au service en cours', quiet: true },
  onboarding: { tone: 'ok', label: 'Service en ligne', hint: 'Service en ligne', quiet: true },
  live: { tone: 'ok', label: 'Service en ligne', hint: 'Service en ligne', quiet: true },
  disconnected: {
    tone: 'down',
    label: 'Hors ligne',
    hint: 'Service injoignable — nouvelle tentative de connexion automatique',
    quiet: false,
  },
} as const;

/* Le thème vit hors du store : il est posé avant le premier rendu, et `reset()`
   purge le store en fin de session — ce qui rejouerait l'apparence en pleine
   navigation. La barre n'en garde donc qu'un reflet local. */
function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => resolveTheme());

  // Le système change d'avis (coucher du soleil, réglage modifié ailleurs) : on ne
  // le suit que faute de choix exprimé — sinon la bascule manuelle serait annulée.
  useEffect(
    () =>
      watchSystemTheme((system) => {
        if (recallTheme() !== null) return;
        applyTheme(system);
        setTheme(system);
      }),
    [],
  );

  return [
    theme,
    () => {
      const next: Theme = theme === 'dark' ? 'light' : 'dark';
      rememberTheme(next);
      applyTheme(next);
      setTheme(next);
    },
  ] as const;
}

/* Bascule d'apparence. Volontairement discrète — c'est une préférence
   d'affichage, pas une action du service : elle ne doit concurrencer ni « Entrer »
   ni « Quitter ». L'icône montre la DESTINATION (une lune quand on est en clair),
   et le libellé accessible dit l'action, jamais l'état. */
function ThemeToggle() {
  const [theme, toggle] = useTheme();
  const label = theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre';

  return (
    <button type="button" className="topbar__theme" onClick={toggle} title={label} aria-label={label}>
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
    </button>
  );
}

/* Accès par le service onion.
 *
 * VISIBLE DE SOI SEUL. Ce badge n'est jamais diffusé aux autres présents, et
 * c'est le cœur de l'arbitrage : afficher publiquement qui passe par Tor ferait
 * des quelques visiteurs onion d'un salon une classe repérable, rattachant tout
 * ce qu'ils déclarent par ailleurs (ville, âge, horaires) à un bit rare. Sur un
 * service dont la promesse est qu'on ne s'y distingue pas, ce serait à rebours.
 *
 * Il répond en revanche à un vrai besoin : l'interface étant identique des deux
 * côtés, rien d'autre ne permet de vérifier que le circuit fonctionne. */
function OnionBadge() {
  return (
    <span
      className="topbar__onion"
      title="Vous êtes connecté·e via le service onion Tor : votre adresse IP n'atteint jamais nos serveurs. Personne d'autre ne voit cette information."
    >
      <Icon name="shield" size={12} />
      Via Tor
    </span>
  );
}

export function TopBar({
  column = 'wide',
  sticky = true,
  onHome,
  children,
}: {
  /** Colonne de la barre : `wide` suit l'accueil, `text` la colonne de lecture,
   *  `full` occupe toute la largeur (le chat n'a pas de colonne). */
  column?: 'wide' | 'text' | 'full';
  sticky?: boolean;
  /** Fourni hors de l'accueil : la marque devient le retour, comme partout sur le web. */
  onHome?: () => void;
  children?: ReactNode;
}) {
  const status = useStore((s) => s.status);
  const onion = useStore((s) => s.onion);
  const service = SERVICE_STATE[status];

  const brand = (
    <span className="topbar__brand">
      <Logo className="h-8 w-8 sm:h-9 sm:w-9" />
      <span className="topbar__word">Proxima</span>
      <span className="topbar__service" role="status" title={service.hint}>
        <span className={`topbar__dot topbar__dot--${service.tone}`} aria-hidden="true" />
        {service.quiet ? (
          <span className="sr-only">{service.hint}</span>
        ) : (
          <span className="topbar__service-label">{service.label}</span>
        )}
      </span>
      {onion && <OnionBadge />}
    </span>
  );

  const rail =
    column === 'text' ? 'topbar__rail--text max-w-3xl' : column === 'wide' ? 'max-w-6xl' : '';

  return (
    <header className={`topbar${sticky ? ' topbar--sticky' : ''}`}>
      <div className={`topbar__rail ${rail}`}>
        {onHome ? (
          <button type="button" className="topbar__home" onClick={onHome} aria-label="Revenir à l'accueil">
            {brand}
          </button>
        ) : (
          brand
        )}
        <div className="topbar__actions">
          <ThemeToggle />
          {children}
        </div>
      </div>
    </header>
  );
}
