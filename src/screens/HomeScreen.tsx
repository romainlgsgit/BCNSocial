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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { collection, addDoc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';
import { Post, PostTag, Team } from '../types';
import { useFeaturedMatch } from '../context/MatchContext';
import { useAuth } from '../context/AuthContext';
import PostCard from '../components/PostCard';
import CreatePostModal from '../components/CreatePostModal';
import FeedAdCard from '../components/FeedAdCard';

// Pub toutes les N publications
const AD_FREQUENCY = 5;

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
  if (days > 0) return `J-${days}`;
  return `Dans ${hours}h`;
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

function MatchBanner() {
  const { featuredMatch: match, liveData, liveMinute, isLoadingMatches } = useFeaturedMatch();

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

  const isLive = liveData?.status === 'IN_PLAY' || liveData?.status === 'PAUSED';
  const isFinished = liveData?.status === 'FINISHED';
  const showScore = isLive || isFinished;

  return (
    <LinearGradient
      colors={['#00336B', '#004D98', '#003070']}
      style={styles.matchCard}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <View style={styles.matchTopRow}>
        <View style={styles.competitionBadge}>
          <Text style={styles.competitionText}>{match.competition}</Text>
        </View>
        {isLive ? (
          <View style={styles.liveBadge}>
            <Text style={styles.liveText}>
              {liveData?.status === 'PAUSED'
                ? 'MI-TEMPS'
                : liveMinute != null ? `${liveMinute}' LIVE` : 'EN DIRECT'}
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
                {liveData?.homeScore ?? 0} - {liveData?.awayScore ?? 0}
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
    </LinearGradient>
  );
}

function CreatePostBar({ onPress, userAvatar, userPhoto }: { onPress: () => void; userAvatar: string; userPhoto?: string }) {
  return (
    <TouchableOpacity style={styles.createBar} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.createAvatar}>
        {userPhoto ? (
          <Image
            source={{ uri: `data:image/jpeg;base64,${userPhoto}` }}
            style={styles.createAvatarImage}
          />
        ) : (
          <Text style={styles.createAvatarEmoji}>{userAvatar}</Text>
        )}
      </View>
      <Text style={styles.createText}>Quoi de neuf sur le Barça ?</Text>
      <View style={styles.createDot} />
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

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user, isAuthenticated } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Intercale une pub toutes les AD_FREQUENCY publications
  const feedItems = useMemo<FeedItem[]>(() => {
    const result: FeedItem[] = [];
    posts.forEach((post, i) => {
      result.push(post);
      if ((i + 1) % AD_FREQUENCY === 0) {
        result.push({ _ad: true, id: `ad-${i}` });
      }
    });
    return result;
  }, [posts]);

  // Écoute les posts Firestore en temps réel
  useEffect(() => {
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Post));
      setPosts(data);
      setLoadingPosts(false);
    });
    return () => unsub();
  }, []);

  const handleNewPost = useCallback(async (content: string, tag?: PostTag) => {
    if (!user) return;
    setShowModal(false);
    await addDoc(collection(db, 'posts'), {
      userId: user.id,
      username: user.username,
      avatar: user.avatar,
      avatarPhoto: user.photoBase64 ?? null,
      verified: user.verified ?? false,
      content,
      likedBy: [],
      comments: 0,
      createdAt: new Date().toISOString(),
      tag: tag ?? null,
    });
  }, [user]);

  const ListHeader = useCallback(() => (
    <View style={styles.listHeader}>
      <MatchBanner />
      {isAuthenticated && (
        <CreatePostBar
          onPress={() => setShowModal(true)}
          userAvatar={user?.avatar ?? '🦁'}
          userPhoto={user?.photoBase64}
        />
      )}
      <Divider />
      {loadingPosts && (
        <>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </>
      )}
    </View>
  ), [isAuthenticated, user, loadingPosts]);

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
        extraData={user?.photoBase64}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={<View style={{ height: 60 }} />}
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
        />
      )}
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
    backgroundColor: '#FF3B3B',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
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
  },
  createAvatarEmoji: {
    fontSize: 17,
  },
  createAvatarImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  createText: {
    flex: 1,
    color: Colors.textMuted,
    fontSize: 14,
  },
  createDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
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
});
