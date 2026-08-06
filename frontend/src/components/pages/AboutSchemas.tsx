import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../ui';

/* =======================================================================
 * Planches schématiques de la page « En savoir plus ».
 * Trait fin, accent bleu, maille pointillée légère : des figures sobres
 * qui prolongent le langage visuel du reste du site.
 * ===================================================================== */

/* ---- Hooks ------------------------------------------------------------- */

/** Révèle l'élément quand il entre dans le viewport (pose la classe « in »). */
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) {
      el.classList.add('in');
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            el.classList.add('in');
            io.unobserve(el);
          }
        });
      },
      { threshold: 0.16, rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return reduced;
}

/* ---- Cadre commun : une « planche » numérotée ------------------------- */

function SchemaPlate({
  n,
  title,
  legend,
  children,
}: {
  n: number;
  title: string;
  legend: ReactNode;
  children: ReactNode;
}) {
  const ref = useReveal<HTMLElement>();
  return (
    <figure ref={ref} className="reveal mt-6 overflow-hidden rounded-2xl border border-line bg-card">
      <div className="flex items-center gap-2 border-b border-line bg-paper-2 px-4 py-3">
        <span className="chip chip-blue">
          <Icon name="hash" size={11} /> Schéma {n}
        </span>
        <span className="font-display text-[15px] font-semibold">{title}</span>
      </div>
      <div className="schema-grid px-4 py-7 sm:px-6">{children}</div>
      <figcaption className="border-t border-line px-4 py-2.5 text-[12px] leading-snug text-muted">{legend}</figcaption>
    </figure>
  );
}

/* ---- Briques partagées ------------------------------------------------- */

type Tone = 'blue' | 'ok' | 'bad' | 'neutral';

function accentOf(tone: Tone) {
  switch (tone) {
    case 'blue':
      return { color: 'var(--color-blue)', bg: 'var(--color-blue-tint)' };
    case 'ok':
      return { color: 'var(--color-verified)', bg: 'var(--color-verified-tint)' };
    case 'bad':
      return { color: 'var(--color-danger)', bg: 'var(--color-danger-tint)' };
    default:
      return { color: 'var(--color-faint)', bg: 'var(--color-paper-2)' };
  }
}

function NodeBox({
  icon,
  kicker,
  title,
  tone = 'neutral',
  dashed = false,
  children,
}: {
  icon: string;
  kicker: string;
  title: string;
  tone?: Tone;
  dashed?: boolean;
  children: ReactNode;
}) {
  const a = accentOf(tone);
  return (
    <div className={`flex-1 rounded-xl border bg-card p-3.5 ${dashed ? 'border-dashed border-line-strong' : 'border-line'}`}>
      <div className="mb-2 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ color: a.color, background: a.bg }}>
          <Icon name={icon} size={16} />
        </span>
        <span className="text-[10px] font-semibold" style={{ color: a.color }}>
          {kicker}
        </span>
      </div>
      <div className="font-display text-[14px] font-semibold leading-tight text-ink">{title}</div>
      <p className="mt-1 text-[12.5px] leading-snug text-muted">{children}</p>
    </div>
  );
}

/** Connecteur fléché : horizontal sur desktop, vertical (empilé) sur mobile. */
function Flow({ label, dir = 'right', tone = 'neutral' }: { label?: string; dir?: 'right' | 'left'; tone?: 'neutral' | 'blue' }) {
  const stroke = tone === 'blue' ? 'var(--color-blue)' : 'var(--color-line-strong)';
  const rot = dir === 'left' ? '-rotate-90 sm:rotate-180' : 'rotate-90 sm:rotate-0';
  return (
    <div className="flex shrink-0 flex-col items-center justify-center gap-1 self-center py-0.5">
      <svg className={rot} width="38" height="20" viewBox="0 0 38 20" fill="none" aria-hidden="true">
        <line x1="3" y1="10" x2="30" y2="10" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeDasharray="4 5" className="dash-flow" />
        <path d="M27 5l7 5-7 5" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label && <span className="text-[10px] font-medium text-faint">{label}</span>}
    </div>
  );
}

/* =======================================================================
 * Schéma 1 — Cycle de vie éphémère d'une session
 * ===================================================================== */

