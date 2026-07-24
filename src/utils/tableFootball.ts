// ─── Football sur plateau (tour par tour) ──────────────────────────────────────
// Moteur physique simple à base de disques (pions + balle) : intégration, rebonds
// murs, collisions élastiques disque-disque, frottement jusqu'à l'arrêt, détection
// de but. Coordonnées CANONIQUES (repère de player1 : son but est en bas, y grand ;
// le but de player2 est en haut, y petit). L'affichage de player2 est miroir 180°.

export const FIELD_WIDTH = 330;
export const FIELD_HEIGHT = 500;
export const BALL_RADIUS = 11;
export const PAWN_RADIUS = 18;
export const GK_RADIUS = 27; // le gardien est plus gros
export const GOAL_WIDTH = 135; // ouverture du but, centrée sur l'axe X
export const WIN_SCORE = 5;

// Physique
const RESTITUTION = 0.78;     // élasticité des chocs
const RETENTION = 0.32;       // fraction de vitesse conservée par seconde (frottement)
const STOP_SPEED = 7;         // px/s en dessous : on considère le disque arrêté
const CAPTURE_MARGIN = 5;     // px : distance à laquelle la balle se colle à un pion ami
export const MAX_SHOT_SPEED = 1550; // px/s
export const MIN_SHOT_SPEED = 120;
export const SHOT_POWER = 6.5;      // conversion (distance de glisse en px) → vitesse

const BALL_MASS = 1;
const PAWN_MASS = 3;
const GK_MASS = 20; // gardien très lourd → difficile à bouger par la balle/l'adversaire

export type Team = 'player1' | 'player2';

export interface Disc {
  kind: 'ball' | 'pawn';
  x: number; y: number; vx: number; vy: number;
  r: number; m: number;
  team?: Team;
  id?: string;   // identifiant du pion dans son équipe (p0..p3)
  isGK?: boolean;
  name?: string; // joueur Barça (cosmétique)
}

export function makeBall(x = FIELD_WIDTH / 2, y = FIELD_HEIGHT / 2): Disc {
  return { kind: 'ball', x, y, vx: 0, vy: 0, r: BALL_RADIUS, m: BALL_MASS };
}

export function pawnDisc(p: { id: string; x: number; y: number; isGK: boolean; team: Team; name?: string }): Disc {
  return {
    kind: 'pawn', x: p.x, y: p.y, vx: 0, vy: 0,
    r: p.isGK ? GK_RADIUS : PAWN_RADIUS, m: p.isGK ? GK_MASS : PAWN_MASS,
    team: p.team, id: p.id, isGK: p.isGK, name: p.name,
  };
}

function inGoalMouth(x: number) {
  return x > (FIELD_WIDTH - GOAL_WIDTH) / 2 && x < (FIELD_WIDTH + GOAL_WIDTH) / 2;
}

// Résout une collision élastique entre deux disques (séparation + impulsion).
function collide(a: Disc, b: Disc) {
  const dx = b.x - a.x, dy = b.y - a.y;
  let d = Math.hypot(dx, dy);
  if (d === 0) { d = 0.01; }
  const overlap = a.r + b.r - d;
  if (overlap <= 0) return;
  const nx = dx / d, ny = dy / d;
  const invA = 1 / a.m, invB = 1 / b.m, invSum = invA + invB;
  // Séparation proportionnelle à l'inverse de la masse
  a.x -= nx * overlap * (invA / invSum); a.y -= ny * overlap * (invA / invSum);
  b.x += nx * overlap * (invB / invSum); b.y += ny * overlap * (invB / invSum);
  const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
  const vn = rvx * nx + rvy * ny;
  if (vn > 0) return; // se séparent déjà
  const j = -(1 + RESTITUTION) * vn / invSum;
  const jx = j * nx, jy = j * ny;
  a.vx -= jx * invA; a.vy -= jy * invA;
  b.vx += jx * invB; b.vy += jy * invB;
}

export interface StepOpts {
  // Équipe qui tire : la balle SE COLLE à un de ses pions dès qu'elle l'approche
  // (système de passes) ; sur un pion adverse elle rebondit normalement.
  stickTeam?: Team;
  stickExcludeId?: string; // le pion qui vient de frapper (pour ne pas se coller à lui)
}

