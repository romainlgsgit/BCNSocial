import React, { createContext, useContext, useState, useEffect, useRef, useMemo, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { doc, setDoc, updateDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Match, Team } from '../types';
import {
  requestNotificationPermission,
  sendMatchStartNotification,
  sendGoalNotification,
  sendMatchEndNotification,
  setPushBroadcastEnabled,
} from '../services/NotificationService';
import { attResolved } from '../utils/attGate';

// ─── Source ───────────────────────────────────────────────────────────────────
// ESPN (gratuit, sans clé) : calendrier, prochains matchs, résultats ET score/timer live

// ─── Test du direct hors saison ───────────────────────────────────────────────
// Le Barça ne joue pas l'été : pour valider le chemin live sur un vrai match, pointer
// temporairement l'app sur une autre équipe. Verrouillé sur __DEV__ → ne peut jamais
// partir en production, même si on oublie de remettre à null.
// Ex. { teamId: '436', leagues: ['uefa.champions_qual'] }  → Fenerbahce
type LiveTestConfig = { teamId: string; leagues: string[] } | null;

// ⬇️ Hors saison, pour tester le direct sur un vrai match : viser une autre équipe.
//   ex. { teamId: '20301', leagues: ['uefa.champions_qual'] }
// Penser à mettre à jour LIVE_TEST_EXPIRY ci-dessous avant de publier une OTA de test.
const LIVE_TEST_CONFIG = null as LiveTestConfig;

// Garde-fou : le mode test s'éteint TOUT SEUL à cette date, même sans nouvelle
// publication. Impossible de le laisser traîner en production par oubli.
const LIVE_TEST_EXPIRY = Date.parse('2026-07-22T02:00:00Z');

const DEV_LIVE_TEST: LiveTestConfig =
  Date.now() < LIVE_TEST_EXPIRY ? LIVE_TEST_CONFIG : null;

const BARCA_ESPN_ID = DEV_LIVE_TEST?.teamId ?? '83';
// En mode test : notif locale conservée, fan-out coupé (voir NotificationService).
setPushBroadcastEnabled(!DEV_LIVE_TEST);
const espnSummaryUrl = (league: string, eventId: string) =>
  `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/summary?event=${eventId}`;
const espnScoreboardUrl = (league: string, dates: string) =>
  `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard?dates=${dates}`;
// Compétitions où Barça peut jouer (pour le lookup ESPN par date + le calendrier)
export const BARCA_LEAGUES: string[] = DEV_LIVE_TEST?.leagues
  ?? ['esp.1', 'esp.copa_del_rey', 'esp.super_cup', 'uefa.champions', 'fifa.cwc', 'club.friendly'];
// Libellés plus lisibles que le nom ESPN brut pour certaines compétitions
const LEAGUE_NAME_OVERRIDES: Record<string, string> = {
  'club.friendly': 'Match amical',
};

// Cadence d'appel ESPN (aucune lecture Firestore : le score arrive par onSnapshot).
// Seul l'appareil qui REGARDE le score poll vite ; les autres se contentent d'écouter.
const POLL_INTERVAL_LIVE     = 8 * 1000;       // 8s — écran du score ouvert
const POLL_INTERVAL_IDLE_UI  = 60 * 1000;      // 60s — app ouverte, autre écran
const POLL_INTERVAL_PREMATCH = 5 * 60 * 1000;  // 5 min loin du KO
const PREMATCH_WINDOW_MS     = 15 * 60 * 1000;
// Dispersion aléatoire pour éviter que tous les appareils appellent ESPN en phase
const POLL_JITTER_MS = 2 * 1000;

// Fenêtre "coup d'envoi" → polling serré pour démarrer ASAP
const KO_WINDOW_BEFORE_MS = 2 * 60 * 1000;
const KO_WINDOW_AFTER_MS  = 10 * 60 * 1000;

// TTL du cache Firestore — ESPN illimité, on cache court (délai max ~20s)
const CACHE_MS_LIVE    = 12_000;
const CACHE_MS_PAUSED  = 12_000;
const CACHE_MS_KICKOFF = 12_000;
const CACHE_MS_IDLE    = 60_000;

const CACHE_TTL_MS       = 10 * 60 * 1000;
// v6/v5 : bump après migration football-data.org → ESPN (schéma d'ID différent)
// Suffixe en mode test : le cache contient le match d'UNE équipe donnée, donc changer
// d'équipe suivie doit changer de cache — sinon l'app continue d'afficher l'ancien
// match à la une pendant tout le TTL. Le cache de production reste intact à côté.
const CACHE_SUFFIX       = DEV_LIVE_TEST ? `_t${DEV_LIVE_TEST.teamId}` : '';
const CACHE_KEY_FEATURED = `cache_featured_v6${CACHE_SUFFIX}`;
const CACHE_KEY_MONTHLY  = `cache_monthly_v5${CACHE_SUFFIX}`;

export interface MatchGoal {
  scorer: string;
  team: 'home' | 'away';
  minute: string; // "28'", "45+2'", "90+3'"
  isPenalty?: boolean;
  isOwnGoal?: boolean;
}

export interface LiveMatchData {
  status: 'SCHEDULED' | 'TIMED' | 'IN_PLAY' | 'PAUSED' | 'FINISHED' | 'SUSPENDED' | 'POSTPONED';
  homeScore: number | null;
  awayScore: number | null;
  minute: number | null;
  goals?: MatchGoal[];
}

// Match créé et piloté à la main par l'admin (Firestore, partagé par tous les
// utilisateurs) — remplace le match auto (ESPN) tant que active=true.
export interface MatchOverride {
  active: boolean;
  homeTeam: Team;
  awayTeam: Team;
  date: string;
  competition: string;
  venue: string;
  status: 'upcoming' | 'live' | 'finished';
  homeScore: number | null;
  awayScore: number | null;
}

interface MatchContextType {
  featuredMatch: Match | null;
  nextMatches: Match[];
  monthlyMatches: Match[];
  isLoadingMatches: boolean;
  isLoadingMonthly: boolean;
  monthlyError: boolean;
  retryMonthly: () => void;
  setFeaturedMatch: (match: Match) => void;
  apiMatchId: string | null;
  setApiMatchId: (id: string | null) => void;
  liveData: LiveMatchData | null;
  liveMinute: number | null;
  matchOverrideActive: boolean;
  // À activer par l'écran qui affiche le score live : lui seul interroge ESPN à
  // cadence rapide, les autres appareils se contentent de l'écouteur partagé.
  setLiveScreenActive: (active: boolean) => void;
  createManualMatch: (m: { homeTeam: Team; awayTeam: Team; date: string; competition: string; venue: string }) => Promise<void>;
  setManualLive: () => Promise<void>;
  updateManualScore: (homeScore: number, awayScore: number) => Promise<void>;
  finishManualMatch: (homeScore: number, awayScore: number) => Promise<void>;
  resetMatchOverride: () => Promise<void>;
}

const MatchContext = createContext<MatchContextType | undefined>(undefined);

const MATCH_OVERRIDE_REF = doc(db, 'config', 'matchOverride');
// Délai avant de revenir automatiquement au match ESPN après la fin
// d'un match manuel — laisse le temps aux utilisateurs de voir le score final.
const MANUAL_FINISH_REVERT_DELAY_MS = 8_000;

// ─── ESPN status mapping (pour le live) ───────────────────────────────────────

function mapEspnStatus(name: string, state?: string): LiveMatchData['status'] {
  // Overrides spécifiques (pause / fin / annulé)
  switch (name) {
    case 'STATUS_HALFTIME':
    case 'STATUS_END_PERIOD':             return 'PAUSED';
    case 'STATUS_FULL_TIME':
    case 'STATUS_FINAL':
    case 'STATUS_FINAL_AET':
    case 'STATUS_FINAL_PEN':              return 'FINISHED';
    case 'STATUS_POSTPONED':
    case 'STATUS_CANCELED':
    case 'STATUS_FORFEIT':                return 'POSTPONED';
  }
  // Fallback basé sur state (gère STATUS_FIRST_HALF, STATUS_SECOND_HALF, STATUS_OVERTIME, etc.)
  if (state === 'in')   return 'IN_PLAY';
  if (state === 'post') return 'FINISHED';
  return 'SCHEDULED';
}

// "19'" → 19, "45+2'" → 47, "90+3'" → 93
function parseDisplayClock(s: any): number | null {
  if (typeof s !== 'string') return null;
  const m = s.match(/^(\d+)(?:\+(\d+))?/);
  if (!m) return null;
  return parseInt(m[1], 10) + (m[2] ? parseInt(m[2], 10) : 0);
}

function extractEspnScore(s: any): number | null {
  if (s == null) return null;
  if (typeof s === 'number') return s;
  if (typeof s === 'string') {
    const n = parseInt(s, 10);
    return Number.isNaN(n) ? null : n;
  }
  if (typeof s === 'object') {
    if (typeof s.value === 'number') return s.value;
    if (typeof s.displayValue === 'string') {
      const n = parseInt(s.displayValue, 10);
      return Number.isNaN(n) ? null : n;
    }
  }
  return null;
}

// ─── Cache helpers (AsyncStorage) ─────────────────────────────────────────────

async function saveCache(key: string, data: any) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch {}
}