export function EphemeralSchema() {
  return (
    <SchemaPlate
      n={1}
      title="Le cycle de vie d'une session"
      legend={
        <>
          Tout vit en <strong className="font-semibold text-ink">mémoire vive</strong>. À la fermeture de l'onglet, la fiche et les
          conversations disparaissent&nbsp;: rien n'a jamais été écrit sur disque.
        </>
      }
    >
      <div className="flex flex-col items-stretch gap-2 sm:flex-row">
        <NodeBox icon="info" tone="blue" kicker="01 · Entrée" title="Une fiche en RAM">
          Pseudo, âge et ville forment une fiche, créée en mémoire vive.
        </NodeBox>
        <Flow label="en RAM" tone="blue" />
        <NodeBox icon="clock" tone="blue" kicker="02 · Visite" title="Minuterie TTL">
          Prolongée en continu tant que votre onglet reste ouvert.
        </NodeBox>
        <Flow label="fermeture" />
        <NodeBox icon="close" tone="bad" kicker="03 · Sortie" title="Effacement">
          La minuterie expire&nbsp;: la fiche est détruite, sans trace.
        </NodeBox>
      </div>

      {/* Sol : le disque, jamais sollicité. */}
      <div className="hatch mt-4 flex items-center gap-2.5 rounded-xl border border-dashed border-line-strong px-3.5 py-2.5">
        <span className="grid h-7 w-7 shrink-0 place-items-center text-danger">
          <DiskGlyph />
        </span>
        <span className="text-[11px] font-medium text-faint">
          Disque · stockage permanent — <span className="text-danger">aucune écriture</span>
        </span>
      </div>
    </SchemaPlate>
  );
}

/* =======================================================================
 * Schéma 2 — Périmètre de proximité (radar 75 km)
 * ===================================================================== */

export function ProximitySchema() {
  const reduced = usePrefersReducedMotion();
  // Centre du radar et rayons (104 = limite des 75 km).
  const cx = 134;
  const cy = 150;
  const R = 104;
  // Nancy : à l'intérieur du rayon. Marseille : au-delà.
  const nancy = { x: 184, y: 112 };
  const mars = { x: 286, y: 206 };
  const edge = pointOnSegment(cx, cy, mars.x, mars.y, R); // intersection ligne/anneau

  return (
    <SchemaPlate
      n={2}
      title="« Autour de vous », sans GPS"
      legend={
        <>
          La ville que vous déclarez est convertie <strong className="font-semibold text-ink">hors-ligne</strong> en coordonnées
          approximatives. On vous relie aux villes situées dans un rayon d'environ&nbsp;75&nbsp;km — votre position exacte n'est jamais
          demandée.
        </>
      }
    >
      <svg viewBox="0 0 460 300" className="mx-auto block h-auto w-full" style={{ maxWidth: 460 }} role="img" aria-label="Radar de proximité : Nancy à l'intérieur du rayon de 75 km, Marseille au-delà.">
        {/* Croix de visée */}
        <line x1={cx - 128} y1={cy} x2={cx + 128} y2={cy} stroke="var(--color-line)" strokeWidth="1" />
        <line x1={cx} y1={cy - 128} x2={cx} y2={cy + 128} stroke="var(--color-line)" strokeWidth="1" />

        {/* Anneaux concentriques */}
        <circle cx={cx} cy={cy} r="40" fill="none" stroke="var(--color-line)" strokeWidth="1" />
        <circle cx={cx} cy={cy} r="72" fill="none" stroke="var(--color-line)" strokeWidth="1" />
        {/* Anneau « 75 km » : zone de portée */}
        <circle cx={cx} cy={cy} r={R} fill="color-mix(in srgb, var(--color-blue) 5%, transparent)" stroke="var(--color-blue)" strokeWidth="1.6" strokeDasharray="2 4" />

        {/* Ping radar (désactivé si mouvement réduit) */}
        {!reduced && (
          <circle cx={cx} cy={cy} r="16" fill="none" stroke="var(--color-blue)" strokeWidth="1.4">
            <animate attributeName="r" values="14;104" dur="3.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.5;0" dur="3.4s" repeatCount="indefinite" />
          </circle>
        )}

        {/* Étiquette du rayon */}
        <text x={cx} y={cy - R - 9} textAnchor="middle" fontFamily="var(--font-sans)" fontSize="11" letterSpacing="0.06em" fill="var(--color-blue)">
          RAYON ≈ 75 km
        </text>

        {/* Liaison vers Nancy (à portée) */}
        <line x1={cx} y1={cy} x2={nancy.x} y2={nancy.y} stroke="var(--color-verified)" strokeWidth="1.6" />
        <circle cx={nancy.x} cy={nancy.y} r="5.5" fill="var(--color-verified)" />
        <text x={nancy.x + 11} y={nancy.y - 4} fontFamily="var(--font-sans)" fontSize="11.5" fill="var(--color-ink)">
          Nancy
        </text>
        <text x={nancy.x + 11} y={nancy.y + 10} fontFamily="var(--font-sans)" fontSize="9.5" fill="var(--color-verified)">
          ~50 km · à portée
        </text>

        {/* Liaison vers Marseille (coupée à l'anneau) */}
        <line x1={cx} y1={cy} x2={edge.x} y2={edge.y} stroke="var(--color-faint)" strokeWidth="1.4" strokeDasharray="3 4" opacity="0.7" />
        <g stroke="var(--color-danger)" strokeWidth="1.6" strokeLinecap="round">
          <line x1={edge.x - 4} y1={edge.y - 4} x2={edge.x + 4} y2={edge.y + 4} />
          <line x1={edge.x + 4} y1={edge.y - 4} x2={edge.x - 4} y2={edge.y + 4} />
        </g>
        <circle cx={mars.x} cy={mars.y} r="5" fill="none" stroke="var(--color-faint)" strokeWidth="1.6" />
        <text x={mars.x + 11} y={mars.y - 4} fontFamily="var(--font-sans)" fontSize="11.5" fill="var(--color-muted)">
          Marseille
        </text>
        <text x={mars.x + 11} y={mars.y + 10} fontFamily="var(--font-sans)" fontSize="9.5" fill="var(--color-faint)">
          ~600 km · hors zone
        </text>

        {/* Vous, au centre */}
        <circle cx={cx} cy={cy} r="9" fill="var(--color-blue)" />
        <circle cx={cx} cy={cy} r="3" fill="var(--color-card)" />
        <text x={cx} y={cy + 26} textAnchor="middle" fontFamily="var(--font-sans)" fontSize="10.5" letterSpacing="0.04em" fill="var(--color-blue)">
          VOUS · Metz
        </text>
      </svg>
    </SchemaPlate>
  );
}

