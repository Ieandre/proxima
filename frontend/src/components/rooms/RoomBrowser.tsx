import { useState, type FormEvent } from 'react';
import { useStore } from '../../store/useStore';
import { createRoom } from '../../lib/socket';
import { Icon, Modal } from '../ui';

/** Création de salon (modale). La découverte, elle, se fait dans la barre latérale. */
export function RoomBrowser({ onClose }: { onClose: () => void }) {
  const showToast = useStore((s) => s.showToast);

  const [name, setName] = useState('');
  const [type, setType] = useState<'public' | 'private'>('public');
  const [password, setPassword] = useState('');
  const [encrypted, setEncrypted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doCreate(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2 || busy) return;
    // Tout salon est chiffré : la case ne choisit pas SI l'on chiffre, mais COMMENT la
    // clé s'obtient — dérivée du mot de passe (salon fermé, plafonné) au lieu d'être
    // transmise par les membres. Le mot de passe devient alors indispensable.
    const isEncrypted = type === 'private' && encrypted;
    if (isEncrypted && !password) {
      setError('Une clé dérivée nécessite un mot de passe.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await createRoom({
      name: name.trim(),
      type,
      password: type === 'private' ? password : '',
      encrypted: isEncrypted,
    });
    setBusy(false);
    if (res.ok) {
      showToast(
        isEncrypted
          ? 'Salon fermé créé. Partagez le lien et le mot de passe depuis le salon.'
          : type === 'private'
            ? 'Salon privé créé, chiffré de bout en bout. Partagez le lien depuis le salon.'
            : 'Salon créé, chiffré de bout en bout.',
      );
      onClose();
    } else setError(res.error || 'Échec de la création.');
  }

  return (
    <Modal title="Créer un salon" onClose={onClose}>
      <form onSubmit={doCreate}>
        <label className="mb-1.5 block text-sm font-medium text-muted">Nom du salon</label>
        <input
          className="input mb-4"
          placeholder="ex. Centre-ville ce soir"
          maxLength={32}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />

        <label className="mb-1.5 block text-sm font-medium text-muted">Visibilité</label>
        <div className="mb-4 grid grid-cols-2 gap-2">
          <VisBtn active={type === 'public'} icon="hash" label="Public" desc="Listé, libre d'accès" onClick={() => setType('public')} />
          <VisBtn active={type === 'private'} icon="lock" label="Privé" desc="Sur invitation" onClick={() => setType('private')} />
        </div>

        {/* Un salon public est chiffré d'office : il faut le dire ici, et dire aussi ce que
            cela coûte (aucune modération automatique) et ce que cela ne couvre pas (la clé
            est remise à quiconque entre). Promettre plus serait promettre à faux. */}
        {type === 'public' && (
          <p className="mb-4 text-[11px] leading-snug text-faint">
            Chiffré de bout en bout : le serveur relaie sans pouvoir lire. La clé est remise à chaque arrivant par les
            membres — entrer suffit donc pour l’obtenir. Pas de modération automatique du contenu.
          </p>
        )}

        {type === 'private' && (
          <div className="mb-4">
            <label className="mb-1.5 block text-sm font-medium text-muted">
              Mot de passe {encrypted ? '(obligatoire)' : '(optionnel)'}
            </label>
            <input
              className="input"
              type={encrypted ? 'password' : 'text'}
              placeholder={encrypted ? 'requis pour dériver la clé' : 'laisser vide = accès par lien uniquement'}
              maxLength={64}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-paper-2 p-3">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={encrypted}
                onChange={(e) => setEncrypted(e.target.checked)}
              />
              <span>
                <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                  <Icon name="lock" size={13} />
                  Dériver la clé du mot de passe
                </span>
                <span className="mt-0.5 block text-[12px] leading-snug text-muted">
                  Le salon est chiffré dans les deux cas. Ici la clé se dérive du mot de passe au lieu d’être remise
                  par les membres : personne n’entre sans lui, et le salon est plafonné à 16 participants. Accès par
                  mot de passe uniquement — pas de lien d’invitation.
                </span>
              </span>
            </label>

            <p className="mt-1.5 text-[11px] leading-snug text-faint">
              {encrypted
                ? 'Salon listé (nom visible), fermé par le mot de passe.'
                : "Un lien d'invitation sera généré après création. Le contenu est chiffré ; la clé est remise à qui franchit la porte."}
            </p>
          </div>
        )}

        {error && <p className="mb-3 text-sm text-danger">{error}</p>}

        <button className="btn btn-primary w-full" disabled={name.trim().length < 2 || busy}>
          <Icon name="plus" size={16} />
          Créer le salon
        </button>
      </form>
    </Modal>
  );
}

function VisBtn({
  active,
  icon,
  label,
  desc,
  onClick,
}: {
  active: boolean;
  icon: string;
  label: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border p-3 text-left transition-colors"
      style={{
        borderColor: active ? 'var(--color-blue)' : 'var(--color-line-strong)',
        background: active ? 'var(--color-blue-tint)' : 'var(--color-card)',
      }}
    >
      <span className="flex items-center gap-2 font-semibold" style={{ color: active ? 'var(--color-blue)' : 'var(--color-ink)' }}>
        <Icon name={icon} size={15} />
        {label}
      </span>
      <span className="mt-0.5 block text-[12px] text-muted">{desc}</span>
    </button>
  );
}