async function loadCache<T>(key: string): Promise<{ data: T; isStale: boolean } | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    return { data, isStale: Date.now() - ts > CACHE_TTL_MS };
  } catch {
    return null;
  }
}

// ─── ESPN : calendrier (mapping événement → Match) ────────────────────────────

function mapEspnTeam(t: any): Team {
  const displayName: string = t.displayName ?? t.name ?? '';
  return {
    name: displayName,
    shortName: t.abbreviation ?? displayName.slice(0, 3).toUpperCase(),
    logo: t.logo ?? t.logos?.[0]?.href ?? '',
    color: displayName.toLowerCase().includes('barcelona') ? '#A50044' : '#333',
  };
}

function mapEspnMatchStatus(name: string, state?: string): 'upcoming' | 'live' | 'finished' {
  const s = mapEspnStatus(name, state);
  if (s === 'FINISHED') return 'finished';
  if (s === 'IN_PLAY' || s === 'PAUSED') return 'live';
  return 'upcoming';
}

function mapEspnEvent(ev: any, leagueName: string): Match {
  const comp = ev.competitions?.[0] ?? {};
  const competitors = comp.competitors ?? [];
  const home = competitors.find((c: any) => c.homeAway === 'home') ?? competitors[0];
  const away = competitors.find((c: any) => c.homeAway === 'away') ?? competitors[1];
  const st = comp.status ?? {};
  return {
    id: String(ev.id),
    homeTeam: mapEspnTeam(home?.team ?? {}),
    awayTeam: mapEspnTeam(away?.team ?? {}),
    date: ev.date,
    competition: leagueName,
    venue: comp.venue?.fullName ?? '',
    homeScore: extractEspnScore(home?.score) ?? undefined,
    awayScore: extractEspnScore(away?.score) ?? undefined,
    status: mapEspnMatchStatus(st.type?.name ?? '', st.type?.state),
  };
}

