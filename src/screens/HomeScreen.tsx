import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  Image,
  ActivityIndicator,
  Animated,
  ImageBackground,
  Alert,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, addDoc, onSnapshot, orderBy, query, limit, getDocs, startAfter, runTransaction, doc, increment } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';
import { Post, PostTag, Team } from '../types';
import { useFeaturedMatch } from '../context/MatchContext';
import { useAuth } from '../context/AuthContext';
import { usePremium, EXTRA_POST_COST } from '../context/PremiumContext';
import { useStore } from '../context/StoreContext';
import { useBlock } from '../context/BlockContext';
import PostCard from '../components/PostCard';
import CreatePostModal from '../components/CreatePostModal';
import { sendPostNotifications, sendMentionNotifications } from '../utils/notifications';
import FeedAdCard from '../components/FeedAdCard';

// Pub toutes les N publications
const AD_FREQUENCY = 5;
const FEED_PAGE_SIZE = 20; // posts chargés par page (temps réel sur la 1re page, pagination ponctuelle ensuite)

type AdSlot = { _ad: true; id: string };
type FeedItem = Post | AdSlot;

function formatMatchDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
}

function formatMatchTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
}

function countdown(dateStr: string): string {
  const now = new Date();
  const target = new Date(dateStr);
  const diff = target.getTime() - now.getTime();
  if (diff <= 0) return 'En cours';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (days > 0) return `J-${days}`;
  if (hours > 0) return `${hours}h${String(minutes).padStart(2, '0')}`;
  return `${minutes}min`;
}

function isImageUri(logo?: string) {
  if (!logo) return false;
  return logo.startsWith('file://') || logo.startsWith('http') || logo.startsWith('data:');
}

function TeamBadge({ team }: { team: Team }) {
  const bgColor = team.color ?? '#333';
  const lightColors = ['#FEBE10', '#FDE100', '#FFC91C', '#EE7000', '#FFFFFF'];
  const isLight = lightColors.some(c => bgColor.toUpperCase() === c.toUpperCase());
  const textColor = isLight ? '#111' : '#fff';

  return (
    <View style={styles.team}>
      <View style={[styles.teamBadge, { backgroundColor: isImageUri(team.logo) ? 'transparent' : bgColor }]}>
        {isImageUri(team.logo) ? (
          <Image source={{ uri: team.logo }} style={styles.teamLogoImage} resizeMode="contain" />
        ) : (
          <Text style={[styles.teamBadgeText, { color: textColor }]}>{team.shortName}</Text>
        )}
      </View>
      <Text style={styles.teamName}>{team.shortName}</Text>
      <Text style={styles.teamFullName} numberOfLines={1}>{team.name}</Text>
    </View>
  );
}

