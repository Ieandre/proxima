/* ---- Avatar déterministe (couleur + initiales dérivées de l'id) ---------- */
/* Teintes vives et variées : les avatars sont partout, c'est eux qui donnent sa
   couleur à l'interface. Toutes tiennent le contraste AA avec les initiales
   blanches (≥ 4,5:1), condition pour rester lisibles en 9 px. */
const PALETTE = ['#0f6fdb', '#6d28d9', '#b01f92', '#0e7c66', '#c2410c', '#0369a1', '#4f46e5', '#be123c'];

export function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function initials(pseudo: string): string {
  const parts = pseudo.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return pseudo.trim().slice(0, 2).toUpperCase();
}
