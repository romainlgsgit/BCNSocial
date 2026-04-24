import React, { createContext, useContext, useState, useEffect, useMemo, useRef, ReactNode } from 'react';
import { doc, getDoc, setDoc, deleteField, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Match } from '../types';
import { useFeaturedMatch } from './MatchContext';
import { useAuth } from './AuthContext';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type BetPrediction = 'home' | 'draw' | 'away';

export interface MatchOdds {
  home?: number;
  draw?: number;
  away?: number;
}

export interface UserBet {
  prediction: BetPrediction;
  coins: number;
  potentialWin: number;
  result?: 'won' | 'lost';
  wonAmount?: number;
  settledAt?: number;
}

export type PronoMatch = Match & {
  odds: MatchOdds;
  effectiveStatus: 'upcoming' | 'live' | 'finished';
};

interface PronoContextType {
  pronoMatches: PronoMatch[];
  isLoading: boolean;
  getBet: (matchId: string) => UserBet | undefined;
  setOdds: (matchId: string, odds: MatchOdds) => Promise<void>;
  setMatchLive: (matchId: string) => void;
  finishMatch: (matchId: string, result: BetPrediction) => Promise<void>;
  placeBet: (matchId: string, prediction: BetPrediction, coins: number, potentialWin: number) => Promise<void>;
}

const PronoContext = createContext<PronoContextType | undefined>(undefined);

