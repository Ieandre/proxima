import sodium from 'libsodium-wrappers';

/* Constantes et types partagés par la page « En savoir plus » et ses
   démonstrations interactives (chaque démo étant un SFC séparé). */

export const B64 = () => sodium.base64_variants.URLSAFE_NO_PADDING;
export const PAD = 256;

export type Party = { publicKey: Uint8Array; privateKey: Uint8Array; keyType: string };
