# Documentation technique — Proxima

> Référence technique **de bout en bout** du chat anonyme de proximité.
> Ce document explique le **comment** : flux de données réels, modules, événements
> temps réel, chiffrement, sécurité, déploiement. Les règles métier `RG-XX`
> auxquelles renvoient les commentaires du code sont énoncées au [§1](#1-vue-densemble).
> La présentation **produit** est dans [`README.md`](./README.md), les **conventions
> de contribution** dans [`CLAUDE.md`](./CLAUDE.md).

## Sommaire

1. [Vue d'ensemble](#1-vue-densemble)
2. [Stack & topologie](#2-stack--topologie)
3. [Cycle de vie d'une session (end-to-end)](#3-cycle-de-vie-dune-session-end-to-end)
4. [Backend, module par module](#4-backend-module-par-module)
5. [Modèle de données Redis](#5-modèle-de-données-redis)
6. [Référence des événements Socket.IO](#6-référence-des-événements-socketio)
7. [Frontend](#7-frontend)
8. [Chiffrement de bout en bout](#8-chiffrement-de-bout-en-bout)
9. [Sécurité & confidentialité transverses](#9-sécurité--confidentialité-transverses)
10. [Modération & conformité DSA/RGPD](#10-modération--conformité-dsargpd)
11. [Configuration (variables d'environnement)](#11-configuration-variables-denvironnement)
12. [Tests](#12-tests)
13. [Déploiement & exploitation](#13-déploiement--exploitation)
14. [Limites connues & hors-scope](#14-limites-connues--hors-scope)

---

## 1. Vue d'ensemble

**Proxima** est une plateforme de chat **anonyme, temps réel et éphémère**. Une
personne entre un pseudo, un âge, un genre et une ville ; elle voit les autres
personnes connectées dans un rayon de 75 km, leur écrit en messages privés
chiffrés, ou rejoint des salons thématiques. À la fermeture de l'onglet, **il ne
reste rien**.

### Principes non négociables (l'âme du projet)

Ces cinq contraintes structurent chaque décision technique du code :

| Principe | Traduction technique |
|----------|----------------------|
| **Zéro PII persistante, tout éphémère** | Aucune base de contenu. Toute donnée qui survit a un **TTL Redis**. Redis lui-même tourne **sans persistance disque** (`save ''`, `appendonly no`). |
| **E2E = serveur aveugle** | MP et salons chiffrés transitent en **enveloppes opaques**. Le serveur ne déchiffre jamais, ne logge jamais de clair, ne reçoit jamais mot de passe ni clé. |
| **IP jamais en clair** (RG-08) | Seul un **hash salé à sel rotatif** (TTL court) est manipulé, via `security.js`. Aucune IP brute journalisée ni stockée. |
| **CSP stricte, aucun script inline** | D'où le JS de la console opérateur en fichier servi (`operator/app.js`). Aucun `<script>` inline, aucun handler `on*` inline. |
| **Modération jamais sur les MP** (RG-07) | Le filtre mots-clés et la console opérateur n'agissent que sur les **salons publics**. |

### Règles métier (`RG-XX`)

Les commentaires du code renvoient à ces règles. Elles sont la référence normative :
un changement de comportement qui contredit l'une d'elles est un changement de
périmètre, pas un détail d'implémentation.

| Règle | Énoncé |
|-------|--------|
| **RG-01** | Toute donnée d'identité (pseudo, âge, ville) est volatile et liée à la session navigateur. |
| **RG-02** | La fermeture du navigateur/onglet déclenche la destruction de la session : identité, MP, appartenance aux salons. |
| **RG-03** | Un utilisateur ne voit que les personnes situées dans un rayon de 75 km de sa ville déclarée, ou les membres du salon dans lequel il se trouve. |
| **RG-04** | L'accès est conditionné à une déclaration de majorité (18+). |
| **RG-05** | Un salon vide est immédiatement supprimé. |
| **RG-06** | Le départ du propriétaire d'un salon transfère le rôle au participant le plus ancien encore présent. |
| **RG-07** | Les MP **et les salons privés à mot de passe** sont chiffrés de bout en bout ; le serveur ne relaie que du contenu chiffré (enveloppe opaque). |
| **RG-08** | Aucune adresse IP n'est journalisée en clair. |

### Modèle mental

```
Navigateur (React + libsodium)                Serveur Node (Express + Socket.IO)         Redis
─────────────────────────────                 ──────────────────────────────────        ─────
 crypto E2E (clé privée              WS         handlers/ (familles)                  cmd   présence (GEO)
   ne sort jamais)         ◄──────────────►     modules métier            ◄──────────────► sessions (TTL)
 store Zustand (RAM)         enveloppes         (sessions/rooms/geo/…)                     salons (TTL)
 routage par hash            opaques            security / moderation                     reports (TTL, sans IP)
                                                                            pub/sub
                                                adaptateur Redis  ◄──────────────────────► backplane multi-instances
```

Le serveur est un **relais + index de présence**, pas un dépositaire de contenu.
Sa seule connaissance durable est ce qui vit dans Redis avec un TTL, et **jamais**
le clair d'un message chiffré ni une IP.

---

## 2. Stack & topologie

### Backend — `server/`
- **Node.js ≥ 20** (requis pour `--env-file` et `node:test`), **CommonJS** (`require`, `module.exports`, `'use strict'`).
- **Express 4** — HTTP, en-têtes de sécurité, API REST minimale, service du build front.
- **Socket.IO 4** — transport temps réel (WebSocket + repli polling).
- **Redis 4** + **`@socket.io/redis-adapter`** — quatre usages : présence, pub/sub (backplane), géo (`GEOADD`/`GEOSEARCH`), stockage volatil à TTL.
- Aucune dépendance crypto tierce côté serveur : le chiffrement est **entièrement côté client**, le serveur ne fait que du `crypto` natif Node (hash, comparaisons temps constant).

### Frontend — `frontend/src/`
- **React 19** + **TypeScript** + **Vite 7** + **Tailwind 4** (configuré en CSS, pas de `tailwind.config.js`).
- **Zustand 5** pour l'état (`store/useStore.ts`), **socket.io-client** pour le temps réel.
- **libsodium-wrappers-sumo** pour l'E2E (variante *sumo* obligatoire pour Argon2id).
- Polices **auto-hébergées** (`@fontsource*`) — aucun CDN, cohérent avec la CSP stricte.

### Topologie mono-origine
En production, le serveur Express **sert le build React** (`frontend/dist/`) et le
WebSocket sur **la même origine**. Il n'y a pas d'URL d'API séparée : le client fait
`io()` sans argument. En dev, le serveur Vite (`:5173`) proxifie `/api` et `/socket.io`
vers le backend (`:3000`).

### Scaling horizontal
Plusieurs instances WebSocket peuvent tourner derrière un load balancer :
l'**adaptateur Redis** (`createAdapter(pubClient, subClient)`) partage présence et
pub/sub entre instances. Aucun état applicatif n'est gardé en RAM du process — tout
l'état partagé est dans Redis, ce qui rend les instances interchangeables.

---

## 3. Cycle de vie d'une session (end-to-end)

Le scénario nominal, de l'arrivée à la fermeture de l'onglet :

```
1. CHARGEMENT
   App.tsx monte → connect() (lib/socket.ts)
   → initCrypto() : await sodium.ready + génère une paire X25519 de session
   → io() : connexion Socket.IO même origine
   status = 'connecting' → 'onboarding'

2. ONBOARDING
   Onboarding.tsx : pseudo, âge (18+), genre, ville (autocomplétée via GET /api/cities)
   → identify({ pseudo, age, gender, city, pub })      [pub = clé publique E2E]
   Serveur (handlers/identity.js) : valide, cities.geocode(ville), sessions.createSession(),
     geo.addPresence(), join user:<id> + lobby
   → ack { me, radiusKm } → setMe() → status = 'live'
   → presence:list (voisins), presence:add (notifie les voisins), rooms:list

3. VIE DE LA SESSION
   • Heartbeat : startHeartbeat() émet 'heartbeat' toutes les 30 s
     → sessions.touch() réarme le TTL (90 s) + réindexe la présence géo
   • MP : sendPM() → encryptFor(peerPub) → 'pm:send' {toId, env opaque}
     → serveur relaie tel quel → 'pm:recv' → decryptFrom() côté destinataire
   • Salon : joinRoom/createRoom, sendRoomMessage() (clair OU chiffré),
     room:members, room:system, room:message
   • Typing : 'typing' éphémère (aucun contenu)

4. FIN (fermeture onglet/navigateur = RG-02)
   Socket 'disconnect' (serveur handlers/index.js) :
   → handleLeave() sur tous les salons (RG-05 suppression si vide, RG-06 transfert owner)
   → presence:remove vers les voisins
   → sessions.deleteSession() : del(sess:<id>) + retrait de l'index géo
   Il ne reste rien de l'identité, des MP ni de l'appartenance aux salons.
```

Le TTL de session (90 s) est le garde-fou : si un client cesse d'émettre le
heartbeat (crash, réseau coupé) sans `disconnect` propre, la session **expire
d'elle-même** et les autres modules la purgent paresseusement (voir `publicProfiles`).

---

## 4. Backend, module par module

Point d'entrée : [`server/index.js`](./server/index.js). Tous les modules chargent
Redis via `require('./redis')` ; la configuration passe exclusivement par
[`server/config.js`](./server/config.js).

### `index.js` — bootstrap HTTP + Socket.IO
`main()` asynchrone :
1. `connectRedis()` puis `permanentRooms.seedAtBoot()` (réconciliation seed-only des salons permanents).
2. App Express : `app.disable('x-powered-by')` + `security.securityHeaders` (en-têtes + CSP sur toutes les réponses).
3. **Routes REST** (avant le fallback SPA) :
   - `GET /api/cities?q=` → `cities.suggest(q, 8)` (autocomplétion hors-ligne).
   - `GET /api/health` → `{ ok: true }` (health check Render + `deploy.sh`).
   - `GET /api/legal` → `{ contactEmail, lastUpdated, onionHost }` (point de contact DSA art.11-12/14 + adresse onion ; chargé une fois par `App.tsx` et distribué par le store).
   - `app.use('/operator', express.static(...))` — console opérateur statique.
   - Service de `frontend/dist/` + fallback SPA `app.get('*')` **si le build existe**, sinon message « build manquant ».
4. Serveur HTTP + `new Server(...)` avec : `adapter: createAdapter(pubClient, subClient)` (backplane), `maxHttpBufferSize: 16 Mo` (relais des pièces jointes photo/vidéo), `cors` **désactivé en prod** / whitelist `localhost:5173` en dev, `serveClient: true` (la console charge `/socket.io/socket.io.js` en same-origin), `pingInterval: 25000`, `pingTimeout: 20000`.
5. `registerHandlers(io)` (namespace public) puis `registerAdminNamespace(io)` (namespace `/admin`).
6. `server.listen(config.port)` + **arrêt gracieux** sur `SIGINT`/`SIGTERM` (`server.close()` + `process.exit`, timeout 2 s `unref()`).

### `config.js` — configuration centrale
**Point unique de lecture de `process.env`** (convention : ne jamais lire `process.env`
ailleurs). Helper `num(v, d)` : renvoie le défaut si la variable est absente/vide.
Regroupe port, `redisUrl`, `radiusKm` (RG-03), `minAge`/`maxAge` (RG-04), l'objet
`ttl` (RG-01), `rooms.encryptedMaxMembers`, `ipSalt.rotateMs` (RG-08), `rateLimit`,
`hsts`, `operatorSecret`, `contactEmail`, `moderation.keywords`/`saltFreezeMaxSec`.
Table complète au [§11](#11-configuration-variables-denvironnement).

### `protocol.js` — primitives de fil
Partagées par les **deux** transports (`handlers/` et `admin.js`), après avoir vécu en
triple exemplaire :
- `clamp(s, max)` — troncature défensive de toute entrée client, appliquée **avant** toute autre validation.
- `ack(cb, payload)` — répond à un accusé de réception ; le callback est optionnel côté client, l'appeler sans garde serait un `TypeError` en pleine exécution d'un handler.
- `genId(bytes = 9)` — identifiant opaque en base64url (sessions, messages, salons, signalements). `bytes` élargit pour l'invitation de salon (16 octets).

### `infra/redis.js` — connexions Redis
Instancie **trois** clients sur `config.redisUrl` :
- `client` — commandes applicatives (GEO, salons, sessions, TTL).
- `pubClient` — publication pour l'adaptateur Socket.IO.
- `subClient = pubClient.duplicate()` — abonnement (un client en mode *subscribe* ne peut pas exécuter d'autres commandes, d'où la séparation).

`connectRedis()` connecte les trois en parallèle, puis **force** `CONFIG SET save ''`
et `appendonly no` (dans un try/catch toléré si l'hébergeur managé l'interdit) :
**le contenu utilisateur ne doit jamais toucher le disque**.

### `domain/sessions.js` — identité de session volatile
Clé `sess:<id>` (hash Redis), TTL `sessionSec` (90 s), aucune PII (pseudo + âge +
genre + ville **déclarés**, plus la clé publique E2E `pub` relayée mais opaque).
- `createSession(id, data)` → `hSet` + `expire`. Champs : `pseudo, age, gender ['F'|'H'|'A'], city, region, country, countryLabel, lon, lat, pub`.
- `touch(id)` → réarme le TTL (heartbeat) ; `false` si déjà expirée.
- `toPublic(s)` → profil exposable : **aucune coordonnée précise, aucune IP** (id, pseudo, age, gender, ville, `pub`).
- `publicProfiles(ids)` → nettoie les « fantômes » (sessions expirées encore dans l'index géo) via `geo.removePresence` — **purge paresseuse**.
- `deleteSession(id)` → `del(sess:<id>)` + retrait de l'index géo.

### `domain/geo.js` — présence de proximité géospatiale
Index GEO unique `presence` (un index GEO Redis est un *sorted set*). Les positions
sont les **coordonnées de la ville déclarée**, jamais un GPS réel.
- `addPresence(id, lon, lat)` → `geoAdd('presence', …)`.
- `removePresence(id)` → `zRem('presence', id)`.
- `nearbyIds(id, radiusKm)` → `geoSearch('presence', id, { radius, unit:'km' })` en mode **FROMMEMBER** (le membre lui-même comme centre). Si le membre a expiré, l'erreur est absorbée → `[]`. Exclut soi-même du résultat.

### `domain/cities.js` — géocodage hors-ligne
Base embarquée `server/data/cities.json` — **l'entièreté des communes** de France
(34 963, source INSEE), Belgique (565), Suisse (2 113), Luxembourg (105) et Monaco
(10), soit 37 756 entrées chargées au `require`. **Aucune dépendance externe.**
Générée avec `postal.json` par `npm run build:geo` (sources INSEE via
`geo.api.gouv.fr` et dumps GeoNames, mis en cache dans `.geo-cache/`).
- `normalize(s)` — minuscule, sans accents ni ponctuation ; développe `St`/`Ste` en `Saint`/`Sainte` (les ~4 000 communes en Saint(e) ne s'écrivent jamais en entier).
- **Identifiant stable** `<pays>-<code>` (`FR-57463` = code INSEE, `CH-7285902` = id GeoNames) : 3 675 communes françaises étant homonymes, le nom seul ne désigne pas un lieu.
- `resolve({ id, name })` → l'identifiant d'abord, le nom en repli (client ancien, valeur collée). C'est ce qu'appelle `identify`.
- `geocode(nom)` → `{ id, name, lat, lon, country, countryLabel, region, admin }` ou `null`. En cas d'homonymie, **la commune la plus peuplée gagne** — d'où `resolve`.
- `suggest(query, limit=10)` → autocomplétion : nom exact, puis début de nom, puis début d'un mot du nom (« provence » → Aix-en-Provence) ; à qualité égale, la plus peuplée devant. Chaque proposition porte `admin`, le libellé qui lève l'homonymie (département en France, province en Belgique, canton en Suisse et au Luxembourg).
- **Index** : deux tableaux triés (libellés entiers, puis mots), parcourus par dichotomie. Balayer les 37 756 communes à chaque frappe coûtait dix fois trop cher ; une suggestion se calcule en < 1 ms.
- Saisie par **code postal** (`server/data/postal.json`, 14 740 codes) : exacte par construction en France (les codes viennent de la fiche INSEE de chaque commune) ; ailleurs, une localité sans commune homonyme est rattachée à la commune la plus proche (< 35 km) en le disant (`via`). L'index désigne les communes par leur **rang** dans `cities.json` — d'où la vérification de synchronisation au boot.

### `domain/rooms.js` — salons (état volatil)
Trois clés par salon :
- `room:<id>` (hash métadonnées : `name, type, owner, invite, salt, pass, verifier, encrypted, persistent, createdAt`).
- `room:<id>:members` (**zset**, score = ordre d'arrivée via `nextScore()` = base du transfert **RG-06**).
- `rooms:pub` (set = index des salons listés).

Fonctions clés :
- `createRoom({name, type, password, ownerId, encrypted, verifier, salt})` : id 8 octets, invite 16 octets. Salon chiffré ⇒ **toujours privé** ; stocke `pass` (SHA-256 sel+mdp) seulement pour un privé **non chiffré**, `verifier` (preuve E2E) seulement si chiffré. Indexé dans `rooms:pub` si public **ou** chiffré (les privés sur invitation restent hors index).
- `createPersistentRoom({slug, name})` : `owner: 'system'`, `persistent: '1'`, clé déterministe `room:<slug>`, **aucun `expire`** — exception à RG-05/RG-06.
- `verifyVerifier(id, verifier)` — vérifie la preuve d'accès d'un salon chiffré **à temps constant** (`crypto.timingSafeEqual` sur les SHA-256, pour égaliser les longueurs). Le serveur ne voit jamais le mot de passe/la clé.
- `verifyPassword`, `verifyInvite`, `addMember`/`removeMember` (réarment les TTL sauf si permanent), `memberIds` (ordonné par ancienneté), `deleteRoom`, `listPublic` (purge l'index expiré ; supprime les salons vides sauf permanents ; expose `encrypted`+`salt` public **mais jamais `verifier`** ; tri par nombre de membres décroissant).

### `room-actions.js` — cycle de vie partagé
Actions communes au namespace utilisateur (`handlers/`) et à la console (`admin.js`),
pour appliquer **exactement les mêmes règles**. Chaque fonction reçoit `io`.
- `pushLobby(io)` → émet `rooms:list` à la room `lobby`.
- `broadcastMembers(io, roomId)` → émet `room:members { roomId, members, owner }`.
- `handleLeave(io, roomId, leaverId)` : retire le membre ; salon **permanent** ⇒ ni suppression ni transfert ; sinon salon **vide** ⇒ `deleteRoom` (**RG-05**) ; sinon départ de l'**owner** ⇒ transfert au plus ancien restant (**RG-06**) + `room:system` ; puis `broadcastMembers` + `pushLobby`.

### `domain/permanent-rooms.js` — salons permanents (seed)
Source de vérité **hybride** : JSON versionné (`config.permanentRoomsFile`) + Redis.
`seedAtBoot()` est **seed-only et idempotent** : crée les salons absents, ne réécrit ni
ne supprime jamais (l'édition à chaud via `/admin` prime). `SLUG_RE = /^[a-z0-9-]{1,32}$/`.
Données par défaut : `general` (« Général »), `rencontres` (« Rencontres »),
`detente` (« Détente »).

### `security.js` — confidentialité IP + rate limit + en-têtes
Cœur de **RG-08**. Sel `currentSalt`/`previousSalt` (`randomBytes(32)`),
`rotateSalt()` sur `setInterval(rotateMs).unref()` (5 min).
- `hashIp(ip)` → `SHA-256(currentSalt + ip)` base64url tronqué à **22 caractères**. **Non réversible, invalidé à chaque rotation.**
- `isRateLimited(ip)` → clé `rl:<hashIp>` : `incr` + `expire(windowSec)` au premier hit, renvoie `count > maxEvents`.
- `freezeSalt()` / `unfreezeSalt()` — gèle le sel pour une **préservation prospective** (réquisition légale) : corrélable **à partir de** l'instant du gel, jamais rétroactivement, avec garde-fou `setTimeout(unfreezeSalt, saltFreezeMaxSec).unref()`. Exception explicite et **bornée** à RG-08.
- `securityHeaders(req, res, next)` — `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Permissions-Policy: geolocation=(), microphone=(), camera=()`, **CSP stricte** (`default-src 'self'` ; `script-src 'self' 'wasm-unsafe-eval'` — autorise WebAssembly/libsodium mais **pas `eval()`** ; `img-src 'self' data: blob:` ; `media-src 'self' blob:` ; `connect-src 'self' ws: wss:` ; `frame-ancestors 'none'`), et **HSTS conditionnel** (`config.hsts`).

### `domain/moderation.js` — modération & conformité
Socle volatil qui **ne connaît pas Socket.IO** et ne manipule **jamais d'IP ni de
coordonnées**. Clés Redis :
- `mod:report:<id>` (hash, copie **figée et autosuffisante** : pseudo + contenu + horodatage snapshotés, TTL `reportSec` = 48 h).
- `mod:reports` (zset index, score = timestamp).
- `mod:dedup:<msgId>` (set des signaleurs → **1 signaleur = 1 report par message**).
- `mod:bans` (set d'exclusion volatile, TTL `banSec`).
- `mod:incident:<id>` (hash incident de réquisition prospective, TTL `incidentSec`).

Fonctions : `createReport()` (DSA art.16 *notice-and-action* : dédup, snapshot, `unverified`
sauf `source:'filter'`), `listReports(limit=50)` (récent d'abord, purge index expiré),
`scanText(text)` (filtre mots-clés **non bloquant**, insensible casse/accents via `fold`,
**jamais sur les MP**), `banSession`/`isBanned`, `openIncident`/`closeIncident`. `toReport()`
**n'émet jamais de champ `ip`**.

### `admin.js` — console opérateur (namespace `/admin`)
Namespace Socket.IO **séparé**, authentifié par jeton unique (`config.operatorSecret`),
**inerte si non configuré**.
- `tokensMatch(provided, expected)` — comparaison **temps constant** (`timingSafeEqual` sur SHA-256) ; secret vide ⇒ toujours faux.
- `authMiddleware` — vérifie `socket.handshake.auth.token`, rejette avec `Error('unauthorized')`.
- À la connexion : join `operators`, émet `admin:snapshot { reports }`.
- Actions : `admin:retract`, `admin:kick`, `admin:close`, `admin:ban`, `admin:freeze`/`admin:unfreeze` (+ incident), `admin:resolve`, et la gestion des salons permanents (`admin:room:create`/`rename`/`remove`). L'opérateur ne voit que du **contenu signalé + pseudo + horodatage** — **jamais d'IP**.

### `handlers/` — namespace Socket.IO public (cœur métier)
Une **famille d'événements par fichier**. `handlers/index.js` ne porte aucune règle
métier : il construit le contexte de connexion et le passe au `register(ctx)` de
chaque module.

| Fichier | Événements |
|---------|------------|
| `index.js` | *aucun métier* : contexte de connexion + branchement + `disconnect` |
| `identity.js` | `identify`, `identity:rename` |
| `presence.js` | `heartbeat`, `presence:list`, `typing` |
| `pm.js` | `pm:send`, `pm:key` |
| `pm-invites.js` | `pm:invite:create` / `:peek` / `:claim` / `:accept` / `:revoke` |
| `rooms.js` | `room:create`, `room:list`, `room:peek`, `room:join`, `room:leave` |
| `messages.js` | `room:message` |
| `governance.js` | `room:kick`, `room:close`, `room:password` |
| `reports.js` | `pm:report`, `room:report` |

**Contexte de connexion** — `handlers/index.js` construit un objet unique par socket
et le passe au `register(ctx)` de chaque module : `io`, `socket`, `sid()` (session
courante), `limited()` (anti-spam, seaux onion ou hash d'IP), `pushLobby()`,
`broadcastMembers()`, `handleLeave()` (délégués à `room-actions.js`),
`announceLeave()` (voir ci-dessous) et `notifyReport()` — qui pousse `report:new`
vers `/admin` et `room:report:owner` vers le propriétaire du salon (modérateur de
première ligne, RG-06). C'est ce contexte qui permet de déplacer un handler d'un
fichier à l'autre sans réécrire son corps.

**Visibilité des entrées et des sorties** — **aucune arrivée n'est annoncée**, dans
aucun salon : la présence se lit dans la composition (`room:members`) et dans le
compte du salon, pas en interrompant la conversation. Entrer ne coûte donc rien à
personne, ce qui permet côté client d'entrer d'un seul clic sur la ligne du salon.

Le **départ** est annoncé par `announceLeave(roomId)` — et seulement celui de qui a
**pris la parole** dans ce salon. La condition vit dans `socket.data.spoke`, un `Set`
alimenté par `handlers/messages.js` **à la diffusion** d'un message (un message
rejeté n'a été lu par personne) et acquis pour la session (sortir puis revenir ne
rend pas muet quelqu'un que le salon a déjà entendu). Rien n'est écrit en Redis :
l'ensemble meurt avec la connexion (RG-01/02).

La règle lève l'asymétrie qu'une annonce de sortie seule créerait — « X est sorti·e »
désignerait rétroactivement quelqu'un dont personne n'avait vu l'arrivée : silence
pour qui n'a fait que passer, courtoisie envers ceux à qui l'on répondait. Le
**salon de région** reste muet dans tous les cas (rattachement d'office). Fermer
l'onglet suit exactement la même règle que `room:leave`.

À la connexion : l'IP est extraite (`security.clientIp`, résistante au spoofing de
`X-Forwarded-For` via `config.trustedProxies`) et utilisée **uniquement** pour
l'anti-spam, **jamais journalisée**.
La liste complète des événements est au [§6](#6-référence-des-événements-socketio). Points saillants :
- **MP (`pm:send` → `pm:recv`)** : relais d'une **enveloppe opaque** `env` (+ `data` binaire opaque si média). Rate-limité. `pm:undeliverable` si la cible est absente. Le serveur ne peut pas lire le contenu.
- **Message de salon (`room:message`)** : l'`id` de message est **généré serveur** (non forgeable → cible du retrait ciblé). Salon **chiffré** ⇒ relais d'enveloppe opaque avec flag `enc:'1'`, **jamais de scan**. Salon **en clair** ⇒ diffusion puis `moderation.scanText` (filtre non bloquant, crée un report `source:'filter'` si match).
- **Gouvernance** (`room:kick`/`room:close`/`room:password`) réservée au propriétaire (`ownerOf`). `password` interdit sur un salon chiffré (figé) ou public.
- **`disconnect`** : `handleLeave` sur tous les salons, `presence:remove` aux voisins, `sessions.deleteSession` (destruction totale, RG-02).

---

## 5. Modèle de données Redis

Tout est volatil (TTL) sauf les salons permanents. Redis tourne sans persistance disque.

| Clé | Type | Contenu | TTL | Module |
|-----|------|---------|-----|--------|
| `sess:<id>` | hash | Profil de session (pseudo, âge, genre, ville, coords ville, `pub`) | `sessionSec` (90 s), réarmé par heartbeat | `sessions.js` |
| `presence` | geo/zset | Index géospatial des sessions en ligne (position = ville) | — (nettoyé au `deleteSession` + purge paresseuse) | `geo.js` |
| `room:<id>` | hash | Métadonnées salon (`name, type, owner, invite, salt, pass, verifier, encrypted, persistent`) | `roomSec` (24 h) ; **aucun** si permanent | `rooms.js` |
| `room:<id>:members` | zset | Membres, score = ordre d'arrivée (base RG-06) | idem salon | `rooms.js` |
| `rooms:pub` | set | Index des salons listés (public ou chiffré) | — | `rooms.js` |
| `rl:<hashIp>` | string | Compteur anti-spam par hash d'IP | `windowSec` (10 s) | `security.js` |
| `mod:report:<id>` | hash | Signalement autosuffisant, **sans IP** | `reportSec` (48 h) | `moderation.js` |
| `mod:reports` | zset | Index des signalements (score = ts) | — (purge paresseuse) | `moderation.js` |
| `mod:dedup:<msgId>` | set | Signaleurs d'un message (anti-doublon) | `reportSec` | `moderation.js` |
| `mod:bans` | set | Exclusions volatiles | `banSec` (90 s) | `moderation.js` |
| `mod:incident:<id>` | hash | Incident de réquisition prospective | `incidentSec` (72 h) | `moderation.js` |

**Ce qui n'est jamais dans Redis** : le clair d'un MP ou d'un salon chiffré, un mot de
passe de salon en clair, une clé de chiffrement, une IP en clair.

---

## 6. Référence des événements Socket.IO

### Namespace public (`handlers/`)

| Événement | Sens | Payload | Effet |
|-----------|------|---------|-------|
| `identify` | client → serveur (ack) | `{ pseudo, age, gender, city, pub }` | Valide, crée la session, indexe la présence, join `user:<id>`+`lobby`. Ack `{ me, radiusKm }` |
| `heartbeat` | client → serveur | — | `touch` session + réindexe la présence |
| `presence:list` | ↔ | — / liste de profils | Voisins dans le rayon |
| `presence:add` | serveur → client | profil | Un voisin apparaît |
| `presence:remove` | serveur → client | `{ id }` | Un voisin disparaît |
| `pm:send` | client → serveur | `{ toId, env, data? }` | Relais **opaque** vers `user:<toId>` |
| `pm:recv` | serveur → client | `{ fromId, env, data? }` | MP chiffré reçu (déchiffré localement) |
| `pm:undeliverable` | serveur → client | `{ toId }` | Destinataire déconnecté |
| `pm:report` | client → serveur (ack) | `{ …, cleartext }` | Signalement d'un MP (clair fourni volontairement, `unverified`) |
| `typing` | ↔ | `{ scope, id }` | Indicateur éphémère, aucun contenu |
| `room:create` | client → serveur (ack) | `{ name, type, password?, encrypted?, verifier?, salt? }` | Crée le salon. Ack `{ room, invite?, owner, members }` |
| `room:list` | client → serveur (ack) | — | `rooms.listPublic()` |
| `room:peek` | client → serveur (ack) | `{ roomId }` | Pré-vol (nom + `encrypted` + `salt` public seulement) |
| `room:join` | client → serveur (ack) | `{ roomId, password?, invite?, verifier? }` | Rejoint (vérifie ban, plafond chiffré, verifier/invite/mdp). **Aucune annonce d'arrivée** |
| `room:leave` | client → serveur | `{ roomId }` | Quitte + `announceLeave` (si l'on a parlé) + `handleLeave` |
| `room:message` | ↔ | `{ roomId, text?/media?, enc? }` | Message (clair scanné, chiffré opaque). `id` **généré serveur** |
| `room:report` | client → serveur (ack) | `{ roomId, messageId, … }` | Signalement d'un message de salon |
| `room:members` | serveur → client | `{ roomId, members, owner }` | Liste des membres à jour |
| `room:system` | serveur → client | `{ roomId, text }` | Message système (départ *si l'on a parlé*, transfert, renommage, mot de passe) |
| `room:retract` | serveur → client | `{ roomId, messageId }` | Retrait ciblé (modération) |
| `room:report:owner` | serveur → client | report | Notifie le propriétaire (RG-06) |
| `room:kicked` / `room:closed` | serveur → client | `{ roomId }` | Exclusion / fermeture |
| `error:rate` | serveur → client | — | Rate-limit atteint |

### Namespace `/admin` (`admin.js`)

| Événement | Sens | Effet |
|-----------|------|-------|
| `admin:snapshot` | serveur → opérateur | Backlog des signalements à la connexion |
| `report:new` | serveur → opérateur | Nouveau signalement temps réel |
| `admin:retract` | opérateur → serveur | `room:retract` (retrait d'un message) |
| `admin:kick` | opérateur → serveur | Exclut un membre (`handleLeave`, RG-05/06) |
| `admin:close` | opérateur → serveur | Ferme un salon + `pushLobby` |
| `admin:ban` | opérateur → serveur | Ban volatile + déconnexion des sockets |
| `admin:freeze` / `admin:unfreeze` | opérateur → serveur | Gel/dégel du sel IP + incident |
| `admin:resolve` | opérateur → serveur | Marque un signalement traité |
| `admin:room:create` / `rename` / `remove` | opérateur → serveur | Gestion des salons permanents |

---

## 7. Frontend

### Structure `frontend/src/`
```
main.tsx            bootstrap React (createRoot + StrictMode)
App.tsx             connect() au montage + routage par hash + status
index.css           thème Tailwind 4 (@theme) + styles + animations
store/useStore.ts   état Zustand global (RAM, jamais persisté)
lib/socket.ts       connexion Socket.IO + tous les écouteurs/actions
lib/crypto.ts       couche E2E libsodium (voir §8)
lib/media.ts        préparation photos/vidéos (downscale, limites de taille)
lib/types.ts        types partagés
components/          Onboarding, Chat, Sidebar, Conversation, Composer,
                    RoomBrowser, RoomJoinPasswordModal, About, AboutSchemas,
                    Legal, ui (Avatar/Modal/Icon)
```

### Routage
Pas de react-router : **routage par `window.location.hash`** combiné à l'état `status`.
- `#en-savoir-plus` → `About` ; `#cgu`/`#confidentialite`/`#moderation`/`#mentions-legales` → `Legal`.
- Sinon selon `status` : `connecting` → Splash, `onboarding`/`disconnected` → `Onboarding`, `live` → `Chat`.
- **Auto-jonction par lien** (dans `Chat.tsx`) : `?r=<roomId>&k=<invite>` (invitation) ou `?r=<roomId>` seul (salon chiffré → `peekRoom` puis modale de mot de passe). Un mot de passe passé dans le fragment `#p=…` est lu puis **l'URL est immédiatement nettoyée** (`history.replaceState`) — le mot de passe ne part jamais au serveur.

### Store Zustand (`store/useStore.ts`)
Un unique store, **entièrement volatil** (aucun `localStorage`, aucun middleware persist).
State principal : `me`, `radiusKm`, `status`, `people` (présence), `pmPeers`
(correspondants MP conservés même hors rayon), `publicRooms`, `joinedRooms`,
`roomKeys`/`roomPasswords` (**clés de salons chiffrés en RAM seule**, purgées au
leave/close, perdues au reload), `threads`, `unread`, `typing`, `active`, `toast`.
**Découplage net** : le store ne connaît pas Socket.IO ; c'est `lib/socket.ts` qui
importe le store (`useStore.getState()`) et appelle ses actions depuis les écouteurs.

### `lib/socket.ts`
`connect()` : `await initCrypto()` (génère la paire de clés **avant** tout) puis
`io({ transports: ['websocket', 'polling'] })` sans URL (même origine). Enregistre tous
les écouteurs du [§6](#6-référence-des-événements-socketio) et expose les actions
(`identify`, `sendPM`, `sendRoomMessage`, `createRoom`, `joinRoom`, `peekRoom`,
`reportPM`/`reportRoomMessage`, `sendTyping` throttlé, `leaveRoom`, `kickMember`,
`closeRoom`, `setRoomPassword`). Le heartbeat est émis toutes les **30 s**.

### Composants clés
- **`Onboarding.tsx`** : formulaire d'entrée (pseudo ≥ 2, âge ≥ 18, genre, ville avec autocomplétion débouncée sur `/api/cities`, case majorité). Exporte aussi `NetworkBackground` (fond canvas animé).
- **`Chat.tsx`** : shell (header + `Sidebar` + `Conversation`), auto-jonction par lien, `quit()`.
- **`Sidebar.tsx`** : « À proximité » (recherche/filtres genre-âge), « Salons », « Conversations privées » hors rayon, et la **carte d'identité** avec le *fingerprint* de la clé de session.
- **`Conversation.tsx`** : `PMView` (bandeau chiffré + panneau *safety number*) / `RoomView` (badge chiffré/privé/public, liste des membres, menu partager-lien/quitter/fermer, `shareLink()`) / `EmptyState`. Sous-composants : `MessageList`, `TypingIndicator`, `MediaBubble`, `ReportModal`.
- **`Composer.tsx`** : textarea auto-grow (≤ 2000 car.), envoi sur Enter, pièce jointe image/vidéo.
- **`RoomBrowser.tsx`** : onglets Parcourir/Créer (visibilité, mot de passe optionnel, case « chiffrer de bout en bout »).
- **`About.tsx`/`AboutSchemas.tsx`** : page pédagogique avec **démo crypto live** (chiffrement/MITM en direct) et planches animées (respect `prefers-reduced-motion`).
- **`Legal.tsx`** : pages juridiques (CGU, RGPD, DSA, mentions), contact injecté depuis `/api/legal`.

### Médias (`lib/media.ts`)
`prepareMedia(file)` : GIF tel quel (≤ 8 Mo) ; autres images downscalées (≤ 1600 px,
ré-encodage JPEG q. 0.85, ≤ 10 Mo) ; vidéos telles quelles (≤ 12 Mo) ; autres formats
rejetés. `blobUrl(bytes, mime)` crée un blob local pour l'affichage. Les octets sont
**chiffrés** avant envoi comme les textes (voir §8).

---

## 8. Chiffrement de bout en bout

Toute la crypto vit dans [`frontend/src/lib/crypto.ts`](./frontend/src/lib/crypto.ts),
via `libsodium-wrappers-sumo` (variante *sumo* requise pour Argon2id). Encodage
base64 *URLSAFE_NO_PADDING* partout, bourrage `PAD_BLOCK = 256` octets.

### Identité de session
- `initCrypto()` : `await sodium.ready` + `crypto_box_keypair()` → paire **X25519** de session. **La clé privée ne quitte jamais le navigateur.**
- `exportPublicKey()` : clé publique base64, transmise à l'`identify` (champ `pub`).
- `fingerprint()` : `crypto_generichash(16, publicKey)` → 8 octets hex, affiché dans la carte d'identité.

### Messages privés — `crypto_box` (asymétrique, authentifié)
Enveloppe `{ n, c, pub }` (nonce, ciphertext, clé publique de l'émetteur).
- `encryptFor(peerPub, plaintext)` : nonce + `sodium.pad(…, 256)` + `crypto_box_easy` (X25519 + XSalsa20-Poly1305). Le padding masque la longueur réelle.
- `decryptFrom(env)` : `crypto_box_open_easy` + `unpad`. Lève si le MAC est invalide.
- Médias MP : `encryptBytesFor`/`decryptBytes` (binaire, sans padding).
- `safetyNumber(peerPub)` : hash BLAKE2b des deux clés publiques dans un **ordre canonique** → identique des deux côtés, comparable **hors-bande** pour détecter un MITM.

### Salons chiffrés à mot de passe — `crypto_secretbox` (symétrique)
Conception « dérivation directe » (figée à vie — tout changement casserait les salons existants) :
```
master   = Argon2id(motDePasse, salt 16o public)                  (crypto_pwhash INTERACTIVE, ARGON2ID13)
verifier = crypto_kdf_derive_from_key(32, subkey 1, "VRFYAUTH", master)   → preuve d'accès, ENVOYÉE au serveur
key      = crypto_kdf_derive_from_key(KEYBYTES, subkey 2, "ROOMKEYS", master) → clé secretbox, JAMAIS transmise
```
- `genRoomSalt()` : sel Argon2id public (16 octets).
- `deriveRoomMaterial(password, salt)` → `{ verifier, key }`. Le serveur reçoit **uniquement** `verifier` + le sel public, et ne voit jamais mot de passe, `master`, ni `key`.
- Enveloppe `{ n, c }` (pas de `pub` : **confidentialité de groupe sans authentification de l'auteur**). `encryptRoom`/`decryptRoom` + variantes binaires pour les médias.

### Ce que le serveur voit / ne voit jamais

| Le serveur détient | Le serveur ne voit JAMAIS |
|--------------------|---------------------------|
| Clés publiques `pub` (relayées) | Clés privées de session |
| `verifier` d'un salon chiffré | Mot de passe / `master` / `key` d'un salon chiffré |
| Enveloppes opaques `{n,c,pub}` / `{n,c}` + blobs binaires | Le clair d'un MP ou d'un salon chiffré |
| Sel Argon2id public | — |

---

## 9. Sécurité & confidentialité transverses

- **Hash IP salé rotatif** (RG-08) : SHA-256(sel + IP), tronqué à 22 car., sel régénéré toutes les 5 min → non réversible et invalidé en continu. Gel **prospectif borné** pour réquisition légale.
- **CSP stricte** sans tiers : `default-src 'self'`, `wasm-unsafe-eval` pour libsodium mais **pas `eval()`**, `frame-ancestors 'none'`, HSTS conditionnel derrière TLS. Aucun script inline (d'où `operator/app.js` séparé), polices auto-hébergées.
- **Comparaisons à temps constant** (`timingSafeEqual`) pour `verifyVerifier` (salons chiffrés) et `tokensMatch` (jeton opérateur).
- **Id de message généré serveur** (non forgeable → cible fiable du retrait ciblé), `clamp` défensif sur toutes les entrées, `textContent` (jamais `innerHTML`) côté console opérateur.
- **Redis sans persistance disque** (`save ''`, `appendonly no`) : le contenu utilisateur ne touche jamais le disque.
- **Enveloppes opaques** de bout en bout : le serveur relaie sans jamais déchiffrer.
- **Namespace `/admin` isolé** et inerte sans `OPERATOR_SECRET`.

---

## 10. Modération & conformité DSA/RGPD

- **Notice-and-action** (DSA art.16) : signalement d'un message de salon ou d'un MP. Sur un contenu **chiffré**, le clair est fourni **volontairement** par le signaleur (`source:'reporter-cleartext'`, marqué `unverified`) — le serveur reste aveugle.
- **Filtre de mots-clés** (`scanText`) non bloquant, **salons publics uniquement**, jamais sur les MP (RG-07) : un match crée un signalement `source:'filter'` (seul cas où le serveur a « vu » le texte, car il était en clair) sans bloquer la diffusion.
- **Console opérateur** (`/operator` → namespace `/admin`) protégée par `OPERATOR_SECRET` : consultation des signalements (pseudo + contenu + horodatage, **jamais d'IP**), retrait ciblé, exclusion volatile, gestion des salons permanents.
- **Propriétaire de salon = modérateur de première ligne** (RG-06) : reçoit `room:report:owner` et peut kick/close/retirer.
- **Préservation prospective bornée** : `admin:freeze` gèle le sel IP (jamais rétroactivement), avec dégel automatique après `saltFreezeMaxSec` (72 h) — exception explicite et plafonnée à RG-08.
- **Mapping DSA** : art.6/8 (pas de surveillance générale), art.11-12/14 (point de contact `/api/legal`), art.16 (notice-and-action), art.28 (motif `minor` prioritaire).

> ⚠️ **Salons privés chiffrés à mot de passe** — la conformité repose sur trois
> points solidaires : art.8 (aucun scan du contenu chiffré), art.16 (signalement
> `reporter-cleartext`/`unverified` et retrait best-effort), et le plafond de
> membres (`ENCRYPTED_ROOM_MAX_MEMBERS`, défaut 16) comme limitation de diffusion
> proportionnée. Affaiblir l'un des trois remet la posture en cause.

---

## 11. Configuration (variables d'environnement)

Toutes lues **uniquement** dans `server/config.js` (via `num`). Chargées par
`node --env-file=.env` en local ; **injectées** en prod (pas de `--env-file` sur
Render). Modèle : [`.env.example`](./.env.example).

| Variable | Défaut | Rôle |
|----------|--------|------|
| `OPERATOR_SECRET` | *(vide)* | Jeton de la console `/operator`. **Vide ⇒ console inerte.** |
| `CONTACT_EMAIL` | *(vide)* | Point de contact DSA art.11-12 (exposé via `/api/legal`). |
| `PORT` | `3000` | Port HTTP. |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Connexion Redis (`rediss://` pour un managé TLS). |
| `PERMANENT_ROOMS_FILE` | `server/data/permanent-rooms.json` | Fichier de seed des salons permanents. |
| `RADIUS_KM` | `75` | Rayon de présence (RG-03). |
| `MIN_AGE` | `18` | Âge minimum déclaratif (RG-04). `maxAge` fixe = 120. |
| `SESSION_TTL` | `90` | TTL session (s), réarmé par heartbeat. |
| `ROOM_TTL` | `86400` | Garde-fou TTL salon (24 h). |
| `REPORT_TTL` | `172800` | Rétention d'un signalement (48 h), sans IP. |
| `INCIDENT_TTL` | `259200` | TTL incident de réquisition (72 h). |
| `BAN_TTL` | `90` | Ban volatile best-effort. |
| `ENCRYPTED_ROOM_MAX_MEMBERS` | `16` | Plafond de membres d'un salon chiffré. |
| `IP_SALT_ROTATE_MS` | `300000` | Rotation du sel de hachage IP (5 min). |
| `RL_WINDOW_SEC` / `RL_MAX` | `10` / `30` | Fenêtre / plafond anti-spam (messages / hash IP). |
| `SALT_FREEZE_MAX_SEC` | `259200` | Plafond de gel du sel IP (72 h). |
| `HSTS` | `0` | `1` pour activer HSTS (uniquement derrière TLS). Jamais émis sur l'onion. |
| `ONION_HOST` | *(vide)* | Adresse du service onion. Vide ⇒ aucune annonce (`Onion-Location` ni mention UI). **En prod : dans l'unité systemd, pas dans `.env`** — cf. § 13. |
| `ONION_RL_GLOBAL_MAX` | `RL_MAX × 50` | Plafond global du trafic onion par fenêtre. |
| `ONION_METRICS_TTL` | `86400` | TTL des compteurs onion du tableau de bord (24 h). |
| `MOD_KEYWORDS` | *(vide)* | Mots-clés du filtre (CSV), salons publics. |
| `NODE_ENV` | — | `production` en prod (fixé par `render.yaml`). |

Générer un `OPERATOR_SECRET` :
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 12. Tests

Suite **`node:test` natif** + `node:assert/strict`, **zéro dépendance npm**, et un
**fake Redis en mémoire injecté** — aucun Redis réel n'est démarré.

```bash
npm test            # toute la suite
npm run test:watch  # mode watch
```

### Pattern d'injection
- [`test/helpers/fake-redis.js`](./test/helpers/fake-redis.js) — `FakeRedis` en mémoire : strings, hash, zset, set, GEO (`geoSearch` FROMMEMBER+BYRADIUS via Haversine). `__reset()` entre les tests. Limites assumées : `expire` est un no-op ; l'index GEO partage la clé d'un zset.
- [`test/helpers/inject-redis.js`](./test/helpers/inject-redis.js) — place le fake dans `require.cache` **à la place de `server/infra/redis.js`, avant** tout chargement de module serveur. Comme chaque module du domaine fait `require('../infra/redis')`, toute la chaîne reçoit le fake.

Usage type (premier require du fichier de test) :
```js
const { fake } = require('./helpers/inject-redis');
const rooms = require('../server/rooms'); // reçoit le fake
beforeEach(() => fake.__reset());
```
Certains tests posent des variables d'env **avant** le require (ex. `admin.test.js`
→ `OPERATOR_SECRET`, `moderation.test.js` → `MOD_KEYWORDS`), car `config.js` lit
l'environnement au chargement.

### Couverture (11 fichiers)

| Fichier | Module | Points saillants |
|---------|--------|------------------|
| `admin.test.js` | `admin.js` | `tokensMatch` temps constant, `authMiddleware` (refus sans/mauvais jeton) |
| `moderation.test.js` | `moderation.js` | **assert : aucune IP** (RG-08), report autosuffisant (RG-02), dédup, `scanText`, ban, incidents |
| `rooms.test.js` | `rooms.js` | Cycle de vie, salons chiffrés/permanents |
| `sessions.test.js` | `sessions.js` | Sessions volatiles, profils publics |
| `security.test.js` | `security.js` | `hashIp` déterministe (22 car.), sel rotatif, gel/dégel |
| `geo.test.js` | `geo.js` | `nearbyIds` rayon, soi-même exclu |
| `cities.test.js` | `cities.js` | `normalize`, `geocode` (module pur, pas d'injection Redis) |
| `config.test.js` | `config.js` | Garde-fou défauts (port, rayon RG-03, âge, TTL) |
| `room-actions.test.js` | `room-actions.js` | `handleLeave`, `broadcastMembers`, `pushLobby` (io factice) |
| `permanent-rooms.test.js` | `permanent-rooms.js` | Seed via JSON temporaire, idempotence |

Côté frontend, la vérification de types passe par le build : `cd frontend && npm run build` (`tsc && vite build`).

---

## 13. Déploiement & exploitation

Deux cibles coexistent. **Les configs de la VM (Caddy, systemd, Redis) ne sont pas
versionnées dans le dépôt** — elles vivent sur le serveur.

### A. Render (Blueprint) — [`render.yaml`](./render.yaml)
Service `web` Node, région Frankfurt, plan free.
- `buildCommand` : `npm install && npm install --prefix frontend --include=dev && npm run build --prefix frontend`.
- `startCommand` : `node server/index.js` (**pas** de `--env-file` — Render injecte les variables).
- `healthCheckPath: /api/health`, `autoDeploy: true`.
- Secrets au dashboard (`sync: false`) : `REDIS_URL`, `OPERATOR_SECRET`, `CONTACT_EMAIL`. `NODE_ENV=production` fixé.

### B. VM autogérée — [`deploy.sh`](./deploy.sh)
Pas de clone sur le serveur : on pousse la copie de travail locale par **rsync SSH**.
- Variables d'environnement : `PROXIMA_HOST` et `PROXIMA_URL` (requises), `PROXIMA_USER` (défaut `ubuntu`), `PROXIMA_KEY` (défaut `~/.ssh/id_ed25519`), `PROXIMA_PATH` (défaut `/opt/proxima`).
- Usage : `./deploy.sh` (build front inclus) ou `./deploy.sh --no-build`.
- Étapes : (1) rsync `-az --delete` en excluant `.git`/`.env`/`node_modules`/`frontend/dist` ; (2) sur l'hôte `npm install --omit=dev` + build front éventuel ; (3) `sudo systemctl restart proxima` ; (4) `curl $PROXIMA_URL/api/health`.
- TLS + reverse-proxy par **Caddy**, Redis par `redis-server`, l'app par le service systemd `proxima`.
- `/etc/caddy/Caddyfile` (non versionné) sert le domaine canonique en reverse-proxy vers
  `127.0.0.1:3000`, et redirige `www` vers l'apex en `redir … permanent`. Le `www` redirige plutôt
  que de servir le même contenu : une seule URL indexable, conforme au `<link rel="canonical">`.

#### Contraintes réseau connues
- `deploy.sh` et `logs.sh` reposent sur **SSH (port 22)** : inutilisables derrière un réseau qui
  le filtre en sortie. Le `git push` reste possible, le remote étant en HTTPS.
- Un réseau qui **intercepte le TLS sortant** (proxy d'entreprise re-signant les certificats) fait
  échouer le `curl` de santé en fin de `deploy.sh` **alors que le déploiement a réussi** —
  `set -euo pipefail` sort alors en erreur sur la dernière ligne. Vérifier depuis une connexion
  non filtrée.

#### Accès Tor (service onion) — [`setup-onion.sh`](./setup-onion.sh)

Chaîne : `Tor Browser → tor → 127.0.0.1:8080 (Caddy, bloc onion) → 127.0.0.1:3000 (Node)`. Une seule
instance Node, un seul Redis : visiteurs onion et clearnet se retrouvent dans les mêmes salons.

- **Rien à acheter** : l'adresse `.onion` est une clé ed25519 générée localement (pas de registrar, pas de
  certificat, aucun port entrant à ouvrir). L'adresse retenue est **vanity** (`proxima…`, via `mkp224o`),
  et doit être générée **avant** le premier démarrage de `tor` — elle est définitive.
- **`hs_ed25519_secret_key` *est* l'adresse.** Perdue, l'adresse l'est définitivement. Seul secret de
  production de ce chantier : sauvegarde hors VM immédiatement après génération.
- **Marquage** : le bloc Caddy onion pose `X-Proxima-Onion: 1` après l'avoir retiré ; **le bloc clearnet
  le retire inconditionnellement**. Sans cette seconde ligne, tout visiteur échapperait à l'anti-spam en
  forgeant l'en-tête. `security.isOnionRequest` double la garantie côté Node : le marqueur n'est honoré
  que si la requête vient aussi de la boucle locale.
- **Anti-spam** : derrière l'onion tous les visiteurs partagent `127.0.0.1`. Deux seaux remplacent le
  compteur par IP — `rl:onion:<socket.id>` (isole les visiteurs entre eux) et `rl:onion:all` (plafond
  global, `ONION_RL_GLOBAL_MAX`).
- **Sonde du bloc Caddy manquant** : une connexion loopback *sans* marqueur alors que `ONION_HOST` est
  renseigné signifie que le bloc onion ne s'applique pas — et donc que le seau collectif est de retour.
  Journalisée (une ligne par fenêtre) et comptée dans `metrics.onion.unmarkedLoopback`.
- **`ONION_HOST` va dans l'unité systemd** (`Environment=`, ou un `EnvironmentFile=` **hors**
  `/opt/proxima`), jamais dans `/opt/proxima/.env` : `deploy.sh` y fait un `rsync --delete`.
- **Tor Browser** : à valider aux **trois** niveaux de sécurité. « Safest » coupe JavaScript — l'app-shell
  `#seo-shell` s'affiche alors avec un `<noscript>` qui l'explique. « Safer » coupe le JIT : libsodium
  étant en asm.js le service fonctionne, mais **Argon2id** (salons à mot de passe) est à chronométrer.
- **Badge « Via Tor »** : visible de soi seul, dans la `TopBar`, piloté par l'accusé d'`identify`. Jamais
  diffusé aux autres présents — ni dans `sessions.toPublic()`, ni dans `Person`/`RoomMember`.

### Logs — [`logs.sh`](./logs.sh)
SSH + `journalctl` en direct : `./logs.sh app|caddy|redis|tor|all|errors [lignes]`.

### Endpoints d'exploitation
- `GET /api/health` → `{ ok: true }` (health check + curl de déploiement).
- `GET /api/legal` → `{ contactEmail, lastUpdated, onionHost }` (DSA + adresse du service onion).

### Piège prod
`index.js` sert `frontend/dist/` **s'il existe** ; sinon message « build manquant ».
Toujours builder le front avant de tester le serveur en mode prod.

---

## 14. Limites connues & hors-scope

Choix assumés pour le MVP (voir CDC §6) :
- **Âge déclaratif** : la majorité (18+) repose sur une simple déclaration, sans vérification.
- **Modération réactive** : pas de modération automatique généralisée ; dispositif fondé sur le signalement et le retrait.
- **Anonymat non absolu** : un serveur web voit toujours l'IP du client. Le projet vise le **maximum de confidentialité raisonnable**, pas l'anonymat absolu (qui relèverait d'un réseau type Tor).
- **Salons chiffrés** : pas de forward secrecy ni de révocation cryptographique ; mot de passe figé à la création.
- **Hors-scope v1** : vérification d'âge réelle, rayon réglable, géolocalisation fine, internationalisation (l'UI est en **français uniquement**).

---

*Document technique — à maintenir en cohérence avec le code. Références croisées :
[`README.md`](./README.md) (produit) et [`CLAUDE.md`](./CLAUDE.md) (conventions).*
