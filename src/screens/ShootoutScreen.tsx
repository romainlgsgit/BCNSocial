import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Image,
  Animated, PanResponder, StatusBar, ActivityIndicator,
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
import { GameInvite, GameSession, GamePawn, Player } from '../types';
import {
  FIELD_WIDTH, FIELD_HEIGHT, BALL_RADIUS, PAWN_RADIUS, GK_RADIUS, GOAL_WIDTH, WIN_SCORE,
  MAX_SHOT_SPEED, MIN_SHOT_SPEED, SHOT_POWER,
  Disc, Team, makeBall, pawnDisc, stepWorld, worldAtRest, ballTouchesTeam,
  buildPawns, kickoffState, formationById,
  OFFENSIVE_FORMATIONS, DEFENSIVE_FORMATIONS,
} from '../utils/tableFootball';

const WINNER_COINS = 100;
const LOSER_COINS = 30;

type Phase = 'lobby' | 'invitePicker' | 'queueWaiting' | 'inviteWaiting' | 'playing';

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

// Miroir 180° : chaque joueur voit toujours SON but en bas de son écran.
function toScreen(p: { x: number; y: number }, mirrored: boolean) {
  return mirrored ? { x: FIELD_WIDTH - p.x, y: FIELD_HEIGHT - p.y } : { x: p.x, y: p.y };
}

function playerPhotoSource(player?: Player | null) {
  if (!player) return null;
  if (player.photoBase64) return { uri: `data:image/jpeg;base64,${player.photoBase64}` };
  if (player.photoUrl) return { uri: player.photoUrl };
  return null;
}

function docToDiscs(g: GameSession): Disc[] {
  const discs: Disc[] = [];
  for (const p of (g.player1Pawns ?? [])) discs.push(pawnDisc({ ...p, team: 'player1' }));
  for (const p of (g.player2Pawns ?? [])) discs.push(pawnDisc({ ...p, team: 'player2' }));
  discs.push(makeBall(g.ballX ?? FIELD_WIDTH / 2, g.ballY ?? FIELD_HEIGHT / 2));
  return discs;
}

function pawnsToGamePawns(discs: Disc[], team: Team): GamePawn[] {
  return discs
    .filter(d => d.kind === 'pawn' && d.team === team)
    .map(d => ({
      id: d.id!, x: Math.round(d.x * 10) / 10, y: Math.round(d.y * 10) / 10,
      isGK: !!d.isGK, name: d.name ?? '',
    }));
}

function discKey(d: Disc) { return d.kind === 'ball' ? 'ball' : `${d.team}:${d.id}`; }

// ─── Écran principal ───────────────────────────────────────────────────────────

