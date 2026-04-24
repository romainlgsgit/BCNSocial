import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
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

const API_TOKEN = '3000b1fbd35442c4924a4b1c560eb630';
const BARCA_ID = 81;
const API_SPORTS_KEY = '6e329e6f75ffdaa7d69a869d6764ed37';
const BARCA_APISPORTS_ID = 529;

const POLL_INTERVAL_LIVE = 15 * 1000;          // 15s pendant le match — lit Firestore (gratuit)
const POLL_INTERVAL_PAUSED = 40 * 1000;        // 40s à la mi-temps
const POLL_INTERVAL_KICKOFF = 20 * 1000;       // 20s dans la fenêtre du coup d'envoi
const POLL_INTERVAL_PREMATCH = 5 * 60 * 1000;  // 5 min loin du KO
const KICKOFF_WINDOW_MS = 5 * 60 * 1000;       // fenêtre de 5 min autour du KO
const PREMATCH_WINDOW_MS = 15 * 60 * 1000;     // activer le polling 15 min avant le KO

// Firestore cache TTLs — seul CACHE_MS_LIVE consomme le quota api-sports.io (100 req/day)
// Pendant PAUSED (HT) : football-data.org utilisé à la place → 0 appel api-sports.io en HT
// 100min IN_PLAY (avec temps add.) / 65s ≈ 92 appels → total ~92/match ✓
const CACHE_MS_LIVE = 65_000;    // 65s IN_PLAY → délai max 65+15 = 80s
const CACHE_MS_PAUSED = 60_000;  // 60s HT — football-data.org (gratuit), reprise détectée en ~100s max
const CACHE_MS_IDLE = 60_000;    // 1min pre/post (football-data.org, pas de quota)

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_KEY_FEATURED = 'cache_featured_v1';
const CACHE_KEY_MONTHLY = 'cache_monthly_v1';