/** Point sur le segment (ax,ay)→(bx,by) à distance d de (ax,ay). */
function pointOnSegment(ax: number, ay: number, bx: number, by: number, d: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  return { x: ax + (dx / len) * d, y: ay + (dy / len) * d };
}

/* =======================================================================
 * Schéma 3 — Clé publique / clé privée
 * ===================================================================== */

export function KeySchema() {
  return (
    <SchemaPlate
      n={3}
      title="Une clé ferme, l'autre ouvre"
      legend={
        <>
          La clé publique <strong className="font-semibold text-ink">verrouille</strong> mais ne déverrouille pas. Seule la clé privée —
          qui ne quitte jamais votre navigateur — ouvre le coffre.
        </>
      }
    >
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center">
        <KeyCard tone="neutral" name="Clé publique" sub="publiée · partagée" note="ne sait que verrouiller" />
        <Flow label="ferme" dir="right" />
        <CofferGlyph />
        <Flow label="ouvre" dir="left" tone="blue" />
        <KeyCard tone="blue" name="Clé privée" sub="jamais transmise" note="seule à déverrouiller" />
      </div>

      <div className="mt-5 flex flex-wrap justify-center gap-1.5">
        <span className="chip">
          X25519 · échange de clés
        </span>
        <span className="chip">
          XSalsa20-Poly1305 · chiffrement authentifié
        </span>
      </div>
    </SchemaPlate>
  );
}

function KeyCard({ tone, name, sub, note }: { tone: Tone; name: string; sub: string; note: string }) {
  const a = accentOf(tone);
  return (
    <div className="flex-1 rounded-xl border border-line bg-card p-4 text-center sm:max-w-[176px]">
      <span className="mx-auto mb-2 grid h-11 w-11 place-items-center rounded-xl" style={{ color: a.color, background: a.bg }}>
        <Icon name="key" size={21} />
      </span>
      <div className="font-display text-[14.5px] font-semibold text-ink">{name}</div>
      <div className="mt-0.5 text-[10px] font-semibold" style={{ color: a.color }}>
        {sub}
      </div>
      <div className="mt-2 text-[12px] leading-snug text-muted">{note}</div>
    </div>
  );
}

