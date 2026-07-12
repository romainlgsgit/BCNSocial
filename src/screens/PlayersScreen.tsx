import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';
import { PLAYERS } from '../data/mockData';
import { Player } from '../types';
import { useRatings, PlayerStats } from '../context/RatingsContext';

type Position = 'Tous' | 'GK' | 'DEF' | 'MID' | 'ATT';

const POSITIONS: Position[] = ['Tous', 'GK', 'DEF', 'MID', 'ATT'];
const POSITION_LABELS: Record<string, string> = {
  GK: 'Gardien',
  DEF: 'Défenseur',
  MID: 'Milieu',
  ATT: 'Attaquant',
};

function RatingBar({ rating }: { rating: number }) {
  const pct = (rating / 10) * 100;
  const color =
    rating >= 8.5 ? Colors.gold
    : rating >= 7.5 ? Colors.win
    : rating >= 6 ? Colors.draw
    : Colors.loss;

  return (
    <View style={ratingStyles.container}>
      <View style={ratingStyles.track}>
        <View style={[ratingStyles.fill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={[ratingStyles.label, { color }]}>{rating.toFixed(1)}</Text>
    </View>
  );
}

const ratingStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  track: {
    flex: 1,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 2,
  },
  label: {
    fontSize: FontSize.md,
    fontWeight: '800',
    minWidth: 32,
    textAlign: 'right',
  },
});

function PlayerCard({ player, rank, stats }: { player: Player; rank: number; stats?: PlayerStats }) {
  const isTop = rank <= 3;
  const hasRealVotes = stats && stats.totalVotes > 0;

  return (
    <TouchableOpacity style={styles.playerCard} activeOpacity={0.85}>
      <View style={styles.rankBlock}>
        {isTop ? (
          <Text style={styles.rankMedal}>
            {rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}
          </Text>
        ) : (
          <Text style={styles.rankNumber}>{rank}</Text>
        )}
      </View>

      <View style={styles.playerPhoto}>
        <Text style={styles.playerPhotoText}>{player.photo}</Text>
      </View>

      <View style={styles.playerInfo}>
        <View style={styles.playerNameRow}>
          <Text style={styles.playerName}>{player.name}</Text>
          <Text style={styles.playerNationality}>{player.nationality}</Text>
        </View>
        <Text style={styles.playerPosition}>
          {POSITION_LABELS[player.position] || player.position} · N°{player.number}
        </Text>
        {hasRealVotes ? (
          <>
            <RatingBar rating={stats.averageRating} />
            <Text style={styles.playerVotes}>{stats.totalVotes.toLocaleString()} votes</Text>
          </>
        ) : (
          <Text style={styles.playerVotes}>Pas encore noté</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function PlayersScreen() {
  const [activePosition, setActivePosition] = useState<Position>('Tous');
  const { playerStats } = useRatings();

  const filtered = PLAYERS
    .filter((p) => activePosition === 'Tous' || p.position === activePosition)
    .sort((a, b) => {
      const aVotes = playerStats[a.id]?.totalVotes ?? 0;
      const bVotes = playerStats[b.id]?.totalVotes ?? 0;
      const aRating = aVotes > 0 ? (playerStats[a.id]?.averageRating ?? 0) : -1;
      const bRating = bVotes > 0 ? (playerStats[b.id]?.averageRating ?? 0) : -1;
      return bRating - aRating;
    });

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>⭐ Notes joueurs</Text>
        <Text style={styles.headerSub}>Moyenne saison 2026/27</Text>
      </View>

      {/* Position filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterScrollContent}
      >
        {POSITIONS.map((pos) => (
          <TouchableOpacity
            key={pos}
            style={[
              styles.filterTab,
              activePosition === pos && styles.filterTabActive,
            ]}
            onPress={() => setActivePosition(pos)}
          >
            <Text
              style={[
                styles.filterTabText,
                activePosition === pos && styles.filterTabTextActive,
              ]}
            >
              {pos}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.list}>
          {filtered.map((player, idx) => (
            <PlayerCard key={player.id} player={player} rank={idx + 1} stats={playerStats[player.id]} />
          ))}
        </View>
        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  headerTitle: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.text,
  },
  headerSub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  filterScroll: {
    maxHeight: 48,
    marginBottom: Spacing.sm,
  },
  filterScrollContent: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  filterTab: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterTabActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterTabText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  filterTabTextActive: {
    color: Colors.text,
  },
  list: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  playerCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.md,
  },
  rankBlock: {
    width: 28,
    alignItems: 'center',
  },
  rankMedal: {
    fontSize: 22,
  },
  rankNumber: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  playerPhoto: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
  },
  playerPhotoText: {
    fontSize: 24,
  },
  playerInfo: {
    flex: 1,
  },
  playerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  playerName: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    flex: 1,
  },
  playerNationality: {
    fontSize: FontSize.lg,
  },
  playerPosition: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  playerVotes: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
});
