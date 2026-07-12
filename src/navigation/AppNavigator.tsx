import React, { useRef } from 'react';
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
import ProfileScreen from '../screens/ProfileScreen';
import AdminScreen from '../screens/AdminScreen';
import UserProfileScreen from '../screens/UserProfileScreen';
import SettingsScreen from '../screens/SettingsScreen';
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
};

export type RootStackParamList = {
  MainTabs: undefined;
  Admin: undefined;
  UserProfile: { userId: string };
  Settings: undefined;
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