function CofferGlyph() {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5 self-center">
      <svg width="76" height="76" viewBox="0 0 76 76" fill="none" aria-hidden="true">
        <path d="M28 28v-5a10 10 0 0 1 20 0v5" stroke="var(--color-blue)" strokeWidth="2.2" strokeLinecap="round" />
        <rect x="19" y="28" width="38" height="34" rx="6" fill="var(--color-blue-tint)" stroke="var(--color-blue)" strokeWidth="2" />
        <circle cx="38" cy="42" r="4.2" fill="var(--color-blue)" />
        <path d="M38 46v7" stroke="var(--color-blue)" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
      <span className="text-[10px] font-semibold text-blue">Coffre</span>
    </div>
  );
}

/* =======================================================================
 * Schéma 4 — Le déroulement, étape par étape
 * ===================================================================== */

const CIPHER_STEPS: { icon: string; tone: Tone; title: string; body: ReactNode }[] = [
  {
    icon: 'key',
    tone: 'blue',
    title: '1 · Génération des clés',
    body: (
      <>
        À l'ouverture de la session, votre navigateur fabrique une <strong className="text-ink">paire de clés</strong>{' '}
        liées entre elles&nbsp;: une publique, une privée.
      </>
    ),
  },
  {
    icon: 'send',
    tone: 'neutral',
    title: '2 · Publication de la clé publique',
    body: (
      <>
        La <strong className="text-ink">clé publique</strong> part vers le serveur pour qu'on puisse vous écrire. La{' '}
        <strong className="text-ink">clé privée</strong>, elle, ne quitte jamais l'appareil.
      </>
    ),
  },
  {
    icon: 'lock',
    tone: 'blue',
    title: '3 · Verrouillage',
    body: (
      <>
        Pour vous écrire, l'appareil d'en face combine <strong className="text-ink">sa clé privée</strong> et{' '}
        <strong className="text-ink">votre clé publique</strong>&nbsp;: il en tire un secret commun qui brouille et
        scelle le message.
      </>
    ),
  },
  {
    icon: 'radar',
    tone: 'bad',
    title: '4 · Relais aveugle',
    body: (
      <>
        Le serveur transmet le bloc chiffré au bon destinataire — <strong className="text-ink">sans jamais pouvoir
        l'ouvrir</strong>.
      </>
    ),
  },
  {
    icon: 'shield-check',
    tone: 'ok',
    title: '5 · Ouverture',
    body: (
      <>
        Votre appareil recalcule <strong className="text-ink">le même secret commun</strong> (votre clé privée + sa clé
        publique) et rétablit le message. Si un seul octet a été modifié en route, l'ouverture{' '}
        <strong className="text-ink">échoue</strong>.
      </>
    ),
  },
];

export function CipherFlowSchema() {
  return (
    <SchemaPlate
      n={4}
      title="Le déroulement, étape par étape"
      legend={
        <>
          Cinq étapes, deux appareils, un <strong className="font-semibold text-ink">secret commun</strong> qui n'est
          jamais transmis. Au milieu, le serveur ne voit passer qu'un bloc opaque.
        </>
      }
    >
      <ol className="flex flex-col">
        {CIPHER_STEPS.map((s, i) => (
          <TimelineStep key={s.title} icon={s.icon} tone={s.tone} title={s.title} last={i === CIPHER_STEPS.length - 1}>
            {s.body}
          </TimelineStep>
        ))}
      </ol>
    </SchemaPlate>
  );
}

function TimelineStep({
  icon,
  tone,
  title,
  last,
  children,
}: {
  icon: string;
  tone: Tone;
  title: string;
  last: boolean;
  children: ReactNode;
}) {
  const a = accentOf(tone);
  return (
    <li className="flex gap-3.5">
      {/* Rail vertical avec pastille */}
      <div className="flex flex-col items-center">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ color: a.color, background: a.bg }}>
          <Icon name={icon} size={16} />
        </span>
        {!last && <span className="my-1 w-px flex-1" style={{ background: 'var(--color-line-strong)' }} />}
      </div>
      {/* Contenu */}
      <div className={last ? '' : 'pb-5'}>
        <div className="font-display text-[14px] font-semibold leading-tight text-ink">{title}</div>
        <p className="mt-1 text-[12.5px] leading-snug text-muted">{children}</p>
      </div>
    </li>
  );
}