export interface LiveMatchData {
  status: 'SCHEDULED' | 'TIMED' | 'IN_PLAY' | 'PAUSED' | 'FINISHED' | 'SUSPENDED' | 'POSTPONED';
  homeScore: number | null;
  awayScore: number | null;
  minute: number | null;
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Cache helpers ────────────────────────────────────────────────────────────

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

// ─── API fetch ────────────────────────────────────────────────────────────────

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
  if (!matches.length) return null;
  return { featured: matches[0], apiId: String(matches[0].id), next3: matches.slice(0, 3) };
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

// football-data.org : fiable pour le statut (SCHEDULED→IN_PLAY→FINISHED) mais pas le score live.
async function callFootballDataLive(matchId: string): Promise<LiveMatchData | null> {
  const res = await fetch(
    `https://api.football-data.org/v4/matches/${matchId}`,
    { headers: { 'X-Auth-Token': API_TOKEN } }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();

  let status: LiveMatchData['status'];
  switch (json.status) {
    case 'IN_PLAY':   status = 'IN_PLAY';   break;
    case 'PAUSED':    status = 'PAUSED';    break;
    case 'FINISHED':  status = 'FINISHED';  break;
    case 'TIMED':     status = 'TIMED';     break;
    default:          status = 'SCHEDULED'; break;
  }

  // Le tier gratuit de football-data.org renvoie null pour score.fullTime pendant IN_PLAY.
  // On met 0-0 par défaut pour le début de match ; api-sports.io donnera le vrai score ensuite.
  const isLive = status === 'IN_PLAY' || status === 'PAUSED';
  return {
    status,
    homeScore: json.score?.fullTime?.home ?? (isLive ? 0 : null),
    awayScore: json.score?.fullTime?.away ?? (isLive ? 0 : null),
    minute: json.minute ?? null,
  };
}

// api-sports.io : scores en temps réel pendant le match (100 req/jour partagés via Firestore).
async function callApiSportsLive(): Promise<LiveMatchData | null> {
  const res = await fetch(
    `https://v3.football.api-sports.io/fixtures?team=${BARCA_APISPORTS_ID}&live=all`,
    { headers: { 'x-apisports-key': API_SPORTS_KEY } }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const fixtures: any[] = json.response ?? [];
  if (!fixtures.length) return null;

  const f = fixtures[0];
  const short: string = f.fixture?.status?.short ?? '';
  const elapsed: number | null = f.fixture?.status?.elapsed ?? null;

  let status: LiveMatchData['status'];
  switch (short) {
    case '1H': case '2H': case 'ET': case 'BT': case 'P': status = 'IN_PLAY'; break;
    case 'HT': status = 'PAUSED'; break;
    case 'FT': case 'AET': case 'PEN': status = 'FINISHED'; break;
    default: return null;
  }

  return {
    status,
    homeScore: f.goals?.home ?? 0,
    awayScore: f.goals?.away ?? 0,
    minute: elapsed,
  };
}

// Cache Firestore partagé — un seul appel API par TTL pour tous les utilisateurs.
// Stratégie hybride : api-sports.io pour les scores live, football-data.org pour le reste.
async function fetchLiveWithSharedCache(matchId: string): Promise<LiveMatchData | null> {
  const cacheRef = doc(db, 'liveMatch', 'current');
  let staleData: LiveMatchData | null = null;

  try {
    const snap = await getDoc(cacheRef);
    const cached = snap.data();
    if (cached?.updatedAt) {
      const age = Date.now() - cached.updatedAt.toMillis();
      const cachedStatus = cached.status as LiveMatchData['status'] | null;

      let ttl = CACHE_MS_IDLE;
      if (cachedStatus === 'IN_PLAY') ttl = CACHE_MS_LIVE;
      else if (cachedStatus === 'PAUSED') ttl = CACHE_MS_PAUSED;

      const fresh: LiveMatchData | null = cachedStatus ? {
        status: cachedStatus,
        homeScore: cached.homeScore,
        awayScore: cached.awayScore,
        minute: cached.minute,
      } : null;

      if (age < ttl) return fresh; // Cache encore valide → aucun appel API
      staleData = fresh;           // Cache expiré → on garde pour fallback
    }
  } catch {}

  try {
    let live: LiveMatchData | null = null;
    const wasLive = staleData?.status === 'IN_PLAY' || staleData?.status === 'PAUSED';

    if (wasLive) {
      if (staleData?.status === 'PAUSED') {
        // Mi-temps : football-data.org pour détecter la reprise (0 appel api-sports.io)
        live = await callFootballDataLive(matchId);
        if (live?.status === 'IN_PLAY') {
          // 2e mi-temps commencée → récupérer le vrai score depuis api-sports.io
          const apiScore = await callApiSportsLive();
          if (apiScore) live = apiScore;
        }
      } else {
        // IN_PLAY → api-sports.io pour le score réel
        live = await callApiSportsLive();
        if (!live) {
          // api-sports.io ne renvoie plus le match → confirmé terminé via football-data.org
          live = await callFootballDataLive(matchId);
        }
      }
    } else {
      // Avant/après match → football-data.org (pas de quota journalier)
      live = await callFootballDataLive(matchId);
    }

    setDoc(cacheRef, {
      status: live?.status ?? null,
      homeScore: live?.homeScore ?? null,
      awayScore: live?.awayScore ?? null,
      minute: live?.minute ?? null,
      updatedAt: serverTimestamp(),
    }).catch(() => {});

    return live;
  } catch {
    return staleData; // En cas d'erreur réseau → données périmées plutôt que null
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
    requestNotificationPermission().then(granted => {
      notifReadyRef.current = granted;
    });
  }, []);

  useEffect(() => {
    featuredMatchRef.current = featuredMatch;
  }, [featuredMatch]);

  useEffect(() => {
    apiMatchIdRef.current = apiMatchId;
  }, [apiMatchId]);

  // Quand l'app revient au premier plan, forcer un poll immédiat
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        forceRefreshRef.current?.();
        // Recalculer la minute affichée immédiatement au retour
        if (minuteBaseRef.current && liveData?.status === 'IN_PLAY') {
          const elapsed = Math.floor((Date.now() - minuteBaseRef.current.at) / 60000);
          setLiveMinute(minuteBaseRef.current.minute + elapsed);
        }
      }
    });
    return () => sub.remove();
  }, [liveData?.status]);

  // Compteur de minute local — s'incrémente chaque minute sans appel API
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

  // Polling live via API-Football — démarre 15 min avant le KO
  useEffect(() => {
    // Réinitialiser les données live à chaque changement de match pour éviter
    // d'afficher des scores périmés du match précédent sur le prochain match
    setLiveData(null);
    prevLiveRef.current = null;
    if (!featuredMatch) { forceRefreshRef.current = null; return; }
    let stopped = false;
    let isFirstPoll = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const triggerNow = () => {
      if (stopped) return;
      if (timer) { clearTimeout(timer); timer = null; }
      poll();
    };
    forceRefreshRef.current = triggerNow;

    const poll = async () => {
      if (stopped) return;
      const d = await fetchLiveWithSharedCache(apiMatchIdRef.current ?? '');
      if (stopped) return;

      if (d) {
        setLiveData(d);
        if (d.minute !== null) {
          minuteBaseRef.current = { minute: d.minute, at: Date.now() };
          setLiveMinute(d.minute);
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
            setTimeout(() => { loadMonthly(true); loadFeatured(); }, 6000);
          }
        }

        prevLiveRef.current = d;
        isFirstPoll = false;

        const isLiveNow = d.status === 'IN_PLAY' || d.status === 'PAUSED';
        if (isLiveNow) {
          const interval = d.status === 'PAUSED' ? POLL_INTERVAL_PAUSED : POLL_INTERVAL_LIVE;
          timer = setTimeout(poll, interval);
        } else {
          const msUntilKO = new Date(featuredMatch.date).getTime() - Date.now();
          // Polling serré autour du KO pour détecter le début du match sans délai
          const interval = msUntilKO < KICKOFF_WINDOW_MS ? POLL_INTERVAL_KICKOFF : POLL_INTERVAL_PREMATCH;
          timer = setTimeout(poll, interval);
        }
      } else {
        isFirstPoll = false;
        const msUntilKO = new Date(featuredMatch.date).getTime() - Date.now();

        if (msUntilKO > PREMATCH_WINDOW_MS) {
          timer = setTimeout(poll, Math.min(msUntilKO - PREMATCH_WINDOW_MS, 3600000));
        } else if (msUntilKO > -90 * 60 * 1000) {
          const interval = msUntilKO < KICKOFF_WINDOW_MS ? POLL_INTERVAL_KICKOFF : POLL_INTERVAL_PREMATCH;
          timer = setTimeout(poll, interval);
        }
      }
    };

    const msUntilKO = new Date(featuredMatch.date).getTime() - Date.now();
    if (msUntilKO > PREMATCH_WINDOW_MS) {
      timer = setTimeout(poll, Math.min(msUntilKO - PREMATCH_WINDOW_MS, 3600000));
    } else {
      poll();
    }

    return () => { stopped = true; if (timer) clearTimeout(timer); forceRefreshRef.current = null; };
  }, [featuredMatch?.date]);

  return (
    <MatchContext.Provider value={{
      featuredMatch, nextMatches, monthlyMatches,
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