// Scanne toutes les compétitions où Barça peut jouer sur une plage de dates
// (YYYYMMDD-YYYYMMDD) et retourne les matchs Barça triés chronologiquement.
async function fetchEspnMatchesInRange(fromYmd: string, toYmd: string): Promise<Match[]> {
  const dateRange = `${fromYmd}-${toYmd}`;
  const results = await Promise.all(
    BARCA_LEAGUES.map(league =>
      fetch(espnScoreboardUrl(league, dateRange))
        .then(r => r.json())
        .then(json => ({
          leagueName: LEAGUE_NAME_OVERRIDES[league] ?? json.leagues?.[0]?.name ?? league,
          events: (json.events ?? []) as any[],
        }))
        .catch(() => ({ leagueName: league, events: [] as any[] }))
    )
  );

  const matches: Match[] = [];
  for (const { leagueName, events } of results) {
    for (const ev of events) {
      const competitors = ev.competitions?.[0]?.competitors ?? [];
      const involvesBarca = competitors.some(
        (c: any) =>
          String(c.team?.id) === BARCA_ESPN_ID ||
          (c.team?.displayName ?? '').toLowerCase().includes('barcelona')
      );
      if (!involvesBarca) continue;
      matches.push(mapEspnEvent(ev, leagueName));
    }
  }
  return matches.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

// Les amistosos ne sont pas pariables (comme avant, football-data.org ne les
// remontait pas) — ils peuvent être le match "featured" (affichage), mais pas next3.
const FRIENDLY_COMPETITION_NAME = LEAGUE_NAME_OVERRIDES['club.friendly'];
const isBettable = (m: Match) => m.competition !== FRIENDLY_COMPETITION_NAME;

async function fetchFeaturedAndNext(): Promise<{ featured: Match; apiId: string; next3: Match[] } | null> {
  const now = new Date();
  const from = formatDateYmd(new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000));
  const to = formatDateYmd(new Date(now.getTime() + 120 * 24 * 60 * 60 * 1000));
  const matches = await fetchEspnMatchesInRange(from, to);

  const live = matches.find(m => m.status === 'live');
  if (live) return { featured: live, apiId: live.id, next3: isBettable(live) ? [live] : [] };

  const upcoming = matches.filter(m => m.status === 'upcoming');
  // Fin de saison / intersaison sans match programmé → mettre en avant le dernier match joué
  if (!upcoming.length) return fetchLastFinishedMatch();
  return { featured: upcoming[0], apiId: upcoming[0].id, next3: upcoming.filter(isBettable).slice(0, 3) };
}

async function fetchNextScheduledMatch(): Promise<{ featured: Match; apiId: string; next3: Match[] } | null> {
  const now = new Date();
  const from = formatDateYmd(now);
  const to = formatDateYmd(new Date(now.getTime() + 120 * 24 * 60 * 60 * 1000));
  const matches = await fetchEspnMatchesInRange(from, to);
  const upcoming = matches.filter(m => m.status !== 'finished');
  // Plus aucun match programmé (intersaison / fin de saison) → retomber sur le dernier match joué
  if (!upcoming.length) return fetchLastFinishedMatch();
  return { featured: upcoming[0], apiId: upcoming[0].id, next3: upcoming.filter(isBettable).slice(0, 3) };
}

