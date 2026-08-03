import { type ReactNode } from 'react';


export function Lifeline({ items }: { items: { when: string; what: ReactNode }[] }) {
  return (
    <ol className="lifeline">
      {items.map((it, i) => (
        <li key={it.when} className="fade-up" style={{ animationDelay: `${230 + i * 70}ms` }}>
          <span className="lifeline__when">{it.when}</span>
          <p className="lifeline__what">{it.what}</p>
        </li>
      ))}
    </ol>
  );
}

/* -------------------------------------------------------------------------- */
/* Réseau vivant — nœuds reliés qui dérivent en fond, à peine visibles (le      */
/* texte de la page doit toujours gagner). Le curseur les attire, les allume et  */
/* tisse des liens vers eux : « les gens se rassemblent autour de vous ».        */
/*                                                                              */
/* Trois forces tiennent l'attroupement lisible : un cœur qui repousse (on se    */
/* rassemble autour de vous, pas dessus), une distance personnelle entre nœuds   */
/* (une foule, pas un pâté) et un ressort de rappel vers le point d'attache      */
/* (chacun repart chez lui — sinon le curseur finit par ramasser toute la        */
/* population en un seul tas). Canvas 2D.                                        */
/* -------------------------------------------------------------------------- */
// Exporté pour être réutilisé en fond de l'écran d'accueil (Conversation/EmptyState).
