import { useEffect, useMemo, useState, type ReactNode } from 'react';
import sodium from 'libsodium-wrappers';
import { DISCORD_INVITE, SOURCE_URL } from '../../lib/links';
import { isOnionOrigin } from '../../lib/onion';
import { closePage } from '../../lib/router';
import { useStore } from '../../store/useStore';
import { TopBar } from '../layout/TopBar';
import { DiscordGlyph, GitHubGlyph, Icon, Logo } from '../ui';
import { EphemeralSchema, ProximitySchema, KeySchema, CipherFlowSchema, RoomsSchema } from './AboutSchemas';

const B64 = () => sodium.base64_variants.URLSAFE_NO_PADDING;
const PAD = 256;

type Party = { publicKey: Uint8Array; privateKey: Uint8Array; keyType: string };

export function About() {
  const [ready, setReady] = useState(false);
  const [parties, setParties] = useState<{ alice: Party; bob: Party; mitm: Party } | null>(null);
  // Chargé une seule fois par `App.tsx` et distribué par le store : cet écran, les
  // pages juridiques et le pied de page en ont besoin, l'appel partait trois fois.
  const legal = useStore((s) => s.legal);

  useEffect(() => {
    let alive = true;
    (async () => {
      await sodium.ready;
      if (!alive) return;
      setParties({
        alice: sodium.crypto_box_keypair(),
        bob: sodium.crypto_box_keypair(),
        mitm: sodium.crypto_box_keypair(),
      });
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-full pb-24">
      {/* Barre */}
      <TopBar column="text" onHome={closePage}>
        <button className="btn btn-ghost px-3" onClick={closePage}>
          <Icon name="back" size={16} /> Retour
        </button>
      </TopBar>

      <article className="mx-auto max-w-3xl px-5">
        {/* Hero */}
        <div className="border-b border-line py-12">
          <p className="mb-3 text-sm font-semibold text-blue">Comment ça marche · sécurité</p>
          <h1
            className="font-display text-[clamp(2rem,5vw,3.1rem)] font-semibold leading-[1.06] tracking-tight"
            style={{ textWrap: 'balance' }}
          >
            Comment Proxima vous protège, expliqué simplement.
          </h1>
          <p className="mt-5 max-w-xl text-[15.5px] leading-relaxed text-muted">
            Pas de promesse en l'air&nbsp;: cette page vous montre <strong className="text-ink">concrètement</strong> ce
            que le service voit, ce qu'il ne peut pas voir, et pourquoi. Plusieurs démonstrations sont{' '}
            <strong className="text-ink">manipulables ici même</strong>, avec la vraie machinerie cryptographique du
            site.
          </p>
        </div>

        {/* En une phrase */}
        <Section eyebrow="L'essentiel" title="En une phrase">
          <p>
            Vous entrez sans compte avec un pseudo, un âge et une ville&nbsp;; vous discutez avec les personnes proches
            ou dans des salons&nbsp;; vos messages privés sont chiffrés sur votre appareil&nbsp;; et à la fermeture de
            l'onglet, <strong className="text-ink">il ne reste rien</strong>.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Pillar icon="lock" title="Chiffré" text="MP et salons, tous illisibles pour le serveur." />
            <Pillar icon="clock" title="Éphémère" text="Tout vit en mémoire, rien sur disque." />
            <Pillar icon="pin" title="Sans GPS" text="Seul le nom de votre ville est utilisé." />
          </div>
        </Section>

        {/* Anonymat */}
        <Section eyebrow="Anonymat" title="Qui êtes-vous, pour le service ? Personne.">
          <p>
            Il n'y a <strong className="text-ink">ni inscription, ni email, ni mot de passe, ni numéro</strong>. Votre
            «&nbsp;identité&nbsp;» se résume à trois informations que vous déclarez à l'entrée&nbsp;: un pseudo, un âge et
            une ville. Elle n'existe que le temps de votre visite&nbsp;: dès que l'onglet se ferme, elle est détruite,
            avec vos conversations et vos salons.
          </p>
          <Example title="Exemple concret">
            Vous arrivez en tant que <Mono>VoisinBleu, 30 ans, Metz</Mono>. Le serveur garde cette fiche en{' '}
            <em>mémoire vive</em> avec une minuterie de quelques dizaines de secondes, prolongée tant que votre onglet
            est ouvert. Vous fermez l'onglet&nbsp;: la minuterie expire, la fiche s'efface. Aucune trace n'est écrite sur
            un disque, aucun historique n'est conservé.
          </Example>
          <EphemeralSchema />
        </Section>

        {/* Proximité */}
        <Section eyebrow="Proximité" title="« Autour de vous », sans jamais vous localiser">
          <p>
            Proxima ne demande <strong className="text-ink">jamais</strong> votre position GPS. Le nom de la ville que
            vous déclarez est converti en coordonnées approximatives à partir d'une base de villes{' '}
            <strong className="text-ink">embarquée</strong> (hors-ligne). On vous relie alors aux personnes dont la ville
            se trouve dans un rayon de <Mono>75 km</Mono>.
          </p>
          <ProximitySchema />
          <Example title="Exemple concret">
            Vous déclarez <Mono>Metz</Mono>. Une personne à <Mono>Nancy</Mono> (~50 km) vous est proposée&nbsp;; une
            personne à <Mono>Marseille</Mono> (~600 km), non. Le service ne sait pas <em>où</em> vous êtes dans la
            ville&nbsp;: il sait seulement que vous avez écrit «&nbsp;Metz&nbsp;».
          </Example>
        </Section>

        {/* Trajet d'un message privé + DEMO 1 */}
        <Section eyebrow="Le cœur" title="Le voyage d'un message privé">
          <p>
            Quand vous envoyez un message privé, il suit trois étapes. La clé du système&nbsp;: le chiffrement et le
            déchiffrement ont lieu <strong className="text-ink">sur les appareils</strong>, jamais sur le serveur.
          </p>
          <ol className="my-6 flex flex-col gap-3">
            <Step n="01" title="Votre appareil chiffre">
              Le message est verrouillé avec une clé que seul votre interlocuteur peut utiliser pour l'ouvrir.
            </Step>
            <Step n="02" title="Le serveur relaie à l'aveugle">
              Il voit <em>à qui</em> et <em>de qui</em> transmettre (en clair, pour l'acheminement), mais le contenu
              lui-même n'est qu'un bloc illisible.
            </Step>
            <Step n="03" title="L'appareil du destinataire déchiffre">
              Lui seul possède la clé qui ouvre le message. Personne d'autre, pas même nous, ne le peut.
            </Step>
          </ol>

          <DemoCard
            title="Que voit le serveur ?"
            subtitle="Tapez un message : observez le clair, ce que le serveur relaie, et le déchiffré côté destinataire."
          >
            {ready && parties ? (
              <ServerView alice={parties.alice} bob={parties.bob} />
            ) : (
              <DemoLoading />
            )}
          </DemoCard>
        </Section>

        {/* Chiffrement sans jargon */}
        <Section eyebrow="Chiffrement" title="Clés publique et privée, sans jargon">
          <p>
            D'habitude, une serrure a <strong className="text-ink">une seule clé</strong>&nbsp;: la même ferme et ouvre.
            Le chiffrement moderne utilise une idée plus maligne&nbsp;: <strong className="text-ink">deux clés
            différentes</strong>, fabriquées ensemble et liées mathématiquement. L'une <em>ferme</em> mais ne peut pas
            ouvrir&nbsp;; l'autre <em>ouvre</em> ce que la première a fermé.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Pillar
              icon="radar"
              title="La clé publique"
              text="Se donne à tout le monde. Elle ne sait que verrouiller — la connaître ne permet rien de plus."
            />
            <Pillar
              icon="lock"
              title="La clé privée"
              text="Reste secrète, sur votre appareil. Elle seule ouvre ce qui a été fermé pour vous."
            />
          </div>
          <p className="mt-5">
            Concrètement, une clé n'est pas un objet&nbsp;: c'est un <strong className="text-ink">grand nombre</strong>,
            une suite de caractères. À l'ouverture de votre session, votre navigateur en génère une paire au hasard. La
            clé publique (celle que vous avez vue plus haut dans le champ <Mono>env.pub</Mono>) est envoyée au serveur
            pour qu'on puisse vous écrire&nbsp;; la clé privée, elle,{' '}
            <strong className="text-ink">ne sort jamais de votre appareil</strong> — ni le serveur, ni personne ne la
            voit.
          </p>
          <KeySchema />

          <Example title="La subtilité : un secret que personne ne transmet">
            Proxima ne se contente pas de «&nbsp;fermer avec votre clé publique&nbsp;». Quand Alice vous écrit, son
            appareil combine <strong className="text-ink">sa clé privée</strong> avec <strong className="text-ink">votre
            clé publique</strong> pour calculer un <strong className="text-ink">secret commun</strong>. De votre côté,
            vous combinez votre clé privée avec la clé publique d'Alice et retrouvez{' '}
            <em>exactement le même secret</em> — sans qu'il n'ait jamais circulé. Bonus&nbsp;: comme la clé d'Alice entre
            dans le calcul, vous avez la <strong className="text-ink">preuve que le message vient bien d'elle</strong>.
          </Example>

          <CipherFlowSchema />

          <p className="mt-6">
            Sous le capot, Proxima s'appuie sur <Mono>libsodium</Mono>, une bibliothèque cryptographique éprouvée et
            largement auditée. Trois briques se partagent le travail&nbsp;:
          </p>
          <ul className="mt-4 flex flex-col gap-2.5">
            <Brick term="X25519">
              la façon dont les deux appareils calculent le <strong className="text-ink">secret commun</strong> à partir
              de leurs clés (l'«&nbsp;échange de clés&nbsp;»).
            </Brick>
            <Brick term="XSalsa20">
              l'algorithme qui <strong className="text-ink">brouille</strong> le message avec ce secret.
            </Brick>
            <Brick term="Poly1305">
              le <strong className="text-ink">sceau</strong> qui détecte toute altération&nbsp;: si un seul octet change,
              le déchiffrement <strong className="text-ink">échoue</strong> au lieu de produire un faux.
            </Brick>
          </ul>
        </Section>

        {/* Empreinte / MITM + DEMO 3 */}
        <Section eyebrow="Confiance" title="Êtes-vous sûr·e de parler à la bonne personne ?">
          <p>
            Le seul risque résiduel d'un service anonyme&nbsp;: un relais malveillant qui se ferait passer pour votre
            interlocuteur (une attaque dite «&nbsp;de l'homme du milieu&nbsp;»). La parade&nbsp;: chaque conversation
            possède une <strong className="text-ink">empreinte de sécurité</strong>, calculée à partir des deux clés.
            Elle est <strong className="text-ink">identique des deux côtés</strong>… sauf si quelqu'un s'est intercalé.
            Comparez-la de vive voix&nbsp;: si elle diffère, méfiance.
          </p>
          <DemoCard
            title="Empreinte de sécurité"
            subtitle="Comparez les empreintes des deux interlocuteurs, puis activez un intercepteur et observez."
          >
            {ready && parties ? (
              <FingerprintView alice={parties.alice} bob={parties.bob} mitm={parties.mitm} />
            ) : (
              <DemoLoading />
            )}
          </DemoCard>
        </Section>

        {/* Padding + DEMO 2 */}
        <Section eyebrow="Discrétion" title="Même la longueur de vos messages reste secrète">
          <p>
            Un détail subtil&nbsp;: même chiffré, un message <em>long</em> produit un bloc <em>plus gros</em> qu'un
            message court. La taille pourrait donc trahir si vous répondez «&nbsp;oui&nbsp;» ou tout un paragraphe.
            Proxima <strong className="text-ink">rembourre</strong> chaque message à une taille fixe avant de le
            chiffrer&nbsp;: le serveur voit alors des blocs identiques.
          </p>
          <DemoCard
            title="La taille ne trahit rien"
            subtitle="Changez la longueur du message : la taille transmise reste la même."
          >
            {ready && parties ? <PaddingView alice={parties.alice} bob={parties.bob} /> : <DemoLoading />}
          </DemoCard>
        </Section>

        {/* Salons */}
        <Section eyebrow="Salons" title="Discussions de groupe, publiques ou privées">
          <p>
            Vous pouvez créer ou rejoindre des salons, tous{' '}
            <strong className="text-ink">chiffrés de bout en bout</strong>. Les{' '}
            <strong className="text-ink">publics</strong> sont visibles de tous&nbsp;; les{' '}
            <strong className="text-ink">privés sur invitation</strong> s'ouvrent par lien&nbsp;; et les{' '}
            <strong className="text-ink">privés à mot de passe</strong>, par mot de passe. Le créateur en est propriétaire&nbsp;: il
            peut exclure un participant ou fermer le salon. S'il part, la propriété passe au plus ancien présent&nbsp;; et
            un salon vide est <strong className="text-ink">supprimé aussitôt</strong>.
          </p>
          <RoomsSchema />
          <p className="mt-3 text-[13.5px] text-muted">
            Tous les salons sont <strong className="text-ink">chiffrés</strong>&nbsp;: le serveur ne voit qu'une
            enveloppe opaque, comme pour les MP. Ce qui distingue les trois types, c'est la porte — donc la façon
            d'obtenir la clé. Dans un salon <strong className="text-ink">public</strong> ou{' '}
            <strong className="text-ink">sur invitation</strong>, quiconque entre la reçoit des membres déjà
            présents&nbsp;; dans un salon <strong className="text-ink">à mot de passe</strong>, elle se dérive du mot de
            passe, jamais transmis au serveur. Nuance importante&nbsp;: la confidentialité est «&nbsp;de
            groupe&nbsp;» (tout membre peut lire), <strong className="text-ink">sans authentification de
            l'auteur</strong> d'un message — le chiffrement met le contenu hors de portée de l'hébergeur, jamais des
            participants.
          </p>
        </Section>

        {/* Ce que le serveur sait */}
        <Section eyebrow="Transparence" title="Ce que le serveur sait — et ignore">
          <div className="grid gap-4 sm:grid-cols-2">
            <KnowCard
              tone="bad"
              title="Ne peut pas voir"
              items={[
                'Le contenu de vos messages privés',
                'Le contenu des salons (tous chiffrés)',
                'Votre vraie identité (aucune PII)',
                'Votre position GPS',
                "La longueur de vos MP (rembourrage)",
                "Quoi que ce soit après la fermeture de l'onglet",
              ]}
            />
            <KnowCard
              tone="ok"
              title="Voit, temporairement"
              items={[
                'Le pseudo, l’âge et la ville déclarés',
                'Qui est en ligne, et à proximité de qui',
                'Des blocs chiffrés pour les MP et les salons (à relayer)',
                'Un hash salé éphémère de l’IP (anti-spam)',
              ]}
            />
          </div>
          <p className="mt-4 text-[13px] leading-relaxed text-faint">
            L'adresse IP n'est jamais journalisée en clair&nbsp;: lorsqu'elle est nécessaire (limiter le spam), seule une
            empreinte salée, à durée de vie de quelques minutes et au sel rotatif, est conservée.
          </p>
        </Section>

        {/* Code source — placé JUSTE APRÈS le tableau de ce que le serveur voit et
            ne voit pas. C'est le moment exact où un lecteur attentif se demande
            « qui me dit que c'est vrai ? » : la réponse doit arriver là, pas trois
            écrans plus bas. Toute la page n'est qu'une suite d'affirmations tant
            qu'on ne peut pas les recouper. */}
        <Section eyebrow="Vérifiabilité" title="Ne nous croyez pas sur parole">
          <p>
            Tout ce que vous venez de lire est une <strong className="text-ink">affirmation</strong>. N'importe quel
            service peut écrire qu'il ne lit pas vos messages&nbsp;; rien, dans une jolie page, ne le prouve. Le code de
            Proxima est donc <strong className="text-ink">public et lisible par n'importe qui</strong> — y compris par
            des gens qui n'ont aucune raison de nous ménager.
          </p>
          <p className="mt-3">Les promesses de cette page se vérifient là&nbsp;:</p>
          <ul className="mt-4 flex flex-col gap-2.5">
            <Brick term="lib/crypto.ts">
              Le chiffrement, côté navigateur&nbsp;: la clé privée y est fabriquée et n'en sort jamais.
            </Brick>
            <Brick term="server/security.js">
              Le traitement de l'adresse IP&nbsp;: le hachage salé, la rotation du sel, et l'absence de journalisation.
            </Brick>
            <Brick term="domain/sessions.js">
              La durée de vie d'une identité&nbsp;: les délais d'expiration, et ce qui est détruit à la déconnexion.
            </Brick>
            <Brick term="handlers/messages.js">
              Le relais des salons chiffrés&nbsp;: on y voit que rien n'analyse le contenu qui passe.
            </Brick>
          </ul>
          <Example title="Pourquoi la licence compte">
            Proxima est publié sous <strong>AGPL-3.0</strong>. Cette licence oblige quiconque héberge une version
            modifiée du service à en publier le code. Personne ne peut donc faire tourner un « Proxima » auquel on
            aurait discrètement ajouté un enregistrement des messages ou des adresses IP, sans que la modification soit
            visible de tous.
          </Example>
          <p className="mt-5">
            <a className="source-link" href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
              <GitHubGlyph size={15} />
              Lire le code source
              <span className="source-link__licence">AGPL-3.0</span>
            </a>
          </p>
        </Section>

        {/* Modération & cadre légal */}
        <Section eyebrow="Cadre légal" title="Modération, signalement et vos droits">
          <p>
            Proxima est anonyme, mais pas <strong className="text-ink">ingouvernable</strong>. Chaque message peut être{' '}
            <strong className="text-ink">signalé</strong> à la modération depuis le service. La modération est
            réactive&nbsp;: elle ne surveille pas vos échanges — tout étant chiffré, elle ne le pourrait pas — mais agit
            sur signalement (retrait ciblé d'un message signalé, exclusion d'un participant, fermeture de salon). Vos
            messages privés <strong className="text-ink">comme vos salons</strong> restent{' '}
            <strong className="text-ink">illisibles</strong> pour nous&nbsp;: un contenu n'est signalé que via le texte
            que le signaleur fournit lui-même.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <a href="/cgu" className="chip chip-blue cursor-pointer">
              Conditions d'utilisation
            </a>
            <a href="/confidentialite" className="chip chip-blue cursor-pointer">
              Confidentialité (RGPD)
            </a>
            <a href="/moderation" className="chip chip-blue cursor-pointer">
              Politique de modération
            </a>
            <a href="/mentions-legales" className="chip chip-blue cursor-pointer">
              Mentions légales
            </a>
          </div>
          {legal?.contactEmail && (
            <p className="mt-4 text-[13.5px] text-muted">
              Point de contact (autorités, demandes légales)&nbsp;: <Mono>{legal.contactEmail}</Mono>.
            </p>
          )}

          {/* Accès Tor — l'endroit où un lecteur curieux cherchera l'information.
              On explique CE QUE ÇA CHANGE avant de donner l'adresse : sans cette
              phrase, 62 caractères illisibles ne veulent rien dire. Masqué quand on
              y est déjà, et jamais transformé en lien (cf. Footer.tsx). */}
          {legal?.onionHost && !isOnionOrigin() && (
            <p className="mt-4 text-[13.5px] text-muted">
              <strong className="text-ink">Accès par Tor.</strong> Proxima est aussi joignable en service onion. Par
              cette porte, votre adresse IP <strong className="text-ink">n'atteint jamais nos serveurs</strong>&nbsp;:
              nous ne voyons qu'un circuit Tor. Adresse (à ouvrir dans Tor Browser)&nbsp;:{' '}
              <Mono>{legal.onionHost}</Mono>
            </p>
          )}
        </Section>

        {/* Limites */}
        <Section eyebrow="Honnêteté" title="Nos limites, assumées">
          <p>La confiance passe aussi par la transparence sur ce que nous ne garantissons pas&nbsp;:</p>
          <ul className="mt-4 flex flex-col gap-2.5">
            <Limit>
              La <strong className="text-ink">majorité (18+)</strong> est déclarative&nbsp;: elle n'est pas vérifiée.
            </Limit>
            <Limit>
              La <strong className="text-ink">modération</strong> est réactive (sur signalement), sans surveillance
              automatique généralisée&nbsp;; une exclusion reste <strong className="text-ink">contournable</strong> (du
              fait de l'anonymat).
            </Limit>
            <Limit>
              En accès ordinaire, l'<strong className="text-ink">hébergeur voit votre IP</strong> (comme pour tout site
              web)&nbsp;; nous n'en gardons qu'une empreinte salée et éphémère, jamais l'adresse. Pour qu'elle ne nous
              parvienne pas du tout, il existe désormais un <strong className="text-ink">accès Tor</strong> (voir plus
              haut) — mais il reste minoritaire, et cette limite vaut pour la plupart des visites.
            </Limit>
            <Limit>
              Le chiffrement des salons est <strong className="text-ink">de groupe</strong>&nbsp;: il met le contenu
              hors de portée de l'hébergeur, jamais des participants — quiconque franchit la porte obtient la clé. Et
              il se fait sans <strong className="text-ink">authentification de l'auteur</strong> d'un message (un
              membre pourrait en usurper un autre).
            </Limit>
          </ul>
        </Section>

        {/* CTA */}
        <div className="mt-12 flex flex-col items-center gap-4 rounded-2xl border border-line bg-card p-8 text-center">
          <Logo className="h-12 w-12" />
          <h2 className="font-display text-2xl font-semibold">Prêt·e à essayer ?</h2>
          <p className="max-w-md text-sm text-muted">
            Vous savez désormais ce qui se passe sous le capot. Le reste se vit en discutant.
          </p>
          {/* Le Discord reste secondaire : la page se termine sur l'entrée dans le service. */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button className="btn btn-primary" onClick={closePage}>
              <Icon name="arrowRight" size={16} /> Revenir au service
            </button>
            {DISCORD_INVITE && (
              <a className="btn btn-discord" href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer">
                <DiscordGlyph size={17} /> Rejoindre le Discord
              </a>
            )}
          </div>
        </div>
      </article>
    </div>
  );
}

/* ======================================================================= */
/* Démos interactives                                                      */
/* ======================================================================= */

function ServerView({ alice, bob }: { alice: Party; bob: Party }) {
  const [text, setText] = useState('Rendez-vous demain à 18h ?');
  const presets = ['oui', 'Salut 🙂', 'Rendez-vous demain à 18h ?'];

  // Identifiants de session : 9 octets -> 12 caractères base64url, comme côté serveur
  // (`crypto.randomBytes(9).toString('base64url')`). Dérivés des clés pour rester stables.
  const ids = useMemo(
    () => ({
      from: sodium.to_base64(sodium.crypto_generichash(9, alice.publicKey, null), B64()),
      to: sodium.to_base64(sodium.crypto_generichash(9, bob.publicKey, null), B64()),
    }),
    [alice, bob],
  );
  const [ts] = useState(() => Date.now());

  const result = useMemo(() => {
    const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
    const padded = sodium.pad(sodium.from_string(text || ''), PAD);
    const ct = sodium.crypto_box_easy(padded, nonce, bob.publicKey, alice.privateKey);
    let decrypted = '';
    try {
      decrypted = sodium.to_string(sodium.unpad(sodium.crypto_box_open_easy(ct, nonce, alice.publicKey, bob.privateKey), PAD));
    } catch {
      decrypted = '—';
    }
    return {
      nonceB64: sodium.to_base64(nonce, B64()),
      pubB64: sodium.to_base64(alice.publicKey, B64()),
      ctB64: sodium.to_base64(ct, B64()),
      bytes: ct.length,
      decrypted,
    };
  }, [text, alice, bob]);

  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-muted">Votre message</label>
      <textarea
        className="input mb-2 resize-none"
        rows={2}
        value={text}
        maxLength={2000}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button key={p} className="chip cursor-pointer hover:border-blue" onClick={() => setText(p)}>
            {p || '(vide)'}
          </button>
        ))}
      </div>

      {/* Avant / après : le clair part de chez vous et arrive identique chez le destinataire. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Lane label="Sur votre appareil · avant envoi" icon="lock" tone="neutral">
          <p className="break-words text-[13px] text-ink">{text || <span className="text-faint">(vide)</span>}</p>
        </Lane>
        <Lane label="Chez le destinataire · après réception" icon="shield-check" tone="ok">
          <p className="break-words text-[13px] text-ink">{result.decrypted || <span className="text-faint">—</span>}</p>
          <p className="mt-2 text-[11px] text-verified">✓ déchiffré localement</p>
        </Lane>
      </div>

      {/* Le point central : TOUT ce que le serveur voit passer, champ par champ. */}
      <div className="mt-3 overflow-hidden rounded-xl border" style={{ borderColor: 'color-mix(in srgb, var(--color-danger) 22%, transparent)' }}>
        <div className="flex flex-wrap items-center justify-between gap-1 border-b px-3 py-2" style={{ borderColor: 'color-mix(in srgb, var(--color-danger) 18%, transparent)', background: 'var(--color-danger-tint)' }}>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-danger">
            <Icon name="radar" size={12} />
            Ce que le serveur voit passer
          </div>
          <span className="font-mono text-[10px] text-danger/80">événement pm:send</span>
        </div>
        <div className="px-3 py-2.5 text-[12px] leading-relaxed text-muted">
          On n'envoie pas « juste le message » : le serveur reçoit une <strong className="text-ink">enveloppe</strong>.
          Tout ce qui sert à <strong className="text-ink">acheminer</strong> (qui, à qui, quand) est{' '}
          <strong className="text-ink">en clair</strong> ; seul le <strong className="text-ink">contenu</strong> est un
          bloc chiffré.
        </div>
        <div className="flex flex-col gap-px" style={{ background: 'color-mix(in srgb, var(--color-danger) 12%, transparent)' }}>
          <Field name="toId" value={ids.to} hint="à qui relayer — l'identifiant du destinataire" />
          <Field name="fromId" value={ids.from} hint="de qui — votre session, connue du serveur via la connexion" />
          <Field name="env.pub" value={result.pubB64} hint="votre clé publique de session (sert à vérifier l'origine)" />
          <Field name="env.n" value={result.nonceB64} hint="nonce — aléa public, non secret" />
          <Field name="ts" value={String(ts)} hint="horodatage de l'envoi" />
          <Field name="env.c" value={result.ctB64} hint={`le contenu du message · ${result.bytes} octets — verrouillé`} secret />
        </div>
      </div>

      <p className="mt-3 text-[12.5px] leading-snug text-muted">
        Le serveur sait donc <strong className="text-ink">qui écrit à qui, et quand</strong> — le minimum pour livrer un
        message. Mais le contenu (<Mono>env.c</Mono>) lui reste <strong className="text-ink">illisible</strong> : sans la
        clé privée du destinataire, ce bloc n'est que du bruit.
      </p>
    </div>
  );
}

function FingerprintView({ alice, bob, mitm }: { alice: Party; bob: Party; mitm: Party }) {
  const [intercepted, setIntercepted] = useState(false);

  const { aliceSees, bobSees, match } = useMemo(() => {
    if (!intercepted) {
      const v = safetyNumber(alice.publicKey, bob.publicKey);
      return { aliceSees: v, bobSees: v, match: true };
    }
    // Un intercepteur présente SA clé à chacun : les deux calculent une empreinte différente.
    const a = safetyNumber(alice.publicKey, mitm.publicKey);
    const b = safetyNumber(bob.publicKey, mitm.publicKey);
    return { aliceSees: a, bobSees: b, match: a === b };
  }, [intercepted, alice, bob, mitm]);

  return (
    <div>
      <div className="mb-4 inline-flex rounded-xl border border-line bg-paper-2 p-1 text-sm">
        <button
          type="button"
          onClick={() => setIntercepted(false)}
          className={`rounded-lg px-3 py-1.5 font-semibold transition-colors ${!intercepted ? 'bg-card text-blue shadow-sm' : 'text-muted'}`}
        >
          Connexion normale
        </button>
        <button
          type="button"
          onClick={() => setIntercepted(true)}
          className={`rounded-lg px-3 py-1.5 font-semibold transition-colors ${intercepted ? 'bg-card text-danger shadow-sm' : 'text-muted'}`}
        >
          Avec un intercepteur
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Lane label="Empreinte vue par Alice" icon="lock" tone="neutral">
          <p className="break-all font-mono text-[12px] tracking-wider text-ink">{aliceSees}</p>
        </Lane>
        <Lane label="Empreinte vue par Bob" icon="lock" tone="neutral">
          <p className="break-all font-mono text-[12px] tracking-wider text-ink">{bobSees}</p>
        </Lane>
      </div>

      <div
        className="mt-3 flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-semibold"
        style={{
          borderColor: match
            ? 'color-mix(in srgb, var(--color-verified) 35%, transparent)'
            : 'color-mix(in srgb, var(--color-danger) 35%, transparent)',
          background: match ? 'var(--color-verified-tint)' : 'var(--color-danger-tint)',
          color: match ? 'var(--color-verified)' : 'var(--color-danger)',
        }}
      >
        <Icon name={match ? 'check' : 'close'} size={16} />
        {match
          ? 'Les empreintes correspondent — personne ne s’est intercalé.'
          : 'Les empreintes diffèrent — une interception est détectée !'}
      </div>
      <p className="mt-2 text-[12.5px] leading-snug text-muted">
        {intercepted
          ? "L'intercepteur ne peut pas forger une empreinte identique des deux côtés : la comparaison de vive voix le trahit."
          : 'En vous lisant ce code à voix haute, vous confirmez que vos clés n’ont pas été substituées.'}
      </p>
    </div>
  );
}

function PaddingView({ alice, bob }: { alice: Party; bob: Party }) {
  const [text, setText] = useState('oui');
  const presets = ['ok', 'à ce soir alors', 'un message nettement plus long que les précédents pour la démonstration'];

  const { plainBytes, ctBytes } = useMemo(() => {
    const plain = sodium.from_string(text || '');
    const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
    const ct = sodium.crypto_box_easy(sodium.pad(plain, PAD), nonce, bob.publicKey, alice.privateKey);
    return { plainBytes: plain.length, ctBytes: ct.length };
  }, [text, alice, bob]);

  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-muted">Votre message</label>
      <input className="input mb-2" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button key={p} className="chip cursor-pointer hover:border-blue" onClick={() => setText(p)}>
            {p.length > 22 ? p.slice(0, 22) + '…' : p}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Lane label="Longueur réelle du message" icon="hash" tone="neutral">
          <Gauge value={plainBytes} max={300} unit="octets" color="var(--color-faint)" />
        </Lane>
        <Lane label="Taille transmise au serveur" icon="radar" tone="ok">
          <Gauge value={ctBytes} max={600} unit="octets" color="var(--color-blue)" />
        </Lane>
      </div>
      <p className="mt-3 text-[12.5px] leading-snug text-muted">
        Tant que votre message tient dans un bloc, la taille transmise reste <strong className="text-ink">constante</strong>{' '}
        ({ctBytes} octets). Le serveur ne peut donc pas distinguer «&nbsp;oui&nbsp;» d'une phrase entière.
      </p>
    </div>
  );
}

/* ======================================================================= */
/* Briques d'UI                                                            */
/* ======================================================================= */

function safetyNumber(a: Uint8Array, b: Uint8Array): string {
  const [x, y] = sodium.compare(a, b) <= 0 ? [a, b] : [b, a];
  const cat = new Uint8Array(x.length + y.length);
  cat.set(x, 0);
  cat.set(y, x.length);
  return sodium.to_hex(sodium.crypto_generichash(16, cat, null)).toUpperCase().replace(/(.{4})(?=.)/g, '$1 ');
}

function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section className="border-b border-line py-10">
      <p className="mb-2 text-[13px] font-semibold text-blue">{eyebrow}</p>
      <h2 className="font-display text-[clamp(1.4rem,3vw,2rem)] font-semibold tracking-tight" style={{ textWrap: 'balance' }}>
        {title}
      </h2>
      <div className="mt-4 text-[15px] leading-relaxed text-muted [&_strong]:font-semibold">{children}</div>
    </section>
  );
}

