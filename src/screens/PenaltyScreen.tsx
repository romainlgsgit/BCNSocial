import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Image,
  Animated, Easing, StatusBar, ActivityIndicator, Dimensions,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { ref, onValue, update as rtUpdate, runTransaction as rtRunTransaction } from 'firebase/database';
import { db, rtdb } from '../config/firebase';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';
import { useAuth } from '../context/AuthContext';
import { useGame, inviteMode } from '../context/GameContext';
import { usePlayers } from '../context/PlayersContext';
import { GameInvite, PenaltySession, PenaltyResult, PenaltyTaker, Player } from '../types';
import {
  GRID_COLS, GRID_ROWS, CELL_COUNT, SQUAD_SIZE, REGULATION_ROUNDS,
  Side, cellRow, cellCol, keeperCoverage, isSaved,
  shooterIndex, sideToShoot, currentRound, evaluateMatch, appendMark,
} from '../utils/penaltyShootout';

const WINNER_COINS = 100;
const LOSER_COINS = 30;
const GAME_PATH = 'penaltyGames';

type Phase = 'lobby' | 'invitePicker' | 'queueWaiting' | 'inviteWaiting' | 'playing';

// ─── Géométrie du but (vue de FACE) ─────────────────────────────────────────────
const SCREEN_W = Dimensions.get('window').width;
const GOAL_W = Math.min(SCREEN_W - 40, 340);
const GOAL_H = Math.round(GOAL_W * 0.55);
const CELL_W = GOAL_W / GRID_COLS;
const CELL_H = GOAL_H / GRID_ROWS;
const PITCH_H = 140;                 // pelouse devant le but
const STAGE_H = GOAL_H + PITCH_H;
const SPOT = { x: GOAL_W / 2, y: GOAL_H + 92 };  // point de penalty
const BALL_R = 12;
const KEEPER_R = 28;
const KEEPER_REST = { x: GOAL_W / 2, y: GOAL_H - KEEPER_R * 0.5 };

function cellCenter(cell: number) {
  return { x: (cellCol(cell) + 0.5) * CELL_W, y: (cellRow(cell) + 0.5) * CELL_H };
}

function playerPhotoSource(player?: Player | null) {
  if (!player) return null;
  if (player.photoBase64) return { uri: `data:image/jpeg;base64,${player.photoBase64}` };
  if (player.photoUrl) return { uri: player.photoUrl };
  return null;
}

// ─── Écran principal ───────────────────────────────────────────────────────────

