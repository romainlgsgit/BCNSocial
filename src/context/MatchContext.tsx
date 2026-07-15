import React, { createContext, useContext, useState, useEffect, useRef, useMemo, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Match, Team } from '../types';
import {
  requestNotificationPermission,
  sendMatchStartNotification,
  sendGoalNotification,
  sendMatchEndNotification,
} from '../services/NotificationService';
import { attResolved } from '../utils/attGate';

// ─── Sources ──────────────────────────────────────────────────────────────────
// football-data.org : calendrier, prochains matchs, résultats (gratuit 10 req/min)
// ESPN              : score + timer live (gratuit, sans clé, quasi temps-réel)

const API_TOKEN = '3000b1fbd35442c4924a4b1c560eb630';
const BARCA_ID  = 81;

const BARCA_ESPN_ID = '83';
const espnSummaryUrl = (league: string, eventId: string) =>
  `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/summary?event=${eventId}`;
const espnScoreboardUrl = (league: string, dates: string) =>
  `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard?dates=${dates}`;
// Compétitions où Barça peut jouer (pour le lookup ESPN par date)
const BARCA_LEAGUES = ['esp.1', 'esp.copa_del_rey', 'esp.super_cup', 'uefa.champions', 'fifa.cwc'];

// Intervalles de polling client (chaque appareil lit Firestore à cette fréquence)
const POLL_INTERVAL_LIVE     = 8 * 1000;       // 8s pendant le match
const POLL_INTERVAL_PREMATCH = 5 * 60 * 1000;  // 5 min loin du KO
const PREMATCH_WINDOW_MS     = 15 * 60 * 1000;

// Fenêtre "coup d'envoi" → polling serré pour démarrer ASAP
const KO_WINDOW_BEFORE_MS = 2 * 60 * 1000;
const KO_WINDOW_AFTER_MS  = 10 * 60 * 1000;

// TTL du cache Firestore — ESPN illimité, on cache court (délai max ~20s)
const CACHE_MS_LIVE    = 12_000;
const CACHE_MS_PAUSED  = 12_000;
const CACHE_MS_KICKOFF = 12_000;
const CACHE_MS_IDLE    = 60_000;

const CACHE_TTL_MS       = 10 * 60 * 1000;
const CACHE_KEY_FEATURED = 'cache_featured_v5';
const CACHE_KEY_MONTHLY  = 'cache_monthly_v4';

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
}

const MatchContext = createContext<MatchContextType | undefined>(undefined);

// ─── football-data.org → app mapping ──────────────────────────────────────────

function mapTeam(t: any): Team {
  return {
    name: t.name,
    shortName: t.tla ?? t.name.slice(0, 3).toUpperCase(),
    logo: t.crest ?? '',
    color: t.name.toLowerCase().includes('barcelona') ? '#A50044' : '#333',
  };
}

function mapStatus(s: string): 'upcoming' | 'live' | 'finished' {
  if (s === 'FINISHED') return 'finished';
  if (s === 'IN_PLAY' || s === 'PAUSED') return 'live';
  return 'upcoming';
}

function mapMatch(m: any): Match {
  return {
    id: String(m.id),
    homeTeam: mapTeam(m.homeTeam),
    awayTeam: mapTeam(m.awayTeam),
    date: m.utcDate,
    competition: m.competition?.name ?? '',
    venue: m.venue ?? '',
    homeScore: m.score?.fullTime?.home ?? undefined,
    awayScore: m.score?.fullTime?.away ?? undefined,
    status: mapStatus(m.status),
  };
}

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

// ─── football-data.org calls ──────────────────────────────────────────────────

