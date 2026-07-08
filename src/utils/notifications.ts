import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { doc, updateDoc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';

try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch {}

export async function registerPushToken(userId: string): Promise<void> {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: 'a5a8f932-8586-4dea-8571-51c41960c37c',
    });
    const token = tokenData.data;
    await updateDoc(doc(db, 'users', userId), { expoPushToken: token });
  } catch (e) {
    console.log('[Notif] registerPushToken error:', e);
  }
}

export async function sendMentionNotifications(
  mentions: { id: string; username: string }[],
  authorUsername: string,
  content: string,
): Promise<void> {
  try {
    const tokenPromises = mentions.map(async (m) => {
      const userSnap = await getDoc(doc(db, 'users', m.id));
      const data = userSnap.data();
      if (!data?.mentionNotifEnabled) return null;
      const token = data?.expoPushToken as string | undefined;
      return token?.startsWith('ExponentPushToken') ? token : null;
    });
    const tokens = (await Promise.all(tokenPromises)).filter(Boolean) as string[];
    if (!tokens.length) return;

    const messages = tokens.map(to => ({
      to,
      title: `${authorUsername} vous a mentionné`,
      body: content.slice(0, 120),
      sound: 'default',
      data: { type: 'mention', authorUsername },
    }));

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
  } catch {}
}

export async function sendPostNotifications(
  authorId: string,
  authorUsername: string,
  content: string,
  hasImage: boolean,
): Promise<void> {
  try {
    console.log('[Notif] sendPostNotifications pour:', authorId);

    const subsSnap = await getDocs(
      query(collection(db, 'notifSubscriptions'), where('targetUserId', '==', authorId))
    );
    if (subsSnap.empty) return;

    const tokenPromises = subsSnap.docs.map(async (subDoc) => {
      const subscriberId = subDoc.data().subscriberId as string;
      const userSnap = await getDoc(doc(db, 'users', subscriberId));
      const token = userSnap.data()?.expoPushToken as string | undefined;
        return token && token.startsWith('ExponentPushToken') ? token : null;
    });

    const tokens = (await Promise.all(tokenPromises)).filter(Boolean) as string[];
    if (!tokens.length) return;

    const body = content?.trim().slice(0, 120) || (hasImage ? '📸 a partagé une photo' : '');
    const messages = tokens.map(to => ({
      to,
      title: `${authorUsername} a publié`,
      body,
      sound: 'default',
      data: { type: 'new_post', authorId },
    }));

    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
    await res.json();
  } catch (e) {
    console.log('[Notif] sendPostNotifications error:', e);
  }
}
