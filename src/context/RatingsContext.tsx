import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  doc, setDoc, collection, onSnapshot,
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
}

const RatingsContext = createContext<RatingsContextType | null>(null);

export function RatingsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [matchRatings, setMatchRatings] = useState<Record<string, number>>({});
  const [playerRatings, setPlayerRatings] = useState<Record<string, number>>({});
  const [validatedLineups, setValidatedLineups] = useState<Record<string, Player[]>>({});
  const [playerStats, setPlayerStats] = useState<Record<string, PlayerStats>>({});
  const [matchStats, setMatchStats] = useState<Record<string, MatchStats>>({});

  // Écoute la collection lineups (temps réel, toute l'app)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'lineups'), (snap) => {
      const lineups: Record<string, Player[]> = {};
      snap.docs.forEach((d) => {
        lineups[d.id] = d.data().players as Player[];
      });
      setValidatedLineups(lineups);
    });
    return unsub;
  }, []);

  // Écoute les stats agrégées des joueurs (temps réel)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'playerStats'), (snap) => {
      const stats: Record<string, PlayerStats> = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        stats[d.id] = {
          averageRating: data.averageRating ?? 0,
          totalVotes: data.totalVotes ?? 0,
        };
      });
      setPlayerStats(stats);
    });
    return unsub;
  }, []);

  // Écoute les stats agrégées des matchs (temps réel)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'matchStats'), (snap) => {
      const stats: Record<string, MatchStats> = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        stats[d.id] = {
          averageRating: data.averageRating ?? 0,
          totalVotes: data.totalVotes ?? 0,
        };
      });
      setMatchStats(stats);
    });
    return unsub;
  }, []);

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
      }}
    >
      {children}
    </RatingsContext.Provider>
  );
}

export function useRatings() {
  const ctx = useContext(RatingsContext);
  if (!ctx) throw new Error('useRatings must be used within RatingsProvider');
  return ctx;
}
