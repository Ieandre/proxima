# Proxima

> Plateforme de chat **100 % anonyme**, **temps réel** et **éphémère**, pensée *privacy by design*.
> Aucune inscription, aucune donnée personnelle persistante, aucun pistage : l'utilisateur entre, discute, ferme son navigateur — et il ne reste rien.

Les personnes situées dans une même zone géographique (rayon de 75 km autour de la ville déclarée) échangent en messages privés chiffrés de bout en bout ou via des salons thématiques.

---

## Sommaire

- [Philosophie produit](#philosophie-produit)
- [Fonctionnalités](#fonctionnalités)
- [Architecture & stack](#architecture--stack)
- [Structure du projet](#structure-du-projet)
- [Prérequis](#prérequis)
- [Installation](#installation)
- [Configuration (`.env`)](#configuration-env)
- [Lancement](#lancement)
- [Tests](#tests)
- [Sécurité & chiffrement](#sécurité--chiffrement)
- [Modération & conformité (DSA / RGPD)](#modération--conformité-dsa--rgpd)
- [Limites connues & hors-scope v1](#limites-connues--hors-scope-v1)
- [Licence](#licence)
- [Sécurité](#sécurité)

---

## Philosophie produit

L'application offre un espace de discussion **spontané, local et sans engagement**, à l'opposé des réseaux sociaux fondés sur le profil persistant, la collecte de données et la traçabilité.

Principes directeurs :

- **Zéro compte, zéro PII** — pas d'email, pas de téléphone, pas de mot de passe de compte. L'identité (pseudo, âge, ville) n'existe que pendant la session navigateur.
- **Éphémère par construction** — tout vit en mémoire / Redis avec expiration automatique (TTL). La fermeture de l'onglet détruit la session : identité, MP, appartenance aux salons.
- **Chiffrement de bout en bout** — les messages privés et les salons chiffrés transitent par le serveur sous forme d'enveloppes **opaques** ; le serveur ne peut pas les lire.
- **Pas de pistage** — aucun tracker tiers, aucune analytics externe, aucune adresse IP journalisée en clair.

> Le fonctionnement interne est documenté de bout en bout dans [`DOCUMENTATION-TECHNIQUE.md`](./DOCUMENTATION-TECHNIQUE.md).

---

## Fonctionnalités

### Identité de session
- Renseignement à l'arrivée : **pseudo**, **âge** (18+ déclaratif), **genre**, **commune**.
- La commune est convertie en coordonnées via une **base embarquée hors-ligne** — **l'entièreté des communes** de France, Belgique, Suisse, Luxembourg et Monaco (37 756), recherchables par nom ou par code postal. Aucune géolocalisation GPS réelle n'est demandée.
- Les homonymes (3 675 communes françaises partagent leur nom) sont distingués par leur **département, province ou canton**, affiché dans la liste et redit après le choix.
- Identité **volatile**, liée à la session, détruite à la déconnexion (RG-01, RG-02).

### Présence de proximité
- L'utilisateur voit les personnes connectées dans un **rayon de 75 km** autour de sa ville déclarée (recherche géospatiale Redis `GEOSEARCH`).
- Pas d'annuaire global des connectés (RG-03).

### Messages privés (MP)
- **Chiffrés de bout en bout** (X25519 + XSalsa20-Poly1305 via libsodium).
- Texte et **pièces jointes** (photos / vidéos) chiffrées.
- Indicateur « est en train d'écrire », **safety number** (empreinte de conversation) pour détecter un MITM, signalement possible.

### Salons
Trois classes de salons :

| Type | Visibilité | Accès | Contenu |
|------|-----------|-------|---------|
| **Public** | Listé | Libre | En clair (modérable) |
| **Privé sur invitation** | Listé | Mot de passe **ou** lien d'invitation | En clair (modérable) |
| **Privé chiffré à mot de passe** | Listé (nom public) | Mot de passe figé à la création | **Chiffré E2E** (Argon2id → `crypto_secretbox`) |

- **Entrer est un clic, et ne s'annonce pas.** Aucune arrivée n'est diffusée dans aucun salon : la présence se lit dans la liste des présents, pas en interrompant la conversation. On peut donc regarder un salon avant d'y parler sans que cela coûte quoi que ce soit à personne. Seul un salon chiffré demande un temps d'arrêt — son mot de passe, dont la clé se dérive sur l'appareil.
- **Sortir n'est annoncé que si l'on a parlé.** Qui n'a fait que passer repart comme il est venu ; qui participait ne laisse pas ses interlocuteurs parler dans le vide. La condition ne vit que dans la connexion, et meurt avec l'onglet.
- **Gouvernance** : le créateur est propriétaire (exclure un membre, fermer le salon, changer le mot de passe). Le départ du propriétaire transfère le rôle au plus ancien participant présent (RG-06). Un salon vide est supprimé immédiatement (RG-05).
- **Salons permanents** : salons de référence amorcés au démarrage depuis un fichier JSON ([`server/data/permanent-rooms.json`](./server/data/permanent-rooms.json)).
- Les salons chiffrés ont un **plafond de membres** (défaut 16) pour borner la diffusion d'un espace non modérable.

### Mentions
Dans un salon, taper `@` propose les **présents** ; le pseudo choisi s'insère dans le message.

- Une mention **n'est que du texte** : aucune liste d'identifiants n'accompagne le message. Le serveur n'apprend donc rien de nouveau — sur un salon chiffré, il ignore jusqu'à l'existence de la mention.
- La reconnaissance se fait à l'affichage, contre la liste des présents ([`frontend/src/lib/mentions.ts`](./frontend/src/lib/mentions.ts)) : un `@inconnu` reste du texte ordinaire, et une personne partie cesse d'être mise en évidence.
- Être nommé teinte la bulle, fait passer la pastille du salon en `@n` et déclenche une alerte si l'on n'a pas le salon sous les yeux.

### Réponse à un message
Disponible dans les MP comme dans les salons : le message cité s'affiche en tête de la bulle, et un clic dessus ramène à l'original.

- **Seule la référence circule**, jamais l'extrait cité : chaque client résout la citation dans son propre fil. Un arrivant ne se voit donc pas servir un fragment de message antérieur à son arrivée — l'absence d'historique (RG-01) vaut aussi pour les citations.
- En **MP** et en **salon chiffré**, l'identifiant du message et la référence de réponse sont **scellés dans l'enveloppe** ([`frontend/src/lib/body.ts`](./frontend/src/lib/body.ts)) : le serveur ne peut pas reconstruire le graphe des réponses d'une conversation qu'il ne peut pas lire (RG-07).
- En **salon en clair**, seul l'identifiant du message cité transite — le serveur le relaie sans le stocker ni le vérifier.

### Modification d'un message
On retouche ses propres mots — une faute de frappe, une heure fausse — dans les MP comme dans les salons. Le texte d'origine revient dans le champ de saisie, la bulle concernée reste désignée pendant qu'on la réécrit, et la nouvelle version se signale par un « modifié » que personne ne peut retirer.

- **Le serveur ne peut pas dire qui a écrit quoi** : il ne conserve aucun message. Ce sont donc les **destinataires** qui autorisent la modification, en comparant l'auteur attesté par la connexion (`fromId`, jamais choisi par le client) à celui du message visé dans leur propre fil. Tenir côté serveur une table « message → auteur », même à TTL court, n'apporterait aucune garantie de plus — un client modifié affiche ce qu'il veut sur son écran — et ajouterait précisément la trace que le projet refuse.
- **En MP**, l'identifiant du message retouché est **scellé dans l'enveloppe** : le serveur ne sait pas même *lequel* est modifié. En **salon chiffré**, l'enveloppe est relayée telle quelle.
- **En salon en clair**, le nouveau texte **repasse par le filtre de mots-clés**, sous le même identifiant de message. Sans cela, écrire un message anodin puis le remplacer serait le moyen le plus simple de passer sous la modération.
- **Un retrait de la modération ne se défait pas** : une bulle retirée est verrouillée, son auteur ne peut plus la réécrire.
- Un message modifié **ne fait sonner personne** et ne recrée pas de non-lu : ajouter un `@pseudo` après coup met bien le nom en évidence, mais n'alerte pas — sinon la modification deviendrait une sonnette.

---

## Architecture & stack

Architecture **temps réel, en mémoire, éphémère** : aucune base de données persistante de contenu utilisateur.

### Backend (`server/`)
- **Node.js ≥ 20** (CommonJS)
- **Express 4** — service HTTP, en-têtes de sécurité, API REST minimale, service du build front
- **Socket.IO 4** — transport WebSocket temps réel
- **Redis 4** + **`@socket.io/redis-adapter`** — backplane pour le scaling horizontal :
  - **présence** (qui est en ligne) ;
  - **pub/sub** (diffusion des messages entre instances) ;
  - **requêtes géospatiales** (`GEOADD` / `GEOSEARCH`) ;
  - **stockage volatil** (sessions, salons, signalements) avec TTL.

### Frontend (`frontend/`)
- **React 19** + **TypeScript** + **Vite 7**
- **TailwindCSS 4** — interface responsive en **français uniquement**
- **Zustand 5** — état applicatif
- **socket.io-client** — temps réel
- **libsodium-wrappers / -sumo** — chiffrement de bout en bout côté client

### Scalabilité
Plusieurs instances WebSocket derrière un load balancer, synchronisées par Redis (présence + pub/sub partagés). Démarrage léger, montée en charge sans réécriture.

---

## Structure du projet

```
chat/
├── server/                     # Backend Node.js / Socket.IO
│   ├── index.js                # Point d'entrée : Express + Socket.IO + adaptateur Redis
│   ├── config.js               # Configuration centrale (surchargeable par env)
│   ├── protocol.js             # Primitives de fil partagées (clamp, ack, genId)
│   ├── security.js             # Hash IP salé rotatif, rate limiting, en-têtes (CSP/HSTS)
│   ├── metrics.js              # Instantané agrégé pour la console (zéro PII)
│   ├── admin.js                # Namespace /admin (console opérateur)
│   ├── room-actions.js         # Actions partagées par les deux transports (lobby, transfert/suppression)
│   │
│   ├── infra/
│   │   └── redis.js            # Connexion Redis (client + pub/sub)
│   │
│   ├── domain/                 # Métier pur — ne connaît pas Socket.IO
│   │   ├── sessions.js         # Sessions volatiles + profils publics
│   │   ├── rooms.js            # Cycle de vie des salons (création, membres, chiffrés)
│   │   ├── geo.js              # Présence géospatiale (rayon 75 km)
│   │   ├── cities.js           # Géocodage hors-ligne des communes + autocomplétion (nom ou code postal)
│   │   ├── moderation.js       # Signalements, exclusions, incidents (DSA/RGPD)
│   │   ├── invites.js          # Invitations à une conversation privée (TTL)
│   │   └── permanent-rooms.js  # Amorçage des salons permanents au boot
│   │
│   ├── handlers/               # Namespace public, une famille d'événements par fichier
│   │   ├── index.js            # registerHandlers : contexte de connexion + branchement + disconnect
│   │   ├── identity.js         # identify, identity:rename
│   │   ├── presence.js         # heartbeat, presence:list, typing
│   │   ├── pm.js               # pm:send, pm:key (enveloppes E2E opaques)
│   │   ├── pm-invites.js       # pm:invite:create/peek/claim/accept/revoke
│   │   ├── rooms.js            # room:create/list/peek/join/leave
│   │   ├── messages.js         # room:message (clair + chiffré, filtre de mots-clés)
│   │   ├── governance.js       # room:kick/close/password (propriétaire, RG-06)
│   │   └── reports.js          # pm:report, room:report (DSA art.16)
│   │
│   ├── operator/               # Console opérateur statique (/operator)
│   └── data/                   # cities.json, postal.json, permanent-rooms.json
│
├── frontend/                   # Application React / Vite
│   └── src/
│       ├── App.tsx             # Aiguillage par fragment (#cgu, #en-savoir-plus…)
│       ├── components/
│       │   ├── ui.tsx          # Primitives partagées (Avatar, Icon, Logo, Modal)
│       │   ├── NetworkBackground.tsx  # Fond animé (accueil + salon vide)
│       │   ├── layout/         # TopBar, Footer
│       │   ├── onboarding/     # Entrée dans le service, OnionDoor, Lifeline
│       │   ├── chat/           # Coquille, Composer, InviteCard
│       │   ├── sidebar/        # Présents, salons, conversations privées
│       │   ├── conversation/   # PMView, RoomView, MessageList, Members
│       │   ├── rooms/          # RoomBrowser, RoomCard
│       │   └── pages/          # About, AboutSchemas, Legal
│       ├── lib/                # crypto.ts (E2E), socket.ts, media.ts, types.ts
│       └── store/useStore.ts   # État Zustand
│
├── test/                       # Suite de tests (node:test natif)
│   └── helpers/                # fake-redis.js (Redis en mémoire), inject-redis.js
│
├── package.json                # Backend
└── .env.example                # Modèle de configuration
```

---

## Prérequis

- **Node.js ≥ 20** (testé sous Node 22)
- **Redis** accessible (local ou distant) — par défaut `redis://127.0.0.1:6379`

---

## Installation

```bash
# 1. Dépendances backend (à la racine)
npm install

# 2. Dépendances frontend
cd frontend
npm install
cd ..

# 3. Configuration locale
cp .env.example .env   # puis renseigner les valeurs (voir ci-dessous)
```

> **Note registre npm** : si le registre d'entreprise (Nexus) est injoignable, installer via le registre public npm (`npm install --registry=https://registry.npmjs.org/`).

---

## Configuration (`.env`)

Le serveur charge `.env` via `node --env-file=.env` (scripts `start` / `dev`). Toutes les valeurs sont surchargeables par variable d'environnement pour faciliter le déploiement.

| Variable | Défaut | Rôle |
|----------|--------|------|
| `OPERATOR_SECRET` | *(vide)* | Jeton unique de la console de modération (`/operator`). **Vide ⇒ console inerte.** |
| `CONTACT_EMAIL` | *(vide)* | Point de contact publié (DSA art. 11-12), affiché sur la page « En savoir plus ». |
| `PORT` | `3000` | Port HTTP. |
| `REDIS_URL` | `redis://127.0.0.1:6379` | URL de connexion Redis. |
| `RADIUS_KM` | `75` | Rayon de présence de proximité. |
| `MIN_AGE` | `18` | Âge minimum déclaratif. |
| `SESSION_TTL` | `90` | TTL d'une session (s), rafraîchi par heartbeat. |
| `ENCRYPTED_ROOM_MAX_MEMBERS` | `16` | Plafond de membres d'un salon chiffré. |
| `IP_SALT_ROTATE_MS` | `300000` | Période de rotation du sel de hachage IP. |
| `RL_WINDOW_SEC` / `RL_MAX` | `10` / `30` | Fenêtre et plafond de l'anti-spam (messages / hash IP). |
| `MOD_KEYWORDS` | *(vide)* | Mots-clés du filtre de modération non bloquant (salons publics). |
| `HSTS` | `0` | `1` pour activer l'en-tête HSTS (uniquement derrière TLS). Jamais émis sur l'onion. |
| `ONION_HOST` | *(vide)* | Adresse du service onion Tor. Vide ⇒ aucune annonce. **En prod : dans l'unité systemd**, pas dans `.env`. |
| `ONION_RL_GLOBAL_MAX` | `RL_MAX × 50` | Plafond global de l'anti-spam pour le trafic onion. |

> Générer un `OPERATOR_SECRET` :
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

---

## Lancement

### Développement

```bash
# Terminal 1 — backend (watch)
npm run dev

# Terminal 2 — frontend Vite (HMR, http://localhost:5173)
cd frontend
npm run dev
```

### Production

```bash
# 1. Builder le frontend (généré dans frontend/dist/)
cd frontend && npm run build && cd ..

# 2. Démarrer le serveur (sert automatiquement frontend/dist/)
npm start
```

Le serveur sert l'application complète sur `http://localhost:3000` (le build front est détecté automatiquement). La console opérateur est disponible sur `/operator`.

---

## Tests

La suite backend utilise le **module de test natif `node:test`** (zéro dépendance npm) et un **fake Redis en mémoire injecté** — aucun Redis réel n'est requis pour les tests.

```bash
npm test            # exécute toute la suite (77 tests)
npm run test:watch  # mode watch
```

Côté frontend, la vérification de types et le build :

```bash
cd frontend
npm run build       # tsc + vite build
```

---

## Sécurité & chiffrement

### Chiffrement de bout en bout
- **Messages privés** : paire de clés X25519 générée à chaque session côté client (`crypto_box`, X25519 + XSalsa20-Poly1305). La clé privée ne quitte jamais le navigateur. Le serveur relaie une enveloppe opaque `{ n, c, pub }`.
- **Salons chiffrés à mot de passe** : dérivation **Argon2id** du mot de passe → clé `crypto_secretbox` (jamais transmise) + `verifier` (preuve d'accès transmise au serveur). Le serveur ne voit jamais le mot de passe, ni la clé, ni le contenu.
- **Bourrage à taille fixe** (256 octets) avant chiffrement : la taille du ciphertext ne révèle pas la longueur du message (anti analyse de trafic).
- **Safety number** : empreinte canonique des deux clés publiques, comparable hors-bande pour détecter un MITM.

### Confidentialité des IP (RG-08)
- Aucune adresse IP n'est jamais journalisée ni stockée **en clair**.
- Quand une IP est nécessaire (anti-spam), seul un **hash salé** est manipulé, avec **sel rotatif** (toutes les 5 min) et TTL court.

### Accès Tor (service onion)
- Proxima est joignable par un **service onion v3**, en plus du clearnet. Par cette porte, l'adresse IP du visiteur **n'atteint jamais le serveur** : il ne voit qu'un circuit Tor. C'est la seule évolution qui améliore RG-08 par construction et non par précaution.
- **Mêmes salons, même présence** : une seule instance Node et un seul Redis servent les deux accès. L'onion est une porte supplémentaire, pas un service séparé.
- Le clearnet l'annonce par l'en-tête **`Onion-Location`** (bouton `.onion` dans Tor Browser) et par une mention lisible en pied de page et sur « En savoir plus ».
- Un badge **« Via Tor »** confirme l'accès à l'intéressé·e — et **à personne d'autre** : publier qui passe par Tor ferait des rares visiteurs onion d'un salon une classe repérable, à rebours de la promesse du service.
- Mise en service et exploitation : voir [`DOCUMENTATION-TECHNIQUE.md`](./DOCUMENTATION-TECHNIQUE.md) § Accès Tor.

### Durcissement HTTP
- **CSP stricte** sans tiers (`default-src 'self'`, pas de script inline).
- En-têtes `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Permissions-Policy`, et `HSTS` optionnel derrière TLS.
- En production, viser **TLS 1.3** et **WebSocket sécurisé (`wss://`)** terminés en amont.

---

## Modération & conformité (DSA / RGPD)

Un socle minimal de gouvernance, sans renoncer au *privacy by design* :

- **Signalement** (DSA art. 16 *notice-and-action*) : sur un message de salon ou un MP. Sur un contenu chiffré, le clair est fourni **volontairement** par le signaleur et marqué `unverified` (le serveur reste aveugle).
- **Filtre de mots-clés** non bloquant sur les salons publics uniquement (jamais sur les MP, RG-07) : un match crée un signalement pour l'opérateur sans bloquer la diffusion.
- **Console opérateur** (`/operator`, namespace Socket.IO `/admin`) protégée par `OPERATOR_SECRET` : consultation des signalements, retrait de contenu, exclusion volatile.
- **Préservation prospective bornée** : l'opérateur peut « geler » le sel IP (jamais rétroactivement), avec retour automatique au sel rotatif — exception explicite et plafonnée à RG-08.
- **Pages juridiques** : point de contact et mentions légales servis via `/api/legal`.

> ℹ️ La réserve « validation juridique préalable à toute mise en production » qui portait sur les salons privés chiffrés à mot de passe a été **levée le 2026-08-03**. La posture DSA reste inchangée (art. 8 : aucun scan du contenu chiffré ; art. 16 : signalement et retrait best-effort ; plafond de membres comme limitation de diffusion proportionnée).

---

## Limites connues & hors-scope v1

Choix assumés pour le MVP, documentés honnêtement :

- **Restriction d'âge déclarative** : la majorité (18+) repose sur une simple déclaration, sans vérification.
- **Modération réactive** : pas de modération automatique généralisée ; le dispositif repose sur le signalement et le retrait.
- **« Intraçabilité » non absolue** : un serveur web voit toujours l'IP du client. Le projet vise le **maximum de confidentialité raisonnable**, pas l'anonymat absolu (qui relèverait d'un autre produit, type réseau Tor).
- Hors-scope v1 : vérification d'âge réelle, rayon réglable, géolocalisation fine, internationalisation.

---

## Licence

**GNU Affero General Public License v3.0** — texte intégral dans [`LICENSE`](./LICENSE).

Ce choix n'est pas neutre, il découle directement de la promesse du produit. Un
service qui affirme ne pas lire vos messages et ne pas journaliser votre IP demande
qu'on le croie sur parole ; l'AGPL est ce qui transforme cette parole en obligation.
Toute personne qui **héberge** une version modifiée de Proxima doit en publier le
code source, y compris sans jamais distribuer de binaire. Il devient donc impossible
de faire tourner un « Proxima » auquel on aurait discrètement ajouté une
journalisation d'adresses IP ou une copie des messages en clair, sans que la
modification soit publique.

C'est la contrepartie du fait d'ouvrir le code : vous pouvez tout vérifier, et ceux
qui repartent de ce travail doivent la même vérifiabilité à leurs propres
utilisateurs.

## Sécurité

Les vulnérabilités se signalent en privé, selon la procédure décrite dans
[`SECURITY.md`](./SECURITY.md). Les failles qui contredisent les garanties du projet
— serveur aveugle, aucune PII persistante, aucune IP en clair — sont traitées en
priorité sur tout le reste.
