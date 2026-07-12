import { Match, Player, NewsArticle, Post } from '../types';

// ─── Teams ────────────────────────────────────────────────────────────────────

const BARCA: import('../types').Team = {
  name: 'FC Barcelona',
  shortName: 'FCB',
  logo: '🔵🔴',
  color: '#A50044',
};

const teams: Record<string, import('../types').Team> = {
  realmadrid: { name: 'Real Madrid', shortName: 'RMA', logo: '⚪', color: '#FEBE10' },
  atletico: { name: 'Atletico Madrid', shortName: 'ATM', logo: '🔴⚪', color: '#CB3524' },
  sevilla: { name: 'Sevilla FC', shortName: 'SEV', logo: '⚪🔴', color: '#D7282F' },
  valencia: { name: 'Valencia CF', shortName: 'VAL', logo: '🟡⚫', color: '#EE7000' },
  bilbao: { name: 'Athletic Bilbao', shortName: 'ATH', logo: '🔴⚪', color: '#EE2523' },
  villarreal: { name: 'Villarreal CF', shortName: 'VIL', logo: '🟡', color: '#FFC91C' },
  osasuna: { name: 'CA Osasuna', shortName: 'OSA', logo: '🔴', color: '#D0021B' },
  getafe: { name: 'Getafe CF', shortName: 'GET', logo: '🔵', color: '#005BAC' },
  benfica: { name: 'SL Benfica', shortName: 'BEN', logo: '🔴', color: '#E4001B' },
  dortmund: { name: 'Borussia Dortmund', shortName: 'BVB', logo: '🟡⚫', color: '#FDE100' },
  psg: { name: 'Paris Saint-Germain', shortName: 'PSG', logo: '🔵🔴', color: '#004170' },
};

// ─── Matches ──────────────────────────────────────────────────────────────────

export const MATCHES: Match[] = [
  {
    id: 'm1',
    homeTeam: BARCA,
    awayTeam: teams.osasuna,
    date: '2026-03-08T21:00:00',
    competition: 'La Liga',
    venue: 'Estadi Olímpic Lluís Companys',
    homeScore: 3,
    awayScore: 1,
    status: 'finished',
  },
  {
    id: 'm2',
    homeTeam: teams.getafe,
    awayTeam: BARCA,
    date: '2026-04-05T18:30:00',
    competition: 'La Liga',
    venue: 'Coliseum Alfonso Pérez',
    homeScore: 0,
    awayScore: 2,
    status: 'finished',
  },
  {
    id: 'm3',
    homeTeam: BARCA,
    awayTeam: teams.benfica,
    date: '2026-04-09T21:00:00',
    competition: 'Champions League',
    venue: 'Estadi Olímpic Lluís Companys',
    homeScore: 3,
    awayScore: 1,
    status: 'finished',
  },
  {
    id: 'm4',
    homeTeam: BARCA,
    awayTeam: teams.realmadrid,
    date: '2026-04-12T21:00:00',
    competition: 'La Liga',
    venue: 'Estadi Olímpic Lluís Companys',
    status: 'upcoming',
  },
  {
    id: 'm5',
    homeTeam: teams.benfica,
    awayTeam: BARCA,
    date: '2026-04-16T21:00:00',
    competition: 'Champions League',
    venue: 'Estádio da Luz',
    status: 'upcoming',
  },
  {
    id: 'm6',
    homeTeam: BARCA,
    awayTeam: teams.villarreal,
    date: '2026-04-19T21:00:00',
    competition: 'La Liga',
    venue: 'Estadi Olímpic Lluís Companys',
    status: 'upcoming',
  },
];

// ─── Squad FC Barcelona 2026/27 ───────────────────────────────────────────────