export function PronoProvider({ children }: { children: ReactNode }) {
  const { nextMatches, isLoadingMatches, liveData, featuredMatch } = useFeaturedMatch();
  const { user, updateCoins } = useAuth();

  const [oddsMap, setOddsMap] = useState<Record<string, MatchOdds>>({});
  const [statusMap, setStatusMap] = useState<Record<string, 'upcoming' | 'live' | 'finished'>>({});
  // betsMap : paris de l'utilisateur courant, stockés dans Firestore
  const [betsMap, setBetsMap] = useState<Record<string, UserBet>>({});
  // Évite de régler deux fois le même pari dans la même session
  const settledInSessionRef = useRef<Set<string>>(new Set());

  // ── Écoute les cotes en temps réel (partagées pour tous) ──
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'odds'), (snap) => {
      if (snap.exists()) setOddsMap(snap.data() as Record<string, MatchOdds>);
    });
    return () => unsub();
  }, []);

  // ── Charge les paris de l'utilisateur depuis Firestore et règle les paris gagnants ──
  useEffect(() => {
    if (!user) { setBetsMap({}); return; }
    const unsub = onSnapshot(doc(db, 'bets', user.id), (snap) => {
      const bets = snap.exists() ? snap.data() as Record<string, UserBet> : {};
      setBetsMap(bets);
      // Pour chaque pari en attente, vérifier s'il existe un résultat dans matchResults
      settlePendingBets(bets, user.id);
    });
    return () => unsub();
  }, [user?.id]);

  const fetchMatchResult = async (matchId: string): Promise<BetPrediction | null> => {
    // 1. Cache Firestore (écrit par l'admin ou par un autre utilisateur)
    try {
      const snap = await getDoc(doc(db, 'matchResults', matchId));
      if (snap.exists()) return (snap.data() as { result: BetPrediction }).result;
    } catch {}

    // 2. Fallback : appel direct football-data.org (gratuit, 10 req/min)
    try {
      const res = await fetch(
        `https://api.football-data.org/v4/matches/${matchId}`,
        { headers: { 'X-Auth-Token': '3000b1fbd35442c4924a4b1c560eb630' } }
      );
      if (!res.ok) return null;
      const json = await res.json();
      if (json.status !== 'FINISHED') return null;

      const home: number = json.score?.fullTime?.home ?? 0;
      const away: number = json.score?.fullTime?.away ?? 0;
      const result: BetPrediction = home > away ? 'home' : away > home ? 'away' : 'draw';

      // Mettre en cache pour les autres utilisateurs
      setDoc(doc(db, 'matchResults', matchId), { result, finishedAt: serverTimestamp() }).catch(() => {});
      return result;
    } catch {}

    return null;
  };

  const settlePendingBets = async (bets: Record<string, UserBet>, userId: string) => {
    for (const matchId of Object.keys(bets)) {
      if (bets[matchId].result !== undefined) continue; // déjà réglé
      if (settledInSessionRef.current.has(matchId)) continue;
      settledInSessionRef.current.add(matchId);
      try {
        const result = await fetchMatchResult(matchId);
        if (!result) {
          settledInSessionRef.current.delete(matchId);
          continue;
        }

        const bet = bets[matchId];
        const won = bet.prediction === result;
        if (won) updateCoins(bet.potentialWin);

        const settledBet: UserBet = {
          ...bet,
          result: won ? 'won' : 'lost',
          wonAmount: won ? bet.potentialWin : 0,
          settledAt: Date.now(),
        };

        const alreadySettled = Object.entries(bets)
          .filter(([id, b]) => b.result !== undefined && id !== matchId)
          .sort(([, a], [, b]) => (b.settledAt ?? 0) - (a.settledAt ?? 0));

        const updates: Record<string, any> = { [matchId]: settledBet };
        alreadySettled.slice(4).forEach(([id]) => { updates[id] = deleteField(); });

        await updateDoc(doc(db, 'bets', userId), updates);
      } catch {
        settledInSessionRef.current.delete(matchId);
      }
    }
  };

  const effectiveStatus = (match: Match): 'upcoming' | 'live' | 'finished' => {
    if (statusMap[match.id]) return statusMap[match.id];
    if (featuredMatch?.id === match.id && liveData) {
      if (liveData.status === 'FINISHED') return 'finished';
      if (liveData.status === 'IN_PLAY' || liveData.status === 'PAUSED') return 'live';
    }
    return match.status;
  };

  const pronoMatches = useMemo<PronoMatch[]>(() => {
    return nextMatches
      .map(m => ({
        ...m,
        odds: oddsMap[m.id] ?? {},
        effectiveStatus: effectiveStatus(m),
      }))
      .filter(m => m.effectiveStatus !== 'finished');
  }, [nextMatches, oddsMap, statusMap, liveData, featuredMatch]);

  const getBet = (matchId: string) => betsMap[matchId];

  // ── Écriture des cotes dans Firestore (admin) ──
  const setOdds = async (matchId: string, odds: MatchOdds) => {
    const ref = doc(db, 'config', 'odds');
    const snap = await getDoc(ref);
    const current = snap.exists() ? snap.data() : {};
    await setDoc(ref, { ...current, [matchId]: odds });
  };

  const setMatchLive = (matchId: string) =>
    setStatusMap(prev => ({ ...prev, [matchId]: 'live' }));

  // ── Terminer un match : écrire le résultat dans Firestore → tous les utilisateurs récupèrent leurs pièces ──
  const finishMatch = async (matchId: string, result: BetPrediction) => {
    setStatusMap(prev => ({ ...prev, [matchId]: 'finished' }));

    try {
      await setDoc(doc(db, 'matchResults', matchId), {
        result,
        finishedAt: serverTimestamp(),
      });
      // Déclencher le règlement immédiatement sans attendre un changement sur bets/{userId}
      if (user) await settlePendingBets(betsMap, user.id);
    } catch {}

    try {
      const ref = doc(db, 'config', 'odds');
      await updateDoc(ref, { [matchId]: deleteField() });
    } catch {}
  };

  // ── Résolution automatique des paris quand le match se termine ──
  const prevLiveStatusRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevLiveStatusRef.current;
    const curr = liveData?.status ?? null;
    prevLiveStatusRef.current = curr;

    const wasLive = prev === 'IN_PLAY' || prev === 'PAUSED';
    if (
      wasLive &&
      curr === 'FINISHED' &&
      featuredMatch &&
      liveData?.homeScore !== null &&
      liveData?.awayScore !== null
    ) {
      let result: BetPrediction;
      if ((liveData!.homeScore ?? 0) > (liveData!.awayScore ?? 0)) result = 'home';
      else if ((liveData!.awayScore ?? 0) > (liveData!.homeScore ?? 0)) result = 'away';
      else result = 'draw';
      finishMatch(featuredMatch.id, result);
    }
  }, [liveData?.status]);

  // ── Placer un pari : sauvegarder dans Firestore ──
  const placeBet = async (matchId: string, prediction: BetPrediction, coins: number, potentialWin: number) => {
    if (!user) return;
    const bet: UserBet = { prediction, coins, potentialWin };
    const ref = doc(db, 'bets', user.id);
    const snap = await getDoc(ref);
    const current = snap.exists() ? snap.data() : {};
    await setDoc(ref, { ...current, [matchId]: bet });
    // Déduire les pièces immédiatement
    updateCoins(-coins);
  };

  return (
    <PronoContext.Provider value={{
      pronoMatches,
      isLoading: isLoadingMatches,
      getBet, setOdds, setMatchLive, finishMatch, placeBet,
    }}>
      {children}
    </PronoContext.Provider>
  );
}

export function useProno() {
  const ctx = useContext(PronoContext);
  if (!ctx) throw new Error('useProno must be used inside PronoProvider');
  return ctx;
}
