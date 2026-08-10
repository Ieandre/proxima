/* ==========================================================================
 * Villes ayant leur propre page (`/tchat/nancy`) — FICHIER GÉNÉRÉ.
 *
 * Écrit par `scripts/build-seo-cities.js` depuis `server/city-pages.js`, qui
 * dérive tout de la base géographique embarquée. Ne pas modifier à la main : la
 * prochaine régénération écraserait la retouche, et `test/city-pages.test.js`
 * refuserait déjà le décalage.
 *
 * Pour changer la sélection (seuil de population, villes hors de France),
 * modifier `server/city-pages.js` puis lancer `npm run build:seo-cities`.
 * ======================================================================== */

/** Une commune à portée : nom, distance en km, et son slug si elle a sa page. */
export type NearbyCity = { name: string; km: number; slug: string | null };

export type SeoCity = {
  slug: string;
  /** Identifiant stable de la commune (`FR-54395`), tel que l'attend `identify`. */
  id: string;
  name: string;
  /** Département, province ou canton — absent pour Monaco et le Luxembourg. */
  subdivision: string | null;
  country: string;
  population: number;
  /** Nombre total de communes dans le rayon du service, pas seulement celles listées. */
  nearbyTotal: number;
  nearby: NearbyCity[];
};

export const SEO_CITIES: SeoCity[] = [
  {
    "slug": "paris",
    "id": "FR-75056",
    "name": "Paris",
    "subdivision": null,
    "country": "France",
    "population": 2103778,
    "nearbyTotal": 1831,
    "nearby": [
      {
        "name": "Le Pré-Saint-Gervais",
        "km": 5.1,
        "slug": null
      },
      {
        "name": "Gentilly",
        "km": 5.2,
        "slug": null
      },
      {
        "name": "Montrouge",
        "km": 5.3,
        "slug": null
      },
      {
        "name": "Le Kremlin-Bicêtre",
        "km": 5.6,
        "slug": null
      },
      {
        "name": "Saint-Mandé",
        "km": 5.7,
        "slug": null
      },
      {
        "name": "Bagnolet",
        "km": 5.8,
        "slug": null
      },
      {
        "name": "Charenton-le-Pont",
        "km": 5.8,
        "slug": null
      },
      {
        "name": "Levallois-Perret",
        "km": 5.9,
        "slug": null
      },
      {
        "name": "Clichy",
        "km": 5.9,
        "slug": null
      },
      {
        "name": "Ivry-sur-Seine",
        "km": 5.9,
        "slug": null
      }
    ]
  },
  {
    "slug": "marseille",
    "id": "FR-13055",
    "name": "Marseille",
    "subdivision": "Bouches-du-Rhône",
    "country": "France",
    "population": 886040,
    "nearbyTotal": 260,
    "nearby": [
      {
        "name": "Allauch",
        "km": 13,
        "slug": null
      },
      {
        "name": "Les Pennes-Mirabeau",
        "km": 14,
        "slug": null
      },
      {
        "name": "Aubagne",
        "km": 15,
        "slug": null
      },
      {
        "name": "Bouc-Bel-Air",
        "km": 18,
        "slug": null
      },
      {
        "name": "Marignane",
        "km": 21,
        "slug": null
      },
      {
        "name": "Vitrolles",
        "km": 21,
        "slug": null
      },
      {
        "name": "Gardanne",
        "km": 22,
        "slug": null
      },
      {
        "name": "La Ciotat",
        "km": 22,
        "slug": null
      },
      {
        "name": "Châteauneuf-les-Martigues",
        "km": 23,
        "slug": null
      },
      {
        "name": "Aix-en-Provence",
        "km": 28,
        "slug": "aix-en-provence"
      }
    ]
  },
  {
    "slug": "lyon",
    "id": "FR-69123",
    "name": "Lyon",
    "subdivision": "Rhône",
    "country": "France",
    "population": 519127,
    "nearbyTotal": 1354,
    "nearby": [
      {
        "name": "Sainte-Foy-lès-Lyon",
        "km": 4.1,
        "slug": null
      },
      {
        "name": "Villeurbanne",
        "km": 4.5,
        "slug": "villeurbanne"
      },
      {
        "name": "Caluire-et-Cuire",
        "km": 4.6,
        "slug": null
      },
      {
        "name": "Écully",
        "km": 5.5,
        "slug": null
      },
      {
        "name": "Oullins-Pierre-Bénite",
        "km": 5.9,
        "slug": null
      },
      {
        "name": "Bron",
        "km": 6.4,
        "slug": null
      },
      {
        "name": "Tassin-la-Demi-Lune",
        "km": 6.5,
        "slug": null
      },
      {
        "name": "Saint-Fons",
        "km": 6.6,
        "slug": null
      },
      {
        "name": "Francheville",
        "km": 6.7,
        "slug": null
      },
      {
        "name": "Vénissieux",
        "km": 7.2,
        "slug": null
      }
    ]
  },
  {
    "slug": "toulouse",
    "id": "FR-31555",
    "name": "Toulouse",
    "subdivision": "Haute-Garonne",
    "country": "France",
    "population": 514819,
    "nearbyTotal": 1309,
    "nearby": [
      {
        "name": "Balma",
        "km": 5.8,
        "slug": null
      },
      {
        "name": "Blagnac",
        "km": 6.3,
        "slug": null
      },
      {
        "name": "Ramonville-Saint-Agne",
        "km": 7.3,
        "slug": null
      },
      {
        "name": "Tournefeuille",
        "km": 8.5,
        "slug": null
      },
      {
        "name": "Colomiers",
        "km": 8.8,
        "slug": null
      },
      {
        "name": "Cugnaux",
        "km": 9.5,
        "slug": null
      },
      {
        "name": "Castanet-Tolosan",
        "km": 12,
        "slug": null
      },
      {
        "name": "Plaisance-du-Touch",
        "km": 13,
        "slug": null
      },
      {
        "name": "Muret",
        "km": 21,
        "slug": null
      },
      {
        "name": "Montauban",
        "km": 47,
        "slug": null
      }
    ]
  },
  {
    "slug": "nice",
    "id": "FR-06088",
    "name": "Nice",
    "subdivision": "Alpes-Maritimes",
    "country": "France",
    "population": 357737,
    "nearbyTotal": 247,
    "nearby": [
      {
        "name": "Saint-Laurent-du-Var",
        "km": 6,
        "slug": null
      },
      {
        "name": "Cagnes-sur-Mer",
        "km": 9,
        "slug": null
      },
      {
        "name": "Vence",
        "km": 13,
        "slug": null
      },
      {
        "name": "Villeneuve-Loubet",
        "km": 14,
        "slug": null
      },
      {
        "name": "Monaco",
        "km": 14,
        "slug": "monaco"
      },
      {
        "name": "Monte-Carlo",
        "km": 15,
        "slug": null
      },
      {
        "name": "Antibes",
        "km": 18,
        "slug": null
      },
      {
        "name": "Vallauris",
        "km": 21,
        "slug": null
      },
      {
        "name": "Menton",
        "km": 22,
        "slug": null
      },
      {
        "name": "Mougins",
        "km": 23,
        "slug": null
      }
    ]
  },
  {
    "slug": "nantes",
    "id": "FR-44109",
    "name": "Nantes",
    "subdivision": "Loire-Atlantique",
    "country": "France",
    "population": 327734,
    "nearbyTotal": 465,
    "nearby": [
      {
        "name": "Saint-Herblain",
        "km": 5.5,
        "slug": null
      },
      {
        "name": "Saint-Sébastien-sur-Loire",
        "km": 5.6,
        "slug": null
      },
      {
        "name": "Orvault",
        "km": 6,
        "slug": null
      },
      {
        "name": "Sainte-Luce-sur-Loire",
        "km": 7,
        "slug": null
      },
      {
        "name": "Rezé",
        "km": 7.2,
        "slug": null
      },
      {
        "name": "La Chapelle-sur-Erdre",
        "km": 7.3,
        "slug": null
      },
      {
        "name": "Bouguenais",
        "km": 8.7,
        "slug": null
      },
      {
        "name": "Carquefou",
        "km": 9.5,
        "slug": null
      },
      {
        "name": "Vertou",
        "km": 12,
        "slug": null
      },
      {
        "name": "Couëron",
        "km": 14,
        "slug": null
      }
    ]
  },
  {
    "slug": "montpellier",
    "id": "FR-34172",
    "name": "Montpellier",
    "subdivision": "Hérault",
    "country": "France",
    "population": 310240,
    "nearbyTotal": 612,
    "nearby": [
      {
        "name": "Castelnau-le-Lez",
        "km": 4.3,
        "slug": null
      },
      {
        "name": "Lattes",
        "km": 5.2,
        "slug": null
      },
      {
        "name": "Mauguio",
        "km": 11,
        "slug": null
      },
      {
        "name": "Frontignan",
        "km": 21,
        "slug": null
      },
      {
        "name": "Lunel",
        "km": 22,
        "slug": null
      },
      {
        "name": "Sète",
        "km": 31,
        "slug": null
      },
      {
        "name": "Nîmes",
        "km": 45,
        "slug": "nimes"
      },
      {
        "name": "Agde",
        "km": 46,
        "slug": null
      },
      {
        "name": "Béziers",
        "km": 59,
        "slug": null
      },
      {
        "name": "Alès",
        "km": 60,
        "slug": null
      }
    ]
  },
  {
    "slug": "strasbourg",
    "id": "FR-67482",
    "name": "Strasbourg",
    "subdivision": "Bas-Rhin",
    "country": "France",
    "population": 293771,
    "nearbyTotal": 883,
    "nearby": [
      {
        "name": "Schiltigheim",
        "km": 4.8,
        "slug": null
      },
      {
        "name": "Bischheim",
        "km": 5.7,
        "slug": null
      },
      {
        "name": "Illkirch-Graffenstaden",
        "km": 5.7,
        "slug": null
      },
      {
        "name": "Lingolsheim",
        "km": 6,
        "slug": null
      },
      {
        "name": "Haguenau",
        "km": 30,
        "slug": null
      },
      {
        "name": "Sélestat",
        "km": 42,
        "slug": null
      },
      {
        "name": "Colmar",
        "km": 58,
        "slug": null
      },
      {
        "name": "Saint-Dié-des-Vosges",
        "km": 68,
        "slug": null
      }
    ]
  },
  {
    "slug": "bordeaux",
    "id": "FR-33063",
    "name": "Bordeaux",
    "subdivision": "Gironde",
    "country": "France",
    "population": 267991,
    "nearbyTotal": 799,
    "nearby": [
      {
        "name": "Le Bouscat",
        "km": 1.5,
        "slug": null
      },
      {
        "name": "Bruges",
        "km": 3.3,
        "slug": null
      },
      {
        "name": "Cenon",
        "km": 5,
        "slug": null
      },
      {
        "name": "Eysines",
        "km": 5.1,
        "slug": null
      },
      {
        "name": "Lormont",
        "km": 5.5,
        "slug": null
      },
      {
        "name": "Floirac",
        "km": 6,
        "slug": null
      },
      {
        "name": "Talence",
        "km": 6.3,
        "slug": null
      },
      {
        "name": "Blanquefort",
        "km": 6.9,
        "slug": null
      },
      {
        "name": "Bègles",
        "km": 7.2,
        "slug": null
      },
      {
        "name": "Mérignac",
        "km": 8.4,
        "slug": null
      }
    ]
  },
  {
    "slug": "lille",
    "id": "FR-59350",
    "name": "Lille",
    "subdivision": "Nord",
    "country": "France",
    "population": 238246,
    "nearbyTotal": 1419,
    "nearby": [
      {
        "name": "Lambersart",
        "km": 3,
        "slug": null
      },
      {
        "name": "La Madeleine",
        "km": 3,
        "slug": null
      },
      {
        "name": "Loos",
        "km": 3.1,
        "slug": null
      },
      {
        "name": "Faches-Thumesnil",
        "km": 4.3,
        "slug": null
      },
      {
        "name": "Ronchin",
        "km": 4.5,
        "slug": null
      },
      {
        "name": "Mons-en-Barœul",
        "km": 4.6,
        "slug": null
      },
      {
        "name": "Wattignies",
        "km": 5,
        "slug": null
      },
      {
        "name": "Haubourdin",
        "km": 5.3,
        "slug": null
      },
      {
        "name": "Marcq-en-Barœul",
        "km": 6.6,
        "slug": null
      },
      {
        "name": "Wasquehal",
        "km": 7.4,
        "slug": null
      }
    ]
  },
  {
    "slug": "rennes",
    "id": "FR-35238",
    "name": "Rennes",
    "subdivision": "Ille-et-Vilaine",
    "country": "France",
    "population": 230890,
    "nearbyTotal": 740,
    "nearby": [
      {
        "name": "Cesson-Sévigné",
        "km": 7.1,
        "slug": null
      },
      {
        "name": "Bruz",
        "km": 11,
        "slug": null
      },
      {
        "name": "Vitré",
        "km": 36,
        "slug": null
      },
      {
        "name": "Fougères",
        "km": 45,
        "slug": null
      },
      {
        "name": "Saint-Malo",
        "km": 64,
        "slug": null
      },
      {
        "name": "Laval",
        "km": 69,
        "slug": null
      },
      {
        "name": "Lamballe-Armor",
        "km": 74,
        "slug": null
      }
    ]
  },
  {
    "slug": "geneve",
    "id": "CH-7285902",
    "name": "Genève",
    "subdivision": "canton de Genève",
    "country": "Suisse",
    "population": 203951,
    "nearbyTotal": 1278,
    "nearby": [
      {
        "name": "Lancy",
        "km": 2.7,
        "slug": null
      },
      {
        "name": "Carouge",
        "km": 2.7,
        "slug": null
      },
      {
        "name": "Vernier",
        "km": 3.6,
        "slug": null
      },
      {
        "name": "Onex",
        "km": 3.9,
        "slug": null
      },
      {
        "name": "Meyrin",
        "km": 5.6,
        "slug": null
      },
      {
        "name": "Annemasse",
        "km": 8.4,
        "slug": null
      },
      {
        "name": "Saint-Julien-en-Genevois",
        "km": 8.7,
        "slug": null
      },
      {
        "name": "Nyon",
        "km": 21,
        "slug": "nyon"
      },
      {
        "name": "Valserhône",
        "km": 28,
        "slug": null
      },
      {
        "name": "Thonon-les-Bains",
        "km": 32,
        "slug": null
      }
    ]
  },
  {
    "slug": "charleroi",
    "id": "BE-2800482",
    "name": "Charleroi",
    "subdivision": "province de Hainaut",
    "country": "Belgique",
    "population": 202267,
    "nearbyTotal": 684,
    "nearby": [
      {
        "name": "Chatelet",
        "km": 6,
        "slug": null
      },
      {
        "name": "Courcelles",
        "km": 7.6,
        "slug": null
      },
      {
        "name": "Fontaine-L'Eveque",
        "km": 8.8,
        "slug": null
      },
      {
        "name": "Fleurus",
        "km": 11,
        "slug": null
      },
      {
        "name": "Pont-A-Celles",
        "km": 12,
        "slug": null
      },
      {
        "name": "Sambreville",
        "km": 13,
        "slug": null
      },
      {
        "name": "Morlanwelz",
        "km": 16,
        "slug": null
      },
      {
        "name": "Jemeppe-Sur-Sambre",
        "km": 16,
        "slug": null
      },
      {
        "name": "Manage",
        "km": 17,
        "slug": null
      },
      {
        "name": "Walcourt",
        "km": 18,
        "slug": null
      }
    ]
  },
  {
    "slug": "liege",
    "id": "BE-2792414",
    "name": "Liège",
    "subdivision": null,
    "country": "Belgique",
    "population": 197327,
    "nearbyTotal": 216,
    "nearby": [
      {
        "name": "Saint-Nicolas",
        "km": 4.7,
        "slug": null
      },
      {
        "name": "Herstal",
        "km": 4.7,
        "slug": null
      },
      {
        "name": "Chaudfontaine",
        "km": 5.5,
        "slug": null
      },
      {
        "name": "Fleron",
        "km": 6,
        "slug": null
      },
      {
        "name": "Seraing",
        "km": 6.9,
        "slug": "seraing"
      },
      {
        "name": "Ans",
        "km": 6.9,
        "slug": null
      },
      {
        "name": "Grace-Hollogne",
        "km": 8.6,
        "slug": null
      },
      {
        "name": "Oupeye",
        "km": 9.9,
        "slug": null
      },
      {
        "name": "Soumagne",
        "km": 11,
        "slug": null
      },
      {
        "name": "Flemalle",
        "km": 11,
        "slug": null
      }
    ]
  },
  {
    "slug": "bruxelles",
    "id": "BE-3337389",
    "name": "Bruxelles",
    "subdivision": "province de Bruxelles-Capitale",
    "country": "Belgique",
    "population": 181726,
    "nearbyTotal": 418,
    "nearby": [
      {
        "name": "Saint-Josse-Ten-Noode",
        "km": 1.8,
        "slug": null
      },
      {
        "name": "Molenbeek-Saint-Jean",
        "km": 2,
        "slug": null
      },
      {
        "name": "Koekelberg",
        "km": 2.1,
        "slug": null
      },
      {
        "name": "Saint-Gilles",
        "km": 2.5,
        "slug": null
      },
      {
        "name": "Anderlecht",
        "km": 2.7,
        "slug": null
      },
      {
        "name": "Schaerbeek",
        "km": 3.1,
        "slug": null
      },
      {
        "name": "Ganshoren",
        "km": 3.6,
        "slug": null
      },
      {
        "name": "Etterbeek",
        "km": 3.7,
        "slug": null
      },
      {
        "name": "Ixelles",
        "km": 3.8,
        "slug": null
      },
      {
        "name": "Berchem-Sainte-Agathe",
        "km": 3.9,
        "slug": null
      }
    ]
  },
  {
    "slug": "toulon",
    "id": "FR-83137",
    "name": "Toulon",
    "subdivision": "Var",
    "country": "France",
    "population": 179116,
    "nearbyTotal": 210,
    "nearby": [
      {
        "name": "La Valette-du-Var",
        "km": 4.7,
        "slug": null
      },
      {
        "name": "La Garde",
        "km": 6.8,
        "slug": null
      },
      {
        "name": "La Seyne-sur-Mer",
        "km": 7.3,
        "slug": null
      },
      {
        "name": "Sanary-sur-Mer",
        "km": 11,
        "slug": null
      },
      {
        "name": "Six-Fours-les-Plages",
        "km": 12,
        "slug": null
      },
      {
        "name": "La Crau",
        "km": 13,
        "slug": null
      },
      {
        "name": "Hyères",
        "km": 25,
        "slug": null
      },
      {
        "name": "La Ciotat",
        "km": 26,
        "slug": null
      },
      {
        "name": "Brignoles",
        "km": 30,
        "slug": null
      },
      {
        "name": "Aubagne",
        "km": 34,
        "slug": null
      }
    ]
  },
  {
    "slug": "reims",
    "id": "FR-51454",
    "name": "Reims",
    "subdivision": "Marne",
    "country": "France",
    "population": 177674,
    "nearbyTotal": 1542,
    "nearby": [
      {
        "name": "Cernay-lès-Reims",
        "km": 3.8,
        "slug": null
      },
      {
        "name": "Cormontreuil",
        "km": 4.1,
        "slug": null
      },
      {
        "name": "Tinqueux",
        "km": 4.8,
        "slug": null
      },
      {
        "name": "Bétheny",
        "km": 5,
        "slug": null
      },
      {
        "name": "Saint-Léonard",
        "km": 5.1,
        "slug": null
      },
      {
        "name": "Saint-Brice-Courcelles",
        "km": 5.2,
        "slug": null
      },
      {
        "name": "Trois-Puits",
        "km": 5.4,
        "slug": null
      },
      {
        "name": "Bezannes",
        "km": 5.8,
        "slug": null
      },
      {
        "name": "Taissy",
        "km": 5.8,
        "slug": null
      },
      {
        "name": "Witry-lès-Reims",
        "km": 6.4,
        "slug": null
      }
    ]
  },
  {
    "slug": "saint-etienne",
    "id": "FR-42218",
    "name": "Saint-Étienne",
    "subdivision": "Loire",
    "country": "France",
    "population": 173136,
    "nearbyTotal": 1169,
    "nearby": [
      {
        "name": "Firminy",
        "km": 7.6,
        "slug": null
      },
      {
        "name": "Saint-Just-Saint-Rambert",
        "km": 12,
        "slug": null
      },
      {
        "name": "Saint-Chamond",
        "km": 12,
        "slug": null
      },
      {
        "name": "Rive-de-Gier",
        "km": 22,
        "slug": null
      },
      {
        "name": "Annonay",
        "km": 29,
        "slug": null
      },
      {
        "name": "Montbrison",
        "km": 30,
        "slug": null
      },
      {
        "name": "Givors",
        "km": 35,
        "slug": null
      },
      {
        "name": "Vienne",
        "km": 42,
        "slug": null
      },
      {
        "name": "Saint-Genis-Laval",
        "km": 45,
        "slug": null
      },
      {
        "name": "Francheville",
        "km": 46,
        "slug": null
      }
    ]
  },
  {
    "slug": "le-havre",
    "id": "FR-76351",
    "name": "Le Havre",
    "subdivision": "Seine-Maritime",
    "country": "France",
    "population": 166687,
    "nearbyTotal": 1141,
    "nearby": [
      {
        "name": "Montivilliers",
        "km": 6.9,
        "slug": null
      },
      {
        "name": "Fécamp",
        "km": 34,
        "slug": null
      },
      {
        "name": "Lisieux",
        "km": 40,
        "slug": null
      },
      {
        "name": "Hérouville-Saint-Clair",
        "km": 47,
        "slug": null
      },
      {
        "name": "Caen",
        "km": 50,
        "slug": "caen"
      },
      {
        "name": "Le Grand-Quevilly",
        "km": 66,
        "slug": null
      },
      {
        "name": "Elbeuf",
        "km": 67,
        "slug": null
      },
      {
        "name": "Le Petit-Quevilly",
        "km": 67,
        "slug": null
      },
      {
        "name": "Mont-Saint-Aignan",
        "km": 69,
        "slug": null
      },
      {
        "name": "Rouen",
        "km": 70,
        "slug": "rouen"
      }
    ]
  },
  {
    "slug": "villeurbanne",
    "id": "FR-69266",
    "name": "Villeurbanne",
    "subdivision": "Rhône",
    "country": "France",
    "population": 163684,
    "nearbyTotal": 1370,
    "nearby": [
      {
        "name": "Vaulx-en-Velin",
        "km": 2.8,
        "slug": null
      },
      {
        "name": "Caluire-et-Cuire",
        "km": 4.3,
        "slug": null
      },
      {
        "name": "Bron",
        "km": 4.4,
        "slug": null
      },
      {
        "name": "Lyon",
        "km": 4.5,
        "slug": "lyon"
      },
      {
        "name": "Décines-Charpieu",
        "km": 5.4,
        "slug": null
      },
      {
        "name": "Rillieux-la-Pape",
        "km": 6.1,
        "slug": null
      },
      {
        "name": "Vénissieux",
        "km": 7.9,
        "slug": null
      },
      {
        "name": "Sainte-Foy-lès-Lyon",
        "km": 8.5,
        "slug": null
      },
      {
        "name": "Saint-Fons",
        "km": 8.6,
        "slug": null
      },
      {
        "name": "Saint-Priest",
        "km": 9,
        "slug": null
      }
    ]
  },
  {
    "slug": "dijon",
    "id": "FR-21231",
    "name": "Dijon",
    "subdivision": "Côte-d'Or",
    "country": "France",
    "population": 161830,
    "nearbyTotal": 1465,
    "nearby": [
      {
        "name": "Fontaine-lès-Dijon",
        "km": 1.8,
        "slug": null
      },
      {
        "name": "Talant",
        "km": 2.8,
        "slug": null
      },
      {
        "name": "Ahuy",
        "km": 4.3,
        "slug": null
      },
      {
        "name": "Saint-Apollinaire",
        "km": 4.7,
        "slug": null
      },
      {
        "name": "Chenôve",
        "km": 5.1,
        "slug": null
      },
      {
        "name": "Ruffey-lès-Echirey",
        "km": 5.5,
        "slug": null
      },
      {
        "name": "Longvic",
        "km": 5.5,
        "slug": null
      },
      {
        "name": "Daix",
        "km": 5.7,
        "slug": null
      },
      {
        "name": "Bellefond",
        "km": 5.9,
        "slug": null
      },
      {
        "name": "Quetigny",
        "km": 6.2,
        "slug": null
      }
    ]
  },
  {
    "slug": "angers",
    "id": "FR-49007",
    "name": "Angers",
    "subdivision": "Maine-et-Loire",
    "country": "France",
    "population": 159022,
    "nearbyTotal": 608,
    "nearby": [
      {
        "name": "Avrillé",
        "km": 3.7,
        "slug": null
      },
      {
        "name": "Trélazé",
        "km": 7.2,
        "slug": null
      },
      {
        "name": "Loire-Authion",
        "km": 14,
        "slug": null
      },
      {
        "name": "Chemillé-en-Anjou",
        "km": 31,
        "slug": null
      },
      {
        "name": "Mauges-sur-Loire",
        "km": 32,
        "slug": null
      },
      {
        "name": "Segré-en-Anjou Bleu",
        "km": 34,
        "slug": null
      },
      {
        "name": "Château-Gontier-sur-Mayenne",
        "km": 39,
        "slug": null
      },
      {
        "name": "Montrevault-sur-Èvre",
        "km": 43,
        "slug": null
      },
      {
        "name": "Saumur",
        "km": 43,
        "slug": null
      },
      {
        "name": "Beaupréau-en-Mauges",
        "km": 44,
        "slug": null
      }
    ]
  },
  {
    "slug": "grenoble",
    "id": "FR-38185",
    "name": "Grenoble",
    "subdivision": "Isère",
    "country": "France",
    "population": 156140,
    "nearbyTotal": 1019,
    "nearby": [
      {
        "name": "Fontaine",
        "km": 3.3,
        "slug": null
      },
      {
        "name": "Saint-Martin-d'Hères",
        "km": 3.9,
        "slug": null
      },
      {
        "name": "Échirolles",
        "km": 4.5,
        "slug": null
      },
      {
        "name": "Saint-Égrève",
        "km": 5.9,
        "slug": null
      },
      {
        "name": "Meylan",
        "km": 6.5,
        "slug": null
      },
      {
        "name": "Voiron",
        "km": 24,
        "slug": null
      },
      {
        "name": "Chambéry",
        "km": 47,
        "slug": null
      },
      {
        "name": "Romans-sur-Isère",
        "km": 54,
        "slug": null
      },
      {
        "name": "Bourgoin-Jallieu",
        "km": 58,
        "slug": null
      },
      {
        "name": "Aix-les-Bains",
        "km": 59,
        "slug": null
      }
    ]
  },
  {
    "slug": "saint-denis-974",
    "id": "FR-97411",
    "name": "Saint-Denis (974)",
    "subdivision": "La Réunion",
    "country": "France",
    "population": 155634,
    "nearbyTotal": 23,
    "nearby": [
      {
        "name": "La Possession",
        "km": 8,
        "slug": null
      },
      {
        "name": "Sainte-Marie",
        "km": 8.2,
        "slug": null
      },
      {
        "name": "Le Port",
        "km": 15,
        "slug": null
      },
      {
        "name": "Saint-Paul",
        "km": 15,
        "slug": "saint-paul"
      },
      {
        "name": "Sainte-Suzanne",
        "km": 16,
        "slug": null
      },
      {
        "name": "Saint-André",
        "km": 20,
        "slug": null
      },
      {
        "name": "Saint-Benoît",
        "km": 25,
        "slug": null
      },
      {
        "name": "Saint-Leu",
        "km": 28,
        "slug": null
      },
      {
        "name": "Saint-Louis",
        "km": 31,
        "slug": null
      },
      {
        "name": "Le Tampon",
        "km": 34,
        "slug": null
      }
    ]
  },
  {
    "slug": "nimes",
    "id": "FR-30189",
    "name": "Nîmes",
    "subdivision": "Gard",
    "country": "France",
    "population": 151839,
    "nearbyTotal": 712,
    "nearby": [
      {
        "name": "Beaucaire",
        "km": 21,
        "slug": null
      },
      {
        "name": "Lunel",
        "km": 24,
        "slug": null
      },
      {
        "name": "Tarascon",
        "km": 28,
        "slug": null
      },
      {
        "name": "Mauguio",
        "km": 38,
        "slug": null
      },
      {
        "name": "Alès",
        "km": 38,
        "slug": null
      },
      {
        "name": "Châteaurenard",
        "km": 40,
        "slug": null
      },
      {
        "name": "Arles",
        "km": 41,
        "slug": null
      },
      {
        "name": "Castelnau-le-Lez",
        "km": 41,
        "slug": null
      },
      {
        "name": "Avignon",
        "km": 41,
        "slug": null
      },
      {
        "name": "Bagnols-sur-Cèze",
        "km": 43,
        "slug": null
      }
    ]
  },
  {
    "slug": "aix-en-provence",
    "id": "FR-13001",
    "name": "Aix-en-Provence",
    "subdivision": "Bouches-du-Rhône",
    "country": "France",
    "population": 149695,
    "nearbyTotal": 411,
    "nearby": [
      {
        "name": "Bouc-Bel-Air",
        "km": 10,
        "slug": null
      },
      {
        "name": "Gardanne",
        "km": 12,
        "slug": null
      },
      {
        "name": "Vitrolles",
        "km": 14,
        "slug": null
      },
      {
        "name": "Les Pennes-Mirabeau",
        "km": 16,
        "slug": null
      },
      {
        "name": "Marignane",
        "km": 19,
        "slug": null
      },
      {
        "name": "Pertuis",
        "km": 21,
        "slug": null
      },
      {
        "name": "Allauch",
        "km": 23,
        "slug": null
      },
      {
        "name": "Châteauneuf-les-Martigues",
        "km": 25,
        "slug": null
      },
      {
        "name": "Marseille",
        "km": 28,
        "slug": "marseille"
      },
      {
        "name": "Salon-de-Provence",
        "km": 30,
        "slug": null
      }
    ]
  },
  {
    "slug": "saint-denis-93",
    "id": "FR-93066",
    "name": "Saint-Denis (93)",
    "subdivision": "Seine-Saint-Denis",
    "country": "France",
    "population": 149077,
    "nearbyTotal": 1890,
    "nearby": [
      {
        "name": "La Courneuve",
        "km": 2.4,
        "slug": null
      },
      {
        "name": "Stains",
        "km": 2.7,
        "slug": null
      },
      {
        "name": "Villeneuve-la-Garenne",
        "km": 3.1,
        "slug": null
      },
      {
        "name": "Aubervilliers",
        "km": 3.2,
        "slug": null
      },
      {
        "name": "Montmagny",
        "km": 3.6,
        "slug": null
      },
      {
        "name": "Saint-Ouen-sur-Seine",
        "km": 3.8,
        "slug": null
      },
      {
        "name": "Épinay-sur-Seine",
        "km": 4,
        "slug": null
      },
      {
        "name": "Garges-lès-Gonesse",
        "km": 4.5,
        "slug": null
      },
      {
        "name": "Deuil-la-Barre",
        "km": 4.6,
        "slug": null
      },
      {
        "name": "Le Bourget",
        "km": 4.6,
        "slug": null
      }
    ]
  },
  {
    "slug": "clermont-ferrand",
    "id": "FR-63113",
    "name": "Clermont-Ferrand",
    "subdivision": "Puy-de-Dôme",
    "country": "France",
    "population": 146351,
    "nearbyTotal": 974,
    "nearby": [
      {
        "name": "Chamalières",
        "km": 4.3,
        "slug": null
      },
      {
        "name": "Cournon-d'Auvergne",
        "km": 7.7,
        "slug": null
      },
      {
        "name": "Riom",
        "km": 12,
        "slug": null
      },
      {
        "name": "Issoire",
        "km": 29,
        "slug": null
      },
      {
        "name": "Vichy",
        "km": 45,
        "slug": null
      },
      {
        "name": "Montluçon",
        "km": 73,
        "slug": null
      }
    ]
  },
  {
    "slug": "le-mans",
    "id": "FR-72181",
    "name": "Le Mans",
    "subdivision": "Sarthe",
    "country": "France",
    "population": 146249,
    "nearbyTotal": 877,
    "nearby": [
      {
        "name": "Alençon",
        "km": 51,
        "slug": null
      },
      {
        "name": "Vendôme",
        "km": 68,
        "slug": null
      },
      {
        "name": "Château-Gontier-sur-Mayenne",
        "km": 69,
        "slug": null
      },
      {
        "name": "Loire-Authion",
        "km": 71,
        "slug": null
      },
      {
        "name": "Saint-Cyr-sur-Loire",
        "km": 71,
        "slug": null
      },
      {
        "name": "Laval",
        "km": 72,
        "slug": null
      }
    ]
  },
  {
    "slug": "brest",
    "id": "FR-29019",
    "name": "Brest",
    "subdivision": "Finistère",
    "country": "France",
    "population": 142346,
    "nearbyTotal": 271,
    "nearby": [
      {
        "name": "Bohars",
        "km": 2.8,
        "slug": null
      },
      {
        "name": "Guilers",
        "km": 4.8,
        "slug": null
      },
      {
        "name": "Gouesnou",
        "km": 5.1,
        "slug": null
      },
      {
        "name": "Le Relecq-Kerhuon",
        "km": 7.3,
        "slug": null
      },
      {
        "name": "Guipavas",
        "km": 8.1,
        "slug": null
      },
      {
        "name": "Plouzané",
        "km": 8.1,
        "slug": null
      },
      {
        "name": "Milizac-Guipronvel",
        "km": 8.4,
        "slug": null
      },
      {
        "name": "Saint-Renan",
        "km": 9.3,
        "slug": null
      },
      {
        "name": "Bourg-Blanc",
        "km": 9.4,
        "slug": null
      },
      {
        "name": "Plougastel-Daoulas",
        "km": 9.5,
        "slug": null
      }
    ]
  },
  {
    "slug": "lausanne",
    "id": "CH-7286283",
    "name": "Lausanne",
    "subdivision": "canton de Vaud",
    "country": "Suisse",
    "population": 139408,
    "nearbyTotal": 1151,
    "nearby": [
      {
        "name": "Pully",
        "km": 2.8,
        "slug": null
      },
      {
        "name": "Renens",
        "km": 3.6,
        "slug": null
      },
      {
        "name": "Morges",
        "km": 11,
        "slug": null
      },
      {
        "name": "Vevey",
        "km": 18,
        "slug": "vevey"
      },
      {
        "name": "Thonon-les-Bains",
        "km": 20,
        "slug": null
      },
      {
        "name": "Montreux",
        "km": 25,
        "slug": "montreux"
      },
      {
        "name": "Yverdon-les-Bains",
        "km": 28,
        "slug": "yverdon-les-bains"
      },
      {
        "name": "Bulle",
        "km": 33,
        "slug": null
      },
      {
        "name": "Nyon",
        "km": 35,
        "slug": "nyon"
      },
      {
        "name": "Monthey",
        "km": 40,
        "slug": null
      }
    ]
  },
  {
    "slug": "tours",
    "id": "FR-37261",
    "name": "Tours",
    "subdivision": "Indre-et-Loire",
    "country": "France",
    "population": 139259,
    "nearbyTotal": 773,
    "nearby": [
      {
        "name": "Saint-Pierre-des-Corps",
        "km": 3,
        "slug": null
      },
      {
        "name": "Saint-Cyr-sur-Loire",
        "km": 4,
        "slug": null
      },
      {
        "name": "Joué-lès-Tours",
        "km": 7,
        "slug": null
      },
      {
        "name": "Blois",
        "km": 50,
        "slug": null
      },
      {
        "name": "Vendôme",
        "km": 53,
        "slug": null
      },
      {
        "name": "Saumur",
        "km": 60,
        "slug": null
      },
      {
        "name": "Châtellerault",
        "km": 65,
        "slug": null
      }
    ]
  },
  {
    "slug": "amiens",
    "id": "FR-80021",
    "name": "Amiens",
    "subdivision": "Somme",
    "country": "France",
    "population": 136449,
    "nearbyTotal": 2177,
    "nearby": [
      {
        "name": "Abbeville",
        "km": 40,
        "slug": null
      },
      {
        "name": "Beauvais",
        "km": 53,
        "slug": null
      },
      {
        "name": "Arras",
        "km": 55,
        "slug": null
      },
      {
        "name": "Liévin",
        "km": 68,
        "slug": null
      },
      {
        "name": "Avion",
        "km": 68,
        "slug": null
      },
      {
        "name": "Bruay-la-Buissière",
        "km": 68,
        "slug": null
      },
      {
        "name": "Compiègne",
        "km": 69,
        "slug": null
      },
      {
        "name": "Nogent-sur-Oise",
        "km": 70,
        "slug": null
      },
      {
        "name": "Lens",
        "km": 71,
        "slug": null
      },
      {
        "name": "Saint-Quentin",
        "km": 71,
        "slug": null
      }
    ]
  },
  {
    "slug": "luxembourg",
    "id": "LU-2960317",
    "name": "Luxembourg",
    "subdivision": null,
    "country": "Luxembourg",
    "population": 136208,
    "nearbyTotal": 840,
    "nearby": [
      {
        "name": "Dudelange",
        "km": 15,
        "slug": null
      },
      {
        "name": "Sanem",
        "km": 16,
        "slug": null
      },
      {
        "name": "Wormeldange",
        "km": 20,
        "slug": null
      },
      {
        "name": "Pétange",
        "km": 21,
        "slug": null
      },
      {
        "name": "Grevenmacher",
        "km": 21,
        "slug": null
      },
      {
        "name": "Aubange",
        "km": 25,
        "slug": null
      },
      {
        "name": "Arlon",
        "km": 25,
        "slug": null
      },
      {
        "name": "Thionville",
        "km": 26,
        "slug": null
      },
      {
        "name": "Longwy",
        "km": 28,
        "slug": null
      },
      {
        "name": "Yutz",
        "km": 28,
        "slug": null
      }
    ]
  },
  {
    "slug": "annecy",
    "id": "FR-74010",
    "name": "Annecy",
    "subdivision": "Haute-Savoie",
    "country": "France",
    "population": 132117,
    "nearbyTotal": 1090,
    "nearby": [
      {
        "name": "Rumilly",
        "km": 15,
        "slug": null
      },
      {
        "name": "Saint-Julien-en-Genevois",
        "km": 26,
        "slug": null
      },
      {
        "name": "Aix-les-Bains",
        "km": 29,
        "slug": null
      },
      {
        "name": "Carouge",
        "km": 31,
        "slug": null
      },
      {
        "name": "Onex",
        "km": 31,
        "slug": null
      },
      {
        "name": "Lancy",
        "km": 32,
        "slug": null
      },
      {
        "name": "Annemasse",
        "km": 33,
        "slug": null
      },
      {
        "name": "Genève",
        "km": 34,
        "slug": "geneve"
      },
      {
        "name": "Vernier",
        "km": 34,
        "slug": null
      },
      {
        "name": "Albertville",
        "km": 34,
        "slug": null
      }
    ]
  },
  {
    "slug": "limoges",
    "id": "FR-87085",
    "name": "Limoges",
    "subdivision": "Haute-Vienne",
    "country": "France",
    "population": 129937,
    "nearbyTotal": 701,
    "nearby": [
      {
        "name": "Couzeix",
        "km": 3.3,
        "slug": null
      },
      {
        "name": "Isle",
        "km": 6.1,
        "slug": null
      },
      {
        "name": "Chaptelat",
        "km": 6.7,
        "slug": null
      },
      {
        "name": "Panazol",
        "km": 7.6,
        "slug": null
      },
      {
        "name": "Nieul",
        "km": 7.9,
        "slug": null
      },
      {
        "name": "Condat-sur-Vienne",
        "km": 8,
        "slug": null
      },
      {
        "name": "Le Palais-sur-Vienne",
        "km": 8.1,
        "slug": null
      },
      {
        "name": "Verneuil-sur-Vienne",
        "km": 8.1,
        "slug": null
      },
      {
        "name": "Saint-Gence",
        "km": 9.1,
        "slug": null
      },
      {
        "name": "Feytiat",
        "km": 9.4,
        "slug": null
      }
    ]
  },
  {
    "slug": "metz",
    "id": "FR-57463",
    "name": "Metz",
    "subdivision": "Moselle",
    "country": "France",
    "population": 122572,
    "nearbyTotal": 1526,
    "nearby": [
      {
        "name": "Montigny-lès-Metz",
        "km": 3.1,
        "slug": null
      },
      {
        "name": "Hayange",
        "km": 27,
        "slug": null
      },
      {
        "name": "Yutz",
        "km": 28,
        "slug": null
      },
      {
        "name": "Thionville",
        "km": 30,
        "slug": null
      },
      {
        "name": "Dudelange",
        "km": 43,
        "slug": null
      },
      {
        "name": "Nancy",
        "km": 46,
        "slug": "nancy"
      },
      {
        "name": "Vandœuvre-lès-Nancy",
        "km": 50,
        "slug": null
      },
      {
        "name": "Sanem",
        "km": 51,
        "slug": null
      },
      {
        "name": "Forbach",
        "km": 52,
        "slug": null
      },
      {
        "name": "Toul",
        "km": 52,
        "slug": null
      }
    ]
  },
  {
    "slug": "perpignan",
    "id": "FR-66136",
    "name": "Perpignan",
    "subdivision": "Pyrénées-Orientales",
    "country": "France",
    "population": 121616,
    "nearbyTotal": 499,
    "nearby": [
      {
        "name": "Cabestany",
        "km": 4.3,
        "slug": null
      },
      {
        "name": "Bompas",
        "km": 4.4,
        "slug": null
      },
      {
        "name": "Saint-Estève",
        "km": 5.2,
        "slug": null
      },
      {
        "name": "Pia",
        "km": 5.8,
        "slug": null
      },
      {
        "name": "Saleilles",
        "km": 6,
        "slug": null
      },
      {
        "name": "Villeneuve-de-la-Raho",
        "km": 6.5,
        "slug": null
      },
      {
        "name": "Villelongue-de-la-Salanque",
        "km": 6.6,
        "slug": null
      },
      {
        "name": "Baho",
        "km": 6.7,
        "slug": null
      },
      {
        "name": "Peyrestortes",
        "km": 7.2,
        "slug": null
      },
      {
        "name": "Toulouges",
        "km": 7.3,
        "slug": null
      }
    ]
  },
  {
    "slug": "boulogne-billancourt",
    "id": "FR-92012",
    "name": "Boulogne-Billancourt",
    "subdivision": "Hauts-de-Seine",
    "country": "France",
    "population": 119019,
    "nearbyTotal": 1820,
    "nearby": [
      {
        "name": "Issy-les-Moulineaux",
        "km": 2.1,
        "slug": null
      },
      {
        "name": "Saint-Cloud",
        "km": 3,
        "slug": null
      },
      {
        "name": "Sèvres",
        "km": 3.2,
        "slug": null
      },
      {
        "name": "Vanves",
        "km": 3.7,
        "slug": null
      },
      {
        "name": "Meudon",
        "km": 4,
        "slug": null
      },
      {
        "name": "Suresnes",
        "km": 4.1,
        "slug": null
      },
      {
        "name": "Garches",
        "km": 4.3,
        "slug": null
      },
      {
        "name": "Malakoff",
        "km": 4.4,
        "slug": null
      },
      {
        "name": "Clamart",
        "km": 4.7,
        "slug": null
      },
      {
        "name": "Chaville",
        "km": 4.9,
        "slug": null
      }
    ]
  },
  {
    "slug": "besancon",
    "id": "FR-25056",
    "name": "Besançon",
    "subdivision": "Doubs",
    "country": "France",
    "population": 118489,
    "nearbyTotal": 1759,
    "nearby": [
      {
        "name": "Vesoul",
        "km": 43,
        "slug": null
      },
      {
        "name": "Dole",
        "km": 44,
        "slug": null
      },
      {
        "name": "Pontarlier",
        "km": 47,
        "slug": null
      },
      {
        "name": "La Chaux-de-Fonds",
        "km": 64,
        "slug": "la-chaux-de-fonds"
      },
      {
        "name": "Montbéliard",
        "km": 65,
        "slug": null
      },
      {
        "name": "Val-de-Ruz",
        "km": 72,
        "slug": null
      },
      {
        "name": "Yverdon-les-Bains",
        "km": 72,
        "slug": "yverdon-les-bains"
      },
      {
        "name": "Lons-le-Saunier",
        "km": 74,
        "slug": null
      },
      {
        "name": "Dijon",
        "km": 74,
        "slug": "dijon"
      }
    ]
  },
  {
    "slug": "rouen",
    "id": "FR-76540",
    "name": "Rouen",
    "subdivision": "Seine-Maritime",
    "country": "France",
    "population": 117662,
    "nearbyTotal": 1747,
    "nearby": [
      {
        "name": "Mont-Saint-Aignan",
        "km": 3,
        "slug": null
      },
      {
        "name": "Le Petit-Quevilly",
        "km": 3.1,
        "slug": null
      },
      {
        "name": "Sotteville-lès-Rouen",
        "km": 3.3,
        "slug": null
      },
      {
        "name": "Le Grand-Quevilly",
        "km": 4.9,
        "slug": null
      },
      {
        "name": "Saint-Étienne-du-Rouvray",
        "km": 6.4,
        "slug": null
      },
      {
        "name": "Elbeuf",
        "km": 19,
        "slug": null
      },
      {
        "name": "Louviers",
        "km": 25,
        "slug": null
      },
      {
        "name": "Évreux",
        "km": 47,
        "slug": null
      },
      {
        "name": "Vernon",
        "km": 48,
        "slug": null
      },
      {
        "name": "Dieppe",
        "km": 53,
        "slug": null
      }
    ]
  },
  {
    "slug": "orleans",
    "id": "FR-45234",
    "name": "Orléans",
    "subdivision": "Loiret",
    "country": "France",
    "population": 116357,
    "nearbyTotal": 828,
    "nearby": [
      {
        "name": "Olivet",
        "km": 2.5,
        "slug": null
      },
      {
        "name": "Saint-Jean-de-la-Ruelle",
        "km": 5.1,
        "slug": null
      },
      {
        "name": "Saint-Jean-de-Braye",
        "km": 6.9,
        "slug": null
      },
      {
        "name": "Fleury-les-Aubrais",
        "km": 8,
        "slug": null
      },
      {
        "name": "Saran",
        "km": 8.6,
        "slug": null
      },
      {
        "name": "Blois",
        "km": 56,
        "slug": null
      },
      {
        "name": "Romorantin-Lanthenay",
        "km": 57,
        "slug": null
      },
      {
        "name": "Étampes",
        "km": 64,
        "slug": null
      },
      {
        "name": "Vendôme",
        "km": 64,
        "slug": null
      },
      {
        "name": "Chartres",
        "km": 71,
        "slug": null
      }
    ]
  },
  {
    "slug": "montreuil",
    "id": "FR-93048",
    "name": "Montreuil",
    "subdivision": "Seine-Saint-Denis",
    "country": "France",
    "population": 111934,
    "nearbyTotal": 1843,
    "nearby": [
      {
        "name": "Bagnolet",
        "km": 1.8,
        "slug": null
      },
      {
        "name": "Vincennes",
        "km": 2,
        "slug": null
      },
      {
        "name": "Fontenay-sous-Bois",
        "km": 2.3,
        "slug": null
      },
      {
        "name": "Romainville",
        "km": 2.5,
        "slug": null
      },
      {
        "name": "Les Lilas",
        "km": 2.9,
        "slug": null
      },
      {
        "name": "Rosny-sous-Bois",
        "km": 3,
        "slug": null
      },
      {
        "name": "Noisy-le-Sec",
        "km": 3.2,
        "slug": null
      },
      {
        "name": "Saint-Mandé",
        "km": 3.3,
        "slug": null
      },
      {
        "name": "Nogent-sur-Marne",
        "km": 3.8,
        "slug": null
      },
      {
        "name": "Le Pré-Saint-Gervais",
        "km": 3.9,
        "slug": null
      }
    ]
  },
  {
    "slug": "namur",
    "id": "BE-2790472",
    "name": "Namur",
    "subdivision": null,
    "country": "Belgique",
    "population": 110779,
    "nearbyTotal": 440,
    "nearby": [
      {
        "name": "Eghezee",
        "km": 13,
        "slug": null
      },
      {
        "name": "Jemeppe-Sur-Sambre",
        "km": 14,
        "slug": null
      },
      {
        "name": "Gembloux",
        "km": 16,
        "slug": null
      },
      {
        "name": "Andenne",
        "km": 17,
        "slug": null
      },
      {
        "name": "Sambreville",
        "km": 17,
        "slug": null
      },
      {
        "name": "Fleurus",
        "km": 22,
        "slug": null
      },
      {
        "name": "Chatelet",
        "km": 25,
        "slug": null
      },
      {
        "name": "Ciney",
        "km": 25,
        "slug": null
      },
      {
        "name": "Huy",
        "km": 26,
        "slug": null
      },
      {
        "name": "Hannut",
        "km": 27,
        "slug": null
      }
    ]
  },
  {
    "slug": "caen",
    "id": "FR-14118",
    "name": "Caen",
    "subdivision": "Calvados",
    "country": "France",
    "population": 109400,
    "nearbyTotal": 1076,
    "nearby": [
      {
        "name": "Hérouville-Saint-Clair",
        "km": 3.6,
        "slug": null
      },
      {
        "name": "Lisieux",
        "km": 45,
        "slug": null
      },
      {
        "name": "Le Havre",
        "km": 50,
        "slug": "le-havre"
      },
      {
        "name": "Saint-Lô",
        "km": 52,
        "slug": null
      },
      {
        "name": "Vire Normandie",
        "km": 54,
        "slug": null
      },
      {
        "name": "Montivilliers",
        "km": 57,
        "slug": null
      }
    ]
  },
  {
    "slug": "saint-paul",
    "id": "FR-97415",
    "name": "Saint-Paul",
    "subdivision": "La Réunion",
    "country": "France",
    "population": 108088,
    "nearbyTotal": 23,
    "nearby": [
      {
        "name": "La Possession",
        "km": 7,
        "slug": null
      },
      {
        "name": "Le Port",
        "km": 11,
        "slug": null
      },
      {
        "name": "Saint-Denis",
        "km": 15,
        "slug": "saint-denis-974"
      },
      {
        "name": "Saint-Leu",
        "km": 16,
        "slug": null
      },
      {
        "name": "Sainte-Marie",
        "km": 22,
        "slug": null
      },
      {
        "name": "Saint-Louis",
        "km": 23,
        "slug": null
      },
      {
        "name": "Sainte-Suzanne",
        "km": 28,
        "slug": null
      },
      {
        "name": "Saint-Benoît",
        "km": 31,
        "slug": null
      },
      {
        "name": "Le Tampon",
        "km": 32,
        "slug": null
      },
      {
        "name": "Saint-André",
        "km": 32,
        "slug": null
      }
    ]
  },
  {
    "slug": "argenteuil",
    "id": "FR-95018",
    "name": "Argenteuil",
    "subdivision": "Val-d'Oise",
    "country": "France",
    "population": 106130,
    "nearbyTotal": 1901,
    "nearby": [
      {
        "name": "Sannois",
        "km": 2.6,
        "slug": null
      },
      {
        "name": "Colombes",
        "km": 3.1,
        "slug": null
      },
      {
        "name": "Saint-Gratien",
        "km": 3.4,
        "slug": null
      },
      {
        "name": "Gennevilliers",
        "km": 3.6,
        "slug": null
      },
      {
        "name": "Bezons",
        "km": 3.7,
        "slug": null
      },
      {
        "name": "Cormeilles-en-Parisis",
        "km": 4.1,
        "slug": null
      },
      {
        "name": "Bois-Colombes",
        "km": 4.2,
        "slug": null
      },
      {
        "name": "Ermont",
        "km": 4.4,
        "slug": null
      },
      {
        "name": "Franconville",
        "km": 4.6,
        "slug": null
      },
      {
        "name": "La Garenne-Colombes",
        "km": 4.8,
        "slug": null
      }
    ]
  },
  {
    "slug": "mulhouse",
    "id": "FR-68224",
    "name": "Mulhouse",
    "subdivision": "Haut-Rhin",
    "country": "France",
    "population": 104978,
    "nearbyTotal": 1446,
    "nearby": [
      {
        "name": "Wittenheim",
        "km": 6.7,
        "slug": null
      },
      {
        "name": "Saint-Louis",
        "km": 24,
        "slug": null
      },
      {
        "name": "Allschwil",
        "km": 28,
        "slug": null
      },
      {
        "name": "Basel",
        "km": 30,
        "slug": null
      },
      {
        "name": "Binningen",
        "km": 30,
        "slug": null
      },
      {
        "name": "Riehen",
        "km": 31,
        "slug": null
      },
      {
        "name": "Reinach",
        "km": 35,
        "slug": null
      },
      {
        "name": "Muttenz",
        "km": 35,
        "slug": null
      },
      {
        "name": "Pratteln",
        "km": 38,
        "slug": null
      },
      {
        "name": "Belfort",
        "km": 38,
        "slug": null
      }
    ]
  },
  {
    "slug": "nancy",
    "id": "FR-54395",
    "name": "Nancy",
    "subdivision": "Meurthe-et-Moselle",
    "country": "France",
    "population": 103671,
    "nearbyTotal": 1829,
    "nearby": [
      {
        "name": "Vandœuvre-lès-Nancy",
        "km": 3.3,
        "slug": null
      },
      {
        "name": "Toul",
        "km": 20,
        "slug": null
      },
      {
        "name": "Lunéville",
        "km": 27,
        "slug": null
      },
      {
        "name": "Montigny-lès-Metz",
        "km": 45,
        "slug": null
      },
      {
        "name": "Metz",
        "km": 46,
        "slug": "metz"
      },
      {
        "name": "Épinal",
        "km": 63,
        "slug": null
      },
      {
        "name": "Saint-Dié-des-Vosges",
        "km": 71,
        "slug": null
      },
      {
        "name": "Hayange",
        "km": 72,
        "slug": null
      },
      {
        "name": "Yutz",
        "km": 74,
        "slug": null
      }
    ]
  },
  {
    "slug": "mons",
    "id": "BE-2790871",
    "name": "Mons",
    "subdivision": "province de Hainaut",
    "country": "Belgique",
    "population": 95613,
    "nearbyTotal": 994,
    "nearby": [
      {
        "name": "Quaregnon",
        "km": 6.1,
        "slug": null
      },
      {
        "name": "Frameries",
        "km": 6.7,
        "slug": null
      },
      {
        "name": "Colfontaine",
        "km": 8.4,
        "slug": null
      },
      {
        "name": "Saint-Ghislain",
        "km": 9.3,
        "slug": null
      },
      {
        "name": "Boussu",
        "km": 11,
        "slug": null
      },
      {
        "name": "Soignies",
        "km": 14,
        "slug": null
      },
      {
        "name": "Dour",
        "km": 14,
        "slug": null
      },
      {
        "name": "La Louvière",
        "km": 15,
        "slug": "la-louviere"
      },
      {
        "name": "Binche",
        "km": 16,
        "slug": null
      },
      {
        "name": "Maubeuge",
        "km": 19,
        "slug": null
      }
    ]
  },
  {
    "slug": "la-louviere",
    "id": "BE-2793509",
    "name": "La Louvière",
    "subdivision": "province de Hainaut",
    "country": "Belgique",
    "population": 78233,
    "nearbyTotal": 819,
    "nearby": [
      {
        "name": "Morlanwelz",
        "km": 6,
        "slug": null
      },
      {
        "name": "Manage",
        "km": 6.4,
        "slug": null
      },
      {
        "name": "Binche",
        "km": 6.4,
        "slug": null
      },
      {
        "name": "Soignies",
        "km": 13,
        "slug": null
      },
      {
        "name": "Fontaine-L'Eveque",
        "km": 14,
        "slug": null
      },
      {
        "name": "Mons",
        "km": 15,
        "slug": "mons"
      },
      {
        "name": "Braine-Le-Comte",
        "km": 15,
        "slug": null
      },
      {
        "name": "Pont-A-Celles",
        "km": 15,
        "slug": null
      },
      {
        "name": "Courcelles",
        "km": 15,
        "slug": null
      },
      {
        "name": "Nivelles",
        "km": 18,
        "slug": null
      }
    ]
  },
  {
    "slug": "tournai",
    "id": "BE-2785342",
    "name": "Tournai",
    "subdivision": "province de Hainaut",
    "country": "Belgique",
    "population": 69370,
    "nearbyTotal": 1214,
    "nearby": [
      {
        "name": "Hem",
        "km": 17,
        "slug": null
      },
      {
        "name": "Péruwelz",
        "km": 17,
        "slug": null
      },
      {
        "name": "Wattrelos",
        "km": 18,
        "slug": null
      },
      {
        "name": "Villeneuve-d'Ascq",
        "km": 18,
        "slug": null
      },
      {
        "name": "Roubaix",
        "km": 18,
        "slug": null
      },
      {
        "name": "Zwevegem",
        "km": 19,
        "slug": null
      },
      {
        "name": "Mouscron",
        "km": 19,
        "slug": "mouscron"
      },
      {
        "name": "Ronse",
        "km": 20,
        "slug": null
      },
      {
        "name": "Croix",
        "km": 20,
        "slug": null
      },
      {
        "name": "Saint-Amand-les-Eaux",
        "km": 20,
        "slug": null
      }
    ]
  },
  {
    "slug": "seraing",
    "id": "BE-2786825",
    "name": "Seraing",
    "subdivision": "province de Liège",
    "country": "Belgique",
    "population": 64259,
    "nearbyTotal": 240,
    "nearby": [
      {
        "name": "Saint-Nicolas",
        "km": 4.4,
        "slug": null
      },
      {
        "name": "Flemalle",
        "km": 5.5,
        "slug": null
      },
      {
        "name": "Grace-Hollogne",
        "km": 5.7,
        "slug": null
      },
      {
        "name": "Liège",
        "km": 6.9,
        "slug": "liege"
      },
      {
        "name": "Ans",
        "km": 8,
        "slug": null
      },
      {
        "name": "Chaudfontaine",
        "km": 8.2,
        "slug": null
      },
      {
        "name": "Herstal",
        "km": 11,
        "slug": null
      },
      {
        "name": "Fleron",
        "km": 12,
        "slug": null
      },
      {
        "name": "Oupeye",
        "km": 16,
        "slug": null
      },
      {
        "name": "Soumagne",
        "km": 16,
        "slug": null
      }
    ]
  },
  {
    "slug": "verviers",
    "id": "BE-2784822",
    "name": "Verviers",
    "subdivision": "province de Liège",
    "country": "Belgique",
    "population": 55207,
    "nearbyTotal": 173,
    "nearby": [
      {
        "name": "Dison",
        "km": 3,
        "slug": null
      },
      {
        "name": "Herve",
        "km": 8,
        "slug": null
      },
      {
        "name": "Soumagne",
        "km": 8.9,
        "slug": null
      },
      {
        "name": "Eupen",
        "km": 13,
        "slug": null
      },
      {
        "name": "Fleron",
        "km": 13,
        "slug": null
      },
      {
        "name": "Chaudfontaine",
        "km": 16,
        "slug": null
      },
      {
        "name": "Herstal",
        "km": 19,
        "slug": null
      },
      {
        "name": "Liège",
        "km": 19,
        "slug": "liege"
      },
      {
        "name": "Vise",
        "km": 21,
        "slug": null
      },
      {
        "name": "Oupeye",
        "km": 21,
        "slug": null
      }
    ]
  },
  {
    "slug": "mouscron",
    "id": "BE-2795937",
    "name": "Mouscron",
    "subdivision": "province de Hainaut",
    "country": "Belgique",
    "population": 55202,
    "nearbyTotal": 1154,
    "nearby": [
      {
        "name": "Wattrelos",
        "km": 2.3,
        "slug": null
      },
      {
        "name": "Tourcoing",
        "km": 4.4,
        "slug": null
      },
      {
        "name": "Roubaix",
        "km": 5.5,
        "slug": null
      },
      {
        "name": "Menen",
        "km": 7.6,
        "slug": null
      },
      {
        "name": "Croix",
        "km": 7.8,
        "slug": null
      },
      {
        "name": "Halluin",
        "km": 8,
        "slug": null
      },
      {
        "name": "Hem",
        "km": 9.1,
        "slug": null
      },
      {
        "name": "Wasquehal",
        "km": 9.1,
        "slug": null
      },
      {
        "name": "Marcq-en-Barœul",
        "km": 10,
        "slug": null
      },
      {
        "name": "Kortrijk",
        "km": 11,
        "slug": null
      }
    ]
  },
  {
    "slug": "neuchatel",
    "id": "CH-7286622",
    "name": "Neuchâtel",
    "subdivision": "canton de Neuchâtel",
    "country": "Suisse",
    "population": 44588,
    "nearbyTotal": 1606,
    "nearby": [
      {
        "name": "Val-de-Ruz",
        "km": 5.9,
        "slug": null
      },
      {
        "name": "La Chaux-de-Fonds",
        "km": 14,
        "slug": "la-chaux-de-fonds"
      },
      {
        "name": "Fribourg",
        "km": 28,
        "slug": "fribourg"
      },
      {
        "name": "Biel/Bienne",
        "km": 29,
        "slug": null
      },
      {
        "name": "Lyss",
        "km": 30,
        "slug": null
      },
      {
        "name": "Yverdon-les-Bains",
        "km": 35,
        "slug": "yverdon-les-bains"
      },
      {
        "name": "Bern/Berne/Berna",
        "km": 36,
        "slug": null
      },
      {
        "name": "Köniz",
        "km": 37,
        "slug": null
      },
      {
        "name": "Grenchen",
        "km": 40,
        "slug": null
      },
      {
        "name": "Ostermundigen",
        "km": 43,
        "slug": null
      }
    ]
  },
  {
    "slug": "fribourg",
    "id": "CH-7285870",
    "name": "Fribourg",
    "subdivision": "canton de Fribourg",
    "country": "Suisse",
    "population": 38197,
    "nearbyTotal": 1188,
    "nearby": [
      {
        "name": "Köniz",
        "km": 21,
        "slug": null
      },
      {
        "name": "Bulle",
        "km": 24,
        "slug": null
      },
      {
        "name": "Bern/Berne/Berna",
        "km": 25,
        "slug": null
      },
      {
        "name": "Neuchâtel",
        "km": 28,
        "slug": "neuchatel"
      },
      {
        "name": "Ostermundigen",
        "km": 31,
        "slug": null
      },
      {
        "name": "Lyss",
        "km": 33,
        "slug": null
      },
      {
        "name": "Val-de-Ruz",
        "km": 34,
        "slug": null
      },
      {
        "name": "Thun",
        "km": 36,
        "slug": null
      },
      {
        "name": "Steffisburg",
        "km": 36,
        "slug": null
      },
      {
        "name": "Biel/Bienne",
        "km": 39,
        "slug": null
      }
    ]
  },
  {
    "slug": "la-chaux-de-fonds",
    "id": "CH-7286240",
    "name": "La Chaux-de-Fonds",
    "subdivision": "canton de Neuchâtel",
    "country": "Suisse",
    "population": 37494,
    "nearbyTotal": 1784,
    "nearby": [
      {
        "name": "Val-de-Ruz",
        "km": 8.2,
        "slug": null
      },
      {
        "name": "Neuchâtel",
        "km": 14,
        "slug": "neuchatel"
      },
      {
        "name": "Biel/Bienne",
        "km": 33,
        "slug": null
      },
      {
        "name": "Lyss",
        "km": 37,
        "slug": null
      },
      {
        "name": "Yverdon-les-Bains",
        "km": 40,
        "slug": "yverdon-les-bains"
      },
      {
        "name": "Pontarlier",
        "km": 41,
        "slug": null
      },
      {
        "name": "Fribourg",
        "km": 42,
        "slug": "fribourg"
      },
      {
        "name": "Grenchen",
        "km": 43,
        "slug": null
      },
      {
        "name": "Montbéliard",
        "km": 45,
        "slug": null
      },
      {
        "name": "Bern/Berne/Berna",
        "km": 47,
        "slug": null
      }
    ]
  },
  {
    "slug": "sion",
    "id": "CH-7287176",
    "name": "Sion",
    "subdivision": "canton du Valais",
    "country": "Suisse",
    "population": 34710,
    "nearbyTotal": 533,
    "nearby": [
      {
        "name": "Sierre",
        "km": 13,
        "slug": null
      },
      {
        "name": "Martigny",
        "km": 26,
        "slug": "martigny"
      },
      {
        "name": "Monthey",
        "km": 32,
        "slug": null
      },
      {
        "name": "Montreux",
        "km": 41,
        "slug": "montreux"
      },
      {
        "name": "Vevey",
        "km": 48,
        "slug": "vevey"
      },
      {
        "name": "Bulle",
        "km": 49,
        "slug": null
      },
      {
        "name": "Thun",
        "km": 61,
        "slug": null
      },
      {
        "name": "Pully",
        "km": 62,
        "slug": null
      },
      {
        "name": "Cluses",
        "km": 64,
        "slug": null
      },
      {
        "name": "Steffisburg",
        "km": 65,
        "slug": null
      }
    ]
  },
  {
    "slug": "monaco",
    "id": "MC-2993458",
    "name": "Monaco",
    "subdivision": null,
    "country": "Monaco",
    "population": 32965,
    "nearbyTotal": 217,
    "nearby": [
      {
        "name": "Monte-Carlo",
        "km": 0.5,
        "slug": null
      },
      {
        "name": "Menton",
        "km": 9,
        "slug": null
      },
      {
        "name": "Nice",
        "km": 14,
        "slug": "nice"
      },
      {
        "name": "Saint-Laurent-du-Var",
        "km": 20,
        "slug": null
      },
      {
        "name": "Cagnes-sur-Mer",
        "km": 23,
        "slug": null
      },
      {
        "name": "Vence",
        "km": 26,
        "slug": null
      },
      {
        "name": "Villeneuve-Loubet",
        "km": 28,
        "slug": null
      },
      {
        "name": "Antibes",
        "km": 31,
        "slug": null
      },
      {
        "name": "Vallauris",
        "km": 34,
        "slug": null
      },
      {
        "name": "Mougins",
        "km": 37,
        "slug": null
      }
    ]
  },
  {
    "slug": "yverdon-les-bains",
    "id": "CH-7287620",
    "name": "Yverdon-les-Bains",
    "subdivision": "canton de Vaud",
    "country": "Suisse",
    "population": 30156,
    "nearbyTotal": 1395,
    "nearby": [
      {
        "name": "Pontarlier",
        "km": 25,
        "slug": null
      },
      {
        "name": "Renens",
        "km": 27,
        "slug": null
      },
      {
        "name": "Lausanne",
        "km": 28,
        "slug": "lausanne"
      },
      {
        "name": "Pully",
        "km": 28,
        "slug": null
      },
      {
        "name": "Morges",
        "km": 31,
        "slug": null
      },
      {
        "name": "Neuchâtel",
        "km": 35,
        "slug": "neuchatel"
      },
      {
        "name": "Bulle",
        "km": 36,
        "slug": null
      },
      {
        "name": "Vevey",
        "km": 38,
        "slug": "vevey"
      },
      {
        "name": "Val-de-Ruz",
        "km": 38,
        "slug": null
      },
      {
        "name": "Fribourg",
        "km": 40,
        "slug": "fribourg"
      }
    ]
  },
  {
    "slug": "montreux",
    "id": "CH-7286542",
    "name": "Montreux",
    "subdivision": "canton de Vaud",
    "country": "Suisse",
    "population": 25984,
    "nearbyTotal": 972,
    "nearby": [
      {
        "name": "Vevey",
        "km": 7.2,
        "slug": "vevey"
      },
      {
        "name": "Bulle",
        "km": 19,
        "slug": null
      },
      {
        "name": "Pully",
        "km": 22,
        "slug": null
      },
      {
        "name": "Monthey",
        "km": 23,
        "slug": null
      },
      {
        "name": "Lausanne",
        "km": 25,
        "slug": "lausanne"
      },
      {
        "name": "Renens",
        "km": 28,
        "slug": null
      },
      {
        "name": "Morges",
        "km": 35,
        "slug": null
      },
      {
        "name": "Thonon-les-Bains",
        "km": 37,
        "slug": null
      },
      {
        "name": "Martigny",
        "km": 40,
        "slug": "martigny"
      },
      {
        "name": "Sion",
        "km": 41,
        "slug": "sion"
      }
    ]
  },
  {
    "slug": "nyon",
    "id": "CH-7286671",
    "name": "Nyon",
    "subdivision": "canton de Vaud",
    "country": "Suisse",
    "population": 21452,
    "nearbyTotal": 1316,
    "nearby": [
      {
        "name": "Thonon-les-Bains",
        "km": 19,
        "slug": null
      },
      {
        "name": "Meyrin",
        "km": 21,
        "slug": null
      },
      {
        "name": "Genève",
        "km": 21,
        "slug": "geneve"
      },
      {
        "name": "Vernier",
        "km": 22,
        "slug": null
      },
      {
        "name": "Annemasse",
        "km": 22,
        "slug": null
      },
      {
        "name": "Lancy",
        "km": 23,
        "slug": null
      },
      {
        "name": "Carouge",
        "km": 24,
        "slug": null
      },
      {
        "name": "Onex",
        "km": 24,
        "slug": null
      },
      {
        "name": "Morges",
        "km": 25,
        "slug": null
      },
      {
        "name": "Saint-Julien-en-Genevois",
        "km": 30,
        "slug": null
      }
    ]
  },
  {
    "slug": "martigny",
    "id": "CH-7286444",
    "name": "Martigny",
    "subdivision": "canton du Valais",
    "country": "Suisse",
    "population": 20210,
    "nearbyTotal": 619,
    "nearby": [
      {
        "name": "Monthey",
        "km": 18,
        "slug": null
      },
      {
        "name": "Sion",
        "km": 26,
        "slug": "sion"
      },
      {
        "name": "Sierre",
        "km": 38,
        "slug": null
      },
      {
        "name": "Cluses",
        "km": 39,
        "slug": null
      },
      {
        "name": "Montreux",
        "km": 40,
        "slug": "montreux"
      },
      {
        "name": "Sallanches",
        "km": 42,
        "slug": null
      },
      {
        "name": "Vevey",
        "km": 44,
        "slug": "vevey"
      },
      {
        "name": "Thonon-les-Bains",
        "km": 55,
        "slug": null
      },
      {
        "name": "Bulle",
        "km": 56,
        "slug": null
      },
      {
        "name": "Pully",
        "km": 56,
        "slug": null
      }
    ]
  },
  {
    "slug": "vevey",
    "id": "CH-7287444",
    "name": "Vevey",
    "subdivision": "canton de Vaud",
    "country": "Suisse",
    "population": 19824,
    "nearbyTotal": 1009,
    "nearby": [
      {
        "name": "Montreux",
        "km": 7.2,
        "slug": "montreux"
      },
      {
        "name": "Pully",
        "km": 15,
        "slug": null
      },
      {
        "name": "Lausanne",
        "km": 18,
        "slug": "lausanne"
      },
      {
        "name": "Renens",
        "km": 21,
        "slug": null
      },
      {
        "name": "Bulle",
        "km": 22,
        "slug": null
      },
      {
        "name": "Monthey",
        "km": 26,
        "slug": null
      },
      {
        "name": "Morges",
        "km": 28,
        "slug": null
      },
      {
        "name": "Thonon-les-Bains",
        "km": 30,
        "slug": null
      },
      {
        "name": "Yverdon-les-Bains",
        "km": 38,
        "slug": "yverdon-les-bains"
      },
      {
        "name": "Martigny",
        "km": 44,
        "slug": "martigny"
      }
    ]
  },
  {
    "slug": "delemont",
    "id": "CH-7285633",
    "name": "Delémont",
    "subdivision": "canton du Jura",
    "country": "Suisse",
    "population": 12566,
    "nearbyTotal": 1606,
    "nearby": [
      {
        "name": "Grenchen",
        "km": 20,
        "slug": null
      },
      {
        "name": "Reinach",
        "km": 24,
        "slug": null
      },
      {
        "name": "Solothurn",
        "km": 24,
        "slug": null
      },
      {
        "name": "Allschwil",
        "km": 24,
        "slug": null
      },
      {
        "name": "Binningen",
        "km": 25,
        "slug": null
      },
      {
        "name": "Biel/Bienne",
        "km": 26,
        "slug": null
      },
      {
        "name": "Basel",
        "km": 28,
        "slug": null
      },
      {
        "name": "Muttenz",
        "km": 29,
        "slug": null
      },
      {
        "name": "Saint-Louis",
        "km": 29,
        "slug": null
      },
      {
        "name": "Pratteln",
        "km": 31,
        "slug": null
      }
    ]
  },
  {
    "slug": "esch-sur-alzette",
    "id": "LU-6693269",
    "name": "Esch-sur-Alzette",
    "subdivision": null,
    "country": "Luxembourg",
    "population": 0,
    "nearbyTotal": 1052,
    "nearby": [
      {
        "name": "Sanem",
        "km": 5.2,
        "slug": null
      },
      {
        "name": "Dudelange",
        "km": 7.9,
        "slug": null
      },
      {
        "name": "Pétange",
        "km": 11,
        "slug": null
      },
      {
        "name": "Longwy",
        "km": 16,
        "slug": null
      },
      {
        "name": "Aubange",
        "km": 16,
        "slug": null
      },
      {
        "name": "Ville de Luxembourg",
        "km": 17,
        "slug": "luxembourg"
      },
      {
        "name": "Thionville",
        "km": 18,
        "slug": null
      },
      {
        "name": "Hayange",
        "km": 19,
        "slug": null
      },
      {
        "name": "Yutz",
        "km": 22,
        "slug": null
      },
      {
        "name": "Arlon",
        "km": 24,
        "slug": null
      }
    ]
  }
];

export const CITY_BY_SLUG: Map<string, SeoCity> = new Map(SEO_CITIES.map((c) => [c.slug, c]));

/** `/tchat/nancy` -> la ville, ou null : sert de garde de routage côté client. */
export function cityFromPath(pathname: string): SeoCity | null {
  const match = /^\/tchat\/([a-z0-9-]+)$/.exec(pathname.replace(/\/+$/, ''));
  return match ? CITY_BY_SLUG.get(match[1]) ?? null : null;
}
