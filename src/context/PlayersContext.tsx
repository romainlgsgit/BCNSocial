import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Player } from '../types';
import { PLAYERS as MOCK_PLAYERS } from '../data/mockData';

interface PlayersContextType {
  players: Player[];
  addPlayer: (player: Omit<Player, 'averageRating' | 'totalVotes'>) => Promise<void>;
  updatePlayer: (player: Player) => Promise<void>;
  deletePlayer: (id: string) => Promise<void>;
  loading: boolean;
}

const PlayersContext = createContext<PlayersContextType | null>(null);

export function PlayersProvider({ children }: { children: React.ReactNode }) {
  const [players, setPlayers] = useState<Player[]>(MOCK_PLAYERS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'players'), orderBy('position'), orderBy('number'));
    const unsub = onSnapshot(q, snap => {
      if (!snap.empty) {
        setPlayers(snap.docs.map(d => d.data() as Player));
      }
      // Si la collection est vide, on garde les mockData
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, []);

  const addPlayer = useCallback(async (player: Omit<Player, 'averageRating' | 'totalVotes'>) => {
    const full: Player = { ...player, averageRating: 0, totalVotes: 0 };
    await setDoc(doc(db, 'players', full.id), full);
  }, []);

  const updatePlayer = useCallback(async (player: Player) => {
    await setDoc(doc(db, 'players', player.id), player, { merge: true });
  }, []);

  const deletePlayer = useCallback(async (id: string) => {
    await deleteDoc(doc(db, 'players', id));
    // Si plus rien dans Firestore, revenir aux mockData
    setPlayers(prev => {
      const next = prev.filter(p => p.id !== id);
      return next.length > 0 ? next : MOCK_PLAYERS;
    });
  }, []);

  return (
    <PlayersContext.Provider value={{ players, addPlayer, updatePlayer, deletePlayer, loading }}>
      {children}
    </PlayersContext.Provider>
  );
}

export function usePlayers() {
  const ctx = useContext(PlayersContext);
  if (!ctx) throw new Error('usePlayers must be used inside PlayersProvider');
  return ctx;
}
