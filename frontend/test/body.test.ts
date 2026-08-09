import { describe, expect, it } from 'vitest';
import { decodeBody, encodeBody, newMessageId } from '../src/lib/body';
import { decryptFrom, encryptFor, exportPublicKey, initCrypto } from '../src/lib/crypto';
import { packPeaks, resamplePeaks } from '../src/lib/voice';

describe('corps de message scellé', () => {
  it('aller-retour complet (identifiant + texte + réponse)', () => {
    const body = { id: 'abc123', text: 'bonjour', replyTo: 'xyz789' };
    expect(decodeBody(encodeBody(body))).toEqual(body);
  });

  it('champs optionnels absents plutôt que vides', () => {
    const decoded = decodeBody(encodeBody({ text: 'simple' }));
    expect(decoded).toEqual({ text: 'simple', id: undefined, replyTo: undefined });
  });

  it('un clair sans marqueur est rendu tel quel (client antérieur)', () => {
    expect(decodeBody('message brut')).toEqual({ text: 'message brut' });
    // Le marqueur commence par un caractère de contrôle : un texte tapé au clavier,
    // même s'il imite la suite du marqueur ou ressemble à du JSON, ne peut pas passer
    // pour un corps scellé.
    expect(decodeBody('{"t":"piège"}')).toEqual({ text: '{"t":"piège"}' });
    expect(decodeBody('p1:{"t":"piège"}')).toEqual({ text: 'p1:{"t":"piège"}' });
  });

  it('corps marqué mais illisible : aucun débris affiché', () => {
    expect(decodeBody('\u0001p1:{ceci n\'est pas du json')).toEqual({ text: '' });
  });

  it('champs de type inattendu ignorés', () => {
    expect(decodeBody('\u0001p1:{"t":42,"i":{},"r":[]}')).toEqual({ text: '', id: undefined, replyTo: undefined });
  });

  it('préserve les sauts de ligne et les accents', () => {
    const text = 'première ligne\nseconde ligne — ça tient ?';
    expect(decodeBody(encodeBody({ text })).text).toBe(text);
  });
});

describe('message vocal scellé', () => {
  const peaks = resamplePeaks(Array.from({ length: 240 }, (_, i) => (i * 11) % 256));

  it('la silhouette et la durée survivent à l\'aller-retour', () => {
    const decoded = decodeBody(encodeBody({ text: '', voice: { peaks, seconds: 7.3 } }));
    expect(decoded.voice?.seconds).toBeCloseTo(7.3, 1);
    expect(decoded.voice?.peaks).toHaveLength(peaks.length);
  });

  it('un message ordinaire n\'annonce aucune voix', () => {
    expect(decodeBody(encodeBody({ text: 'bonjour' })).voice).toBeUndefined();
  });

  it('durée absente ou aberrante : la forme reste, le compteur repart de zéro', () => {
    expect(decodeBody('p1:{"t":"","v":"AAAA"}').voice?.seconds).toBe(0);
    expect(decodeBody('p1:{"t":"","v":"AAAA","d":"douze"}').voice?.seconds).toBe(0);
  });

  it('la silhouette ne quitte pas l\'enveloppe — et ne la fait pas grossir', async () => {
    await initCrypto();
    const pub = exportPublicKey();
    const plain = encryptFor(pub, encodeBody({ id: newMessageId(), text: '' }));
    const voiced = encryptFor(pub, encodeBody({ id: newMessageId(), text: '', voice: { peaks, seconds: 12.5 } }));

    expect(JSON.stringify(voiced)).not.toContain(packPeaks(peaks));
    // Bourrage par blocs de 256 octets (cf. `lib/crypto`) : la silhouette tient
    // dans le même bloc que l'identifiant. Le serveur ne voit donc AUCUNE
    // différence de taille entre un vocal et un message ordinaire — la découpe
    // parole/silence ne fuit ni par le contenu ni par la longueur.
    expect(voiced.c.length).toBe(plain.c.length);
  });
});

describe('identifiant de message', () => {
  it('forme base64 url-safe, sans remplissage (comme l\'id serveur)', () => {
    expect(newMessageId()).toMatch(/^[A-Za-z0-9_-]{12}$/);
  });

  it('deux appels ne collisionnent pas', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newMessageId()));
    expect(ids.size).toBe(500);
  });
});

describe('scellement dans l\'enveloppe (RG-07 : le serveur ne voit ni l\'ancre ni la réponse)', () => {
  it('l\'identifiant et la référence de réponse survivent au chiffrement MP', async () => {
    await initCrypto();
    const pub = exportPublicKey(); // conversation avec soi-même : suffit pour l'aller-retour
    const msgId = newMessageId();
    const env = encryptFor(pub, encodeBody({ id: msgId, text: 'ma réponse', replyTo: 'cité42' }));

    // Rien de lisible ne transite : l'enveloppe ne porte que nonce + ciphertext + clé publique.
    const wire = JSON.stringify(env);
    expect(wire).not.toContain('cité42');
    expect(wire).not.toContain(msgId);
    expect(wire).not.toContain('ma réponse');

    const body = decodeBody(decryptFrom(env));
    expect(body).toEqual({ id: msgId, text: 'ma réponse', replyTo: 'cité42' });
  });
});
