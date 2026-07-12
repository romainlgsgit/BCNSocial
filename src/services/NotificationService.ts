import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { doc, setDoc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';

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

// Envoie une notif push à tous les users avec liveNotifEnabled
// Déduplication : un seul appareil envoie par event (scoreKey unique)
async function broadcastPush(scoreKey: string, title: string, body: string): Promise<void> {
  try {
    const notifRef = doc(db, 'liveMatch', 'lastGoalNotif');
    const existing = await getDoc(notifRef);
    if (existing.exists() && existing.data()?.scoreKey === scoreKey) return; // déjà envoyé

    await setDoc(notifRef, { scoreKey, sentAt: new Date().toISOString() });

    const usersSnap = await getDocs(
      query(collection(db, 'users'), where('liveNotifEnabled', '==', true))
    );
    const tokens: string[] = [];
    usersSnap.docs.forEach(d => {
      const token = d.data().expoPushToken as string | undefined;
      if (token?.startsWith('ExponentPushToken')) tokens.push(token);
    });
    if (!tokens.length) return;

    const messages = tokens.map(to => ({
      to, title, body, sound: 'default',
      data: { type: 'goal' },
    }));

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
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
  goalsCount: number
) {
  const baseTitle = isBarca ? '⚽ BUT DU BARÇA !!!' : `⚽ But de ${scoringTeam}`;
  const title = goalsCount > 1 ? `${baseTitle} (x${goalsCount})` : baseTitle;
  const body = `${homeTeam}  ${homeScore} - ${awayScore}  ${awayTeam}`;

  // Notif locale (pour cet appareil)
  await scheduleLocal(title, body);

  // Push à tous les abonnés via Expo
  const scoreKey = `${homeScore}-${awayScore}`;
  await broadcastPush(scoreKey, title, body);
}

export async function sendMatchEndNotification(
  homeTeam: string,
  awayTeam: string,
  homeScore: number,
  awayScore: number
) {
  const title = '🏁 Fin du match';
  const body = `Score final : ${homeTeam}  ${homeScore} - ${awayScore}  ${awayTeam}`;
  await scheduleLocal(title, body);
  await broadcastPush(`FT-${homeScore}-${awayScore}`, title, body);
}
