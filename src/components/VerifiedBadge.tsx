import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const COLOR_BLUE = '#1D9BF0';
const COLOR_GOLD = '#E8A800';
const NUM_BUMPS = 10;

export default function VerifiedBadge({ size = 16, gold = false }: { size?: number; gold?: boolean }) {
  const COLOR = gold ? COLOR_GOLD : COLOR_BLUE;
  const R = size / 2;       // rayon du cercle principal
  const r = R * 0.16;       // rayon des bosses

  return (
    <View style={{ width: size, height: size }}>
      {/* Bosses autour du cercle */}
      {Array.from({ length: NUM_BUMPS }).map((_, i) => {
        const angle = (i / NUM_BUMPS) * Math.PI * 2 - Math.PI / 2;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: R + R * Math.cos(angle) - r,
              top:  R + R * Math.sin(angle) - r,
              width: r * 2,
              height: r * 2,
              borderRadius: r,
              backgroundColor: COLOR,
            }}
          />
        );
      })}
      {/* Cercle principal par-dessus */}
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: R,
          backgroundColor: COLOR,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="checkmark" size={size * 0.68} color="white" />
      </View>
    </View>
  );
}
