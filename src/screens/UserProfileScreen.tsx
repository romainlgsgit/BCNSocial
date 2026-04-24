import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  StatusBar,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';
import { useAuth } from '../context/AuthContext';
import { useFollow } from '../context/FollowContext';
import { useRatings } from '../context/RatingsContext';
import { useFeaturedMatch } from '../context/MatchContext';
import { PLAYERS, MATCHES } from '../data/mockData';
import { getRatingColor } from '../components/VotingWidget';
import { Post, Match } from '../types';
import PostCard from '../components/PostCard';
import VerifiedBadge from '../components/VerifiedBadge';

// ─── Glass design tokens ──────────────────────────────────────────────────────

const G = {
  card: {
    backgroundColor: 'rgba(255,255,255,0.06)' as const,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)' as const,
  },
  cardElevated: {
    backgroundColor: 'rgba(255,255,255,0.1)' as const,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)' as const,
  },
  tabBar: {
    backgroundColor: 'rgba(255,255,255,0.05)' as const,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)' as const,
  },
  tabActive: {
    backgroundColor: 'rgba(165,0,68,0.45)' as const,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(165,0,68,0.65)' as const,
  },
  surface: 'rgba(255,255,255,0.04)' as const,
};

// ─── Types ────────────────────────────────────────────────────────────────────

type ProfileTab = 'posts' | 'pronos' | 'notes';

const TABS: { key: ProfileTab; label: string; icon: any; iconOutline: any }[] = [
  { key: 'posts', label: 'Posts', icon: 'chatbubble-ellipses', iconOutline: 'chatbubble-ellipses-outline' },
  { key: 'pronos', label: 'Pronos', icon: 'trophy', iconOutline: 'trophy-outline' },
  { key: 'notes', label: 'Notes', icon: 'star', iconOutline: 'star-outline' },
];

interface PublicUser {
  username: string;
  avatar: string;
  photoBase64?: string;
  verified?: boolean;
  followersCount: number;
  followingCount: number;
}

// ─── RatingBadge ──────────────────────────────────────────────────────────────

function RatingBadge({ rating }: { rating: number }) {
  const color = getRatingColor(rating);
  return (
    <View style={[glassStyles.badge, { borderColor: color + '60', backgroundColor: color + '18' }]}>
      <Text style={[glassStyles.badgeText, { color }]}>{rating}/10</Text>
    </View>
  );
}

// ─── PredictionBadge ─────────────────────────────────────────────────────────

function PredictionBadge({ prediction }: { prediction: string }) {
  const labels: Record<string, { label: string; color: string }> = {
    home: { label: 'Domicile', color: Colors.secondary },
    draw: { label: 'Nul', color: Colors.gold },
    away: { label: 'Extérieur', color: Colors.primary },
  };
  const info = labels[prediction] ?? { label: prediction, color: Colors.textMuted };
  return (
    <View style={[glassStyles.badge, { borderColor: info.color + '55', backgroundColor: info.color + '18' }]}>
      <Text style={[glassStyles.badgeText, { color: info.color }]}>{info.label}</Text>
    </View>
  );
}

// ─── GlassSection ─────────────────────────────────────────────────────────────

