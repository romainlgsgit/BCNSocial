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
  coins: number;
  points: number;
  pronostics: Pronostic[];
  joinedAt: string;
}

export type PostTag = 'match' | 'opinion' | 'news';

export interface Post {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  avatarPhoto?: string;
  verified?: boolean;
  content: string;
  likedBy: string[];
  comments: number;
  createdAt: string;
  tag?: PostTag;
}

export interface Comment {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  avatarPhoto?: string;
  verified?: boolean;
  content: string;
  createdAt: string;
}
