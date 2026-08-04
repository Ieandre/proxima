import { useEffect, useState } from 'react';
import { useStore } from './store/useStore';
import { connect } from './lib/socket';
import { Onboarding } from './components/onboarding';
import { Chat } from './components/chat/Chat';
import { About } from './components/pages/About';
import { Legal, isLegalHash } from './components/pages/Legal';
import { isOnionOrigin } from './lib/onion';
import { armSound } from './lib/sound';

const ABOUT_HASH = '#en-savoir-plus';

export function App() {
  const status = useStore((s) => s.status);
  const toast = useStore((s) => s.toast);
  const hideToast = useStore((s) => s.hideToast);
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    connect();
  }, []);

  // Le son des notifications doit être déverrouillé par un geste (contrainte iOS) :
  // on prend le premier de la visite, quel qu'il soit.
  useEffect(() => armSound(), []);

  /**
   * Configuration publique (point de contact DSA + adresse onion), chargée UNE
   * fois pour toute l'application. Elle était lue séparément par `About` et
   * `Legal` ; le pied de page en ayant besoin à son tour — et étant monté sur deux
   * écrans — l'appel partait trois fois. Le store la distribue désormais.
   */
  useEffect(() => {
    let alive = true;
    fetch('/api/legal')
      .then((r) => r.json())
      .then((d) => alive && useStore.getState().setLegal(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (hash === ABOUT_HASH) return <About />;
  if (isLegalHash(hash)) return <Legal hash={hash} />;

  return (
    <>
      {status === 'connecting' && <Splash />}
      {(status === 'onboarding' || status === 'disconnected') && <Onboarding />}
      {status === 'live' && <Chat />}

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 fade-up px-4" onClick={hideToast}>
          <div
            className="panel flex items-center gap-2.5 px-4 py-2.5 text-sm"
            style={{
              borderColor:
                toast.tone === 'warn' ? 'color-mix(in srgb, var(--color-danger) 40%, transparent)' : undefined,
              color: toast.tone === 'warn' ? 'var(--color-danger)' : 'var(--color-ink)',
            }}
          >
            <span
              className="live-dot"
              style={{ background: toast.tone === 'warn' ? 'var(--color-danger)' : 'var(--color-verified)' }}
            />
            {toast.text}
          </div>
        </div>
      )}
    </>
  );
}

/* ==========================================================================
 * Écran d'attente, entre l'ouverture de la page et le socket établi.
 *
 * Il ne charge rien. Pendant ces quelques centaines de millisecondes,
 * libsodium se charge et une paire de clés X25519 est fabriquée SUR
 * L'APPAREIL, dont la moitié privée n'en sortira jamais (cf. lib/crypto.ts).
 * C'est le seul moment où le mécanisme central du produit se produit — d'où
 * un écran qui le nomme, plutôt qu'un « Connexion au service… » qui désignait
 * le système et pas la personne.
 *
 * La vraie contrainte est la durée, qui varie de deux ordres de grandeur :
 * ~400 ms sur le clearnet, mais jusqu'à une minute et demie sur l'onion à la
 * première résolution du descripteur (mesuré : 85 s). Un écran conçu pour le
 * cas rapide laisse l'utilisateur Tor devant une page qui paraît morte. D'où
 * la ligne d'explication qui n'apparaît qu'au-delà de SLOW_AFTER_MS, et qui
 * dit ce qui est vrai de l'accès emprunté.
 * ======================================================================== */

// L'alphabet dans lequel les clés de session et l'adresse .onion de ce service
// sont réellement écrites (base64url). Les glyphes qui défilent ci-dessous ne
// sont donc pas un motif décoratif : c'est la matière du sujet.
const KEY_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const KEY_SLOTS = 8;
const SETTLE_MS = 190; // un glyphe se fixe toutes les 190 ms
const CHURN_MS = 55; // les glyphes non fixés changent à ~18 Hz
const HOLD_MS = 850; // pause clé entière avant de recommencer
const SLOW_AFTER_MS = 4000;

const pick = () => KEY_ALPHABET[Math.floor(Math.random() * KEY_ALPHABET.length)];

/**
 * Clé qui se tire du hasard : les glyphes défilent et se fixent un par un, de
 * gauche à droite, puis le cycle reprend. Lent et interlettré à dessein — le
 * texte qui « scramble » est un cliché quand il est frénétique et vert sur
 * noir ; ralenti, en encre sur papier, il redevient de la typographie.
 *
 * `prefers-reduced-motion` est déjà neutralisé globalement pour les animations
 * CSS, mais celle-ci vit en JavaScript : elle doit se désarmer elle-même.
 */
function useKeyDraw(): { glyphs: string[]; settled: number } {
  const [state, setState] = useState(() => ({ glyphs: Array.from({ length: KEY_SLOTS }, pick), settled: 0 }));

  useEffect(() => {
    if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setState({ glyphs: Array.from({ length: KEY_SLOTS }, pick), settled: KEY_SLOTS });
      return;
    }
    let settled = 0;
    let sinceSettle = 0;
    const timer = setInterval(() => {
      sinceSettle += CHURN_MS;
      // Cycle terminé : on marque une pause, puis on repart d'une clé neuve.
      if (settled >= KEY_SLOTS) {
        if (sinceSettle < HOLD_MS) return;
        settled = 0;
        sinceSettle = 0;
      } else if (sinceSettle >= SETTLE_MS) {
        settled += 1;
        sinceSettle = 0;
      }
      const fixed = settled;
      setState((prev) => ({
        settled: fixed,
        // Seuls les glyphes non encore fixés changent : la partie gauche reste
        // stable, ce qui donne à voir une progression plutôt qu'un bruit.
        glyphs: prev.glyphs.map((g, i) => (i < fixed ? g : pick())),
      }));
    }, CHURN_MS);
    return () => clearInterval(timer);
  }, []);

  return state;
}

function Splash() {
  const { glyphs, settled } = useKeyDraw();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="splash">
      <div className="splash__inner">
        <p className="splash__key" aria-hidden="true">
          {glyphs.map((g, i) => (
            <span key={i} className={i < settled ? 'splash__glyph splash__glyph--set' : 'splash__glyph'}>
              {g}
            </span>
          ))}
        </p>
        <h1 className="splash__title" role="status">
          On prépare vos clés.
        </h1>
        <p className="splash__note">Elles sont créées sur votre appareil et n'en sortent jamais.</p>
        {slow && (
          <p className="splash__slow">
            {isOnionOrigin()
              ? 'Par Tor, la première connexion peut demander une minute. C’est normal, on continue.'
              : 'C’est plus long que d’habitude. On continue d’essayer.'}
          </p>
        )}
      </div>
    </div>
  );
}
