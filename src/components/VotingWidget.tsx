import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';
import { Match, Player } from '../types';
import { useRatings } from '../context/RatingsContext';
import { useAuth } from '../context/AuthContext';

// ─── Constants ────────────────────────────────────────────────────────────────

export const POSITION_COLORS: Record<string, string> = {
  GK: '#F59E0B',
  DEF: '#3B82F6',
  MID: '#10B981',
  ATT: '#EF4444',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getRatingColor(n: number): string {
  if (n >= 8) return Colors.win;
  if (n >= 6) return Colors.draw;
  return Colors.loss;
}

export function getVotingDeadline(match: Match): Date {
  return new Date(new Date(match.date).getTime() + 72 * 60 * 60 * 1000);
}

export function isVotingOpen(match: Match): boolean {
  if (match.status !== 'finished') return false;
  return Date.now() < getVotingDeadline(match).getTime();
}

export function getTimeLeft(deadline: Date): string {
  const ms = deadline.getTime() - Date.now();
  if (ms <= 0) return 'Terminé';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m restantes`;
  return `${m} min restantes`;
}

export function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  });
}

// ─── TeamLogo ─────────────────────────────────────────────────────────────────

export function TeamLogo({
  logo,
  shortName,
  size = 44,
}: {
  logo: string;
  shortName: string;
  size?: number;
}) {
  const isUrl =
    logo.startsWith('http') || logo.startsWith('https') || logo.startsWith('data:');
  if (isUrl) {
    return (
      <Image source={{ uri: logo }} style={{ width: size, height: size }} resizeMode="contain" />
    );
  }
  if (logo) {
    return <Text style={{ fontSize: size * 0.72 }}>{logo}</Text>;
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.18,
        backgroundColor: '#333',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontSize: size * 0.26, fontWeight: '800' }}>{shortName}</Text>
    </View>
  );
}

// ─── RatingSelector (grille 5×2) ─────────────────────────────────────────────

export function RatingSelector({
  current,
  onRate,
}: {
  current: number | null;
  onRate: (n: number) => void;
}) {
  return (
    <View style={selStyles.grid}>
      {[[1, 2, 3, 4, 5], [6, 7, 8, 9, 10]].map((row, ri) => (
        <View key={ri} style={selStyles.row}>
          {row.map((n) => {
            const active = current === n;
            const color = getRatingColor(n);
            return (
              <TouchableOpacity
                key={n}
                onPress={() => onRate(n)}
                activeOpacity={0.7}
                style={[selStyles.btn, active && { backgroundColor: color, borderColor: color }]}
              >
                <Text
                  style={[selStyles.label, { color: active ? '#fff' : Colors.textSecondary }]}
                >
                  {n}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const selStyles = StyleSheet.create({
  grid: { gap: 6, paddingTop: 4 },
  row: { flexDirection: 'row', gap: 6 },
  btn: {
    flex: 1,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 13, fontWeight: '700' },
});

// ─── RatingBadge ──────────────────────────────────────────────────────────────

function RatingBadge({ rating }: { rating: number }) {
  const color = getRatingColor(rating);
  return (
    <View
      style={[
        vStyles.ratingBadge,
        { backgroundColor: color + '20', borderColor: color + '60' },
      ]}
    >
      <Text style={[vStyles.ratingBadgeText, { color }]}>{rating}/10</Text>
    </View>
  );
}

// ─── MatchHeader compact ──────────────────────────────────────────────────────

function MatchHeader({ match, pending = false }: { match: Match; pending?: boolean }) {
  const timeLeft = getTimeLeft(getVotingDeadline(match));
  return (
    <View style={vStyles.header}>
      <View style={vStyles.headerTop}>
        {pending ? (
          <View style={vStyles.pendingPill}>
            <Ionicons name="time-outline" size={11} color={Colors.textMuted} />
            <Text style={vStyles.pendingPillText}>EN ATTENTE</Text>
          </View>
        ) : (
          <View style={vStyles.livePill}>
            <View style={vStyles.liveDot} />
            <Text style={vStyles.livePillText}>VOTE OUVERT</Text>
          </View>
        )}
        <View style={vStyles.headerTimeRow}>
          <Ionicons name="timer-outline" size={12} color={Colors.textMuted} />
          <Text style={vStyles.headerTime}>{timeLeft}</Text>
        </View>
      </View>
      <View style={vStyles.matchRow}>
        <View style={vStyles.teamCol}>
          <TeamLogo logo={match.homeTeam.logo} shortName={match.homeTeam.shortName} size={38} />
          <Text style={vStyles.teamName}>{match.homeTeam.shortName}</Text>
        </View>
        <View style={vStyles.scoreCol}>
          <Text style={vStyles.score}>
            {match.homeScore ?? '-'} – {match.awayScore ?? '-'}
          </Text>
          <Text style={vStyles.competition}>
            {match.competition} · {formatDate(match.date)}
          </Text>
        </View>
        <View style={vStyles.teamCol}>
          <TeamLogo logo={match.awayTeam.logo} shortName={match.awayTeam.shortName} size={38} />
          <Text style={vStyles.teamName}>{match.awayTeam.shortName}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── PendingLineupCard ────────────────────────────────────────────────────────

export function PendingLineupCard({ match }: { match: Match }) {
  return (
    <View style={[vStyles.card, vStyles.cardPending]}>
      <MatchHeader match={match} pending />
      <View style={vStyles.pendingBody}>
        <Text style={vStyles.pendingTitle}>Compo en attente de validation</Text>
        <Text style={vStyles.pendingText}>
          L'admin doit valider la compo avant que le vote s'ouvre.
        </Text>
      </View>
    </View>
  );
}

// ─── VotingCard (accordéon avec toggle principal) ────────────────────────────

export function VotingCard({ match, lineup }: { match: Match; lineup: Player[] }) {
  const { isAuthenticated } = useAuth();
  const { getUserMatchRating, rateMatch, getUserPlayerRating, ratePlayer, matchStats } = useRatings();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const communityMatchStats = matchStats[match.id];

  const toggle = (key: string) => setExpanded((prev) => (prev === key ? null : key));

  const matchRating = getUserMatchRating(match.id);
  const voted = lineup.filter((p) => getUserPlayerRating(match.id, p.id) !== null).length;
  const totalVoted = (matchRating !== null ? 1 : 0) + voted;
  const total = 1 + lineup.length;

  return (
    <View style={vStyles.card}>
      {/* En-tête match — toujours visible */}
      <MatchHeader match={match} />

      {/* Guard non connecté */}
      {!isAuthenticated && (
        <View style={vStyles.authPrompt}>
          <Ionicons name="lock-closed-outline" size={16} color={Colors.textMuted} />
          <Text style={vStyles.authPromptText}>Connecte-toi pour voter</Text>
        </View>
      )}

      {/* Bouton principal d'ouverture */}
      {isAuthenticated && <TouchableOpacity
        style={[vStyles.mainToggle, open && vStyles.mainToggleOpen]}
        onPress={() => { setOpen((v) => !v); setExpanded(null); }}
        activeOpacity={0.8}
      >
        <View style={vStyles.mainToggleLeft}>
          <Ionicons name={open ? 'chevron-up' : 'create-outline'} size={15} color={Colors.primary} />
          <Text style={vStyles.mainToggleText}>
            {open ? 'Fermer' : 'Voter pour ce match'}
          </Text>
        </View>
        <View style={vStyles.mainToggleRight}>
          {totalVoted > 0 && !open && (
            <View style={vStyles.progressPill}>
              <Text style={vStyles.progressPillText}>{totalVoted}/{total}</Text>
            </View>
          )}
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.primary} />
        </View>
      </TouchableOpacity>}

      {/* Contenu déroulant */}
      {open && (
        <>
          {/* Note du match */}
          <TouchableOpacity
            style={vStyles.accordionRow}
            onPress={() => toggle('__match__')}
            activeOpacity={0.75}
          >
            <View style={vStyles.accordionLabelCol}>
              <Text style={vStyles.accordionLabel}>Note du match</Text>
              {communityMatchStats && communityMatchStats.totalVotes > 0 && (
                <Text style={vStyles.communityAvg}>
                  Moy. communauté: {communityMatchStats.averageRating.toFixed(1)} · {communityMatchStats.totalVotes} vote{communityMatchStats.totalVotes > 1 ? 's' : ''}
                </Text>
              )}
            </View>
            <View style={vStyles.accordionRight}>
              {matchRating !== null ? (
                <RatingBadge rating={matchRating} />
              ) : (
                <Text style={vStyles.accordionHint}>Noter</Text>
              )}
              <Ionicons name={expanded === '__match__' ? 'chevron-up' : 'chevron-down'} size={13} color={Colors.textMuted} />
            </View>
          </TouchableOpacity>
          {expanded === '__match__' && (
            <View style={vStyles.accordionContent}>
              <RatingSelector
                current={matchRating}
                onRate={(n) => { rateMatch(match.id, n); setExpanded(null); }}
              />
            </View>
          )}

          {/* Joueurs */}
          <View style={vStyles.playersSectionHeader}>
            <Text style={vStyles.accordionLabel}>Notes des joueurs</Text>
            <Text style={vStyles.playersSectionCount}>{voted}/{lineup.length} notés</Text>
          </View>

          {lineup.map((player, idx) => {
            const playerRating = getUserPlayerRating(match.id, player.id);
            const isOpen = expanded === player.id;
            const posColor = POSITION_COLORS[player.position];
            return (
              <View key={player.id}>
                <TouchableOpacity
                  style={[vStyles.playerRow, idx === 0 && vStyles.playerRowFirst]}
                  onPress={() => toggle(player.id)}
                  activeOpacity={0.75}
                >
                  <Text style={vStyles.playerEmoji}>{player.photo}</Text>
                  <View style={vStyles.playerMiddle}>
                    <Text style={vStyles.playerName} numberOfLines={1}>{player.name}</Text>
                    <View style={vStyles.playerMeta}>
                      <View style={[vStyles.posBadge, { backgroundColor: posColor + '22' }]}>
                        <Text style={[vStyles.posText, { color: posColor }]}>{player.position}</Text>
                      </View>
                      <Text style={vStyles.playerNum}>N°{player.number}</Text>
                    </View>
                  </View>
                  <View style={vStyles.accordionRight}>
                    {playerRating !== null ? (
                      <RatingBadge rating={playerRating} />
                    ) : (
                      <Text style={vStyles.accordionHint}>Noter</Text>
                    )}
                    <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={13} color={Colors.textMuted} />
                  </View>
                </TouchableOpacity>
                {isOpen && (
                  <View style={vStyles.accordionContent}>
                    <RatingSelector
                      current={playerRating}
                      onRate={(n) => { ratePlayer(match.id, player.id, n); setExpanded(null); }}
                    />
                  </View>
                )}
              </View>
            );
          })}

          <View style={{ height: 6 }} />
        </>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const vStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
    overflow: 'hidden',
  },
  cardPending: {
    borderColor: Colors.border,
  },

  // Header
  header: {
    paddingHorizontal: Spacing.md,
    paddingTop: 12,
    paddingBottom: 10,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  livePill: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  livePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },
  pendingPill: {
    backgroundColor: Colors.border,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  pendingPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 0.5,
  },
  headerTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerTime: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  authPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingVertical: 14,
  },
  authPromptText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  teamCol: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
  },
  teamName: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '700',
    textAlign: 'center',
  },
  scoreCol: {
    alignItems: 'center',
    flex: 1.3,
    gap: 2,
  },
  score: {
    fontSize: 28,
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: 2,
  },
  competition: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '600',
  },

  // Pending
  pendingBody: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: 4,
  },
  pendingTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
  },
  pendingText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    lineHeight: 18,
  },

  // Toggle principal
  mainToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: 13,
  },
  mainToggleOpen: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  mainToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  mainToggleText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.primary,
  },
  mainToggleRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressPill: {
    backgroundColor: Colors.primary + '22',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.primary + '44',
  },
  progressPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },

  // Accordion
  accordionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  accordionLabelCol: {
    flex: 1,
    gap: 2,
  },
  accordionLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
  },
  communityAvg: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  accordionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  accordionHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  accordionContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border + '80',
  },
  chevron: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  ratingBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  ratingBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },

  // Players
  playersSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  playersSectionCount: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 10,
  },
  playerRowFirst: {
    borderTopWidth: 0,
  },
  playerEmoji: {
    fontSize: 22,
    width: 30,
    textAlign: 'center',
  },
  playerMiddle: {
    flex: 1,
    gap: 3,
  },
  playerName: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
  },
  playerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  posBadge: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  posText: {
    fontSize: 10,
    fontWeight: '700',
  },
  playerNum: {
    fontSize: 11,
    color: Colors.textMuted,
  },
});
