/**
 * Badges de série du quiz quotidien.
 *
 * Un badge n'est PAS acquis définitivement : il reflète la série EN COURS. Si la
 * série tombe (un jour manqué), le badge disparaît — c'est le principe des flammes.
 * Le palier affiché se calcule donc toujours depuis `effectiveStreak`, jamais
 * depuis la valeur brute stockée.
 */

export interface StreakTier {
  /** Série minimale pour débloquer ce palier. */
  days: number;
  id: 'bronze' | 'argent' | 'or' | 'or-grave' | 'platine' | 'legende';
  name: string;
  /** Dégradé de l'écusson (du haut vers le bas). */
  gradient: readonly [string, string];
  /** Liseré / contour métallique. */
  border: string;
  /** Couleur du chiffre inscrit sur l'écusson. */
  ink: string;
  /** Couronne au-dessus de l'écusson (paliers hauts). */
  crown: boolean;
  /** Halo lumineux autour (palier ultime). */
  aura: boolean;
}

export const STREAK_TIERS: StreakTier[] = [
  { days: 10,  id: 'bronze',   name: 'Bronze',    gradient: ['#C87F3C', '#8A4F1E'], border: '#E3A567', ink: '#3A1E08', crown: false, aura: false },
  { days: 25,  id: 'argent',   name: 'Argent',    gradient: ['#E2E8EF', '#98A6B6'], border: '#F4F8FC', ink: '#2A3340', crown: false, aura: false },
  { days: 50,  id: 'or',       name: 'Or',        gradient: ['#FFD75E', '#D19A17'], border: '#FFE9A3', ink: '#4A3405', crown: false, aura: false },
  { days: 70,  id: 'or-grave', name: 'Or gravé',  gradient: ['#FFC93C', '#A9760A'], border: '#FFF0B8', ink: '#3D2A03', crown: false, aura: false },
  { days: 100, id: 'platine',  name: 'Platine',   gradient: ['#D8F3FF', '#7FA8C4'], border: '#FFFFFF', ink: '#123243', crown: true,  aura: false },
  { days: 500, id: 'legende',  name: 'Légende',   gradient: ['#B14BFF', '#5C1BB0'], border: '#F2C8FF', ink: '#FFFFFF', crown: true,  aura: true  },
];

/** Palier correspondant à une série en cours (null en dessous du premier seuil). */
export function tierForStreak(streak: number): StreakTier | null {
  let found: StreakTier | null = null;
  for (const t of STREAK_TIERS) {
    if (streak >= t.days) found = t;
    else break;
  }
  return found;
}

/** Prochain palier à atteindre (null si le maximum est déjà tenu). */
export function nextTierForStreak(streak: number): StreakTier | null {
  return STREAK_TIERS.find(t => streak < t.days) ?? null;
}

/** Jours restants avant le prochain badge (0 si palier maximum). */
export function daysToNextTier(streak: number): number {
  const next = nextTierForStreak(streak);
  return next ? next.days - streak : 0;
}
