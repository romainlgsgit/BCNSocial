import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Image,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';
import { Match, Team } from '../types';
import { useFeaturedMatch } from '../context/MatchContext';

const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

function apiToMatch(m: any): Match {
  return {
    id: String(m.id),
    homeTeam: { name: m.homeTeam.name, shortName: m.homeTeam.tla, logo: m.homeTeam.crest ?? '', color: '#333' },
    awayTeam: { name: m.awayTeam.name, shortName: m.awayTeam.tla, logo: m.awayTeam.crest ?? '', color: '#333' },
    date: m.utcDate,
    competition: m.competition?.name ?? '',
    venue: '',
    homeScore: m.score?.fullTime?.home ?? undefined,
    awayScore: m.score?.fullTime?.away ?? undefined,
    status: 'upcoming' as const,
  };
}

function isBarca(team: Team) {
  return team.name.toLowerCase().includes('barcelona');
}

function formatDay(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
}

function getResult(match: Match): { label: string; color: string } | null {
  if (match.status !== 'finished') return null;
  const home = isBarca(match.homeTeam);
  const b = home ? match.homeScore! : match.awayScore!;
  const o = home ? match.awayScore! : match.homeScore!;
  if (b > o) return { label: 'V', color: '#22C55E' };
  if (b === o) return { label: 'N', color: '#EAB308' };
  return { label: 'D', color: '#EF4444' };
}

