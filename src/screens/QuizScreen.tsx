import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';
import { useAuth } from '../context/AuthContext';
import {
  useQuiz,
  QuizReward,
  POINTS_PER_CORRECT,
  PERFECT_BONUS,
  COINS_PER_CORRECT,
} from '../context/QuizContext';
import AdBanner from '../components/AdBanner';
import StreakBadge from '../components/StreakBadge';
import { STREAK_TIERS, tierForStreak, nextTierForStreak, daysToNextTier } from '../utils/streakBadges';

type Phase = 'intro' | 'playing' | 'result';

// ─── Guest ───────────────────────────────────────────────────────────────────
function GuestScreen({ onNavigateToProfile }: { onNavigateToProfile: () => void }) {
  return (
    <View style={styles.guestContainer}>
      <LinearGradient colors={[Colors.secondary, '#012B57']} style={styles.guestCard}>
        <Text style={styles.guestEmoji}>🧠</Text>
        <Text style={styles.guestTitle}>Quiz du jour !</Text>
        <Text style={styles.guestText}>
          Teste tes connaissances sur le Barça chaque jour, gagne des points, débloque les badges
          de série et garde ta série en vie — même en pleine intersaison.
        </Text>
        <TouchableOpacity style={styles.guestBtn} onPress={onNavigateToProfile} activeOpacity={0.85}>
          <Text style={styles.guestBtnText}>Créer un compte</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onNavigateToProfile} activeOpacity={0.7}>
          <Text style={styles.guestLoginLink}>Déjà un compte ? Se connecter</Text>
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );
}

// ─── Écran principal ───────────────────────────────────────────────────────────
interface Props {
  onNavigateToProfile: () => void;
}

