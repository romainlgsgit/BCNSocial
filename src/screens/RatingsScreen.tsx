import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Image,
} from 'react-native';
import { getPlayerPhoto } from '../utils/playerPhotos';
import { usePlayers } from '../context/PlayersContext';
import { useLocalPlayerPhotos } from '../utils/localPlayerPhotos';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';
import { MATCHES } from '../data/mockData';
import { Match, Player } from '../types';
import { useRatings, PlayerStats } from '../context/RatingsContext';
import { useFeaturedMatch } from '../context/MatchContext';
import {
  VotingCard,
  PendingLineupCard,
  isVotingOpen,
  getRatingColor,
  TeamLogo,
  POSITION_COLORS,
} from '../components/VotingWidget';

// ─── Constants ────────────────────────────────────────────────────────────────

type Position = 'Tous' | 'GK' | 'DEF' | 'MID' | 'ATT';
const POSITIONS: Position[] = ['Tous', 'GK', 'DEF', 'MID', 'ATT'];

const POSITION_LABELS: Record<string, string> = {
  GK: 'Gardien',
  DEF: 'Défenseur',
  MID: 'Milieu',
  ATT: 'Attaquant',
};

// ─── RatingBar ────────────────────────────────────────────────────────────────

function RatingBar({ rating }: { rating: number }) {
  const pct = (rating / 10) * 100;
  const color = getRatingColor(rating);
  return (
    <View style={rbStyles.container}>
      <View style={rbStyles.track}>
        <View style={[rbStyles.fill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={[rbStyles.label, { color }]}>{rating.toFixed(1)}</Text>
    </View>
  );
}

const rbStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xs },
  track: { flex: 1, height: 4, backgroundColor: Colors.border, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
  label: { fontSize: FontSize.md, fontWeight: '800', minWidth: 32, textAlign: 'right' },
});

// ─── SeasonPlayerCard ─────────────────────────────────────────────────────────

function PlayerAvatar({ player }: { player: Player }) {
  const { map: localPhotos } = useLocalPlayerPhotos();
  const photoUrl = localPhotos[player.id] || player.photoUrl || getPlayerPhoto(player.name);
  if (photoUrl) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={styles.playerPhotoImg}
        resizeMode="cover"
      />
    );
  }
  return (
    <View style={styles.playerPhoto}>
      <Text style={styles.playerPhotoText}>{player.photo}</Text>
    </View>
  );
}

function SeasonPlayerCard({
  player,
  rank,
  stats,
}: {
  player: Player;
  rank: number;
  stats?: PlayerStats;
}) {
  const isTop = rank <= 3;
  const hasRealVotes = stats && stats.totalVotes > 0;
  return (
    <View style={styles.playerCard}>
      <View style={styles.rankBlock}>
        {isTop ? (
          <View style={[styles.rankBadge, { backgroundColor: rank === 1 ? '#FFD700' : rank === 2 ? '#C0C0C0' : '#CD7F32' }]}>
            <Text style={styles.rankBadgeText}>{rank}</Text>
          </View>
        ) : (
          <Text style={styles.rankNumber}>{rank}</Text>
        )}
      </View>

      <PlayerAvatar player={player} />

      <View style={styles.playerInfo}>
        <View style={styles.playerNameRow}>
          <Text style={styles.playerName}>{player.name}</Text>
          <Text style={styles.playerNat}>{player.nationality}</Text>
        </View>
        <View style={styles.playerMetaRow}>
          <View
            style={[
              styles.posBadge,
              {
                backgroundColor: POSITION_COLORS[player.position] + '22',
                borderColor: POSITION_COLORS[player.position] + '55',
              },
            ]}
          >
            <Text style={[styles.posText, { color: POSITION_COLORS[player.position] }]}>
              {POSITION_LABELS[player.position] || player.position}
            </Text>
          </View>
          <Text style={styles.playerNum}>N°{player.number}</Text>
        </View>
        {hasRealVotes ? (
          <>
            <RatingBar rating={stats.averageRating} />
            <Text style={styles.playerVotes}>{stats.totalVotes.toLocaleString()} votes</Text>
          </>
        ) : (
          <Text style={styles.playerVotes}>Pas encore noté</Text>
        )}
      </View>
    </View>
  );
}

// ─── NextMatchCard ────────────────────────────────────────────────────────────