function Pillar({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <span className="mb-2 inline-flex text-blue">
        <Icon name={icon} size={19} />
      </span>
      <div className="font-display text-[15px] font-semibold text-ink">{title}</div>
      <div className="mt-0.5 text-[13px] leading-snug text-muted">{text}</div>
    </div>
  );
}

function Example({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-5 rounded-xl border-l-2 border-blue bg-blue-tint/60 px-4 py-3.5">
      <div className="mb-1 text-[11.5px] font-semibold text-blue">{title}</div>
      <p className="text-[14px] leading-relaxed text-ink">{children}</p>
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-4 rounded-xl border border-line bg-card p-4">
      <span className="font-display text-2xl font-semibold leading-none text-blue/70 tabular-nums">{n}</span>
      <div>
        <div className="font-semibold text-ink">{title}</div>
        <p className="mt-0.5 text-[13.5px] leading-snug text-muted">{children}</p>
      </div>
    </li>
  );
}

function DemoCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-card">
      <div className="border-b border-line bg-paper-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="chip chip-blue">
            <Icon name="radar" size={11} /> Essayez vous-même
          </span>
          <span className="font-display text-[15px] font-semibold">{title}</span>
        </div>
        <p className="mt-1 text-[12.5px] text-muted">{subtitle}</p>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function DemoLoading() {
  return (
    <div className="flex items-center gap-2 py-6 text-sm text-muted">
      <span className="spin text-blue">
        <Icon name="radar" size={18} />
      </span>
      Préparation de la démonstration…
    </div>
  );
}

