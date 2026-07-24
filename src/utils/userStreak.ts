import { effectiveStreak } from './quizDay';

/**
 * Série affichable d'un membre (badge sur l'avatar).
 *
 * `quizStreak` sur le doc `users` est une COPIE, écrite au moment où la personne
 * joue : elle n'est jamais remise à zéro toute seule quand la série casse. On la
 * confronte donc systématiquement à `quizLastPlayed` — sans quoi un badge resterait
 * affiché indéfiniment sur le profil de quelqu'un qui ne joue plus.
 */
export function displayStreak(u?: {
  quizStreak?: number;
  quizLastPlayed?: string;
  badgeVisible?: boolean;
} | null): number {
  if (!u) return 0;
  // `badgeVisible` absent = activé : le badge s'affiche par défaut, et seuls ceux
  // qui l'ont explicitement désactivé (false) le masquent.
  if (u.badgeVisible === false) return 0;
  return effectiveStreak(u.quizStreak, u.quizLastPlayed);
}
