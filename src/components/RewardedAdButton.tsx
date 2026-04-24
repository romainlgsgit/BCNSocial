import React, { useEffect, useRef, useState } from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { RewardedAd, RewardedAdEventType, AdEventType, TestIds } from 'react-native-google-mobile-ads';
import { Colors, BorderRadius, FontSize, Spacing } from '../theme';
import { useAuth } from '../context/AuthContext';

// ← Remplacer par ton vrai ID AdMob iOS en production
const UNIT_ID = __DEV__
  ? TestIds.REWARDED
  : 'ca-app-pub-1040134367659445/5142174321';

const BONUS_COINS = 50;

type Status = 'loading' | 'ready' | 'success';

export default function RewardedAdButton() {
  const { updateCoins } = useAuth();
  const [status, setStatus] = useState<Status>('loading');
  const adRef = useRef<RewardedAd | null>(null);
  const updateCoinsRef = useRef(updateCoins);

  useEffect(() => {
    updateCoinsRef.current = updateCoins;
  }, [updateCoins]);

  useEffect(() => {
    function loadAd() {
      setStatus('loading');
      const ad = RewardedAd.createForAdRequest(UNIT_ID, {
        requestNonPersonalizedAdsOnly: false,
      });
      adRef.current = ad;

      ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
        setStatus('ready');
      });

      ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
        updateCoinsRef.current(BONUS_COINS);
        setStatus('success');
        // Recharge une nouvelle pub après 3s pour permettre une prochaine vue
        setTimeout(loadAd, 3000);
      });

      ad.addAdEventListener(AdEventType.ERROR, () => {
        // Pas de pub dispo → on cache silencieusement le bouton
      });

      ad.load();
    }

    loadAd();
  }, []);

  // Bouton invisible si la pub n'est pas encore chargée
  if (status === 'loading') return null;

  if (status === 'success') {
    return (
      <View style={styles.successBanner}>
        <Text style={styles.successText}>✅ +{BONUS_COINS} 🪙 crédités sur ton compte !</Text>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={styles.btn}
      onPress={() => adRef.current?.show()}
      activeOpacity={0.8}
    >
      <Text style={styles.btnIcon}>🎬</Text>
      <View style={styles.btnLabels}>
        <Text style={styles.btnTitle}>Gagner des pièces gratuitement</Text>
        <Text style={styles.btnSub}>Regarder une courte pub → +{BONUS_COINS} 🪙</Text>
      </View>
      <View style={styles.btnBadge}>
        <Text style={styles.btnBadgeText}>+{BONUS_COINS}</Text>
        <Text style={styles.btnBadgeIcon}>🪙</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.gold + '12',
    borderRadius: BorderRadius.md,
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gold + '35',
  },
  btnIcon: {
    fontSize: 24,
  },
  btnLabels: {
    flex: 1,
  },
  btnTitle: {
    color: Colors.text,
    fontWeight: '700',
    fontSize: FontSize.sm,
  },
  btnSub: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  btnBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gold + '22',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 3,
  },
  btnBadgeText: {
    color: Colors.gold,
    fontWeight: '800',
    fontSize: FontSize.sm,
  },
  btnBadgeIcon: {
    fontSize: 14,
  },
  successBanner: {
    backgroundColor: Colors.win + '15',
    borderRadius: BorderRadius.md,
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.win + '44',
  },
  successText: {
    color: Colors.win,
    fontWeight: '700',
    fontSize: FontSize.sm,
  },
});
