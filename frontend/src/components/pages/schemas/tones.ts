/* ---- Briques partagées ------------------------------------------------- */

export type Tone = 'blue' | 'ok' | 'bad' | 'neutral';

export function accentOf(tone: Tone) {
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
