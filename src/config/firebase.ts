import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: 'AIzaSyCKAx9-nE1_f054t3Xem744WLF3_SFY9Gc',
  authDomain: 'barca-app-b0795.firebaseapp.com',
  projectId: 'barca-app-b0795',
  storageBucket: 'barca-app-b0795.firebasestorage.app',
  messagingSenderId: '1000501829244',
  appId: '1:1000501829244:web:158a35de04d20c4d5a33f9',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage),
  });
} catch {
  auth = getAuth(app);
}

export const db = getFirestore(app);
export { auth };
export default app;
