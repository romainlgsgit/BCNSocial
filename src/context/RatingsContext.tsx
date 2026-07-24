import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  doc, setDoc, deleteDoc, updateDoc, deleteField, collection, onSnapshot, getDocs,
  runTransaction, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from './AuthContext';
import { Player } from '../types';

export interface PlayerStats {
  averageRating: number;
  totalVotes: number;
}

export interface MatchStats {
  averageRating: number;
  totalVotes: number;
}

interface RatingsContextType {
  rateMatch: (matchId: string, rating: number) => void;
  ratePlayer: (matchId: string, playerId: string, rating: number) => void;
  getUserMatchRating: (matchId: string) => number | null;
  getUserPlayerRating: (matchId: string, playerId: string) => number | null;

  validatedLineups: Record<string, Player[]>;
  setLineup: (matchId: string, players: Player[]) => Promise<void>;
  getLineup: (matchId: string) => Player[] | null;

  playerStats: Record<string, PlayerStats>;
  matchStats: Record<string, MatchStats>;
  myMatchRatings: Record<string, number>;
  myPlayerRatings: Record<string, number>;
  /** Interne : déclenché par useRatings(), charge les agrégats au premier besoin. */
  ensureLoaded: () => Promise<void>;
  /** Admin : remet à zéro les notes de tous les joueurs (stats agrégées + votes individuels). */
  resetAllPlayerRatings: () => Promise<void>;
}

const RatingsContext = createContext<RatingsContextType | null>(null);