export default function QuizScreen({ onNavigateToProfile }: Props) {
  const { isAuthenticated } = useAuth();
  const { questions, state, hasPlayedToday, currentStreak, submitQuiz } = useQuiz();
  const insets = useSafeAreaInsets();

  const [phase, setPhase] = useState<Phase>('intro');
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  // Réponses données, dans l'ordre des questions. La correction n'est révélée
  // qu'à la fin : pendant le quiz on mémorise sans jamais afficher le verdict.
  const [answers, setAnswers] = useState<number[]>([]);
  const [reward, setReward] = useState<QuizReward | null>(null);

  const resetAndStart = () => {
    setCurrent(0);
    setSelected(null);
    setAnswers([]);
    setReward(null);
    setPhase('playing');
  };

  const question = questions[current];
  const isLast = current === questions.length - 1;
  const answered = selected !== null;

  const handleSelect = (index: number) => {
    setSelected(index); // modifiable tant qu'on n'a pas validé
  };

  const handleNext = async () => {
    if (selected === null) return;
    const nextAnswers = [...answers, selected];
    setAnswers(nextAnswers);

    if (isLast) {
      const finalCorrect = nextAnswers.reduce(
        (acc, a, i) => acc + (a === questions[i].correctIndex ? 1 : 0),
        0,
      );
      const r = await submitQuiz(finalCorrect);
      setReward(r);
      setPhase('result');
    } else {
      setCurrent(c => c + 1);
      setSelected(null);
    }
  };

  if (!isAuthenticated) {
    return (
      <View style={styles.root}>
        <StatusBar barStyle="light-content" />
        <Header streak={0} />
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
      <Header streak={currentStreak} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* ─── INTRO ─── */}
        {phase === 'intro' && (
          <>
            {hasPlayedToday ? (
              <View style={styles.doneCard}>
                <Text style={styles.doneEmoji}>✅</Text>
                <Text style={styles.doneTitle}>Quiz du jour terminé !</Text>
                <Text style={styles.doneText}>
                  Score : {state.lastCorrect ?? 0}/{questions.length} · +{state.lastPointsEarned ?? 0} pts
                  {state.lastCoinsEarned ? ` · +${state.lastCoinsEarned} 🪙` : ''}
                </Text>
                <Text style={styles.doneSub}>Reviens demain pour un nouveau quiz et garder ta série 🔥</Text>
              </View>
            ) : (
              <View style={styles.introCard}>
                <Text style={styles.introEmoji}>🧠</Text>
                <Text style={styles.introTitle}>Quiz du jour</Text>
                <Text style={styles.introText}>
                  {questions.length} questions sur le Barça. Réponds juste pour gagner des points
                  et des pièces, et fais grimper ta série !
                </Text>

                <View style={styles.rewardRow}>
                  <View style={styles.rewardPill}>
                    <Text style={styles.rewardPillValue}>+{POINTS_PER_CORRECT}</Text>
                    <Text style={styles.rewardPillLabel}>pts / bonne</Text>
                  </View>
                  <View style={styles.rewardPill}>
                    <Text style={styles.rewardPillValue}>+{COINS_PER_CORRECT} 🪙</Text>
                    <Text style={styles.rewardPillLabel}>/ bonne</Text>
                  </View>
                  <View style={styles.rewardPill}>
                    <Text style={styles.rewardPillValue}>+{PERFECT_BONUS}</Text>
                    <Text style={styles.rewardPillLabel}>sans-faute</Text>
                  </View>
                </View>

                <TouchableOpacity style={styles.playBtn} onPress={resetAndStart} activeOpacity={0.85}>
                  <Text style={styles.playBtnText}>🎮 Jouer maintenant</Text>
                </TouchableOpacity>
              </View>
            )}

            <StreakProgressCard streak={currentStreak} />

            <View style={styles.statsRow}>
              <StatBox icon="flame" color={Colors.draw} value={currentStreak} label="Série" />
              <StatBox icon="trophy" color={Colors.gold} value={state.bestStreak} label="Record" />
              <StatBox
                icon="checkmark-circle"
                color={Colors.win}
                value={state.totalCorrect}
                label="Bonnes rép."
              />
            </View>
          </>
        )}

        {/* ─── PLAYING ─── */}
        {phase === 'playing' && question && (
          <View style={styles.quizCard}>
            <View style={styles.progressRow}>
              <Text style={styles.progressText}>
                Question {current + 1}/{questions.length}
              </Text>
              <Text style={styles.categoryTag}>{question.category}</Text>
            </View>
            <View style={styles.questionProgressTrack}>
              <View
                style={[
                  styles.questionProgressFill,
                  { width: `${((current + 1) / questions.length) * 100}%` },
                ]}
              />
            </View>

            <Text style={styles.questionText}>{question.question}</Text>

            {/* Aucune correction ici : on marque seulement le choix de l'utilisateur.
                Le verdict et les bonnes réponses arrivent au récapitulatif final. */}
            <View style={styles.optionsList}>
              {question.options.map((opt, i) => {
                const isPicked = selected === i;
                return (
                  <TouchableOpacity
                    key={i}
                    style={[styles.option, isPicked && styles.optionPicked]}
                    onPress={() => handleSelect(i)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.optionText, isPicked && styles.optionTextActive]}>{opt}</Text>
                    <View style={[styles.radio, isPicked && styles.radioOn]}>
                      {isPicked && <View style={styles.radioDot} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.nextBtn, !answered && styles.nextBtnDisabled]}
              onPress={handleNext}
              activeOpacity={0.85}
              disabled={!answered}
            >
              <Text style={styles.nextBtnText}>
                {isLast ? 'Valider mes réponses' : 'Question suivante'}
              </Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </TouchableOpacity>
            {!answered && <Text style={styles.pickHint}>Choisis une réponse pour continuer</Text>}
          </View>
        )}

        {/* ─── RESULT ─── */}
        {phase === 'result' && reward && (
          <>
            <LinearGradient
              colors={reward.perfect ? [Colors.gold, '#B8860B'] : [Colors.primary, '#6B0030']}
              style={styles.resultCard}
            >
              <Text style={styles.resultEmoji}>{reward.perfect ? '🏆' : reward.correct >= 3 ? '🎉' : '💪'}</Text>
              <Text style={styles.resultScore}>
                {reward.correct}/{reward.total}
              </Text>
              <Text style={styles.resultTitle}>
                {reward.perfect
                  ? 'Sans-faute, légende !'
                  : reward.correct >= 3
                  ? 'Bien joué !'
                  : 'On révise et on revient !'}
              </Text>

              <View style={styles.resultRewards}>
                <View style={styles.resultRewardItem}>
                  <Text style={styles.resultRewardValue}>+{reward.pointsEarned}</Text>
                  <Text style={styles.resultRewardLabel}>points</Text>
                </View>
                {reward.coinsEarned > 0 && (
                  <View style={styles.resultRewardItem}>
                    <Text style={styles.resultRewardValue}>+{reward.coinsEarned} 🪙</Text>
                    <Text style={styles.resultRewardLabel}>pièces</Text>
                  </View>
                )}
                <View style={styles.resultRewardItem}>
                  <Text style={styles.resultRewardValue}>🔥 {reward.streak}</Text>
                  <Text style={styles.resultRewardLabel}>jours</Text>
                </View>
              </View>
            </LinearGradient>

            {reward.unlockedTierId && (
              <View style={styles.unlockCard}>
                <StreakBadge streak={reward.streak} size={54} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.unlockTitle}>Nouveau badge débloqué !</Text>
                  <Text style={styles.unlockText}>
                    {tierForStreak(reward.streak)?.name} · série de {reward.streak} jours.
                    Il s'affiche sur ta photo de profil.
                  </Text>
                </View>
              </View>
            )}

            <StreakProgressCard streak={reward.streak} />

            {/* ─── Correction, révélée seulement maintenant ─── */}
            <View style={styles.reviewCard}>
              <Text style={styles.reviewTitle}>Correction</Text>
              {questions.map((q, i) => {
                const given = answers[i];
                const good = given === q.correctIndex;
                return (
                  <View key={q.id} style={styles.reviewItem}>
                    <View style={styles.reviewHead}>
                      <View style={[styles.reviewMark, { backgroundColor: good ? Colors.win : Colors.loss }]}>
                        <Ionicons name={good ? 'checkmark' : 'close'} size={13} color="#fff" />
                      </View>
                      <Text style={styles.reviewQuestion}>{q.question}</Text>
                    </View>
                    {!good && (
                      <Text style={styles.reviewGiven}>
                        Ta réponse : <Text style={styles.reviewGivenBad}>{q.options[given]}</Text>
                      </Text>
                    )}
                    <Text style={styles.reviewAnswer}>
                      Bonne réponse : <Text style={styles.reviewAnswerGood}>{q.options[q.correctIndex]}</Text>
                    </Text>
                  </View>
                );
              })}
            </View>

            <View style={styles.doneCard}>
              <Text style={styles.doneSub}>
                Nouveau quiz demain à 9h — reviens pour garder ta série en vie 🔥
              </Text>
            </View>

            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => setPhase('intro')}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryBtnText}>Retour</Text>
            </TouchableOpacity>
          </>
        )}

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>

      <AdBanner style={{ paddingBottom: insets.bottom }} />
    </View>
  );
}

