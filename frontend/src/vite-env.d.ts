/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Lien d'invitation Discord affiché en pied de page et sur « À propos ». Vide ⇒ non rendu. */
  readonly VITE_DISCORD_INVITE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
