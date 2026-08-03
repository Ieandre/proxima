/**
 * Pseudo tiré au sort, proposé d'emblée à l'arrivée. Le champ reste modifiable,
 * et le dé en propose un autre.
 *
 * Trois contraintes sur les listes :
 *
 * - **Nom + adjectif français**, jamais de numéro de série : un salon peuplé
 *   d'« Anonyme4821 » se lit comme une ferme à robots. Le pseudo est la seule
 *   prise que les présents ont les uns sur les autres.
 * - **Adjectifs invariables en genre** (terminés par « -e ») : l'accord tombe
 *   juste quel que soit le nom, ce qui permet de tirer les deux listes
 *   indépendamment.
 * - **Mots neutres ou mélioratifs** : un pseudo *attribué* ne doit jamais pouvoir
 *   se lire comme une pique.
 *
 * L'homonymie reste possible (rien n'impose l'unicité, cf. `mentions.ts`) mais
 * deux homonymes restent distinguables : l'avatar tire sa couleur de
 * l'identifiant de session, jamais du pseudo.
 */

/* Noms : faune, flore, éléments et minéraux. 10 caractères au plus, pour que la
   concaténation tienne dans les 24 caractères acceptés par `identify`. */
const NOMS = [
  // Oiseaux
  'Merle', 'Héron', 'Hibou', 'Chouette', 'Faucon', 'Milan', 'Grive', 'Pinson', 'Mésange', 'Alouette',
  'Hirondelle', 'Sarcelle', 'Colvert', 'Grèbe', 'Cygne', 'Épervier', 'Goéland', 'Mouette', 'Sterne',
  'Cormoran', 'Aigrette', 'Courlis', 'Vanneau', 'Pluvier', 'Huppe', 'Loriot', 'Bruant', 'Verdier',
  'Roitelet', 'Sittelle', 'Geai', 'Étourneau', 'Rossignol', 'Fauvette', 'Balbuzard', 'Traquet',
  // Mammifères
  'Renard', 'Loutre', 'Martre', 'Chevreuil', 'Sanglier', 'Hérisson', 'Écureuil', 'Lièvre', 'Lynx',
  'Chamois', 'Bouquetin', 'Marmotte', 'Castor', 'Genette',
  // Petites bêtes
  'Libellule', 'Luciole', 'Cigale', 'Grillon', 'Criquet', 'Bourdon', 'Abeille', 'Papillon',
  'Coccinelle', 'Lucane', 'Fourmi', 'Salamandre', 'Triton', 'Grenouille', 'Couleuvre', 'Orvet',
  'Lézard', 'Écrevisse',
  // Poissons
  'Truite', 'Brochet', 'Perche', 'Gardon', 'Ablette', 'Anguille',
  // Fleurs et herbes
  'Pivoine', 'Bruyère', 'Genêt', 'Ajonc', 'Aubépine', 'Églantine', 'Ancolie', 'Camomille', 'Lavande',
  'Sauge', 'Romarin', 'Verveine', 'Mélisse', 'Menthe', 'Trèfle', 'Luzerne', 'Coquelicot', 'Bleuet',
  'Marguerite', 'Primevère', 'Jonquille', 'Muguet', 'Lilas', 'Glycine', 'Clématite', 'Myrtille',
  'Airelle', 'Iris', 'Fougère', 'Roseau', 'Jonc', 'Nénuphar', 'Lierre', 'Houx',
  // Arbres
  'Sureau', 'Aulne', 'Bouleau', 'Érable', 'Frêne', 'Hêtre', 'Chêne', 'Orme', 'Tilleul', 'Peuplier',
  'Saule', 'Sapin', 'Mélèze', 'Genévrier', 'Cyprès',
  // Ciel, eau, relief
  'Brume', 'Rosée', 'Givre', 'Neige', 'Averse', 'Ondée', 'Bruine', 'Orage', 'Éclair', 'Nuage',
  'Zéphyr', 'Alizé', 'Bise', 'Rafale', 'Marée', 'Ressac', 'Écume', 'Vague', 'Onde', 'Source',
  'Ruisseau', 'Torrent', 'Cascade', 'Étang', 'Marais', 'Lagune', 'Dune', 'Falaise', 'Récif',
  'Clairière', 'Bosquet', 'Halo', 'Aurore', 'Aube', 'Éclipse', 'Comète', 'Étoile',
  // Minéraux
  'Quartz', 'Silex', 'Granit', 'Ardoise', 'Basalte', 'Ambre', 'Agate', 'Opale', 'Jade', 'Onyx',
  'Corail', 'Nacre',
] as const;

/* Adjectifs : tous terminés par « -e », donc identiques au masculin et au
   féminin — c'est la condition pour les tirer sans se soucier du nom associé. */
const ADJECTIFS = [
  'Agile', 'Aimable', 'Alerte', 'Ample', 'Antique', 'Aquatique', 'Arctique', 'Athlétique', 'Atypique',
  'Austère', 'Beige', 'Brave', 'Calme', 'Candide', 'Céleste', 'Champêtre', 'Classique', 'Cosmique',
  'Docile', 'Drôle', 'Dynamique', 'Écarlate', 'Élastique', 'Électrique', 'Éphémère', 'Épique',
  'Équitable', 'Espiègle', 'Fauve', 'Fertile', 'Fidèle', 'Fluide', 'Formidable', 'Gracile', 'Grave',
  'Habile', 'Honnête', 'Humble', 'Idyllique', 'Immense', 'Impassible', 'Improbable', 'Incroyable',
  'Indomptable', 'Ineffable', 'Insolite', 'Intrépide', 'Invisible', 'Jaune', 'Jeune', 'Libre',
  'Limpide', 'Lucide', 'Ludique', 'Lunaire', 'Lyrique', 'Magnifique', 'Mauve', 'Méthodique',
  'Minuscule', 'Mobile', 'Modeste', 'Mystique', 'Nocturne', 'Nordique', 'Notable', 'Onirique',
  'Opaque', 'Orange', 'Ovale', 'Paisible', 'Pittoresque', 'Placide', 'Poétique', 'Polaire', 'Pourpre',
  'Preste', 'Prospère', 'Pudique', 'Rapide', 'Rare', 'Rebelle', 'Robuste', 'Rose', 'Rouge',
  'Rustique', 'Sage', 'Sauvage', 'Sensible', 'Simple', 'Sobre', 'Solaire', 'Solide', 'Solitaire',
  'Sombre', 'Souple', 'Splendide', 'Stellaire', 'Stoïque', 'Suave', 'Superbe', 'Svelte', 'Sylvestre',
  'Taciturne', 'Tenace', 'Tendre', 'Terrestre', 'Timide', 'Tranquille', 'Turquoise', 'Unique',
  'Utile', 'Vaste', 'Véloce', 'Volatile', 'Volubile',
] as const;

/** Nombre de pseudos distincts possibles — sert de garde-fou aux tests. */
export const ESPACE_DE_TIRAGE = NOMS.length * ADJECTIFS.length;

/**
 * Un index tiré au sort. Le biais du modulo est ici sans portée (2³² pour ~150
 * valeurs), mais on passe par le générateur cryptographique plutôt que par
 * `Math.random` : c'est gratuit, et rien de ce qui ressemble à une identité ne
 * devrait dépendre d'une source prévisible.
 */
function tirage(n: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % n;
}

/** Un pseudo au hasard, de la forme « MésangeTranquille ». */
export function randomPseudo(): string {
  return NOMS[tirage(NOMS.length)] + ADJECTIFS[tirage(ADJECTIFS.length)];
}
