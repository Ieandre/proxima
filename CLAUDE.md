# CLAUDE.md

Chat anonyme de proximité — plateforme temps réel **éphémère** et **privacy by design**.
Aucun compte, aucune PII persistante, tout vit en mémoire/Redis avec TTL.

Doc produit : [`README.md`](./README.md) · référence technique et règles métier `RG-XX` : [`DOCUMENTATION-TECHNIQUE.md`](./DOCUMENTATION-TECHNIQUE.md).

## Commandes

| But | Commande | Depuis |
|-----|----------|--------|
| Tests backend unitaires + intégration (zéro-dep) | `npm test` | racine |
| Tests backend en watch | `npm run test:watch` | racine |
| Tests E2E Socket.IO réels (dép. npm requises) | `npm run test:e2e` | racine |
| Backend : unitaires/intégration **puis** E2E | `npm run test:all` | racine |
| Tests frontend (Vitest) | `npm test` | `frontend/` |
| Tests frontend en watch | `npm run test:watch` | `frontend/` |
| Tests frontend + couverture | `npm run test:coverage` | `frontend/` |
| Backend en dev (watch) | `npm run dev` | racine |
| Backend prod (sert `frontend/dist/`) | `npm start` | racine |
| Frontend dev (Vite HMR, :5173) | `npm run dev` | `frontend/` |
| Frontend build + typecheck | `npm run build` (`tsc && vite build` + pré-compression) | `frontend/` |
| Régénérer la base des communes (`cities.json` + `postal.json`) | `npm run build:geo` (`--refresh` pour ignorer le cache) | racine |
| Régénérer les assets de marque (favicon, icônes PWA, OG…) | `npm run build:brand [source.png]` | racine |

- **Toujours** lancer `npm test` après une modif backend, et `npm run build` (dans `frontend/`) après une modif front — `build` fait office de typecheck.
- Le `npm test` racine (unitaires + intégration des handlers) n'a **besoin d'aucun Redis réel** ni d'aucune dépendance npm (voir ci-dessous). Les suites **E2E** et **frontend**, elles, requièrent `npm install` (respectivement `socket.io-client` à la racine et Vitest dans `frontend/`).
- Node ≥ 20 requis (`--env-file`, `node:test`).

## Architecture (modèle mental)

**Backend `server/`** — CommonJS, `'use strict'`, Node ≥ 20. Point d'entrée `index.js` : Express (HTTP + en-têtes sécu + service du build front) + Socket.IO (temps réel) + adaptateur Redis (backplane scaling horizontal). Redis sert à 4 choses : présence, pub/sub, géo (`GEOADD`/`GEOSEARCH`), stockage volatil à TTL.

Trois couches, et la dépendance ne remonte jamais :

- **`infra/redis.js`** — les trois connexions Redis (applicative, pub, sub).
- **`domain/`** — métier pur, **ne connaît pas Socket.IO** : `sessions`, `rooms`, `geo`, `cities`, `moderation`, `invites`, `permanent-rooms`. Testable isolément avec le fake Redis injecté.
- **`handlers/`** — namespace Socket.IO public, **une famille d'événements par fichier** : `identity`, `presence`, `pm`, `pm-invites`, `rooms`, `messages`, `governance`, `reports`. `handlers/index.js` ne contient aucune règle métier : il construit le **contexte de connexion** (`sid`, `limited`, `pushLobby`, `broadcastMembers`, `handleLeave`, `notifyReport`) et le passe au `register(ctx)` de chaque module, puis gère `disconnect`.

À la racine, ce qui ne relève d'aucune des trois : `config.js`, `protocol.js` (primitives de fil `clamp`/`ack`/`genId`, partagées par les deux transports), `security.js`, `metrics.js`, `admin.js` (namespace `/admin`) et `room-actions.js` (actions de cycle de vie **io-aware**, partagées par `handlers/` et `admin.js` — d'où sa position hors de `domain/`).

**Où ajouter un handler** : dans le fichier de sa famille, jamais dans `handlers/index.js`. Il reçoit `ctx` en argument et n'importe rien de plus que son domaine. Si la famille n'existe pas, créer le fichier et l'enregistrer dans `handlers/index.js`.

