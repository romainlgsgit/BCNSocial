import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { collection, getDocs, doc, setDoc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Player } from '../types';
import { PLAYERS as MOCK_PLAYERS } from '../data/mockData';

interface PlayersContextType {
  players: Player[];
  addPlayer: (player: Omit<Player, 'averageRating' | 'totalVotes'>) => Promise<void>;
  updatePlayer: (player: Player) => Promise<void>;
  deletePlayer: (id: string) => Promise<void>;
  loading: boolean;
  /** Interne : déclenché par usePlayers(), charge l'effectif au premier besoin. */
  ensureLoaded: () => Promise<void>;
}

const PlayersContext = createContext<PlayersContextType | null>(null);

export function PlayersProvider({ children }: { children: React.ReactNode }) {
  const [players, setPlayers] = useState<Player[]>(MOCK_PLAYERS);
  const [loading, setLoading] = useState(true);

  // L'effectif change très rarement (édition admin uniquement) : une LECTURE PONCTUELLE
  // suffit, pas besoin d'un écouteur temps réel permanent sur la collection.
  // Les modifs admin mettent à jour l'état local tout de suite (voir add/update/delete).
  //
  // Chargement PARESSEUX : déclenché par le premier écran qui appelle usePlayers(), pas
  // au lancement de l'app. L'effectif ne sert qu'aux écrans Notes/Profil/Admin/Jeu — le
  // charger au démarrage faisait payer ~21 lectures à CHAQUE ouverture, y compris aux
  // utilisateurs qui ne consultent que le fil.
  const loadStartedRef = useRef(false);
  const ensureLoaded = useCallback(async () => {
    if (loadStartedRef.current) return;
    loadStartedRef.current = true;
    try {
      const snap = await getDocs(query(collection(db, 'players'), orderBy('position'), orderBy('number')));
      if (!snap.empty) setPlayers(snap.docs.map(d => d.data() as Player)); // sinon on garde les mockData
    } catch { /* garde les mockData */ } finally { setLoading(false); }
  }, []);

  const sortPlayers = (arr: Player[]) =>
    [...arr].sort((a, b) => (a.position === b.position
      ? (a.number ?? 0) - (b.number ?? 0)
      : (a.position < b.position ? -1 : 1)));

  const addPlayer = useCallback(async (player: Omit<Player, 'averageRating' | 'totalVotes'>) => {
    const full: Player = { ...player, averageRating: 0, totalVotes: 0 };
    setPlayers(prev => sortPlayers([...prev.filter(p => p.id !== full.id), full]));
    await setDoc(doc(db, 'players', full.id), full);
  }, []);

  const updatePlayer = useCallback(async (player: Player) => {
    setPlayers(prev => sortPlayers(prev.map(p => (p.id === player.id ? { ...p, ...player } : p))));
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
    <PlayersContext.Provider value={{ players, addPlayer, updatePlayer, deletePlayer, loading, ensureLoaded }}>
      {children}
    </PlayersContext.Provider>
  );
}

export function usePlayers() {
  const ctx = useContext(PlayersContext);
  if (!ctx) throw new Error('usePlayers must be used inside PlayersProvider');
  // Le simple fait qu'un écran consomme l'effectif déclenche son chargement (une fois).
  const { ensureLoaded } = ctx;
  useEffect(() => { ensureLoaded(); }, [ensureLoaded]);
  return ctx;
}
