# Politique de sécurité

Proxima repose sur des promesses vérifiables — serveur aveugle, aucune PII
persistante, aucune IP en clair. Une faille qui les contredit est le bug le plus
grave que puisse avoir ce projet. Les signalements sont donc bienvenus, y compris
les incertains.

## Signaler une vulnérabilité

Écrivez à **proximachat@proton.me**. Merci de ne pas ouvrir d'issue publique tant
que la faille n'est pas corrigée.

Sont particulièrement recherchés :

- tout moyen pour le serveur d'accéder au clair d'un message privé ou d'un salon
  chiffré (violation de RG-07) ;
- toute fuite d'adresse IP en clair, dans un log, une réponse ou un stockage
  (violation de RG-08) ;
- toute donnée d'identité qui survit à la fermeture de l'onglet (RG-01/RG-02) ;
- tout contournement du plafond de membres d'un salon chiffré, de l'anti-spam,
  ou de l'isolement du namespace `/admin` ;
- toute faiblesse cryptographique dans `frontend/src/lib/crypto.ts` (dérivation
  Argon2id, séparation `verifier`/`key`, usage de `crypto_box`/`crypto_secretbox`).

Incluez de quoi reproduire : version ou empreinte du commit, étapes, et l'effet
observé. Un rapport théorique bien argumenté vaut mieux qu'un exploit tu.

## Ce à quoi vous pouvez vous attendre

- **Accusé de réception sous 72 h.**
- Une évaluation de l'impact et, si la faille est confirmée, un correctif traité
  en priorité sur tout le reste.
- Mention dans les notes de version si vous le souhaitez, sous le nom ou le
  pseudonyme de votre choix — ou aucune mention, c'est votre décision.

## Périmètre

Le service en production et le code de ce dépôt. Les tests destructifs sur
l'instance publique (déni de service, inondation, altération du service pour les
autres) ne sont **pas** autorisés : montez une instance locale, tout tourne avec
`npm run dev` et un Redis.

## Limites connues

Elles sont documentées et assumées, inutile de les signaler comme des failles —
mais une manière de les aggraver, elle, nous intéresse :

- les salons chiffrés n'offrent ni forward secrecy ni révocation cryptographique,
  et le mot de passe est figé à la création ;
- la confidentialité de groupe d'un salon chiffré n'authentifie pas l'auteur d'un
  message ;
- l'exclusion d'un participant est volatile et best-effort, par construction : il
  n'existe aucun identifiant durable sur lequel s'appuyer ;
- le retrait d'un contenu chiffré signalé est best-effort, le serveur ne pouvant
  pas vérifier ce qu'on lui rapporte.
