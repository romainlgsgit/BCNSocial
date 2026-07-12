import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { collection, query, where, onSnapshot, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';
import { useAuth } from '../context/AuthContext';
import { Post, Match } from '../types';
import PostCard from '../components/PostCard';
import VerifiedBadge from '../components/VerifiedBadge';
import { useFollow } from '../context/FollowContext';
import { useRatings } from '../context/RatingsContext';
import { useFeaturedMatch } from '../context/MatchContext';
import { PLAYERS, MATCHES } from '../data/mockData';
import { getRatingColor } from '../components/VotingWidget';
import { getLevelInfo } from '../utils/levels';
import { usePremium } from '../context/PremiumContext';

type Tab = 'login' | 'register';
type ProfileTabType = 'publications' | 'pronos' | 'notes';

function ForgotPasswordModal({ visible, initialIdentifier, onClose }: { visible: boolean; initialIdentifier: string; onClose: () => void }) {
  const { resetPassword } = useAuth();
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setIdentifier(initialIdentifier);
      setSent(false);
      setError('');
    }
  }, [visible, initialIdentifier]);

  const handleSend = async () => {
    if (!identifier.trim()) {
      setError('Renseigne ton email ou ton pseudo.');
      return;
    }
    setError('');
    setSending(true);
    const success = await resetPassword(identifier);
    setSending(false);
    if (success) setSent(true);
    else setError('Impossible d\'envoyer le lien. Vérifie ton pseudo/email.');
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.forgotOverlay}>
        <View style={styles.forgotCard}>
          <View style={styles.forgotHeader}>
            <Text style={styles.forgotTitle}>Mot de passe oublié</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {sent ? (
            <View style={styles.forgotSentBox}>
              <Ionicons name="checkmark-circle" size={40} color={Colors.success} />
              <Text style={styles.forgotSentText}>
                Si un compte existe pour « {identifier.trim()} », un email de réinitialisation vient d'être envoyé.
              </Text>
              <TouchableOpacity style={styles.submitBtn} onPress={onClose} activeOpacity={0.85}>
                <Text style={styles.submitBtnText}>OK</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.forgotSub}>
                Entre ton email ou ton pseudo, on t'envoie un lien pour réinitialiser ton mot de passe.
              </Text>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email ou pseudo</Text>
                <TextInput
                  style={styles.input}
                  placeholder="email@exemple.com ou ton_pseudo"
                  placeholderTextColor={Colors.textMuted}
                  value={identifier}
                  onChangeText={setIdentifier}
                  autoCapitalize="none"
                />
              </View>

              {error !== '' && (
                <View style={styles.errorBox}>
                  <Ionicons name="warning-outline" size={15} color={Colors.error} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleSend}
                disabled={sending}
                activeOpacity={0.85}
              >
                {sending ? (
                  <ActivityIndicator color={Colors.text} />
                ) : (
                  <Text style={styles.submitBtnText}>Envoyer le lien</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function AuthForm() {
  const { login, register, isLoading } = useAuth();
  const [tab, setTab] = useState<Tab>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [forgotVisible, setForgotVisible] = useState(false);

  const handleSubmit = async () => {
    setError('');
    if (!email || !password) {
      setError('Remplis tous les champs.');
      return;
    }
    if (tab === 'register' && !username) {
      setError('Choisis un pseudo.');
      return;
    }

    let success: boolean;
    if (tab === 'login') {
      success = await login(email, password);
      if (!success) setError('Identifiants incorrects.');
    } else {
      success = await register(username, email, password);
      if (!success) setError('Erreur lors de l\'inscription.');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.authContainer}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={[Colors.primary, '#6B0030']}
          style={styles.authHeader}
        >
          <View style={styles.authHeaderIcon}>
            <Ionicons name="football" size={32} color="#fff" />
          </View>
          <Text style={styles.authHeaderTitle}>
            {tab === 'login' ? 'Bon retour !' : 'Rejoins la Culer Nation !'}
          </Text>
          <Text style={styles.authHeaderSub}>
            {tab === 'login'
              ? 'Connecte-toi pour accéder à ton compte'
              : '200 pièces offertes à l\'inscription 🪙'}
          </Text>
        </LinearGradient>

        {/* Tabs */}
        <View style={styles.tabRow}>
          {(['login', 'register'] as Tab[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
              onPress={() => { setTab(t); setError(''); }}
            >
              <Text style={[styles.tabBtnText, tab === t && styles.tabBtnTextActive]}>
                {t === 'login' ? 'Connexion' : 'Inscription'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.formContainer}>
          {tab === 'register' && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Pseudo</Text>
              <TextInput
                style={styles.input}
                placeholder="ton_pseudo"
                placeholderTextColor={Colors.textMuted}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
              />
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{tab === 'login' ? 'Email ou pseudo' : 'Email'}</Text>
            <TextInput
              style={styles.input}
              placeholder={tab === 'login' ? 'email ou pseudo' : 'email@exemple.com'}
              placeholderTextColor={Colors.textMuted}
              value={email}
              onChangeText={setEmail}
              keyboardType={tab === 'login' ? 'default' : 'email-address'}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Mot de passe</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={Colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          {tab === 'login' && (
            <TouchableOpacity onPress={() => setForgotVisible(true)} style={styles.forgotLink}>
              <Text style={styles.forgotLinkText}>Mot de passe oublié ?</Text>
            </TouchableOpacity>
          )}

          {error !== '' && (
            <View style={styles.errorBox}>
              <Ionicons name="warning-outline" size={15} color={Colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.submitBtn}
            onPress={handleSubmit}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            {isLoading ? (
              <ActivityIndicator color={Colors.text} />
            ) : (
              <Text style={styles.submitBtnText}>
                {tab === 'login' ? 'Se connecter' : 'Créer mon compte'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      <ForgotPasswordModal
        visible={forgotVisible}
        initialIdentifier={email}
        onClose={() => setForgotVisible(false)}
      />
    </KeyboardAvoidingView>
  );
}

const PROFILE_TABS: { key: ProfileTabType; label: string; icon: any; iconOutline: any }[] = [
  { key: 'publications', label: 'Posts',  icon: 'chatbubble-ellipses',   iconOutline: 'chatbubble-ellipses-outline' },
  { key: 'pronos',       label: 'Pronos', icon: 'trophy',                iconOutline: 'trophy-outline' },
  { key: 'notes',        label: 'Notes',  icon: 'star',                  iconOutline: 'star-outline' },
];

function ProfileDashboard() {
  const { user, logout, deleteAccount, isAdmin, updatePhoto } = useAuth();
  const { isPremium, openPremiumScreen } = usePremium();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [myPosts, setMyPosts] = useState<Post[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [profileTab, setProfileTab] = useState<ProfileTabType>('publications');
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);
  const { playerStats, matchStats, myMatchRatings, myPlayerRatings } = useRatings();
  const { myFollowersCount, myFollowingCount } = useFollow();
  const { monthlyMatches } = useFeaturedMatch();

  const allMatches = useMemo(() => [...MATCHES, ...monthlyMatches], [monthlyMatches]);

  const ratedMatchesData = useMemo(() =>
    allMatches
      .filter(m => myMatchRatings[m.id] !== undefined)
      .map(m => ({ match: m, rating: myMatchRatings[m.id] })),
    [myMatchRatings, allMatches]
  );

  const ratedPlayersData = useMemo(() =>
    PLAYERS
      .map(player => {
        const matchHistory = allMatches
          .map(match => {
            const rating = myPlayerRatings[`${match.id}_${player.id}`];
            return rating !== undefined ? { match, rating } : null;
          })
          .filter((r): r is { match: Match; rating: number } => r !== null);
        return matchHistory.length > 0 ? { player, matchHistory } : null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null),
    [myPlayerRatings, allMatches]
  );

  const [betsMap, setBetsMap] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!user) { setBetsMap({}); return; }
    return onSnapshot(doc(db, 'bets', user.id), (snap) => {
      setBetsMap(snap.exists() ? (snap.data() as Record<string, any>) : {});
    });
  }, [user?.id]);

  const handlePickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission requise', 'Autorise l\'accès à ta galerie dans les réglages.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploadingPhoto(true);
    try {
      // Redimensionner à 200x200 et compresser — résultat ~15KB en base64
      const manipulated = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 200, height: 200 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      await updatePhoto(manipulated.base64!);
    } catch (e) {
      Alert.alert('Erreur', 'Impossible de mettre à jour la photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'posts'),
      where('userId', '==', user.id)
    );
    const unsub = onSnapshot(q, (snap) => {
      const posts = snap.docs.map(d => ({ id: d.id, ...d.data() } as Post));
      posts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setMyPosts(posts);
    });
    return () => unsub();
  }, [user?.id]);

  const handleDeletePost = (postId: string) => {
    Alert.alert('Supprimer', 'Supprimer cette publication ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => deleteDoc(doc(db, 'posts', postId)),
      },
    ]);
  };

  if (!user) return null;

  const renderBet = ([matchId, bet]: [string, any]) => {
    const match = allMatches.find(m => m.id === matchId);
    const predLabel = bet.prediction === 'home' ? 'Domicile' : bet.prediction === 'draw' ? 'Nul' : 'Extérieur';
    const isWon = bet.result === 'won';
    const isLost = bet.result === 'lost';
    const resultColor = isWon ? Colors.win : isLost ? Colors.loss : Colors.textMuted;
    const resultLabel = isWon ? `+${bet.wonAmount} 🪙` : isLost ? '0 🪙' : null;
    return (
      <View key={matchId} style={styles.pronoRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.pronoMatch}>
            {match ? `${match.homeTeam.shortName} – ${match.awayTeam.shortName}` : `Match #${matchId}`}
          </Text>
          <Text style={styles.pronoMeta}>{predLabel} · Misé : {bet.coins} 🪙</Text>
        </View>
        {bet.result === undefined ? (
          <View style={styles.pronoBadgePending}>
            <Ionicons name="time-outline" size={12} color={Colors.textMuted} />
            <Text style={styles.pronoBadgePendingText}>En attente</Text>
          </View>
        ) : (
          <View style={[styles.pronoBadgeResult, { borderColor: resultColor + '55', backgroundColor: resultColor + '18' }]}>
            <Ionicons name={isWon ? 'checkmark-circle' : 'close-circle'} size={13} color={resultColor} />
            <Text style={[styles.pronoBadgeResultText, { color: resultColor }]}>
              {isWon ? 'Gagné' : 'Perdu'}
            </Text>
            {resultLabel && <Text style={[styles.pronoBadgeAmount, { color: resultColor }]}>{resultLabel}</Text>}
          </View>
        )}
      </View>
    );
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} stickyHeaderIndices={[1]}>

      {/* ── Header ── */}
      <LinearGradient
        colors={['#6B0030', Colors.primary, '#1A0010', Colors.background]}
        locations={[0, 0.25, 0.65, 1]}
        style={styles.profileHeader}
      >
        {/* Bouton Réglages */}
        <TouchableOpacity
          style={[styles.settingsBtn, { top: insets.top + 10 }]}
          onPress={() => navigation.navigate('Settings')}
          activeOpacity={0.8}
        >
          <Ionicons name="settings-outline" size={20} color="rgba(255,255,255,0.85)" />
        </TouchableOpacity>

        {/* Avatar éditable */}
        <TouchableOpacity onPress={handlePickPhoto} activeOpacity={0.8} style={styles.avatarWrapper}>
          <View style={styles.avatarRing}>
            {user.photoBase64 ? (
              <Image source={{ uri: `data:image/jpeg;base64,${user.photoBase64}` }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarInner}>
                <Text style={styles.avatarText}>{user.avatar}</Text>
              </View>
            )}
          </View>
          <View style={styles.avatarEditBadge}>
            {uploadingPhoto
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="camera" size={14} color="#fff" />
            }
          </View>
        </TouchableOpacity>

        {/* Nom + badge */}
        <View style={styles.profileUsernameRow}>
          <Text style={styles.profileUsername}>{user.username}</Text>
          {user.verified && isPremium && <VerifiedBadge size={20} />}
        </View>
        <Text style={styles.profileEmail}>{user.email}</Text>

        {/* Pièces */}
        <View style={styles.coinsPill}>
          <Ionicons name="wallet" size={16} color={Colors.gold} />
          <Text style={styles.coinsValue}>{user.coins ?? 0}</Text>
          <Text style={styles.coinsLabel}>pièces</Text>
        </View>

        {/* Compteurs */}
        <View style={styles.countsContainer}>
          <View style={styles.countItem}>
            <Text style={styles.countValue}>{myFollowersCount}</Text>
            <Text style={styles.countLabel}>Abonnés</Text>
          </View>
          <View style={styles.countSep} />
          <View style={styles.countItem}>
            <Text style={styles.countValue}>{myFollowingCount}</Text>
            <Text style={styles.countLabel}>Abonnements</Text>
          </View>
          <View style={styles.countSep} />
          <View style={styles.countItem}>
            <Text style={styles.countValue}>{myPosts.length}</Text>
            <Text style={styles.countLabel}>Posts</Text>
          </View>
        </View>

        {/* Premium / Admin */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {!isPremium && (
            <TouchableOpacity style={styles.premiumBtn} onPress={openPremiumScreen} activeOpacity={0.85}>
              <Ionicons name="diamond" size={13} color={Colors.gold} />
              <Text style={styles.premiumBtnText}>Passer Premium</Text>
            </TouchableOpacity>
          )}
          {isPremium && (
            <TouchableOpacity style={styles.premiumActiveBadge} onPress={openPremiumScreen} activeOpacity={0.85}>
              <Ionicons name="diamond" size={13} color={Colors.gold} />
              <Text style={styles.premiumActiveBadgeText}>Premium actif ✨</Text>
            </TouchableOpacity>
          )}
          {isAdmin && (
            <TouchableOpacity style={styles.adminBtn} onPress={() => navigation.navigate('Admin')} activeOpacity={0.8}>
              <Ionicons name="shield-checkmark-outline" size={13} color="#60A5FA" />
              <Text style={styles.adminBtnText}>Admin</Text>
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>

      {/* ── Tab bar (sticky) ── */}
      <View style={styles.tabBarWrap}>
        <View style={styles.profileTabRow}>
          {PROFILE_TABS.map(t => {
            const active = profileTab === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                style={[styles.profileTabBtn, active && styles.profileTabBtnActive]}
                onPress={() => setProfileTab(t.key)}
                activeOpacity={0.75}
              >
                <Ionicons name={active ? t.icon : t.iconOutline} size={15} color={active ? '#fff' : Colors.textSecondary} />
                <Text style={[styles.profileTabText, active && styles.profileTabTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── Contenu ── */}
      <View style={styles.content}>

        {/* Publications */}
        {profileTab === 'publications' && (
          <View style={{ marginHorizontal: -Spacing.md }}>
            {myPosts.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="chatbubble-ellipses-outline" size={36} color={Colors.textMuted} />
                <Text style={styles.emptyText}>Tu n'as pas encore publié.{'\n'}Va dans l'onglet Accueil !</Text>
              </View>
            ) : (
              myPosts.map(p => <PostCard key={p.id} post={p} onDelete={() => handleDeletePost(p.id)} />)
            )}
          </View>
        )}

        {/* Pronos */}
        {profileTab === 'pronos' && (() => {
          const settled = Object.entries(betsMap)
            .filter(([, b]) => b.result !== undefined)
            .sort(([, a], [, b]) => (b.settledAt ?? 0) - (a.settledAt ?? 0));
          if (Object.keys(betsMap).length === 0) return (
            <View style={styles.emptyBox}>
              <Ionicons name="trophy-outline" size={36} color={Colors.textMuted} />
              <Text style={styles.emptyText}>Tu n'as pas encore fait de pronostic.</Text>
            </View>
          );
          return settled.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="trophy-outline" size={36} color={Colors.textMuted} />
              <Text style={styles.emptyText}>Aucun pari terminé pour l'instant.</Text>
            </View>
          ) : (
            <>
              <View style={styles.notesSubtitleRow}>
                <Ionicons name="receipt-outline" size={13} color={Colors.textSecondary} />
                <Text style={styles.notesSubtitle}>Derniers paris</Text>
              </View>
              {settled.map(renderBet)}
            </>
          );
        })()}

        {/* Notes */}
        {profileTab === 'notes' && (
          ratedMatchesData.length === 0 && ratedPlayersData.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="star-outline" size={36} color={Colors.textMuted} />
              <Text style={styles.emptyText}>Tu n'as pas encore noté de match.</Text>
            </View>
          ) : (
            <>
              {ratedMatchesData.length > 0 && (
                <>
                  <View style={styles.notesSubtitleRow}>
                    <Ionicons name="football-outline" size={13} color={Colors.textSecondary} />
                    <Text style={styles.notesSubtitle}>Matchs notés</Text>
                  </View>
                  {ratedMatchesData.map(({ match, rating }) => {
                    const color = getRatingColor(rating);
                    const communityAvg = matchStats[match.id];
                    return (
                      <View key={match.id} style={styles.noteMatchRow}>
                        <View style={styles.noteMatchInfo}>
                          <Text style={styles.noteMatchTeams}>
                            {match.homeTeam.shortName} {match.homeScore ?? '-'}–{match.awayScore ?? '-'} {match.awayTeam.shortName}
                          </Text>
                          <Text style={styles.noteMatchMeta}>
                            {match.competition}
                            {communityAvg?.totalVotes > 0 ? `  ·  Moy. com. ${communityAvg.averageRating.toFixed(1)}` : ''}
                          </Text>
                        </View>
                        <View style={[styles.noteBadge, { backgroundColor: color + '20', borderColor: color + '60' }]}>
                          <Text style={[styles.noteBadgeText, { color }]}>{rating}/10</Text>
                        </View>
                      </View>
                    );
                  })}
                </>
              )}
              {ratedPlayersData.length > 0 && (
                <>
                  <View style={[styles.notesSubtitleRow, { marginTop: ratedMatchesData.length > 0 ? 16 : 0 }]}>
                    <Ionicons name="person-outline" size={13} color={Colors.textSecondary} />
                    <Text style={styles.notesSubtitle}>Joueurs notés</Text>
                  </View>
                  {ratedPlayersData.map(({ player, matchHistory }) => {
                    const isExpanded = expandedPlayer === player.id;
                    const communityStats = playerStats[player.id];
                    const communityAvg = communityStats?.totalVotes > 0 ? communityStats.averageRating : null;
                    return (
                      <View key={player.id} style={styles.notePlayerCard}>
                        <TouchableOpacity
                          style={styles.notePlayerRow}
                          onPress={() => setExpandedPlayer(isExpanded ? null : player.id)}
                          activeOpacity={0.75}
                        >
                          <Text style={styles.notePlayerEmoji}>{player.photo}</Text>
                          <View style={styles.notePlayerInfo}>
                            <Text style={styles.notePlayerName}>{player.name}</Text>
                            {communityAvg !== null && (
                              <Text style={styles.notePlayerCommunity}>
                                Moy. communauté: {communityAvg.toFixed(1)}
                              </Text>
                            )}
                          </View>
                          <View style={styles.notePlayerRight}>
                            <Text style={styles.notePlayerCount}>{matchHistory.length} match{matchHistory.length > 1 ? 's' : ''}</Text>
                            <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={13} color={Colors.textMuted} />
                          </View>
                        </TouchableOpacity>
                        {isExpanded && matchHistory.map(({ match, rating }) => {
                          const color = getRatingColor(rating);
                          return (
                            <View key={match.id} style={styles.noteMatchHistoryRow}>
                              <View style={styles.noteMatchHistoryInfo}>
                                <Text style={styles.noteMatchHistoryTeams}>
                                  {match.homeTeam.shortName} {match.homeScore ?? '-'}–{match.awayScore ?? '-'} {match.awayTeam.shortName}
                                </Text>
                                <Text style={styles.noteMatchHistoryMeta}>{match.competition}</Text>
                              </View>
                              <View style={[styles.noteBadge, { backgroundColor: color + '20', borderColor: color + '60' }]}>
                                <Text style={[styles.noteBadgeText, { color }]}>{rating}/10</Text>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    );
                  })}
                </>
              )}
            </>
          )
        )}

        <View style={{ height: Spacing.xxl }} />
      </View>
    </ScrollView>
  );
}

export default function ProfileScreen() {
  const { isAuthenticated } = useAuth();

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      {!isAuthenticated && (
        <View style={styles.guestHeader}>
          <View style={styles.guestHeaderRow}>
            <Ionicons name="person" size={22} color={Colors.text} />
            <Text style={styles.guestHeaderTitle}>Profil</Text>
          </View>
        </View>
      )}
      {isAuthenticated ? <ProfileDashboard /> : <AuthForm />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  guestHeader: {
    paddingTop: 60,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  guestHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  guestHeaderTitle: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.text,
  },
  // Auth
  authContainer: {
    flex: 1,
  },
  authHeader: {
    paddingTop: 60,
    paddingBottom: Spacing.xl,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
  },
  authHeaderIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  authHeaderTitle: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
  },
  authHeaderSub: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.7)',
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
  tabRow: {
    flexDirection: 'row',
    margin: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: Colors.primary,
  },
  tabBtnText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  tabBtnTextActive: {
    color: Colors.text,
    fontWeight: '700',
  },
  formContainer: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
  },
  inputGroup: {
    gap: Spacing.xs,
  },
  inputLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    color: Colors.text,
    fontSize: FontSize.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#3A0000',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.error,
  },
  errorText: {
    flex: 1,
    color: Colors.error,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  submitBtnText: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: '800',
  },
  forgotLink: {
    alignSelf: 'flex-end',
  },
  forgotLinkText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  forgotOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: Spacing.md,
  },
  forgotCard: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.md,
  },
  forgotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  forgotTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
  },
  forgotSub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  forgotSentBox: {
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  forgotSentText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  // Profile
  profileHeader: {
    paddingTop: 64,
    paddingBottom: Spacing.xl,
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    gap: 10,
  },
  avatarWrapper: { position: 'relative' },
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
  avatarInner: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  avatarImage: { width: 92, height: 92, borderRadius: 46 },
  avatarText: { fontSize: 46 },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.background,
  },
  profileUsernameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  profileUsername: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text },
  profileEmail: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.45)', fontWeight: '500' },

  coinsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(237,187,0,0.15)',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(237,187,0,0.4)',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  coinsValue: { fontSize: 18, fontWeight: '900', color: Colors.gold },
  coinsLabel: { fontSize: 13, color: 'rgba(237,187,0,0.7)', fontWeight: '600' },

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

  premiumBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(237,187,0,0.15)',
    borderRadius: BorderRadius.full,
    paddingVertical: 8, paddingHorizontal: 16,
    borderWidth: 1, borderColor: 'rgba(237,187,0,0.5)',
  },
  premiumBtnText: { color: Colors.gold, fontWeight: '800', fontSize: FontSize.sm },
  premiumActiveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(237,187,0,0.1)',
    borderRadius: BorderRadius.full,
    paddingVertical: 8, paddingHorizontal: 16,
    borderWidth: 1, borderColor: 'rgba(237,187,0,0.3)',
  },
  premiumActiveBadgeText: { color: Colors.gold, fontWeight: '700', fontSize: FontSize.sm },
  adminBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,77,152,0.4)',
    borderRadius: BorderRadius.full,
    paddingVertical: 8, paddingHorizontal: 14,
    borderWidth: 1, borderColor: '#004D98',
  },
  adminBtnText: { color: '#60A5FA', fontWeight: '700', fontSize: FontSize.sm },
  liveNotifBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: BorderRadius.full,
    paddingVertical: 8, paddingHorizontal: 14,
    borderWidth: 1, borderColor: '#333',
  },
  liveNotifBtnActive: {
    backgroundColor: 'rgba(237,187,0,0.12)',
    borderColor: 'rgba(237,187,0,0.4)',
  },
  liveNotifBtnText: { color: Colors.textMuted, fontWeight: '700', fontSize: FontSize.sm },
  liveNotifBtnTextActive: { color: Colors.gold },

  tabBarWrap: {
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  content: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },
  emptyBox: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: BorderRadius.md,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginTop: Spacing.sm,
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
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
  pronoMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  pronoBadgePending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  pronoBadgePendingText: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
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
  pronoMatch: {
    color: Colors.text,
    fontWeight: '600',
    fontSize: FontSize.sm,
  },
  pronoScore: {
    color: Colors.gold,
    fontWeight: '700',
    fontSize: FontSize.sm,
  },
  settingsBtn: {
    position: 'absolute',
    top: 16, // overridé dynamiquement avec insets.top
    right: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    zIndex: 10,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(244,67,54,0.4)',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    backgroundColor: 'rgba(244,67,54,0.06)',
    marginTop: Spacing.xl,
  },
  logoutText: { color: Colors.error, fontWeight: '700', fontSize: FontSize.md },
  deleteAccountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  deleteAccountText: { color: '#555', fontWeight: '600', fontSize: FontSize.sm },

  // Profile tabs — glass (sticky)
  profileTabRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 18,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 4,
  },
  profileTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 14,
    gap: 5,
  },
  profileTabBtnActive: {
    backgroundColor: 'rgba(165,0,68,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(165,0,68,0.65)',
  },
  profileTabText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  profileTabTextActive: { color: '#fff', fontWeight: '700' },

  // Notes section
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
  noteMatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    gap: Spacing.sm,
  },
  noteMatchInfo: { flex: 1 },
  noteMatchTeams: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  noteMatchMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  noteBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  noteBadgeText: {
    fontSize: 13,
    fontWeight: '800',
  },
  notePlayerCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  notePlayerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: 10,
  },
  notePlayerEmoji: { fontSize: 24, width: 32, textAlign: 'center' },
  notePlayerInfo: { flex: 1 },
  notePlayerName: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  notePlayerCommunity: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  notePlayerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notePlayerCount: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '600' },
  noteChevron: { fontSize: 10, color: Colors.textMuted },
  noteMatchHistoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
    gap: Spacing.sm,
  },
  noteMatchHistoryInfo: { flex: 1 },
  noteMatchHistoryTeams: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.text },
  noteMatchHistoryMeta: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
});
