/**
 * Journée de quiz — le nouveau quiz sort chaque jour à 9h00, heure française.
 *
 * On ne peut pas se fier au fuseau de l'appareil : deux utilisateurs dans des pays
 * différents doivent avoir le MÊME quiz au même moment, et la bascule doit se faire
 * à 9h Paris pour tout le monde. Tout est donc calculé en heure de Paris, sans
 * dépendre d'`Intl` (support incomplet selon les moteurs JS embarqués).
 */

/** Dernier dimanche d'un mois donné, à 01:00 UTC (règle de bascule heure d'été UE). */
function lastSundayUTC(year: number, month: number): number {
  // month: 2 = mars, 9 = octobre (indices JS)
  const last = new Date(Date.UTC(year, month + 1, 0)); // dernier jour du mois
  const day = last.getUTCDate() - last.getUTCDay();    // recule jusqu'au dimanche
  return Date.UTC(year, month, day, 1, 0, 0);
}

/**
 * Décalage de Paris par rapport à UTC, en heures (+1 hiver, +2 été).
 * Heure d'été UE : du dernier dimanche de mars 01:00 UTC au dernier dimanche
 * d'octobre 01:00 UTC.
 */
export function parisOffsetHours(date: Date): number {
  const t = date.getTime();
  const y = date.getUTCFullYear();
  return t >= lastSundayUTC(y, 2) && t < lastSundayUTC(y, 9) ? 2 : 1;
}

/** Date/heure « murale » à Paris, exposée via les getters UTC d'un Date décalé. */
function parisWallClock(date: Date): Date {
  return new Date(date.getTime() + parisOffsetHours(date) * 3_600_000);
}

function ymd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Heure à laquelle le quiz du jour est publié (heure de Paris). */
export const QUIZ_RELEASE_HOUR = 9;

/**
 * Clé de la journée de quiz en cours, au format YYYY-MM-DD.
 * Avant 9h (heure de Paris) on est encore sur le quiz de la veille.
 */
export function quizDayKey(date: Date = new Date()): string {
  const paris = parisWallClock(date);
  if (paris.getUTCHours() < QUIZ_RELEASE_HOUR) {
    paris.setUTCDate(paris.getUTCDate() - 1);
  }
  return ymd(paris);
}

/** Numéro de journée (entier croissant) — graine déterministe pour le tirage. */
export function quizDayNumber(date: Date = new Date()): number {
  const [y, m, d] = quizDayKey(date).split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Clé de la journée précédant `key`. */
export function previousDayKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d));
  prev.setUTCDate(prev.getUTCDate() - 1);
  return ymd(prev);
}

/** Instant de la prochaine sortie de quiz (9h Paris) — pour planifier le rappel. */
export function nextReleaseDate(from: Date = new Date()): Date {
  const offset = parisOffsetHours(from);
  const paris = parisWallClock(from);
  const target = new Date(paris.getTime());
  target.setUTCHours(QUIZ_RELEASE_HOUR, 0, 0, 0);
  if (target.getTime() <= paris.getTime()) {
    target.setUTCDate(target.getUTCDate() + 1);
  }
  // Retour en UTC réel. On recalcule le décalage à la date cible : si la bascule
  // heure d'été/hiver tombe entre-temps, l'écart n'est plus celui d'aujourd'hui.
  const approx = new Date(target.getTime() - offset * 3_600_000);
  const corrected = parisOffsetHours(approx);
  return new Date(target.getTime() - corrected * 3_600_000);
}

/**
 * Série réellement en cours.
 *
 * La valeur stockée peut être périmée : quelqu'un qui avait 12 jours mais n'a pas
 * joué depuis une semaine n'a plus de série du tout. Elle ne survit que si le
 * dernier quiz joué date d'aujourd'hui (déjà joué) ou d'hier (encore rattrapable).
 */
export function effectiveStreak(
  streak: number | undefined,
  lastPlayedDate: string | undefined,
  today: string = quizDayKey(),
): number {
  if (!streak || !lastPlayedDate) return 0;
  if (lastPlayedDate === today || lastPlayedDate === previousDayKey(today)) return streak;
  return 0;
}

/** Série après avoir joué le quiz d'aujourd'hui (+1 si la veille a été jouée, sinon 1). */
export function nextStreak(
  streak: number | undefined,
  lastPlayedDate: string | undefined,
  today: string = quizDayKey(),
): number {
  return lastPlayedDate === previousDayKey(today) ? (streak ?? 0) + 1 : 1;
}
