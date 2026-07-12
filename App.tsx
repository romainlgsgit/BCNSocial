import React, { useEffect } from 'react';
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
    requestTrackingPermissionsAsync().then(() => {
      if (!ADS_CONFIGURED) return;
      AppLovinMAX.initialize(APPLOVIN_SDK_KEY).catch(() => {});
    });
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
