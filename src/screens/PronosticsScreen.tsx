import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';
import { useAuth } from '../context/AuthContext';
import { useProno, BetPrediction, PronoMatch, UserBet } from '../context/PronoContext';
import { Team } from '../types';
import AdBanner from '../components/AdBanner';
import RewardedAdButton from '../components/RewardedAdButton';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function isImageUri(logo?: string) {
  if (!logo) return false;
  return logo.startsWith('file://') || logo.startsWith('http') || logo.startsWith('data:');
}

function TeamLogo({ team, size = 36 }: { team: Team; size?: number }) {
  if (isImageUri(team.logo)) {
    return (
      <Image
        source={{ uri: team.logo }}
        style={{ width: size, height: size, borderRadius: 4 }}
        resizeMode="contain"
      />
    );
  }
  return <Text style={{ fontSize: size * 0.8 }}>{team.logo}</Text>;
}

// ─── Single match prono card ───────────────────────────────────────────────────

function PronoCard({
  match,
  bet,
  userCoins,
  onPlaceBet,
}: {
  match: PronoMatch;
  bet: UserBet | undefined;
  userCoins: number;
  onPlaceBet: (matchId: string, prediction: BetPrediction, coins: number, potentialWin: number) => Promise<void>;
}) {
  const [selected, setSelected] = useState<BetPrediction | null>(null);
  const [amount, setAmount] = useState('');

  const { odds, effectiveStatus } = match;
  const hasAllOdds = odds.home != null && odds.draw != null && odds.away != null;
  const isLive = effectiveStatus === 'live';
  const hasBet = !!bet;
  const canBet = hasAllOdds && !isLive && !hasBet;

  const selectedOdds = selected ? (odds[selected] ?? 0) : 0;
  const amountNum = Math.max(0, parseInt(amount.replace(/[^0-9]/g, '')) || 0);
  const potentialWin = amountNum > 0 && selectedOdds > 0 ? Math.floor(amountNum * selectedOdds) : 0;
  const profit = potentialWin - amountNum;

  const handleConfirm = () => {
    if (!selected) return;
    if (amountNum < 10) {
      Alert.alert('Mise trop faible', 'La mise minimum est de 10 🪙');
      return;
    }
    if (amountNum > userCoins) {
      Alert.alert('Solde insuffisant', `Tu n'as que ${userCoins} 🪙 disponibles`);
      return;
    }
    Alert.alert(
      'Confirmer le prono ?',
      `${predLabel(selected)} · ${amountNum} 🪙 misés\nGain potentiel : ${potentialWin} 🪙`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Valider',
          onPress: () => onPlaceBet(match.id, selected!, amountNum, potentialWin),
        },
      ]
    );
  };

  const PREDS: BetPrediction[] = ['home', 'draw', 'away'];

  function predLabel(p: BetPrediction): string {
    if (p === 'home') return match.homeTeam.shortName;
    if (p === 'draw') return 'Nul';
    return match.awayTeam.shortName;
  }

  function predFullLabel(p: BetPrediction): string {
    if (p === 'home') return match.homeTeam.name;
    if (p === 'draw') return 'Match nul';
    return match.awayTeam.name;
  }

  return (
    <View style={[styles.card, isLive && styles.cardLive]}>
      {/* Live banner */}
      {isLive && (
        <View style={styles.liveBanner}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>EN COURS</Text>
        </View>
      )}

      {/* Header */}
      <View style={styles.cardHeader}>
        <Text style={styles.competition}>{match.competition}</Text>
        <Text style={styles.matchDate}>{formatDate(match.date)}</Text>
      </View>

      {/* Teams */}
      <View style={styles.teamsRow}>
        <View style={styles.teamBlock}>
          <TeamLogo team={match.homeTeam} size={40} />
          <Text style={styles.teamName} numberOfLines={2}>{match.homeTeam.name}</Text>
          <Text style={styles.teamSub}>Domicile</Text>
        </View>
        <View style={styles.vsBlock}>
          <Text style={styles.vsText}>VS</Text>
        </View>
        <View style={styles.teamBlock}>
          <TeamLogo team={match.awayTeam} size={40} />
          <Text style={styles.teamName} numberOfLines={2}>{match.awayTeam.name}</Text>
          <Text style={styles.teamSub}>Extérieur</Text>
        </View>
      </View>

      {/* Odds buttons */}
      <View style={styles.oddsRow}>
        {PREDS.map(p => {
          const odd = odds[p];
          const isSelected = canBet && selected === p;
          const isBetOn = hasBet && bet!.prediction === p;
          const disabled = !hasAllOdds || isLive;

          return (
            <TouchableOpacity
              key={p}
              style={[
                styles.oddsBtn,
                disabled && styles.oddsBtnDisabled,
                isSelected && styles.oddsBtnSelected,
                isBetOn && styles.oddsBtnBetOn,
              ]}
              onPress={() => {
                if (!canBet || !hasAllOdds) return;
                setSelected(prev => prev === p ? null : p);
                setAmount('');
              }}
              activeOpacity={canBet && hasAllOdds ? 0.7 : 1}
            >
              <Text
                style={[
                  styles.oddsBtnLabel,
                  disabled && styles.oddsBtnLabelDisabled,
                  (isSelected || isBetOn) && styles.oddsBtnLabelActive,
                ]}
                numberOfLines={1}
              >
                {predLabel(p)}
              </Text>
              <Text
                style={[
                  styles.oddsBtnValue,
                  disabled && styles.oddsBtnValueDisabled,
                  (isSelected || isBetOn) && styles.oddsBtnValueActive,
                ]}
              >
                {hasAllOdds ? odd!.toFixed(2) : '—'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Status messages */}
      {!hasAllOdds && !isLive && (
        <View style={styles.statusMsg}>
          <Text style={styles.statusMsgText}>⏳ En attente des cotes</Text>
        </View>
      )}
      {isLive && (
        <View style={styles.statusMsgLive}>
          <Text style={styles.statusMsgLiveText}>🔒 Pronos verrouillés — match en cours</Text>
        </View>
      )}

      {/* Bet input — revealed when prediction selected */}
      {canBet && selected && !hasBet && (
        <View style={styles.betSection}>
          <Text style={styles.betSectionTitle}>
            Tu paries sur : <Text style={{ color: Colors.gold }}>{predFullLabel(selected)} ×{selectedOdds.toFixed(2)}</Text>
          </Text>

          <View style={styles.betInputRow}>
            <TextInput
              style={styles.betInput}
              value={amount}
              onChangeText={v => setAmount(v.replace(/[^0-9]/g, ''))}
              placeholder="Mise en pièces..."
              placeholderTextColor={Colors.textMuted}
              keyboardType="number-pad"
              maxLength={5}
            />
            <Text style={styles.betInputIcon}>🪙</Text>
          </View>

          {potentialWin > 0 && (
            <View style={styles.gainBanner}>
              <View>
                <Text style={styles.gainLabel}>Gain potentiel</Text>
                <Text style={styles.gainValue}>{potentialWin} 🪙</Text>
              </View>
              <View style={styles.gainProfitBadge}>
                <Text style={styles.gainProfitText}>+{profit} net</Text>
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[styles.confirmBtn, (amountNum < 10 || amountNum > userCoins) && styles.confirmBtnDisabled]}
            onPress={handleConfirm}
            activeOpacity={0.85}
          >
            <Text style={styles.confirmBtnText}>🎯 Valider mon prono</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Already placed bet */}
      {hasBet && (
        <View style={styles.confirmedBet}>
          <View style={styles.confirmedIconWrap}>
            <Text style={styles.confirmedIcon}>✅</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.confirmedLabel}>Prono validé · {predFullLabel(bet!.prediction)}</Text>
            <Text style={styles.confirmedSub}>
              {bet!.coins} 🪙 misés · ×{(odds[bet!.prediction] ?? 0).toFixed(2)} · Gain potentiel : <Text style={{ color: Colors.gold }}>{bet!.potentialWin} 🪙</Text>
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Guest screen ──────────────────────────────────────────────────────────────

function GuestScreen({ onNavigateToProfile }: { onNavigateToProfile: () => void }) {
  return (
    <View style={styles.guestContainer}>
      <LinearGradient colors={[Colors.primary, '#6B0030']} style={styles.guestCard}>
        <Text style={styles.guestEmoji}>🎯</Text>
        <Text style={styles.guestTitle}>Fais tes pronos !</Text>
        <Text style={styles.guestText}>
          Crée un compte gratuitement pour parier sur les matchs du Barça, gagner des pièces et grimper au classement.
        </Text>
        <TouchableOpacity style={styles.guestBtn} onPress={onNavigateToProfile} activeOpacity={0.85}>
          <Text style={styles.guestBtnText}>Créer un compte</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onNavigateToProfile} activeOpacity={0.7}>
          <Text style={styles.guestLoginLink}>Déjà un compte ? Se connecter</Text>
        </TouchableOpacity>
      </LinearGradient>

      <View style={styles.rulesSection}>
        <Text style={styles.rulesSectionTitle}>Comment ça marche ?</Text>
        {[
          { icon: '🪙', title: '200 pièces offertes', desc: 'À l\'inscription, reçois 200 pièces pour commencer.' },
          { icon: '🎯', title: 'Mise ton prono', desc: 'Choisis victoire domicile, nul ou victoire extérieur.' },
          { icon: '📈', title: 'Cotes en temps réel', desc: 'Les cotes sont personnalisées avant chaque match.' },
          { icon: '🏆', title: 'Gagne des pièces', desc: 'Prono gagnant = mise × cote. Résultat après le match.' },
        ].map(rule => (
          <View key={rule.icon} style={styles.ruleCard}>
            <Text style={styles.ruleIcon}>{rule.icon}</Text>
            <View style={styles.ruleText}>
              <Text style={styles.ruleTitle}>{rule.title}</Text>
              <Text style={styles.ruleDesc}>{rule.desc}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────────

interface Props {
  onNavigateToProfile: () => void;
}

export default function PronosticsScreen({ onNavigateToProfile }: Props) {
  const { isAuthenticated, user } = useAuth();
  const { pronoMatches, isLoading, getBet, placeBet } = useProno();
  const insets = useSafeAreaInsets();

  if (!isAuthenticated) {
    return (
      <View style={styles.root}>
        <StatusBar barStyle="light-content" />
        <View style={styles.header}>
          <Text style={styles.headerTitle}>🎯 Pronostics</Text>
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>
          <GuestScreen onNavigateToProfile={onNavigateToProfile} />
          <View style={{ height: Spacing.xxl }} />
        </ScrollView>
        <AdBanner style={{ paddingBottom: insets.bottom }} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🎯 Pronostics</Text>
        <View style={styles.coinsChip}>
          <Text style={styles.coinsText}>🪙 {user!.coins}</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.listHeader}>
            <Text style={styles.listHeaderText}>3 prochains matchs · 1 mise par match</Text>
          </View>

          {/* Bouton pub récompensée — visible uniquement quand une pub est disponible */}
          <View style={styles.rewardedWrap}>
            <RewardedAdButton />
          </View>

          <View style={styles.list}>
            {isLoading ? (
              <View style={styles.empty}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.emptyText}>Chargement des matchs...</Text>
              </View>
            ) : pronoMatches.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>😴</Text>
                <Text style={styles.emptyText}>Aucun match à venir pour l'instant</Text>
              </View>
            ) : (
              pronoMatches.map(match => (
                <PronoCard
                  key={match.id}
                  match={match}
                  bet={getBet(match.id)}
                  userCoins={user!.coins}
                  onPlaceBet={placeBet}
                />
              ))
            )}
          </View>
          <View style={{ height: Spacing.xxl }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bannière sticky en bas — au-dessus de la safe area */}
      <AdBanner style={{ paddingBottom: insets.bottom }} />
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  header: {
    paddingTop: 60,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  headerTitle: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text },

  coinsChip: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.gold,
  },
  coinsText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.gold },

  rewardedWrap: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  listHeader: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },
  listHeaderText: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },

  list: { paddingHorizontal: Spacing.md, gap: Spacing.md },

  // Card
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  cardLive: { borderColor: Colors.primary },

  liveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' },
  liveText: { color: '#fff', fontSize: FontSize.xs, fontWeight: '800', letterSpacing: 1 },

  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  competition: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  matchDate: { fontSize: FontSize.xs, color: Colors.gold, fontWeight: '600' },

  teamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  teamBlock: { flex: 1, alignItems: 'center', gap: 4 },
  teamLogo: { fontSize: 30 },
  teamName: { fontSize: FontSize.xs, color: Colors.text, textAlign: 'center', fontWeight: '700' },
  teamSub: { fontSize: 10, color: Colors.textMuted, fontWeight: '500' },
  vsBlock: { paddingHorizontal: 4 },
  vsText: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: '800' },

  // Odds
  oddsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  oddsBtn: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: 6,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    gap: 2,
  },
  oddsBtnDisabled: { opacity: 0.45 },
  oddsBtnSelected: { backgroundColor: Colors.gold + '22', borderColor: Colors.gold },
  oddsBtnBetOn: { backgroundColor: Colors.win + '22', borderColor: Colors.win },

  oddsBtnLabel: { fontSize: 10, color: Colors.textSecondary, fontWeight: '700', textTransform: 'uppercase' },
  oddsBtnLabelDisabled: { color: Colors.textMuted },
  oddsBtnLabelActive: { color: Colors.text },

  oddsBtnValue: { fontSize: FontSize.md, color: Colors.textSecondary, fontWeight: '800' },
  oddsBtnValueDisabled: { color: Colors.textMuted },
  oddsBtnValueActive: { color: Colors.gold },

  // Status messages
  statusMsg: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: '#1E1E1E',
    alignItems: 'center',
  },
  statusMsgText: { color: Colors.textMuted, fontSize: FontSize.xs, fontWeight: '600' },
  statusMsgLive: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primary + '22',
    alignItems: 'center',
  },
  statusMsgLiveText: { color: Colors.primary, fontSize: FontSize.xs, fontWeight: '700' },

  // Bet section
  betSection: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.md,
  },
  betSectionTitle: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '600' },

  betInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
  },
  betInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: FontSize.md,
    color: Colors.text,
    fontWeight: '700',
  },
  betInputIcon: { fontSize: 18 },

  gainBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.gold + '15',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gold + '44',
  },
  gainLabel: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '600' },
  gainValue: { fontSize: FontSize.lg, color: Colors.gold, fontWeight: '800' },
  gainProfitBadge: {
    backgroundColor: Colors.gold + '25',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
  },
  gainProfitText: { color: Colors.gold, fontSize: FontSize.xs, fontWeight: '700' },

  confirmBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmBtnText: { color: '#fff', fontWeight: '800', fontSize: FontSize.md },

  // Confirmed bet
  confirmedBet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.win + '15',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.win + '44',
    borderTopWidth: 1,
  },
  confirmedIconWrap: {},
  confirmedIcon: { fontSize: 22 },
  confirmedLabel: { color: Colors.text, fontWeight: '700', fontSize: FontSize.sm },
  confirmedSub: { color: Colors.textSecondary, fontSize: FontSize.xs, marginTop: 2 },

  // Guest
  guestContainer: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md },
  guestCard: { borderRadius: BorderRadius.lg, padding: Spacing.xl, alignItems: 'center', marginBottom: Spacing.lg },
  guestEmoji: { fontSize: 56, marginBottom: Spacing.md },
  guestTitle: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.text, marginBottom: Spacing.sm },
  guestText: { fontSize: FontSize.md, color: 'rgba(255,255,255,0.8)', textAlign: 'center', lineHeight: 22, marginBottom: Spacing.lg },
  guestBtn: {
    backgroundColor: Colors.text,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.md,
    width: '100%',
    alignItems: 'center',
  },
  guestBtnText: { color: Colors.primary, fontWeight: '800', fontSize: FontSize.md },
  guestLoginLink: { color: 'rgba(255,255,255,0.6)', fontSize: FontSize.sm, textDecorationLine: 'underline' },

  rulesSection: { gap: Spacing.sm },
  rulesSectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text, marginBottom: Spacing.sm },
  ruleCard: {
    flexDirection: 'row',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  ruleIcon: { fontSize: 28 },
  ruleText: { flex: 1 },
  ruleTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  ruleDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 18 },

  empty: { alignItems: 'center', paddingTop: Spacing.xxl, gap: Spacing.md },
  emptyEmoji: { fontSize: 48 },
  emptyText: { fontSize: FontSize.md, color: Colors.textSecondary },
});