function Lane({ label, icon, tone, children }: { label: string; icon: string; tone: 'neutral' | 'ok' | 'bad'; children: ReactNode }) {
  const color = tone === 'ok' ? 'var(--color-verified)' : tone === 'bad' ? 'var(--color-danger)' : 'var(--color-faint)';
  return (
    <div className="rounded-xl border border-line bg-paper-2 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold" style={{ color }}>
        <Icon name={icon} size={12} />
        {label}
      </div>
      {children}
    </div>
  );
}

function Field({ name, value, hint, secret = false }: { name: string; value: string; hint: string; secret?: boolean }) {
  const tone = secret ? 'var(--color-verified)' : 'var(--color-danger)';
  const tint = secret ? 'var(--color-verified-tint)' : 'var(--color-danger-tint)';
  return (
    <div className="bg-card px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <code className="font-mono text-[11px] font-semibold text-ink">{name}</code>
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ color: tone, background: tint }}
        >
          <Icon name={secret ? 'lock' : 'radar'} size={9} />
          {secret ? 'chiffré · illisible' : 'lu en clair'}
        </span>
      </div>
      <p className="mt-1 break-all font-mono text-[10.5px] leading-relaxed text-faint">
        {value.length > 56 ? value.slice(0, 56) + '…' : value}
      </p>
      <p className="mt-0.5 text-[10.5px] leading-snug text-muted">{hint}</p>
    </div>
  );
}

