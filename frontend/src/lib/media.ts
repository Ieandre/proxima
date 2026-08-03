/**
 * Préparation des pièces jointes avant envoi.
 * - Images : ré-orientées et redimensionnées (≤ 1600 px) puis ré-encodées en JPEG
 *   pour un affichage propre et un poids maîtrisé. Les GIF sont conservés tels quels.
 * - Vidéos : envoyées telles quelles, sous un plafond de taille.
 * Rien n'est stocké : les octets sont relayés en temps réel.
 */

export type PreparedMedia = { bytes: Uint8Array; mime: string; kind: 'image' | 'video' };

const MAX_DIM = 1600;
const MAX_VIDEO = 12 * 1024 * 1024; // 12 Mo
const MAX_GIF = 8 * 1024 * 1024; // 8 Mo (animé : pas de redimensionnement)
const MAX_RAW_IMAGE = 10 * 1024 * 1024;

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

  throw new Error('Format non pris en charge (images et vidéos uniquement).');
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