export function RatingsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [matchRatings, setMatchRatings] = useState<Record<string, number>>({});
  const [playerRatings, setPlayerRatings] = useState<Record<string, number>>({});
  const [validatedLineups, setValidatedLineups] = useState<Record<string, Player[]>>({});
  const [playerStats, setPlayerStats] = useState<Record<string, PlayerStats>>({});
  const [matchStats, setMatchStats] = useState<Record<string, MatchStats>>({});

  // Compos + stats agrégées : données éditées rarement (admin / cumul de votes). Une
  // LECTURE PONCTUELLE suffit — inutile de garder 3 écouteurs temps réel sur des
  // collections entières (très coûteux en lectures Firestore, toute l'app). Les votes
  // de l'utilisateur mettent à jour ces stats localement tout de suite (voir plus bas).
  //
  // Chargement PARESSEUX : déclenché par le premier écran qui appelle useRatings(), pas
  // au lancement. Ces 3 collections ne servent qu'aux écrans Notes/Joueurs/Profil/Admin ;
  // les lire au démarrage coûtait ~21 lectures à CHAQUE ouverture de l'app, même à qui
  // ne consulte que le fil.
  const reloadAggregates = useCallback(async () => {
    try {
      const [lin, ps, ms] = await Promise.all([
        getDocs(collection(db, 'lineups')),
        getDocs(collection(db, 'playerStats')),
        getDocs(collection(db, 'matchStats')),
      ]);
      const lineups: Record<string, Player[]> = {};
      lin.docs.forEach((d) => { lineups[d.id] = d.data().players as Player[]; });
      setValidatedLineups(lineups);
      const pstats: Record<string, PlayerStats> = {};
      ps.docs.forEach((d) => { const x = d.data(); pstats[d.id] = { averageRating: x.averageRating ?? 0, totalVotes: x.totalVotes ?? 0 }; });
      setPlayerStats(pstats);
      const mstats: Record<string, MatchStats> = {};
      ms.docs.forEach((d) => { const x = d.data(); mstats[d.id] = { averageRating: x.averageRating ?? 0, totalVotes: x.totalVotes ?? 0 }; });
      setMatchStats(mstats);
    } catch { /* silencieux */ }
  }, []);

  const loadStartedRef = useRef(false);
  const ensureLoaded = useCallback(async () => {
    if (loadStartedRef.current) return;
    loadStartedRef.current = true;
    await reloadAggregates();
  }, [reloadAggregates]);

  // Charge les votes de l'utilisateur connecté
  useEffect(() => {
    if (!user) {
      setMatchRatings({});
      setPlayerRatings({});
      return;
    }
    const unsub = onSnapshot(doc(db, 'userVotes', user.id), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const newMatchRatings: Record<string, number> = {};
      const newPlayerRatings: Record<string, number> = {};
      Object.entries(data).forEach(([key, value]) => {
        if (typeof value !== 'number') return;
        if (key.startsWith('mr_')) {
          newMatchRatings[key.slice(3)] = value;
        } else if (key.startsWith('pr_')) {
          // key = pr_{matchId}_{playerId}
          newPlayerRatings[key.slice(3)] = value;
        }
      });
      setMatchRatings(newMatchRatings);
      setPlayerRatings(newPlayerRatings);
    });
    return unsub;
  }, [user?.id]);

  const rateMatch = useCallback(
    (matchId: string, rating: number) => {
      setMatchRatings((prev) => ({ ...prev, [matchId]: rating }));
      if (!user) return;

      const userVoteRef = doc(db, 'userVotes', user.id);
      const statsRef = doc(db, 'matchStats', matchId);

      runTransaction(db, async (tx) => {
        const [userVoteDoc, statsDoc] = await Promise.all([
          tx.get(userVoteRef),
          tx.get(statsRef),
        ]);

        const oldRating: number | null = userVoteDoc.exists()
          ? (userVoteDoc.data()[`mr_${matchId}`] ?? null)
          : null;

        const stats = statsDoc.exists()
          ? statsDoc.data()
          : { totalRatingSum: 0, totalVotes: 0 };

        let { totalRatingSum, totalVotes } = stats as {
          totalRatingSum: number;
          totalVotes: number;
        };

        if (oldRating !== null) {
          totalRatingSum = totalRatingSum - oldRating + rating;
        } else {
          totalRatingSum += rating;
          totalVotes += 1;
        }

        const averageRating = totalVotes > 0 ? totalRatingSum / totalVotes : 0;

        tx.set(statsRef, { totalRatingSum, totalVotes, averageRating }, { merge: true });
        tx.set(userVoteRef, { [`mr_${matchId}`]: rating }, { merge: true });
        return { averageRating, totalVotes };
      }).then((res) => {
        if (res) setMatchStats((prev) => ({ ...prev, [matchId]: res }));
      }).catch(console.error);
    },
    [user?.id]
  );

  const ratePlayer = useCallback(
    (matchId: string, playerId: string, rating: number) => {
      const key = `${matchId}_${playerId}`;
      setPlayerRatings((prev) => ({ ...prev, [key]: rating }));

      if (!user) return;

      const userVoteRef = doc(db, 'userVotes', user.id);
      const statsRef = doc(db, 'playerStats', playerId);

      // Mise à jour atomique : vote utilisateur + stats agrégées
      runTransaction(db, async (tx) => {
        const [userVoteDoc, statsDoc] = await Promise.all([
          tx.get(userVoteRef),
          tx.get(statsRef),
        ]);

        const oldRating: number | null = userVoteDoc.exists()
          ? (userVoteDoc.data()[`pr_${key}`] ?? null)
          : null;

        const stats = statsDoc.exists()
          ? statsDoc.data()
          : { totalRatingSum: 0, totalVotes: 0 };

        let { totalRatingSum, totalVotes } = stats as {
          totalRatingSum: number;
          totalVotes: number;
        };

        if (oldRating !== null) {
          totalRatingSum = totalRatingSum - oldRating + rating;
        } else {
          totalRatingSum += rating;
          totalVotes += 1;
        }

        const averageRating = totalVotes > 0 ? totalRatingSum / totalVotes : 0;

        tx.set(statsRef, { totalRatingSum, totalVotes, averageRating }, { merge: true });
        tx.set(userVoteRef, { [`pr_${key}`]: rating }, { merge: true });
        return { averageRating, totalVotes };
      }).then((res) => {
        if (res) setPlayerStats((prev) => ({ ...prev, [playerId]: res }));
      }).catch(console.error);
    },
    [user?.id]
  );

  const getUserMatchRating = (matchId: string): number | null =>
    matchRatings[matchId] ?? null;

  const getUserPlayerRating = (matchId: string, playerId: string): number | null =>
    playerRatings[`${matchId}_${playerId}`] ?? null;

  const setLineup = useCallback(async (matchId: string, players: Player[]) => {
    setValidatedLineups((prev) => ({ ...prev, [matchId]: players }));
    await setDoc(doc(db, 'lineups', matchId), {
      players: players.map((p) => ({ ...p })),
      validatedAt: serverTimestamp(),
    });
  }, []);

  const getLineup = (matchId: string): Player[] | null =>
    validatedLineups[matchId] ?? null;

  const resetAllPlayerRatings = useCallback(async () => {
    const [psSnap, uvSnap] = await Promise.all([
      getDocs(collection(db, 'playerStats')),
      getDocs(collection(db, 'userVotes')),
    ]);

    await Promise.all(psSnap.docs.map((d) => deleteDoc(doc(db, 'playerStats', d.id))));

    await Promise.all(uvSnap.docs.map((d) => {
      const updates: Record<string, ReturnType<typeof deleteField>> = {};
      Object.keys(d.data()).forEach((key) => {
        if (key.startsWith('pr_')) updates[key] = deleteField();
      });
      if (Object.keys(updates).length === 0) return Promise.resolve();
      return updateDoc(doc(db, 'userVotes', d.id), updates);
    }));

    setPlayerStats({});
    setPlayerRatings({});
  }, []);

  return (
    <RatingsContext.Provider
      value={{
        rateMatch,
        ratePlayer,
        getUserMatchRating,
        getUserPlayerRating,
        validatedLineups,
        setLineup,
        getLineup,
        playerStats,
        matchStats,
        myMatchRatings: matchRatings,
        myPlayerRatings: playerRatings,
        ensureLoaded,
        resetAllPlayerRatings,
      }}
    >
      {children}
    </RatingsContext.Provider>
  );
}

export function useRatings() {
  const ctx = useContext(RatingsContext);
  if (!ctx) throw new Error('useRatings must be used within RatingsProvider');
  // Le simple fait qu'un écran consomme les notes déclenche leur chargement (une fois).
  const { ensureLoaded } = ctx;
  useEffect(() => { ensureLoaded(); }, [ensureLoaded]);
  return ctx;
}
