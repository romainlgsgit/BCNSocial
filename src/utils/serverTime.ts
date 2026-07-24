/**
 * Horloge serveur — indispensable pour les bannissements.
 *
 * L'horloge du téléphone est sous le contrôle de l'utilisateur : reculer la date
 * dans les réglages iOS raccourcirait un bannissement calculé avec `Date.now()`.
 * On mesure donc une seule fois l'écart entre l'horloge locale et celle de
 * Firestore, puis on l'applique à toutes les lectures d'heure.
 *
 * Obtention de l'heure serveur sans lecture facturée : on écrit `serverTimestamp()`
 * dans le document de l'utilisateur, que l'app écoute DÉJÀ (`onSnapshot` dans
 * AuthContext). La valeur résolue revient par cet écouteur — aucune lecture
 * supplémentaire, juste une écriture par lancement, et uniquement si un
 * bannissement est en cours.
 *
 * ⚠️ La vraie barrière reste les règles Firestore (`request.time`, côté serveur) :
 * même avec une horloge trafiquée et l'écran de blocage contourné, un compte banni
 * ne peut ni publier ni commenter. Ce module ne sert qu'à AFFICHER le temps restant
 * et à décider de l'écran de blocage.
 */

let offsetMs = 0;
let calibrated = false;

/**
 * Enregistre l'écart à partir d'un `serverTimestamp()` résolu.
 * @param serverMs heure serveur en ms (Timestamp.toMillis())
 */
export function calibrateFromServer(serverMs: number): void {
  if (!Number.isFinite(serverMs) || serverMs <= 0) return;
  offsetMs = serverMs - Date.now();
  calibrated = true;
}

/** Heure serveur estimée. Retombe sur l'horloge locale tant qu'aucune calibration. */
export function serverNow(): number {
  return Date.now() + offsetMs;
}

export function isCalibrated(): boolean {
  return calibrated;
}

/** Écart mesuré, en ms (positif = l'appareil retarde). Pour diagnostic. */
export function clockOffset(): number {
  return offsetMs;
}

/** Réinitialise (déconnexion / changement de compte). */
export function resetServerTime(): void {
  offsetMs = 0;
  calibrated = false;
}
