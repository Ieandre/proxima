import { describe, expect, it } from 'vitest';
import { blobUrl, prepareMedia } from '../src/lib/media';

// Fabrique un File de taille donnée (octets nuls) et de type MIME donné.
function fileOf(bytes: number, type: string, name = 'f'): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe('prepareMedia', () => {
  it('GIF sous la limite : relayé tel quel (pas de redimensionnement)', async () => {
    const out = await prepareMedia(fileOf(1024, 'image/gif', 'a.gif'));
    expect(out.mime).toBe('image/gif');
    expect(out.kind).toBe('image');
    expect(out.bytes).toBeInstanceOf(Uint8Array);
    expect(out.bytes.length).toBe(1024);
  });

  it('GIF trop lourd (> 8 Mo) : rejeté', async () => {
    await expect(prepareMedia(fileOf(9 * 1024 * 1024, 'image/gif', 'big.gif'))).rejects.toThrow(/GIF trop lourd/);
  });

  it('image bitmap : repli sur l\'original quand le redimensionnement échoue (jsdom sans canvas)', async () => {
    // createImageBitmap n'existe pas en jsdom -> downscale échoue -> repli original si < 10 Mo.
    const out = await prepareMedia(fileOf(2048, 'image/png', 'p.png'));
    expect(out.kind).toBe('image');
    expect(out.mime).toBe('image/png');
    expect(out.bytes.length).toBe(2048);
  });

  it('image trop lourde (> 10 Mo) au repli : rejetée', async () => {
    await expect(prepareMedia(fileOf(11 * 1024 * 1024, 'image/png', 'huge.png'))).rejects.toThrow(/Image trop lourde/);
  });

  it('vidéo sous la limite : relayée avec son type', async () => {
    const out = await prepareMedia(fileOf(1024, 'video/webm', 'v.webm'));
    expect(out.kind).toBe('video');
    expect(out.mime).toBe('video/webm');
  });

  it('vidéo trop lourde (> 12 Mo) : rejetée', async () => {
    await expect(prepareMedia(fileOf(13 * 1024 * 1024, 'video/mp4', 'big.mp4'))).rejects.toThrow(/Vidéo trop lourde/);
  });

  it('format non pris en charge : rejeté', async () => {
    await expect(prepareMedia(fileOf(128, 'application/pdf', 'doc.pdf'))).rejects.toThrow(/non pris en charge/);
  });
});

describe('blobUrl', () => {
  it('produit une URL d\'objet blob:', () => {
    const url = blobUrl(new Uint8Array([1, 2, 3]), 'image/png');
    expect(url.startsWith('blob:')).toBe(true);
  });

  it('gère un mime vide (octet-stream par défaut, sans erreur)', () => {
    const url = blobUrl(new Uint8Array([0]), '');
    expect(typeof url).toBe('string');
  });
});
