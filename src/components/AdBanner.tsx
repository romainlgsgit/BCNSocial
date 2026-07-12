import React, { useState } from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { AdView, AdFormat } from 'react-native-applovin-max';
import { AD_UNITS, ADS_CONFIGURED } from '../config/ads';
import { usePremium } from '../context/PremiumContext';

interface Props {
  style?: ViewStyle;
}

export default function AdBanner({ style }: Props) {
  const [failed, setFailed] = useState(false);
  const { isPremium } = usePremium();

  if (!ADS_CONFIGURED || failed || isPremium) return null;

  return (
    <View style={[styles.container, style]}>
      <View style={styles.topBar}>
        <View style={styles.line} />
        <Text style={styles.label}>PUB</Text>
        <View style={styles.line} />
      </View>
      <AdView
        adUnitId={AD_UNITS.banner}
        adFormat={AdFormat.BANNER}
        adaptiveBannerEnabled
        style={styles.banner}
        onAdLoadFailed={() => setFailed(true)}
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
  // Bannière adaptative : 320×50 (téléphone) / 728×90 (tablette)
  banner: {
    width: '100%',
    height: 60,
  },
});
