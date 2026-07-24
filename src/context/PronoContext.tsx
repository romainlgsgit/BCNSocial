import React, { createContext, useContext, useState, useEffect, useMemo, useRef, ReactNode } from 'react';
import { doc, getDoc, setDoc, deleteField, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Match } from '../types';
import { useFeaturedMatch, BARCA_LEAGUES } from './MatchContext';
import { useAuth } from './AuthContext';
import { formatMatchLabel } from '../utils/matchLabels';

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
  /** Libellé du match ("FCB – RMA") figé à la prise du pari : le match sort du
   *  calendrier une fois joué, le pari lui reste affiché dans le profil. */
  matchLabel?: string;
  result?: 'won' | 'lost';
  wonAmount?: number;
  settledAt?: number;
}

// ─── Rétention des paris réglés ───────────────────────────────────────────────
// Un pari réglé n'a plus qu'une valeur d'historique : on n'en garde que les 3
// derniers, et rien au-delà de 30 jours. Le reste est supprimé de bets/{uid}
// (le document ne gonfle plus, et le quota Firestore est partagé par l'app).
// Les paris EN ATTENTE ne sont jamais touchés : leur mise n'a pas encore été rendue.
export const MAX_SETTLED_BETS = 3;
export const SETTLED_BET_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const isBetExpired = (bet: UserBet, now = Date.now()) =>
  bet.settledAt !== undefined && now - bet.settledAt > SETTLED_BET_TTL_MS;

/** Ids des paris réglés à supprimer : au-delà des 3 derniers, ou trop vieux. */
export function prunableBetIds(bets: Record<string, UserBet>, now = Date.now()): string[] {
  return Object.entries(bets)
    .filter(([, b]) => b.result !== undefined)
    .sort(([, a], [, b]) => (b.settledAt ?? 0) - (a.settledAt ?? 0))
    .filter(([, b], i) => i >= MAX_SETTLED_BETS || isBetExpired(b, now))
    .map(([id]) => id);
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
      // Purge l'historique périmé même si l'utilisateur ne parie plus
      pruneSettledBets(bets, user.id);
    });
    return () => unsub();
  }, [user?.id]);

  const fetchMatchResult = async (matchId: string): Promise<BetPrediction | null> => {
    // 1. Cache Firestore (écrit par l'admin ou par un autre utilisateur)
    try {
      const snap = await getDoc(doc(db, 'matchResults', matchId));
      if (snap.exists()) return (snap.data() as { result: BetPrediction }).result;
    } catch {}

    // 2. Fallback : appel direct ESPN (gratuit, sans clé) — on ne connaît pas la
    // compétition de ce matchId, donc on tente toutes les ligues où Barça joue
    // en parallèle et on garde la première réponse valide et terminée.
    try {
      const responses = await Promise.all(
        BARCA_LEAGUES.map(league =>
          fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/summary?event=${matchId}`)
            .then(r => (r.ok ? r.json() : null))
            .catch(() => null)
        )
      );

      for (const json of responses) {
        const comp = json?.header?.competitions?.[0];
        if (!comp) continue;
        const st = comp.status?.type;
        if (st?.state !== 'post') continue;

        const competitors = comp.competitors ?? [];
        const home = competitors.find((c: any) => c.homeAway === 'home') ?? competitors[0];
        const away = competitors.find((c: any) => c.homeAway === 'away') ?? competitors[1];
        const homeScore = Number(home?.score ?? 0);
        const awayScore = Number(away?.score ?? 0);
        const result: BetPrediction = homeScore > awayScore ? 'home' : awayScore > homeScore ? 'away' : 'draw';

        // Mettre en cache pour les autres utilisateurs
        setDoc(doc(db, 'matchResults', matchId), { result, finishedAt: serverTimestamp() }).catch(() => {});
        return result;
      }
    } catch {}

    return null;
  };

  // Supprime les paris réglés hors rétention. La suppression relance ce snapshot,
  // mais le second passage ne trouve plus rien à purger → pas de boucle.
  const pruneSettledBets = async (bets: Record<string, UserBet>, userId: string) => {
    const ids = prunableBetIds(bets);
    if (!ids.length) return;
    const updates: Record<string, any> = {};
    ids.forEach(id => { updates[id] = deleteField(); });
    try {
      await updateDoc(doc(db, 'bets', userId), updates);
    } catch {}
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

        // Le pari qu'on vient de régler est le plus récent : jamais purgé ici.
        const updates: Record<string, any> = { [matchId]: settledBet };
        prunableBetIds({ ...bets, [matchId]: settledBet })
          .filter(id => id !== matchId)
          .forEach(id => { updates[id] = deleteField(); });

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

  // Au-delà de cette durée après le coup d'envoi, le match est forcément terminé —
  // utile quand un match en cache garde un statut 'upcoming' périmé (fin de saison).
  const MATCH_OVER_AFTER_MS = 3 * 60 * 60 * 1000;

  const pronoMatches = useMemo<PronoMatch[]>(() => {
    const now = Date.now();
    return nextMatches
      .map(m => ({
        ...m,
        odds: oddsMap[m.id] ?? {},
        effectiveStatus: effectiveStatus(m),
      }))
      .filter(m =>
        m.effectiveStatus !== 'finished' &&
        now - new Date(m.date).getTime() < MATCH_OVER_AFTER_MS
      );
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
    const match = pronoMatches.find(m => m.id === matchId);
    const bet: UserBet = { prediction, coins, potentialWin };
    if (match) bet.matchLabel = formatMatchLabel(match.homeTeam.shortName, match.awayTeam.shortName);
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