export const PLAYERS: Player[] = [
  // ── Gardiens ──
  { id: 'p_garcia',    name: 'Joan García',        position: 'GK',  number: 25, photo: '🧤', nationality: '🇪🇸', averageRating: 7.8, totalVotes: 1120 },
  { id: 'p_szczesny',  name: 'Wojciech Szczęsny',  position: 'GK',  number: 13, photo: '🧤', nationality: '🇵🇱', averageRating: 7.9, totalVotes: 890 },
  { id: 'p_kochen',    name: 'Diego Kochen',        position: 'GK',  number: 26, photo: '🧤', nationality: '🇦🇷', averageRating: 6.8, totalVotes: 120 },
  { id: 'p_aller',     name: 'Eder Aller',          position: 'GK',  number: 28, photo: '🧤', nationality: '🇪🇸', averageRating: 6.5, totalVotes: 80 },

  // ── Défenseurs ──
  { id: 'p_ericgarcia',  name: 'Éric García',          position: 'DEF', number: 24, photo: '🛡️', nationality: '🇪🇸', averageRating: 7.5, totalVotes: 560 },
  { id: 'p_cancelo',    name: 'João Cancelo',          position: 'DEF', number: 2,  photo: '🛡️', nationality: '🇵🇹', averageRating: 7.7, totalVotes: 980 },
  { id: 'p_balde',      name: 'Alejandro Balde',       position: 'DEF', number: 3,  photo: '🛡️', nationality: '🇪🇸', averageRating: 7.5, totalVotes: 870 },
  { id: 'p_cubarsi',    name: 'Pau Cubarsí',           position: 'DEF', number: 33, photo: '🛡️', nationality: '🇪🇸', averageRating: 8.2, totalVotes: 1340 },
  { id: 'p_christensen',name: 'Andreas Christensen',   position: 'DEF', number: 15, photo: '🛡️', nationality: '🇩🇰', averageRating: 7.4, totalVotes: 620 },
  { id: 'p_gmartin',    name: 'Gerard Martín',         position: 'DEF', number: 12, photo: '🛡️', nationality: '🇪🇸', averageRating: 7.2, totalVotes: 480 },
  { id: 'p_kounde',     name: 'Jules Koundé',          position: 'DEF', number: 23, photo: '🛡️', nationality: '🇫🇷', averageRating: 8.0, totalVotes: 1050 },
  { id: 'p_torrents',   name: 'Jofre Torrents',        position: 'DEF', number: 31, photo: '🛡️', nationality: '🇪🇸', averageRating: 6.5, totalVotes: 60 },
  { id: 'p_cortes',     name: 'Álvaro Cortés',         position: 'DEF', number: 32, photo: '🛡️', nationality: '🇪🇸', averageRating: 6.3, totalVotes: 40 },
  { id: 'p_sdominguez', name: 'Sergi Domínguez',       position: 'DEF', number: 38, photo: '🛡️', nationality: '🇪🇸', averageRating: 6.2, totalVotes: 30 },
  { id: 'p_espart',     name: 'Xavi Espart',           position: 'DEF', number: 36, photo: '🛡️', nationality: '🇪🇸', averageRating: 6.4, totalVotes: 35 },
  { id: 'p_farre',      name: 'Landry Farré',          position: 'DEF', number: 39, photo: '🛡️', nationality: '🇫🇷', averageRating: 6.3, totalVotes: 25 },

  // ── Milieux ──
  { id: 'p_pedri',       name: 'Pedri',            position: 'MID', number: 8,  photo: '⚙️', nationality: '🇪🇸', averageRating: 8.6, totalVotes: 2100 },
  { id: 'p_gavi',        name: 'Gavi',             position: 'MID', number: 6,  photo: '⚙️', nationality: '🇪🇸', averageRating: 8.3, totalVotes: 1950 },
  { id: 'p_fermin',      name: 'Fermín López',     position: 'MID', number: 16, photo: '⚙️', nationality: '🇪🇸', averageRating: 7.8, totalVotes: 1100 },
  { id: 'p_casado',      name: 'Marc Casadó',      position: 'MID', number: 14, photo: '⚙️', nationality: '🇪🇸', averageRating: 7.7, totalVotes: 920 },
  { id: 'p_olmo',        name: 'Dani Olmo',        position: 'MID', number: 20, photo: '⚙️', nationality: '🇪🇸', averageRating: 8.0, totalVotes: 1450 },
  { id: 'p_dejong',      name: 'Frenkie de Jong',  position: 'MID', number: 21, photo: '⚙️', nationality: '🇳🇱', averageRating: 7.9, totalVotes: 1560 },
  { id: 'p_bernal',      name: 'Marc Bernal',      position: 'MID', number: 22, photo: '⚙️', nationality: '🇪🇸', averageRating: 7.5, totalVotes: 340 },
  { id: 'p_drofernandez',name: 'Dro Fernández',    position: 'MID', number: 5,  photo: '⚙️', nationality: '🇪🇸', averageRating: 6.5, totalVotes: 67 },
  { id: 'p_guille',      name: 'Guille Fernández', position: 'MID', number: 30, photo: '⚙️', nationality: '🇪🇸', averageRating: 6.2, totalVotes: 30 },
  { id: 'p_juanhdez',    name: 'Juan Hernández',   position: 'MID', number: 41, photo: '⚙️', nationality: '🇪🇸', averageRating: 6.0, totalVotes: 25 },
  { id: 'p_tommy',       name: 'Tommy Marqués',    position: 'MID', number: 43, photo: '⚙️', nationality: '🇪🇸', averageRating: 6.1, totalVotes: 20 },
  { id: 'p_danirod',     name: 'Dani Rodríguez',   position: 'MID', number: 46, photo: '⚙️', nationality: '🇪🇸', averageRating: 6.0, totalVotes: 15 },

  // ── Attaquants ──
  { id: 'p_rashford',      name: 'Marcus Rashford',    position: 'ATT', number: 17, photo: '⚡', nationality: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', averageRating: 7.6, totalVotes: 890 },
  { id: 'p_ferrantorres',  name: 'Ferran Torres',      position: 'ATT', number: 7,  photo: '⚡', nationality: '🇪🇸', averageRating: 7.7, totalVotes: 1100 },
  { id: 'p_lewy',          name: 'Robert Lewandowski', position: 'ATT', number: 9,  photo: '⚡', nationality: '🇵🇱', averageRating: 8.4, totalVotes: 2300 },
  { id: 'p_yamal',         name: 'Lamine Yamal',       position: 'ATT', number: 10, photo: '⚡', nationality: '🇪🇸', averageRating: 9.1, totalVotes: 3200 },
  { id: 'p_raphinha',      name: 'Raphinha',           position: 'ATT', number: 11, photo: '⚡', nationality: '🇧🇷', averageRating: 8.8, totalVotes: 2450 },
  { id: 'p_bardghji',      name: 'Roony Bardghji',     position: 'ATT', number: 19, photo: '⚡', nationality: '🇸🇪', averageRating: 7.2, totalVotes: 420 },
  { id: 'p_tonifernandez', name: 'Toni Fernández',     position: 'ATT', number: 29, photo: '⚡', nationality: '🇪🇸', averageRating: 6.3, totalVotes: 25 },
];

// ─── News ─────────────────────────────────────────────────────────────────────

export const NEWS: NewsArticle[] = [
  {
    id: 'n1',
    title: 'Victoire convaincante contre Osasuna (3-1)',
    summary: 'Le Barça a dominé Osasuna avec un doublé de Lewandowski et un but de Raphinha.',
    imageEmoji: '⚽',
    date: '2026-03-08',
    category: 'Match',
    readTime: 3,
  },
];

// ─── Users & Posts ────────────────────────────────────────────────────────────

export const CURRENT_USER = {
  id: 'me',
  username: 'BarçaFan',
  avatar: '🔵🔴',
};

export const POSTS: Post[] = [
  {
    id: 'post1',
    userId: 'user1',
    username: 'Barça4Ever',
    avatar: '🔵',
    content: 'Quel match contre Osasuna ! Lewandowski en feu avec son doublé et Raphinha qui régale sur le côté... Ce Barça est tout simplement magnifique cette saison. Visca el Barça! 🔵🔴',
    likes: 247,
    comments: 38,
    likedByMe: false,
    createdAt: '2026-03-31T22:15:00',
    tag: 'match',
  },
  {
    id: 'post2',
    userId: 'user2',
    username: 'LamineFan19',
    avatar: '⚡',
    content: 'Lamine Yamal à 18 ans... Je regarderai ce garçon pendant les 15 prochaines années et je dirai à mes enfants que j\'étais là depuis le début. Un génie générationnel. 🌟',
    likes: 512,
    comments: 64,
    likedByMe: true,
    createdAt: '2026-03-31T19:30:00',
    tag: 'opinion',
  },
  {
    id: 'post3',
    userId: 'user3',
    username: 'FCBStats',
    avatar: '📊',
    content: 'Stats de la saison :\n• Buts : 78 en 32 matchs\n• Possession moy. : 66%\n• Passes précises : 91%\n\nLa meilleure attaque d\'Europe. 💪',
    likes: 189,
    comments: 21,
    likedByMe: false,
    createdAt: '2026-03-31T16:45:00',
    tag: 'news',
  },
  {
    id: 'post4',
    userId: 'user4',
    username: 'CulerParis',
    avatar: '🗼',
    content: 'Le Clásico le 12 avril... Ma demande de congé est déjà posée 😂 On va les défoncer à l\'Estadi ! Força Barça 💙❤️',
    likes: 334,
    comments: 87,
    likedByMe: false,
    createdAt: '2026-03-31T14:20:00',
    tag: 'match',
  },
  {
    id: 'post5',
    userId: 'user5',
    username: 'PedriMagic',
    avatar: '⚙️',
    content: 'Pedri est revenu au niveau qu\'on attendait tous. Sa vision du jeu, ses passes millimétrées... Il est simplement le meilleur milieu du monde en ce moment. Point final. 🎯',
    likes: 421,
    comments: 55,
    likedByMe: true,
    createdAt: '2026-03-30T20:00:00',
    tag: 'opinion',
  },
  {
    id: 'post6',
    userId: 'user6',
    username: 'BarçaWorld',
    avatar: '🌍',
    content: 'Champions League vs Benfica en quarts 🏆\nAllons chercher cette finale ! Après le Clásico, ce sera notre vrai test européen. Je crois en cette équipe plus que jamais.',
    likes: 278,
    comments: 43,
    likedByMe: false,
    createdAt: '2026-03-30T17:30:00',
    tag: 'match',
  },
  {
    id: 'post7',
    userId: 'user7',
    username: 'HistoireFCB',
    avatar: '🏛️',
    content: 'Le futur Camp Nou avec 105 000 places... Les images sont juste incroyables. Ce sera le plus beau stade du monde, digne du plus grand club du monde. 🏟️✨',
    likes: 651,
    comments: 92,
    likedByMe: false,
    createdAt: '2026-03-29T12:00:00',
    tag: 'news',
  },
  {
    id: 'post8',
    userId: 'user8',
    username: 'RaphinhaBR',
    avatar: '🇧🇷',
    content: 'Raphinha cette saison c\'est 22 buts et 14 passes décisives. Le Ballon d\'Or est pour lui cette année, arrêtez de dormir sur cet homme. Absolument incroyable. 🔥',
    likes: 889,
    comments: 124,
    likedByMe: true,
    createdAt: '2026-03-29T09:00:00',
    tag: 'opinion',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getNextMatch(): Match | undefined {
  const now = new Date();
  return MATCHES.find(
    (m) => m.status === 'upcoming' && new Date(m.date) > now
  );
}

export function getUpcomingMatches(): Match[] {
  const now = new Date();
  return MATCHES.filter(
    (m) => m.status === 'upcoming' && new Date(m.date) > now
  ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export function getFinishedMatches(): Match[] {
  return MATCHES.filter((m) => m.status === 'finished').sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

export function getPlayerById(id: string): Player | undefined {
  return PLAYERS.find((p) => p.id === id);
}
