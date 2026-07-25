import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Modal, StatusBar, Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { PurchasesPackage } from 'react-native-purchases';
import { usePremium, PRODUCT_IDS, FREE_DAILY_POST_LIMIT, PREMIUM_MONTHLY_COINS, PREMIUM_MONTHLY_DOLLARS, EXTRA_POST_COST } from '../context/PremiumContext';
import { Colors, FontSize, BorderRadius, Spacing } from '../theme';
import RulesModal from '../components/RulesModal';

const FEATURES = [
  { icon: 'ban-outline',           label: 'Zéro publicité',                    desc: 'Profite de l\'app sans aucune interruption' },
  { icon: 'images-outline',        label: 'Partage des images',                 desc: 'Poste des photos dans le feed communautaire' },
  { icon: 'infinite-outline',      label: 'Posts illimités',                    desc: `Sans Premium : ${FREE_DAILY_POST_LIMIT} posts/jour, puis ${EXTRA_POST_COST} $/post` },
  { icon: 'checkmark-circle',      label: 'Badge certifié bleu',                desc: 'Affiché sur tous tes posts et ton profil' },
  { icon: 'wallet-outline',        label: `+${PREMIUM_MONTHLY_COINS} pièces/mois`, desc: 'Créditées automatiquement à chaque renouvellement' },
  { icon: 'cash-outline',          label: `+${PREMIUM_MONTHLY_DOLLARS} $/mois`,     desc: 'Crédités automatiquement à chaque renouvellement' },
];