// Tente de coller la balle à un pion ami. Renvoie true si collage effectué.
function tryStick(ball: Disc, pawn: Disc, opts: StepOpts): boolean {
  if (!opts.stickTeam || pawn.team !== opts.stickTeam || pawn.id === opts.stickExcludeId) return false;
  const dx = ball.x - pawn.x, dy = ball.y - pawn.y;
  const dist = Math.hypot(dx, dy) || 0.001;
  if (dist > ball.r + pawn.r + CAPTURE_MARGIN) return false;
  const nx = dx / dist, ny = dy / dist;
  ball.x = pawn.x + nx * (ball.r + pawn.r);
  ball.y = pawn.y + ny * (ball.r + pawn.r);
  ball.vx = 0; ball.vy = 0; pawn.vx = 0; pawn.vy = 0;
  return true;
}

// Un sous-pas de simulation. Renvoie l'équipe qui a marqué si but, sinon null.
function substep(discs: Disc[], h: number, opts: StepOpts): Team | null {
  for (const d of discs) {
    d.x += d.vx * h; d.y += d.vy * h;

    if (d.kind === 'ball') {
      if (d.y - d.r < 0) {
        if (inGoalMouth(d.x)) return 'player1';
        d.y = d.r; d.vy = Math.abs(d.vy) * RESTITUTION;
      }
      if (d.y + d.r > FIELD_HEIGHT) {
        if (inGoalMouth(d.x)) return 'player2';
        d.y = FIELD_HEIGHT - d.r; d.vy = -Math.abs(d.vy) * RESTITUTION;
      }
    } else {
      if (d.y - d.r < 0) { d.y = d.r; d.vy = Math.abs(d.vy) * RESTITUTION; }
      if (d.y + d.r > FIELD_HEIGHT) { d.y = FIELD_HEIGHT - d.r; d.vy = -Math.abs(d.vy) * RESTITUTION; }
    }
    if (d.x - d.r < 0) { d.x = d.r; d.vx = Math.abs(d.vx) * RESTITUTION; }
    if (d.x + d.r > FIELD_WIDTH) { d.x = FIELD_WIDTH - d.r; d.vx = -Math.abs(d.vx) * RESTITUTION; }
  }

  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < discs.length; i++) {
      for (let k = i + 1; k < discs.length; k++) {
        const a = discs[i], b = discs[k];
        // Collage balle → pion ami (priorité sur le rebond)
        if (a.kind === 'ball' && b.kind === 'pawn' && tryStick(a, b, opts)) continue;
        if (b.kind === 'ball' && a.kind === 'pawn' && tryStick(b, a, opts)) continue;
        collide(a, b);
      }
    }
  }

  const damp = Math.pow(RETENTION, h);
  for (const d of discs) {
    d.vx *= damp; d.vy *= damp;
    if (Math.hypot(d.vx, d.vy) < STOP_SPEED) { d.vx = 0; d.vy = 0; }
  }
  return null;
}

// Avance le monde de `dt` secondes en sous-pas fins (anti-tunneling). Renvoie le buteur.
export function stepWorld(discs: Disc[], dt: number, opts: StepOpts = {}): Team | null {
  const steps = Math.max(1, Math.ceil(dt / 0.004));
  const h = dt / steps;
  for (let s = 0; s < steps; s++) {
    const goal = substep(discs, h, opts);
    if (goal) return goal;
  }
  return null;
}

// Tout le monde est-il arrêté ?
export function worldAtRest(discs: Disc[]) {
  return discs.every(d => d.vx === 0 && d.vy === 0);
}

// La balle touche-t-elle (au repos) un pion de l'équipe donnée ? → droit de rejouer.
export function ballTouchesTeam(ball: Disc, pawns: Disc[], team: Team) {
  const slack = 3;
  return pawns.some(p => p.team === team && Math.hypot(ball.x - p.x, ball.y - p.y) <= ball.r + p.r + slack);
}

// ─── Formations prédéfinies (repère player1 : moitié BASSE, y ∈ [240,480]) ───────
// Chaque preset = positions des 3 pions de champ. Le gardien est placé à part.

export const GK_POS = { x: FIELD_WIDTH / 2, y: FIELD_HEIGHT - GK_RADIUS - 6 };

// Positions en FRACTIONS du terrain (fx ∈ [0,1] largeur, fy ∈ [0.5,1] moitié basse) →
// indépendantes de la taille du terrain, s'adaptent à tous les écrans.
export interface Formation { id: string; name: string; outfield: { fx: number; fy: number }[]; }