export default function ShootoutScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { players: allPlayers } = usePlayers();
  const {
    pendingInvites: allInvites, mutualFollowerIds, activeGameId,
    joinQueue, leaveQueue, sendInvite, cancelInvite, acceptInvite, declineInvite, dismissGame,
    setGameScreenActive,
  } = useGame();

  // Les invitations sont app-wide et partagées avec les Tirs au but → on ne garde que
  // les défis de CE jeu.
  const pendingInvites = useMemo(
    () => allInvites.filter(i => inviteMode(i) === 'football'),
    [allInvites],
  );

  // Connexion RTDB ouverte uniquement tant qu'on est sur l'écran de jeu (fermée en
  // quittant) → la limite de 100 connexions RTDB ne concerne que les joueurs.
  useFocusEffect(
    useCallback(() => {
      setGameScreenActive(true, 'football');
      return () => setGameScreenActive(false);
    }, [setGameScreenActive]),
  );

  const [phase, setPhase] = useState<Phase>('lobby');
  const [invitedTo, setInvitedTo] = useState<{ id: string; username: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewingGameId, setViewingGameId] = useState<string | null>(null);
  const [game, setGame] = useState<(GameSession & { id: string }) | null>(null);

  useEffect(() => {
    if (activeGameId && !viewingGameId) {
      setViewingGameId(activeGameId);
      setPhase('playing');
    }
  }, [activeGameId, viewingGameId]);

  useEffect(() => {
    if (!viewingGameId) { setGame(null); return; }
    return onValue(ref(rtdb, `games/${viewingGameId}`), snap => {
      const v = snap.val();
      if (v) setGame({ ...(v as GameSession), id: viewingGameId });
    });
  }, [viewingGameId]);

  // Coup d'envoi : dès que les DEUX joueurs sont prêts, player1 (hôte) tire au sort
  // qui commence et place les pions (attaquant = formation offensive, défenseur =
  // défensive). Un seul écrit pour éviter les doublons.
  const kickoffDoneRef = useRef(false);
  useEffect(() => {
    if (!game || !user) return;
    const me: Team = game.player1Id === user.id ? 'player1' : 'player2';
    if (game.phase !== 'setup' || me !== 'player1') return;
    if (!game.player1Ready || !game.player2Ready || kickoffDoneRef.current) return;
    kickoffDoneRef.current = true;
    const attacker: Team = Math.random() < 0.5 ? 'player1' : 'player2';
    const ko = kickoffState(game, attacker);
    rtUpdate(ref(rtdb, `games/${game.id}`), {
      phase: 'playing', attackingTeam: attacker, turn: attacker, shotsLeft: 3,
      kickoffPending: true,
      player1Pawns: ko.player1Pawns, player2Pawns: ko.player2Pawns,
      ballX: ko.ballX, ballY: ko.ballY, settledSeq: 0, lastShot: null,
    }).catch(() => {});
  }, [game?.phase, game?.player1Ready, game?.player2Ready, user?.id]);

  // Paiement des pièces (une seule fois). Verrou côté RTDB (transaction sur payoutDone),
  // puis crédit des pièces côté Firestore (les users vivent là). Sur les 2 clients à la
  // fois → seul celui qui remporte la transaction crédite.
  useEffect(() => {
    if (!game || game.status !== 'finished' || game.payoutDone || !game.winnerId) return;
    const gid = game.id;
    const winnerId = game.winnerId;
    const loserId = winnerId === game.player1Id ? game.player2Id : game.player1Id;
    (async () => {
      const res = await rtRunTransaction(ref(rtdb, `games/${gid}/payoutDone`), cur => (cur ? undefined : true));
      if (!res.committed) return; // déjà payé par l'autre client
      updateDoc(doc(db, 'users', winnerId), { coins: increment(WINNER_COINS) }).catch(() => {});
      updateDoc(doc(db, 'users', loserId), { coins: increment(LOSER_COINS) }).catch(() => {});
    })();
  }, [game?.status, game?.payoutDone, game?.id]);

  const handleJoinQueue = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    try { await joinQueue(user.username, 'football'); setPhase('queueWaiting'); }
    finally { setBusy(false); }
  }, [user, joinQueue]);

  const handleInvite = useCallback(async (toId: string, toUsername: string) => {
    if (!user) return;
    setBusy(true);
    try {
      await sendInvite(toId, toUsername, user.username, 'football');
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
    leaveQueue('football');
    if (invitedTo) cancelInvite(invitedTo.id, 'football');
    if (viewingGameId) dismissGame(viewingGameId, 'football');
    setPhase('lobby');
    setInvitedTo(null);
    setViewingGameId(null);
    kickoffDoneRef.current = false;
  };

  const leaveMatch = useCallback(() => {
    const g = game;
    if (viewingGameId) dismissGame(viewingGameId, 'football');
    setViewingGameId(null);
    setPhase('lobby');
    kickoffDoneRef.current = false;
    if (g && user && g.status === 'active') {
      const opponentId = g.player1Id === user.id ? g.player2Id : g.player1Id;
      // Abandon = défaite : l'adversaire gagne. Transaction RTDB (n'écrase pas une fin déjà écrite).
      rtRunTransaction(ref(rtdb, `games/${g.id}`), (cur) => {
        if (!cur || cur.status !== 'active') return; // abort
        cur.status = 'finished';
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
    const me: Team = game.player1Id === user.id ? 'player1' : 'player2';

    // Ancien format de partie (air-hockey, sans `phase`) → on ne peut pas la jouer :
    // écran de secours pour en sortir proprement (et ne plus y être renvoyé).
    const validPhase = game.phase === 'setup' || game.phase === 'playing' || game.phase === 'finished';
    if (!validPhase) {
      return (
        <View style={styles.root}>
          <StatusBar barStyle="light-content" />
          {header('Football 1v1', backToLobby)}
          <View style={styles.resultWrap}>
            <Text style={{ fontSize: 52 }}>🕹️</Text>
            <Text style={styles.resultTitle}>Partie expirée</Text>
            <Text style={styles.hint}>Cette partie date d'une ancienne version. Reviens au menu pour en lancer une nouvelle.</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={backToLobby} activeOpacity={0.85}>
              <Text style={styles.primaryBtnText}>Retour au menu</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

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
          <SetupPhase game={game} me={me} allPlayers={allPlayers} />
        </View>
      );
    }

    // phase playing
    const myScore = me === 'player1' ? game.player1Score : game.player2Score;
    const oppScore = me === 'player1' ? game.player2Score : game.player1Score;
    const oppName = me === 'player1' ? game.player2Username : game.player1Username;
    return (
      <View style={styles.root}>
        <StatusBar barStyle="light-content" />
        {header('Football 1v1', leaveMatch)}
        <Text style={[styles.versionBadge, { top: insets.top + 14 }]}>v2.3</Text>
        <View style={styles.scoreRow}>
          <View style={styles.scoreCol}><Text style={styles.scoreName}>Toi</Text><Text style={styles.scoreValue}>{myScore}</Text></View>
          <Text style={styles.scoreDash}>—</Text>
          <View style={styles.scoreCol}><Text style={styles.scoreName} numberOfLines={1}>{oppName}</Text><Text style={styles.scoreValue}>{oppScore}</Text></View>
        </View>
        <TableFootballGame game={game} me={me} allPlayers={allPlayers} />
      </View>
    );
  }

  // ── Lobby ──
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      {header('Football 1v1')}
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
          <Text style={styles.introTitle}>⚽ Football sur plateau</Text>
          <Text style={styles.introText}>
            Compose ton équipe (4 joueurs dont 1 gardien), choisis tes formations, puis glisse
            tes pions pour frapper la balle. Tour par tour, premier à {WIN_SCORE} buts gagne !
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

// ─── Setup : composer l'équipe + formations ─────────────────────────────────────

function SetupPhase({ game, me, allPlayers }: { game: GameSession & { id: string }; me: Team; allPlayers: Player[] }) {
  const iAmReady = me === 'player1' ? game.player1Ready : game.player2Ready;
  const oppReady = me === 'player1' ? game.player2Ready : game.player1Ready;

  const [selected, setSelected] = useState<Player[]>([]);
  const [gkId, setGkId] = useState<string | null>(null);
  const [offId, setOffId] = useState(OFFENSIVE_FORMATIONS[0].id);
  const [defId, setDefId] = useState(DEFENSIVE_FORMATIONS[0].id);
  const [busy, setBusy] = useState(false);

  const toggle = (p: Player) => {
    setSelected(prev => {
      const exists = prev.find(x => x.id === p.id);
      if (exists) {
        if (gkId === p.id) setGkId(null);
        return prev.filter(x => x.id !== p.id);
      }
      if (prev.length >= 4) return prev;
      return [...prev, p];
    });
  };

  const ready = selected.length === 4 && gkId && offId && defId;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      const names = selected.map(p => p.name);
      const gkIndex = selected.findIndex(p => p.id === gkId);
      const pawns = buildPawns(names, gkIndex, formationById(defId)!, me); // positions provisoires
      await rtUpdate(ref(rtdb, `games/${game.id}`), {
        [`${me}Pawns`]: pawns,
        [`${me}OffFormation`]: offId,
        [`${me}DefFormation`]: defId,
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
        <Text style={styles.sectionLabel}>1. Choisis 4 joueurs ({selected.length}/4)</Text>
        <Text style={styles.hint}>Puis touche un joueur sélectionné pour le désigner GARDIEN 🧤</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
          {allPlayers.map(p => {
            const idx = selected.findIndex(x => x.id === p.id);
            const active = idx >= 0;
            const isGk = gkId === p.id;
            const src = playerPhotoSource(p);
            return (
              <TouchableOpacity
                key={p.id}
                activeOpacity={0.8}
                onPress={() => (active ? setGkId(p.id) : toggle(p))}
                onLongPress={() => toggle(p)}
                style={[styles.playerChip, active && styles.playerChipActive, isGk && { borderColor: Colors.gold }]}
              >
                <View style={styles.playerChipAvatar}>
                  {src ? <Image source={src} style={styles.playerChipImg} /> : <Text style={{ fontSize: 22 }}>{p.photo}</Text>}
                </View>
                <Text style={[styles.playerChipName, active && { color: Colors.text }]} numberOfLines={1}>{p.name}</Text>
                {isGk && <Text style={styles.gkTag}>🧤 GK</Text>}
                {active && !isGk && <Text style={styles.selTag}>{idx + 1}</Text>}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        {selected.length === 4 && !gkId && <Text style={[styles.hint, { color: Colors.gold }]}>Touche un joueur pour choisir ton gardien.</Text>}
      </View>

      <FormationRow label="2. Formation offensive" formations={OFFENSIVE_FORMATIONS} value={offId} onChange={setOffId} />
      <FormationRow label="3. Formation défensive" formations={DEFENSIVE_FORMATIONS} value={defId} onChange={setDefId} />

      <TouchableOpacity style={[styles.primaryBtn, !ready && styles.btnDisabled]} disabled={!ready || busy} onPress={submit} activeOpacity={0.85}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Prêt ✅</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

function FormationRow({ label, formations, value, onChange }: {
  label: string; formations: typeof OFFENSIVE_FORMATIONS; value: string; onChange: (id: string) => void;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {formations.map(f => {
          const active = value === f.id;
          return (
            <TouchableOpacity key={f.id} onPress={() => onChange(f.id)} activeOpacity={0.85}
              style={[styles.formationChip, active && styles.formationChipActive]}>
              <FormationMini formation={f} />
              <Text style={[styles.formationName, active && { color: Colors.text }]}>{f.name}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// Mini aperçu d'une formation (demi-terrain schématique)
function FormationMini({ formation }: { formation: typeof OFFENSIVE_FORMATIONS[number] }) {
  const W = 70, H = 60;
  return (
    <View style={{ width: W, height: H, borderRadius: 6, backgroundColor: '#0f2a12', overflow: 'hidden' }}>
      {formation.outfield.map((p, i) => (
        <View key={i} style={{
          position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary,
          left: p.fx * W - 4, top: (p.fy - 0.5) * 2 * H - 4,
        }} />
      ))}
      <View style={{ position: 'absolute', bottom: 2, left: W / 2 - 5, width: 10, height: 6, borderRadius: 3, backgroundColor: Colors.gold }} />
    </View>
  );
}

// ─── Le plateau de jeu (tour par tour) ──────────────────────────────────────────

function TableFootballGame({ game, me, allPlayers }: {
  game: GameSession & { id: string }; me: Team; allPlayers: Player[];
}) {
  const mirrored = me === 'player2';
  const opp: Team = me === 'player1' ? 'player2' : 'player1';
  const gameRef = useRef(game);
  useEffect(() => { gameRef.current = game; }, [game]);

  const nameToPlayer = useMemo(() => {
    const m: Record<string, Player> = {};
    for (const p of allPlayers) m[p.name] = p;
    return m;
  }, [allPlayers]);

  const worldRef = useRef<Disc[]>(docToDiscs(game));
  const animsRef = useRef<Map<string, Animated.ValueXY>>(new Map());
  const animatingRef = useRef(false);
  const rafRef = useRef<number>(0);
  const lastSeqRef = useRef<number>(game.settledSeq);
  const pendingSeqRef = useRef<number>(game.settledSeq);
  const prevScoreRef = useRef({ p1: game.player1Score, p2: game.player2Score });
  const selectedRef = useRef<Disc | null>(null);
  const dragStartScreenRef = useRef({ x: 0, y: 0 });

  const [goalFlash, setGoalFlash] = useState<'me' | 'opponent' | null>(null);
  const [aim, setAim] = useState<{ x: number; y: number; angle: number; len: number } | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [, forceTick] = useState(0); // pour rafraîchir l'indicateur "à toi/à l'adversaire"

  const getAnim = useCallback((key: string, pt: { x: number; y: number }) => {
    let a = animsRef.current.get(key);
    if (!a) { a = new Animated.ValueXY(pt); animsRef.current.set(key, a); }
    return a;
  }, []);

  const paintDiscs = useCallback(() => {
    for (const d of worldRef.current) {
      getAnim(discKey(d), toScreen(d, mirrored)).setValue(toScreen(d, mirrored));
    }
  }, [getAnim, mirrored]);

  const snapFromGame = useCallback(() => {
    worldRef.current = docToDiscs(gameRef.current);
    paintDiscs();
  }, [paintDiscs]);

  // Init au montage
  useEffect(() => {
    snapFromGame();
    lastSeqRef.current = game.settledSeq;
    pendingSeqRef.current = game.settledSeq;
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shotCtxRef = useRef<{ team: Team; pawnId: string; vx: number; vy: number } | null>(null);
  const preShotRef = useRef<Disc[] | null>(null);
  const replayGuardRef = useRef(false);

  // Boucle de simulation animée (collage balle→pion ami via stickTeam). `speed` < 1 =
  // ralenti (replay). onDone(goal) est appelé à l'arrêt du monde ou au but.
  const animateSim = useCallback((opts: {
    speed?: number; stickTeam?: Team; stickExcludeId?: string;
    onDone: (goal: Team | null) => void;
  }) => {
    animatingRef.current = true;
    forceTick(t => t + 1);
    const speed = opts.speed ?? 1;
    let last = Date.now(); let elapsed = 0; let goal: Team | null = null;
    const loop = () => {
      const now = Date.now();
      const dt = Math.min((now - last) / 1000, 0.032) * speed;
      last = now;
      const g = stepWorld(worldRef.current, dt, { stickTeam: opts.stickTeam, stickExcludeId: opts.stickExcludeId });
      if (g && !goal) goal = g;
      for (const d of worldRef.current) getAnim(discKey(d), toScreen(d, mirrored)).setValue(toScreen(d, mirrored));
      elapsed += dt;
      if (goal || worldAtRest(worldRef.current) || elapsed > 7) {
        animatingRef.current = false;
        forceTick(t => t + 1);
        opts.onDone(goal);
        return;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [getAnim, mirrored]);

  // Rejoue au ralenti l'action qui vient de se produire (depuis l'instantané pré-tir).
  const playReplay = useCallback(() => {
    const pre = preShotRef.current, ctx = shotCtxRef.current;
    if (!pre || !ctx) { replayGuardRef.current = false; snapFromGame(); return; }
    worldRef.current = pre.map(d => ({ ...d }));
    const shooter = worldRef.current.find(d => d.kind === 'pawn' && d.team === ctx.team && d.id === ctx.pawnId);
    if (shooter) { shooter.vx = ctx.vx; shooter.vy = ctx.vy; }
    paintDiscs();
    setReplaying(true);
    animateSim({
      speed: 0.5, stickTeam: ctx.team, stickExcludeId: ctx.pawnId,
      onDone: () => { setReplaying(false); replayGuardRef.current = false; snapFromGame(); },
    });
  }, [animateSim, snapFromGame, paintDiscs]);

  // Calcule l'issue du tir (autorité du tireur) et écrit l'état résolu (1 écriture).
  // Renvoie { counted } (but validé) et { replay } (rejouer l'action au ralenti).
  const resolveAndWrite = useCallback((goal: Team | null): { counted: boolean; replay: boolean } => {
    const g = gameRef.current;
    const ball = worldRef.current.find(d => d.kind === 'ball')!;
    const seq = g.settledSeq + 1;
    const ctx = shotCtxRef.current;
    const lastShot = ctx ? { by: ctx.team, pawnId: ctx.pawnId, vx: ctx.vx, vy: ctx.vy, seq } : null;
    const p1 = pawnsToGamePawns(worldRef.current, 'player1');
    const p2 = pawnsToGamePawns(worldRef.current, 'player2');
    const base: Record<string, unknown> = { lastShot, settledSeq: seq, kickoffPending: false };
    pendingSeqRef.current = seq;
    lastSeqRef.current = seq;

    // Règle d'engagement : on ne peut PAS marquer sur le 1er tir → balle à l'adversaire.
    if (goal && g.kickoffPending) {
      const nextTurn: Team = me === 'player1' ? 'player2' : 'player1';
      rtUpdate(ref(rtdb, `games/${g.id}`), {
        ...base, turn: nextTurn, shotsLeft: nextTurn === g.attackingTeam ? 3 : 2,
        player1Pawns: p1, player2Pawns: p2, ballX: FIELD_WIDTH / 2, ballY: FIELD_HEIGHT / 2,
      }).catch(() => {});
      setTimeout(() => snapFromGame(), 900);
      return { counted: false, replay: false };
    }

    if (goal) {
      const newP1 = g.player1Score + (goal === 'player1' ? 1 : 0);
      const newP2 = g.player2Score + (goal === 'player2' ? 1 : 0);
      const finished = newP1 >= WIN_SCORE || newP2 >= WIN_SCORE;
      if (finished) {
        rtUpdate(ref(rtdb, `games/${g.id}`), {
          ...base, player1Score: newP1, player2Score: newP2, phase: 'finished', status: 'finished',
          winnerId: goal === 'player1' ? g.player1Id : g.player2Id,
          player1Pawns: p1, player2Pawns: p2, ballX: ball.x, ballY: ball.y,
        }).catch(() => {});
        return { counted: true, replay: false };
      }
      const conceder: Team = goal === 'player1' ? 'player2' : 'player1'; // encaisse → engage
      const ko = kickoffState(g, conceder);
      rtUpdate(ref(rtdb, `games/${g.id}`), {
        ...base, player1Score: newP1, player2Score: newP2, attackingTeam: conceder,
        turn: conceder, shotsLeft: 3, phase: 'playing', kickoffPending: true,
        player1Pawns: ko.player1Pawns, player2Pawns: ko.player2Pawns, ballX: ko.ballX, ballY: ko.ballY,
      }).catch(() => {});
      return { counted: true, replay: true };
    }

    // Pas de but : on rejoue si la balle finit sur un de NOS pions (règle des passes).
    const left = g.shotsLeft - 1;
    const keep = left > 0 && ballTouchesTeam(ball, worldRef.current.filter(d => d.kind === 'pawn'), me);
    if (keep) {
      rtUpdate(ref(rtdb, `games/${g.id}`), {
        ...base, turn: me, shotsLeft: left, player1Pawns: p1, player2Pawns: p2, ballX: ball.x, ballY: ball.y,
      }).catch(() => {});
    } else {
      const nextTurn: Team = me === 'player1' ? 'player2' : 'player1';
      rtUpdate(ref(rtdb, `games/${g.id}`), {
        ...base, turn: nextTurn, shotsLeft: nextTurn === g.attackingTeam ? 3 : 2,
        player1Pawns: p1, player2Pawns: p2, ballX: ball.x, ballY: ball.y,
      }).catch(() => {});
    }
    return { counted: false, replay: false };
  }, [me, snapFromGame]);

  const flashGoal = useCallback((scorer: Team) => {
    setGoalFlash(scorer === me ? 'me' : 'opponent');
    setTimeout(() => setGoalFlash(null), 1100);
  }, [me]);

  // Fin de MON tir : flash si but validé, écriture, puis replay au ralenti si but.
  const onMyShotDone = useCallback((goal: Team | null) => {
    const res = resolveAndWrite(goal);
    if (goal && res.counted) flashGoal(goal);
    if (res.replay) { replayGuardRef.current = true; setTimeout(playReplay, 1150); }
  }, [resolveAndWrite, flashGoal, playReplay]);

  // Réagit aux mises à jour du doc : rejeu du tir adverse + flash + recalage.
  useEffect(() => {
    const prev = prevScoreRef.current;
    const scoreIncreased = game.player1Score > prev.p1 || game.player2Score > prev.p2;
    prevScoreRef.current = { p1: game.player1Score, p2: game.player2Score };

    if (game.settledSeq > lastSeqRef.current) {
      lastSeqRef.current = game.settledSeq;
      const s = game.lastShot;
      if (s && s.by === opp && !animatingRef.current && !replayGuardRef.current) {
        const disc = worldRef.current.find(d => d.kind === 'pawn' && d.team === s.by && d.id === s.pawnId);
        if (disc) {
          preShotRef.current = worldRef.current.map(d => ({ ...d }));
          shotCtxRef.current = { team: s.by, pawnId: s.pawnId, vx: s.vx, vy: s.vy };
          disc.vx = s.vx; disc.vy = s.vy;
          const counted = scoreIncreased;
          animateSim({
            stickTeam: s.by, stickExcludeId: s.pawnId,
            onDone: (goal) => {
              if (goal && counted) flashGoal(goal);
              if (goal && counted && gameRef.current.phase === 'playing') {
                replayGuardRef.current = true; setTimeout(playReplay, 1150);
              } else { snapFromGame(); }
            },
          });
        } else { snapFromGame(); }
      } else if (!animatingRef.current && !replayGuardRef.current) {
        snapFromGame();
      }
    }
    forceTick(t => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);

  // Peut-on tirer ? Mon tour, phase jouée, rien en cours (ni replay), tirs restants, à jour.
  const canShoot = () =>
    gameRef.current.phase === 'playing' &&
    gameRef.current.turn === me &&
    !animatingRef.current && !replayGuardRef.current &&
    gameRef.current.shotsLeft > 0 &&
    gameRef.current.settledSeq >= pendingSeqRef.current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => canShoot(),
      onMoveShouldSetPanResponder: () => canShoot(),
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const canon = mirrored ? { x: FIELD_WIDTH - locationX, y: FIELD_HEIGHT - locationY } : { x: locationX, y: locationY };
        let best: Disc | null = null; let bestD = Infinity;
        for (const d of worldRef.current) {
          if (d.kind !== 'pawn' || d.team !== me) continue;
          const dist = Math.hypot(d.x - canon.x, d.y - canon.y);
          if (dist < bestD) { bestD = dist; best = d; }
        }
        if (best && bestD < best.r + 40) {
          selectedRef.current = best;
          dragStartScreenRef.current = { x: locationX, y: locationY };
        } else {
          selectedRef.current = null;
        }
      },
      onPanResponderMove: (_evt, gesture) => {
        const sel = selectedRef.current;
        if (!sel) return;
        const spScreen = toScreen(sel, mirrored);
        const len = Math.min(Math.hypot(gesture.dx, gesture.dy), 100);
        const angle = Math.atan2(-gesture.dy, -gesture.dx); // direction = opposée au glissement
        setAim({ x: spScreen.x, y: spScreen.y, angle, len });
      },
      onPanResponderRelease: (_evt, gesture) => {
        const sel = selectedRef.current;
        setAim(null);
        selectedRef.current = null;
        if (!sel || !canShoot()) return;
        let vx = -gesture.dx * SHOT_POWER;
        let vy = -gesture.dy * SHOT_POWER;
        if (mirrored) { vx = -vx; vy = -vy; }
        const sp = Math.hypot(vx, vy);
        if (sp < MIN_SHOT_SPEED) return; // tir trop faible → annulé
        if (sp > MAX_SHOT_SPEED) { const k = MAX_SHOT_SPEED / sp; vx *= k; vy *= k; }
        preShotRef.current = worldRef.current.map(d => ({ ...d }));
        shotCtxRef.current = { team: me, pawnId: sel.id!, vx, vy };
        sel.vx = vx; sel.vy = vy;
        animateSim({ stickTeam: me, stickExcludeId: sel.id!, onDone: onMyShotDone });
      },
    }),
  ).current;

  // Liste stable des disques à rendre (roster fixe pendant la partie)
  const renderList = useMemo(() => {
    const list: { key: string; kind: 'ball' | 'pawn'; team?: Team; name?: string; isGK?: boolean; x: number; y: number }[] = [];
    for (const p of (game.player1Pawns ?? [])) list.push({ key: `player1:${p.id}`, kind: 'pawn', team: 'player1', name: p.name, isGK: p.isGK, x: p.x, y: p.y });
    for (const p of (game.player2Pawns ?? [])) list.push({ key: `player2:${p.id}`, kind: 'pawn', team: 'player2', name: p.name, isGK: p.isGK, x: p.x, y: p.y });
    list.push({ key: 'ball', kind: 'ball', x: game.ballX, y: game.ballY });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(game.player1Pawns ?? []).length, (game.player2Pawns ?? []).length]);

  const myTurn = game.phase === 'playing' && game.turn === me && !animatingRef.current;
  const turnLabel = animatingRef.current ? '…' : (game.turn === me ? '🎯 À toi de jouer' : `⏳ Au tour de l'adversaire`);

  return (
    <View style={styles.fieldStage}>
      <View style={styles.turnBar}>
        <Text style={[styles.turnText, myTurn && { color: Colors.primary }]}>{turnLabel}</Text>
        {game.phase === 'playing' && (
          <View style={styles.shotsDots}>
            {Array.from({ length: game.shotsLeft }).map((_, i) => (
              <View key={i} style={[styles.shotDot, { backgroundColor: game.turn === me ? Colors.primary : Colors.textMuted }]} />
            ))}
          </View>
        )}
      </View>

      <View style={styles.field} {...panResponder.panHandlers}>
        <View style={styles.centerLine} pointerEvents="none" />
        <View style={styles.centerCircle} pointerEvents="none" />
        <View style={[styles.goalMouth, { top: -3, left: (FIELD_WIDTH - GOAL_WIDTH) / 2, width: GOAL_WIDTH }]} pointerEvents="none" />
        <View style={[styles.goalMouth, { bottom: -3, left: (FIELD_WIDTH - GOAL_WIDTH) / 2, width: GOAL_WIDTH }]} pointerEvents="none" />

        {renderList.map(item => {
          if (item.kind === 'ball') {
            const a = getAnim('ball', toScreen({ x: item.x, y: item.y }, mirrored));
            return (
              <Animated.View key="ball" style={[styles.ball, { transform: a.getTranslateTransform() }]} pointerEvents="none">
                <Text style={{ fontSize: 14 }}>⚽</Text>
              </Animated.View>
            );
          }
          const isMine = item.team === me;
          const r = item.isGK ? GK_RADIUS : PAWN_RADIUS;
          const a = getAnim(item.key, toScreen({ x: item.x, y: item.y }, mirrored));
          const src = playerPhotoSource(item.name ? nameToPlayer[item.name] : null);
          return (
            <Animated.View
              key={item.key}
              pointerEvents="none"
              style={[
                styles.pawn,
                { width: r * 2, height: r * 2, borderRadius: r, marginLeft: -r, marginTop: -r,
                  borderColor: isMine ? Colors.primary : Colors.secondary,
                  borderWidth: item.isGK ? 4 : 3 },
                { transform: a.getTranslateTransform() },
              ]}
            >
              {src ? <Image source={src} style={{ width: r * 2 - 6, height: r * 2 - 6, borderRadius: r }} />
                   : <Text style={{ fontSize: item.isGK ? 20 : 16 }}>{item.isGK ? '🧤' : '⚽'}</Text>}
            </Animated.View>
          );
        })}

        {aim && (
          <View pointerEvents="none" style={{
            position: 'absolute', left: aim.x, top: aim.y - 4, width: Math.max(aim.len, 14), height: 8,
            transformOrigin: '0% 50%', transform: [{ rotate: `${aim.angle}rad` }],
          }}>
            <View style={{ position: 'absolute', left: 0, right: 10, top: 2.5, height: 3, backgroundColor: Colors.gold, borderRadius: 2 }} />
            <View style={{
              position: 'absolute', right: 0, top: 0, width: 0, height: 0,
              borderTopWidth: 4, borderBottomWidth: 4, borderLeftWidth: 11,
              borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: Colors.gold,
            }} />
          </View>
        )}

        {goalFlash && (
          <View style={styles.goalFlashOverlay} pointerEvents="none">
            <Text style={styles.goalFlashText}>{goalFlash === 'me' ? '⚽ BUT !' : '😬 Encaissé'}</Text>
          </View>
        )}

        {replaying && (
          <View style={styles.replayBanner} pointerEvents="none">
            <Text style={styles.replayText}>🎬 Replay</Text>
          </View>
        )}
      </View>

      <Text style={styles.shotHint}>
        {myTurn ? 'Sélectionne un pion, tire vers l\'arrière et relâche pour le catapulter 🎯'
                : 'Regarde le coup de l\'adversaire…'}
      </Text>
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
  versionBadge: { position: 'absolute', right: 12, zIndex: 10, color: Colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },

  sectionLabel: { color: Colors.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  hint: { color: Colors.textMuted, fontSize: 12, textAlign: 'center' },

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

  formationChip: { flex: 1, alignItems: 'center', gap: 6, padding: 8, borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: '#2a2a2a', backgroundColor: Colors.surface },
  formationChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '18' },
  formationName: { color: Colors.textSecondary, fontSize: 11, fontWeight: '700' },

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

  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, paddingVertical: 6 },
  scoreCol: { alignItems: 'center', minWidth: 90 },
  scoreName: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
  scoreValue: { color: Colors.text, fontSize: 36, fontWeight: '900' },
  scoreDash: { color: Colors.textMuted, fontSize: 22, fontWeight: '700' },

  fieldStage: { flex: 1, alignItems: 'center', gap: 8 },
  turnBar: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 24 },
  turnText: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '800' },
  shotsDots: { flexDirection: 'row', gap: 4 },
  shotDot: { width: 8, height: 8, borderRadius: 4 },

  field: { width: FIELD_WIDTH, height: FIELD_HEIGHT, borderRadius: 12, borderWidth: 4, borderColor: '#eee', backgroundColor: '#0f2a12', overflow: 'hidden' },
  centerLine: { position: 'absolute', left: 0, right: 0, top: FIELD_HEIGHT / 2 - 1, height: 2, backgroundColor: 'rgba(255,255,255,0.18)' },
  centerCircle: { position: 'absolute', left: FIELD_WIDTH / 2 - 34, top: FIELD_HEIGHT / 2 - 34, width: 68, height: 68, borderRadius: 34, borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)' },
  goalMouth: { position: 'absolute', height: 5, backgroundColor: Colors.gold },
  ball: { position: 'absolute', left: -BALL_RADIUS, top: -BALL_RADIUS, width: BALL_RADIUS * 2, height: BALL_RADIUS * 2, borderRadius: BALL_RADIUS, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#ccc' },
  pawn: { position: 'absolute', backgroundColor: Colors.surfaceLight, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  aimLine: { position: 'absolute', height: 3, backgroundColor: Colors.gold, borderRadius: 2, opacity: 0.9 },
  goalFlashOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  goalFlashText: { color: '#fff', fontSize: 26, fontWeight: '900' },
  replayBanner: { position: 'absolute', top: 10, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.gold + '80' },
  replayText: { color: Colors.gold, fontWeight: '900', fontSize: 13, letterSpacing: 1 },
  shotHint: { color: Colors.textMuted, fontSize: 12, textAlign: 'center', paddingHorizontal: Spacing.lg },

  resultWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: Spacing.lg },
  resultTitle: { color: Colors.text, fontSize: 28, fontWeight: '900' },
  resultScore: { color: Colors.textSecondary, fontSize: 20, fontWeight: '700', marginBottom: 8 },
  coinsBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.gold + '18', borderWidth: 1, borderColor: Colors.gold + '40', paddingHorizontal: 16, paddingVertical: 8, borderRadius: BorderRadius.full, marginBottom: 20 },
  coinsBadgeText: { color: Colors.gold, fontWeight: '800', fontSize: FontSize.sm },
});
