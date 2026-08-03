import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { identify, peekInvite } from '../../lib/socket';
import { useStore } from '../../store/useStore';
import { randomPseudo } from '../../lib/pseudo';
import type { CitySuggestion } from '../../lib/types';
import { SiteFooter } from '../layout/Footer';
import { TopBar } from '../layout/TopBar';
import { Icon, Logo } from '../ui';
import { OnionDoor } from './OnionDoor';
import { Lifeline } from './Lifeline';
import { NetworkBackground } from '../NetworkBackground';


/* Comparaison de noms de ville insensible à la casse et aux accents, pour
   reconnaître « chalons » comme « Châlons » — même esprit que le `normalize`
   de `server/cities.js`, sans lequel une saisie complète mais non accentuée
   exigerait un clic de plus dans la liste. */
const norm = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

export function Onboarding() {
  // Pseudo tiré au sort d'emblée : le champ cesse d'être un obstacle et devient
  // une proposition — on la garde, on la relance (le dé) ou on l'écrase.
  const [pseudo, setPseudo] = useState(randomPseudo);
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<'F' | 'H' | 'A' | ''>('');
  const [city, setCity] = useState('');
  const [cityChosen, setCityChosen] = useState<CitySuggestion | null>(null);
  const [suggestions, setSuggestions] = useState<CitySuggestion[]>([]);
  const [openSug, setOpenSug] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  // Dernière requête réellement partie au serveur : distingue « pas encore
  // cherché » de « cherché, rien trouvé ». Seul le second cas mérite d'expliquer
  // quoi faire — l'afficher trop tôt ferait paniquer dès la deuxième lettre.
  const [searched, setSearched] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // Arrivée par un lien d'invitation (`?r=<salon>`) : on adapte l'accueil pour donner le
  // contexte « vous rejoignez un salon » plutôt que la vitrine générique. Le nom du salon
  // n'est révélé qu'après identification (le pré-vol serveur exige une session).
  const [invitedRoom] = useState(() => new URLSearchParams(window.location.search).has('r'));
  // Invitation à une conversation privée (`?i=<jeton>`). Ici le
  // pré-vol n'exige aucune session : on affiche le pseudo de l'hôte AVANT le
  // formulaire, pour qu'on sache à qui l'on répond avant de donner quoi que ce soit.
  const [inviteToken] = useState(() => new URLSearchParams(window.location.search).get('i'));
  const [host, setHost] = useState<string | null>(null);
  const invited = invitedRoom || !!inviteToken;

  useEffect(() => {
    if (!inviteToken) return;
    let cancelled = false;
    peekInvite(inviteToken).then((res) => {
      if (cancelled) return;
      if (res.ok && res.pseudo) setHost(res.pseudo);
      else useStore.getState().showToast(res.error || 'Cette invitation a expiré.', 'warn');
    });
    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  // Autocomplétion de ville (debounce) sur la base embarquée.
  useEffect(() => {
    if (cityChosen && city === cityChosen.name) return;
    const q = city.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setSearched('');
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/cities?q=${encodeURIComponent(q)}`);
        const data = await r.json();
        const results: CitySuggestion[] = data.results || [];
        setSuggestions(results);
        setHighlighted(0);
        setSearched(q);
        // Nom complet tapé à la main, ou code postal ne menant qu'à une seule commune :
        // on le reconnaît au lieu d'exiger un clic de plus. On recopie le nom canonique,
        // ce qui referme la boucle de cet effet (la garde ci-dessus) en plus de corriger
        // la casse, les accents — et de remplacer le code par le nom de la commune.
        //
        // Un nom porté par plusieurs communes ne décide de rien, en revanche : depuis
        // que la base les couvre toutes, « Sainte-Colombe » en désigne douze. La liste
        // reste alors ouverte pour qu'on choisisse la sienne, au lieu d'en choisir une
        // à sa place — silencieusement, et à 500 km.
        const memeNom = results.filter((c) => norm(c.name) === norm(q));
        const exact =
          (memeNom.length === 1 ? memeNom[0] : undefined) ||
          (results.length === 1 && results[0].postal === q ? results[0] : undefined);
        if (exact) {
          setCity(exact.name);
          setCityChosen(exact);
          setOpenSug(false);
        } else {
          setOpenSug(true);
        }
      } catch {
        /* hors-ligne : on ignore */
      }
    }, 160);
    return () => clearTimeout(t);
  }, [city, cityChosen]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpenSug(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  function choose(sgg: CitySuggestion) {
    setCity(sgg.name);
    setCityChosen(sgg);
    setOpenSug(false);
  }

  function onCityKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') return setOpenSug(false);
    if (!openSug || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      // Sans cela, Entrée soumettrait le formulaire avec le texte brut (« met »),
      // que le serveur rejetterait faute de savoir le géocoder : le réflexe le plus
      // courant du clavier produisait l'échec le plus courant du formulaire.
      e.preventDefault();
      choose(suggestions[Math.min(highlighted, suggestions.length - 1)]);
    }
  }

  const ageNum = Number(age);
  // La ville doit venir de la base : on le vérifie ici plutôt que de laisser le
  // serveur refuser après le clic. Le genre et le pseudo ne bloquent plus rien.
  const valid =
    pseudo.trim().length >= 2 && Number.isInteger(ageNum) && ageNum >= 18 && ageNum <= 120 && cityChosen !== null;

  // Cherché, rien trouvé : la base couvrant toutes les communes, c'est désormais
  // l'orthographe qui est en cause. Il faut le dire, et surtout dire quoi faire —
  // sans quoi la liste vide est un cul-de-sac muet.
  const cityMiss = !cityChosen && suggestions.length === 0 && searched !== '' && searched === city.trim();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || busy || !cityChosen) return;
    setBusy(true);
    setError(null);
    const res = await identify({
      pseudo: pseudo.trim(),
      age: ageNum,
      // Genre laissé de côté : « Autre » est la valeur qui n'affirme rien.
      gender: gender || 'A',
      city: cityChosen.name,
      // L'identifiant tranche entre les homonymes ; le nom reste envoyé, il sert
      // de repli au serveur et de valeur lisible dans la mémoire d'onglet.
      cityId: cityChosen.id,
    });
    if (!res.ok) {
      setError(res.error || 'Échec de la connexion.');
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-full flex-col">
      {/* Fond animé : réseau de nœuds reliés qui flotte et se rassemble autour du curseur. */}
      <div className="onb-atmos" aria-hidden="true">
        <NetworkBackground />
      </div>

      <TopBar>
        <a href="#en-savoir-plus" className="link-quiet">
          Comment ça marche
        </a>
      </TopBar>

      <div className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-5 py-10 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        {/* ---- Volet gauche : message de confiance ---------------------- */}
        <section className="order-2 lg:order-1">
          {inviteToken ? (
            <>
              <span className="eyebrow-stamp fade-up" style={{ animationDelay: '40ms' }}>
                <Icon name="lock" size={13} />
                Invitation à une conversation privée
              </span>
              <h1 className="hero-title fade-up mt-5" style={{ animationDelay: '90ms' }}>
                {/* Le pseudo dès qu'on le connaît : savoir à qui l'on répond est la
                    première chose à vérifier, avant même de choisir son propre nom. */}
                {host ? `${host} veut vous parler en privé.` : 'Une conversation privée vous attend.'}
              </h1>
              <p className="hero-lede fade-up" style={{ animationDelay: '150ms' }}>
                Créez d'abord une identité de session — anonyme et éphémère.{' '}
                {host || 'Votre correspondant·e'} confirmera que c'est bien vous, et la conversation
                s'ouvrira.
              </p>
              <Lifeline
                items={[
                  {
                    when: 'avant d’entrer',
                    what: (
                      <>
                        Cette conversation n'existe que par le lien que vous avez suivi.{' '}
                        <strong>Personne d'autre ne peut y entrer</strong>, et elle n'apparaît dans aucun annuaire.
                      </>
                    ),
                  },
                  {
                    when: 'pendant la conversation',
                    what: (
                      <>
                        Vos messages sont chiffrés sur votre appareil. Le serveur ne fait que transporter des
                        enveloppes qu'il ne peut pas ouvrir.
                      </>
                    ),
                  },
                  {
                    when: 'à la fermeture de l’onglet',
                    what: <>Votre identité de session disparaît, et vous redevenez un inconnu.</>,
                  },
                ]}
              />
            </>
          ) : invitedRoom ? (
            <>
              <span className="eyebrow-stamp fade-up" style={{ animationDelay: '40ms' }}>
                <Icon name="key" size={13} />
                Invitation à un salon privé
              </span>
              <h1 className="hero-title fade-up mt-5" style={{ animationDelay: '90ms' }}>
                Un salon privé vous attend.
              </h1>
              <p className="hero-lede fade-up" style={{ animationDelay: '150ms' }}>
                Vous avez suivi un lien d'invitation. Créez d'abord une identité de session —
                anonyme et éphémère — et vous rejoindrez le salon aussitôt.
              </p>
              <Lifeline
                items={[
                  {
                    when: 'avant d’entrer',
                    what: (
                      <>
                        Ce salon n'est accessible que par l'adresse que vous avez suivie. Il{' '}
                        <strong>n'apparaît dans aucun annuaire</strong>, et personne ne peut le trouver en cherchant.
                      </>
                    ),
                  },
                  {
                    when: 'dans le salon',
                    what: (
                      <>
                        Les échanges sont chiffrés sur votre appareil. Le serveur ne fait que transporter des
                        enveloppes qu'il ne peut pas ouvrir.
                      </>
                    ),
                  },
                  {
                    when: 'à la fermeture de l’onglet',
                    what: <>Votre identité de session disparaît, et vous redevenez un inconnu.</>,
                  },
                ]}
              />
            </>
          ) : (
            <>
              <h1 className="hero-title fade-up" style={{ animationDelay: '40ms' }}>
                Parlez aux gens autour de vous, sans rien révéler de vous.
              </h1>
              <p className="hero-lede fade-up" style={{ animationDelay: '150ms' }}>
                Choisissez un pseudo, entrez, discutez avec votre ville. Votre identité vit le temps d'une visite,
                puis il n'en reste rien.
              </p>
              <Lifeline
                items={[
                  {
                    when: 'à l’ouverture',
                    what: (
                      <>
                        Un pseudo, un âge, une ville. <strong>Aucun compte, aucun email</strong> — rien qui vous relie
                        à hier ni à demain.
                      </>
                    ),
                  },
                  {
                    when: 'pendant la visite',
                    what: (
                      <>
                        Vos messages privés sont chiffrés sur votre appareil. Le serveur ne fait que transporter des
                        enveloppes qu'il ne peut pas ouvrir.
                      </>
                    ),
                  },
                  {
                    when: 'à la fermeture de l’onglet',
                    what: (
                      <>
                        Identité, salons et conversations sont effacés. Il n'y a rien à réclamer, rien à revendre,
                        rien à faire fuiter.
                      </>
                    ),
                  },
                ]}
              />
              <OnionDoor />
            </>
          )}
        </section>

        {/* ---- Volet droit : formulaire d'entrée -------------------------- */}
        <section className="order-1 lg:order-2">
          <form onSubmit={submit} className="panel door relative fade-up" style={{ animationDelay: '120ms' }}>
            <div className="relative z-10">
              <div className="flex items-center gap-3.5">
                <Logo className="h-10 w-10" />
                <div className="min-w-0">
                  <h2 className="font-display text-xl font-semibold leading-tight tracking-tight">
                    {invited ? 'Créez votre identité' : 'Rejoindre Proxima'}
                  </h2>
                  <p className="mt-1 text-[13px] leading-snug text-faint">
                    Valable le temps de cet onglet.
                  </p>
                </div>
              </div>
              <hr className="door__rule" />

              <label htmlFor="champ-pseudo" className="mb-1.5 block text-sm font-medium text-muted">
                Pseudo
              </label>
              <div className="relative mb-4">
                <input
                  id="champ-pseudo"
                  className="input pr-11"
                  placeholder="ex. VoisinBleu"
                  maxLength={24}
                  value={pseudo}
                  onChange={(e) => setPseudo(e.target.value)}
                />
                <button
                  type="button"
                  className="input-action"
                  onClick={() => setPseudo(randomPseudo())}
                  title="Un autre pseudo"
                  aria-label="Proposer un autre pseudo"
                >
                  <Icon name="dice" size={16} />
                </button>
              </div>

              <div className="mb-4 grid grid-cols-[100px_1fr] gap-3">
                <div>
                  <label htmlFor="champ-age" className="mb-1.5 block text-sm font-medium text-muted">
                    Âge
                  </label>
                  <input
                    id="champ-age"
                    className="input"
                    type="number"
                    inputMode="numeric"
                    min={18}
                    max={120}
                    placeholder="18"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    /* Le pseudo arrive déjà rempli : le premier champ à remplir est ici. */
                    autoFocus
                  />
                </div>
                <div ref={boxRef} className="relative">
                  <label htmlFor="champ-ville" className="mb-1.5 block text-sm font-medium text-muted">
                    Ville
                  </label>
                  <input
                    id="champ-ville"
                    className="input"
                    placeholder="Commune ou code postal"
                    value={city}
                    onChange={(e) => {
                      setCity(e.target.value);
                      setCityChosen(null);
                    }}
                    onKeyDown={onCityKey}
                    onFocus={() => suggestions.length > 0 && setOpenSug(true)}
                    autoComplete="off"
                    role="combobox"
                    aria-expanded={openSug && suggestions.length > 0}
                    aria-controls="liste-villes"
                    aria-autocomplete="list"
                    aria-activedescendant={openSug && suggestions.length > 0 ? `ville-${highlighted}` : undefined}
                  />
                  {openSug && suggestions.length > 0 && (
                    <ul
                      id="liste-villes"
                      role="listbox"
                      aria-label="Communes proposées"
                      className="panel scroll absolute z-20 mt-1.5 max-h-72 w-full overflow-auto p-1.5 text-sm"
                    >
                      {/* `role="presentation"` sur le <li> : une option doit être fille
                          directe de la liste, l'élément ne doit pas s'intercaler dans
                          l'arbre ARIA. */}
                      {suggestions.map((sgg, i) => (
                        <li key={`${sgg.name}-${i}`} role="presentation">
                          <button
                            type="button"
                            id={`ville-${i}`}
                            role="option"
                            aria-selected={i === highlighted}
                            /* Le clavier reste dans le champ : la sélection se déplace par
                               `aria-activedescendant`, ces boutons ne se prennent pas le focus. */
                            tabIndex={-1}
                            className={`block w-full rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-paper-2 ${
                              i === highlighted ? 'bg-paper-2' : ''
                            }`}
                            onMouseEnter={() => setHighlighted(i)}
                            onClick={() => choose(sgg)}
                          >
                            <span className="flex items-baseline justify-between gap-2">
                              <span className="min-w-0 truncate text-ink">{sgg.name}</span>
                              {sgg.postal && <span className="flex-none text-[11px] text-faint">{sgg.postal}</span>}
                            </span>
                            {/* Deuxième ligne : ce qui distingue deux communes du même nom.
                                Le pays reste dit même en recherche par code — « 1000 » est à
                                la fois Bruxelles et Lausanne. */}
                            <span className="block truncate text-[11.5px] leading-tight text-faint">
                              {sgg.admin} · {sgg.countryLabel}
                              {/* Localité rattachée à une commune voisine : il faut le dire,
                                  sinon la proposition a l'air de tomber du ciel. */}
                              {sgg.via && ` — pour ${sgg.via}`}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* La commune retenue est redite en clair : l'autocomplétion reconnaît un nom
                  tapé en entier, et douze communes s'appellent « Sainte-Colombe » — on doit
                  pouvoir vérifier d'un coup d'œil que c'est bien la sienne. */}
              {cityChosen ? (
                <p className="-mt-2 mb-4 text-[12px] leading-snug text-muted">
                  Vous entrerez depuis <strong className="font-medium text-ink">{cityChosen.name}</strong>
                  <span className="text-faint">
                    {' '}
                    — {cityChosen.admin}, {cityChosen.countryLabel}
                  </span>
                  .
                </p>
              ) : cityMiss ? (
                <p className="-mt-2 mb-4 text-[12px] leading-snug text-muted">
                  Rien sous ce nom. Toutes les communes de France, Belgique, Suisse, Luxembourg et Monaco sont dans
                  la liste : vérifiez l'orthographe, ou tapez votre{' '}
                  <strong className="font-medium">code postal</strong>.
                </p>
              ) : null}

              <span className="mb-1.5 block text-sm font-medium text-muted" id="lbl-genre">
                Genre <span className="font-normal text-faint">— facultatif</span>
              </span>
              <div className="segmented mb-5" role="radiogroup" aria-labelledby="lbl-genre">
                {([['F', 'Femme'], ['H', 'Homme'], ['A', 'Autre']] as const).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    role="radio"
                    aria-checked={gender === val}
                    /* Re-cliquer sur le choix actif le retire : un champ facultatif doit
                       pouvoir redevenir vide, sinon il ne l'est qu'avant le premier clic. */
                    onClick={() => setGender((g) => (g === val ? '' : val))}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {error && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--color-danger)_35%,transparent)] bg-[var(--color-danger-tint)] px-3 py-2 text-sm text-danger">
                  {error}
                </div>
              )}

              <button className="btn btn-primary w-full" disabled={!valid || busy}>
                {busy ? (
                  <span className="spin">
                    <Icon name="clock" />
                  </span>
                ) : (
                  <Icon name="arrowRight" />
                )}
                {/* « Entrer » partout, comme dans les salons et leurs annonces
 : un seul verbe pour un seul geste. */}
                {busy
                  ? 'Connexion…'
                  : inviteToken
                    ? 'Entrer dans la conversation'
                    : invitedRoom
                      ? 'Entrer dans le salon'
                      : 'Entrer dans le service'}
              </button>

              {/* Une seule déclaration de majorité (RG-04) : le champ âge suffit, une case à
                  cocher redirait la même chose. Elle porte sur le geste d'entrer, et se place
                  sous le bouton pour rester sous les yeux au moment du clic. */}
              <p className="mt-3.5 text-[11.5px] leading-relaxed text-faint">
                En entrant, je certifie avoir <strong className="text-muted">18 ans ou plus</strong> et j'accepte les{' '}
                <a href="#cgu" className="underline underline-offset-2 hover:text-blue">
                  conditions d'utilisation
                </a>{' '}
                et la{' '}
                <a href="#moderation" className="underline underline-offset-2 hover:text-blue">
                  politique de modération
                </a>
                . Les contenus illégaux sont interdits et signalables.
              </p>
            </div>
          </form>
        </section>
      </div>

      <SiteFooter />
    </div>
  );
}

/* ==========================================================================
 * Accès Tor, sur l'accueil.
 *
 * Placé APRÈS la chronologie, et pas dedans : la Lifeline énumère ce qui
 * disparaît, moment par moment. L'accès onion n'est pas un moment — c'est la
 * réponse à ce que la chronologie laisse ouvert. La page « En savoir plus »
 * l'admet noir sur blanc : une chose nous parvient encore, l'adresse IP. Ce
 * bloc est l'endroit où cette dernière réserve se lève.
 *
 * L'adresse elle-même est le sujet visuel, pas une note technique reléguée en
 * petit : c'est ce que le lecteur doit emporter. D'où l'inversion de hiérarchie
 * — la chaîne en mono tient la place que prendrait ailleurs un titre.
 *
 * Le préfixe `proxima` n'est délibérément PAS mis en valeur. Ce serait le geste
 * évident, et il est nuisible : une adresse vanity est imitable, et habituer
 * l'œil à reconnaître le début l'habitue à ne plus lire la fin — seule partie
 * qui distingue la vraie adresse d'une contrefaçon.
 * ======================================================================== */
