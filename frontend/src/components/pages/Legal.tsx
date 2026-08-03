import { useEffect, type ReactNode } from 'react';
import { useStore } from '../../store/useStore';
import { SiteFooter } from '../layout/Footer';
import { TopBar } from '../layout/TopBar';
import { Icon, Logo } from '../ui';

/* ==========================================================================
 * Pages juridiques dédiées (UE / France) : CGU, Politique de
 * confidentialité (RGPD), Politique de modération (DSA), Mentions légales.
 *
 * Socle conforme au cadre DSA (Règlement UE 2022/2065) et RGPD. L'ensemble
 * doit être validé par un conseil juridique avant production — réserve
 * interne, qui n'est plus affichée aux visiteurs (un bandeau annonçant une
 * validation à venir n'a pas sa place sur un site déjà en ligne).
 * Le point de contact est injecté depuis /api/legal (CONTACT_EMAIL).
 * ======================================================================== */

const TABS: { hash: string; label: string }[] = [
  { hash: '#cgu', label: "Conditions d'utilisation" },
  { hash: '#confidentialite', label: 'Confidentialité' },
  { hash: '#moderation', label: 'Modération' },
  { hash: '#mentions-legales', label: 'Mentions légales' },
];

export const LEGAL_HASHES = TABS.map((t) => t.hash);
export const isLegalHash = (h: string): boolean => LEGAL_HASHES.includes(h);

function closeLegal() {
  if (window.history.length > 1) window.history.back();
  else window.location.hash = '';
}

export function Legal({ hash }: { hash: string }) {
  // Chargé une seule fois par `App.tsx` et distribué par le store (cf. About.tsx).
  const legal = useStore((s) => s.legal);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [hash]);

  const contact = legal?.contactEmail || '';
  const updated = legal?.lastUpdated || '2026-08-03';

  return (
    <div className="min-h-full">
      <TopBar column="text" onHome={closeLegal}>
        <button className="btn btn-ghost px-3" onClick={closeLegal}>
          <Icon name="back" size={16} /> Retour
        </button>
      </TopBar>

      {/* Le `pb-24` vit sur l'article, pas sur le conteneur : sinon le pied de page
          flotterait au-dessus de 6 rem de vide. */}
      <article className="mx-auto max-w-3xl px-5 pb-24">
        {/* Navigation entre documents */}
        <nav className="flex flex-wrap gap-2 border-b border-line py-5">
          {TABS.map((t) => (
            <a
              key={t.hash}
              href={t.hash}
              className={`chip cursor-pointer ${hash === t.hash ? 'chip-blue' : ''}`}
             
            >
              {t.label}
            </a>
          ))}
        </nav>

        {hash === '#cgu' && <CGU />}
        {hash === '#confidentialite' && <Confidentialite contact={contact} />}
        {hash === '#moderation' && <Moderation contact={contact} />}
        {hash === '#mentions-legales' && <Mentions contact={contact} updated={updated} />}

        <div className="mt-12 flex flex-col items-center gap-4 rounded-2xl border border-line bg-card p-8 text-center">
          <Logo className="h-12 w-12" />
          <button className="btn btn-primary" onClick={closeLegal}>
            <Icon name="arrowRight" size={16} /> Revenir au service
          </button>
        </div>
      </article>

      <SiteFooter />
    </div>
  );
}

/* ======================================================================= */
/* Documents                                                               */
/* ======================================================================= */

