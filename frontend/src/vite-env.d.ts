/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Lien d'invitation Discord affiché en pied de page et sur « À propos ». Vide ⇒ non rendu. */
  readonly VITE_DISCORD_INVITE?: string;
  /** Dépôt du code source de CETTE instance (AGPL art. 13). Défaut : le dépôt amont. */
  readonly VITE_SOURCE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
