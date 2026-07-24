import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
// Firestore : abonnés (follows) + INVITATIONS (petit écouteur app-wide, pour recevoir un
// défi partout sans ouvrir de connexion RTDB) + token de notif du destinataire.
import {
  doc, getDoc, setDoc, deleteDoc, collection, query, where, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
// Realtime Database : file + parties (état de jeu). La connexion RTDB n'est ouverte que
// quand l'utilisateur est SUR un écran de jeu (gameScreenActive) → la limite de 100
// connexions simultanées ne concerne QUE les joueurs, jamais ceux qui lisent le feed.
import {
  ref, set, update, remove, onValue, push,
  query as rtQuery, orderByChild, limitToFirst,
  runTransaction as rtTransaction, serverTimestamp as rtTimestamp,
  goOnline, goOffline,
} from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, rtdb } from '../config/firebase';
import { useAuth } from './AuthContext';
import { useFollow } from './FollowContext';
import { GameInvite } from '../types';
import { FIELD_WIDTH, FIELD_HEIGHT } from '../utils/tableFootball';

const DISMISSED_KEY = 'dismissedGameIds';

/** Les deux jeux 1v1. Chacun a ses PROPRES chemins RTDB : une file d'attente commune
 *  apparierait un joueur de football avec un joueur de tirs au but. */
export type GameMode = 'football' | 'penalty';

const MODE_PATHS: Record<GameMode, { queue: string; games: string; active: string }> = {
  football: { queue: 'gameQueue',    games: 'games',        active: 'userActiveGame' },
  penalty:  { queue: 'penaltyQueue', games: 'penaltyGames', active: 'userActivePenalty' },
};

interface GameContextType {
  pendingInvites: GameInvite[]; // tous modes confondus — chaque écran filtre le sien
  mutualFollowerIds: string[];
  activeGameId: string | null;  // partie en cours DU mode de l'écran ouvert
  inQueue: boolean;
  joinQueue: (playerName: string, mode: GameMode) => Promise<void>;
  leaveQueue: (mode: GameMode) => Promise<void>;
  sendInvite: (toId: string, toUsername: string, playerName: string, mode: GameMode) => Promise<void>;
  cancelInvite: (toId: string, mode: GameMode) => Promise<void>;
  acceptInvite: (invite: GameInvite, playerName: string) => Promise<string>;
  declineInvite: (invite: GameInvite) => Promise<void>;
  dismissGame: (gameId: string, mode: GameMode) => void;
  setGameScreenActive: (active: boolean, mode?: GameMode) => void; // ouvre/ferme la connexion RTDB
}

const GameContext = createContext<GameContextType | null>(null);

export function inviteMode(invite: GameInvite): GameMode {
  return invite.mode === 'penalty' ? 'penalty' : 'football';
}

// Football sur plateau (tour par tour). `participants` = MAP {uid: true} (vérifié par les
// règles RTDB). Démarre en phase "setup".
const newFootballObj = (
  player1Id: string, player1Username: string,
  player2Id: string, player2Username: string,
) => ({
  participants: { [player1Id]: true, [player2Id]: true },
  player1Id, player2Id,
  player1Username, player2Username,
  player1Score: 0,
  player2Score: 0,
  phase: 'setup' as const,
  player1Ready: false,
  player2Ready: false,
  player1OffFormation: '',
  player1DefFormation: '',
  player2OffFormation: '',
  player2DefFormation: '',
  attackingTeam: 'player1' as const,
  turn: 'player1' as const,
  shotsLeft: 0,
  kickoffPending: false,
  ballX: FIELD_WIDTH / 2,
  ballY: FIELD_HEIGHT / 2,
  settledSeq: 0,
  status: 'active' as const,
  createdAt: rtTimestamp(),
});

// Tirs au but (tour par tour, choix simultané tireur/gardien). Démarre en "setup".
const newPenaltyObj = (
  player1Id: string, player1Username: string,
  player2Id: string, player2Username: string,
) => ({
  participants: { [player1Id]: true, [player2Id]: true },
  player1Id, player2Id,
  player1Username, player2Username,
  player1Score: 0,
  player2Score: 0,
  player1Shots: 0,
  player2Shots: 0,
  phase: 'setup' as const,
  player1Ready: false,
  player2Ready: false,
  firstShooter: 'player1' as const,
  turn: 'player1' as const,
  shooterPick: null,
  keeperPick: null,
  player1Marks: '',
  player2Marks: '',
  seq: 0,
  status: 'active' as const,
  createdAt: rtTimestamp(),
});

