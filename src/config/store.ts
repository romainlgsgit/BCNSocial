/**
 * Boutique — les deux monnaies de l'app.
 *
 * • Les PIÈCES s'achètent avec de l'argent réel (packs consommables App Store)
 *   ou se gagnent en jouant.
 * • Les DOLLARS s'obtiennent uniquement en échangeant des pièces, jamais à
 *   l'achat direct. Le taux est fixe : 100 pièces = 1 $ (donc 1 000 = 10 $).
 *
 * Les produits correspondants doivent être créés dans App Store Connect en
 * « Consommable » (et non en abonnement, contrairement au Premium), puis
 * rattachés au projet RevenueCat. Tant qu'ils n'existent pas côté store, la
 * boutique affiche les prix de repli ci-dessous et l'achat est désactivé.
 */

// ─── Pièces : packs achetables ────────────────────────────────────────────────

/**
 * Taux de référence = le premier palier : 1 000 pièces pour 4,99 €. Les paliers
 * suivants donnent plus de pièces pour le même euro (`bonusPercent`), et le plus
 * cher ajoute en plus un bonus fixe mis en avant (`bonusCoins`).
 */
export interface CoinPack {
  /** Identifiant produit App Store Connect */
  id: string;
  /** Pièces de base du palier */
  coins: number;
  /** Pièces offertes en plus, affichées à part (0 = aucune) */
  bonusCoins: number;
  /** % de pièces en plus par rapport au taux du 1er palier (0 = taux de base) */
  bonusPercent: number;
  /** Prix affiché tant que le store n'a pas répondu — jamais utilisé pour facturer */
  fallbackPrice: string;
  badge?: string;
  /** Taille du tas de pièces sur la vignette (1 à 5) : il grossit avec le palier */
  heap: number;
  accent: string;
}

export const COIN_PACKS: CoinPack[] = [
  {
    id: 'bcnsocial_coins_1000',
    coins: 1000,
    bonusCoins: 0,
    bonusPercent: 0,
    fallbackPrice: '4,99 €',
    heap: 1,
    accent: '#C9922B',
  },
  {
    id: 'bcnsocial_coins_2200',
    coins: 2200,
    bonusCoins: 0,
    bonusPercent: 10,
    fallbackPrice: '9,99 €',
    heap: 2,
    accent: '#D9A814',
  },
  {
    id: 'bcnsocial_coins_4800',
    coins: 4800,
    bonusCoins: 0,
    bonusPercent: 20,
    fallbackPrice: '19,99 €',
    badge: 'POPULAIRE',
    heap: 3,
    accent: '#EDBB00',
  },
  {
    id: 'bcnsocial_coins_7500',
    coins: 7500,
    bonusCoins: 0,
    bonusPercent: 25,
    fallbackPrice: '29,99 €',
    heap: 4,
    accent: '#F5C93B',
  },
  {
    id: 'bcnsocial_coins_13000',
    coins: 13000,
    bonusCoins: 500,
    bonusPercent: 35,
    fallbackPrice: '49,99 €',
    badge: 'MEILLEURE OFFRE',
    heap: 5,
    accent: '#FFD75E',
  },
];

export const COIN_PRODUCT_IDS = COIN_PACKS.map(p => p.id);

/** Pièces réellement créditées : base + bonus. Source unique pour l'UI ET le crédit. */
export function packTotalCoins(pack: CoinPack): number {
  return pack.coins + pack.bonusCoins;
}

export function findPack(productId: string): CoinPack | undefined {
  return COIN_PACKS.find(p => p.id === productId);
}

// ─── Dollars : paliers d'échange ──────────────────────────────────────────────

/** Taux de change, volontairement fixe et identique sur tous les paliers. */
export const COINS_PER_DOLLAR = 100;

export interface DollarTier {
  dollars: number;
  coins: number;
}

/**
 * Cinq paliers au même taux. Pas de bonus ici, contrairement aux packs payants :
 * un taux qui varierait selon le palier rendrait la promesse « 1 000 pièces =
 * 10 $ » fausse dès qu'on échange autre chose que le premier palier.
 */
export const DOLLAR_TIERS: DollarTier[] = [10, 25, 50, 100, 250].map(dollars => ({
  dollars,
  coins: dollars * COINS_PER_DOLLAR,
}));

// ─── Formatage ────────────────────────────────────────────────────────────────

/**
 * Séparateur de milliers sans dépendre d'`Intl` : selon le moteur JS embarqué,
 * `toLocaleString('fr-FR')` retombe silencieusement sur le format US ("13,500").
 */
export function formatCoins(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Équivalent en dollars du jeu, arrondi à l'unité. */
export function coinsToDollars(coins: number): number {
  return Math.floor(coins / COINS_PER_DOLLAR);
}