function NextMatchCard({ match }: { match: Match }) {
  const kickoff = new Date(match.date);
  const dateStr = kickoff.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const timeStr = kickoff.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={styles.nextMatchCard}>
      <View style={styles.nextMatchTop}>
        <Text style={styles.nextMatchLabel}>PROCHAIN MATCH</Text>
        <Text style={styles.nextMatchComp}>{match.competition}</Text>
      </View>
      <View style={styles.nextMatchRow}>
        <View style={styles.nextMatchTeam}>
          <TeamLogo logo={match.homeTeam.logo} shortName={match.homeTeam.shortName} size={48} />
          <Text style={styles.nextMatchTeamName}>{match.homeTeam.shortName}</Text>
        </View>
        <View style={styles.nextMatchCenter}>
          <Text style={styles.nextMatchVs}>VS</Text>
          <Text style={styles.nextMatchDate}>{dateStr}</Text>
          <Text style={styles.nextMatchTime}>{timeStr}</Text>
        </View>
        <View style={styles.nextMatchTeam}>
          <TeamLogo logo={match.awayTeam.logo} shortName={match.awayTeam.shortName} size={48} />
          <Text style={styles.nextMatchTeamName}>{match.awayTeam.shortName}</Text>
        </View>
      </View>
      <View style={styles.nextMatchFooter}>
        <Ionicons name="time-outline" size={13} color={Colors.textMuted} />
        <Text style={styles.nextMatchHint}>Le vote s'ouvre à la fin du match · dure 72h</Text>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function RatingsScreen() {
  const [activePosition, setActivePosition] = useState<Position>('Tous');
  const { getLineup, playerStats } = useRatings();
  const { players: PLAYERS } = usePlayers();
  const { monthlyMatches, featuredMatch, isLoadingMonthly } = useFeaturedMatch();

  const activeVotingMatch = useMemo(
    () => [...monthlyMatches, ...MATCHES].find(isVotingOpen) ?? null,
    [monthlyMatches]
  );

  const lineup = activeVotingMatch ? getLineup(activeVotingMatch.id) : null;
  const nextMatch = featuredMatch?.status === 'upcoming' ? featuredMatch : null;

  const filtered = PLAYERS.filter(
    (p) => activePosition === 'Tous' || p.position === activePosition
  ).sort((a, b) => {
    const aVotes = playerStats[a.id]?.totalVotes ?? 0;
    const bVotes = playerStats[b.id]?.totalVotes ?? 0;
    const aRating = aVotes > 0 ? (playerStats[a.id]?.averageRating ?? 0) : -1;
    const bRating = bVotes > 0 ? (playerStats[b.id]?.averageRating ?? 0) : -1;
    return bRating - aRating;
  });

  const subtitle = activeVotingMatch
    ? lineup
      ? 'Vote en cours · Saison 2026/27'
      : 'Compo en attente · Saison 2026/27'
    : 'Saison 2026/27';

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Ionicons name="star" size={20} color={Colors.gold} />
          <Text style={styles.headerTitle}>Notes</Text>
        </View>
        <Text style={styles.headerSub}>{subtitle}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {activeVotingMatch && lineup && (
          <View style={styles.widgetWrap}>
            <VotingCard match={activeVotingMatch} lineup={lineup} />
          </View>
        )}
        {activeVotingMatch && !lineup && (
          <View style={styles.widgetWrap}>
            <PendingLineupCard match={activeVotingMatch} />
          </View>
        )}

        {!activeVotingMatch && !isLoadingMonthly && (
          nextMatch ? (
            <NextMatchCard match={nextMatch} />
          ) : (
            <View style={styles.noVoteCard}>
              <Ionicons name="time-outline" size={32} color={Colors.textMuted} />
              <Text style={styles.noVoteTitle}>Aucun vote en cours</Text>
              <Text style={styles.noVoteText}>
                Le vote s'ouvre après chaque match et dure 72h.{'\n'}
                La compo doit d'abord être validée par l'admin.
              </Text>
            </View>
          )
        )}

        {/* Classement saison */}
        <View style={styles.seasonHeader}>
          <Text style={styles.seasonTitle}>Classement saison</Text>
          <Text style={styles.seasonSub}>Moyenne communauté</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterScrollContent}
        >
          {POSITIONS.map((pos) => (
            <TouchableOpacity
              key={pos}
              style={[styles.filterTab, activePosition === pos && styles.filterTabActive]}
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

        <View style={styles.list}>
          {filtered.map((player, idx) => (
            <SeasonPlayerCard
              key={player.id}
              player={player}
              rank={idx + 1}
              stats={playerStats[player.id]}
            />
          ))}
        </View>

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingTop: 60,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text },
  headerSub: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: Spacing.xs },

  widgetWrap: { marginHorizontal: Spacing.md, marginBottom: Spacing.md },

  noVoteCard: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  noVoteIcon: { fontSize: 32 },
  noVoteTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  noVoteText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },

  nextMatchCard: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.secondary + '44',
    overflow: 'hidden',
  },
  nextMatchTop: {
    backgroundColor: Colors.secondary + '18',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nextMatchLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.secondary,
    letterSpacing: 0.8,
  },
  nextMatchComp: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '600' },
  nextMatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  nextMatchTeam: { alignItems: 'center', flex: 1 },
  nextMatchTeamName: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  nextMatchCenter: { alignItems: 'center', flex: 1 },
  nextMatchVs: { fontSize: FontSize.xl, fontWeight: '900', color: Colors.textMuted },
  nextMatchDate: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 4,
    fontWeight: '600',
  },
  nextMatchTime: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text, marginTop: 2 },
  nextMatchFooter: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  nextMatchHint: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center' },

  seasonHeader: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  seasonTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  seasonSub: { fontSize: FontSize.xs, color: Colors.textMuted },

  filterScroll: { maxHeight: 48, marginBottom: Spacing.sm },
  filterScrollContent: { paddingHorizontal: Spacing.md, gap: Spacing.sm },
  filterTab: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterTabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterTabText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600' },
  filterTabTextActive: { color: Colors.text },

  list: { paddingHorizontal: Spacing.md, paddingTop: Spacing.xs, gap: Spacing.sm },
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
  rankBlock: { width: 28, alignItems: 'center' },
  rankBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeText: { fontSize: 11, fontWeight: '900', color: '#111' },
  rankNumber: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textMuted },
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
  playerPhotoImg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceLight,
  },
  playerPhotoText: { fontSize: 24 },
  playerInfo: { flex: 1 },
  playerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  playerName: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text, flex: 1 },
  playerNat: { fontSize: FontSize.lg },
  playerMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  posBadge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  posText: { fontSize: 10, fontWeight: '700' },
  playerNum: { fontSize: FontSize.xs, color: Colors.textMuted },
  playerVotes: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
});
