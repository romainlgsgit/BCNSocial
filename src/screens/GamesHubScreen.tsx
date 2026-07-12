import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, FontSize, BorderRadius, Spacing } from '../theme';
import { useAuth } from '../context/AuthContext';

const GAMES = [
  {
    key: 'Pronostics',
    title: 'Pronos',
    desc: 'Prédit les résultats des matchs et gagne des pièces',
    icon: 'trophy' as const,
    gradient: ['#004D98', '#002D5A'] as const,
    accent: Colors.secondary,
    badge: '🪙',
  },
  {
    key: 'Quiz',
    title: 'Quiz Barça',
    desc: 'Teste tes connaissances sur l\'histoire du FC Barcelona',
    icon: 'bulb' as const,
    gradient: ['#1a1a00', '#2d2600'] as const,
    accent: Colors.gold,
    badge: '🧠',
  },
];

export default function GamesHubScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      <LinearGradient colors={['#111', '#0A0A0A']} style={styles.header}>
        <Ionicons name="game-controller" size={28} color={Colors.primary} />
        <Text style={styles.title}>Games</Text>
        <Text style={styles.subtitle}>Joue et gagne des pièces</Text>
      </LinearGradient>

      {user && (
        <View style={styles.coinsRow}>
          <Ionicons name="wallet-outline" size={16} color={Colors.gold} />
          <Text style={styles.coinsText}>
            <Text style={styles.coinsValue}>{user.coins ?? 0}</Text>  pièces disponibles
          </Text>
        </View>
      )}

      <View style={styles.cards}>
        {GAMES.map(game => (
          <TouchableOpacity
            key={game.key}
            style={styles.card}
            onPress={() => navigation.navigate(game.key)}
            activeOpacity={0.85}
          >
            <LinearGradient colors={game.gradient as any} style={styles.cardGradient}>
              <View style={[styles.iconCircle, { borderColor: game.accent + '50', backgroundColor: game.accent + '15' }]}>
                <Ionicons name={game.icon} size={32} color={game.accent} />
              </View>

              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{game.title}</Text>
                <Text style={styles.cardDesc}>{game.desc}</Text>
              </View>

              <View style={[styles.arrowCircle, { backgroundColor: game.accent + '20' }]}>
                <Ionicons name="arrow-forward" size={18} color={game.accent} />
              </View>
            </LinearGradient>
          </TouchableOpacity>
        ))}
      </View>
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
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    marginTop: 8,
    marginBottom: 4,
  },
  coinsText: { color: Colors.textSecondary, fontSize: 13 },
  coinsValue: { color: Colors.gold, fontWeight: '800' },

  cards: { flex: 1, justifyContent: 'center', paddingHorizontal: 16, gap: 14 },

  card: { borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: '#222' },
  cardGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 16,
  },

  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },

  cardBody: { flex: 1, gap: 4 },
  cardTitle: { color: Colors.text, fontSize: 20, fontWeight: '800' },
  cardDesc: { color: Colors.textMuted, fontSize: 13, lineHeight: 18 },

  arrowCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