function Gauge({ value, max, unit, color }: { value: number; max: number; unit: string; color: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div>
      <div className="mb-1.5 text-lg font-semibold tabular-nums text-ink">
        {value} <span className="text-[11px] font-normal text-muted">{unit}</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function KnowCard({ tone, title, items }: { tone: 'ok' | 'bad'; title: string; items: string[] }) {
  const isBad = tone === 'bad';
  return (
    <div
      className="rounded-2xl border p-5"
      style={{
        borderColor: isBad
          ? 'color-mix(in srgb, var(--color-danger) 22%, transparent)'
          : 'color-mix(in srgb, var(--color-verified) 22%, transparent)',
        background: isBad ? 'var(--color-danger-tint)' : 'var(--color-verified-tint)',
      }}
    >
      <div className="mb-3 flex items-center gap-2 font-semibold" style={{ color: isBad ? 'var(--color-danger)' : 'var(--color-verified)' }}>
        <Icon name={isBad ? 'close' : 'check'} size={16} />
        {title}
      </div>
      <ul className="flex flex-col gap-2 text-[13.5px] text-ink">
        {items.map((it) => (
          <li key={it} className="flex gap-2">
            <span style={{ color: isBad ? 'var(--color-danger)' : 'var(--color-verified)' }}>•</span>
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Limit({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2.5 text-[14px] leading-snug text-muted">
      <span className="mt-1 text-blue">
        <Icon name="shield" size={14} />
      </span>
      <span>{children}</span>
    </li>
  );
}

function Brick({ term, children }: { term: string; children: ReactNode }) {
  return (
    <li className="flex flex-col gap-1 rounded-xl border border-line bg-card p-3.5 sm:flex-row sm:items-baseline sm:gap-3">
      <code className="shrink-0 font-mono text-[12.5px] font-semibold text-blue">{term}</code>
      <span className="text-[13.5px] leading-snug text-muted">{children}</span>
    </li>
  );
}

function Mono({ children }: { children: ReactNode }) {
  return <code className="rounded bg-paper-2 px-1.5 py-0.5 font-mono text-[0.85em] text-ink">{children}</code>;
}