const newGameObj = (mode: GameMode) => (mode === 'penalty' ? newPenaltyObj : newFootballObj);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { followingIds } = useFollow();
  const [pendingInvites, setPendingInvites] = useState<GameInvite[]>([]);
  const [followerIds, setFollowerIds] = useState<string[]>([]);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [queueMode, setQueueMode] = useState<GameMode | null>(null);
  const [screen, setScreen] = useState<{ active: boolean; mode: GameMode }>({ active: false, mode: 'football' });
  const dismissedRef = useRef<Set<string>>(new Set());
  const queueModeRef = useRef<GameMode | null>(null);
  useEffect(() => { queueModeRef.current = queueMode; }, [queueMode]);

  const gameScreenActive = screen.active;
  const mode = screen.mode;
  const paths = MODE_PATHS[mode];

  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_KEY).then(raw => {
      if (raw) { try { dismissedRef.current = new Set(JSON.parse(raw) as string[]); } catch {} }
      setActiveGameId(prev => (prev && dismissedRef.current.has(prev) ? null : prev));
    }).catch(() => {});
  }, []);

  const setGameScreenActive = useCallback((active: boolean, m: GameMode = 'football') => {
    setScreen(prev => (active ? { active: true, mode: m } : { active: false, mode: prev.mode }));
  }, []);

  // ── Connexion RTDB ouverte SEULEMENT sur un écran de jeu (sinon fermée) → un utilisateur
  // qui lit le feed ne consomme AUCUNE connexion RTDB. En quittant l'écran on sort aussi de
  // la file : sinon l'entrée resterait appariable et un adversaire tomberait sur un fantôme.
  useEffect(() => {
    if (gameScreenActive) { goOnline(rtdb); return; }
    const q = queueModeRef.current;
    if (user && q) {
      remove(ref(rtdb, `${MODE_PATHS[q].queue}/${user.id}`))
        .catch(() => {})
        .finally(() => goOffline(rtdb));
    } else {
      goOffline(rtdb);
    }
    setQueueMode(null);
  }, [gameScreenActive, user?.id]);

  const dismissGame = useCallback((gameId: string, m: GameMode) => {
    if (!gameId) return;
    dismissedRef.current.add(gameId);
    const arr = [...dismissedRef.current].slice(-30);
    dismissedRef.current = new Set(arr);
    AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify(arr)).catch(() => {});
    setActiveGameId(prev => (prev === gameId ? null : prev));
    if (user) remove(ref(rtdb, `${MODE_PATHS[m].active}/${user.id}`)).catch(() => {});
  }, [user?.id]);

  // ── Invitations reçues (Firestore, app-wide) — alimente le badge Games partout ──
  useEffect(() => {
    if (!user) { setPendingInvites([]); return; }
    const q = query(collection(db, 'gameInvites'), where('toId', '==', user.id), where('status', '==', 'pending'));
    return onSnapshot(q, snap => {
      setPendingInvites(snap.docs.map(d => ({ id: d.id, ...d.data() } as GameInvite)));
    }, () => {});
  }, [user?.id]);

  // ── Mes followers (Firestore) → abonnés mutuels ──
  // Uniquement sur un écran de jeu : `mutualFollowerIds` ne sert qu'à proposer des
  // adversaires à défier. Laisser cet écouteur ouvert app-wide faisait payer à CHAQUE
  // utilisateur, à chaque lancement, autant de lectures qu'il a d'abonnés — pour une
  // donnée que le reste de l'app n'utilise jamais.
  useEffect(() => {
    if (!user || !gameScreenActive) { setFollowerIds([]); return; }
    const q = query(collection(db, 'follows'), where('followingId', '==', user.id));
    return onSnapshot(q, snap => {
      setFollowerIds(snap.docs.map(d => d.data().followerId as string));
    }, () => {});
  }, [user?.id, gameScreenActive]);

  const followingSet = new Set(followingIds);
  const mutualFollowerIds = followerIds.filter(id => followingSet.has(id));

  // ── Partie active (RTDB) : pointeur /{active}/{uid}, propre au mode de l'écran ouvert. ──
  useEffect(() => {
    if (!user || !gameScreenActive) { setActiveGameId(null); return; }
    return onValue(ref(rtdb, `${paths.active}/${user.id}`), snap => {
      const gid = snap.val() as string | null;
      setActiveGameId(gid && !dismissedRef.current.has(gid) ? gid : null);
    }, () => {});
  }, [user?.id, gameScreenActive, paths.active]);

  // Dès qu'une partie active est détectée, on quitte la file d'attente
  useEffect(() => {
    if (!user || !activeGameId) return;
    setQueueMode(null);
    remove(ref(rtdb, `${paths.queue}/${user.id}`)).catch(() => {});
  }, [activeGameId, user?.id, paths.queue]);

  // ── Matching (RTDB) : le plus ancien en attente réserve l'adversaire et crée la partie ──
  const inQueue = queueMode === mode;
  useEffect(() => {
    if (!user || !inQueue || !gameScreenActive) return;
    const q = rtQuery(ref(rtdb, paths.queue), orderByChild('joinedAt'), limitToFirst(10));
    return onValue(q, async snap => {
      const entries: { id: string; username: string; claimed?: boolean }[] = [];
      snap.forEach(c => { entries.push({ id: c.key as string, ...c.val() }); });
      const candidates = entries.filter(e => !e.claimed);
      if (candidates.length < 2) return;
      const [first, second] = candidates;
      if (first.id !== user.id) return;

      try {
        const res = await rtTransaction(ref(rtdb, `${paths.queue}/${second.id}/claimed`), cur => (cur ? undefined : true));
        if (!res.committed) return;
        await update(ref(rtdb, `${paths.queue}/${first.id}`), { claimed: true });
        const gameId = push(ref(rtdb, paths.games)).key as string;
        await set(ref(rtdb, `${paths.games}/${gameId}`), newGameObj(mode)(first.id, first.username, second.id, second.username));
        await update(ref(rtdb, paths.active), { [first.id]: gameId, [second.id]: gameId });
      } catch {}
    }, () => {});
  }, [user?.id, inQueue, gameScreenActive, mode, paths.queue, paths.games, paths.active]);

  const joinQueue = useCallback(async (_playerName: string, m: GameMode) => {
    if (!user) return;
    setQueueMode(m);
    await set(ref(rtdb, `${MODE_PATHS[m].queue}/${user.id}`), {
      username: user.username,
      claimed: false,
      joinedAt: rtTimestamp(),
    });
  }, [user?.id]);

  const leaveQueue = useCallback(async (m: GameMode) => {
    if (!user) return;
    setQueueMode(null);
    await remove(ref(rtdb, `${MODE_PATHS[m].queue}/${user.id}`)).catch(() => {});
  }, [user?.id]);

  // ── Invitations : écrites sur FIRESTORE (détectables partout sans connexion RTDB) ──
  const sendInvite = useCallback(async (toId: string, _toUsername: string, playerName: string, m: GameMode) => {
    if (!user) return;
    await setDoc(doc(db, 'gameInvites', `${toId}_${user.id}_${m}`), {
      fromId: user.id,
      fromUsername: user.username,
      fromAvatar: user.avatar,
      fromPlayerName: playerName,
      toId,
      mode: m,
      status: 'pending',
      createdAt: serverTimestamp(),
    });
    try {
      const toSnap = await getDoc(doc(db, 'users', toId));
      const token = toSnap.data()?.expoPushToken as string | undefined;
      if (token?.startsWith('ExponentPushToken')) {
        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify([{
            to: token,
            title: m === 'penalty' ? '🥅 Défi Tirs au But 1v1 !' : '⚽ Défi Football 1v1 !',
            body: `${user.username} te défie`,
            sound: 'default',
            data: { type: 'game_invite', fromId: user.id, mode: m },
          }]),
        });
      }
    } catch {}
  }, [user?.id]);

  // Accepter : crée la partie sur RTDB (on est sur l'écran de jeu → RTDB connectée),
  // supprime l'invitation Firestore.
  const acceptInvite = useCallback(async (invite: GameInvite, _playerName: string): Promise<string> => {
    if (!user) throw new Error('not authenticated');
    const m = inviteMode(invite);
    const p = MODE_PATHS[m];
    const gameId = push(ref(rtdb, p.games)).key as string;
    await set(ref(rtdb, `${p.games}/${gameId}`), newGameObj(m)(
      invite.fromId, invite.fromUsername,
      user.id, user.username,
    ));
    await update(ref(rtdb, p.active), { [invite.fromId]: gameId, [user.id]: gameId });
    await deleteDoc(doc(db, 'gameInvites', invite.id)).catch(() => {});
    return gameId;
  }, [user?.id]);

  const declineInvite = useCallback(async (invite: GameInvite) => {
    await deleteDoc(doc(db, 'gameInvites', invite.id)).catch(() => {});
  }, []);

  const cancelInvite = useCallback(async (toId: string, m: GameMode) => {
    if (!user) return;
    await deleteDoc(doc(db, 'gameInvites', `${toId}_${user.id}_${m}`)).catch(() => {});
  }, [user?.id]);

  return (
    <GameContext.Provider value={{
      pendingInvites, mutualFollowerIds, activeGameId, inQueue,
      joinQueue, leaveQueue, sendInvite, cancelInvite, acceptInvite, declineInvite, dismissGame,
      setGameScreenActive,
    }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside GameProvider');
  return ctx;
}
