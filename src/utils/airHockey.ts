// Constantes du terrain (coordonnées canoniques, partagées par GameContext et ShootoutScreen)
export const FIELD_WIDTH = 280;
export const FIELD_HEIGHT = 440;
export const PADDLE_RADIUS = 26;
export const BALL_RADIUS = 11;
export const GOAL_WIDTH = 110; // largeur de l'ouverture du but, centrée sur l'axe X
export const SERVE_SPEED = 140; // vitesse de remise en jeu (engagement)

export function initialBallState() {
  // Engagement de départ : la balle part vers un camp au hasard (valeur stockée dans
  // le doc → identique pour les deux joueurs) au lieu de rester immobile au centre.
  const dir = Math.random() < 0.5 ? 1 : -1;
  return { ballX: FIELD_WIDTH / 2, ballY: FIELD_HEIGHT / 2, ballVX: 0, ballVY: SERVE_SPEED * dir };
}

export function initialPaddleState() {
  return {
    player1PaddleX: FIELD_WIDTH / 2,
    player1PaddleY: FIELD_HEIGHT - PADDLE_RADIUS - 20,
    player2PaddleX: FIELD_WIDTH / 2,
    player2PaddleY: PADDLE_RADIUS + 20,
  };
}
