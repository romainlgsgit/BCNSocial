// Système de niveaux Blaugrana basé sur les points (XP) accumulés.
// Les points se gagnent via le quiz quotidien et les autres activités de l'app.

export interface LevelTier {
  level: number;
  title: string;
  minPoints: number;
  emoji: string;
}

// Paliers de progression — du nouveau supporter à la légende du club.
export const LEVEL_TIERS: LevelTier[] = [
  { level: 1, title: 'Nouveau Culer', minPoints: 0, emoji: '🌱' },
  { level: 2, title: 'Supporter', minPoints: 100, emoji: '🔵' },
  { level: 3, title: 'Abonné Tribune', minPoints: 250, emoji: '🎟️' },
  { level: 4, title: 'Socio', minPoints: 500, emoji: '🔴' },
  { level: 5, title: 'Cadre du Vestiaire', minPoints: 900, emoji: '💪' },
  { level: 6, title: 'Capitaine', minPoints: 1500, emoji: '🎖️' },
  { level: 7, title: 'Star du Camp Nou', minPoints: 2500, emoji: '⭐' },
  { level: 8, title: 'Légende Blaugrana', minPoints: 4000, emoji: '🏆' },
  { level: 9, title: 'Ballon d\'Or', minPoints: 6500, emoji: '👑' },
];

export interface LevelInfo {
  tier: LevelTier;
  nextTier: LevelTier | null;
  // Progression vers le palier suivant, entre 0 et 1 (1 = niveau max atteint)
  progress: number;
  pointsIntoLevel: number;
  pointsForNextLevel: number; // points restants pour le prochain palier (0 si max)
}

export function getLevelInfo(points: number): LevelInfo {
  const safePoints = Math.max(0, points || 0);

  let tierIndex = 0;
  for (let i = LEVEL_TIERS.length - 1; i >= 0; i--) {
    if (safePoints >= LEVEL_TIERS[i].minPoints) {
      tierIndex = i;
      break;
    }
  }

  const tier = LEVEL_TIERS[tierIndex];
  const nextTier = LEVEL_TIERS[tierIndex + 1] ?? null;

  if (!nextTier) {
    return {
      tier,
      nextTier: null,
      progress: 1,
      pointsIntoLevel: safePoints - tier.minPoints,
      pointsForNextLevel: 0,
    };
  }

  const span = nextTier.minPoints - tier.minPoints;
  const into = safePoints - tier.minPoints;
  return {
    tier,
    nextTier,
    progress: Math.min(1, into / span),
    pointsIntoLevel: into,
    pointsForNextLevel: nextTier.minPoints - safePoints,
  };
}
