// iOS n'affiche qu'une seule demande de permission système à la fois : si ATT et
// notifications sont demandées en parallèle au lancement, l'une des deux est
// silencieusement ignorée. Ce signal garantit que toute autre permission attend
// la résolution d'ATT avant de se déclencher.
let markResolved: () => void;
export const attResolved: Promise<void> = new Promise((resolve) => {
  markResolved = resolve;
});

export function resolveAttGate(): void {
  markResolved();
}

// Filet de sécurité : ne jamais bloquer indéfiniment les permissions qui attendent
// ce signal si, pour une raison quelconque, la demande ATT ne se résout jamais.
setTimeout(() => markResolved(), 8000);
