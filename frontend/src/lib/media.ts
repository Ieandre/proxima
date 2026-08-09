/**
 * Préparation des pièces jointes avant envoi.
 * - Images : ré-orientées et redimensionnées (≤ 1600 px) puis ré-encodées en JPEG
 *   pour un affichage propre et un poids maîtrisé. Les GIF sont conservés tels quels.
 * - Vidéos : envoyées telles quelles, sous un plafond de taille.
 * - Voix : envoyée telle quelle. Le format sort déjà de l'enregistreur (Opus, ou
 *   le conteneur du navigateur) — le ré-encoder ne ferait que dégrader ce qui est
 *   déjà compressé pour la parole (cf. `lib/voice.ts`).
 * Rien n'est stocké : les octets sont relayés en temps réel.
 */

export type PreparedMedia = { bytes: Uint8Array; mime: string; kind: 'image' | 'video' | 'audio' };

/**
 * Ce que l'on lit d'un presse-papiers : sous-ensemble structurel de `DataTransfer`,
 * pour que la règle de tri reste vérifiable hors navigateur.
 */
export type ClipboardLike = {
  getData(type: string): string;
  files?: ArrayLike<File> | null;
  items?: ArrayLike<{ kind: string; type: string; getAsFile(): File | null }> | null;
};

const MAX_DIM = 1600;
const MAX_VIDEO = 12 * 1024 * 1024; // 12 Mo
const MAX_GIF = 8 * 1024 * 1024; // 8 Mo (animé : pas de redimensionnement)
const MAX_RAW_IMAGE = 10 * 1024 * 1024;
// 3 Mo : très au-dessus de ce que produisent trois minutes d'Opus (~700 Ko), donc
// le plafond qui mord réellement est celui de la durée (cf. `lib/voice.ts`). Celui-ci
// n'est là que pour borner un conteneur inattendu.
const MAX_AUDIO = 3 * 1024 * 1024;

/**
 * Média collé depuis le presse-papiers, ou `null` si le collage n'en contient pas.
 * Le texte a la priorité absolue : un copier-coller depuis un traitement de texte,
 * un tableur ou une page web embarque souvent une capture *en plus* du texte, et
 * coller une citation ne doit pas envoyer une image à sa place.
 */
export function mediaFromClipboard(data: ClipboardLike): File | null {
  if (data.getData('text/plain').trim()) return null;

  for (const file of Array.from(data.files ?? [])) {
    if (isSupported(file)) return file;
  }
  // Repli : certains navigateurs n'exposent la capture que par `items`.
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (file && isSupported(file)) return file;
  }
  return null;
}

function isSupported(file: File): boolean {
  return file.type.startsWith('image/') || file.type.startsWith('video/');
}

export async function prepareMedia(file: File): Promise<PreparedMedia> {
  const type = file.type || '';

  if (type === 'image/gif') {
    if (file.size > MAX_GIF) throw new Error('GIF trop lourd (max 8 Mo).');
    return { bytes: new Uint8Array(await file.arrayBuffer()), mime: 'image/gif', kind: 'image' };
  }

  if (type.startsWith('image/')) {
    try {
      const blob = await downscaleImage(file);
      return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: 'image/jpeg', kind: 'image' };
    } catch {
      // Repli : si le redimensionnement échoue, on envoie l'original s'il n'est pas trop lourd.
      if (file.size > MAX_RAW_IMAGE) throw new Error('Image trop lourde (max 10 Mo).');
      return { bytes: new Uint8Array(await file.arrayBuffer()), mime: type, kind: 'image' };
    }
  }

  if (type.startsWith('video/')) {
    if (file.size > MAX_VIDEO) throw new Error('Vidéo trop lourde (max 12 Mo).');
    return { bytes: new Uint8Array(await file.arrayBuffer()), mime: type || 'video/mp4', kind: 'video' };
  }

  if (type.startsWith('audio/')) {
    if (file.size > MAX_AUDIO) throw new Error('Message vocal trop lourd (max 3 Mo).');
    return { bytes: new Uint8Array(await file.arrayBuffer()), mime: type, kind: 'audio' };
  }

  throw new Error('Format non pris en charge (images, vidéos et voix uniquement).');
}

async function downscaleImage(file: File): Promise<Blob> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bmp = await createImageBitmap(file);
  }
  const scale = Math.min(1, MAX_DIM / Math.max(bmp.width, bmp.height));
  const width = Math.max(1, Math.round(bmp.width * scale));
  const height = Math.max(1, Math.round(bmp.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponible');
  ctx.drawImage(bmp, 0, 0, width, height);
  bmp.close?.();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Échec de l’encodage'))), 'image/jpeg', 0.85);
  });
}

export function blobUrl(bytes: Uint8Array, mime: string): string {
  // Copie vers un ArrayBuffer « pur » (BlobPart sans ambiguïté pour le typage strict).
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return URL.createObjectURL(new Blob([ab], { type: mime || 'application/octet-stream' }));
}