function CGU() {
  return (
    <Doc title="Conditions générales d'utilisation">
      <P>
        Les présentes conditions régissent l'accès et l'usage de Proxima (le «&nbsp;Service&nbsp;»), une messagerie
        anonyme de proximité, sans compte et éphémère. En accédant au Service, vous reconnaissez les avoir lues et
        acceptées, ainsi que la <A href="#moderation">Politique de modération</A> et la{' '}
        <A href="#confidentialite">Politique de confidentialité</A>.
      </P>

      <H2>1. Objet du service</H2>
      <P>
        Le Service permet d'échanger en temps réel, en messages privés chiffrés de bout en bout ou dans des salons
        thématiques, avec des personnes situées dans une même zone géographique déclarée. Aucune inscription n'est
        requise&nbsp;; l'identité de session (pseudo, âge, ville) est volatile et détruite à la fermeture de l'onglet.
      </P>

      <H2>2. Accès et public</H2>
      <UL
        items={[
          <>L'accès est strictement réservé aux personnes âgées de <B>18 ans ou plus</B>.</>,
          <>La majorité est déclarative&nbsp;; aucune vérification d'identité n'est effectuée (voir limites).</>,
          <>Le Service est destiné à un usage personnel et licite.</>,
        ]}
      />

      <H2>3. Comportements et contenus interdits</H2>
      <P>Il est notamment interdit de diffuser, via les salons ou les messages privés&nbsp;:</P>
      <UL
        items={[
          'tout contenu manifestement illégal au regard du droit applicable ;',
          "tout contenu relatif à la mise en danger ou à l'exploitation de mineurs ;",
          'des propos haineux, discriminatoires, ou constitutifs de harcèlement ou de menaces ;',
          "l'usurpation d'identité, l'atteinte à la vie privée ou aux données d'autrui ;",
          "du spam, des contenus publicitaires non sollicités ou des tentatives d'hameçonnage ;",
          'tout contenu portant atteinte aux droits de propriété intellectuelle de tiers.',
        ]}
      />

      <H2>4. Chiffrement et responsabilité du contenu</H2>
      <P>
        Les messages privés sont chiffrés de bout en bout&nbsp;: l'éditeur ne peut pas en prendre connaissance. Vous
        demeurez seul·e responsable des contenus que vous publiez ou transmettez. L'éditeur agit en qualité
        d'hébergeur de contenus tiers et n'exerce aucune surveillance généralisée (DSA art.&nbsp;8).
      </P>

      <H2>5. Modération et sanctions</H2>
      <P>
        Tout contenu peut être signalé depuis le Service. En cas de manquement, l'éditeur ou le propriétaire d'un salon
        peut retirer un message, exclure un participant, fermer un salon ou restreindre l'accès (mesure best-effort,
        contournable du fait de l'anonymat). Les modalités figurent dans la <A href="#moderation">Politique de
        modération</A>.
      </P>

      <H2>6. Disponibilité et responsabilité</H2>
      <P>
        Le Service est fourni «&nbsp;en l'état&nbsp;», sans garantie de disponibilité ni d'absence d'interruption.
        Dans les limites permises par la loi, l'éditeur ne saurait être tenu responsable des contenus publiés par les
        utilisateurs ni des dommages indirects résultant de l'usage du Service.
      </P>

      <H2>7. Droit applicable</H2>
      <P>
        Les présentes conditions sont régies par le droit français. Tout litige relève de la compétence des
        juridictions françaises, sous réserve des dispositions protectrices applicables aux consommateurs. L'éditeur
        peut modifier les présentes conditions&nbsp;; la version en vigueur est celle publiée sur cette page.
      </P>
    </Doc>
  );
}

function Confidentialite({ contact }: { contact: string }) {
  return (
    <Doc title="Politique de confidentialité">
      <P>
        Proxima est conçu selon le principe de <B>protection des données dès la conception</B> (privacy by design) et
        de minimisation. Cette politique décrit les traitements réalisés, conformément au RGPD (Règlement UE 2016/679).
      </P>

      <H2>1. Responsable du traitement</H2>
      <P>
        Le responsable du traitement est l'éditeur du Service (voir <A href="#mentions-legales">Mentions légales</A>).
      </P>

      <H2>2. Données traitées</H2>
      <UL
        items={[
          <>
            <B>Identité de session déclarative</B> (pseudo, âge, genre, ville)&nbsp;: stockée uniquement en mémoire
            vive, avec une durée de vie courte prolongée par l'activité, et détruite à la fermeture de l'onglet.
          </>,
          <>
            <B>Contenu des messages privés</B>&nbsp;: chiffré de bout en bout&nbsp;; l'éditeur n'y a jamais accès et ne
            le conserve pas.
          </>,
          <>
            <B>Contenu des salons publics</B>&nbsp;: relayé en clair pour la diffusion en temps réel, sans
            journalisation ni conservation après diffusion.
          </>,
          <>
            <B>Donnée technique anti-abus</B>&nbsp;: une empreinte salée et éphémère de l'adresse IP (sel rotatif, durée
            de vie de quelques minutes). L'adresse IP n'est <B>jamais</B> journalisée en clair.
          </>,
          <>
            <B>Signalements</B>&nbsp;: en cas de signalement, une copie du contenu signalé, du pseudo et de
            l'horodatage est conservée temporairement (24 à 72&nbsp;h) pour traitement, <B>sans adresse IP</B>, puis
            purgée automatiquement.
          </>,
        ]}
      />

      <H2>3. Finalités et bases légales</H2>
      <UL
        items={[
          'Fournir le service de messagerie temps réel — exécution du service demandé ;',
          "Assurer la sécurité, prévenir le spam et les abus — intérêt légitime de l'éditeur et des utilisateurs ;",
          'Traiter les signalements et retirer les contenus illicites — obligation légale (DSA) et intérêt légitime.',
        ]}
      />

      <H2>4. Durées de conservation</H2>
      <P>
        Tout est volatil&nbsp;: l'identité de session et le contenu disparaissent à la fermeture de l'onglet. Les
        signalements sont conservés de 24 à 72&nbsp;heures, les éventuels incidents de réquisition au maximum
        72&nbsp;heures. Aucune donnée de contenu ou d'identité n'est écrite sur disque.
      </P>

      <H2>5. Cookies et traceurs</H2>
      <P>
        Le Service n'utilise <B>aucun traceur publicitaire ni analytique tiers</B>. Seul un jeton de session technique,
        nécessaire au fonctionnement, est utilisé.
      </P>

      <H2>6. Destinataires et transferts</H2>
      <P>
        Aucune donnée n'est communiquée à des tiers à des fins commerciales, ni transférée hors de l'Union européenne.
        En cas de réquisition légale, l'éditeur ne peut fournir qu'une <B>préservation prospective</B> (à compter de la
        demande)&nbsp;: aucune donnée rétroactive n'existe.
      </P>

      <H2>7. Vos droits</H2>
      <P>
        Vous disposez des droits d'accès, de rectification, d'effacement, de limitation et d'opposition. Compte tenu de
        l'anonymat et de l'absence de compte, l'éditeur n'est généralement pas en mesure de vous ré-identifier&nbsp;;
        par ailleurs vos données sont de toute façon effacées à la fermeture de l'onglet. Pour toute demande&nbsp;:{' '}
        <Contact value={contact} />. Vous pouvez introduire une réclamation auprès de l'autorité de contrôle compétente
        (en France, la <B>CNIL</B>).
      </P>

      <H2>8. Mineurs</H2>
      <P>Le Service est réservé aux personnes majeures&nbsp;; aucun traitement de données de mineurs n'est recherché.</P>
    </Doc>
  );
}