**Frontend `frontend/src/`** — ESM, React 19 + TypeScript + Vite 7 + Tailwind 4, état dans Zustand (`store/useStore.ts`), temps réel via `socket.io-client`. Le chiffrement E2E client est dans `lib/crypto.ts` (libsodium).

**Console opérateur `server/operator/`** — page statique servie sur `/operator`, parle au namespace Socket.IO `/admin` (dans `admin.js`), protégée par `OPERATOR_SECRET`.

## Conventions

- **Français partout** : UI, commentaires, messages de commit. Respecter les accents (jamais d'ASCII dégradé). Identifiants de code en anglais comme l'existant.
- Backend = CommonJS (`require`, `module.exports`, `'use strict'`). Frontend = ESM/TSX. Ne pas mélanger.
- Config centralisée dans `server/config.js` : tout est surchargeable par variable d'env via le helper `num(...)`. Ne pas lire `process.env` ailleurs — ajouter la clé dans `config.js`.
- Les commentaires référencent les règles métier (`RG-01`…) et les articles DSA/RGPD. Conserver ce style quand on touche au code concerné.
- Commentaires : expliquer le **pourquoi** d'un choix non évident (sécurité, conformité, contrepartie assumée), jamais paraphraser le code ni raconter l'historique du dépôt — git s'en charge. Pas de date ni de renvoi à un document de travail.

## Tests

Trois couches, du plus léger au plus proche du réel :

1. **Unitaires + intégration backend** — `test/*.test.js`, **`node:test` natif (zéro dépendance npm)** + **fake Redis en mémoire injecté** (`test/helpers/fake-redis.js`, branché via `test/helpers/inject-redis.js`). Aucun Redis réel n'est démarré. Un module par fichier (`sessions`, `rooms`, `geo`, `security`, `moderation`, `permanent-rooms`, `admin`, `cities`, `config`, `room-actions`) **plus** `test/socket.test.js` qui pilote **tous les handlers de `handlers/`** via un harness Socket.IO en mémoire (`test/helpers/socket-harness.js` : émule `io`/`socket`, rooms, accusés, namespace `/admin`) — sans réseau. C'est la suite exécutée par `npm test` ; elle doit **rester zéro-dep**.
2. **E2E temps réel** — `test-e2e/**/*.e2e.test.js` (`npm run test:e2e`). Vrai serveur Socket.IO + vrais clients `socket.io-client` sur WebSocket (helpers `test-e2e/helpers/`), toujours avec le fake Redis injecté mais **sans** adaptateur Redis. Exerce la sérialisation, les accusés et les diffusions authentiques (filet « boîte noire » du câblage). Nécessite `npm install` (dépendance dev `socket.io-client`).
3. **Frontend (Vitest)** — `frontend/test/*.test.ts` (`cd frontend && npm test`), environnement **`node`** (pas jsdom : évite la divergence de realm `TextEncoder`→`Uint8Array` qui casse libsodium). Couvre `lib/crypto.ts` (allers-retours E2E MP `crypto_box` + salons `Argon2id`/`crypto_secretbox`), `lib/body.ts` (corps de message scellé : identifiant + réponse citée), `lib/mentions.ts` (reconnaissance des `@pseudo` contre les présents), `lib/media.ts` (préparation des pièces jointes), `lib/sound.ts` (voix de notification synthétisée, sourdine, anti-rafale — avec un faux contexte Web Audio) et `store/useStore.ts` (mutations Zustand, purge RAM RG-01/02).

Pour un nouveau module backend qui touche Redis, suivre le pattern d'injection du fake plutôt que de mocker à la main. Pour un nouveau handler dans `handlers/`, ajouter un cas dans `test/socket.test.js` (rapide, déterministe) **et**, si le câblage temps réel est en jeu, un parcours E2E.

## Contraintes non négociables (l'âme du projet)

- **Zéro PII persistante, tout éphémère** : pas de base de données de contenu. Si une donnée doit survivre, elle a un TTL Redis. Ne jamais introduire de stockage durable d'identité ou de messages.
- **E2E = serveur aveugle** : MP et salons chiffrés transitent en enveloppes **opaques**. Ne jamais déchiffrer côté serveur, ni logger un clair, ni transmettre mot de passe/clé au serveur.
- **IP jamais en clair** (RG-08) : seul un **hash salé à sel rotatif** (TTL court) est manipulé, via `security.js`. Ne jamais journaliser ni stocker une IP brute.
- **CSP stricte, aucun script inline** : c'est pourquoi le JS de la console opérateur est un fichier séparé (`operator/app.js`). Tout nouveau JS doit être un fichier servi, pas de `<script>` inline ni de handler `on*` inline.
- **Modération jamais sur les MP** (RG-07) : le filtre mots-clés et la console opérateur n'agissent que sur les salons publics. Ne pas étendre la modération aux messages privés.
- **Salons chiffrés à mot de passe** : la réserve « validation juridique avant toute mise en prod » a été **levée par le porteur du projet le 2026-08-03** (elle couvrait aussi l'accès Tor). Ce qui reste non négociable, c'est la **posture technique** qui porte la conformité : art. 8 (aucun scan du contenu chiffré), art. 16 (signalement `reporter-cleartext`/`unverified` + retrait best-effort), et le **plafond de membres** (`ENCRYPTED_ROOM_MAX_MEMBERS`, défaut 16) comme limitation de diffusion proportionnée. Affaiblir l'un des trois rouvre le sujet.

## Pièges

- En prod, `index.js` sert `frontend/dist/` s'il existe ; sinon il affiche un message « build manquant ». Builder le front avant de tester le serveur en mode prod.
- Le build front génère aussi les variantes `.br`/`.gz` (`scripts/precompress.js`) que le serveur sert selon `Accept-Encoding`. Un `vite build` lancé seul, sans ce script, prive donc le site de la compression (−76 % sur le bundle).
- La base géographique (`server/data/cities.json`, **l'entièreté des communes** FR/BE/CH/LU/MC, et `postal.json`) est générée par `node scripts/build-geo.js` — les **deux** fichiers ensemble, `postal.json` désignant les communes par leur **rang** dans `cities.json`. Ne jamais régénérer l'un seul : `cities.js` détecte la désynchronisation au boot, l'annonce et désactive la recherche par code postal (le nom de commune continue de fonctionner). Le script télécharge ses sources (INSEE via `geo.api.gouv.fr`, dumps GeoNames) dans `.geo-cache/`, non versionné : une seconde exécution est hors-ligne.
- 3 675 communes françaises portent un nom qu'une autre porte aussi. Le nom ne désigne donc pas un lieu : l'autocomplétion expose un **identifiant stable** (`FR-57463`) que le client renvoie à `identify`, et `cities.resolve({ id, name })` le préfère au nom. `cities.geocode(nom)` existe encore mais rend **la commune la plus peuplée** — ne pas l'utiliser sur une saisie utilisateur.
- Tous les assets de marque de `frontend/public/` (`logo.svg`, `favicon.png`, `apple-touch-icon.png`, `icon-192`/`512`, `icon-maskable-512`, et la marque incrustée dans `og-image.png`) sont **générés** par `scripts/build-brand-assets.js` depuis `logo.png` — ne pas les retoucher à la main, ils seraient écrasés. Pour changer de logo : passer le nouvel export en argument (`npm run build:brand chemin/vers/export.png`), le script recadre, recentre et régénère tout. Il est idempotent (relancé sans argument, il repart de sa propre sortie et ne change rien). L'interface et le favicon utilisent le **SVG** (1,5 Ko, tracé depuis le raster) ; `logo.png` ne sert plus qu'au JSON-LD `Organization`, qui déclare ses dimensions 1024×1024 — les garder cohérentes.
- Une seule URL est indexable (`/`) : la navigation passe par le fragment. Tout autre chemin renvoie une vraie 404 — ne pas rétablir un fallback `app.get('*')` vers `index.html`, qui recréerait des « soft 404 » aux yeux des moteurs.
- `npm start`/`npm run dev` chargent `.env` via `--env-file`. Sur Render, **pas** de `--env-file` (les variables sont injectées) — `startCommand: node server/index.js` (voir `render.yaml`).
- `OPERATOR_SECRET` vide ⇒ console `/operator` **inerte** (refus total), c'est voulu.
- Registre npm : si le Nexus d'entreprise est injoignable, installer via `npm install --registry=https://registry.npmjs.org/`.
