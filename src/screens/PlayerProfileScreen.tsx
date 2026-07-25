import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Image,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';
import { usePlayers } from '../context/PlayersContext';
import { useRatings } from '../context/RatingsContext';
import { getPlayerProfile, Trophy } from '../data/playerProfiles';
import { getRatingColor, POSITION_COLORS } from '../components/VotingWidget';
import { Player } from '../types';

const POSITION_LABELS: Record<string, string> = {
  GK: 'Gardien',
  DEF: 'Défenseur',
  MID: 'Milieu',
  ATT: 'Attaquant',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function computeAge(birthDate?: string): number | null {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

function formatBirthDate(birthDate?: string): string | null {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PlayerAvatar({ player }: { player: Player }) {
  const photoUrl = player.photoBase64
    ? `data:image/jpeg;base64,${player.photoBase64}`
    : player.photoUrl;
  if (photoUrl) {
    return <Image source={{ uri: photoUrl }} style={styles.heroPhotoImg} resizeMode="cover" />;
  }
  return (
    <View style={styles.heroPhoto}>
      <Text style={styles.heroPhotoEmoji}>{player.photo}</Text>
    </View>
  );
}

function StatTile({ value, label }: { value: number | null | undefined; label: string }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statValue}>{value == null ? 'N/A' : value.toLocaleString('fr-FR')}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Section({ title, icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={16} color={Colors.gold} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function TrophyRow({ trophy }: { trophy: Trophy }) {
  return (
    <View style={styles.trophyRow}>
      <Ionicons name="trophy" size={15} color={Colors.gold} />
      <Text style={styles.trophyName}>{trophy.name}</Text>
      {trophy.count > 1 && (
        <View style={styles.trophyCountBadge}>
          <Text style={styles.trophyCountText}>×{trophy.count}</Text>
        </View>
      )}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PlayerProfileScreen() {
  const route = useRoute();
  const navigation = useNavigation<any>();
  const { playerId } = (route.params ?? {}) as { playerId: string };

  const { players } = usePlayers();
  const { playerStats } = useRatings();

  const player = useMemo(() => players.find((p) => p.id === playerId), [players, playerId]);
  const profile = getPlayerProfile(playerId);

  if (!player) {
    return (
      <View style={styles.root}>
        <StatusBar barStyle="light-content" />
        <View style={styles.simpleHeader}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={20} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
        </View>
        <View style={styles.emptyWrap}>
          <Ionicons name="person-outline" size={40} color={Colors.textMuted} />
          <Text style={styles.emptyText}>Joueur introuvable</Text>
        </View>
      </View>
    );
  }

  const posColor = POSITION_COLORS[player.position] ?? Colors.primary;

  // Note globale de la saison : la moyenne communauté si des votes existent,
  // sinon N/A (on n'invente pas de note).
  const stats = playerStats[player.id];
  const hasVotes = !!stats && stats.totalVotes > 0;
  const seasonRating = hasVotes ? stats!.averageRating : null;
  const ratingColor = seasonRating != null ? getRatingColor(seasonRating) : Colors.textMuted;

  const age = computeAge(profile?.birthDate);
  const birthStr = formatBirthDate(profile?.birthDate);

  const clubTrophies = profile?.clubTrophies ?? [];
  const nationalTrophies = profile?.nationalTrophies ?? [];
  const awards = profile?.awards ?? [];

  const infoItems: { label: string; value: string }[] = [];
  if (birthStr) infoItems.push({ label: 'Naissance', value: age != null ? `${birthStr} (${age} ans)` : birthStr });
  if (profile?.birthPlace) infoItems.push({ label: 'Lieu', value: profile.birthPlace });
  if (profile?.height) infoItems.push({ label: 'Taille', value: `${profile.height} cm` });
  if (profile?.foot) infoItems.push({ label: 'Pied fort', value: profile.foot });
  if (profile?.atBarcaSince) infoItems.push({ label: 'Au Barça depuis', value: profile.atBarcaSince });
  if (profile?.previousClubs?.length) infoItems.push({ label: 'Anciens clubs', value: profile.previousClubs.join(', ') });

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Spacing.xxl }}>
        {/* ── Hero ── */}
        <LinearGradient
          colors={[posColor + '55', Colors.background]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.hero}
        >
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={20} color="rgba(255,255,255,0.95)" />
          </TouchableOpacity>

          <PlayerAvatar player={player} />

          <View style={styles.heroNameRow}>
            <Text style={styles.heroName}>{player.name}</Text>
            <Text style={styles.heroFlag}>{player.nationality}</Text>
          </View>

          <View style={styles.heroMetaRow}>
            <View style={[styles.posBadge, { backgroundColor: posColor + '22', borderColor: posColor + '66' }]}>
              <Text style={[styles.posText, { color: posColor }]}>
                {POSITION_LABELS[player.position] ?? player.position}
              </Text>
            </View>
            <View style={styles.numberBadge}>
              <Text style={styles.numberText}>N°{player.number}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* ── Note globale de la saison ── */}
        <View style={styles.ratingCard}>
          <View style={styles.ratingLeft}>
            <Text style={styles.ratingCardLabel}>Note de la saison</Text>
            <Text style={styles.ratingCardSub}>
              {hasVotes ? `${stats!.totalVotes.toLocaleString('fr-FR')} votes de la communauté` : 'Pas encore noté cette saison'}
            </Text>
          </View>
          <View style={[styles.ratingBubble, { borderColor: ratingColor + '66', backgroundColor: ratingColor + '18' }]}>
            {seasonRating != null ? (
              <>
                <Text style={[styles.ratingBubbleValue, { color: ratingColor }]}>{seasonRating.toFixed(1)}</Text>
                <Text style={styles.ratingBubbleMax}>/10</Text>
              </>
            ) : (
              <Text style={[styles.ratingBubbleValue, { color: ratingColor }]}>N/A</Text>
            )}
          </View>
        </View>

        {/* ── Stats carrière ── */}
        <View style={styles.statsRow}>
          <StatTile value={profile?.careerGoals} label="Buts" />
          <StatTile value={profile?.careerAssists} label="Passes déc." />
          <StatTile value={profile?.careerApps} label="Matchs" />
        </View>
        <Text style={styles.careerHint}>Statistiques de carrière (indicatives)</Text>

        {/* ── Infos ── */}
        {infoItems.length > 0 && (
          <Section title="Informations" icon="information-circle-outline">
            <View style={styles.infoCard}>
              {infoItems.map((it, i) => (
                <View key={it.label}>
                  <InfoRow label={it.label} value={it.value} />
                  {i < infoItems.length - 1 && <View style={styles.infoDivider} />}
                </View>
              ))}
            </View>
          </Section>
        )}

        {/* ── Palmarès club ── */}
        {clubTrophies.length > 0 && (
          <Section title="Palmarès en club" icon="trophy-outline">
            <View style={styles.trophyCard}>
              {clubTrophies.map((t) => (
                <TrophyRow key={t.name} trophy={t} />
              ))}
            </View>
          </Section>
        )}

        {/* ── Palmarès sélection ── */}
        {nationalTrophies.length > 0 && (
          <Section title="Palmarès en sélection" icon="flag-outline">
            <View style={styles.trophyCard}>
              {nationalTrophies.map((t) => (
                <TrophyRow key={t.name} trophy={t} />
              ))}
            </View>
          </Section>
        )}

        {/* ── Distinctions ── */}
        {awards.length > 0 && (
          <Section title="Distinctions individuelles" icon="ribbon-outline">
            <View style={styles.trophyCard}>
              {awards.map((a) => (
                <View key={a} style={styles.awardRow}>
                  <Ionicons name="star" size={14} color={Colors.gold} />
                  <Text style={styles.awardText}>{a}</Text>
                </View>
              ))}
            </View>
          </Section>
        )}

        {/* ── Bio ── */}
        {profile?.bio && (
          <Section title="À propos" icon="reader-outline">
            <View style={styles.bioCard}>
              <Text style={styles.bioText}>{profile.bio}</Text>
            </View>
          </Section>
        )}

        {!profile && (
          <View style={styles.noProfileWrap}>
            <Ionicons name="construct-outline" size={22} color={Colors.textMuted} />
            <Text style={styles.noProfileText}>Fiche détaillée bientôt disponible pour ce joueur.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  simpleHeader: { paddingTop: 56, paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  emptyText: { color: Colors.textSecondary, fontSize: FontSize.md },

  backBtn: {
    position: 'absolute',
    top: 56,
    left: Spacing.md,
    zIndex: 10,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  hero: {
    alignItems: 'center',
    paddingTop: 110,
    paddingBottom: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
  heroPhoto: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  heroPhotoImg: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: Colors.surfaceLight,
  },
  heroPhotoEmoji: { fontSize: 52 },
  heroNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: Spacing.md },
  heroName: { fontSize: FontSize.xxl, fontWeight: '900', color: Colors.text, textAlign: 'center' },
  heroFlag: { fontSize: FontSize.xl },
  heroMetaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
  posBadge: { borderWidth: 1, borderRadius: BorderRadius.full, paddingHorizontal: 12, paddingVertical: 4 },
  posText: { fontSize: FontSize.sm, fontWeight: '800' },
  numberBadge: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: Colors.surface,
  },
  numberText: { fontSize: FontSize.sm, fontWeight: '800', color: Colors.textSecondary },

  ratingCard: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.xs,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ratingLeft: { flex: 1 },
  ratingCardLabel: { fontSize: FontSize.md, fontWeight: '800', color: Colors.text },
  ratingCardSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  ratingBubble: {
    minWidth: 76,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 2,
  },
  ratingBubbleValue: { fontSize: FontSize.xxl, fontWeight: '900' },
  ratingBubbleMax: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: '700' },

  statsRow: {
    flexDirection: 'row',
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  statTile: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  statValue: { fontSize: FontSize.xl, fontWeight: '900', color: Colors.text },
  statLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  careerHint: {
    fontSize: 10,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
    fontStyle: 'italic',
  },

  section: { marginTop: Spacing.lg, paddingHorizontal: Spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.sm },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '800', color: Colors.text },

  infoCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, gap: Spacing.md },
  infoLabel: { fontSize: FontSize.sm, color: Colors.textMuted },
  infoValue: { fontSize: FontSize.sm, color: Colors.text, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  infoDivider: { height: 1, backgroundColor: Colors.border },

  trophyCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  trophyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 9 },
  trophyName: { flex: 1, fontSize: FontSize.sm, color: Colors.text, fontWeight: '600' },
  trophyCountBadge: {
    backgroundColor: Colors.gold + '22',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  trophyCountText: { fontSize: FontSize.xs, fontWeight: '800', color: Colors.gold },

  awardRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 9 },
  awardText: { flex: 1, fontSize: FontSize.sm, color: Colors.text, fontWeight: '600' },

  bioCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  bioText: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 21 },

  noProfileWrap: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.lg,
  },
  noProfileText: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center' },
});
