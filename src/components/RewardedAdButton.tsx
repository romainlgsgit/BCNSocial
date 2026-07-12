import React, { useEffect, useRef, useState } from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { RewardedAd } from 'react-native-applovin-max';
import { AD_UNITS, ADS_CONFIGURED } from '../config/ads';
import { Colors, BorderRadius, FontSize, Spacing } from '../theme';
import { useAuth } from '../context/AuthContext';

const UNIT_ID = AD_UNITS.rewarded;

const BONUS_COINS = 50;

type Status = 'loading' | 'ready' | 'success';

export default function RewardedAdButton() {
  const { updateCoins } = useAuth();
  const [status, setStatus] = useState<Status>('loading');
  const updateCoinsRef = useRef(updateCoins);

  useEffect(() => {
    updateCoinsRef.current = updateCoins;
  }, [updateCoins]);

  useEffect(() => {
    if (!ADS_CONFIGURED) return;

    RewardedAd.addAdLoadedEventListener(() => setStatus('ready'));

    RewardedAd.addAdReceivedRewardEventListener(() => {
      updateCoinsRef.current(BONUS_COINS);
      setStatus('success');
    });

    // Pas de pub dispo → on garde le bouton caché (status reste 'loading')
    RewardedAd.addAdLoadFailedEventListener(() => {});

    // Quand la pub se ferme, on en précharge une nouvelle pour la prochaine fois
    RewardedAd.addAdHiddenEventListener(() => {
      setTimeout(() => RewardedAd.loadAd(UNIT_ID), 3000);
    });

    RewardedAd.loadAd(UNIT_ID);

    return () => {
      RewardedAd.removeAdLoadedEventListener();
      RewardedAd.removeAdReceivedRewardEventListener();
      RewardedAd.removeAdLoadFailedEventListener();
      RewardedAd.removeAdHiddenEventListener();
    };
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
      onPress={() => RewardedAd.showAd(UNIT_ID)}
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