function Header({ streak }: { streak: number }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerTitleRow}>
        <Ionicons name="bulb" size={20} color={Colors.gold} />
        <Text style={styles.headerTitle}>Quiz</Text>
      </View>
      <View style={styles.headerRight}>
        {streak > 0 && (
          <View style={styles.streakChip}>
            <Text style={styles.streakText}>🔥 {streak}</Text>
          </View>
        )}
        <StreakBadge streak={streak} size={30} />
      </View>
    </View>
  );
}

/** Palier en cours + jours restants avant le suivant. */
function StreakProgressCard({ streak }: { streak: number }) {
  const tier = tierForStreak(streak);
  const next = nextTierForStreak(streak);
  const remaining = daysToNextTier(streak);

  const from = tier?.days ?? 0;
  const progress = next ? Math.max(0, Math.min(1, (streak - from) / (next.days - from))) : 1;

  return (
    <View style={styles.badgeCard}>
      <View style={styles.badgeCardHead}>
        {tier ? (
          <StreakBadge streak={streak} size={44} />
        ) : (
          <View style={styles.badgeEmpty}>
            <Ionicons name="lock-closed" size={18} color={Colors.textMuted} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.badgeCardTitle}>
            {tier ? `Badge ${tier.name}` : 'Aucun badge'}
          </Text>
          <Text style={styles.badgeCardSub}>
            {next
              ? `Encore ${remaining} jour${remaining > 1 ? 's' : ''} → badge ${next.name}`
              : 'Palier maximum atteint 👑'}
          </Text>
        </View>
      </View>

      <View style={styles.badgeTrack}>
        <View
          style={[
            styles.badgeFill,
            { width: `${Math.round(progress * 100)}%`, backgroundColor: next?.border ?? Colors.gold },
          ]}
        />
      </View>

      {/* Tous les paliers, pour montrer ce qu'il reste à viser */}
      <View style={styles.tierRow}>
        {STREAK_TIERS.map(t => {
          const owned = streak >= t.days;
          return (
            <View key={t.id} style={styles.tierItem}>
              <View style={{ opacity: owned ? 1 : 0.25 }}>
                <StreakBadge streak={t.days} size={22} showNumber={false} tier={t} />
              </View>
              <Text style={[styles.tierDays, owned && { color: Colors.text, fontWeight: '800' }]}>
                {t.days}j
              </Text>
            </View>
          );
        })}
      </View>

      {streak === 0 && (
        <Text style={styles.badgeWarn}>
          Une série s'arrête dès qu'un jour est manqué — et le badge disparaît avec elle.
        </Text>
      )}
    </View>
  );
}

function StatBox({
  icon,
  color,
  value,
  label,
}: {
  icon: any;
  color: string;
  value: number;
  label: string;
}) {
  return (
    <View style={styles.statBox}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.statBoxValue, { color }]}>{value}</Text>
      <Text style={styles.statBoxLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, gap: Spacing.md },

  header: {
    paddingTop: 60,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text },
  streakChip: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.draw,
  },
  streakText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.draw },

  // Intro
  introCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  introEmoji: { fontSize: 48, marginBottom: Spacing.sm },
  introTitle: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text, marginBottom: Spacing.xs },
  introText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  rewardRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  rewardPill: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rewardPillValue: { fontSize: FontSize.md, fontWeight: '800', color: Colors.gold },
  rewardPillLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: '600', marginTop: 2 },
  playBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: 14,
    width: '100%',
    alignItems: 'center',
  },
  playBtnText: { color: '#fff', fontWeight: '800', fontSize: FontSize.md },

  // Done (already played)
  doneCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: 6,
  },
  doneEmoji: { fontSize: 40 },
  doneTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  doneText: { fontSize: FontSize.sm, color: Colors.gold, fontWeight: '700' },
  doneSub: { fontSize: FontSize.xs, color: Colors.textSecondary, textAlign: 'center', lineHeight: 18 },

  // Stats row
  statsRow: { flexDirection: 'row', gap: Spacing.sm },
  statBox: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  statBoxValue: { fontSize: FontSize.lg, fontWeight: '800' },
  statBoxLabel: { fontSize: FontSize.xs, color: Colors.textSecondary },

  // Quiz card
  quizCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  progressText: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  categoryTag: {
    fontSize: 10,
    color: Colors.secondary,
    fontWeight: '800',
    textTransform: 'uppercase',
    backgroundColor: Colors.secondary + '22',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  questionProgressTrack: {
    height: 5,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  questionProgressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: BorderRadius.full },
  questionText: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
    lineHeight: 26,
    marginBottom: Spacing.md,
  },
  optionsList: { gap: Spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  optionCorrect: { backgroundColor: Colors.win + '22', borderColor: Colors.win },
  optionWrong: { backgroundColor: Colors.loss + '22', borderColor: Colors.loss },
  optionPicked: { backgroundColor: Colors.primary + '22', borderColor: Colors.primary },
  optionText: { fontSize: FontSize.md, color: Colors.text, fontWeight: '600', flex: 1 },
  optionTextActive: { fontWeight: '700' },
  radio: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2,
    borderColor: Colors.border, alignItems: 'center', justifyContent: 'center',
  },
  radioOn: { borderColor: Colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },
  pickHint: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.sm },

  // Carte de progression des badges
  badgeCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1,
    borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm,
  },
  badgeCardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  badgeEmpty: {
    width: 44, height: 60, borderRadius: BorderRadius.md, borderWidth: 1.5,
    borderColor: Colors.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  badgeCardTitle: { fontSize: FontSize.md, fontWeight: '800', color: Colors.text },
  badgeCardSub: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 3, lineHeight: 16 },
  badgeTrack: {
    height: 6, backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.full, overflow: 'hidden',
  },
  badgeFill: { height: '100%', borderRadius: BorderRadius.full },
  tierRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  tierItem: { alignItems: 'center', gap: 3, flex: 1 },
  tierDays: { fontSize: 9, color: Colors.textMuted, fontWeight: '600' },
  badgeWarn: { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, fontStyle: 'italic' },

  // Déblocage d'un palier
  unlockCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.gold + '14', borderRadius: BorderRadius.lg,
    borderWidth: 1.5, borderColor: Colors.gold + '55', padding: Spacing.md,
  },
  unlockTitle: { fontSize: FontSize.md, fontWeight: '800', color: Colors.gold },
  unlockText: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 3, lineHeight: 17 },

  // Correction de fin de quiz
  reviewCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1,
    borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm,
  },
  reviewTitle: {
    fontSize: FontSize.xs, fontWeight: '800', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  reviewItem: {
    gap: 3, paddingVertical: Spacing.sm,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  reviewHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  reviewMark: {
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  reviewQuestion: { flex: 1, fontSize: FontSize.sm, color: Colors.text, fontWeight: '700', lineHeight: 19 },
  reviewGiven: { fontSize: FontSize.xs, color: Colors.textMuted, marginLeft: 28 },
  reviewGivenBad: { color: Colors.loss, fontWeight: '700' },
  reviewAnswer: { fontSize: FontSize.xs, color: Colors.textMuted, marginLeft: 28 },
  reviewAnswerGood: { color: Colors.win, fontWeight: '700' },

  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: 14,
    marginTop: Spacing.md,
  },
  nextBtnText: { color: '#fff', fontWeight: '800', fontSize: FontSize.md },
  nextBtnDisabled: { opacity: 0.35 },

  // Result
  resultCard: { borderRadius: BorderRadius.lg, padding: Spacing.lg, alignItems: 'center' },
  resultEmoji: { fontSize: 52 },
  resultScore: { fontSize: FontSize.xxxl, fontWeight: '900', color: '#fff', marginTop: 4 },
  resultTitle: { fontSize: FontSize.md, fontWeight: '700', color: 'rgba(255,255,255,0.9)', marginBottom: Spacing.md },
  resultRewards: {
    flexDirection: 'row',
    gap: Spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  resultRewardItem: { alignItems: 'center' },
  resultRewardValue: { fontSize: FontSize.lg, fontWeight: '800', color: '#fff' },
  resultRewardLabel: { fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 2 },

  secondaryBtn: {
    borderRadius: BorderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  secondaryBtnText: { color: Colors.textSecondary, fontWeight: '700', fontSize: FontSize.md },

  // Guest
  guestContainer: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md },
  guestCard: { borderRadius: BorderRadius.lg, padding: Spacing.xl, alignItems: 'center' },
  guestEmoji: { fontSize: 56, marginBottom: Spacing.md },
  guestTitle: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.text, marginBottom: Spacing.sm },
  guestText: {
    fontSize: FontSize.md,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  guestBtn: {
    backgroundColor: Colors.text,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.md,
    width: '100%',
    alignItems: 'center',
  },
  guestBtnText: { color: Colors.secondary, fontWeight: '800', fontSize: FontSize.md },
  guestLoginLink: { color: 'rgba(255,255,255,0.6)', fontSize: FontSize.sm, textDecorationLine: 'underline' },
});
