/**
 * Bannissements — logique pure (aucun accès réseau, testable isolément).
 *
 * Règle d'or : la durée restante ne doit JAMAIS être calculée avec l'horloge du
 * téléphone. Quelqu'un qui recule la date de son appareil ne doit pas raccourcir
 * son bannissement d'une seconde. Toutes les fonctions ci-dessous prennent donc un
 * `now` explicite, qui doit provenir de l'horloge SERVEUR (cf. `serverTime.ts`).
 */

export interface BanState {
  /** Fin du bannissement temporaire, en millisecondes epoch. */
  bannedUntil?: number | null;
  /** Bannissement définitif : ni expiration, ni recréation de compte. */
  banPermanent?: boolean;
  banReason?: string | null;
}

export type BanVerdict =
  | { banned: false }
  | { banned: true; permanent: true; reason?: string | null }
  | { banned: true; permanent: false; until: number; remainingMs: number; reason?: string | null };

/** Durées proposées à l'admin. */
export const BAN_DURATIONS: { label: string; hours: number }[] = [
  { label: '1 heure', hours: 1 },
  { label: '12 heures', hours: 12 },
  { label: '24 heures', hours: 24 },
  { label: '3 jours', hours: 72 },
  { label: '7 jours', hours: 168 },
  { label: '30 jours', hours: 720 },
];

/**
 * Statut d'un compte à l'instant `now` (horloge serveur).
 * Le bannissement définitif prime toujours sur le temporaire.
 */
export function evaluateBan(state: BanState | null | undefined, now: number): BanVerdict {
  if (!state) return { banned: false };
  if (state.banPermanent) {
    return { banned: true, permanent: true, reason: state.banReason };
  }
  const until = state.bannedUntil;
  if (typeof until === 'number' && until > now) {
    return {
      banned: true,
      permanent: false,
      until,
      remainingMs: until - now,
      reason: state.banReason,
    };
  }
  return { banned: false };
}

/** Durée restante en clair : « 2 jours 3 h », « 45 min », « moins d'une minute ». */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return 'moins d\'une minute';
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 1) return 'moins d\'une minute';

  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    const d = `${days} jour${days > 1 ? 's' : ''}`;
    return hours > 0 ? `${d} et ${hours} h` : d;
  }
  if (hours > 0) {
    const h = `${hours} heure${hours > 1 ? 's' : ''}`;
    return minutes > 0 ? `${h} et ${minutes} min` : h;
  }
  return `${minutes} minute${minutes > 1 ? 's' : ''}`;
}

/**
 * Clé d'identité utilisée pour bloquer la RECRÉATION d'un compte banni
 * définitivement. Les emails sont insensibles à la casse, les pseudos aussi —
 * sans normalisation, « Jean@X.com » contournerait un ban sur « jean@x.com ».
 */
export function emailBanKey(email: string): string {
  return `email:${email.trim().toLowerCase()}`;
}

export function usernameBanKey(username: string): string {
  return `user:${username.trim().toLowerCase()}`;
}

/** Fin d'un bannissement de `hours` heures à partir de l'heure serveur. */
export function banExpiryFrom(now: number, hours: number): number {
  return now + hours * 3_600_000;
}
