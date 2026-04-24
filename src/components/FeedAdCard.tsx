import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';

// ← Remplacer par ton vrai ID AdMob iOS en production
const UNIT_ID = __DEV__
  ? TestIds.BANNER
  : 'ca-app-pub-1040134367659445/6646827683';

// MEDIUM_RECTANGLE = 300×250 → meilleur CPM pour le feed
type State = 'placeholder' | 'loaded' | 'failed';

export default function FeedAdCard() {
  const [state, setState] = useState<State>('placeholder');
  const opacity = useRef(new Animated.Value(0)).current;

  const handleLoaded = () => {
    setState('loaded');
    Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  };

  if (state === 'failed') return null;

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

      {/* BannerAd : toujours dans le DOM pour se charger, invisible jusqu'à loaded */}
      <Animated.View
        style={[
          styles.adWrap,
          state !== 'loaded' && styles.adHidden,
          { opacity },
        ]}
      >
        <BannerAd
          unitId={UNIT_ID}
          size={BannerAdSize.MEDIUM_RECTANGLE}
          requestOptions={{ requestNonPersonalizedAdsOnly: false }}
          onAdLoaded={handleLoaded}
          onAdFailedToLoad={() => setState('failed')}
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
});