async function apiFetch(url: string): Promise<any> {
  const res = await fetch(url, { headers: { 'X-Auth-Token': API_TOKEN } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchFeaturedAndNext(): Promise<{ featured: Match; apiId: string; next3: Match[] } | null> {
  try {
    const data = await apiFetch(`https://api.football-data.org/v4/teams/${BARCA_ID}/matches?status=LIVE`);
    if (data.matches?.length > 0) {
      const m = data.matches[0];
      const match = { ...mapMatch(m), status: 'live' as const };
      return { featured: match, apiId: String(m.id), next3: [match] };
    }
  } catch {}

  await new Promise(r => setTimeout(r, 1200));

  const data = await apiFetch(
    `https://api.football-data.org/v4/teams/${BARCA_ID}/matches?status=SCHEDULED&limit=5`
  );
  const matches: Match[] = (data.matches ?? [])
    .map(mapMatch)
    .sort((a: Match, b: Match) => new Date(a.date).getTime() - new Date(b.date).getTime());
  // Fin de saison : plus de match programmé → mettre en avant le dernier match joué
  if (!matches.length) return fetchLastFinishedMatch();
  return { featured: matches[0], apiId: String(matches[0].id), next3: matches.slice(0, 3) };
}

async function fetchNextScheduledMatch(): Promise<{ featured: Match; apiId: string; next3: Match[] } | null> {
  const data = await apiFetch(
    `https://api.football-data.org/v4/teams/${BARCA_ID}/matches?status=SCHEDULED&limit=5`
  );
  const matches: Match[] = (data.matches ?? [])
    .map(mapMatch)
    .sort((a: Match, b: Match) => new Date(a.date).getTime() - new Date(b.date).getTime());
  // Plus aucun match programmé (intersaison / fin de saison) → retomber sur le dernier match joué
  if (!matches.length) return fetchLastFinishedMatch();
  return { featured: matches[0], apiId: String(matches[0].id), next3: matches.slice(0, 3) };
}

// Dernier match joué (fin de saison : il n'y a plus de match à venir à mettre en avant)
async function fetchLastFinishedMatch(): Promise<{ featured: Match; apiId: string; next3: Match[] } | null> {
  try {
    const data = await apiFetch(
      `https://api.football-data.org/v4/teams/${BARCA_ID}/matches?status=FINISHED&limit=10`
    );
    const matches: Match[] = (data.matches ?? [])
      .map(mapMatch)
      .sort((a: Match, b: Match) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (!matches.length) return null;
    // next3 vide : pas de pronos possibles hors saison
    return { featured: matches[0], apiId: String(matches[0].id), next3: [] };
  } catch {
    return null;
  }
}

async function fetchMonthlyMatches(): Promise<Match[]> {
  const now = new Date();
  const y = now.getFullYear();
  const mo = now.getMonth();
  const pad = (n: number) => String(n).padStart(2, '0');
  const last = new Date(y, mo + 1, 0).getDate();
  const from = `${y}-${pad(mo + 1)}-01`;
  const to = `${y}-${pad(mo + 1)}-${pad(last)}`;
  const data = await apiFetch(
    `https://api.football-data.org/v4/teams/${BARCA_ID}/matches?dateFrom=${from}&dateTo=${to}`
  );
  return (data.matches ?? []).map(mapMatch);
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

// Cache Firestore partagé : un seul appel ESPN par TTL pour tous les utilisateurs.
async function fetchLiveWithSharedCache(
  eventId: string,
  leagueSlug: string,
  matchDateMs: number
): Promise<LiveMatchData | null> {
  const cacheRef = doc(db, 'liveMatch', 'current');
  const now = Date.now();
  const msFromKO = now - matchDateMs;
  const inKOWindow = msFromKO > -KO_WINDOW_BEFORE_MS && msFromKO < KO_WINDOW_AFTER_MS;

  let staleData: LiveMatchData | null = null;

  try {
    const snap = await getDoc(cacheRef);
    const cached = snap.data();
    if (cached?.updatedAt && cached?.eventId === eventId) {
      const age = now - cached.updatedAt.toMillis();
      const cachedStatus = cached.status as LiveMatchData['status'] | null;

      let ttl: number;
      if (cachedStatus === 'IN_PLAY') ttl = CACHE_MS_LIVE;
      else if (cachedStatus === 'PAUSED') ttl = CACHE_MS_PAUSED;
      else if (inKOWindow) ttl = CACHE_MS_KICKOFF;
      else ttl = CACHE_MS_IDLE;

      const fresh: LiveMatchData | null = cachedStatus ? {
        status: cachedStatus,
        homeScore: cached.homeScore,
        awayScore: cached.awayScore,
        minute: cached.minute,
        goals: Array.isArray(cached.goals) ? cached.goals : [],
      } : null;

      if (age < ttl) return fresh;
      staleData = fresh;
    }
  } catch {}

  try {
    const live = await callEspnLive(leagueSlug, eventId);

    setDoc(cacheRef, {
      eventId,
      status: live?.status ?? null,
      homeScore: live?.homeScore ?? null,
      awayScore: live?.awayScore ?? null,
      minute: live?.minute ?? null,
      goals: live?.goals ?? [],
      updatedAt: serverTimestamp(),
    }).catch(() => {});

    return live;
  } catch {
    return staleData;
  }
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
  const prevLiveRef = useRef<LiveMatchData | null>(null);
  const notifReadyRef = useRef(false);
  const featuredMatchRef = useRef<Match | null>(null);
  const forceRefreshRef = useRef<(() => void) | null>(null);
  const minuteBaseRef = useRef<{ minute: number; at: number } | null>(null);
  const apiMatchIdRef = useRef<string | null>(null);

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

  useEffect(() => {
    apiMatchIdRef.current = apiMatchId;
  }, [apiMatchId]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
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

  // Polling live — résout l'ID ESPN du match (par date) puis poll ESPN summary
  useEffect(() => {
    setLiveData(null);
    prevLiveRef.current = null;
    if (!featuredMatch) { forceRefreshRef.current = null; return; }

    let stopped = false;
    let isFirstPoll = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let espnRefs: { eventId: string; leagueSlug: string } | null = null;
    const matchDateMs = new Date(featuredMatch.date).getTime();
    const matchDate = new Date(featuredMatch.date);

    const triggerNow = () => {
      if (stopped) return;
      if (timer) { clearTimeout(timer); timer = null; }
      poll();
    };
    forceRefreshRef.current = triggerNow;

    const scheduleNext = (d: LiveMatchData | null) => {
      if (stopped) return;
      const now = Date.now();
      const msFromKO = now - matchDateMs;
      const inKO = msFromKO > -KO_WINDOW_BEFORE_MS && msFromKO < KO_WINDOW_AFTER_MS;

      if (d?.status === 'IN_PLAY' || d?.status === 'PAUSED') {
        timer = setTimeout(poll, POLL_INTERVAL_LIVE);
      } else if (d?.status === 'FINISHED') {
        // Plus de polling après la fin du match
      } else if (inKO) {
        timer = setTimeout(poll, POLL_INTERVAL_LIVE);
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
      // Résolution paresseuse de l'ID ESPN (peut échouer si match pas encore dans les scoreboards)
      if (!espnRefs) {
        try { espnRefs = await resolveEspnMatch(matchDate); } catch {}
      }
      if (stopped) return;

      const d = espnRefs
        ? await fetchLiveWithSharedCache(espnRefs.eventId, espnRefs.leagueSlug, matchDateMs)
        : null;
      if (stopped) return;

      if (d) {
        setLiveData(d);
        if (d.minute !== null) {
          // Ne ré-ancrer que si la minute ESPN a changé. Sinon, on garde le timestamp
          // d'origine pour que le compteur local (interval 60s) puisse progresser tout seul.
          const cur = minuteBaseRef.current;
          if (!cur || cur.minute !== d.minute) {
            minuteBaseRef.current = { minute: d.minute, at: Date.now() };
            setLiveMinute(d.minute);
          }
        }

        if (!isFirstPoll && notifReadyRef.current && prevLiveRef.current) {
          const prev = prevLiveRef.current;
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
          if (newHome - prevHome > 0) sendGoalNotification(match?.homeTeam.name ?? homeName, homeName, awayName, newHome, newAway, isBarcaHome, newHome - prevHome);
          if (newAway - prevAway > 0) sendGoalNotification(match?.awayTeam.name ?? awayName, homeName, awayName, newHome, newAway, !isBarcaHome, newAway - prevAway);

          if ((prev.status === 'IN_PLAY' || prev.status === 'PAUSED') && d.status === 'FINISHED') {
            sendMatchEndNotification(homeName, awayName, newHome, newAway);
            setDoc(doc(db, 'liveMatch', 'current'), {
              eventId: null, status: null, homeScore: null, awayScore: null, minute: null,
              updatedAt: serverTimestamp(),
            }).catch(() => {});
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
            }, 8000);
          }
        }

        prevLiveRef.current = d;
        isFirstPoll = false;
      } else {
        isFirstPoll = false;
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
  }, [featuredMatch?.date, featuredMatch?.id]);

  // Applique le score + statut live directement dans monthlyMatches pour que tous les
  // écrans (Notes, Pronostics, Admin) voient instantanément le match comme "terminé".
  const enrichedMonthlyMatches = useMemo(() => {
    if (!liveData || !apiMatchId) return monthlyMatches;
    const isFinished = liveData.status === 'FINISHED';
    const isLive = liveData.status === 'IN_PLAY' || liveData.status === 'PAUSED';
    if (!isFinished && !isLive) return monthlyMatches;
    return monthlyMatches.map(m => {
      if (m.id !== apiMatchId) return m;
      return {
        ...m,
        homeScore: liveData.homeScore ?? m.homeScore,
        awayScore: liveData.awayScore ?? m.awayScore,
        status: isFinished ? 'finished' as const : 'live' as const,
      };
    });
  }, [monthlyMatches, liveData, apiMatchId]);

  return (
    <MatchContext.Provider value={{
      featuredMatch, nextMatches, monthlyMatches: enrichedMonthlyMatches,
      isLoadingMatches, isLoadingMonthly, monthlyError,
      retryMonthly: () => loadMonthly(true),
      setFeaturedMatch, apiMatchId, setApiMatchId, liveData, liveMinute,
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
