import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Match } from '../types';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';

function isImageUri(logo?: string) {
  if (!logo) return false;
  return logo.startsWith('file://') || logo.startsWith('http') || logo.startsWith('data:');
}

interface Props {
  match: Match;
  onPress?: () => void;
  compact?: boolean;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function getResultColor(match: Match): string {
  if (match.status !== 'finished') return Colors.textSecondary;
  const isHome = match.homeTeam.name === 'FC Barcelona';
  const barcaScore = isHome ? match.homeScore! : match.awayScore!;
  const opponentScore = isHome ? match.awayScore! : match.homeScore!;
  if (barcaScore > opponentScore) return Colors.win;
  if (barcaScore === opponentScore) return Colors.draw;
  return Colors.loss;
}

export default function MatchCard({ match, onPress, compact }: Props) {
  const resultColor = getResultColor(match);

  return (
    <TouchableOpacity
      style={[styles.container, compact && styles.compact]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {/* Competition badge */}
      <View style={styles.competitionRow}>
        <Text style={styles.competition}>{match.competition}</Text>
        {match.status === 'live' && (
          <View style={styles.liveBadge}>
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}
        {match.status === 'finished' && (
          <View style={[styles.resultDot, { backgroundColor: resultColor }]} />
        )}
      </View>

      {/* Teams & Score */}
      <View style={styles.teamsRow}>
        {/* Home */}
        <View style={styles.teamBlock}>
          {isImageUri(match.homeTeam.logo) ? (
            <Image source={{ uri: match.homeTeam.logo }} style={styles.teamLogoImage} resizeMode="contain" />
          ) : (
            <Text style={styles.teamLogo}>{match.homeTeam.logo}</Text>
          )}
          <Text style={styles.teamName} numberOfLines={1}>
            {match.homeTeam.shortName}
          </Text>
        </View>

        {/* Score or Time */}
        <View style={styles.scoreBlock}>
          {match.status === 'finished' || match.status === 'live' ? (
            <Text style={[styles.score, { color: match.status === 'live' ? Colors.gold : Colors.text }]}>
              {match.homeScore} - {match.awayScore}
            </Text>
          ) : (
            <>
              <Text style={styles.matchTime}>{formatTime(match.date)}</Text>
              <Text style={styles.matchDate}>{formatDate(match.date)}</Text>
            </>
          )}
        </View>

        {/* Away */}
        <View style={styles.teamBlock}>
          {isImageUri(match.awayTeam.logo) ? (
            <Image source={{ uri: match.awayTeam.logo }} style={styles.teamLogoImage} resizeMode="contain" />
          ) : (
            <Text style={styles.awayLogo}>{match.awayTeam.logo}</Text>
          )}
          <Text style={styles.teamName} numberOfLines={1}>
            {match.awayTeam.shortName}
          </Text>
        </View>
      </View>

      {!compact && (
        <Text style={styles.venue}>📍 {match.venue}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  compact: {
    padding: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  competitionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  competition: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  liveBadge: {
    backgroundColor: Colors.error,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  liveText: {
    color: Colors.text,
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  resultDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  teamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  teamBlock: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  teamLogo: {
    fontSize: 24,
  },
  awayLogo: {
    fontSize: 24,
  },
  teamLogoImage: {
    width: 36,
    height: 36,
    borderRadius: 4,
  },
  teamName: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: '600',
    textAlign: 'center',
  },
  scoreBlock: {
    flex: 1,
    alignItems: 'center',
  },
  score: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.text,
  },
  matchTime: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
  },
  matchDate: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  venue: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
});