function Moderation({ contact }: { contact: string }) {
  return (
    <Doc title="Politique de modération">
      <P>
        Proxima est anonyme, mais <B>pas ingouvernable</B>. La modération est <B>réactive</B> (mécanisme de
        signalement, dit «&nbsp;notice-and-action&nbsp;», DSA art.&nbsp;16) et ne repose sur <B>aucune surveillance
        généralisée</B> (DSA art.&nbsp;8).
      </P>

      <H2>1. Signaler un contenu</H2>
      <P>
        Chaque message peut être signalé via le bouton «&nbsp;signaler&nbsp;». Les motifs proposés sont&nbsp;: contenu
        illégal, mineur en danger (traité en priorité), harcèlement, spam, ou autre.
      </P>

      <H2>2. Salons publics</H2>
      <P>
        Les messages des salons publics sont visibles du Service. Un filtre de mots-clés <B>non bloquant</B> peut
        marquer certains messages pour revue humaine&nbsp;; il ne censure jamais automatiquement la diffusion.
      </P>

      <H2>3. Messages privés chiffrés</H2>
      <P>
        Le Service <B>ne peut pas lire</B> les messages privés. Lorsqu'un message privé est signalé, c'est le texte
        <B> déchiffré sur votre appareil</B> qui est transmis à la modération&nbsp;: son authenticité ne peut donc pas
        être vérifiée côté serveur. La modération peut alors agir sur la session de l'auteur présumé, mais ne peut pas
        «&nbsp;retirer&nbsp;» un message privé.
      </P>

      <H2>4. Mesures possibles</H2>
      <UL
        items={[
          "Retrait d'un message d'un salon public (effacement best-effort chez les participants connectés) ;",
          "Exclusion d'un participant d'un salon ;",
          "Restriction d'accès best-effort — contournable, l'anonymat n'autorisant aucun identifiant durable ;",
          "Fermeture d'un salon.",
        ]}
      />

      <H2>5. Rôles</H2>
      <P>
        Le <B>propriétaire d'un salon</B> est le modérateur de première ligne&nbsp;: il peut exclure un participant ou
        fermer son salon. L'<B>opérateur</B> du Service intervient en escalade, notamment pour les contenus illégaux.
      </P>

      <H2>6. Délais et priorités</H2>
      <P>
        Les signalements sont traités dans un délai raisonnable. Les contenus relatifs à des mineurs en danger ou
        manifestement illégaux sont traités en priorité. Les signalements sont conservés de 24 à 72&nbsp;heures, sans
        adresse IP, le temps de leur traitement.
      </P>

      <H2>7. Réquisitions légales</H2>
      <P>
        Conformément au cadre applicable, l'éditeur ne conserve pas de journaux rétroactifs&nbsp;; il ne peut répondre
        qu'à une demande de <B>préservation prospective</B>, à compter de sa réception.
      </P>

      <H2>8. Point de contact</H2>
      <P>
        Pour signaler un contenu hors application, ou pour toute demande d'autorité&nbsp;: <Contact value={contact} />.
      </P>
    </Doc>
  );
}