export default function PenaltyScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { players: allPlayers } = usePlayers();
  const {
    pendingInvites: allInvites, mutualFollowerIds, activeGameId,
    joinQueue, leaveQueue, sendInvite, cancelInvite, acceptInvite, declineInvite, dismissGame,
    setGameScreenActive,
  } = useGame();

  // Les invitations sont app-wide et partagées avec Football 1v1 → on ne garde que
  // les défis de CE jeu.
  const pendingInvites = useMemo(
    () => allInvites.filter(i => inviteMode(i) === 'penalty'),
    [allInvites],
  );

  // Connexion RTDB ouverte uniquement tant qu'on est sur l'écran de jeu.
  useFocusEffect(
    useCallback(() => {
      setGameScreenActive(true, 'penalty');
      return () => setGameScreenActive(false);
    }, [setGameScreenActive]),
  );

  const [phase, setPhase] = useState<Phase>('lobby');
  const [invitedTo, setInvitedTo] = useState<{ id: string; username: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewingGameId, setViewingGameId] = useState<string | null>(null);
  const [game, setGame] = useState<(PenaltySession & { id: string }) | null>(null);

  useEffect(() => {
    if (activeGameId && !viewingGameId) {
      setViewingGameId(activeGameId);
      setPhase('playing');
    }
  }, [activeGameId, viewingGameId]);

  useEffect(() => {
    if (!viewingGameId) { setGame(null); return; }
    return onValue(ref(rtdb, `${GAME_PATH}/${viewingGameId}`), snap => {
      const v = snap.val();
      if (v) setGame({ ...(v as PenaltySession), id: viewingGameId });
    });
  }, [viewingGameId]);

  // Coup d'envoi : quand les DEUX ont validé leur effectif, player1 (hôte) tire au sort
  // qui tire en premier. Un seul écrit pour éviter les doublons.
  const kickoffDoneRef = useRef(false);
  useEffect(() => {
    if (!game || !user) return;
    const me: Side = game.player1Id === user.id ? 'player1' : 'player2';
    if (game.phase !== 'setup' || me !== 'player1') return;
    if (!game.player1Ready || !game.player2Ready || kickoffDoneRef.current) return;
    kickoffDoneRef.current = true;
    const first: Side = Math.random() < 0.5 ? 'player1' : 'player2';
    rtUpdate(ref(rtdb, `${GAME_PATH}/${game.id}`), {
      phase: 'playing', firstShooter: first, turn: first,
      shooterPick: null, keeperPick: null, lastResult: null, seq: 0,
    }).catch(() => {});
  }, [game?.phase, game?.player1Ready, game?.player2Ready, user?.id]);

  // Paiement des pièces (une seule fois). Verrou RTDB (transaction sur payoutDone) puis
  // crédit Firestore (les users vivent là).
  useEffect(() => {
    if (!game || game.status !== 'finished' || game.payoutDone || !game.winnerId) return;
    const gid = game.id;
    const winnerId = game.winnerId;
    const loserId = winnerId === game.player1Id ? game.player2Id : game.player1Id;
    (async () => {
      const res = await rtRunTransaction(ref(rtdb, `${GAME_PATH}/${gid}/payoutDone`), cur => (cur ? undefined : true));
      if (!res.committed) return;
      updateDoc(doc(db, 'users', winnerId), { coins: increment(WINNER_COINS) }).catch(() => {});
      updateDoc(doc(db, 'users', loserId), { coins: increment(LOSER_COINS) }).catch(() => {});
    })();
  }, [game?.status, game?.payoutDone, game?.id]);

  const handleJoinQueue = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    try { await joinQueue(user.username, 'penalty'); setPhase('queueWaiting'); }
    finally { setBusy(false); }
  }, [user, joinQueue]);

  const handleInvite = useCallback(async (toId: string, toUsername: string) => {
    if (!user) return;
    setBusy(true);
    try {
      await sendInvite(toId, toUsername, user.username, 'penalty');
      setInvitedTo({ id: toId, username: toUsername });
      setPhase('inviteWaiting');
    } finally { setBusy(false); }
  }, [user, sendInvite]);

  const handleAccept = useCallback(async (invite: GameInvite) => {
    if (!user) return;
    setBusy(true);
    try {
      const gameId = await acceptInvite(invite, user.username);
      setViewingGameId(gameId);
      setPhase('playing');
    } finally { setBusy(false); }
  }, [user, acceptInvite]);

  const backToLobby = () => {
    leaveQueue('penalty');
    if (invitedTo) cancelInvite(invitedTo.id, 'penalty');
    if (viewingGameId) dismissGame(viewingGameId, 'penalty');
    setPhase('lobby');
    setInvitedTo(null);
    setViewingGameId(null);
    kickoffDoneRef.current = false;
  };

  const leaveMatch = useCallback(() => {
    const g = game;
    if (viewingGameId) dismissGame(viewingGameId, 'penalty');
    setViewingGameId(null);
    setPhase('lobby');
    kickoffDoneRef.current = false;
    if (g && user && g.status === 'active') {
      const opponentId = g.player1Id === user.id ? g.player2Id : g.player1Id;
      // Abandon = défaite. Transaction : n'écrase pas une fin déjà écrite.
      rtRunTransaction(ref(rtdb, `${GAME_PATH}/${g.id}`), (cur) => {
        if (!cur || cur.status !== 'active') return;
        cur.status = 'finished';
        cur.phase = 'finished';
        cur.winnerId = opponentId;
        return cur;
      }).catch(() => {});
    }
  }, [game, user, viewingGameId, dismissGame]);

  const header = (title: string, onBack?: () => void) => (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <TouchableOpacity style={styles.backBtn} onPress={onBack ?? (() => navigation.goBack())} activeOpacity={0.7}>
        <Ionicons name="arrow-back" size={20} color={Colors.text} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={{ width: 36 }} />
    </View>
  );

  // ── En partie ──
  if (phase === 'playing' && game && user) {
    const me: Side = game.player1Id === user.id ? 'player1' : 'player2';

    if (game.status === 'finished' || game.phase === 'finished') {
      const won = game.winnerId === user.id;
      return (
        <View style={styles.root}>
          <StatusBar barStyle="light-content" />
          {header('Résultat')}
          <View style={styles.resultWrap}>
            <Text style={{ fontSize: 64 }}>{won ? '🏆' : '😔'}</Text>
            <Text style={styles.resultTitle}>{won ? 'Victoire !' : 'Défaite'}</Text>
            <Text style={styles.resultScore}>{game.player1Score} - {game.player2Score}</Text>
            <View style={styles.coinsBadge}>
              <Ionicons name="wallet-outline" size={16} color={Colors.gold} />
              <Text style={styles.coinsBadgeText}>+{won ? WINNER_COINS : LOSER_COINS} pièces</Text>
            </View>
            <TouchableOpacity style={styles.primaryBtn} onPress={backToLobby} activeOpacity={0.85}>
              <Text style={styles.primaryBtnText}>Retour</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (game.phase === 'setup') {
      return (
        <View style={styles.root}>
          <StatusBar barStyle="light-content" />
          {header('Compose ton équipe', leaveMatch)}
          <PenaltySetup game={game} me={me} allPlayers={allPlayers} />
        </View>
      );
    }

    return (
      <View style={styles.root}>
        <StatusBar barStyle="light-content" />
        {header('Tirs au But 1v1', leaveMatch)}
        <PenaltyGame game={game} me={me} allPlayers={allPlayers} />
      </View>
    );
  }

  // ── Lobby ──
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      {header('Tirs au But 1v1')}
      <ScrollView contentContainerStyle={{ padding: Spacing.md, gap: Spacing.lg }}>
        {pendingInvites.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={styles.sectionLabel}>Défis reçus</Text>
            {pendingInvites.map(inv => (
              <View key={inv.id} style={styles.inviteRow}>
                <Text style={styles.inviteText}><Text style={{ fontWeight: '800' }}>{inv.fromUsername}</Text> te défie !</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity style={[styles.smallBtn, { backgroundColor: Colors.primary }]} disabled={busy} onPress={() => handleAccept(inv)}>
                    <Text style={styles.smallBtnText}>Accepter</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.smallBtn, { backgroundColor: '#2a2a2a' }]} onPress={() => declineInvite(inv)}>
                    <Text style={styles.smallBtnText}>Refuser</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.introCard}>
          <Text style={styles.introTitle}>🥅 Séance de tirs au but</Text>
          <Text style={styles.introText}>
            Choisis 5 tireurs et 1 gardien. À chaque tir, le tireur vise une des 6 cases du
            but pendant que le gardien choisit où plonger — un plongeon couvre aussi les
            cases voisines. {REGULATION_ROUNDS} tirs chacun, puis mort subite.
          </Text>
        </View>

        {phase === 'lobby' && (
          <View style={{ gap: 12 }}>
            <TouchableOpacity style={styles.primaryBtn} disabled={busy} onPress={handleJoinQueue} activeOpacity={0.85}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>🔍 Trouver un adversaire</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setPhase('invitePicker')} activeOpacity={0.85}>
              <Text style={styles.secondaryBtnText}>⚔️ Défier un ami</Text>
            </TouchableOpacity>
          </View>
        )}

        {phase === 'invitePicker' && (
          <View style={{ gap: 10 }}>
            <Text style={styles.sectionLabel}>Abonnés mutuels</Text>
            {mutualFollowerIds.length === 0 ? (
              <Text style={styles.hint}>Vous devez vous suivre mutuellement pour vous défier.</Text>
            ) : (
              <MutualFollowersList ids={mutualFollowerIds} busy={busy} onInvite={handleInvite} />
            )}
            <TouchableOpacity onPress={() => setPhase('lobby')} activeOpacity={0.7}>
              <Text style={styles.linkText}>← Retour</Text>
            </TouchableOpacity>
          </View>
        )}

        {phase === 'queueWaiting' && (
          <View style={styles.waitingBox}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.waitingText}>En attente d'un adversaire…</Text>
            <TouchableOpacity onPress={backToLobby} activeOpacity={0.7}><Text style={styles.linkText}>Annuler</Text></TouchableOpacity>
          </View>
        )}

        {phase === 'inviteWaiting' && (
          <View style={styles.waitingBox}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.waitingText}>En attente que {invitedTo?.username ?? 'ton ami'} accepte…</Text>
            <TouchableOpacity onPress={backToLobby} activeOpacity={0.7}><Text style={styles.linkText}>Annuler</Text></TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Setup : 5 tireurs (dans l'ordre de passage) + 1 gardien ────────────────────

function PenaltySetup({ game, me, allPlayers }: {
  game: PenaltySession & { id: string }; me: Side; allPlayers: Player[];
}) {
  const iAmReady = me === 'player1' ? game.player1Ready : game.player2Ready;
  const oppReady = me === 'player1' ? game.player2Ready : game.player1Ready;

  const [squad, setSquad] = useState<Player[]>([]);
  const [gk, setGk] = useState<Player | null>(null);
  const [busy, setBusy] = useState(false);

  const toggleShooter = (p: Player) => {
    setSquad(prev => {
      if (prev.find(x => x.id === p.id)) return prev.filter(x => x.id !== p.id);
      if (prev.length >= SQUAD_SIZE) return prev;
      return [...prev, p];
    });
    setGk(prev => (prev?.id === p.id ? null : prev));
  };

  const pickGk = (p: Player) => {
    setSquad(prev => prev.filter(x => x.id !== p.id)); // un gardien ne tire pas
    setGk(prev => (prev?.id === p.id ? null : p));
  };

  const ready = squad.length === SQUAD_SIZE && !!gk;

  const submit = async () => {
    if (!ready || !gk) return;
    setBusy(true);
    try {
      const takers: PenaltyTaker[] = squad.map(p => ({ id: p.id, name: p.name }));
      await rtUpdate(ref(rtdb, `${GAME_PATH}/${game.id}`), {
        [`${me}Squad`]: takers,
        [`${me}GK`]: { id: gk.id, name: gk.name },
        [`${me}Ready`]: true,
      });
    } finally { setBusy(false); }
  };

  if (iAmReady) {
    return (
      <View style={styles.waitingBox}>
        <Text style={{ fontSize: 40 }}>✅</Text>
        <Text style={styles.waitingText}>Équipe validée !</Text>
        <ActivityIndicator color={Colors.primary} />
        <Text style={styles.hint}>{oppReady ? 'Lancement…' : "En attente de l'adversaire…"}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: Spacing.md, gap: Spacing.lg, paddingBottom: 40 }}>
      <View style={{ gap: 8 }}>
        <Text style={styles.sectionLabel}>1. Tes {SQUAD_SIZE} tireurs ({squad.length}/{SQUAD_SIZE})</Text>
        <Text style={styles.hint}>L'ordre de sélection = l'ordre de passage.</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
          {allPlayers.map(p => {
            const idx = squad.findIndex(x => x.id === p.id);
            const active = idx >= 0;
            const isGk = gk?.id === p.id;
            const src = playerPhotoSource(p);
            return (
              <TouchableOpacity
                key={p.id}
                activeOpacity={0.8}
                disabled={isGk}
                onPress={() => toggleShooter(p)}
                style={[styles.playerChip, active && styles.playerChipActive, isGk && { opacity: 0.35 }]}
              >
                <View style={styles.playerChipAvatar}>
                  {src ? <Image source={src} style={styles.playerChipImg} /> : <Text style={{ fontSize: 22 }}>{p.photo}</Text>}
                </View>
                <Text style={[styles.playerChipName, active && { color: Colors.text }]} numberOfLines={1}>{p.name}</Text>
                {active && <Text style={styles.selTag}>#{idx + 1}</Text>}
                {isGk && <Text style={styles.gkTag}>🧤 GK</Text>}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={styles.sectionLabel}>2. Ton gardien {gk ? '✅' : ''}</Text>
        <Text style={styles.hint}>Il arrêtera les tirs de l'adversaire.</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
          {allPlayers.map(p => {
            const inSquad = squad.some(x => x.id === p.id);
            const isGk = gk?.id === p.id;
            const src = playerPhotoSource(p);
            return (
              <TouchableOpacity
                key={p.id}
                activeOpacity={0.8}
                disabled={inSquad}
                onPress={() => pickGk(p)}
                style={[styles.playerChip, isGk && { borderColor: Colors.gold, backgroundColor: Colors.gold + '18' }, inSquad && { opacity: 0.35 }]}
              >
                <View style={styles.playerChipAvatar}>
                  {src ? <Image source={src} style={styles.playerChipImg} /> : <Text style={{ fontSize: 22 }}>{p.photo}</Text>}
                </View>
                <Text style={[styles.playerChipName, isGk && { color: Colors.text }]} numberOfLines={1}>{p.name}</Text>
                {isGk && <Text style={styles.gkTag}>🧤 GK</Text>}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <TouchableOpacity style={[styles.primaryBtn, !ready && styles.btnDisabled]} disabled={!ready || busy} onPress={submit} activeOpacity={0.85}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Prêt ✅</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── La séance de tirs au but ───────────────────────────────────────────────────

interface RevealState extends PenaltyResult {
  shooterName: string;
  keeperName: string;
}

function PenaltyGame({ game, me, allPlayers }: {
  game: PenaltySession & { id: string }; me: Side; allPlayers: Player[];
}) {
  const gameRef = useRef(game);
  useEffect(() => { gameRef.current = game; }, [game]);

  const byId = useMemo(() => {
    const m: Record<string, Player> = {};
    for (const p of allPlayers) m[p.id] = p;
    return m;
  }, [allPlayers]);

  const [reveal, setReveal] = useState<RevealState | null>(null);
  const [flash, setFlash] = useState<'goal' | 'save' | null>(null);
  const seenSeqRef = useRef(game.lastResult?.seq ?? 0);
  const resolvedSeqRef = useRef(-1);

  const ballPos = useRef(new Animated.ValueXY(SPOT)).current;
  const ballScale = useRef(new Animated.Value(1)).current;
  const keeperPos = useRef(new Animated.ValueXY(KEEPER_REST)).current;

  const iShoot = game.turn === me;
  const myPick = (iShoot ? game.shooterPick : game.keeperPick) ?? null;
  const oppCommitted = (iShoot ? game.keeperPick : game.shooterPick) != null;

  // ── Rejeu de l'action (identique sur les deux clients, piloté par lastResult) ──
  useEffect(() => {
    const r = game.lastResult;
    if (!r || r.seq <= seenSeqRef.current) return;
    seenSeqRef.current = r.seq;

    // Le doc a DÉJÀ avancé le tour : on retrouve qui vient de tirer via lastResult.
    const sSide = r.shooter;
    const sShots = sSide === 'player1' ? game.player1Shots : game.player2Shots;
    const sSquad = (sSide === 'player1' ? game.player1Squad : game.player2Squad) ?? [];
    const kSide: Side = sSide === 'player1' ? 'player2' : 'player1';
    const kGk = kSide === 'player1' ? game.player1GK : game.player2GK;

    setReveal({
      ...r,
      shooterName: sSquad[shooterIndex(Math.max(0, sShots - 1))]?.name ?? '',
      keeperName: kGk?.name ?? '',
    });

    const target = cellCenter(r.shotCell);
    const dive = cellCenter(r.keeperCell);
    ballPos.setValue(SPOT);
    ballScale.setValue(1);
    keeperPos.setValue(KEEPER_REST);

    Animated.parallel([
      Animated.timing(keeperPos, { toValue: dive, duration: 480, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(ballPos, { toValue: target, duration: 620, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(ballScale, { toValue: 0.5, duration: 620, easing: Easing.linear, useNativeDriver: true }),
    ]).start(() => {
      if (!r.scored) {
        // Arrêt : le ballon est repoussé vers l'avant
        Animated.timing(ballPos, {
          toValue: { x: target.x + (target.x < GOAL_W / 2 ? -40 : 40), y: GOAL_H + 40 },
          duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: true,
        }).start();
        Animated.timing(ballScale, { toValue: 0.85, duration: 320, useNativeDriver: true }).start();
      }
      setFlash(r.scored ? 'goal' : 'save');
    });

    const t = setTimeout(() => {
      setFlash(null);
      setReveal(null);
      ballPos.setValue(SPOT);
      ballScale.setValue(1);
      keeperPos.setValue(KEEPER_REST);
    }, 2100);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.lastResult?.seq]);

  // ── Résolution du tir : l'hôte (player1) tranche dès que les deux choix sont là ──
  useEffect(() => {
    if (me !== 'player1' || game.phase !== 'playing') return;
    const sp = game.shooterPick ?? null;
    const kp = game.keeperPick ?? null;
    if (sp == null || kp == null) return;
    if (resolvedSeqRef.current === game.seq) return;
    resolvedSeqRef.current = game.seq;

    const shooter = game.turn;
    const scored = !isSaved(sp, kp);
    const p1Score = game.player1Score + (shooter === 'player1' && scored ? 1 : 0);
    const p2Score = game.player2Score + (shooter === 'player2' && scored ? 1 : 0);
    const p1Shots = game.player1Shots + (shooter === 'player1' ? 1 : 0);
    const p2Shots = game.player2Shots + (shooter === 'player2' ? 1 : 0);
    const seq = game.seq + 1;
    const outcome = evaluateMatch(p1Score, p2Score, p1Shots, p2Shots);

    const payload: Record<string, unknown> = {
      player1Score: p1Score, player2Score: p2Score,
      player1Shots: p1Shots, player2Shots: p2Shots,
      player1Marks: shooter === 'player1' ? appendMark(game.player1Marks, scored) : (game.player1Marks ?? ''),
      player2Marks: shooter === 'player2' ? appendMark(game.player2Marks, scored) : (game.player2Marks ?? ''),
      turn: sideToShoot(p1Shots, p2Shots, game.firstShooter ?? 'player1'),
      shooterPick: null, keeperPick: null,
      lastResult: {
        round: currentRound(game.player1Shots, game.player2Shots),
        shooter, shotCell: sp, keeperCell: kp, scored, seq,
      },
      seq,
    };
    if (outcome.finished) {
      payload.phase = 'finished';
      payload.status = 'finished';
      payload.winnerId = outcome.winner === 'player1' ? game.player1Id : game.player2Id;
    }
    rtUpdate(ref(rtdb, `${GAME_PATH}/${game.id}`), payload).catch(() => {});
  }, [me, game.phase, game.shooterPick, game.keeperPick, game.seq]);

  const pick = useCallback((cell: number) => {
    const g = gameRef.current;
    if (g.phase !== 'playing') return;
    const mine = ((g.turn === me ? g.shooterPick : g.keeperPick) ?? null);
    if (mine != null) return;
    const field = g.turn === me ? 'shooterPick' : 'keeperPick';
    rtUpdate(ref(rtdb, `${GAME_PATH}/${g.id}`), { [field]: cell }).catch(() => {});
  }, [me]);

  // Qui joue quoi, maintenant
  const shooterSide = game.turn;
  const shooterShots = shooterSide === 'player1' ? game.player1Shots : game.player2Shots;
  const shooterSquad = (shooterSide === 'player1' ? game.player1Squad : game.player2Squad) ?? [];
  const currentTaker = shooterSquad[shooterIndex(shooterShots)];
  const keeperSide: Side = shooterSide === 'player1' ? 'player2' : 'player1';
  const currentKeeper = keeperSide === 'player1' ? game.player1GK : game.player2GK;

  const myScore = me === 'player1' ? game.player1Score : game.player2Score;
  const oppScore = me === 'player1' ? game.player2Score : game.player1Score;
  const myMarks = (me === 'player1' ? game.player1Marks : game.player2Marks) ?? '';
  const oppMarks = (me === 'player1' ? game.player2Marks : game.player1Marks) ?? '';
  const oppName = me === 'player1' ? game.player2Username : game.player1Username;

  const round = currentRound(game.player1Shots, game.player2Shots);
  const suddenDeath = round > REGULATION_ROUNDS;

  // Zone couverte par MON plongeon (aide visuelle quand je suis gardien)
  const myCoverage = !iShoot && myPick != null ? keeperCoverage(myPick) : [];

  const locked = myPick != null;
  const busyReveal = reveal != null;

  let prompt: string;
  if (busyReveal) prompt = reveal!.scored ? '⚽ But !' : '🧤 Arrêt !';
  else if (locked) prompt = oppCommitted ? 'Résolution…' : "⏳ En attente de l'adversaire…";
  else prompt = iShoot ? '🎯 Choisis où tirer' : '🧤 Choisis où plonger';

  const revealShot = reveal?.shotCell ?? null;
  const revealDive = reveal ? keeperCoverage(reveal.keeperCell) : [];

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
      {/* Score */}
      <View style={styles.scoreRow}>
        <View style={styles.scoreCol}>
          <Text style={styles.scoreName}>Toi</Text>
          <Text style={styles.scoreValue}>{myScore}</Text>
          <MarksRow marks={myMarks} />
        </View>
        <Text style={styles.scoreDash}>—</Text>
        <View style={styles.scoreCol}>
          <Text style={styles.scoreName} numberOfLines={1}>{oppName}</Text>
          <Text style={styles.scoreValue}>{oppScore}</Text>
          <MarksRow marks={oppMarks} />
        </View>
      </View>

      <Text style={styles.roundLabel}>
        {suddenDeath ? `☠️ Mort subite — manche ${round}` : `Manche ${round} / ${REGULATION_ROUNDS}`}
      </Text>

      {/* Rôle courant */}
      <View style={styles.dueRow}>
        <RoleCard
          label={iShoot ? 'Tu tires' : 'Tire'}
          name={currentTaker?.name ?? '—'}
          player={currentTaker ? byId[currentTaker.id] : null}
          emoji="🎯"
          highlight={iShoot}
        />
        <RoleCard
          label={!iShoot ? 'Tu gardes' : 'Garde'}
          name={currentKeeper?.name ?? '—'}
          player={currentKeeper ? byId[currentKeeper.id] : null}
          emoji="🧤"
          highlight={!iShoot}
        />
      </View>

      {/* Le but, vu de face */}
      <View style={styles.stage}>
        <View style={styles.goalArea}>
          <GoalNet />

          {/* Cases */}
          {Array.from({ length: CELL_COUNT }).map((_, cell) => {
            const c = cellCenter(cell);
            const isMine = myPick === cell;
            const inMyCoverage = myCoverage.includes(cell);
            const isRevealShot = revealShot === cell;
            const inRevealDive = revealDive.includes(cell);
            return (
              <TouchableOpacity
                key={cell}
                activeOpacity={0.7}
                disabled={locked || busyReveal || game.phase !== 'playing'}
                onPress={() => pick(cell)}
                style={[
                  styles.cell,
                  {
                    left: cellCol(cell) * CELL_W,
                    top: cellRow(cell) * CELL_H,
                    width: CELL_W, height: CELL_H,
                  },
                  inMyCoverage && styles.cellCoverage,
                  isMine && (iShoot ? styles.cellPickedShot : styles.cellPickedDive),
                  inRevealDive && styles.cellRevealDive,
                  isRevealShot && styles.cellRevealShot,
                ]}
              >
                {isMine && !busyReveal && (
                  <Text style={styles.cellMark}>{iShoot ? '🎯' : '🧤'}</Text>
                )}
              </TouchableOpacity>
            );
          })}

          {/* Gardien */}
          <Animated.View
            pointerEvents="none"
            style={[styles.keeper, { transform: [...keeperPos.getTranslateTransform()] }]}
          >
            <KeeperFace player={currentKeeper ? byId[currentKeeper.id] : null} />
          </Animated.View>
        </View>

        {/* Pelouse + point de penalty */}
        <View style={styles.pitch} pointerEvents="none">
          <View style={styles.penaltySpot} />
        </View>

        {/* Ballon */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ball,
            { transform: [...ballPos.getTranslateTransform(), { scale: ballScale }] },
          ]}
        >
          <Text style={{ fontSize: 15 }}>⚽</Text>
        </Animated.View>

        {flash && (
          <View style={styles.flashOverlay} pointerEvents="none">
            <Text style={styles.flashText}>{flash === 'goal' ? '⚽ BUT !' : '🧤 ARRÊT !'}</Text>
            {reveal && (
              <Text style={styles.flashSub}>
                {reveal.shooterName} {flash === 'goal' ? 'trompe' : 'buté par'} {reveal.keeperName}
              </Text>
            )}
          </View>
        )}
      </View>

      <Text style={[styles.prompt, !locked && !busyReveal && { color: Colors.primary }]}>{prompt}</Text>
      {!locked && !busyReveal && (
        <Text style={styles.hint}>
          {iShoot
            ? 'Le gardien couvre la case où il plonge ET les cases voisines — évite-les.'
            : 'Ton plongeon couvre la case choisie + ses voisines (en surbrillance).'}
        </Text>
      )}
      {locked && !busyReveal && !oppCommitted && (
        <Text style={styles.hint}>Choix verrouillé. L'adversaire n'a pas encore joué.</Text>
      )}
    </ScrollView>
  );
}

function MarksRow({ marks }: { marks: string }) {
  if (!marks) return <View style={{ height: 14 }} />;
  return (
    <View style={styles.marksRow}>
      {marks.split('').slice(-8).map((m, i) => (
        <View key={i} style={[styles.mark, { backgroundColor: m === 'O' ? Colors.primary : '#3a3a3a' }]} />
      ))}
    </View>
  );
}

function RoleCard({ label, name, player, emoji, highlight }: {
  label: string; name: string; player: Player | null; emoji: string; highlight: boolean;
}) {
  const src = playerPhotoSource(player);
  return (
    <View style={[styles.roleCard, highlight && styles.roleCardActive]}>
      <View style={styles.roleAvatar}>
        {src ? <Image source={src} style={styles.roleAvatarImg} /> : <Text style={{ fontSize: 20 }}>{emoji}</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.roleLabel, highlight && { color: Colors.primary }]}>{emoji} {label}</Text>
        <Text style={styles.roleName} numberOfLines={1}>{name}</Text>
      </View>
    </View>
  );
}

function KeeperFace({ player }: { player: Player | null }) {
  const src = playerPhotoSource(player);
  return (
    <View style={styles.keeperInner}>
      {src ? <Image source={src} style={styles.keeperImg} /> : <Text style={{ fontSize: 22 }}>🧤</Text>}
    </View>
  );
}

/** Filets + montants, dessinés avec de simples Views (aucune dépendance graphique). */
function GoalNet() {
  const verticals = 9;
  const horizontals = 6;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: verticals }).map((_, i) => (
        <View key={`v${i}`} style={[styles.netLine, {
          left: (GOAL_W / (verticals - 1)) * i, top: 0, width: 1, height: GOAL_H,
        }]} />
      ))}
      {Array.from({ length: horizontals }).map((_, i) => (
        <View key={`h${i}`} style={[styles.netLine, {
          top: (GOAL_H / (horizontals - 1)) * i, left: 0, height: 1, width: GOAL_W,
        }]} />
      ))}
      <View style={[styles.post, { left: 0, top: 0, bottom: 0, width: 7 }]} />
      <View style={[styles.post, { right: 0, top: 0, bottom: 0, width: 7 }]} />
      <View style={[styles.post, { left: 0, right: 0, top: 0, height: 7 }]} />
    </View>
  );
}

// ─── Liste des abonnés mutuels ──────────────────────────────────────────────────

function MutualFollowersList({ ids, busy, onInvite }: {
  ids: string[]; busy: boolean; onInvite: (id: string, username: string) => void;
}) {
  const [users, setUsers] = useState<{ id: string; username: string; avatar: string }[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const results = await Promise.all(ids.map(async id => {
        const snap = await getDoc(doc(db, 'users', id));
        const data = snap.data();
        return { id, username: data?.username ?? '?', avatar: data?.avatar ?? '🦁' };
      }));
      if (!cancelled) { setUsers(results); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [ids.join(',')]);
  if (loading) return <ActivityIndicator color={Colors.primary} />;
  return (
    <View style={{ gap: 8 }}>
      {users.map(u => (
        <View key={u.id} style={styles.inviteRow}>
          <Text style={styles.inviteText}>{u.avatar} {u.username}</Text>
          <TouchableOpacity style={[styles.smallBtn, { backgroundColor: Colors.primary }]} disabled={busy} onPress={() => onInvite(u.id, u.username)}>
            <Text style={styles.smallBtnText}>Défier</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingBottom: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1e1e1e', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: Colors.text, fontSize: FontSize.lg, fontWeight: '800' },

  sectionLabel: { color: Colors.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  hint: { color: Colors.textMuted, fontSize: 12, textAlign: 'center', paddingHorizontal: Spacing.lg, marginTop: 4 },

  introCard: { backgroundColor: Colors.surface, borderRadius: BorderRadius.md, padding: 16, borderWidth: 1, borderColor: '#242424', gap: 6 },
  introTitle: { color: Colors.text, fontSize: FontSize.md, fontWeight: '800' },
  introText: { color: Colors.textSecondary, fontSize: FontSize.sm, lineHeight: 20 },

  playerChip: { width: 76, alignItems: 'center', gap: 6, padding: 8, borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: '#2a2a2a', backgroundColor: Colors.surface },
  playerChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '18' },
  playerChipAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surfaceLight, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  playerChipImg: { width: 44, height: 44, borderRadius: 22 },
  playerChipName: { color: Colors.textSecondary, fontSize: 11, fontWeight: '600' },
  gkTag: { color: Colors.gold, fontSize: 10, fontWeight: '800' },
  selTag: { color: Colors.primary, fontSize: 10, fontWeight: '800' },

  primaryBtn: { backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: '#fff', fontSize: FontSize.md, fontWeight: '800' },
  secondaryBtn: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: Colors.secondary, paddingVertical: 14, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' },
  secondaryBtnText: { color: Colors.secondary, fontSize: FontSize.md, fontWeight: '800' },
  btnDisabled: { opacity: 0.4 },

  inviteRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.surface, borderRadius: BorderRadius.md, padding: 12, borderWidth: 1, borderColor: '#242424' },
  inviteText: { color: Colors.text, fontSize: FontSize.sm, flex: 1 },
  smallBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: BorderRadius.full },
  smallBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  waitingBox: { alignItems: 'center', gap: 14, paddingVertical: 40 },
  waitingText: { color: Colors.textSecondary, fontSize: FontSize.md, fontWeight: '700' },
  linkText: { color: Colors.secondary, fontSize: FontSize.sm, fontWeight: '700', textAlign: 'center' },

  scoreRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 20, paddingVertical: 4 },
  scoreCol: { alignItems: 'center', minWidth: 100, gap: 2 },
  scoreName: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
  scoreValue: { color: Colors.text, fontSize: 34, fontWeight: '900' },
  scoreDash: { color: Colors.textMuted, fontSize: 22, fontWeight: '700', marginTop: 18 },
  marksRow: { flexDirection: 'row', gap: 3, height: 14, alignItems: 'center' },
  mark: { width: 8, height: 8, borderRadius: 4 },

  roundLabel: { color: Colors.gold, fontSize: 12, fontWeight: '800', textAlign: 'center', letterSpacing: 0.5, marginBottom: 8 },

  dueRow: { flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.md, marginBottom: 10 },
  roleCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.surface, borderRadius: BorderRadius.md, padding: 8, borderWidth: 1.5, borderColor: '#242424' },
  roleCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '14' },
  roleAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.surfaceLight, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  roleAvatarImg: { width: 34, height: 34, borderRadius: 17 },
  roleLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  roleName: { color: Colors.text, fontSize: 12, fontWeight: '700' },

  stage: { width: GOAL_W, height: STAGE_H, alignSelf: 'center' },
  goalArea: { position: 'absolute', left: 0, top: 0, width: GOAL_W, height: GOAL_H, backgroundColor: '#0b1c10', borderRadius: 4, overflow: 'hidden' },
  netLine: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.13)' },
  post: { position: 'absolute', backgroundColor: '#f2f2f2', borderRadius: 3 },

  cell: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  cellCoverage: { backgroundColor: Colors.gold + '22', borderColor: Colors.gold + '55' },
  cellPickedShot: { backgroundColor: Colors.primary + '55', borderColor: Colors.primary, borderWidth: 2 },
  cellPickedDive: { backgroundColor: Colors.gold + '55', borderColor: Colors.gold, borderWidth: 2 },
  cellRevealDive: { backgroundColor: Colors.gold + '33', borderColor: Colors.gold + '88' },
  cellRevealShot: { borderColor: '#fff', borderWidth: 3 },
  cellMark: { fontSize: 20 },

  pitch: { position: 'absolute', left: 0, top: GOAL_H, width: GOAL_W, height: PITCH_H, backgroundColor: '#12461f', borderBottomLeftRadius: 10, borderBottomRightRadius: 10 },
  penaltySpot: { position: 'absolute', left: GOAL_W / 2 - 4, top: 88, width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.6)' },

  keeper: { position: 'absolute', left: -KEEPER_R, top: -KEEPER_R, width: KEEPER_R * 2, height: KEEPER_R * 2, alignItems: 'center', justifyContent: 'center' },
  keeperInner: { width: KEEPER_R * 2, height: KEEPER_R * 2, borderRadius: KEEPER_R, backgroundColor: Colors.surfaceLight, borderWidth: 3, borderColor: Colors.gold, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  keeperImg: { width: KEEPER_R * 2 - 6, height: KEEPER_R * 2 - 6, borderRadius: KEEPER_R },

  ball: { position: 'absolute', left: -BALL_R, top: -BALL_R, width: BALL_R * 2, height: BALL_R * 2, borderRadius: BALL_R, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#ccc' },

  flashOverlay: { position: 'absolute', left: 0, top: 0, width: GOAL_W, height: STAGE_H, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)', gap: 6 },
  flashText: { color: '#fff', fontSize: 30, fontWeight: '900' },
  flashSub: { color: Colors.textSecondary, fontSize: 13, fontWeight: '700', paddingHorizontal: 20, textAlign: 'center' },

  prompt: { color: Colors.textSecondary, fontSize: FontSize.md, fontWeight: '800', textAlign: 'center', marginTop: 14 },

  resultWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: Spacing.lg },
  resultTitle: { color: Colors.text, fontSize: 28, fontWeight: '900' },
  resultScore: { color: Colors.textSecondary, fontSize: 20, fontWeight: '700', marginBottom: 8 },
  coinsBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.gold + '18', borderWidth: 1, borderColor: Colors.gold + '40', paddingHorizontal: 16, paddingVertical: 8, borderRadius: BorderRadius.full, marginBottom: 20 },
  coinsBadgeText: { color: Colors.gold, fontWeight: '800', fontSize: FontSize.sm },
});
