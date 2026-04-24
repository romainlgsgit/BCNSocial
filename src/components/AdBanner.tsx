import React, { useState } from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { Colors } from '../theme';

// ← Remplacer par ton vrai ID AdMob iOS en production
const UNIT_ID = __DEV__
  ? TestIds.BANNER
  : 'ca-app-pub-1040134367659445/2707582671';

interface Props {
  style?: ViewStyle;
}

export default function AdBanner({ style }: Props) {
  const [failed, setFailed] = useState(false);

  if (failed) return null;

  return (
    <View style={[styles.container, style]}>
      <View style={styles.topBar}>
        <View style={styles.line} />
        <Text style={styles.label}>PUB</Text>
        <View style={styles.line} />
      </View>
      <BannerAd
        unitId={UNIT_ID}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: false }}
        onAdFailedToLoad={() => setFailed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0F0F0F',
    alignItems: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 4,
    width: '100%',
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: '#222',
  },
  label: {
    color: '#404040',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
