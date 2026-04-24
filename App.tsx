import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { MatchProvider } from './src/context/MatchContext';
import { PronoProvider } from './src/context/PronoContext';
import { RatingsProvider } from './src/context/RatingsContext';
import { FollowProvider } from './src/context/FollowContext';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <MatchProvider>
            <PronoProvider>
              <RatingsProvider>
                <FollowProvider>
                  <NavigationContainer>
                    <AppNavigator />
                  </NavigationContainer>
                </FollowProvider>
              </RatingsProvider>
            </PronoProvider>
          </MatchProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