export const OFFENSIVE_FORMATIONS: Formation[] = [
  { id: 'off_arrow', name: 'Flèche', outfield: [{ fx: 0.5, fy: 0.535 }, { fx: 0.31, fy: 0.665 }, { fx: 0.69, fy: 0.665 }] },
  { id: 'off_line',  name: 'Ligne haute', outfield: [{ fx: 0.28, fy: 0.585 }, { fx: 0.5, fy: 0.585 }, { fx: 0.72, fy: 0.585 }] },
  { id: 'off_wings', name: 'Ailes', outfield: [{ fx: 0.22, fy: 0.64 }, { fx: 0.78, fy: 0.64 }, { fx: 0.5, fy: 0.54 }] },
];

export const DEFENSIVE_FORMATIONS: Formation[] = [
  { id: 'def_wall', name: 'Mur', outfield: [{ fx: 0.29, fy: 0.87 }, { fx: 0.5, fy: 0.87 }, { fx: 0.71, fy: 0.87 }] },
  { id: 'def_tri',  name: 'Triangle bas', outfield: [{ fx: 0.28, fy: 0.92 }, { fx: 0.72, fy: 0.92 }, { fx: 0.5, fy: 0.79 }] },
  { id: 'def_box',  name: 'Cage', outfield: [{ fx: 0.37, fy: 0.825 }, { fx: 0.63, fy: 0.825 }, { fx: 0.5, fy: 0.92 }] },
];

export function formationById(id: string): Formation | undefined {
  return [...OFFENSIVE_FORMATIONS, ...DEFENSIVE_FORMATIONS].find(f => f.id === id);
}

// Miroir 180° d'un point canonique (pour poser la formation de player2 dans SA moitié).
export function mirror(p: { x: number; y: number }) {
  return { x: FIELD_WIDTH - p.x, y: FIELD_HEIGHT - p.y };
}

export interface PawnState { id: string; x: number; y: number; isGK: boolean; name: string; }

// Construit les 4 pions d'une équipe (1 gardien + 3 de champ) à partir d'un roster de
// 4 noms (indices), de l'index du gardien, et de la formation choisie. `team` détermine
// le côté (player1 = bas en canonique, player2 = miroir en haut).
export function buildPawns(
  names: string[], gkIndex: number, formation: Formation, team: Team,
): PawnState[] {
  const gk = team === 'player1' ? GK_POS : mirror(GK_POS);
  const outfield = names
    .map((name, i) => ({ name, i }))
    .filter(({ i }) => i !== gkIndex);
  const pawns: PawnState[] = [{ id: 'p' + gkIndex, x: gk.x, y: gk.y, isGK: true, name: names[gkIndex] }];
  outfield.forEach(({ name, i }, k) => {
    const f = formation.outfield[k] ?? { fx: 0.5, fy: 0.7 };
    const raw = { x: f.fx * FIELD_WIDTH, y: f.fy * FIELD_HEIGHT };
    const pos = team === 'player1' ? raw : mirror(raw);
    pawns.push({ id: 'p' + i, x: pos.x, y: pos.y, isGK: false, name });
  });
  return pawns;
}

// Reconstruit le roster (noms indexés + index du gardien) depuis les pions stockés.
export function rosterOf(pawns: PawnState[]): { names: string[]; gkIndex: number } {
  const names: string[] = [];
  let gkIndex = 0;
  for (const p of pawns) {
    const i = parseInt(p.id.slice(1), 10) || 0;
    names[i] = p.name;
    if (p.isGK) gkIndex = i;
  }
  return { names, gkIndex };
}

interface RosterDoc {
  player1Pawns?: PawnState[]; player2Pawns?: PawnState[];
  player1OffFormation: string; player1DefFormation: string;
  player2OffFormation: string; player2DefFormation: string;
}

// Positions d'engagement : l'équipe `attacker` prend sa formation OFFENSIVE, l'autre sa
// DÉFENSIVE, balle au centre. Utilisé au coup d'envoi initial et après chaque but.
export function kickoffState(doc: RosterDoc, attacker: Team) {
  const r1 = rosterOf(doc.player1Pawns ?? []);
  const r2 = rosterOf(doc.player2Pawns ?? []);
  const f1 = formationById(attacker === 'player1' ? doc.player1OffFormation : doc.player1DefFormation)
    ?? DEFENSIVE_FORMATIONS[0];
  const f2 = formationById(attacker === 'player2' ? doc.player2OffFormation : doc.player2DefFormation)
    ?? DEFENSIVE_FORMATIONS[0];
  return {
    player1Pawns: buildPawns(r1.names, r1.gkIndex, f1, 'player1'),
    player2Pawns: buildPawns(r2.names, r2.gkIndex, f2, 'player2'),
    ballX: FIELD_WIDTH / 2,
    ballY: FIELD_HEIGHT / 2,
  };
}
