import React from 'react';
import { StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../context/StoreContext';
import { Colors } from '../theme';

/**
 * Pastille « + » posée à côté d'un solde de pièces : ouvre la boutique.
 * Un seul composant pour tous les emplacements, afin que l'accès à la boutique
 * ait exactement la même apparence partout où les pièces sont affichées.
 */
export default function AddCoinsButton({
  size = 20,
  style,
}: {
  size?: number;
  style?: ViewStyle;
}) {
  const { openStore } = useStore();

  return (
    <TouchableOpacity
      onPress={() => openStore()}
      activeOpacity={0.75}
      // Cible tactile élargie : la pastille est trop petite pour être visée seule.
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={[styles.btn, { width: size, height: size, borderRadius: size / 2 }, style]}
    >
      <Ionicons name="add" size={size * 0.72} color="#1A1200" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.gold,
  },
});
