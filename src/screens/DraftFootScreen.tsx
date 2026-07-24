import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Colors, BorderRadius } from '../theme';

// Placeholder : à remplacer par le vrai jeu Draft Foot.
export default function DraftFootScreen() {
  const navigation = useNavigation<any>();

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={22} color={Colors.text} />
      </TouchableOpacity>

      <View style={styles.center}>
        <Image source={require('../../assets/draftfoot.png')} style={styles.logo} resizeMode="cover" />
        <Text style={styles.title}>Draft Foot 27</Text>
        <Text style={styles.desc}>Le jeu arrive très bientôt.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A0A' },
  back: {
    position: 'absolute',
    top: 56,
    left: 16,
    zIndex: 2,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  logo: { width: 180, height: 180, borderRadius: BorderRadius.xl, marginBottom: 8 },
  title: { color: Colors.text, fontSize: 24, fontWeight: '900' },
  desc: { color: Colors.textMuted, fontSize: 14 },
});
