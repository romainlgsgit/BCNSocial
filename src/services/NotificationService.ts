import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

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

async function schedule(title: string, body: string) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true },
    trigger: null,
  });
}

export async function sendMatchStartNotification(homeTeam: string, awayTeam: string) {
  await schedule(
    "⚽ Coup d'envoi !",
    `${homeTeam} vs ${awayTeam} vient de commencer !`
  );
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
  await schedule(title, body);
}

export async function sendMatchEndNotification(
  homeTeam: string,
  awayTeam: string,
  homeScore: number,
  awayScore: number
) {
  await schedule(
    '🏁 Fin du match',
    `Score final : ${homeTeam}  ${homeScore} - ${awayScore}  ${awayTeam}`
  );
}
