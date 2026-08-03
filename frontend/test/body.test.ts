import { describe, expect, it } from 'vitest';
import { decodeBody, encodeBody, newMessageId } from '../src/lib/body';
import { decryptFrom, encryptFor, exportPublicKey, initCrypto } from '../src/lib/crypto';

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