function GlassSection({ title, icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <View style={glassStyles.section}>
      <View style={glassStyles.sectionHeader}>
        <Ionicons name={icon} size={14} color={Colors.textSecondary} />
        <Text style={glassStyles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

// ─── PostsTab ─────────────────────────────────────────────────────────────────

function PostsTab({ posts }: { posts: Post[] }) {
  if (posts.length === 0) {
    return <EmptyState icon="chatbubble-outline" text="Aucune publication pour l'instant." />;
  }
  return (
    <View style={{ paddingTop: Spacing.sm }}>
      {posts.map((p) => <PostCard key={p.id} post={p} />)}
    </View>
  );
}

// ─── ProsnosTab ───────────────────────────────────────────────────────────────

function PronosTab({
  betsMap,
  allMatches,
}: {
  betsMap: Record<string, any>;
  allMatches: Match[];
}) {
  const settled = Object.entries(betsMap)
    .filter(([, b]) => b.result !== undefined)
    .sort(([, a], [, b]) => (b.settledAt ?? 0) - (a.settledAt ?? 0));

  if (settled.length === 0) {
    return <EmptyState icon="trophy-outline" text="Aucun pari terminé pour l'instant." />;
  }

  const renderBet = ([matchId, bet]: [string, any]) => {
    const match = allMatches.find((m) => m.id === matchId);
    const predLabel = bet.prediction === 'home' ? 'Domicile' : bet.prediction === 'draw' ? 'Nul' : 'Extérieur';
    const isWon = bet.result === 'won';
    const isLost = bet.result === 'lost';
    const resultColor = isWon ? Colors.win : isLost ? Colors.loss : Colors.textMuted;
    const resultLabel = isWon ? `+${bet.wonAmount} 🪙` : isLost ? '0 🪙' : null;

    return (
      <View key={matchId} style={glassStyles.pronoRow}>
        <View style={{ flex: 1 }}>
          <Text style={glassStyles.pronoMatch}>
            {match ? `${match.homeTeam.shortName} – ${match.awayTeam.shortName}` : `Match #${matchId}`}
          </Text>
          <Text style={glassStyles.pronoMeta}>{predLabel} · Misé : {bet.coins} 🪙</Text>
        </View>
        <View style={[glassStyles.pronoBadgeResult, { borderColor: resultColor + '55', backgroundColor: resultColor + '18' }]}>
          <Ionicons name={isWon ? 'checkmark-circle' : 'close-circle'} size={13} color={resultColor} />
          <Text style={[glassStyles.pronoBadgeResultText, { color: resultColor }]}>
            {isWon ? 'Gagné' : 'Perdu'}
          </Text>
          {resultLabel && <Text style={[glassStyles.pronoBadgeAmount, { color: resultColor }]}>{resultLabel}</Text>}
        </View>
      </View>
    );
  };

  return (
    <View>
      <View style={glassStyles.notesSubtitleRow}>
        <Ionicons name="receipt-outline" size={13} color={Colors.textSecondary} />
        <Text style={glassStyles.notesSubtitle}>5 derniers paris</Text>
      </View>
      {settled.map(renderBet)}
    </View>
  );
}

// ─── NotesTab ─────────────────────────────────────────────────────────────────

function NotesTab({
  votesData,
  allMatches,
}: {
  votesData: Record<string, number>;
  allMatches: Match[];
}) {
  const { playerStats, matchStats } = useRatings();
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);

  // Séparer les notes de match et les notes de joueur
  const matchRatings = useMemo(() => {
    const res: { match: Match; rating: number }[] = [];
    Object.entries(votesData).forEach(([key, value]) => {
      if (key.startsWith('mr_')) {
        const matchId = key.slice(3);
        const match = allMatches.find((m) => m.id === matchId);
        if (match) res.push({ match, rating: value });
      }
    });
    return res;
  }, [votesData, allMatches]);

  const playerRatingsGrouped = useMemo(() => {
    return PLAYERS.map((player) => {
      const matchHistory = allMatches
        .map((match) => {
          const key = `pr_${match.id}_${player.id}`;
          const rating = votesData[key];
          return rating !== undefined ? { match, rating } : null;
        })
        .filter((r): r is { match: Match; rating: number } => r !== null);
      return matchHistory.length > 0 ? { player, matchHistory } : null;
    }).filter((r): r is NonNullable<typeof r> => r !== null);
  }, [votesData, allMatches]);

  if (matchRatings.length === 0 && playerRatingsGrouped.length === 0) {
    return <EmptyState icon="star-outline" text="Aucune note donnée pour l'instant." />;
  }

  return (
    <View>
      {matchRatings.length > 0 && (
        <GlassSection title="Matchs notés" icon="football-outline">
          {matchRatings.map(({ match, rating }) => {
            const community = matchStats[match.id];
            return (
              <View key={match.id} style={glassStyles.noteRow}>
                <View style={{ flex: 1 }}>
                  <Text style={glassStyles.noteTeams}>
                    {match.homeTeam.shortName} {match.homeScore ?? '–'} – {match.awayScore ?? '–'} {match.awayTeam.shortName}
                  </Text>
                  <Text style={glassStyles.noteMeta}>
                    {match.competition}
                    {community && community.totalVotes > 0
                      ? `  ·  Moy. com. ${community.averageRating.toFixed(1)}`
                      : ''}
                  </Text>
                </View>
                <RatingBadge rating={rating} />
              </View>
            );
          })}
        </GlassSection>
      )}

      {playerRatingsGrouped.length > 0 && (
        <GlassSection title="Joueurs notés" icon="person-outline">
          {playerRatingsGrouped.map(({ player, matchHistory }) => {
            const isExpanded = expandedPlayer === player.id;
            const community = playerStats[player.id];
            return (
              <View key={player.id} style={glassStyles.playerNoteCard}>
                <TouchableOpacity
                  style={glassStyles.playerNoteRow}
                  onPress={() => setExpandedPlayer(isExpanded ? null : player.id)}
                  activeOpacity={0.75}
                >
                  <Text style={glassStyles.playerNoteEmoji}>{player.photo}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={glassStyles.playerNoteName}>{player.name}</Text>
                    {community && community.totalVotes > 0 && (
                      <Text style={glassStyles.playerNoteCommunity}>
                        Moy. communauté: {community.averageRating.toFixed(1)}
                      </Text>
                    )}
                  </View>
                  <Text style={glassStyles.noteCount}>{matchHistory.length} match{matchHistory.length > 1 ? 's' : ''}</Text>
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={14}
                    color={Colors.textMuted}
                  />
                </TouchableOpacity>

                {isExpanded && matchHistory.map(({ match, rating }) => (
                  <View key={match.id} style={glassStyles.matchHistoryRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={glassStyles.matchHistoryTeams}>
                        {match.homeTeam.shortName} {match.homeScore ?? '–'}–{match.awayScore ?? '–'} {match.awayTeam.shortName}
                      </Text>
                      <Text style={glassStyles.matchHistoryMeta}>{match.competition}</Text>
                    </View>
                    <RatingBadge rating={rating} />
                  </View>
                ))}
              </View>
            );
          })}
        </GlassSection>
      )}
    </View>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={glassStyles.emptyState}>
      <Ionicons name={icon} size={36} color={Colors.textMuted} />
      <Text style={glassStyles.emptyText}>{text}</Text>
    </View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function UserProfileScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { userId } = route.params as { userId: string };
  const { user: currentUser } = useAuth();
  const { isFollowing, followUser, unfollowUser } = useFollow();
  const { monthlyMatches } = useFeaturedMatch();

  const [profileUser, setProfileUser] = useState<PublicUser | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [betsMap, setBetsMap] = useState<Record<string, any>>({});
  const [votesData, setVotesData] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');

  const isOwnProfile = currentUser?.id === userId;
  const following = isFollowing(userId);
  const allMatches = useMemo(() => [...MATCHES, ...monthlyMatches], [monthlyMatches]);

  // Profil utilisateur (temps réel pour les compteurs)
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'users', userId), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setProfileUser({
          username: d.username || 'Utilisateur',
          avatar: d.avatar || '🦁',
          photoBase64: d.photoBase64,
          verified: d.verified ?? false,
          followersCount: d.followersCount ?? 0,
          followingCount: d.followingCount ?? 0,
        });
      }
      setLoading(false);
    });
    return unsub;
  }, [userId]);

  // Publications
  useEffect(() => {
    const q = query(collection(db, 'posts'), where('userId', '==', userId));
    return onSnapshot(q, (snap) => {
      const p = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Post));
      p.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setPosts(p);
    });
  }, [userId]);

  // Paris
  useEffect(() => {
    return onSnapshot(doc(db, 'bets', userId), (snap) => {
      setBetsMap(snap.exists() ? (snap.data() as Record<string, any>) : {});
    });
  }, [userId]);

  // Votes / notes
  useEffect(() => {
    return onSnapshot(doc(db, 'userVotes', userId), (snap) => {
      setVotesData(snap.exists() ? (snap.data() as Record<string, number>) : {});
    });
  }, [userId]);

  const handleFollowToggle = async () => {
    if (!currentUser || isOwnProfile) return;
    setFollowLoading(true);
    try {
      if (following) await unfollowUser(userId);
      else await followUser(userId);
    } finally {
      setFollowLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  if (!profileUser) {
    return (
      <View style={styles.centered}>
        <StatusBar barStyle="light-content" />
        <Text style={{ color: Colors.textMuted }}>Profil introuvable</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <ScrollView showsVerticalScrollIndicator={false} stickyHeaderIndices={[1]}>

        {/* ── En-tête ── */}
        <LinearGradient
          colors={['#6B0030', Colors.primary, '#1A0010', Colors.background]}
          locations={[0, 0.25, 0.65, 1]}
          style={styles.header}
        >
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={20} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>

          {/* Avatar */}
          <View style={styles.avatarRing}>
            {profileUser.photoBase64 ? (
              <Image
                source={{ uri: `data:image/jpeg;base64,${profileUser.photoBase64}` }}
                style={styles.avatarImg}
              />
            ) : (
              <View style={styles.avatarInner}>
                <Text style={styles.avatarEmoji}>{profileUser.avatar}</Text>
              </View>
            )}
          </View>

          {/* Nom */}
          <View style={styles.nameRow}>
            <Text style={styles.username}>{profileUser.username}</Text>
            {profileUser.verified && <VerifiedBadge size={18} />}
          </View>

          {/* Compteurs */}
          <View style={styles.countsContainer}>
            <View style={styles.countItem}>
              <Text style={styles.countValue}>{profileUser.followersCount}</Text>
              <Text style={styles.countLabel}>Abonnés</Text>
            </View>
            <View style={styles.countSep} />
            <View style={styles.countItem}>
              <Text style={styles.countValue}>{profileUser.followingCount}</Text>
              <Text style={styles.countLabel}>Abonnements</Text>
            </View>
            <View style={styles.countSep} />
            <View style={styles.countItem}>
              <Text style={styles.countValue}>{posts.length}</Text>
              <Text style={styles.countLabel}>Posts</Text>
            </View>
          </View>

          {/* Bouton abonnement */}
          {!isOwnProfile && currentUser ? (
            <TouchableOpacity
              style={[styles.followBtn, following && styles.followingBtn]}
              onPress={handleFollowToggle}
              disabled={followLoading}
              activeOpacity={0.85}
            >
              {followLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons
                    name={following ? 'checkmark-circle' : 'person-add-outline'}
                    size={16}
                    color={following ? 'rgba(255,255,255,0.75)' : '#fff'}
                  />
                  <Text style={[styles.followBtnText, following && styles.followingBtnText]}>
                    {following ? 'Abonné' : "S'abonner"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          ) : isOwnProfile ? (
            <View style={styles.ownPill}>
              <Ionicons name="person-circle-outline" size={14} color="rgba(255,255,255,0.5)" />
              <Text style={styles.ownPillText}>Ton profil</Text>
            </View>
          ) : null}
        </LinearGradient>

        {/* ── Tab bar (sticky) ── */}
        <View style={styles.tabBarWrap}>
          <View style={styles.tabBar}>
            {TABS.map((tab) => {
              const active = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.tab, active && styles.tabActive]}
                  onPress={() => setActiveTab(tab.key)}
                  activeOpacity={0.75}
                >
                  <Ionicons
                    name={active ? tab.icon : tab.iconOutline}
                    size={16}
                    color={active ? '#fff' : Colors.textSecondary}
                  />
                  <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Contenu ── */}
        <View style={styles.content}>
          {activeTab === 'posts' && <PostsTab posts={posts} />}
          {activeTab === 'pronos' && <PronosTab betsMap={betsMap} allMatches={allMatches} />}
          {activeTab === 'notes' && <NotesTab votesData={votesData} allMatches={allMatches} />}
        </View>

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },

  header: {
    paddingTop: 64,
    paddingBottom: Spacing.xl,
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    gap: 12,
  },
  backBtn: {
    position: 'absolute',
    top: 60,
    left: Spacing.md,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarRing: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: { width: 92, height: 92, borderRadius: 46 },
  avatarInner: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  avatarEmoji: { fontSize: 46 },

  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  username: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text },

  countsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 10,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  countItem: { alignItems: 'center', minWidth: 60 },
  countValue: { fontSize: FontSize.lg, fontWeight: '800', color: '#fff' },
  countLabel: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2, fontWeight: '600' },
  countSep: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.15)' },

  followBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 28,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
    minWidth: 160,
    justifyContent: 'center',
  },
  followingBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.25)',
  },
  followBtnText: { color: '#fff', fontWeight: '800', fontSize: FontSize.sm },
  followingBtnText: { color: 'rgba(255,255,255,0.7)' },

  ownPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: BorderRadius.full,
    paddingVertical: 7,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  ownPillText: { color: 'rgba(255,255,255,0.5)', fontSize: FontSize.xs, fontWeight: '600' },

  // Tab bar (sticky)
  tabBarWrap: {
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: 14,
  },
  tabActive: {
    backgroundColor: 'rgba(165,0,68,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(165,0,68,0.65)',
  },
  tabLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  tabLabelActive: { color: '#fff', fontWeight: '700' },

  content: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },
});