type CompetitionTheme = {
  gradient: readonly [string, string, ...string[]];
  accent: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

function getCompetitionTheme(competition: string): CompetitionTheme {
  const c = (competition || '').toLowerCase();
  if (c.includes('champions') || c.includes('uefa')) {
    return {
      gradient: ['#0A1E50', '#040B2E', '#0A1E50'] as const,
      accent: '#FFFFFF',
      label: 'UEFA Champions League',
      icon: 'star',
    };
  }
  if (c.includes('copa del rey')) {
    return {
      gradient: ['#8B0000', '#5C0508', '#3A0204'] as const,
      accent: '#F1BF00',
      label: 'Copa del Rey',
      icon: 'trophy',
    };
  }
  if (c.includes('supercopa')) {
    return {
      gradient: ['#AA151B', '#C9981A', '#AA151B'] as const,
      accent: '#FFFFFF',
      label: 'Supercopa',
      icon: 'ribbon',
    };
  }
  if (c.includes('club world') || c.includes('mondial')) {
    return {
      gradient: ['#1A1A1A', '#3A2A00', '#1A1A1A'] as const,
      accent: '#FFD700',
      label: 'FIFA Club World Cup',
      icon: 'earth',
    };
  }
  if (c.includes('primera') || c.includes('liga') || c.includes('laliga')) {
    return {
      gradient: ['#EE2A35', '#A50044', '#5C0024'] as const,
      accent: '#FFFFFF',
      label: 'LaLiga',
      icon: 'football',
    };
  }
  // Match amical / défaut Barça bleu
  return {
    gradient: ['#00336B', '#004D98', '#003070'] as const,
    accent: '#FFFFFF',
    label: competition || 'Match amical',
    icon: 'football',
  };
}

// Regroupe les buts par buteur (en gardant l'ordre chronologique d'apparition)
function groupGoalsByScorer<T extends { scorer: string }>(items: T[]): { scorer: string; items: T[] }[] {
  const order: string[] = [];
  const map = new Map<string, T[]>();
  for (const it of items) {
    if (!map.has(it.scorer)) { map.set(it.scorer, []); order.push(it.scorer); }
    map.get(it.scorer)!.push(it);
  }
  return order.map(s => ({ scorer: s, items: map.get(s)! }));
}

// Formate les minutes d'un même buteur : "28', 67'" avec (p) / (csc) accolés à la minute concernée
function formatGoalMinutes(items: { minute: string; isPenalty?: boolean; isOwnGoal?: boolean }[]): string {
  return items
    .map(g => {
      let s = g.minute;
      if (g.isPenalty) s += ' (p)';
      if (g.isOwnGoal) s += ' (csc)';
      return s;
    })
    .join(', ');
}

function MatchBanner() {
  const { featuredMatch: match, liveData, liveMinute, isLoadingMatches, setLiveScreenActive } = useFeaturedMatch();

  // Le score n'est visible que sur cet écran : ailleurs, inutile d'interroger ESPN
  // toutes les 8s — le score continue d'arriver via l'écouteur partagé.
  useFocusEffect(
    useCallback(() => {
      setLiveScreenActive(true);
      return () => setLiveScreenActive(false);
    }, [setLiveScreenActive])
  );

  if (!match) {
    return (
      <LinearGradient colors={['#00336B', '#004D98', '#003070']} style={styles.matchCard}>
        {isLoadingMatches
          ? <ActivityIndicator color="rgba(255,255,255,0.5)" />
          : <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, textAlign: 'center' }}>Aucun match à venir</Text>
        }
      </LinearGradient>
    );
  }

  // Sans données live (ex. dernier match de la saison récupéré via l'API), on se rabat
  // sur le statut/score de l'objet match lui-même.
  const isLive = liveData
    ? liveData.status === 'IN_PLAY' || liveData.status === 'PAUSED'
    : match.status === 'live';
  const isFinished = liveData
    ? liveData.status === 'FINISHED'
    : match.status === 'finished';
  const showScore = isLive || isFinished;
  const homeScore = liveData?.homeScore ?? match.homeScore ?? 0;
  const awayScore = liveData?.awayScore ?? match.awayScore ?? 0;
  const theme = getCompetitionTheme(match.competition);
  const goals = liveData?.goals ?? [];

  return (
    <LinearGradient
      colors={theme.gradient as any}
      style={styles.matchCard}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <View style={styles.matchTopRow}>
        <View style={[styles.competitionBadge, { backgroundColor: theme.accent + '22', borderWidth: 1, borderColor: theme.accent + '44' }]}>
          <Ionicons name={theme.icon} size={11} color={theme.accent} />
          <Text style={[styles.competitionText, { color: theme.accent }]}>{theme.label}</Text>
        </View>
        {isLive ? (
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>
              {liveData?.status === 'PAUSED'
                ? 'MI-TEMPS'
                : liveMinute != null ? `${liveMinute}'` : 'LIVE'}
            </Text>
          </View>
        ) : isFinished ? (
          <View style={styles.finishedBadge}>
            <Text style={styles.finishedText}>TERMINÉ</Text>
          </View>
        ) : (
          <View style={styles.countdownBadge}>
            <Text style={styles.countdownText}>{countdown(match.date)}</Text>
          </View>
        )}
      </View>

      <View style={styles.teamsRow}>
        <TeamBadge team={match.homeTeam} />
        <View style={styles.centerBlock}>
          {showScore ? (
            <>
              <Text style={[styles.scoreText, isLive && { color: '#FFD700' }]}>
                {homeScore} - {awayScore}
              </Text>
              {!isFinished && (
                <Text style={styles.vsLabel}>
                  {liveData?.status === 'PAUSED'
                    ? 'MI-TEMPS'
                    : liveMinute != null ? `${liveMinute}'` : 'LIVE'}
                </Text>
              )}
            </>
          ) : (
            <>
              <Text style={styles.timeText}>{formatMatchTime(match.date)}</Text>
              <Text style={styles.vsLabel}>VS</Text>
              <Text style={styles.dateText} numberOfLines={1}>{formatMatchDate(match.date)}</Text>
            </>
          )}
        </View>
        <TeamBadge team={match.awayTeam} />
      </View>

      {goals.length > 0 && (() => {
        const homeGroups = groupGoalsByScorer(goals.filter(g => g.team === 'home'));
        const awayGroups = groupGoalsByScorer(goals.filter(g => g.team === 'away'));
        return (
          <View style={styles.goalsBlock}>
            <View style={styles.goalsDivider} />
            <View style={styles.goalsColumns}>
              <View style={styles.goalsCol}>
                {homeGroups.map((grp, i) => (
                  <View key={`h-${i}`} style={styles.goalLineRow}>
                    <View style={styles.goalIconsRow}>
                      {grp.items.map((_, idx) => (
                        <Ionicons key={idx} name="football" size={10} color="rgba(255,255,255,0.85)" />
                      ))}
                    </View>
                    <Text style={styles.goalLineText} numberOfLines={1}>
                      {grp.scorer} <Text style={styles.goalMinuteInline}>{formatGoalMinutes(grp.items)}</Text>
                    </Text>
                  </View>
                ))}
              </View>
              <View style={[styles.goalsCol, styles.goalsColRight]}>
                {awayGroups.map((grp, i) => (
                  <View key={`a-${i}`} style={[styles.goalLineRow, styles.goalLineRowRight]}>
                    <Text style={[styles.goalLineText, { textAlign: 'right' }]} numberOfLines={1}>
                      {grp.scorer} <Text style={styles.goalMinuteInline}>{formatGoalMinutes(grp.items)}</Text>
                    </Text>
                    <View style={styles.goalIconsRow}>
                      {grp.items.map((_, idx) => (
                        <Ionicons key={idx} name="football" size={10} color="rgba(255,255,255,0.85)" />
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </View>
        );
      })()}
    </LinearGradient>
  );
}

function CreatePostBar({ onPress, userAvatar, userPhoto, dailyCount, dailyLimit }: {
  onPress: () => void;
  userAvatar: string;
  userPhoto?: string;
  dailyCount?: number;
  dailyLimit?: number | null;
}) {
  const limitReached = dailyLimit != null && (dailyCount ?? 0) >= dailyLimit;
  return (
    <TouchableOpacity style={[styles.createBar, limitReached && styles.createBarLocked]} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.createAvatar}>
        {userPhoto ? (
          <Image source={{ uri: `data:image/jpeg;base64,${userPhoto}` }} style={styles.createAvatarImage} />
        ) : (
          <Text style={styles.createAvatarEmoji}>{userAvatar}</Text>
        )}
      </View>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text style={styles.createText}>
          {limitReached ? (
            <>
              Limite atteinte · {EXTRA_POST_COST}
              <Ionicons name="cash" size={12} color={Colors.dollar} />
              /post ou Premium ✨
            </>
          ) : 'Quoi de neuf sur le Barça ?'}
        </Text>
        {dailyLimit != null && (
          <Text style={styles.createCounter}>
            {dailyCount}/{dailyLimit} posts aujourd'hui
          </Text>
        )}
      </View>
      {limitReached
        ? <Ionicons name="diamond" size={16} color={Colors.gold} />
        : <View style={styles.createDot} />
      }
    </TouchableOpacity>
  );
}

function SkeletonCard() {
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View style={[styles.skeletonCard, { opacity }]}>
      <View style={styles.skeletonHeader}>
        <View style={styles.skeletonAvatar} />
        <View style={{ flex: 1, gap: 6 }}>
          <View style={[styles.skeletonLine, { width: '45%' }]} />
          <View style={[styles.skeletonLine, { width: '28%', opacity: 0.6 }]} />
        </View>
      </View>
      <View style={[styles.skeletonLine, { width: '100%', height: 12, marginBottom: 6 }]} />
      <View style={[styles.skeletonLine, { width: '85%', height: 12, marginBottom: 6 }]} />
      <View style={[styles.skeletonLine, { width: '60%', height: 12 }]} />
    </Animated.View>
  );
}

function Divider() {
  return (
    <View style={styles.divider}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerLabel}>Publications récentes</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

type Filter = 'tous' | PostTag;

const FILTERS: { key: Filter; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'tous',    label: 'Tous',     icon: 'apps' },
  { key: 'match',   label: 'Matchs',   icon: 'football' },
  { key: 'opinion', label: 'Opinions', icon: 'chatbubble' },
  { key: 'news',    label: 'News',     icon: 'newspaper' },
];

function getLocalDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user, isAuthenticated } = useAuth();
  const { isPremium, canPost, FREE_DAILY_POST_LIMIT, openPremiumScreen } = usePremium();
  const { openStore } = useStore();
  const { isAnyBlock } = useBlock();
  const [livePosts, setLivePosts] = useState<Post[]>([]);   // 1re page en temps réel
  const [olderPosts, setOlderPosts] = useState<Post[]>([]); // pages suivantes (chargées ponctuellement)
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [activeFilter, setActiveFilter] = useState<Filter>('tous');

  const [todayPostCount, setTodayPostCount] = useState(0);
  // Modale du post payant (au-delà de la limite gratuite) : remplace une Alert
  // native, qui ne peut pas afficher l'icône dollar de l'app.
  const [showExtraPostModal, setShowExtraPostModal] = useState(false);

  useEffect(() => {
    if (!user) { setTodayPostCount(0); return; }
    const key = `@daily_posts_${user.id}`;
    AsyncStorage.getItem(key).then(val => {
      if (!val) return;
      const { date, count } = JSON.parse(val);
      if (date === getLocalDateString()) setTodayPostCount(count);
      else AsyncStorage.removeItem(key);
    });
  }, [user?.id]);

  // Fusionne la page temps réel et les pages paginées (dédoublonnage par id, tri par date desc)
  const posts = useMemo(() => {
    const map = new Map<string, Post>();
    for (const p of olderPosts) map.set(p.id, p);
    for (const p of livePosts) map.set(p.id, p); // le temps réel prime (plus frais)
    return [...map.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  }, [livePosts, olderPosts]);
  const postsRef = useRef<Post[]>([]);
  useEffect(() => { postsRef.current = posts; }, [posts]);

  const filteredPosts = useMemo(() => {
    const visible = posts.filter(p => !isAnyBlock(p.userId));
    if (activeFilter === 'tous') return visible;
    return visible.filter(p => p.tag === activeFilter);
  }, [posts, activeFilter, isAnyBlock]);

  // Intercale une pub toutes les AD_FREQUENCY publications
  const feedItems = useMemo<FeedItem[]>(() => {
    const result: FeedItem[] = [];
    filteredPosts.forEach((post, i) => {
      result.push(post);
      if ((i + 1) % AD_FREQUENCY === 0) {
        result.push({ _ad: true, id: `ad-${i}` });
      }
    });
    return result;
  }, [filteredPosts]);

  // Temps réel UNIQUEMENT sur la 1re page (les posts les plus récents) → borne les lectures
  // Firestore au lieu de relire tout le feed + chaque like/commentaire de tous les posts.
  useEffect(() => {
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(FEED_PAGE_SIZE));
    const unsub = onSnapshot(q, (snap) => {
      setLivePosts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Post)));
      setLoadingPosts(false);
    });
    return () => unsub();
  }, []);

  // Pages suivantes : lecture PONCTUELLE (getDocs) au scroll, pas d'écouteur → pas de coût
  // récurrent sur les vieux posts.
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    const all = postsRef.current;
    const oldest = all[all.length - 1];
    if (!oldest) return;
    setLoadingMore(true);
    try {
      const snap = await getDocs(query(
        collection(db, 'posts'), orderBy('createdAt', 'desc'),
        startAfter(oldest.createdAt), limit(FEED_PAGE_SIZE),
      ));
      const more = snap.docs.map(d => ({ id: d.id, ...d.data() } as Post));
      if (more.length) setOlderPosts(prev => [...prev, ...more]);
      if (more.length < FEED_PAGE_SIZE) setHasMore(false);
    } catch { /* silencieux */ } finally { setLoadingMore(false); }
  }, [loadingMore, hasMore]);

  const handleOpenPost = useCallback(() => {
    // Au-delà de la limite gratuite (non-Premium) : modale de post payant, qui
    // affiche l'icône dollar de l'app et oriente vers l'échange si besoin.
    if (!canPost(todayPostCount)) {
      setShowExtraPostModal(true);
      return;
    }
    setShowModal(true);
  }, [canPost, todayPostCount]);

  const handleNewPost = useCallback(async (content: string, tag?: PostTag, imageBase64?: string, mentions?: { id: string; username: string }[]) => {
    if (!user) return;

    // Post au-delà de la limite gratuite (non-Premium) : payant. On débite AVANT de
    // publier, de façon atomique et sur le solde SERVEUR — se fier au solde local
    // laisserait poster sans payer si le solde a changé sur un autre appareil. En cas
    // d'échec, la fenêtre de composition reste ouverte, le brouillon n'est pas perdu.
    const isPaidPost = !canPost(todayPostCount);
    if (isPaidPost) {
      try {
        await runTransaction(db, async (t) => {
          const userRef = doc(db, 'users', user.id);
          const snap = await t.get(userRef);
          const balance = snap.data()?.dollars ?? 0;
          if (balance < EXTRA_POST_COST) throw new Error('INSUFFICIENT_DOLLARS');
          t.update(userRef, { dollars: increment(-EXTRA_POST_COST) });
        });
      } catch (e: any) {
        if (e?.message === 'INSUFFICIENT_DOLLARS') {
          Alert.alert(
            'Solde insuffisant',
            `Il te faut ${EXTRA_POST_COST} dollars du jeu pour ce post. Échange des pièces contre des dollars pour continuer.`,
            [
              { text: 'Échanger des pièces', onPress: () => openStore('swap') },
              { text: 'Annuler', style: 'cancel' },
            ],
          );
        } else {
          Alert.alert('Post non publié', 'Le paiement n\'a pas abouti, réessaie dans un instant.');
        }
        return;
      }
    }

    setShowModal(false);
    const newCount = todayPostCount + 1;
    setTodayPostCount(newCount);
    AsyncStorage.setItem(`@daily_posts_${user.id}`, JSON.stringify({ date: getLocalDateString(), count: newCount }));
    await addDoc(collection(db, 'posts'), {
      userId: user.id,
      username: user.username,
      avatar: user.avatar,
      avatarPhoto: user.photoBase64 ?? null,
      verified: user.verified ?? false,
      goldVerified: user.goldVerified ?? false,
      content,
      imageBase64: imageBase64 ?? null,
      mentionedUsers: mentions?.map(m => ({ id: m.id, username: m.username })) ?? [],
      likedBy: [],
      comments: 0,
      createdAt: new Date().toISOString(),
      tag: tag ?? null,
    });

    sendPostNotifications(user.id, user.username, content, !!imageBase64);
    if (mentions?.length) sendMentionNotifications(mentions, user.username, content);
  }, [user, todayPostCount, canPost]);

  const ListHeader = useCallback(() => (
    <View style={styles.listHeader}>
      <MatchBanner />
      {isAuthenticated && (
        <CreatePostBar
          onPress={handleOpenPost}
          userAvatar={user?.avatar ?? '🦁'}
          userPhoto={user?.photoBase64}
          dailyCount={todayPostCount}
          dailyLimit={isPremium ? null : FREE_DAILY_POST_LIMIT}
        />
      )}

      {/* Filtres */}
      <View style={styles.filtersRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, activeFilter === f.key && styles.filterChipActive]}
            onPress={() => setActiveFilter(f.key)}
            activeOpacity={0.75}
          >
            <Ionicons
              name={f.icon}
              size={13}
              color={activeFilter === f.key ? Colors.primary : Colors.textMuted}
            />
            <Text style={[styles.filterLabel, activeFilter === f.key && styles.filterLabelActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loadingPosts && (
        <>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </>
      )}
    </View>
  ), [isAuthenticated, user, loadingPosts, activeFilter, handleOpenPost, todayPostCount, isPremium, FREE_DAILY_POST_LIMIT]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />

      <FlatList
        data={feedItems}
        keyExtractor={item => item.id}
        renderItem={({ item }) =>
          '_ad' in item
            ? <FeedAdCard key={item.id} />
            : <PostCard post={item as Post} />
        }
        ListHeaderComponent={ListHeader}
        extraData={[user?.photoBase64, activeFilter]}
        showsVerticalScrollIndicator={false}
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        ListFooterComponent={
          loadingMore
            ? <View style={{ height: 60, justifyContent: 'center' }}><ActivityIndicator color={Colors.primary} /></View>
            : <View style={{ height: 60 }} />
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          loadingPosts ? null : (
            <View style={{ alignItems: 'center', paddingTop: 24, gap: 8 }}>
              <Text style={{ fontSize: 36 }}>💬</Text>
              <Text style={{ color: Colors.textMuted, fontSize: 14 }}>Aucune publication pour l'instant</Text>
            </View>
          )
        }
      />

      {isAuthenticated && (
        <CreatePostModal
          visible={showModal}
          onClose={() => setShowModal(false)}
          onSubmit={handleNewPost}
          isPremium={isPremium}
        />
      )}

      {/* Post payant au-delà de la limite gratuite : l'icône dollar de l'app (verte)
          lève l'ambiguïté avec de l'argent réel, et si le solde manque on renvoie
          vers l'échange pièces → dollars. */}
      <Modal
        visible={showExtraPostModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowExtraPostModal(false)}
      >
        <View style={styles.extraOverlay}>
          <View style={styles.extraCard}>
            <View style={styles.extraIconWrap}>
              <Ionicons name="cash" size={26} color={Colors.dollar} />
            </View>
            <Text style={styles.extraTitle}>Limite de posts atteinte</Text>
            <Text style={styles.extraDesc}>
              Tu as utilisé tes {FREE_DAILY_POST_LIMIT} posts gratuits du jour. Chaque post
              supplémentaire coûte {EXTRA_POST_COST}
              <Ionicons name="cash" size={13} color={Colors.dollar} /> en dollars du jeu.
            </Text>

            <View style={styles.extraBalance}>
              <Text style={styles.extraBalanceLabel}>Ton solde</Text>
              <View style={styles.extraBalanceVal}>
                <Ionicons name="cash" size={14} color={Colors.dollar} />
                <Text style={styles.extraBalanceNum}>{user?.dollars ?? 0}</Text>
              </View>
            </View>

            {(user?.dollars ?? 0) >= EXTRA_POST_COST ? (
              <TouchableOpacity
                style={styles.extraPrimary}
                activeOpacity={0.85}
                onPress={() => { setShowExtraPostModal(false); setShowModal(true); }}
              >
                <Text style={styles.extraPrimaryText}>Poster pour {EXTRA_POST_COST} </Text>
                <Ionicons name="cash" size={15} color="#04170D" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.extraPrimary}
                activeOpacity={0.85}
                onPress={() => { setShowExtraPostModal(false); openStore('swap'); }}
              >
                <Ionicons name="swap-horizontal" size={16} color="#04170D" />
                <Text style={styles.extraPrimaryText}>  Échanger des pièces en dollars</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.extraPremium}
              activeOpacity={0.85}
              onPress={() => { setShowExtraPostModal(false); openPremiumScreen(); }}
            >
              <Ionicons name="diamond" size={14} color={Colors.gold} />
              <Text style={styles.extraPremiumText}>  Passer Premium · posts illimités</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setShowExtraPostModal(false)} activeOpacity={0.7}>
              <Text style={styles.extraCancel}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },

  // ─── List ─────────────────────────────────────────────
  listContent: {
    paddingBottom: 20,
  },
  listHeader: {
    paddingBottom: 4,
  },

  // ─── Match Card ───────────────────────────────────────
  matchCard: {
    margin: 12,
    borderRadius: 18,
    padding: 16,
  },
  matchTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  competitionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  competitionText: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  countdownBadge: {
    backgroundColor: Colors.gold + '22',
    borderWidth: 1,
    borderColor: Colors.gold + '55',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  countdownText: {
    color: Colors.gold,
    fontSize: 11,
    fontWeight: '800',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FF3B3B',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  liveText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  finishedBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  finishedText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '700',
  },
  scoreText: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 2,
  },
  teamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  team: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
  },
  teamBadge: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 6,
  },
  teamBadgeText: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  teamLogoImage: {
    width: 56,
    height: 56,
    borderRadius: 14,
  },
  teamName: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  teamFullName: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 9,
    textAlign: 'center',
  },
  centerBlock: {
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
  },
  timeText: {
    color: Colors.gold,
    fontSize: 22,
    fontWeight: '900',
  },
  vsLabel: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
  },
  dateText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 10,
    textTransform: 'capitalize',
    textAlign: 'center',
  },
  venueText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 10,
    textAlign: 'center',
  },

  // ─── Buteurs ────────────────────────────────────────────
  goalsBlock: {
    marginTop: 8,
  },
  goalsDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginBottom: 6,
  },
  goalsColumns: {
    flexDirection: 'row',
    gap: 8,
  },
  goalsCol: {
    flex: 1,
    gap: 3,
  },
  goalsColRight: {
    alignItems: 'flex-end',
  },
  goalLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '100%',
  },
  goalLineRowRight: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  goalIconsRow: {
    flexDirection: 'row',
    gap: 1,
  },
  goalLineText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    flexShrink: 1,
  },
  goalMinuteInline: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '700',
  },
  goalTag: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '500',
  },

  // ─── Skeleton ─────────────────────────────────────────
  skeletonCard: {
    backgroundColor: '#151515',
    marginHorizontal: 12,
    marginVertical: 5,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#242424',
    gap: 10,
  },
  skeletonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  skeletonAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2a2a2a',
  },
  skeletonLine: {
    height: 11,
    borderRadius: 6,
    backgroundColor: '#2a2a2a',
  },

  // ─── Create Post Bar ──────────────────────────────────
  createBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#151515',
    marginHorizontal: 12,
    marginBottom: 4,
    borderRadius: 16,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: '#252525',
  },
  createAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary + '30',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.primary + '60',
    overflow: 'hidden',
  },
  createAvatarEmoji: {
    fontSize: 17,
  },
  createAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
  },
  createText: {
    color: Colors.textMuted,
    fontSize: 14,
  },
  createDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  createBarLocked: {
    borderColor: Colors.gold + '40',
    backgroundColor: '#1a1500',
  },
  createCounter: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },

  // ─── Filtres ──────────────────────────────────────────
  filtersRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingBottom: 8,
    paddingTop: 4,
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: '#252525',
  },
  filterChipActive: {
    backgroundColor: Colors.primary + '22',
    borderColor: Colors.primary,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  filterLabelActive: {
    color: Colors.primary,
    fontWeight: '700',
  },

  // ─── Divider ─────────────────────────────────────────
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginVertical: 10,
    gap: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#222',
  },
  dividerLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  // ─── Modale post payant ───────────────────────────────
  extraOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center', padding: 28,
  },
  extraCard: {
    width: '100%', maxWidth: 380,
    backgroundColor: '#15151C',
    borderRadius: 22, borderWidth: 1, borderColor: '#24242F',
    padding: 22, alignItems: 'center',
  },
  extraIconWrap: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: Colors.dollar + '24',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  extraTitle: { color: '#fff', fontSize: 18, fontWeight: '900', textAlign: 'center' },
  extraDesc: {
    color: '#9A9AA8', fontSize: 13, lineHeight: 19,
    textAlign: 'center', marginTop: 8, marginBottom: 16,
  },
  extraBalance: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14,
    marginBottom: 16,
  },
  extraBalanceLabel: { color: '#7A7A88', fontSize: 12, fontWeight: '700' },
  extraBalanceVal: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  extraBalanceNum: { color: Colors.dollar, fontSize: 15, fontWeight: '900' },
  extraPrimary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    alignSelf: 'stretch',
    backgroundColor: Colors.dollar,
    borderRadius: BorderRadius.full,
    paddingVertical: 13, marginBottom: 10,
  },
  extraPrimaryText: { color: '#04170D', fontSize: 15, fontWeight: '900' },
  extraPremium: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: BorderRadius.full,
    paddingVertical: 12, marginBottom: 6,
  },
  extraPremiumText: { color: Colors.gold, fontSize: 14, fontWeight: '800' },
  extraCancel: {
    color: '#7A7A88', fontSize: 13, fontWeight: '700',
    marginTop: 8, paddingVertical: 6,
  },
});
