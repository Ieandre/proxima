/** Message auquel on répond, tel qu'il s'affiche au-dessus du champ de saisie. */
export type ReplyDraft = { id: string; author: string; excerpt: string };

/** Message que l'on retouche : son texte revient dans le champ, tel qu'il a été envoyé. */
export type EditDraft = { id: string; text: string };