// ─── Glass sub-styles (partagés entre tabs) ───────────────────────────────────

const glassStyles = StyleSheet.create({
  section: { marginBottom: Spacing.md },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.sm,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  badge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 12, fontWeight: '800' },

  pronoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: BorderRadius.md,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    gap: Spacing.sm,
  },
  pronoMatch: { color: Colors.text, fontWeight: '600', fontSize: FontSize.sm },
  pronoMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  pronoBadgeResult: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
  },
  pronoBadgeResultText: { fontSize: 11, fontWeight: '700' },
  pronoBadgeAmount: { fontSize: 11, fontWeight: '800' },
  notesSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.sm,
    marginTop: 4,
  },
  notesSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    padding: Spacing.sm + 4,
    marginBottom: 8,
    gap: Spacing.sm,
  },
  noteTeams: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  noteMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

  playerNoteCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 8,
    overflow: 'hidden',
  },
  playerNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: 10,
  },
  playerNoteEmoji: { fontSize: 24, width: 32, textAlign: 'center' },
  playerNoteName: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  playerNoteCommunity: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  noteCount: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },

  matchHistoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
    gap: Spacing.sm,
  },
  matchHistoryTeams: { fontSize: 12, fontWeight: '700', color: Colors.text },
  matchHistoryMeta: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },

  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
