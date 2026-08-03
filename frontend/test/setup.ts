// Environnement Node : File/Blob/TextEncoder natifs sont déjà globaux et complets
// (arrayBuffer() inclus). Seul manque createObjectURL/revokeObjectURL (API navigateur) :
// on fournit un stub déterministe, suffisant pour tester `blobUrl` (media.ts) hors navigateur.
let seq = 0;
if (typeof URL.createObjectURL !== 'function') {
  // @ts-expect-error — ajout d'un stub de test
  URL.createObjectURL = () => `blob:mock/${++seq}`;
}
if (typeof URL.revokeObjectURL !== 'function') {
  // @ts-expect-error — ajout d'un stub de test
  URL.revokeObjectURL = () => {};
}