/* =======================================================================
 * Schéma 5 — Salons publics et privés
 * ===================================================================== */

export function RoomsSchema() {
  return (
    <SchemaPlate
      n={5}
      title="Salons publics et privés"
      legend={
        <>
          Trois portes, un seul régime&nbsp;: tous les salons sont{' '}
          <strong className="font-semibold text-ink">chiffrés de bout en bout</strong> — le serveur ne relaie que des
          enveloppes opaques, comme pour les&nbsp;MP. Ce qui change d'un type à l'autre, c'est la{' '}
          <strong className="font-semibold text-ink">porte</strong>, donc la façon d'obtenir la clé.
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <RoomCard
          tone="blue"
          icon="globe"
          title="Salon public"
          tag="Chiffré · clé de groupe"
          meta="Listé pour tout le monde, rejoint librement. Quiconque entre reçoit la clé des membres."
          access={<><Icon name="users" size={13} /> Accès ouvert</>}
        />
        <RoomCard
          tone="neutral"
          icon="key"
          title="Privé sur invitation"
          tag="Chiffré · clé de groupe"
          meta="S'ouvre par lien d'invitation. La clé est remise par les membres à l'arrivée."
          access={<><LinkGlyph /> Lien d'invitation</>}
        />
        <RoomCard
          tone="ok"
          icon="lock"
          title="Privé à mot de passe"
          tag="Chiffré · mot de passe"
          meta="Clé dérivée du mot de passe, que le serveur ne voit jamais."
          access={<><Icon name="lock" size={13} /> Mot de passe</>}
        />
      </div>

      {/* Règle de propriété */}
      <div className="mt-3 flex flex-col gap-2 rounded-xl border border-line bg-paper-2 p-3 sm:flex-row sm:items-center">
        <span className="chip chip-blue shrink-0">
          <Icon name="crown" size={11} /> Propriété
        </span>
        <div className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
          <span>Le créateur peut exclure ou fermer le salon.</span>
          <span className="text-faint">→</span>
          <span>S'il part, le plus ancien présent en hérite.</span>
          <span className="text-faint">→</span>
          <span className="text-danger">Un salon vide est supprimé aussitôt.</span>
        </div>
      </div>
    </SchemaPlate>
  );
}

function RoomCard({
  tone,
  icon,
  title,
  tag,
  meta,
  access,
}: {
  tone: Tone;
  icon: string;
  title: string;
  tag: string;
  meta: string;
  access: ReactNode;
}) {
  const a = accentOf(tone);
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-lg" style={{ color: a.color, background: a.bg }}>
          <Icon name={icon} size={17} />
        </span>
        <div>
          <div className="font-display text-[14.5px] font-semibold leading-tight text-ink">{title}</div>
          <div className="text-[10px] font-semibold" style={{ color: a.color }}>
            {tag}
          </div>
        </div>
      </div>

      {/* Membres figurés */}
      <div className="mb-3 flex items-center gap-1">
        {['--figure-1', '--figure-2', '--figure-3', '--figure-4'].map((c, i) => (
          <span key={c} className="h-5 w-5 rounded-md" style={{ background: `var(${c})`, opacity: 0.85 - i * 0.12 }} />
        ))}
        <span className="ml-1 text-[10px] text-faint">+ participants</span>
      </div>

      <p className="text-[12.5px] leading-snug text-muted">{meta}</p>
      <div className="mt-2.5 flex items-center gap-1.5 text-[10.5px] font-semibold" style={{ color: a.color }}>
        {access}
      </div>
    </div>
  );
}

/* ---- Glyphes locaux (hors jeu d'icônes partagé) ----------------------- */

function DiskGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
      <path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
      <path d="M4 4l16 16" />
    </svg>
  );
}

function LinkGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.5 14.5l5-5" />
      <path d="M8 11l-2 2a3 3 0 0 0 4.2 4.2l2-2" />
      <path d="M16 13l2-2a3 3 0 0 0-4.2-4.2l-2 2" />
    </svg>
  );
}
