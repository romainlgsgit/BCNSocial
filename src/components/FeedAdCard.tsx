import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { AdView, AdFormat } from 'react-native-applovin-max';
import { AD_UNITS, ADS_CONFIGURED } from '../config/ads';
import { usePremium } from '../context/PremiumContext';

// MREC = 300×250 → meilleur CPM pour le feed
type State = 'placeholder' | 'loaded' | 'failed';

export default function FeedAdCard() {
  const [state, setState] = useState<State>('placeholder');
  const { isPremium } = usePremium();
  const opacity = useRef(new Animated.Value(0)).current;

  if (isPremium) return null;

  const handleLoaded = () => {
    setState('loaded');
    Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  };

  // Rien à afficher tant que les clés AppLovin ne sont pas configurées, ou si l'ad a échoué
  if (!ADS_CONFIGURED || state === 'failed') return null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.dot} />
        <Text style={styles.label}>Sponsorisé</Text>
      </View>

      {/* Shimmer pendant le chargement */}
      {state === 'placeholder' && (
        <View style={styles.placeholder}>
          <View style={styles.shimmerBlock} />
          <View style={styles.shimmerLine} />
          <View style={[styles.shimmerLine, { width: '60%' }]} />
        </View>
      )}

      {/* AdView MREC : toujours dans le DOM pour se charger, invisible jusqu'à loaded */}
      <Animated.View
        style={[
          styles.adWrap,
          state !== 'loaded' && styles.adHidden,
          { opacity },
        ]}
      >
        <AdView
          adUnitId={AD_UNITS.mrec}
          adFormat={AdFormat.MREC}
          style={styles.mrec}
          onAdLoaded={handleLoaded}
          onAdLoadFailed={() => setState('failed')}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginVertical: 5,
    backgroundColor: '#151515',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#242424',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#3a3a3a',
  },
  label: {
    color: '#505050',
    fontSize: 10,
    fontWeight: '600',
    fontStyle: 'italic',
    letterSpacing: 0.3,
  },
  placeholder: {
    height: 250,
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 10,
    justifyContent: 'center',
  },
  shimmerBlock: {
    height: 160,
    borderRadius: 10,
    backgroundColor: '#1f1f1f',
  },
  shimmerLine: {
    width: '80%',
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1f1f1f',
  },
  adWrap: {
    alignItems: 'center',
    paddingBottom: 12,
  },
  adHidden: {
    position: 'absolute',
    opacity: 0,
  },
  mrec: {
    width: 300,
    height: 250,
  },
});
