import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from './AuthContext';
import { getDailyQuestions, getTodayKey, QuizQuestion, DAILY_QUESTION_COUNT } from '../data/quizData';

// ─── Barème ──────────────────────────────────────────────────────────────────
export const POINTS_PER_CORRECT = 10;
export const PERFECT_BONUS = 25; // bonus sans-faute
export const COINS_PER_CORRECT = 5; // alimente les pronos
const STREAK_POINT_BONUS = 5; // points par jour de série (plafonné)
const MAX_STREAK_BONUS_DAYS = 10;

export interface QuizState {
  lastPlayedDate?: string; // YYYY-MM-DD du dernier quiz joué
  streak: number; // série de jours consécutifs
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
}

interface QuizContextType {
  questions: QuizQuestion[]; // les questions du jour
  state: QuizState;
  hasPlayedToday: boolean;
  submitQuiz: (correctCount: number) => Promise<QuizReward>;
}

const QuizContext = createContext<QuizContextType | undefined>(undefined);

const EMPTY_STATE: QuizState = { streak: 0, bestStreak: 0, totalCorrect: 0, totalAnswered: 0 };

function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return getTodayKey(d);
}

export function QuizProvider({ children }: { children: ReactNode }) {
  const { user, addPoints, updateCoins } = useAuth();
  const [state, setState] = useState<QuizState>(EMPTY_STATE);

  const today = getTodayKey();
  const questions = getDailyQuestions();

  // Charge l'état du quiz de l'utilisateur depuis Firestore
  useEffect(() => {
    if (!user) { setState(EMPTY_STATE); return; }
    const unsub = onSnapshot(doc(db, 'quizResults', user.id), (snap) => {
      setState(snap.exists() ? { ...EMPTY_STATE, ...(snap.data() as QuizState) } : EMPTY_STATE);
    });
    return () => unsub();
  }, [user?.id]);

  const hasPlayedToday = state.lastPlayedDate === today;

  const submitQuiz = async (correctCount: number): Promise<QuizReward> => {
    const correct = Math.max(0, Math.min(DAILY_QUESTION_COUNT, correctCount));
    const perfect = correct === DAILY_QUESTION_COUNT;

    // Série : +1 si le dernier quiz datait d'hier, sinon on repart à 1
    const newStreak = state.lastPlayedDate === yesterdayKey() ? state.streak + 1 : 1;
    const streakBonus = Math.min(newStreak, MAX_STREAK_BONUS_DAYS) * STREAK_POINT_BONUS;

    const pointsEarned =
      correct * POINTS_PER_CORRECT + (perfect ? PERFECT_BONUS : 0) + streakBonus;
    const coinsEarned = correct * COINS_PER_CORRECT;

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
    }

    return { correct, total: DAILY_QUESTION_COUNT, pointsEarned, coinsEarned, streak: newStreak, perfect };
  };

  return (
    <QuizContext.Provider value={{ questions, state, hasPlayedToday, submitQuiz }}>
      {children}
    </QuizContext.Provider>
  );
}

export function useQuiz() {
  const ctx = useContext(QuizContext);
  if (!ctx) throw new Error('useQuiz must be used inside QuizProvider');
  return ctx;
}
