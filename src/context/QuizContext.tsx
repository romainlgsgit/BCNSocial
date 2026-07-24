import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from './AuthContext';
import { getDailyQuestions, QuizQuestion, DAILY_QUESTION_COUNT } from '../data/quizData';
import { quizDayKey, nextReleaseDate, effectiveStreak, nextStreak } from '../utils/quizDay';
import { tierForStreak } from '../utils/streakBadges';
import { scheduleQuizStreakReminder, cancelQuizStreakReminder } from '../services/NotificationService';

// ─── Barème ──────────────────────────────────────────────────────────────────
export const POINTS_PER_CORRECT = 10;
export const PERFECT_BONUS = 25; // bonus sans-faute
export const COINS_PER_CORRECT = 10; // 1/5 → 10 pièces, 5/5 → 50 pièces
const STREAK_POINT_BONUS = 5; // points par jour de série (plafonné)
const MAX_STREAK_BONUS_DAYS = 10;

export interface QuizState {
  lastPlayedDate?: string; // YYYY-MM-DD de la dernière journée de quiz jouée
  streak: number; // série de jours consécutifs (valeur BRUTE, peut être périmée)
  bestStreak: number;
  totalCorrect: number;
  totalAnswered: number;
  // résultat du dernier quiz joué (pour ré-afficher après coup)
  lastCorrect?: number;
  lastPointsEarned?: number;
  lastCoinsEarned?: number;
}

export interface QuizReward {
  correct: number;
  total: number;
  pointsEarned: number;
  coinsEarned: number;
  streak: number;
  perfect: boolean;
  /** Palier de badge atteint avec CE quiz (null si aucun nouveau palier). */
  unlockedTierId: string | null;
}

interface QuizContextType {
  questions: QuizQuestion[]; // les questions du jour
  state: QuizState;
  hasPlayedToday: boolean;
  /** Série réellement en cours : 0 si un jour a été manqué (le badge tombe avec). */
  currentStreak: number;
  submitQuiz: (correctCount: number) => Promise<QuizReward>;
}

const QuizContext = createContext<QuizContextType | undefined>(undefined);

const EMPTY_STATE: QuizState = { streak: 0, bestStreak: 0, totalCorrect: 0, totalAnswered: 0 };

export function QuizProvider({ children }: { children: ReactNode }) {
  const { user, addPoints, updateCoins } = useAuth();
  const [state, setState] = useState<QuizState>(EMPTY_STATE);

  const today = quizDayKey();
  // La journée de quiz bascule à 9h Paris : recalculer les questions à chaque rendu
  // serait inutile, mais elles doivent changer quand `today` change.
  const questions = useMemo(() => getDailyQuestions(), [today]);

  // Charge l'état du quiz de l'utilisateur depuis Firestore
  useEffect(() => {
    if (!user) { setState(EMPTY_STATE); return; }
    const unsub = onSnapshot(
      doc(db, 'quizResults', user.id),
      (snap) => {
        setState(snap.exists() ? { ...EMPTY_STATE, ...(snap.data() as QuizState) } : EMPTY_STATE);
      },
      () => { /* lecture refusée / hors-ligne : on reste sur l'état vide */ },
    );
    return () => unsub();
  }, [user?.id]);

  const hasPlayedToday = state.lastPlayedDate === today;
  const currentStreak = effectiveStreak(state.streak, state.lastPlayedDate, today);

  // Une série morte doit cesser de relancer l'utilisateur : si la valeur stockée est
  // périmée (jour manqué), on annule le rappel encore planifié sur l'appareil.
  useEffect(() => {
    if (!user) { cancelQuizStreakReminder().catch(() => {}); return; }
    if (state.lastPlayedDate && currentStreak === 0) {
      cancelQuizStreakReminder().catch(() => {});
    }
  }, [user?.id, currentStreak, state.lastPlayedDate]);

  const submitQuiz = async (correctCount: number): Promise<QuizReward> => {
    const correct = Math.max(0, Math.min(DAILY_QUESTION_COUNT, correctCount));
    const perfect = correct === DAILY_QUESTION_COUNT;

    const newStreak = nextStreak(state.streak, state.lastPlayedDate, today);
    const streakBonus = Math.min(newStreak, MAX_STREAK_BONUS_DAYS) * STREAK_POINT_BONUS;

    const pointsEarned =
      correct * POINTS_PER_CORRECT + (perfect ? PERFECT_BONUS : 0) + streakBonus;
    const coinsEarned = correct * COINS_PER_CORRECT;

    // Nouveau palier franchi avec ce quiz ?
    const beforeTier = tierForStreak(currentStreak);
    const afterTier = tierForStreak(newStreak);
    const unlockedTierId =
      afterTier && afterTier.id !== beforeTier?.id ? afterTier.id : null;

    const next: QuizState = {
      lastPlayedDate: today,
      streak: newStreak,
      bestStreak: Math.max(state.bestStreak, newStreak),
      totalCorrect: state.totalCorrect + correct,
      totalAnswered: state.totalAnswered + DAILY_QUESTION_COUNT,
      lastCorrect: correct,
      lastPointsEarned: pointsEarned,
      lastCoinsEarned: coinsEarned,
    };

    // Optimiste : on applique localement puis on persiste
    setState(next);
    addPoints(pointsEarned);
    if (coinsEarned > 0) updateCoins(coinsEarned);

    if (user) {
      try {
        await setDoc(doc(db, 'quizResults', user.id), next);
      } catch {}
      // La série est AUSSI recopiée sur le doc `users` : c'est la seule collection
      // lisible par les autres membres, donc la seule façon d'afficher le badge de
      // quelqu'un d'autre sur son avatar (quizResults est privé à son propriétaire).
      try {
        await updateDoc(doc(db, 'users', user.id), {
          quizStreak: newStreak,
          quizLastPlayed: today,
        });
      } catch {}
    }

    // Rappel pour la prochaine sortie (9h Paris). Replanifié à chaque quiz joué.
    scheduleQuizStreakReminder(newStreak, nextReleaseDate()).catch(() => {});

    return {
      correct,
      total: DAILY_QUESTION_COUNT,
      pointsEarned,
      coinsEarned,
      streak: newStreak,
      perfect,
      unlockedTierId,
    };
  };

  return (
    <QuizContext.Provider value={{ questions, state, hasPlayedToday, currentStreak, submitQuiz }}>
      {children}
    </QuizContext.Provider>
  );
}

export function useQuiz() {
  const ctx = useContext(QuizContext);
  if (!ctx) throw new Error('useQuiz must be used inside QuizProvider');
  return ctx;
}
