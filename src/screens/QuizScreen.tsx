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
import { getLevelInfo } from '../utils/levels';
import AdBanner from '../components/AdBanner';

type Phase = 'intro' | 'playing' | 'result';

// ─── Carte de progression de niveau ─────────────────────────────────────────────
function LevelCard({ points }: { points: number }) {
  const { tier, nextTier, progress, pointsForNextLevel } = getLevelInfo(points);
  return (
    <View style={styles.levelCard}>
      <View style={styles.levelHeader}>
        <Text style={styles.levelEmoji}>{tier.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.levelTitle}>Niv. {tier.level} · {tier.title}</Text>
          <Text style={styles.levelPoints}>{points} pts</Text>
        </View>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>
      <Text style={styles.levelNext}>
        {nextTier
          ? `Encore ${pointsForNextLevel} pts → ${nextTier.title}`
          : 'Niveau maximum atteint 👑'}
      </Text>
    </View>
  );
}

// ─── Guest ───────────────────────────────────────────────────────────────────
function GuestScreen({ onNavigateToProfile }: { onNavigateToProfile: () => void }) {
  return (
    <View style={styles.guestContainer}>
      <LinearGradient colors={[Colors.secondary, '#012B57']} style={styles.guestCard}>
        <Text style={styles.guestEmoji}>🧠</Text>
        <Text style={styles.guestTitle}>Quiz du jour !</Text>
        <Text style={styles.guestText}>
          Teste tes connaissances sur le Barça chaque jour, gagne des points, grimpe les niveaux
          et garde ta série en vie — même en pleine intersaison.
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
  const { isAuthenticated, user } = useAuth();
  const { questions, state, hasPlayedToday, submitQuiz } = useQuiz();
  const insets = useSafeAreaInsets();

  const [phase, setPhase] = useState<Phase>('intro');
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [reward, setReward] = useState<QuizReward | null>(null);

  const resetAndStart = () => {
    setCurrent(0);
    setSelected(null);
    setCorrectCount(0);
    setReward(null);
    setPhase('playing');
  };

  const question = questions[current];
  const isLast = current === questions.length - 1;
  const answered = selected !== null;

  const handleSelect = (index: number) => {
    if (answered) return;
    setSelected(index);
    if (index === question.correctIndex) setCorrectCount(c => c + 1);
  };

  const handleNext = async () => {
    if (isLast) {
      const finalCorrect = correctCount; // déjà à jour (incrémenté au tap)
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
      <Header streak={state.streak} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* ─── INTRO ─── */}
        {phase === 'intro' && (
          <>
            <LevelCard points={user!.points} />

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

            <View style={styles.statsRow}>
              <StatBox icon="flame" color={Colors.draw} value={state.streak} label="Série" />
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

            <View style={styles.optionsList}>
              {question.options.map((opt, i) => {
                const isCorrect = i === question.correctIndex;
                const isPicked = selected === i;
                const showCorrect = answered && isCorrect;
                const showWrong = answered && isPicked && !isCorrect;
                return (
                  <TouchableOpacity
                    key={i}
                    style={[
                      styles.option,
                      showCorrect && styles.optionCorrect,
                      showWrong && styles.optionWrong,
                    ]}
                    onPress={() => handleSelect(i)}
                    activeOpacity={answered ? 1 : 0.7}
                  >
                    <Text style={[styles.optionText, (showCorrect || showWrong) && styles.optionTextActive]}>{opt}</Text>
                    {answered && isCorrect && (
                      <Ionicons name="checkmark-circle" size={20} color={Colors.win} />
                    )}
                    {answered && isPicked && !isCorrect && (
                      <Ionicons name="close-circle" size={20} color={Colors.loss} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {answered && (
              <TouchableOpacity style={styles.nextBtn} onPress={handleNext} activeOpacity={0.85}>
                <Text style={styles.nextBtnText}>
                  {isLast ? 'Voir mon résultat' : 'Question suivante'}
                </Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </TouchableOpacity>
            )}
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

            <LevelCard points={user!.points} />

            <View style={styles.doneCard}>
              <Text style={styles.doneSub}>
                Reviens demain pour un nouveau quiz et garder ta série en vie 🔥
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
      {streak > 0 && (
        <View style={styles.streakChip}>
          <Text style={styles.streakText}>🔥 {streak}</Text>
        </View>
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

  // Level card
  levelCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  levelHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  levelEmoji: { fontSize: 30 },
  levelTitle: { fontSize: FontSize.md, fontWeight: '800', color: Colors.text },
  levelPoints: { fontSize: FontSize.xs, color: Colors.gold, fontWeight: '700', marginTop: 2 },
  progressTrack: {
    height: 8,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: Colors.gold, borderRadius: BorderRadius.full },
  levelNext: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '600' },

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
  optionText: { fontSize: FontSize.md, color: Colors.text, fontWeight: '600', flex: 1 },
  optionTextActive: { fontWeight: '700' },

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
