import React, { useRef } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { NavigationContainerRef } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from '../screens/HomeScreen';
import MatchesScreen from '../screens/MatchesScreen';
import RatingsScreen from '../screens/RatingsScreen';
import PronosticsScreen from '../screens/PronosticsScreen';
import QuizScreen from '../screens/QuizScreen';
import GamesHubScreen from '../screens/GamesHubScreen';
import ShootoutScreen from '../screens/ShootoutScreen';
import PenaltyScreen from '../screens/PenaltyScreen';
import DraftFootScreen from '../screens/DraftFootScreen';
import BannedScreen from '../screens/BannedScreen';
import VerifyEmailScreen from '../screens/VerifyEmailScreen';
import ProfileScreen from '../screens/ProfileScreen';
import AdminScreen from '../screens/AdminScreen';
import UserProfileScreen from '../screens/UserProfileScreen';
import SettingsScreen from '../screens/SettingsScreen';
import AuthScreen from '../screens/AuthScreen';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../theme';

export type RootTabParamList = {
  Home: undefined;
  Matches: undefined;
  Players: undefined;
  Games: undefined;
  Profile: undefined;
};

export type GamesStackParamList = {
  GamesHub: undefined;
  Pronostics: undefined;
  Quiz: undefined;
  Shootout: undefined;
  Penalty: undefined;
  DraftFoot: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  MainTabs: undefined;
  Admin: undefined;
  UserProfile: { userId: string };
  Settings: undefined;
  Banned: undefined;
  VerifyEmail: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();
const Stack = createStackNavigator<RootStackParamList>();
const GamesStack = createStackNavigator<GamesStackParamList>();

function GamesNavigator() {
  const profileRef = useRef<any>(null);
  return (
    <GamesStack.Navigator screenOptions={{ headerShown: false }}>
      <GamesStack.Screen name="GamesHub" component={GamesHubScreen} />
      <GamesStack.Screen name="Pronostics">
        {() => <PronosticsScreen onNavigateToProfile={() => profileRef.current?.navigate('Profile')} />}
      </GamesStack.Screen>
      <GamesStack.Screen name="Quiz">
        {() => <QuizScreen onNavigateToProfile={() => profileRef.current?.navigate('Profile')} />}
      </GamesStack.Screen>
      <GamesStack.Screen name="Shootout" component={ShootoutScreen} />
      <GamesStack.Screen name="Penalty" component={PenaltyScreen} />
      <GamesStack.Screen name="DraftFoot" component={DraftFootScreen} />
    </GamesStack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: '#111111',
          borderTopColor: '#222222',
          borderTopWidth: 1,
          height: 80,
          paddingBottom: 16,
          paddingTop: 10,
        },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: '#555555',
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={26} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Matches"
        component={MatchesScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={26} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Players"
        component={RatingsScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? 'star' : 'star-outline'} size={26} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Games"
        component={GamesNavigator}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? 'game-controller' : 'game-controller-outline'} size={26} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={26} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

interface Props {
  navigationRef?: React.RefObject<NavigationContainerRef<RootStackParamList>>;
}

export default function AppNavigator({ navigationRef }: Props) {
  const { isAuthenticated, isLoading, banVerdict, needsEmailVerification } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Auth" component={AuthScreen} />
      </Stack.Navigator>
    );
  }

  // Adresse email non confirmée : blocage total tant que le lien n'est pas ouvert.
  // Placé AVANT le bannissement pour que ce soit vérifié en premier sur un compte
  // tout juste créé.
  if (needsEmailVerification) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
      </Stack.Navigator>
    );
  }

  // Compte banni : l'app entière est remplacée par l'écran d'information. Le
  // verrou qui compte reste côté serveur (règles Firestore) — celui-ci n'est que
  // la partie visible.
  if (banVerdict.banned) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Banned" component={BannedScreen} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen
        name="Admin"
        component={AdminScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen
        name="UserProfile"
        component={UserProfileScreen}
        options={{ presentation: 'card' }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ presentation: 'card' }}
      />
    </Stack.Navigator>
  );
}