// Dernier match joué (fin de saison : il n'y a plus de match à venir à mettre en avant)
async function fetchLastFinishedMatch(): Promise<{ featured: Match; apiId: string; next3: Match[] } | null> {
  try {
    const now = new Date();
    const from = formatDateYmd(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
    const to = formatDateYmd(now);
    const matches = await fetchEspnMatchesInRange(from, to);
    const finished = matches.filter(m => m.status === 'finished').reverse(); // plus récent d'abord
    if (!finished.length) return null;
    // next3 vide : pas de pronos possibles hors saison
    return { featured: finished[0], apiId: finished[0].id, next3: [] };
  } catch {
    return null;
  }
}

async function fetchMonthlyMatches(): Promise<Match[]> {
  const now = new Date();
  const y = now.getFullYear();
  const mo = now.getMonth();
  const last = new Date(y, mo + 1, 0).getDate();
  const from = formatDateYmd(new Date(y, mo, 1));
  const to = formatDateYmd(new Date(y, mo, last));
  return fetchEspnMatchesInRange(from, to);
}

// ─── ESPN : score + timer live ────────────────────────────────────────────────

function formatDateYmd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

// Trouve l'ID ESPN + le slug de ligue pour un match Barça à une date donnée.
// Appelé une seule fois quand le polling live démarre.
async function resolveEspnMatch(matchDate: Date): Promise<{ eventId: string; leagueSlug: string } | null> {
  // Fenêtre de ±1 jour autour de la date pour gérer les fuseaux horaires
  const day = 24 * 60 * 60 * 1000;
  const from = formatDateYmd(new Date(matchDate.getTime() - day));
  const to = formatDateYmd(new Date(matchDate.getTime() + day));
  const dateRange = `${from}-${to}`;

  const fetches = BARCA_LEAGUES.map(league =>
    fetch(espnScoreboardUrl(league, dateRange))
      .then(r => r.json())
      .then(json => ({ league, events: json.events ?? [] as any[] }))
      .catch(() => ({ league, events: [] as any[] }))
  );
  const results = await Promise.all(fetches);

  // Sélectionner l'event Barça le plus proche temporellement de matchDate
  let best: { eventId: string; leagueSlug: string; dt: number } | null = null;
  for (const { league, events } of results) {
    for (const ev of events) {
      const competitors = ev.competitions?.[0]?.competitors ?? [];
      const involvesBarca = competitors.some(
        (c: any) =>
          String(c.team?.id) === BARCA_ESPN_ID ||
          (c.team?.displayName ?? '').toLowerCase().includes('barcelona')
      );
      if (!involvesBarca) continue;
      const evDate = new Date(ev.date).getTime();
      const dt = Math.abs(evDate - matchDate.getTime());
      if (!best || dt < best.dt) {
        best = { eventId: String(ev.id), leagueSlug: league, dt };
      }
    }
  }
  return best ? { eventId: best.eventId, leagueSlug: best.leagueSlug } : null;
}

// Extrait les buts depuis ESPN keyEvents (scoringPlay=true).
// ESPN met le champ `team` sur l'équipe qui marque le point (correct même pour CSC).
function extractGoals(keyEvents: any[], homeId?: string): MatchGoal[] {
  const goals: MatchGoal[] = [];
  for (const ev of keyEvents ?? []) {
    if (!ev?.scoringPlay) continue;
    const typeStr: string = (ev.type?.type ?? '').toLowerCase();
    // Ignorer les tirs au but
    if (typeStr.includes('shootout') || ev.shootout) continue;

    const teamId = String(ev.team?.id ?? '');
    const team: 'home' | 'away' = teamId === String(homeId ?? '') ? 'home' : 'away';
    const scorer = ev.participants?.[0]?.athlete?.displayName?.trim() || 'Inconnu';
    const minute = ev.clock?.displayValue || '';

    goals.push({
      scorer,
      team,
      minute,
      isPenalty: typeStr.includes('penalty'),
      isOwnGoal: typeStr.includes('own-goal') || typeStr.includes('own goal'),
    });
  }
  return goals;
}

async function callEspnLive(leagueSlug: string, eventId: string): Promise<LiveMatchData | null> {
  const res = await fetch(espnSummaryUrl(leagueSlug, eventId));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const comp = json.header?.competitions?.[0];
  if (!comp) return null;

  const competitors = comp.competitors ?? [];
  const home = competitors.find((c: any) => c.homeAway === 'home') ?? competitors[0];
  const away = competitors.find((c: any) => c.homeAway === 'away') ?? competitors[1];
  const st = comp.status ?? {};
  const status = mapEspnStatus(st.type?.name ?? '', st.type?.state);

  // Minute : displayClock ("19'", "45+2'", "67'") est déjà la minute affichée du match.
  // Fallback sur clock (secondes dans la période courante) + offset de période.
  let minute: number | null = null;
  if (status === 'IN_PLAY') {
    minute = parseDisplayClock(st.displayClock);
    if (minute === null && typeof st.clock === 'number') {
      const periodOffset: Record<number, number> = { 1: 0, 2: 45, 3: 90, 4: 105 };
      const offset = periodOffset[st.period ?? 1] ?? 0;
      minute = offset + Math.floor(st.clock / 60);
    }
  } else if (status === 'PAUSED') {
    const periodEnd: Record<number, number> = { 1: 45, 2: 90, 3: 105, 4: 120 };
    minute = periodEnd[st.period ?? 1] ?? null;
  }

  const goals = extractGoals(json.keyEvents ?? [], home?.team?.id);

  return {
    status,
    homeScore: extractEspnScore(home?.score) ?? 0,
    awayScore: extractEspnScore(away?.score) ?? 0,
    minute,
    goals,
  };
}

const LIVE_CACHE_REF = doc(db, 'liveMatch', 'current');

// Forme brute du doc partagé `liveMatch/current`.
export interface LiveCacheDoc {
  eventId: string | null;
  /** Compétition ESPN du match — évite à chaque appareil de la re-chercher au lancement. */
  leagueSlug?: string | null;
  status: LiveMatchData['status'] | null;
  homeScore: number | null;
  awayScore: number | null;
  goals?: MatchGoal[];
  // Ancre de minute : la minute n'est PAS réécrite chaque minute (sinon chaque
  // appareil paierait une lecture par minute) — elle est extrapolée en local.
  minuteAnchor?: number | null;
  minuteAnchorAt?: number | null;
  /** Ancien schéma (avant l'ancre de minute) — repli le temps que le doc soit réécrit. */
  minute?: number | null;
  updatedAt?: any;
}

function docToLive(c: LiveCacheDoc | null): LiveMatchData | null {
  if (!c?.status) return null;
  return {
    status: c.status,
    homeScore: c.homeScore,
    awayScore: c.awayScore,
    minute: c.minuteAnchor ?? c.minute ?? null,
    goals: Array.isArray(c.goals) ? c.goals : [],
  };
}

// Une écriture ne doit avoir lieu QUE si le contenu visible change : chaque écriture
// coûte une lecture à TOUS les appareils abonnés (onSnapshot). La minute et
// `updatedAt` sont volontairement exclues de la comparaison.
function liveDataChanged(prev: LiveCacheDoc | null, next: LiveMatchData | null, eventId: string): boolean {
  if (!prev || prev.eventId !== eventId) return true;
  if ((prev.status ?? null) !== (next?.status ?? null)) return true;
  if ((prev.homeScore ?? null) !== (next?.homeScore ?? null)) return true;
  if ((prev.awayScore ?? null) !== (next?.awayScore ?? null)) return true;
  const prevGoals = Array.isArray(prev.goals) ? prev.goals : [];
  const nextGoals = next?.goals ?? [];
  if (prevGoals.length !== nextGoals.length) return true;
  return prevGoals.some((g, i) =>
    g.scorer !== nextGoals[i]?.scorer || g.minute !== nextGoals[i]?.minute || g.team !== nextGoals[i]?.team
  );
}

function cacheTtlFor(status: LiveMatchData['status'] | null | undefined, inKOWindow: boolean): number {
  if (status === 'IN_PLAY') return CACHE_MS_LIVE;
  if (status === 'PAUSED') return CACHE_MS_PAUSED;
  if (inKOWindow) return CACHE_MS_KICKOFF;
  return CACHE_MS_IDLE;
}

// Rafraîchit le cache partagé depuis ESPN si besoin. Le cache est lu depuis le
// snapshot LOCAL (déjà en mémoire grâce à onSnapshot) → 0 lecture Firestore par
// cycle, contre 1 auparavant. L'écriture n'a lieu que si le score change vraiment.
async function refreshSharedLive(
  eventId: string,
  leagueSlug: string,
  matchDateMs: number,
  cached: LiveCacheDoc | null,
  cachedAtMs: number | null
): Promise<LiveMatchData | null> {
  const now = Date.now();
  const msFromKO = now - matchDateMs;
  const inKOWindow = msFromKO > -KO_WINDOW_BEFORE_MS && msFromKO < KO_WINDOW_AFTER_MS;

  // Un autre appareil vient de rafraîchir : rien à faire, on a déjà la donnée.
  if (cached && cached.eventId === eventId && cachedAtMs !== null) {
    if (now - cachedAtMs < cacheTtlFor(cached.status, inKOWindow)) return docToLive(cached);
  }

  const live = await callEspnLive(leagueSlug, eventId);

  // Le slug manquant justifie une écriture même sans changement de score : sinon un doc
  // écrit avant cette version ne l'obtiendrait qu'au premier but. Écriture unique par match.
  if (liveDataChanged(cached, live, eventId) || cached?.leagueSlug !== leagueSlug) {
    setDoc(LIVE_CACHE_REF, {
      eventId,
      leagueSlug,
      status: live?.status ?? null,
      homeScore: live?.homeScore ?? null,
      awayScore: live?.awayScore ?? null,
      goals: live?.goals ?? [],
      minuteAnchor: live?.minute ?? null,
      minuteAnchorAt: Date.now(),
      updatedAt: serverTimestamp(),
    }).catch(() => {});
  }

  return live;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function MatchProvider({ children }: { children: ReactNode }) {
  const [featuredMatch, setFeaturedMatch] = useState<Match | null>(null);
  const [nextMatches, setNextMatches] = useState<Match[]>([]);
  const [monthlyMatches, setMonthlyMatches] = useState<Match[]>([]);
  const [isLoadingMatches, setIsLoadingMatches] = useState(true);
  const [isLoadingMonthly, setIsLoadingMonthly] = useState(true);
  const [monthlyError, setMonthlyError] = useState(false);
  const [apiMatchId, setApiMatchId] = useState<string | null>(null);
  const [liveData, setLiveData] = useState<LiveMatchData | null>(null);
  const [liveMinute, setLiveMinute] = useState<number | null>(null);
  const [matchOverride, setMatchOverrideState] = useState<MatchOverride | null>(null);
  const prevLiveRef = useRef<LiveMatchData | null>(null);
  const notifReadyRef = useRef(false);
  const featuredMatchRef = useRef<Match | null>(null);
  const forceRefreshRef = useRef<(() => void) | null>(null);
  const minuteBaseRef = useRef<{ minute: number; at: number } | null>(null);
  const apiMatchIdRef = useRef<string | null>(null);
  // Dernier état connu du doc partagé, tenu à jour par onSnapshot → sert de cache
  // de fraîcheur LOCAL (aucune lecture Firestore) avant de décider d'appeler ESPN.
  const liveDocRef = useRef<LiveCacheDoc | null>(null);
  const liveDocAtRef = useRef<number | null>(null);
  const espnRefsRef = useRef<{ eventId: string; leagueSlug: string } | null>(null);
  // L'écran qui affiche le score est-il ouvert ? Pilote la cadence d'appel ESPN.
  const [liveScreenActive, setLiveScreenActive] = useState(false);
  const liveScreenActiveRef = useRef(false);
  const appActiveRef = useRef(true);
  const matchOverrideActiveRef = useRef(false);

  useEffect(() => {
    // Attend que la demande ATT soit résolue : iOS n'affiche qu'une seule demande
    // de permission système à la fois, donc les demander en parallèle au lancement
    // fait ignorer silencieusement l'une des deux.
    attResolved.then(() => requestNotificationPermission()).then(granted => {
      notifReadyRef.current = granted;
    });
  }, []);

  useEffect(() => {
    featuredMatchRef.current = featuredMatch;
  }, [featuredMatch]);

  // Match manuel (admin) partagé via Firestore — vu par tous les utilisateurs
  useEffect(() => {
    const unsub = onSnapshot(MATCH_OVERRIDE_REF, snap => {
      setMatchOverrideState(snap.exists() ? (snap.data() as MatchOverride) : null);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    apiMatchIdRef.current = apiMatchId;
  }, [apiMatchId]);

  useEffect(() => { liveScreenActiveRef.current = liveScreenActive; }, [liveScreenActive]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      appActiveRef.current = state === 'active';
      if (state === 'active') {
        forceRefreshRef.current?.();
        if (minuteBaseRef.current && liveData?.status === 'IN_PLAY') {
          const elapsed = Math.floor((Date.now() - minuteBaseRef.current.at) / 60000);
          setLiveMinute(minuteBaseRef.current.minute + elapsed);
        }
      }
    });
    return () => sub.remove();
  }, [liveData?.status]);

  useEffect(() => {
    if (liveData?.status !== 'IN_PLAY') return;
    const interval = setInterval(() => {
      if (!minuteBaseRef.current) return;
      const elapsed = Math.floor((Date.now() - minuteBaseRef.current.at) / 60000);
      setLiveMinute(minuteBaseRef.current.minute + elapsed);
    }, 60000);
    return () => clearInterval(interval);
  }, [liveData?.status]);

  const loadFeatured = async () => {
    try {
      const result = await fetchFeaturedAndNext();
      if (result) {
        setFeaturedMatch(result.featured);
        setApiMatchId(result.apiId);
        setNextMatches(result.next3);
        await saveCache(CACHE_KEY_FEATURED, result);
      }
    } catch {}
  };

  const loadMonthly = async (forceRefresh = false) => {
    setMonthlyError(false);

    if (!forceRefresh) {
      const cached = await loadCache<Match[]>(CACHE_KEY_MONTHLY);
      if (cached) {
        setMonthlyMatches(cached.data);
        setIsLoadingMonthly(false);
        if (!cached.isStale) return;
      }
    }

    try {
      const matches = await fetchMonthlyMatches();
      setMonthlyMatches(matches);
      await saveCache(CACHE_KEY_MONTHLY, matches);
      setMonthlyError(false);
    } catch {
      const cached = await loadCache<Match[]>(CACHE_KEY_MONTHLY);
      if (!cached) setMonthlyError(true);
    } finally {
      setIsLoadingMonthly(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      const cachedFeatured = await loadCache<{ featured: Match; apiId: string; next3: Match[] }>(CACHE_KEY_FEATURED);
      if (cachedFeatured) {
        setFeaturedMatch(cachedFeatured.data.featured);
        setApiMatchId(cachedFeatured.data.apiId);
        setNextMatches(cachedFeatured.data.next3);
        setIsLoadingMatches(false);

        if (!cachedFeatured.isStale) {
          await loadMonthly();
          return;
        }
      }

      try {
        const result = await fetchFeaturedAndNext();
        if (result) {
          setFeaturedMatch(result.featured);
          setApiMatchId(result.apiId);
          setNextMatches(result.next3);
          await saveCache(CACHE_KEY_FEATURED, result);
        }
      } catch {}
      setIsLoadingMatches(false);

      await new Promise(r => setTimeout(r, 1500));
      await loadMonthly();
    };

    init();
  }, []);

  const matchOverrideActive = matchOverride?.active === true;
  matchOverrideActiveRef.current = matchOverrideActive;

  // Après la fin d'un match : recharger le calendrier et passer au match suivant.
  // Ce rechargement balaie plusieurs compétitions sur 4 mois (payload ESPN lourd) et
  // se déclenche au même instant sur tous les appareils → on l'étale sur 25s pour
  // éviter que 150 clients ne tapent ESPN en même temps au coup de sifflet final.
  const handleMatchFinished = () => {
    setTimeout(async () => {
      await loadMonthly(true);
      try {
        const result = await fetchNextScheduledMatch();
        if (result) {
          setFeaturedMatch(result.featured);
          setApiMatchId(result.apiId);
          setNextMatches(result.next3);
          await saveCache(CACHE_KEY_FEATURED, result);
        }
      } catch {}
    }, MANUAL_FINISH_REVERT_DELAY_MS + Math.random() * 25_000);
  };

  // ── Score live partagé : UN écouteur, pas de polling Firestore ────────────────
  // Coût par appareil : 1 lecture à l'abonnement + 1 lecture par changement RÉEL de
  // score/statut (~10 sur un match), contre ~900 auparavant (1 getDoc / 8s).
  // C'est aussi ici que partent les notifications : un appareil qui n'appelle jamais
  // ESPN (app ouverte sur un autre écran) reçoit quand même le but et le notifie.
  const isFirstLiveSnapshotRef = useRef(true);
  useEffect(() => {
    const unsub = onSnapshot(LIVE_CACHE_REF, snap => {
      const c = (snap.exists() ? snap.data() : null) as LiveCacheDoc | null;
      liveDocRef.current = c;
      liveDocAtRef.current = c?.updatedAt?.toMillis?.() ?? Date.now();

      const wasFirst = isFirstLiveSnapshotRef.current;
      isFirstLiveSnapshotRef.current = false;

      // Ignorer un doc qui concerne un autre match (ex. match précédent pas encore écrasé)
      const currentEventId = espnRefsRef.current?.eventId ?? apiMatchIdRef.current;
      if (!c?.eventId || (currentEventId && c.eventId !== currentEventId)) return;
      if (matchOverrideActiveRef.current) return;

      const d = docToLive(c);
      if (!d) return;
      setLiveData(d);

      // Minute : extrapolée depuis l'ancre écrite dans le doc (elle n'est pas
      // réécrite chaque minute — l'interval local de 60s fait avancer le compteur).
      const anchor = c.minuteAnchor ?? c.minute ?? null;
      if (anchor != null) {
        const anchoredAt = c.minuteAnchorAt ?? Date.now();
        const cur = minuteBaseRef.current;
        if (!cur || cur.minute !== anchor) {
          minuteBaseRef.current = { minute: anchor, at: anchoredAt };
          const elapsed = d.status === 'IN_PLAY' ? Math.floor((Date.now() - anchoredAt) / 60000) : 0;
          setLiveMinute(anchor + elapsed);
        }
      }

      const prev = prevLiveRef.current;
      prevLiveRef.current = d;
      // Pas de notification sur le tout premier snapshot (état initial, pas un événement)
      if (wasFirst || !prev || !notifReadyRef.current) return;

      const match = featuredMatchRef.current;
      const isBarcaHome = match ? match.homeTeam.name.toLowerCase().includes('barcelona') : true;
      const homeName = match?.homeTeam.shortName ?? 'DOM';
      const awayName = match?.awayTeam.shortName ?? 'EXT';

      if ((prev.status === 'SCHEDULED' || prev.status === 'TIMED') && d.status === 'IN_PLAY') {
        sendMatchStartNotification(match?.homeTeam.name ?? homeName, match?.awayTeam.name ?? awayName);
      }

      const prevHome = prev.homeScore ?? 0;
      const prevAway = prev.awayScore ?? 0;
      const newHome = d.homeScore ?? 0;
      const newAway = d.awayScore ?? 0;
      if (newHome - prevHome > 0) sendGoalNotification(match?.homeTeam.name ?? homeName, homeName, awayName, newHome, newAway, isBarcaHome, newHome - prevHome, c.eventId);
      if (newAway - prevAway > 0) sendGoalNotification(match?.awayTeam.name ?? awayName, homeName, awayName, newHome, newAway, !isBarcaHome, newAway - prevAway, c.eventId);

      if ((prev.status === 'IN_PLAY' || prev.status === 'PAUSED') && d.status === 'FINISHED') {
        sendMatchEndNotification(homeName, awayName, newHome, newAway, c.eventId);
        handleMatchFinished();
      }
    }, () => {});
    return () => unsub();
  }, []);

  // Polling live — résout l'ID ESPN du match (par date) puis poll ESPN summary
  // Suspendu tant qu'un match manuel (admin) est actif : le score vient alors
  // directement du doc Firestore matchOverride, pas d'ESPN.
  useEffect(() => {
    setLiveData(null);
    prevLiveRef.current = null;
    if (!featuredMatch || matchOverrideActive) { forceRefreshRef.current = null; return; }

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const matchDateMs = new Date(featuredMatch.date).getTime();
    const matchDate = new Date(featuredMatch.date);
    espnRefsRef.current = null;

    const triggerNow = () => {
      if (stopped) return;
      if (timer) { clearTimeout(timer); timer = null; }
      poll();
    };
    forceRefreshRef.current = triggerNow;

    // Cadence live : rapide seulement si l'utilisateur REGARDE le score. Sinon le
    // score arrive quand même par onSnapshot dès qu'un autre appareil le publie.
    const liveInterval = () =>
      (liveScreenActiveRef.current ? POLL_INTERVAL_LIVE : POLL_INTERVAL_IDLE_UI)
      + Math.random() * POLL_JITTER_MS;

    const scheduleNext = (d: LiveMatchData | null) => {
      if (stopped) return;
      const now = Date.now();
      const msFromKO = now - matchDateMs;
      const inKO = msFromKO > -KO_WINDOW_BEFORE_MS && msFromKO < KO_WINDOW_AFTER_MS;

      if (d?.status === 'IN_PLAY' || d?.status === 'PAUSED') {
        timer = setTimeout(poll, liveInterval());
      } else if (d?.status === 'FINISHED') {
        // Plus de polling après la fin du match
      } else if (inKO) {
        timer = setTimeout(poll, liveInterval());
      } else {
        const msUntilPrematch = matchDateMs - KO_WINDOW_BEFORE_MS - PREMATCH_WINDOW_MS - now;
        if (msUntilPrematch > 0) {
          timer = setTimeout(poll, Math.min(msUntilPrematch, 3_600_000));
        } else {
          timer = setTimeout(poll, POLL_INTERVAL_PREMATCH);
        }
      }
    };

    const poll = async () => {
      if (stopped) return;

      // App en arrière-plan : aucun appel réseau. Les buts arrivent par push Expo,
      // et l'AppState 'active' relance un rafraîchissement immédiat au retour.
      if (!appActiveRef.current) {
        timer = setTimeout(poll, POLL_INTERVAL_IDLE_UI);
        return;
      }

      // Résolution de l'ID ESPN. Raccourci : si le doc partagé porte déjà sur ce match,
      // il contient l'ID et la compétition → on interroge ESPN immédiatement au lieu de
      // scanner 6 compétitions d'abord (~1-3s de score périmé affiché au lancement).
      if (!espnRefsRef.current) {
        const shared = liveDocRef.current;
        if (shared?.eventId && shared.leagueSlug && shared.eventId === featuredMatch.id) {
          espnRefsRef.current = { eventId: shared.eventId, leagueSlug: shared.leagueSlug };
        } else {
          try { espnRefsRef.current = await resolveEspnMatch(matchDate); } catch {}
        }
      }
      if (stopped) return;
      const refs = espnRefsRef.current;

      let d: LiveMatchData | null = null;
      if (refs) {
        try {
          d = await refreshSharedLive(
            refs.eventId, refs.leagueSlug, matchDateMs,
            liveDocRef.current, liveDocAtRef.current
          );
        } catch {
          d = docToLive(liveDocRef.current); // ESPN KO → on garde la dernière valeur partagée
        }
      }
      if (stopped) return;

      // L'affichage et les notifications passent par onSnapshot ; ici on ne fait
      // qu'affiner la minute avec la valeur ESPN fraîche (plus précise que l'ancre).
      if (d) {
        setLiveData(prev => (prev && prev.status === d!.status
          && prev.homeScore === d!.homeScore && prev.awayScore === d!.awayScore) ? prev : d);
        if (d.minute !== null) {
          const cur = minuteBaseRef.current;
          if (!cur || cur.minute !== d.minute) {
            minuteBaseRef.current = { minute: d.minute, at: Date.now() };
            setLiveMinute(d.minute);
          }
        }
      }

      scheduleNext(d);
    };

    const msUntilPrematch = matchDateMs - KO_WINDOW_BEFORE_MS - PREMATCH_WINDOW_MS - Date.now();
    if (msUntilPrematch > 0) {
      timer = setTimeout(poll, Math.min(msUntilPrematch, 3_600_000));
    } else {
      poll();
    }

    return () => { stopped = true; if (timer) clearTimeout(timer); forceRefreshRef.current = null; };
  }, [featuredMatch?.date, featuredMatch?.id, matchOverrideActive]);

  // ─── Match manuel (admin) : dérive Match + LiveMatchData depuis le doc Firestore ──

  const manualMatch: Match | null = useMemo(() => {
    if (!matchOverrideActive || !matchOverride) return null;
    return {
      id: 'manual',
      homeTeam: matchOverride.homeTeam,
      awayTeam: matchOverride.awayTeam,
      date: matchOverride.date,
      competition: matchOverride.competition,
      venue: matchOverride.venue,
      homeScore: matchOverride.homeScore ?? undefined,
      awayScore: matchOverride.awayScore ?? undefined,
      status: matchOverride.status,
    };
  }, [matchOverride, matchOverrideActive]);

  // Applique le score + statut live directement dans monthlyMatches pour que tous les
  // écrans (Notes, Pronostics, Admin) voient instantanément le match comme "terminé".
  // Injecte aussi le match manuel (admin) s'il est actif, pour qu'il apparaisse dans
  // le calendrier (MatchesScreen) comme un match normal, trié par date.
  const enrichedMonthlyMatches = useMemo(() => {
    let matches = monthlyMatches;

    if (liveData && apiMatchId) {
      const isFinished = liveData.status === 'FINISHED';
      const isLive = liveData.status === 'IN_PLAY' || liveData.status === 'PAUSED';
      if (isFinished || isLive) {
        matches = matches.map(m => {
          if (m.id !== apiMatchId) return m;
          return {
            ...m,
            homeScore: liveData.homeScore ?? m.homeScore,
            awayScore: liveData.awayScore ?? m.awayScore,
            status: isFinished ? 'finished' as const : 'live' as const,
          };
        });
      }
    }

    if (manualMatch) {
      matches = [...matches, manualMatch].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
    }

    return matches;
  }, [monthlyMatches, liveData, apiMatchId, manualMatch]);

  const manualLiveData: LiveMatchData | null = useMemo(() => {
    if (!matchOverrideActive || !matchOverride) return null;
    const status: LiveMatchData['status'] =
      matchOverride.status === 'live' ? 'IN_PLAY' :
      matchOverride.status === 'finished' ? 'FINISHED' : 'SCHEDULED';
    return {
      status,
      homeScore: matchOverride.homeScore ?? 0,
      awayScore: matchOverride.awayScore ?? 0,
      minute: null,
      goals: [],
    };
  }, [matchOverride, matchOverrideActive]);

  // Notif de but pour le match manuel — même détection sur chaque appareil que pour
  // le direct ESPN (comparaison locale du score précédent), avec dédup du push
  // partagé côté sendGoalNotification.
  const prevManualScoreRef = useRef<{ home: number; away: number } | null>(null);
  useEffect(() => {
    if (!matchOverrideActive || !matchOverride) {
      prevManualScoreRef.current = null;
      return;
    }
    const newHome = matchOverride.homeScore ?? 0;
    const newAway = matchOverride.awayScore ?? 0;
    const prev = prevManualScoreRef.current;

    if (prev && notifReadyRef.current) {
      const homeName = matchOverride.homeTeam.shortName;
      const awayName = matchOverride.awayTeam.shortName;
      const isBarcaHome = matchOverride.homeTeam.name.toLowerCase().includes('barcelona');
      if (newHome - prev.home > 0) {
        sendGoalNotification(matchOverride.homeTeam.name, homeName, awayName, newHome, newAway, isBarcaHome, newHome - prev.home);
      }
      if (newAway - prev.away > 0) {
        sendGoalNotification(matchOverride.awayTeam.name, homeName, awayName, newHome, newAway, !isBarcaHome, newAway - prev.away);
      }
    }

    prevManualScoreRef.current = { home: newHome, away: newAway };
  }, [matchOverride?.homeScore, matchOverride?.awayScore, matchOverrideActive]);

  const createManualMatch = async (m: { homeTeam: Team; awayTeam: Team; date: string; competition: string; venue: string }) => {
    await setDoc(MATCH_OVERRIDE_REF, {
      active: true,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      date: m.date,
      competition: m.competition,
      venue: m.venue,
      status: 'upcoming',
      homeScore: null,
      awayScore: null,
      updatedAt: serverTimestamp(),
    });
  };

  const setManualLive = async () => {
    await updateDoc(MATCH_OVERRIDE_REF, {
      status: 'live',
      homeScore: matchOverride?.homeScore ?? 0,
      awayScore: matchOverride?.awayScore ?? 0,
      updatedAt: serverTimestamp(),
    });
  };

  const updateManualScore = async (homeScore: number, awayScore: number) => {
    await updateDoc(MATCH_OVERRIDE_REF, { homeScore, awayScore, updatedAt: serverTimestamp() });
  };

  const resetMatchOverride = async () => {
    await updateDoc(MATCH_OVERRIDE_REF, { active: false, updatedAt: serverTimestamp() });
  };

  const finishManualMatch = async (homeScore: number, awayScore: number) => {
    await updateDoc(MATCH_OVERRIDE_REF, {
      status: 'finished', homeScore, awayScore, updatedAt: serverTimestamp(),
    });
    // Laisse voir le score final, puis revient tout seul au match ESPN.
    setTimeout(async () => {
      await resetMatchOverride();
      await loadMonthly(true);
      try {
        const result = await fetchNextScheduledMatch();
        if (result) {
          setFeaturedMatch(result.featured);
          setApiMatchId(result.apiId);
          setNextMatches(result.next3);
          await saveCache(CACHE_KEY_FEATURED, result);
        }
      } catch {}
    }, MANUAL_FINISH_REVERT_DELAY_MS);
  };

  return (
    <MatchContext.Provider value={{
      featuredMatch: matchOverrideActive ? manualMatch : featuredMatch,
      nextMatches, monthlyMatches: enrichedMonthlyMatches,
      isLoadingMatches, isLoadingMonthly, monthlyError,
      retryMonthly: () => loadMonthly(true),
      setFeaturedMatch,
      apiMatchId: matchOverrideActive ? null : apiMatchId,
      setApiMatchId,
      liveData: matchOverrideActive ? manualLiveData : liveData,
      liveMinute: matchOverrideActive ? null : liveMinute,
      matchOverrideActive,
      setLiveScreenActive,
      createManualMatch, setManualLive, updateManualScore, finishManualMatch, resetMatchOverride,
    }}>
      {children}
    </MatchContext.Provider>
  );
}

export function useFeaturedMatch() {
  const ctx = useContext(MatchContext);
  if (!ctx) throw new Error('useFeaturedMatch must be used inside MatchProvider');
  return ctx;
}