function TeamLogo({ team }: { team: Team }) {
  const isImg = team.logo.startsWith('http') || team.logo.startsWith('file://');
  return (
    <View style={styles.teamCol}>
      {isImg ? (
        <Image source={{ uri: team.logo }} style={styles.logo} resizeMode="contain" />
      ) : (
        <View style={[styles.logo, { backgroundColor: team.color ?? '#333', borderRadius: 4, alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={{ color: '#fff', fontSize: 9, fontWeight: '900' }}>{team.shortName}</Text>
        </View>
      )}
      <Text style={styles.teamName}>{team.shortName}</Text>
    </View>
  );
}

function MatchCard({ match }: { match: Match }) {
  const result = getResult(match);

  return (
    <View style={styles.card}>
      <View style={[
        styles.cardAccent,
        match.status === 'live' && { backgroundColor: '#EF4444' },
        match.status === 'finished' && result && { backgroundColor: result.color },
        match.status === 'upcoming' && { backgroundColor: Colors.primary },
      ]} />

      <View style={styles.cardContent}>
        <Text style={styles.cardCompetition}>{match.competition}</Text>

        <View style={styles.cardCenter}>
          {/* Équipe domicile (gauche) */}
          <TeamLogo team={match.homeTeam} />

          {/* Score / heure */}
          <View style={styles.scoreCol}>
            {match.status === 'finished' ? (
              <>
                <Text style={styles.score}>
                  {match.homeScore}
                  <Text style={styles.scoreSep}> — </Text>
                  {match.awayScore}
                </Text>
                {result && (
                  <View style={[styles.resultBadge, { backgroundColor: result.color + '22', borderColor: result.color }]}>
                    <Text style={[styles.resultBadgeText, { color: result.color }]}>
                      {result.label === 'V' ? 'Victoire' : result.label === 'N' ? 'Nul' : 'Défaite'}
                    </Text>
                  </View>
                )}
              </>
            ) : match.status === 'live' ? (
              <>
                <Text style={[styles.score, { color: '#EF4444' }]}>
                  {match.homeScore ?? 0} — {match.awayScore ?? 0}
                </Text>
                <View style={styles.livePill}>
                  <View style={styles.liveDot} />
                  <Text style={styles.livePillText}>LIVE</Text>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.matchTime}>{formatTime(match.date)}</Text>
                <Text style={styles.vsLabel}>VS</Text>
              </>
            )}
          </View>

          {/* Équipe extérieure (droite) */}
          <TeamLogo team={match.awayTeam} />
        </View>

        <Text style={styles.cardDate}>{formatDay(match.date)}</Text>
      </View>
    </View>
  );
}

export default function MatchesScreen() {
  const now = new Date();
  const { monthlyMatches, isLoadingMonthly, monthlyError, retryMonthly, liveData, apiMatchId } = useFeaturedMatch();

  // Pour le match en cours, injecter le score live (même source que la page d'accueil)
  const displayMatches = monthlyMatches.map(m => {
    if (m.id === apiMatchId && liveData) {
      const isLiveNow = liveData.status === 'IN_PLAY' || liveData.status === 'PAUSED';
      const isFinishedNow = liveData.status === 'FINISHED';
      return {
        ...m,
        homeScore: liveData.homeScore ?? m.homeScore,
        awayScore: liveData.awayScore ?? m.awayScore,
        status: isFinishedNow ? 'finished' as const : isLiveNow ? 'live' as const : m.status,
      };
    }
    return m;
  });

  const upcoming = displayMatches.filter(m => m.status !== 'finished');
  const finished = displayMatches
    .filter(m => m.status === 'finished')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      <LinearGradient colors={['#004D98', '#002D5A']} style={styles.header}>
        <Text style={styles.headerEmoji}>📅</Text>
        <Text style={styles.headerTitle}>Calendrier</Text>
        <Text style={styles.headerSub}>
          {MONTH_NAMES[now.getMonth()]} {now.getFullYear()}
        </Text>
      </LinearGradient>

      {isLoadingMonthly ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={styles.loadingText}>Chargement des matchs...</Text>
        </View>
      ) : monthlyError ? (
        <View style={styles.centered}>
          <Text style={{ fontSize: 40 }}>⚠️</Text>
          <Text style={styles.errorText}>Impossible de charger les matchs</Text>
          <TouchableOpacity onPress={retryMonthly} style={styles.retryBtn} activeOpacity={0.8}>
            <Text style={styles.retryText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
          {displayMatches.length === 0 && (
            <View style={styles.centered}>
              <Text style={{ fontSize: 40 }}>📭</Text>
              <Text style={styles.errorText}>Aucun match ce mois-ci</Text>
            </View>
          )}

          {upcoming.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>À venir</Text>
              {upcoming.map(m => <MatchCard key={m.id} match={m} />)}
            </>
          )}

          {finished.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Résultats</Text>
              {finished.map(m => <MatchCard key={m.id} match={m} />)}
            </>
          )}

          <View style={{ height: 80 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A0A' },

  header: {
    paddingTop: 56,
    paddingBottom: 14,
    alignItems: 'center',
    gap: 2,
  },
  headerEmoji: { fontSize: 24, marginBottom: 2 },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#fff', letterSpacing: 1 },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: '600', textTransform: 'capitalize' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 80 },
  loadingText: { color: Colors.textMuted, fontSize: FontSize.sm, marginTop: 8 },
  errorText: { color: Colors.textSecondary, fontSize: FontSize.sm, textAlign: 'center' },
  retryBtn: { marginTop: 8, backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 },
  retryText: { color: '#fff', fontWeight: '700', fontSize: FontSize.sm },

  list: { paddingHorizontal: 14, paddingTop: 14 },

  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 4,
  },

  card: {
    flexDirection: 'row',
    backgroundColor: '#141414',
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#222',
    overflow: 'hidden',
  },
  cardAccent: {
    width: 3,
    backgroundColor: Colors.primary,
  },
  cardContent: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 4,
    alignItems: 'center',
  },
  cardCompetition: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  cardCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 4,
  },
  teamCol: {
    alignItems: 'center',
    gap: 3,
    width: 52,
  },
  logo: {
    width: 32,
    height: 32,
  },
  teamName: {
    color: Colors.text,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  scoreCol: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  score: {
    fontSize: 20,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 1,
  },
  scoreSep: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 18,
    fontWeight: '300',
  },
  matchTime: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.gold,
  },
  vsLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.2)',
    letterSpacing: 2,
  },

  resultBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
    borderWidth: 1,
  },
  resultBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },

  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EF444422',
    borderWidth: 1,
    borderColor: '#EF4444',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },
  livePillText: {
    color: '#EF4444',
    fontSize: 9,
    fontWeight: '800',
  },

  cardDate: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.3)',
    fontWeight: '600',
    textTransform: 'capitalize',
  },
});
