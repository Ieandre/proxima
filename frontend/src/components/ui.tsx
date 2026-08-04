import { useEffect, type ReactNode } from 'react';

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

export function Avatar({ id, pseudo, size = 38 }: { id: string; pseudo: string; size?: number }) {
  const c = avatarColor(id);
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(150deg, ${c}, color-mix(in srgb, ${c} 55%, #000))`,
        boxShadow: `0 6px 18px -8px ${c}88`,
      }}
    >
      {initials(pseudo)}
    </span>
  );
}

/* ---- Logo de marque ----------------------------------------------------- */
// Marque Proxima. `className` porte la taille/mise en page (ex. « h-9 w-9 »).
// Version vectorielle (1,5 Ko) : nette de 32 à 64 px comme sur écran Retina, là
// où le PNG pleine résolution coûtait 300 Ko à chaque visite. L'étoile centrale
// est un évidement — elle laisse voir le fond et suit donc le thème.
// `frontend/public/logo.svg` est généré par `scripts/build-brand-assets.js`.
export function Logo({ className = '' }: { className?: string }) {
  return (
    <img
      src="/logo.svg"
      alt="Proxima"
      className={`flex-none object-contain ${className}`}
    />
  );
}

/* ---- Modale ------------------------------------------------------------- */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      style={{ background: 'rgba(3,6,8,0.72)', backdropFilter: 'blur(6px)' }}
      onMouseDown={onClose}
    >
      <div
        className="panel fade-up w-full max-w-md p-5"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
          <button className="text-faint hover:text-ink transition-colors" onClick={onClose} aria-label="Fermer">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---- Icônes (SVG inline, trait courant) --------------------------------- */
const PATHS: Record<string, ReactNode> = {
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  users: (
    <>
      <path d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1" />
      <circle cx="9" cy="7" r="3.2" />
      <path d="M22 19v-1a4 4 0 0 0-3-3.8" />
      <path d="M16 4.2A3.2 3.2 0 0 1 16 11" />
    </>
  ),
  radar: (
    <>
      <path d="M19.07 4.93A10 10 0 1 0 22 12" />
      <path d="M12 12 19 5" />
      <circle cx="12" cy="12" r="1.6" />
      <path d="M12 12a6 6 0 1 0 6 6" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  send: <path d="M4 12 21 3l-6 18-4-7-7-2Z" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  crown: <path d="M3 8l4 5 5-8 5 8 4-5v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z" />,
  kick: (
    <>
      <circle cx="9" cy="7" r="3.2" />
      <path d="M3 19v-1a4 4 0 0 1 4-4h4" />
      <path d="M15 9l6 6m0-6-6 6" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="8" r="4" />
      <path d="M11 11l9 9M16 16l2-2M19 19l2-2" />
    </>
  ),
  back: <path d="M19 12H5m6-7-7 7 7 7" />,
  hash: <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />
    </>
  ),
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z" />,
  'shield-check': (
    <>
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-7-4.5-7-10a7 7 0 0 1 14 0c0 5.5-7 10-7 10Z" />
      <circle cx="12" cy="11" r="2.5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  check: <path d="M5 12l4.5 4.5L19 7" />,
  /* Copier. Distinct du trombone, qui dit « pièce jointe » partout ailleurs :
     deux glyphes pour deux gestes, sinon le vocabulaire visuel se brouille. */
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
    </>
  ),
  /* Ouvrir une conversation. Ni l'avion de papier (« envoyer ce message-ci, tout de
     suite ») ni le cadenas (« chiffré », partout ailleurs) : ce geste-là ouvre un
     fil, il lui faut son propre glyphe. */
  chat: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />,
  'eye-off': (
    <>
      <path d="M9.9 5A9.6 9.6 0 0 1 12 4.8c5 0 9 4 10 7.2a13 13 0 0 1-2.2 3.4M6.3 6.3C3.9 7.8 2.4 10 1.9 12c1 3.2 5 7.2 10 7.2a9.4 9.4 0 0 0 5.6-1.8" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m4 4 16 16" />
    </>
  ),
  arrowRight: <path d="M5 12h14m-6-6 6 6-6 6" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 7.5h.01" />
    </>
  ),
  paperclip: (
    <path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L10 17.4a1.7 1.7 0 0 1-2.3-2.3l7.8-7.8" />
  ),
  filter: <path d="M3 5h18l-7 8v6l-4-2v-4L3 5Z" />,
  logout: (
    <>
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
      <path d="M10 12H3m4-4-4 4 4 4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  dots: (
    <>
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </>
  ),
  pencil: (
    <>
      <path d="M4 20h4L19 9a2.6 2.6 0 0 0-3.7-3.7L4 16.4V20Z" />
      <path d="m14.5 6.8 2.7 2.7" />
    </>
  ),
  dice: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <circle cx="8.5" cy="8.5" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="15.5" cy="15.5" r="1.2" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.4v2.2M12 19.4v2.2M4.2 12H2M22 12h-2.2M6.5 6.5 4.9 4.9M19.1 19.1l-1.6-1.6M17.5 6.5l1.6-1.6M4.9 19.1l1.6-1.6" />
    </>
  ),
  moon: <path d="M20 14.2A8.4 8.4 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2Z" />,
  bell: (
    <>
      <path d="M18 9.5a6 6 0 0 0-12 0c0 4.5-2 6-2 6h16s-2-1.5-2-6Z" />
      <path d="M10.3 19.2a2.2 2.2 0 0 0 3.4 0" />
    </>
  ),
  'bell-off': (
    <>
      <path d="M18 9.5a6 6 0 0 0-12 0c0 4.5-2 6-2 6h16s-2-1.5-2-6Z" />
      <path d="M10.3 19.2a2.2 2.2 0 0 0 3.4 0" />
      <path d="M4 3.6 20 20.4" />
    </>
  ),
};

export function Icon({ name, size = 18 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name] ?? null}
    </svg>
  );
}

/* ---- Marque Discord ------------------------------------------------------ */
/* Hors du jeu d'icônes `Icon` : celui-ci est au trait (`fill="none"`), alors que
   la marque Discord est un glyphe plein — la passer au trait la rendrait
   méconnaissable. D'où un composant à part, en aplat de `currentColor`. */
export function DiscordGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.198.3728.2924a.077.077 0 0 1-.0066.1276 12.2986 12.2986 0 0 1-1.873.8914.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286ZM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189Zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
    </svg>
  );
}

/* ---- Marque GitHub ------------------------------------------------------- */
/* Même raison que `DiscordGlyph` : glyphe plein, incompatible avec le jeu au
   trait. Contrairement à Discord, il ne porte PAS de couleur de marque — la
   marque GitHub est achromatique, et le lien du code source appartient au
   registre factuel de l'encre, pas à un second accent. */
export function GitHubGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}
