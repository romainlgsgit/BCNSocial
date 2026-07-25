export type MatchResult = 'win' | 'draw' | 'loss' | null;

export interface Team {
  name: string;
  shortName: string;
  logo: string; // emoji or URL
  color?: string; // primary club color for badge display
}

export interface Match {
  id: string;
  homeTeam: Team;
  awayTeam: Team;
  date: string; // ISO string
  competition: string;
  competitionLogo?: string;
  venue: string;
  homeScore?: number;
  awayScore?: number;
  status: 'upcoming' | 'live' | 'finished';
  lineup?: Player[]; // joueurs ayant joué ce match
}

export interface PlayerRating {
  playerId: string;
  matchId: string;
  rating: number; // 1-10
  votes: number;
}

export interface Player {
  id: string;
  name: string;
  position: string;
  number: number;
  photo: string; // emoji placeholder
  nationality: string;
  averageRating: number;
  totalVotes: number;
  photoUrl?: string; // photo custom (admin ou Wikipedia)
  photoBase64?: string; // photo galerie, stockée en base64 (visible par tous, comme les posts/profils)
}

export interface Pronostic {
  id: string;
  userId: string;
  matchId: string;
  prediction: 'home' | 'draw' | 'away';
  coinsWagered: number;
  potentialWin: number;
  result?: 'won' | 'lost' | 'pending';
}

export interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  imageEmoji: string;
  date: string;
  category: string;
  readTime: number;
}

export interface User {
  id: string;
  username: string;
  email: string;
  avatar: string;
  photoBase64?: string;
  verified?: boolean;
  /** Certification or — accordée manuellement par un admin, remplace le badge bleu */
  goldVerified?: boolean;
  liveNotifEnabled?: boolean;
  mentionNotifEnabled?: boolean;
  lastUsernameChange?: string;
  coins: number;
  /** Monnaie obtenue UNIQUEMENT en échangeant des pièces (cf. config/store) */
  dollars: number;
  points: number;
  /** Série de quiz recopiée depuis `quizResults` — seule copie lisible par les autres
   *  membres, donc la source du badge affiché sur l'avatar. Peut être périmée :
   *  toujours la passer par `effectiveStreak` avec `quizLastPlayed`. */
  quizStreak?: number;
  quizLastPlayed?: string;
  /** Affichage du badge de série sur la photo de profil. Absent = activé (défaut). */
  badgeVisible?: boolean;
  followersCount?: number;
  followingCount?: number;
  pronostics: Pronostic[];
  joinedAt: string;
}

export type PostTag = 'match' | 'opinion' | 'news';

export interface MentionUser {
  id: string;
  username: string;
}

export interface Post {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  avatarPhoto?: string;
  verified?: boolean;
  goldVerified?: boolean;
  content: string;
  imageBase64?: string;
  mentionedUsers?: MentionUser[];
  likedBy: string[];
  comments: number;
  createdAt: string;
  tag?: PostTag;
}

// ─── Mini-jeu "Tir au but" 1v1 — air hockey version foot ──────────────────────
// Terrain vertical partagé, coordonnées canoniques : but de player1 en bas
// (y = FIELD_HEIGHT), but de player2 en haut (y = 0). player1 fait autorité sur
// la physique de la balle (host) ; player2 (guest) suit l'état reçu et lisse.

// Un pion sur le terrain (football sur plateau), coordonnées canoniques
export interface GamePawn {
  id: string;     // p0..p3 (index dans le roster)
  x: number;
  y: number;
  isGK: boolean;
  name: string;   // joueur Barça (cosmétique / photo)
}

// Dernier tir joué — permet à l'adversaire de rejouer l'animation
export interface GameShot {
  by: 'player1' | 'player2';
  pawnId: string;
  vx: number;
  vy: number;
  seq: number;
}

export interface GameSession {
  id: string;
  participants: Record<string, boolean>; // {uid: true} — vérifié par les règles RTDB
  player1Id: string;
  player2Id: string;
  player1Username: string;
  player2Username: string;
  player1Score: number;
  player2Score: number;

  // Déroulé de la partie
  phase: 'setup' | 'playing' | 'finished';
  player1Ready: boolean;
  player2Ready: boolean;
  player1OffFormation: string;
  player1DefFormation: string;
  player2OffFormation: string;
  player2DefFormation: string;
  attackingTeam: 'player1' | 'player2'; // équipe en formation offensive (celle qui engage)
  turn: 'player1' | 'player2';          // à qui de jouer
  shotsLeft: number;                    // tirs restants dans le tour courant
  kickoffPending: boolean;              // vrai juste après un engagement : le 1er tir ne peut pas marquer

  // État physique (canonique). RTDB omet les tableaux vides / valeurs nulles → optionnels.
  player1Pawns?: GamePawn[];
  player2Pawns?: GamePawn[];
  ballX: number;
  ballY: number;
  lastShot?: GameShot | null;
  settledSeq: number; // incrémenté à chaque tir résolu (autorité du tireur)

  status: 'active' | 'finished';
  winnerId?: string | null;
  payoutDone?: boolean;
  createdAt: any;
  updatedAt?: any;
}

// ─── Tirs au but 1v1 ────────────────────────────────────────────────────────────

/** Joueur retenu dans l'effectif (photo résolue localement via PlayersContext). */
export interface PenaltyTaker {
  id: string;
  name: string;
}

/** Résultat d'un tir, rejoué à l'identique par les deux clients. */
export interface PenaltyResult {
  round: number;
  shooter: 'player1' | 'player2';
  shotCell: number;
  keeperCell: number;
  scored: boolean;
  seq: number;
}

export interface PenaltySession {
  id: string;
  participants: Record<string, boolean>; // {uid: true} — vérifié par les règles RTDB
  player1Id: string;
  player2Id: string;
  player1Username: string;
  player2Username: string;
  player1Score: number;
  player2Score: number;
  player1Shots: number;
  player2Shots: number;

  phase: 'setup' | 'playing' | 'finished';
  player1Ready: boolean;
  player2Ready: boolean;

  // Effectifs (RTDB omet les tableaux vides → optionnels)
  player1Squad?: PenaltyTaker[];
  player2Squad?: PenaltyTaker[];
  player1GK?: PenaltyTaker | null;
  player2GK?: PenaltyTaker | null;

  firstShooter: 'player1' | 'player2'; // tiré au sort au coup d'envoi
  turn: 'player1' | 'player2';         // qui TIRE (l'autre est dans les cages)
  shooterPick?: number | null;         // case visée, effacée après résolution
  keeperPick?: number | null;          // case plongée, effacée après résolution
  player1Marks?: string;               // 'O' marqué / 'X' raté, dans l'ordre
  player2Marks?: string;
  lastResult?: PenaltyResult | null;
  seq: number;                         // incrémenté à chaque tir résolu

  status: 'active' | 'finished';
  winnerId?: string | null;
  payoutDone?: boolean;
  createdAt: any;
}

export interface GameInvite {
  id: string; // `${toId}_${fromId}_${mode}`
  fromId: string;
  fromUsername: string;
  fromAvatar: string;
  fromPlayerName: string;
  toId: string;
  mode?: 'football' | 'penalty'; // absent = anciennes invitations → football
  status: 'pending' | 'accepted' | 'declined';
  createdAt: any;
}

export interface Comment {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  avatarPhoto?: string;
  verified?: boolean;
  goldVerified?: boolean;
  content: string;
  mentionedUsers?: MentionUser[];
  createdAt: string;
}
