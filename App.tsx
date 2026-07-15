import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import AppLovinMAX from 'react-native-applovin-max';
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { MatchProvider } from './src/context/MatchContext';
import { PronoProvider } from './src/context/PronoContext';
import { QuizProvider } from './src/context/QuizContext';
import { PlayersProvider } from './src/context/PlayersContext';
import { PremiumProvider, usePremium } from './src/context/PremiumContext';
import { RatingsProvider } from './src/context/RatingsContext';
import { FollowProvider } from './src/context/FollowContext';
import { BlockProvider } from './src/context/BlockContext';
import AppNavigator from './src/navigation/AppNavigator';
import PremiumScreen from './src/screens/PremiumScreen';
import { registerPushToken } from './src/utils/notifications';
import { APPLOVIN_SDK_KEY, ADS_CONFIGURED } from './src/config/ads';

function GlobalModals() {
  const { showPremiumScreen, closePremiumScreen } = usePremium();
  return <PremiumScreen visible={showPremiumScreen} onClose={closePremiumScreen} />;
}

function AppWithProviders() {
  const { user } = useAuth();

  useEffect(() => {
    // iOS ignore silencieusement la demande ATT (aucun popup, aucune erreur) si elle
    // arrive avant que la fenêtre de l'app soit key/active. On attend explicitement
    // l'état "active" de l'app, puis une marge de sécurité, avant de la déclencher.
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let sub: ReturnType<typeof AppState.addEventListener> | null = null;

    const triggerRequest = () => {
      timer = setTimeout(() => {
        if (cancelled) return;
        requestTrackingPermissionsAsync().then(() => {
          if (!ADS_CONFIGURED) return;
          AppLovinMAX.initialize(APPLOVIN_SDK_KEY).catch(() => {});
        });
      }, 700);
    };

    if (AppState.currentState === 'active') {
      triggerRequest();
    } else {
      sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          sub?.remove();
          triggerRequest();
        }
      });
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      sub?.remove();
    };
  }, []);

  useEffect(() => {
    if (user?.id) registerPushToken(user.id);
  }, [user?.id]);

  return (
    <PremiumProvider userId={user?.id}>
      <PlayersProvider>
        <MatchProvider>
          <PronoProvider>
            <QuizProvider>
              <RatingsProvider>
                <FollowProvider>
                  <BlockProvider currentUserId={user?.id}>
                    <NavigationContainer>
                      <AppNavigator />
                    </NavigationContainer>
                    <GlobalModals />
                  </BlockProvider>
                </FollowProvider>
              </RatingsProvider>
            </QuizProvider>
          </PronoProvider>
        </MatchProvider>
      </PlayersProvider>
    </PremiumProvider>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <AppWithProviders />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
