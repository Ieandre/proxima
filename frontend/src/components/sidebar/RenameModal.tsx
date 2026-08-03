import { useState, type FormEvent } from 'react';
import { renamePseudo } from '../../lib/socket';
import { randomPseudo } from '../../lib/pseudo';
import { Icon, Modal } from '../ui';


export function RenameModal({ current, onClose }: { current: string; onClose: () => void }) {
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = value.trim();
  const valid = trimmed.length >= 2 && trimmed !== current;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const res = await renamePseudo(trimmed);
    if (res.ok) return onClose();
    setError(res.error || 'Échec du changement de pseudo.');
    setBusy(false);
  }

  return (
    <Modal title="Changer de pseudo" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="relative">
          <input
            className="input pr-11"
            maxLength={24}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="Nouveau pseudo"
            autoFocus
          />
          <button
            type="button"
            className="input-action"
            onClick={() => setValue(randomPseudo())}
            title="Un autre pseudo"
            aria-label="Proposer un autre pseudo"
          >
            <Icon name="dice" size={16} />
          </button>
        </div>

        <p className="mt-3 text-[12px] leading-snug text-faint">
          Vos messages déjà envoyés gardent l'ancien pseudo. Le changement est annoncé dans les salons que vous avez
          rejoints.
        </p>

        {error && (
          <div className="mt-3 rounded-lg border border-[color-mix(in_srgb,var(--color-danger)_35%,transparent)] bg-[var(--color-danger-tint)] px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary" disabled={!valid || busy}>
            {busy ? 'Changement…' : 'Changer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Une ligne de salon, trois états qui s'empilent :
 *  - absent  : on n'y est pas — pastille sourde, la flèche paraît au survol ;
 *  - présent : un rail bleu au bord gauche, posé SANS rien déplacer ;
 *  - ouvert  : présent, et c'est la conversation à l'écran — la ligne se remplit.
 *
 * Chaque état n'ajoute qu'un signe au précédent, et aucun ne change la place de la
 * ligne. C'est le remplacement des deux anciennes listes (« à rejoindre » en bas,
 * « rejoints » en haut) entre lesquelles la ligne se téléportait au clic.
 */
