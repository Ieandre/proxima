/* ==========================================================================
 * FAQ de l'accueil — même contenu, au caractère près, que le <dl> de la
 * coquille statique (frontend/index.html) et que le FAQPage du JSON-LD qui s'y
 * adosse. Google n'accepte un FAQPage que si les questions sont visibles sur la
 * page RENDUE : la coquille disparaissant au montage de Vue, l'application doit
 * réafficher la même FAQ (test/faq.test.ts verrouille l'accord des deux).
 * ======================================================================== */

export const FAQ: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: 'Proxima est-il vraiment anonyme ?',
    a: 'Aucun compte, aucun email, aucun numéro. Votre identité de session est éphémère et disparaît à la fermeture de l\'onglet.',
  },
  {
    q: 'Mes messages sont-ils chiffrés ?',
    a: 'Les messages privés sont chiffrés de bout en bout sur votre appareil ; le serveur ne peut pas les lire.',
  },
  {
    q: 'Proxima conserve-t-il mes données ?',
    a: 'Non. Il n\'existe aucune base de données de contenu : tout vit en mémoire et s\'efface. Pas de traçage publicitaire, pas de profilage, pas de revente de données.',
  },
  {
    q: 'Comment fonctionne la proximité ?',
    a: 'Proxima vous met en relation avec des personnes situées à proximité, à partir de la ville que vous indiquez à l\'entrée.',
  },
  {
    q: 'Faut-il installer une application ?',
    a: 'Non. Proxima fonctionne directement dans le navigateur, sur ordinateur comme sur mobile. Rien à installer, rien à mettre à jour.',
  },
  {
    q: 'Proxima est-il gratuit ?',
    a: 'Oui, entièrement gratuit et sans publicité. Il n\'y a ni compte à créer, ni offre payante, ni données revendues.',
  },
  {
    q: 'Y a-t-il un âge minimum ?',
    a: 'Oui, le service est réservé aux personnes de 18 ans et plus.',
  },
];
