import { useEffect, useState } from 'react';
import { useStore } from '../../store/useStore';
import { claimInvite, disconnect, joinRoom, peekRoom } from '../../lib/socket';
import { Sidebar } from '../sidebar';
import { Conversation } from '../conversation';
import { RoomCard, type RoomCardTarget } from '../rooms/RoomCard';
import { TopBar } from '../layout/TopBar';
import { Icon } from '../ui';

export function Chat() {
  const active = useStore((s) => s.active);
  // Salon chiffré atteint par lien `?r=` : même fiche que dans la liste, en dialogue
  // faute de ligne à laquelle s'ancrer. Mot de passe pré-rempli s'il vient de `#p=`.
  const [pending, setPending] = useState<(RoomCardTarget & { password?: string }) | null>(null);

  // Auto-jonction via lien : `/?r=<roomId>&k=<token>` (invitation, salon clair)
  // ou `/?r=<roomId>` seul (salon chiffré -> pré-vol + saisie du mot de passe, éventuellement `#p=<mdp>`).
  // Ou `/?i=<jeton>` : invitation à une conversation privée.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const r = p.get('r');
    const k = p.get('k');
    const i = p.get('i');
    if (!r && !i) return;
    // Le fragment `#p=<mdp>` n'est jamais envoyé au serveur ; on le lit puis on nettoie l'URL aussitôt.
    const linkPwd = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('p') || undefined;
    window.history.replaceState(null, '', window.location.pathname);

    // Conversation privée : on se présente, l'auteur du lien confirme. Le fil
    // s'ouvre à l'acceptation (`pm:invite:accepted`), pas ici — c'est lui qui
    // décide, et c'est ce qui rend le rendez-vous loyal des deux côtés.
    if (i) {
      claimInvite(i).then((res) => {
        if (!res.ok) useStore.getState().showToast(res.error || 'Cette invitation a expiré.', 'warn');
      });
      return;
    }
    if (!r) return;

    if (k) {
      joinRoom({ roomId: r, invite: k }).then((res) => {
        if (!res.ok) useStore.getState().showToast(res.error || 'Invitation invalide.', 'warn');
      });
      return;
    }
    peekRoom(r).then((res) => {
      if (!res.ok) {
        useStore.getState().showToast(res.error || 'Salon introuvable ou fermé.', 'warn');
        return;
      }
      if (res.encrypted && res.salt) {
        setPending({
          id: r,
          name: res.name || 'Salon',
          salt: res.salt,
          encrypted: true,
          private: true,
          region: false,
          official: false,
          password: linkPwd,
        });
      } else {
        joinRoom({ roomId: r }).then((j) => {
          if (!j.ok) useStore.getState().showToast(j.error || 'Impossible de rejoindre.', 'warn');
        });
      }
    });
  }, []);

  function quit() {
    if (window.confirm('Quitter et détruire définitivement votre session ?')) {
      disconnect();
      window.location.reload();
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* ---- Barre supérieure ------------------------------------------- */}
      {/* L'identité de session vit dans le pied du panneau de gauche, avec son empreinte
          et son avertissement d'éphémérité. La répéter ici l'affichait deux fois à
          l'identique sur le même écran (trois avec la liste des présents). */}
      <TopBar column="full" sticky={false}>
        <a
          href="#en-savoir-plus"
          className="btn btn-ghost px-3"
          title="Comment ça marche : anonymat, chiffrement, sécurité"
        >
          <Icon name="info" size={16} />
          <span className="hidden lg:inline">Comment ça marche</span>
        </a>
        <button className="btn btn-ghost px-3" onClick={quit} title="Quitter et tout détruire">
          <Icon name="logout" size={16} />
          <span className="hidden sm:inline">Quitter</span>
        </button>
      </TopBar>

      {/* ---- Corps ------------------------------------------------------- */}
      {/* `minmax(0,…)` sur CHAQUE piste, et une colonne explicite dès le mobile.
          Sans cela, une piste de grille `auto` (mobile) ou `1fr` (desktop) garde un
          plancher à `min-content` : un seul contenu insécable — le lien d'invitation
          `?i=<jeton>`, ou demain une URL collée dans un message — élargit la piste,
          donc la page, et l'écran devient scrollable latéralement sur mobile. Le
          plancher à 0 rend la colonne maîtresse de sa largeur, à charge pour le
          contenu de se tronquer ou de défiler chez lui (cf. `.invite-url__text`). */}
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[clamp(280px,26vw,340px)_minmax(0,1fr)]">
        <div className={`min-h-0 border-r border-line ${active ? 'hidden md:block' : 'block'}`}>
          <Sidebar />
        </div>
        <div className={`min-h-0 ${active ? 'block' : 'hidden md:block'}`}>
          <Conversation />
        </div>
      </div>

      {pending && (
        <RoomCard
          room={pending}
          mode="enter"
          layout="dialog"
          initialPassword={pending.password}
          onDone={() => setPending(null)}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}
