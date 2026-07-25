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
import { StoreProvider, useStore } from './src/context/StoreContext';
import { RatingsProvider } from './src/context/RatingsContext';
import { FollowProvider } from './src/context/FollowContext';
import { GameProvider } from './src/context/GameContext';
import { BlockProvider } from './src/context/BlockContext';
import { ModerationProvider } from './src/context/ModerationContext';
import AppNavigator from './src/navigation/AppNavigator';
import PremiumScreen from './src/screens/PremiumScreen';
import StoreScreen from './src/screens/StoreScreen';
import { registerPushToken } from './src/utils/notifications';
import { resolveAttGate } from './src/utils/attGate';
import { APPLOVIN_SDK_KEY, ADS_CONFIGURED } from './src/config/ads';

function GlobalModals() {
  const { showPremiumScreen, closePremiumScreen } = usePremium();
  const { showStore, closeStore } = useStore();
  return (
    <>
      <PremiumScreen visible={showPremiumScreen} onClose={closePremiumScreen} />
      <StoreScreen visible={showStore} onClose={closeStore} />
    </>
  );
}

function AppWithProviders() {
  const { user, isLoading: authLoading } = useAuth();

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
          resolveAttGate();
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
    <PremiumProvider userId={user?.id} authReady={!authLoading}>
      <StoreProvider userId={user?.id}>
        <PlayersProvider>
          <MatchProvider>
            <PronoProvider>
              <QuizProvider>
                <RatingsProvider>
                  <FollowProvider>
                    <GameProvider>
                      <BlockProvider currentUserId={user?.id}>
                        <ModerationProvider>
                          <NavigationContainer>
                            <AppNavigator />
                          </NavigationContainer>
                          <GlobalModals />
                        </ModerationProvider>
                      </BlockProvider>
                    </GameProvider>
                  </FollowProvider>
                </RatingsProvider>
              </QuizProvider>
            </PronoProvider>
          </MatchProvider>
        </PlayersProvider>
      </StoreProvider>
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