function PlanCard({
  title,
  price,
  period,
  badge,
  badgeColor,
  selected,
  onSelect,
  saving,
}: {
  title: string;
  price: string;
  period: string;
  badge?: string;
  badgeColor?: string;
  selected: boolean;
  onSelect: () => void;
  saving?: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.planCard, selected && styles.planCardSelected]}
      onPress={onSelect}
      activeOpacity={0.85}
    >
      {badge && (
        <View style={[styles.planBadge, { backgroundColor: badgeColor ?? Colors.gold }]}>
          <Text style={styles.planBadgeText}>{badge}</Text>
        </View>
      )}
      <View style={[styles.planRadio, selected && styles.planRadioSelected]}>
        {selected && <View style={styles.planRadioDot} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.planTitle, selected && styles.planTitleSelected]}>{title}</Text>
        {saving && <Text style={styles.planSaving}>{saving}</Text>}
      </View>
      <View style={styles.planPriceBlock}>
        <Text style={[styles.planPrice, selected && styles.planPriceSelected]}>{price}</Text>
        <Text style={styles.planPeriod}>{period}</Text>
      </View>
    </TouchableOpacity>
  );
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function PremiumScreen({ visible, onClose }: Props) {
  const { isPremium, packages, purchasePackage, restorePurchases, isLoading, devResetPremium } = usePremium();
  const [selectedPkg, setSelectedPkg] = useState<PurchasesPackage | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [rulesVisible, setRulesVisible] = useState(false);

  const monthlyPkg = packages.find(p => p.product.identifier === PRODUCT_IDS.monthly);
  const annualPkg  = packages.find(p => p.product.identifier === PRODUCT_IDS.annual);
  const activePkg  = selectedPkg ?? annualPkg ?? monthlyPkg ?? null;

  const handlePurchase = async () => {
    if (!activePkg) return;
    setPurchasing(true);
    try {
      const ok = await purchasePackage(activePkg);
      if (ok) {
        onClose();
        setTimeout(() => {
          Alert.alert('Bienvenue Premium ! 🎉', 'Ton abonnement est actif. Profite de tous les avantages !');
        }, 400);
      }
    } catch (e: any) {
      Alert.alert('Erreur', e.message ?? 'Impossible de finaliser l\'achat.');
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    const ok = await restorePurchases();
    setRestoring(false);
    if (ok) {
      onClose();
      setTimeout(() => {
        Alert.alert('Abonnement restauré ✅', '');
      }, 400);
    } else {
      Alert.alert('Aucun abonnement trouvé', 'Aucun achat précédent trouvé sur ce compte Apple.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <StatusBar barStyle="light-content" />
      <View style={styles.root}>

        {/* Header */}
        <LinearGradient colors={['#6B0030', Colors.primary, '#001F4A']} style={styles.header}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.8}>
            <Ionicons name="close" size={20} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>

          <View style={styles.crownCircle}>
            <Ionicons name="diamond" size={36} color={Colors.gold} />
          </View>
          <Text style={styles.headerTitle}>BCNSocial Premium</Text>
          <Text style={styles.headerSub}>L'expérience fan sans limites</Text>
        </LinearGradient>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>

          {/* Déjà premium */}
          {isPremium && (
            <View style={styles.alreadyPremiumBlock}>
              <View style={styles.alreadyPremium}>
                <Ionicons name="checkmark-circle" size={20} color={Colors.gold} />
                <Text style={styles.alreadyPremiumText}>Tu es déjà abonné Premium ✨</Text>
              </View>
              <TouchableOpacity
                style={styles.manageBtn}
                onPress={() => Linking.openURL('https://apps.apple.com/account/subscriptions')}
                activeOpacity={0.8}
              >
                <Ionicons name="settings-outline" size={15} color={Colors.textMuted} />
                <Text style={styles.manageBtnText}>Gérer / résilier mon abonnement</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Features */}
          <Text style={styles.sectionLabel}>Ce qui est inclus</Text>
          {FEATURES.map(f => (
            <View key={f.label} style={styles.featureRow}>
              <View style={styles.featureIconCircle}>
                <Ionicons name={f.icon as any} size={18} color={Colors.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureLabel}>{f.label}</Text>
                <Text style={styles.featureDesc}>{f.desc}</Text>
              </View>
            </View>
          ))}

          {/* Plans */}
          {!isPremium && (
            <>
              <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Choisir un plan</Text>

              {isLoading ? (
                <ActivityIndicator color={Colors.primary} style={{ marginVertical: 24 }} />
              ) : packages.length === 0 ? (
                <View style={styles.noPkgBox}>
                  <Ionicons name="alert-circle-outline" size={24} color={Colors.textMuted} />
                  <Text style={styles.noPkgText}>Produits non configurés dans App Store Connect</Text>
                </View>
              ) : (
                <>
                  {annualPkg && (
                    <PlanCard
                      title="Annuel"
                      price={annualPkg.product.priceString}
                      period="/ an"
                      badge="Meilleure offre"
                      badgeColor={Colors.gold}
                      saving="Économise 44% vs mensuel"
                      selected={activePkg?.product.identifier === annualPkg.product.identifier}
                      onSelect={() => setSelectedPkg(annualPkg)}
                    />
                  )}
                  {monthlyPkg && (
                    <PlanCard
                      title="Mensuel"
                      price={monthlyPkg.product.priceString}
                      period="/ mois"
                      selected={activePkg?.product.identifier === monthlyPkg.product.identifier}
                      onSelect={() => setSelectedPkg(monthlyPkg)}
                    />
                  )}

                  <TouchableOpacity
                    style={[styles.purchaseBtn, (!activePkg || purchasing) && styles.purchaseBtnDisabled]}
                    onPress={handlePurchase}
                    disabled={!activePkg || purchasing}
                    activeOpacity={0.85}
                  >
                    {purchasing ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="diamond" size={16} color="#fff" />
                        <Text style={styles.purchaseBtnText}>
                          {activePkg ? `Commencer pour ${activePkg.product.priceString}` : 'Sélectionne un plan'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <Text style={styles.legalText}>
                    L'abonnement se renouvelle automatiquement. Tu peux annuler à tout moment depuis les réglages Apple.{' '}
                    <Text style={styles.legalLink} onPress={() => setRulesVisible(true)}>
                      Politique de confidentialité
                    </Text>
                    {' · '}
                    <Text style={styles.legalLink} onPress={() => Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')}>
                      Conditions d'utilisation
                    </Text>
                  </Text>

                  <TouchableOpacity onPress={handleRestore} disabled={restoring} style={styles.restoreBtn}>
                    {restoring
                      ? <ActivityIndicator size="small" color={Colors.textMuted} />
                      : <Text style={styles.restoreText}>Restaurer mes achats</Text>
                    }
                  </TouchableOpacity>
                </>
              )}
            </>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
      <RulesModal visible={rulesVisible} onClose={() => setRulesVisible(false)} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a' },

  header: {
    paddingTop: 56,
    paddingBottom: 28,
    alignItems: 'center',
    gap: 8,
  },
  closeBtn: {
    position: 'absolute', top: 52, right: 16,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  crownCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(237,187,0,0.15)',
    borderWidth: 1.5, borderColor: 'rgba(237,187,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 24, fontWeight: '900', color: '#fff', letterSpacing: 0.3 },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: '500' },

  body: { padding: 16 },

  alreadyPremiumBlock: { marginBottom: 16, gap: 8 },
  alreadyPremium: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(237,187,0,0.1)',
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(237,187,0,0.3)',
    padding: 14,
  },
  alreadyPremiumText: { color: Colors.gold, fontWeight: '700', fontSize: FontSize.sm },
  manageBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 10, borderWidth: 1, borderColor: '#2a2a2a',
    paddingVertical: 10, paddingHorizontal: 14,
    backgroundColor: '#141414',
  },
  manageBtnText: { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },
  devBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 10, borderWidth: 1, borderColor: '#ff6b6b33',
    paddingVertical: 10, paddingHorizontal: 14,
    backgroundColor: '#ff6b6b11',
  },
  devBtnText: { color: '#ff6b6b', fontSize: 13, fontWeight: '600' },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12,
  },

  featureRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    marginBottom: 12,
  },
  featureIconCircle: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(237,187,0,0.1)',
    borderWidth: 1, borderColor: 'rgba(237,187,0,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  featureLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },
  featureDesc: { color: Colors.textMuted, fontSize: 12, marginTop: 2, lineHeight: 17 },

  // Plans
  planCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#141414',
    borderRadius: 14, borderWidth: 1.5, borderColor: '#222',
    padding: 16, marginBottom: 10,
    position: 'relative', overflow: 'hidden',
  },
  planCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '10',
  },
  planBadge: {
    position: 'absolute', top: 0, right: 0,
    paddingHorizontal: 10, paddingVertical: 4,
    borderBottomLeftRadius: 10,
  },
  planBadgeText: { color: '#111', fontSize: 10, fontWeight: '800' },
  planRadio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: '#444',
    alignItems: 'center', justifyContent: 'center',
  },
  planRadioSelected: { borderColor: Colors.primary },
  planRadioDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  planTitle: { color: Colors.textSecondary, fontSize: 15, fontWeight: '700' },
  planTitleSelected: { color: '#fff' },
  planSaving: { color: Colors.gold, fontSize: 11, fontWeight: '600', marginTop: 2 },
  planPriceBlock: { alignItems: 'flex-end' },
  planPrice: { color: Colors.textSecondary, fontSize: 18, fontWeight: '900' },
  planPriceSelected: { color: '#fff' },
  planPeriod: { color: Colors.textMuted, fontSize: 11 },

  purchaseBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingVertical: 16, marginTop: 8,
  },
  purchaseBtnDisabled: { backgroundColor: '#2a2a2a' },
  purchaseBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  legalText: {
    color: Colors.textMuted, fontSize: 11, textAlign: 'center',
    lineHeight: 16, marginTop: 12,
  },
  legalLink: {
    color: Colors.primary, textDecorationLine: 'underline',
  },
  restoreBtn: { alignItems: 'center', marginTop: 14, padding: 8 },
  restoreText: { color: Colors.textMuted, fontSize: 12, fontWeight: '600', textDecorationLine: 'underline' },

  noPkgBox: {
    alignItems: 'center', gap: 8,
    backgroundColor: '#141414',
    borderRadius: 12, borderWidth: 1, borderColor: '#222',
    padding: 24,
  },
  noPkgText: { color: Colors.textMuted, fontSize: 13, textAlign: 'center' },
});
