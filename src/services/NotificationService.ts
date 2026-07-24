import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { doc, collection, query, where, getDocs, runTransaction } from 'firebase/firestore';
import { db } from '../config/firebase';

// L'API push d'Expo accepte au maximum 100 messages par requête.
const EXPO_PUSH_CHUNK = 100;

// Coupe-circuit du fan-out. Sert au test du direct hors saison : la notif locale
// part toujours (on veut vérifier la détection), mais aucun push n'est envoyé aux
// vrais utilisateurs — sinon un but du match de test leur arriverait comme un but
// du Barça.
let broadcastEnabled = true;
export function setPushBroadcastEnabled(enabled: boolean) {
  broadcastEnabled = enabled;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('match-events', {
      name: 'Événements match',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
    });
  }
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

async function scheduleLocal(title: string, body: string) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true },
    trigger: null,
  });
}

// Envoie une notif push à tous les users avec liveNotifEnabled.
// Déduplication ATOMIQUE : tous les appareils détectent le but quasi simultanément,
// donc un simple getDoc + setDoc laisse passer plusieurs émetteurs (les uns lisent
// avant que le premier n'ait écrit) → l'utilisateur reçoit le même but N fois.
// La transaction garantit qu'un seul appareil remporte le droit d'émettre.
async function broadcastPush(scoreKey: string, title: string, body: string): Promise<void> {
  if (!broadcastEnabled) return;
  try {
    const notifRef = doc(db, 'liveMatch', 'lastGoalNotif');

    const won = await runTransaction(db, async tx => {
      const snap = await tx.get(notifRef);
      if (snap.exists() && snap.data()?.scoreKey === scoreKey) return false; // déjà envoyé
      tx.set(notifRef, { scoreKey, sentAt: new Date().toISOString() });
      return true;
    });
    if (!won) return;

    const usersSnap = await getDocs(
      query(collection(db, 'users'), where('liveNotifEnabled', '==', true))
    );
    const tokens: string[] = [];
    usersSnap.docs.forEach(d => {
      const token = d.data().expoPushToken as string | undefined;
      if (token?.startsWith('ExponentPushToken')) tokens.push(token);
    });
    if (!tokens.length) return;

    for (let i = 0; i < tokens.length; i += EXPO_PUSH_CHUNK) {
      const messages = tokens.slice(i, i + EXPO_PUSH_CHUNK).map(to => ({
        to, title, body, sound: 'default',
        data: { type: 'goal' },
      }));
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages),
      }).catch(() => {});
    }
  } catch {}
}

export async function sendMatchStartNotification(homeTeam: string, awayTeam: string) {
  await scheduleLocal("⚽ Coup d'envoi !", `${homeTeam} vs ${awayTeam} vient de commencer !`);
}

export async function sendGoalNotification(
  scoringTeam: string,
  homeTeam: string,
  awayTeam: string,
  homeScore: number,
  awayScore: number,
  isBarca: boolean,
  goalsCount: number,
  eventId?: string | null
) {
  const baseTitle = isBarca ? '⚽ BUT DU BARÇA !!!' : `⚽ But de ${scoringTeam}`;
  const title = goalsCount > 1 ? `${baseTitle} (x${goalsCount})` : baseTitle;
  const body = `${homeTeam}  ${homeScore} - ${awayScore}  ${awayTeam}`;

  // Notif locale (pour cet appareil)
  await scheduleLocal(title, body);

  // Push à tous les abonnés via Expo. La clé inclut l'ID du match : sans lui, un
  // score identique au match précédent serait pris pour un doublon et supprimé.
  const scoreKey = `${eventId ?? 'x'}-${homeScore}-${awayScore}`;
  await broadcastPush(scoreKey, title, body);
}

// ─── Rappel quotidien du quiz (série en cours) ─────────────────────────────────

const QUIZ_REMINDER_ID = 'quiz-daily-reminder';

/**
 * Planifie le rappel de 9h (heure de Paris) pour la PROCHAINE sortie de quiz.
 *
 * Volontairement une notification UNIQUE, replanifiée à chaque quiz joué, et non
 * un rappel quotidien récurrent : si l'utilisateur laisse tomber, sa série meurt et
 * il ne doit plus être relancé. Un déclencheur récurrent continuerait de sonner tous
 * les matins alors qu'il n'y a plus de série à sauver — exactement ce qu'on ne veut pas.
 */
export async function scheduleQuizStreakReminder(streak: number, when: Date): Promise<void> {
  await cancelQuizStreakReminder();
  if (streak <= 0) return; // pas de série → pas de rappel

  const seconds = Math.floor((when.getTime() - Date.now()) / 1000);
  if (seconds <= 0) return;

  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    await Notifications.scheduleNotificationAsync({
      identifier: QUIZ_REMINDER_ID,
      content: {
        title: `🔥 Ta série de ${streak} jour${streak > 1 ? 's' : ''} t'attend`,
        body: 'Le nouveau quiz du jour est disponible. Réponds pour garder ta flamme !',
        sound: true,
        data: { type: 'quiz_streak' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
        repeats: false,
      },
    });
  } catch {
    // Permission refusée ou API indisponible : le quiz reste jouable, on n'insiste pas.
  }
}

export async function cancelQuizStreakReminder(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(QUIZ_REMINDER_ID);
  } catch {
    // Aucun rappel planifié : rien à annuler.
  }
}

export async function sendMatchEndNotification(
  homeTeam: string,
  awayTeam: string,
  homeScore: number,
  awayScore: number,
  eventId?: string | null
) {
  const title = '🏁 Fin du match';
  const body = `Score final : ${homeTeam}  ${homeScore} - ${awayScore}  ${awayTeam}`;
  await scheduleLocal(title, body);
  await broadcastPush(`FT-${eventId ?? 'x'}-${homeScore}-${awayScore}`, title, body);
}
