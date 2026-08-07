/* Onglets des pages juridiques. Extraits du SFC : `App.vue` doit reconnaître un
   chemin juridique (`isLegalPath`) sans avoir à charger la page elle-même. */

export const TABS: { path: string; label: string }[] = [
  { path: '/cgu', label: "Conditions d'utilisation" },
  { path: '/confidentialite', label: 'Confidentialité' },
  { path: '/moderation', label: 'Modération' },
  { path: '/mentions-legales', label: 'Mentions légales' },
];

export const LEGAL_PATHS = TABS.map((t) => t.path);
export const isLegalPath = (p: string): boolean => LEGAL_PATHS.includes(p);
