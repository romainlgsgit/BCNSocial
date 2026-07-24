/**
 * Tirs au but 1v1 — règles pures (aucun rendu, aucun réseau, aucune dépendance).
 *
 * Le but est vu DE FACE et découpé en 6 cases (3 colonnes × 2 lignes) :
 *
 *    0 │ 1 │ 2     ← lucarnes (haut)
 *   ───┼───┼───
 *    3 │ 4 │ 5     ← ras de terre (bas)
 *
 * Le tireur vise UNE case. Le gardien choisit UNE case aussi mais, comme il plonge,
 * il couvre également les cases orthogonalement adjacentes : choisir la 3 (bas gauche)
 * couvre la 3, la 4 (à sa droite) et la 0 (au-dessus). Le tir est donc arrêté si la
 * case visée tombe dans la zone couverte.
 */

export const GRID_COLS = 3;
export const GRID_ROWS = 2;
export const CELL_COUNT = GRID_COLS * GRID_ROWS; // 6

/** Nombre de tireurs composant une équipe (l'ordre de sélection = l'ordre de passage). */
export const SQUAD_SIZE = 5;
/** Tirs réglementaires par équipe avant la mort subite. */
export const REGULATION_ROUNDS = 5;

export type Side = 'player1' | 'player2';

export const CELL_NAMES = [
  'Lucarne gauche', 'Lucarne centre', 'Lucarne droite',
  'Bas gauche', 'Bas centre', 'Bas droite',
];

export function cellRow(cell: number) { return Math.floor(cell / GRID_COLS); }
export function cellCol(cell: number) { return cell % GRID_COLS; }
export function isValidCell(cell: unknown): cell is number {
  return Number.isInteger(cell) && (cell as number) >= 0 && (cell as number) < CELL_COUNT;
}

/**
 * Cases couvertes par le plongeon du gardien : la case choisie + ses voisines
 * orthogonales (jamais les diagonales — un plongeon ne traverse pas le but).
 */
export function keeperCoverage(cell: number): number[] {
  if (!isValidCell(cell)) return [];
  const row = cellRow(cell);
  const col = cellCol(cell);
  const cells = [cell];
  if (col > 0) cells.push(cell - 1);
  if (col < GRID_COLS - 1) cells.push(cell + 1);
  if (row > 0) cells.push(cell - GRID_COLS);
  if (row < GRID_ROWS - 1) cells.push(cell + GRID_COLS);
  return cells.sort((a, b) => a - b);
}

/** Le tir est-il arrêté ? (case visée dans la zone couverte par le gardien) */
export function isSaved(shotCell: number, keeperCell: number): boolean {
  if (!isValidCell(shotCell) || !isValidCell(keeperCell)) return false;
  return keeperCoverage(keeperCell).includes(shotCell);
}

/** Quel tireur de l'effectif passe, selon le nombre de tirs déjà effectués (boucle en mort subite). */
export function shooterIndex(shotsTaken: number): number {
  return ((shotsTaken % SQUAD_SIZE) + SQUAD_SIZE) % SQUAD_SIZE;
}

/** À qui de tirer : celui qui ouvre la manche, puis l'autre. */
export function sideToShoot(p1Shots: number, p2Shots: number, firstShooter: Side = 'player1'): Side {
  const other: Side = firstShooter === 'player1' ? 'player2' : 'player1';
  return p1Shots === p2Shots ? firstShooter : other;
}

/** Manche en cours (1-based) : elle n'avance que quand les deux ont tiré. */
export function currentRound(p1Shots: number, p2Shots: number): number {
  return Math.min(p1Shots, p2Shots) + 1;
}

export interface MatchOutcome {
  finished: boolean;
  winner: Side | null;
}

/**
 * Issue du match après un tir, règle officielle des tirs au but :
 *  - pendant les 5 tirs réglementaires, on s'arrête dès que l'écart n'est plus
 *    rattrapable avec les tirs restants (inutile de tirer pour rien) ;
 *  - une fois les 5 tirs joués des deux côtés, on ne départage qu'à ÉGALITÉ de
 *    tirs effectués → mort subite : manches supplémentaires jusqu'à ce qu'un seul
 *    des deux marque sur la manche.
 */
export function evaluateMatch(
  p1Score: number, p2Score: number,
  p1Shots: number, p2Shots: number,
): MatchOutcome {
  const left1 = Math.max(0, REGULATION_ROUNDS - p1Shots);
  const left2 = Math.max(0, REGULATION_ROUNDS - p2Shots);

  // Encore dans les 5 tirs réglementaires
  if (left1 > 0 || left2 > 0) {
    if (p1Score > p2Score + left2) return { finished: true, winner: 'player1' };
    if (p2Score > p1Score + left1) return { finished: true, winner: 'player2' };
    return { finished: false, winner: null };
  }

  // Réglementaire terminé (ou mort subite) : on ne tranche qu'à égalité de tirs
  if (p1Shots === p2Shots && p1Score !== p2Score) {
    return { finished: true, winner: p1Score > p2Score ? 'player1' : 'player2' };
  }
  return { finished: false, winner: null };
}

/** Historique compact stocké en RTDB : 'O' = marqué, 'X' = raté. */
export function appendMark(marks: string | undefined | null, scored: boolean): string {
  return (marks ?? '') + (scored ? 'O' : 'X');
}