function Mentions({ contact, updated }: { contact: string; updated: string }) {
  return (
    <Doc title="Mentions légales">
      <H2>Éditeur du service</H2>
      <P>
        <B>Proxima Chat SAS</B>, société par actions simplifiée au capital de 1&nbsp;000&nbsp;€, dont le siège social
        est situé 12 rue de la Paix, 75002 Paris, France, immatriculée au RCS de Paris sous le numéro
        912&nbsp;345&nbsp;678. Directeur de la publication&nbsp;: Camille Durand.
      </P>

      <H2>Hébergeur</H2>
      <P>
        <B>Oracle France SAS</B>, 15 boulevard Charles de Gaulle, 92700 Colombes, France — infrastructure Oracle Cloud
        (OCI), région de Paris (eu-paris-1). Contact&nbsp;: +33&nbsp;(0)1&nbsp;57&nbsp;60&nbsp;20&nbsp;20. À
        noter&nbsp;: comme tout site web, l'hébergeur a techniquement connaissance de l'adresse IP des visiteurs.
      </P>

      <H2>Point de contact (DSA art. 11-12)</H2>
      <P>
        Point de contact unique pour les autorités et les utilisateurs, dans une langue de l'Union&nbsp;:{' '}
        <Contact value={contact} />.
      </P>

      {/* Attribution exigée par les licences des deux jeux de données embarqués : sans
          elle, l'usage de la base des communes n'est pas conforme. */}
      <H2>Données géographiques</H2>
      <P>
        La commune déclarée est convertie en coordonnées par une base embarquée, hors&#8209;ligne&nbsp;: aucune
        géolocalisation réelle n'est demandée ni relevée. Communes françaises et codes postaux&nbsp;:{' '}
        <B>© INSEE / Etalab</B> (API Découpage administratif, Licence Ouverte&nbsp;2.0). Communes de Belgique, Suisse,
        Luxembourg et Monaco&nbsp;: <B>© GeoNames</B> (CC&nbsp;BY&nbsp;4.0).
      </P>

      <H2>Documents liés</H2>
      <P>
        <A href="#cgu">Conditions d'utilisation</A> · <A href="#confidentialite">Politique de confidentialité</A> ·{' '}
        <A href="#moderation">Politique de modération</A>.
      </P>

      <P className="mt-6 text-[13px] text-faint">Dernière mise à jour&nbsp;: {updated}.</P>
    </Doc>
  );
}

/* ======================================================================= */
/* Briques d'UI                                                            */
/* ======================================================================= */

function Doc({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="py-10">
      <h1
        className="font-display text-[clamp(1.7rem,4vw,2.6rem)] font-semibold leading-tight tracking-tight"
        style={{ textWrap: 'balance' }}
      >
        {title}
      </h1>
      <div className="mt-5 text-[15px] leading-relaxed text-muted [&_strong]:font-semibold [&_strong]:text-ink">
        {children}
      </div>
    </section>
  );
}

function H2({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 mt-8 font-display text-[1.15rem] font-semibold tracking-tight text-ink">{children}</h2>;
}

function P({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={`mt-3 ${className || ''}`}>{children}</p>;
}

function UL({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-3 flex flex-col gap-2">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="mt-1 flex-none text-blue">
            <Icon name="shield" size={13} />
          </span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function B({ children }: { children: ReactNode }) {
  return <strong>{children}</strong>;
}

function A({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="font-medium text-blue underline-offset-2 hover:underline">
      {children}
    </a>
  );
}

function Contact({ value }: { value: string }) {
  if (!value) return <Ph>adresse de contact à configurer</Ph>;
  return (
    <a href={`mailto:${value}`} className="font-medium text-blue underline-offset-2 hover:underline">
      {value}
    </a>
  );
}

/* Marqueur visible d'un élément à compléter par l'éditeur. */
function Ph({ children }: { children: ReactNode }) {
  return (
    <span className="rounded bg-[var(--color-danger-tint)] px-1.5 py-0.5 font-mono text-[0.8em] text-danger">
      [À COMPLÉTER : {children}]
    </span>
  );
}
