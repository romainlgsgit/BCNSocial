import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, ScrollView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, FontSize, BorderRadius, Spacing } from '../theme';
import { useAuth } from '../context/AuthContext';
import { useGame, inviteMode } from '../context/GameContext';
import { useStore } from '../context/StoreContext';
import AddCoinsButton from '../components/AddCoinsButton';

type GameMode = 'football' | 'penalty';

// Jeu vedette : carte pleine largeur avec son visuel carré.
const FEATURED = {
  key: 'DraftFoot',
  title: 'Draft Foot 27',
  desc: 'Compose ton équipe de rêve et affronte les autres drafts',
  image: require('../../assets/draftfoot.png'),
  accent: '#7B4DFF',
};

const GAMES: {
  key: string; title: string; desc: string; icon: any;
  gradient: readonly [string, string]; accent: string; badge: string;
  mode: GameMode | null; // jeux 1v1 uniquement : porte le badge de défis reçus
}[] = [
  {
    key: 'Pronostics',
    title: 'Pronos',
    desc: 'Prédit les résultats des matchs et gagne des pièces',
    icon: 'trophy' as const,
    // Fond bleu Barça → l'accent doit être un bleu clair, sinon le trophée disparaît.
    gradient: ['#003A75', '#001F42'] as const,
    accent: '#6FB4FF',
    badge: '🪙',
    mode: null,
  },
  {
    key: 'Quiz',
    title: 'Quiz Barça',
    desc: 'Teste tes connaissances sur l\'histoire du FC Barcelona',
    icon: 'bulb' as const,
    gradient: ['#1a1a00', '#2d2600'] as const,
    accent: Colors.gold,
    badge: '🧠',
    mode: null,
  },
  {
    key: 'Shootout',
    title: 'Football 1v1',
    desc: 'Défie un ami ou un adversaire au hasard, 1er à 5 buts gagne 100 pièces',
    icon: 'football' as const,
    gradient: ['#1a0000', '#2d0000'] as const,
    accent: Colors.primary,
    badge: '⚽',
    mode: 'football' as const,
  },
  {
    key: 'Penalty',
    title: 'Tirs au But 1v1',
    desc: '5 tireurs, 1 gardien : vise une case, le gardien plonge — 100 pièces au vainqueur',
    icon: 'hand-left' as const,
    gradient: ['#00131a', '#002733'] as const,
    accent: '#4FD1E0',
    badge: '🥅',
    mode: 'penalty' as const,
  },
];

export default function GamesHubScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { pendingInvites } = useGame();
  const { openStore } = useStore();

  // Les défis des deux jeux 1v1 arrivent dans le même flux → un badge par jeu.
  const inviteCounts = useMemo(() => {
    const counts = { football: 0, penalty: 0 };
    for (const inv of pendingInvites) counts[inviteMode(inv)]++;
    return counts;
  }, [pendingInvites]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      <LinearGradient colors={['#111', '#0A0A0A']} style={styles.header}>
        <Ionicons name="game-controller" size={28} color={Colors.primary} />
        <Text style={styles.title}>Games</Text>
        <Text style={styles.subtitle}>Joue et gagne des pièces</Text>
      </LinearGradient>

      {user && (
        <TouchableOpacity style={styles.coinsRow} onPress={() => openStore()} activeOpacity={0.8}>
          <Ionicons name="wallet-outline" size={16} color={Colors.gold} />
          <Text style={styles.coinsText}>
            <Text style={styles.coinsValue}>{user.coins ?? 0}</Text>  pièces disponibles
          </Text>
          <AddCoinsButton size={20} />
        </TouchableOpacity>
      )}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={[styles.featuredCard, { borderColor: FEATURED.accent + '55' }]}
          onPress={() => navigation.navigate(FEATURED.key)}
          activeOpacity={0.9}
        >
          <Image source={FEATURED.image} style={styles.featuredImage} resizeMode="cover" />

          {/* Voile sombre en bas pour garder le texte lisible sur le visuel. */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.92)']}
            style={styles.featuredOverlay}
          >
            <View style={styles.featuredBody}>
              <View style={styles.featuredTag}>
                <Ionicons name="time-outline" size={12} color={FEATURED.accent} />
                <Text style={[styles.featuredTagText, { color: FEATURED.accent }]}>PROCHAINEMENT</Text>
              </View>
              <Text style={styles.featuredTitle}>{FEATURED.title}</Text>
              <Text style={styles.featuredDesc}>{FEATURED.desc}</Text>
            </View>

            <View style={[styles.playCircle, { backgroundColor: FEATURED.accent }]}>
              <Ionicons name="play" size={20} color="#fff" />
            </View>
          </LinearGradient>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Autres jeux</Text>

        <View style={styles.grid}>
          {GAMES.map(game => (
            <TouchableOpacity
              key={game.key}
              style={styles.tile}
              onPress={() => navigation.navigate(game.key)}
              activeOpacity={0.85}
            >
              <LinearGradient colors={game.gradient as any} style={styles.tileGradient}>
                <View style={[styles.iconCircle, { borderColor: game.accent + '50', backgroundColor: game.accent + '15' }]}>
                  <Ionicons name={game.icon} size={26} color={game.accent} />
                </View>

                <Text style={styles.tileTitle} numberOfLines={1}>{game.title}</Text>
                <Text style={styles.tileBadge}>{game.badge}</Text>

                {game.mode && inviteCounts[game.mode] > 0 && (
                  <View style={styles.notifBadge}>
                    <Text style={styles.notifBadgeText}>{inviteCounts[game.mode]}</Text>
                  </View>
                )}
              </LinearGradient>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A0A' },

  header: {
    paddingTop: 60,
    paddingBottom: 20,
    alignItems: 'center',
    gap: 6,
  },
  title: { fontSize: 26, fontWeight: '900', color: Colors.text, letterSpacing: 0.5 },
  subtitle: { fontSize: 13, color: Colors.textMuted, fontWeight: '500' },

  coinsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    backgroundColor: Colors.gold + '12',
    borderWidth: 1,
    borderColor: Colors.gold + '30',
    paddingLeft: 16,
    // Moins d'air à droite : la pastille « + » apporte déjà sa propre masse visuelle.
    paddingRight: 8,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    marginTop: 8,
    marginBottom: 4,
  },
  coinsText: { color: Colors.textSecondary, fontSize: 13 },
  coinsValue: { color: Colors.gold, fontWeight: '800' },

  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 28, gap: 18 },

  // --- Jeu vedette ---
  featuredCard: {
    aspectRatio: 1,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    backgroundColor: '#12081F',
  },
  featuredImage: { width: '100%', height: '100%' },
  featuredOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    padding: 18,
  },
  featuredBody: { flex: 1, gap: 5 },
  featuredTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  featuredTagText: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  featuredTitle: { color: Colors.text, fontSize: 24, fontWeight: '900' },
  featuredDesc: { color: Colors.textSecondary, fontSize: 13, lineHeight: 18 },

  playCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // --- Grille des autres jeux ---
  sectionTitle: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: -6,
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    // Deux colonnes : (100% - gap) / 2
    width: '48.3%',
    aspectRatio: 1,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#222',
  },
  tileGradient: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 12 },

  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },

  tileTitle: { color: Colors.text, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  tileBadge: { position: 'absolute', top: 8, left: 10, fontSize: 14 },

  notifBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderWidth: 1.5,
    borderColor: '#0A0A0A',
  },
  notifBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
});
