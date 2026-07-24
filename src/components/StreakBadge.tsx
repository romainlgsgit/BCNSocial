import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StreakTier, tierForStreak } from '../utils/streakBadges';

/**
 * Écusson de série du quiz, dessiné avec les primitives React Native.
 *
 * Volontairement sans `react-native-svg` : ce module est natif, donc l'ajouter
 * rendrait impossible la livraison par mise à jour OTA (l'app planterait au
 * démarrage tant qu'un nouveau binaire n'est pas passé par l'App Store).
 *
 * Le blason = un corps rectangulaire à épaules arrondies + une pointe triangulaire
 * (astuce des bordures transparentes). Les paliers hauts ajoutent une couronne et,
 * pour le dernier, un halo.
 */

interface Props {
  /** Série EN COURS (déjà passée par `effectiveStreak`). */
  streak: number;
  /** Largeur de l'écusson en points. Le reste est proportionnel. */
  size?: number;
  /** Affiche le nombre de jours sur l'écusson (illisible en dessous de ~26px). */
  showNumber?: boolean;
  /** Force un palier précis (aperçu dans l'écran Quiz), sinon déduit de `streak`. */
  tier?: StreakTier | null;
}

export default function StreakBadge({ streak, size = 28, showNumber, tier: forced }: Props) {
  const tier = forced !== undefined ? forced : tierForStreak(streak);
  if (!tier) return null;

  const W = size;
  const bodyH = W * 0.72;
  const pointH = W * 0.42;
  const totalH = bodyH + pointH;
  const withNumber = showNumber ?? W >= 26;
  const crownH = W * 0.3;

  return (
    <View style={{ width: W, height: totalH + (tier.crown ? crownH * 0.8 : 0), alignItems: 'center' }}>
      {/* Halo du palier ultime */}
      {tier.aura && (
        <View
          pointerEvents="none"
          style={[
            styles.aura,
            {
              width: W * 1.42,
              height: (totalH + (tier.crown ? crownH * 0.8 : 0)) * 1.18,
              borderRadius: W,
              borderColor: tier.border,
              top: -W * 0.09,
              left: -W * 0.21,
            },
          ]}
        />
      )}

      {tier.crown && <Crown width={W * 0.66} height={crownH} color={tier.border} />}

      {/* Corps du blason */}
      <View style={{ width: W, height: bodyH }}>
        <LinearGradient
          colors={tier.gradient}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={{
            width: W,
            height: bodyH,
            borderTopLeftRadius: W * 0.26,
            borderTopRightRadius: W * 0.26,
            borderWidth: Math.max(1, W * 0.055),
            borderBottomWidth: 0,
            borderColor: tier.border,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {withNumber && (
            <Text
              style={{
                color: tier.ink,
                fontSize: W * (streak >= 100 ? 0.3 : 0.36),
                fontWeight: '900',
                marginTop: W * 0.04,
              }}
              numberOfLines={1}
            >
              {streak}
            </Text>
          )}
        </LinearGradient>
      </View>

      {/* Pointe inférieure : triangle par bordures transparentes. La couleur reprend
          la fin du dégradé pour prolonger le corps sans rupture visible. */}
      <View style={{ width: W, height: pointH }}>
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 0,
            height: 0,
            borderLeftWidth: W / 2,
            borderRightWidth: W / 2,
            borderTopWidth: pointH,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderTopColor: tier.border,
          }}
        />
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: W * 0.055,
            width: 0,
            height: 0,
            borderLeftWidth: W / 2 - W * 0.055,
            borderRightWidth: W / 2 - W * 0.055,
            borderTopWidth: pointH - W * 0.075,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderTopColor: tier.gradient[1],
          }}
        />
      </View>
    </View>
  );
}

/** Petite couronne à trois pointes, posée sur les épaules de l'écusson. */
function Crown({ width, height, color }: { width: number; height: number; color: string }) {
  const spike = height * 0.72;
  const w3 = width / 3;
  return (
    <View style={{ width, height, flexDirection: 'row', alignItems: 'flex-end', marginBottom: -height * 0.22 }}>
      {[0.72, 1, 0.72].map((k, i) => (
        <View key={i} style={{ width: w3, alignItems: 'center' }}>
          <View
            style={{
              width: 0,
              height: 0,
              borderLeftWidth: w3 * 0.42,
              borderRightWidth: w3 * 0.42,
              borderBottomWidth: spike * k,
              borderLeftColor: 'transparent',
              borderRightColor: 'transparent',
              borderBottomColor: color,
            }}
          />
        </View>
      ))}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: height * 0.26,
          backgroundColor: color,
          borderRadius: height * 0.1,
        }}
      />
    </View>
  );
}

/**
 * Avatar surmonté de son écusson, en haut à droite.
 * L'écusson déborde légèrement du cercle pour ne pas masquer la photo.
 */
export function AvatarWithStreak({
  size,
  streak,
  children,
  badgeScale = 0.42,
}: {
  size: number;
  streak: number;
  children: React.ReactNode;
  badgeScale?: number;
}) {
  const tier = tierForStreak(streak);
  const badgeW = Math.round(size * badgeScale);
  return (
    <View style={{ width: size, height: size }}>
      {children}
      {tier && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -badgeW * 0.22,
            right: -badgeW * 0.26,
          }}
        >
          <StreakBadge streak={streak} size={badgeW} showNumber={false} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  aura: {
    position: 'absolute',
    borderWidth: 2,
    opacity: 0.55,
  },
});
