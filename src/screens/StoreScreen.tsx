import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Modal, StatusBar, Linking, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import {
  CoinPack, COIN_PACKS, COINS_PER_DOLLAR, DOLLAR_TIERS, DollarTier,
  formatCoins, packTotalCoins,
} from '../config/store';
import { BorderRadius, Colors } from '../theme';
import RulesModal from '../components/RulesModal';

// Chaque monnaie a sa couleur, tenue partout dans l'app : c'est ce qui permet
// de lire un solde ou un palier d'un coup d'œil sans relire le libellé.
const GOLD = Colors.gold;
const GREEN = Colors.dollar;
const BG = '#08080C';
const TILE = '#15151C';
const TILE_BORDER = '#24242F';

// ─── Tas de pièces ────────────────────────────────────────────────────────────

const COIN_D = 17;              // diamètre d'une pièce
const COIN_ROW = COIN_D * 0.5;  // chevauchement vertical entre deux rangées
const COIN_COL = COIN_D * 0.74; // chevauchement horizontal dans une rangée

/**
 * Répartition des pièces par rangée, de bas en haut, pour chaque palier (1 à 5).
 * Des rangées qui se rétrécissent vers le haut donnent une vraie silhouette de
 * tas — la version en rondelles empilées lisait comme des lingots.
 */
const HEAP_ROWS: number[][] = [
  [2, 1],
  [3, 2],
  [3, 2, 1],
  [4, 3, 1],
  [4, 3, 2, 1],
];

const heapWidth = (rows: number[]) => Math.max(...rows) * COIN_COL + (COIN_D - COIN_COL);
const rowWidth = (n: number) => n * COIN_COL + (COIN_D - COIN_COL);

/**
 * Tas de pièces dessiné en Views — aucun asset à embarquer. Chaque pièce est un
 * disque parfait avec un liseré foncé et un cœur plus clair, pour qu'elle se
 * lise comme une pièce vue de face et non comme un jeton plat.
 */
function CoinHeap({ level, face, edge, core }: { level: number; face: string; edge: string; core: string }) {
  const rows = HEAP_ROWS[Math.min(level, HEAP_ROWS.length) - 1];
  const width = heapWidth(rows);

  return (
    <View style={{ width, height: (rows.length - 1) * COIN_ROW + COIN_D }}>
      {rows.map((count, rowIndex) => {
        const offset = (width - rowWidth(count)) / 2;
        return Array.from({ length: count }, (_, i) => (
          <View
            key={`${rowIndex}-${i}`}
            style={[
              styles.coin,
              {
                bottom: rowIndex * COIN_ROW,
                left: offset + i * COIN_COL,
                backgroundColor: face,
                borderColor: edge,
              },
            ]}
          >
            <View style={[styles.coinCore, { backgroundColor: core }]} />
          </View>
        ));
      })}
    </View>
  );
}

// ─── Soldes ───────────────────────────────────────────────────────────────────

function BalanceTile({
  icon, tint, value, label,
}: {
  icon: any; tint: string; value: number; label: string;
}) {
  return (
    <View style={[styles.balanceTile, { borderColor: tint + '3D' }]}>
      <View style={[styles.balanceIcon, { backgroundColor: tint + '1F' }]}>
        <Ionicons name={icon} size={15} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.balanceValue, { color: tint }]} numberOfLines={1}>
          {formatCoins(value)}
        </Text>
        <Text style={styles.balanceLabel}>{label}</Text>
      </View>
    </View>
  );
}

// ─── Onglet « Acheter » ───────────────────────────────────────────────────────

function FeaturedPack({
  pack, price, available, busy, disabled, onBuy,
}: {
  pack: CoinPack; price: string; available: boolean; busy: boolean; disabled: boolean; onBuy: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onBuy} disabled={disabled} style={styles.featuredWrap}>
      <LinearGradient
        colors={['#8A6A00', '#E5BC33', '#7E6000']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.featured}
      >
        {pack.badge && (
          <View style={styles.featuredBadge}>
            <Ionicons name="flame" size={10} color="#FFE9A3" />
            <Text style={styles.featuredBadgeText}>{pack.badge}</Text>
          </View>
        )}

        <View style={styles.featuredRow}>
          {/* Pièces bronze foncé : le doré clair disparaîtrait sur ce fond. */}
          <CoinHeap level={pack.heap} face="#6B5200" edge="#3D2F00" core="#8A6A00" />

          <View style={{ flex: 1 }}>
            <Text style={styles.featuredCoins}>{formatCoins(packTotalCoins(pack))} pièces</Text>
            <Text style={styles.featuredSub}>
              {formatCoins(pack.coins)} + {formatCoins(pack.bonusCoins)} offertes
            </Text>
            <Text style={styles.featuredSub}>+{pack.bonusPercent} % de pièces</Text>
          </View>

          <View style={styles.featuredPrice}>
            {busy
              ? <ActivityIndicator size="small" color={GOLD} />
              : (
                <Text style={[styles.featuredPriceText, !available && styles.priceTextOff]}>
                  {available ? price : 'Indisponible'}
                </Text>
              )
            }
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

function PackTile({
  pack, price, available, busy, disabled, onBuy,
}: {
  pack: CoinPack; price: string; available: boolean; busy: boolean; disabled: boolean; onBuy: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onBuy}
      disabled={disabled}
      style={[styles.tile, !!pack.badge && { borderColor: pack.accent + '80' }]}
    >
      {pack.badge && (
        <View style={[styles.tileBadge, { backgroundColor: pack.accent }]}>
          <Text style={styles.tileBadgeText}>{pack.badge}</Text>
        </View>
      )}

      <View style={styles.tileStack}>
        <CoinHeap level={pack.heap} face={pack.accent} edge="#7A5C00" core="#FFF0B8" />
      </View>

      <Text style={styles.tileCoins}>{formatCoins(packTotalCoins(pack))}</Text>
      <Text style={styles.tileUnit}>pièces</Text>

      {pack.bonusPercent > 0 ? (
        <View style={[styles.tileBonus, { borderColor: pack.accent + '4D' }]}>
          <Text style={[styles.tileBonusText, { color: pack.accent }]}>+{pack.bonusPercent} %</Text>
        </View>
      ) : (
        <View style={styles.tileBonusPlaceholder} />
      )}

      <View style={[styles.tilePrice, disabled && styles.tilePriceOff]}>
        {busy
          ? <ActivityIndicator size="small" color="#fff" />
          : (
            <Text style={[styles.tilePriceText, !available && styles.priceTextOff]}>
              {available ? price : 'Indisponible'}
            </Text>
          )
        }
      </View>
    </TouchableOpacity>
  );
}

// ─── Onglet « Échanger » ──────────────────────────────────────────────────────

function SwapRow({
  tier, coins, busy, locked, onSwap,
}: {
  tier: DollarTier; coins: number; busy: boolean; locked: boolean; onSwap: () => void;
}) {
  const affordable = coins >= tier.coins;
  const missing = tier.coins - coins;

  return (
    <View style={[styles.swapRow, affordable && styles.swapRowOn]}>
      <View style={styles.swapLeft}>
        <View style={styles.swapCoinsRow}>
          <Ionicons name="wallet" size={13} color={GOLD} />
          <Text style={styles.swapCoins}>{formatCoins(tier.coins)}</Text>
        </View>
        <Ionicons name="arrow-forward" size={13} color="#4A4A57" style={{ marginHorizontal: 8 }} />
        <View style={styles.swapDollarsRow}>
          <Text style={styles.swapDollars}>{tier.dollars} $</Text>
        </View>
      </View>

      <TouchableOpacity
        onPress={onSwap}
        disabled={locked}
        activeOpacity={0.85}
        style={[styles.swapBtn, !affordable && styles.swapBtnOff]}
      >
        {busy
          ? <ActivityIndicator size="small" color="#04170D" />
          : (
            <Text style={[styles.swapBtnText, !affordable && styles.swapBtnTextOff]}>
              {affordable ? 'Échanger' : `−${formatCoins(missing)}`}
            </Text>
          )
        }
      </TouchableOpacity>
    </View>
  );
}

// ─── Écran ────────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
}

type Tab = 'buy' | 'swap';

export default function StoreScreen({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const {
    products, isLoading, purchasingId, purchasePack,
    exchangeForDollars, exchangingDollars, reloadProducts, initialTab,
  } = useStore();
  const [tab, setTab] = useState<Tab>('buy');
  const [refreshing, setRefreshing] = useState(false);
  const [rulesVisible, setRulesVisible] = useState(false);

  // À chaque ouverture, on se place sur l'onglet demandé par openStore
  // (ex. le pill dollars du profil ouvre directement « Échanger »).
  useEffect(() => { if (visible) setTab(initialTab); }, [visible, initialTab]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await reloadProducts();
    setRefreshing(false);
  };

  const coins = user?.coins ?? 0;
  const dollars = user?.dollars ?? 0;
  // Un pack peut manquer à l'appel isolément (identifiant divergent, fiche pas
  // encore propagée) : on nomme les absents plutôt que de déclarer toute la
  // boutique non configurée alors qu'une partie répond.
  const missingPacks = COIN_PACKS.filter(pack => !products[pack.id]);

  // Le palier le plus cher tient la vedette ; les autres passent en grille.
  const featured = COIN_PACKS[COIN_PACKS.length - 1];
  const gridPacks = COIN_PACKS.slice(0, -1);

  const priceOf = (pack: CoinPack) => products[pack.id]?.priceString ?? pack.fallbackPrice;

  const handleBuy = async (pack: CoinPack) => {
    if (purchasingId) return;
    try {
      const credited = await purchasePack(pack);
      if (credited === null) return; // annulé par l'utilisateur
      Alert.alert(
        'Pièces créditées ! 🪙',
        `+${formatCoins(credited)} pièces ont été ajoutées à ton compte.`,
      );
    } catch (e: any) {
      Alert.alert('Achat non finalisé', e?.message ?? 'Réessaie dans un instant.');
    }
  };

  const runSwap = async (tier: DollarTier) => {
    try {
      await exchangeForDollars(tier);
      Alert.alert('Échange effectué ✅', `+${tier.dollars} $ ajoutés à ton compte.`);
    } catch (e: any) {
      Alert.alert(
        'Échange impossible',
        e?.message === 'INSUFFICIENT_COINS'
          ? 'Ton solde a changé entre-temps : tu n\'as plus assez de pièces.'
          : 'Réessaie dans un instant.',
      );
    }
  };

  const handleSwap = (tier: DollarTier) => {
    if (exchangingDollars !== null) return;
    if (coins < tier.coins) {
      Alert.alert(
        'Pas assez de pièces',
        `Il te manque ${formatCoins(tier.coins - coins)} pièces pour ce palier.`,
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Acheter des pièces', onPress: () => setTab('buy') },
        ],
      );
      return;
    }
    Alert.alert(
      'Confirmer l\'échange ?',
      `${formatCoins(tier.coins)} pièces seront converties en ${tier.dollars} $.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Échanger', onPress: () => runSwap(tier) },
      ],
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <StatusBar barStyle="light-content" />
      <View style={styles.root}>

        {/* ── Header : titre + les deux soldes ── */}
        <LinearGradient colors={['#1E1806', '#0D0C12', BG]} style={[styles.header, { paddingTop: insets.top + 6 }]}>
          <View style={styles.headerTop}>
            <View style={styles.headerTitleRow}>
              <Ionicons name="storefront" size={20} color={GOLD} />
              <Text style={styles.headerTitle}>Boutique</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.8}>
              <Ionicons name="close" size={19} color="rgba(255,255,255,0.75)" />
            </TouchableOpacity>
          </View>

          <View style={styles.walletRow}>
            <BalanceTile icon="wallet" tint={GOLD} value={coins} label="Pièces" />
            <BalanceTile icon="cash" tint={GREEN} value={dollars} label="Dollars" />
          </View>
        </LinearGradient>

        {/* ── Onglets ── */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, tab === 'buy' && { backgroundColor: GOLD }]}
            onPress={() => setTab('buy')}
            activeOpacity={0.85}
          >
            <Ionicons name="bag-handle" size={14} color={tab === 'buy' ? '#191400' : '#8A8A99'} />
            <Text style={[styles.tabText, tab === 'buy' && styles.tabTextOnGold]}>Acheter</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === 'swap' && { backgroundColor: GREEN }]}
            onPress={() => setTab('swap')}
            activeOpacity={0.85}
          >
            <Ionicons name="swap-horizontal" size={15} color={tab === 'swap' ? '#04170D' : '#8A8A99'} />
            <Text style={[styles.tabText, tab === 'swap' && styles.tabTextOnGreen]}>Échanger</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
          refreshControl={
            // Tirer pour réinterroger le store : un pack tout juste complété côté
            // Apple apparaît sans avoir à tuer l'app.
            tab === 'buy'
              ? <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={GOLD} />
              : undefined
          }
        >
          {tab === 'buy' ? (
            isLoading ? (
              <ActivityIndicator color={GOLD} style={{ marginVertical: 32 }} />
            ) : (
              <>
                {missingPacks.length > 0 && (
                  <TouchableOpacity style={styles.noticeBox} onPress={handleRefresh} activeOpacity={0.8}>
                    <Ionicons name="alert-circle-outline" size={18} color="#8A8A99" />
                    <Text style={styles.noticeText}>
                      Indisponible{missingPacks.length > 1 ? 's' : ''} pour le moment :{' '}
                      {missingPacks.map(p => formatCoins(packTotalCoins(p))).join(', ')} pièces.
                    </Text>
                    {refreshing
                      ? <ActivityIndicator size="small" color="#8A8A99" />
                      : <Ionicons name="refresh" size={17} color="#8A8A99" />
                    }
                  </TouchableOpacity>
                )}

                <FeaturedPack
                  pack={featured}
                  price={priceOf(featured)}
                  available={!!products[featured.id]}
                  busy={purchasingId === featured.id}
                  disabled={!products[featured.id] || purchasingId !== null}
                  onBuy={() => handleBuy(featured)}
                />

                <View style={styles.grid}>
                  {gridPacks.map(pack => (
                    <PackTile
                      key={pack.id}
                      pack={pack}
                      price={priceOf(pack)}
                      available={!!products[pack.id]}
                      busy={purchasingId === pack.id}
                      disabled={!products[pack.id] || purchasingId !== null}
                      onBuy={() => handleBuy(pack)}
                    />
                  ))}
                </View>

                <Text style={styles.legalText}>
                  Achat unique, débité sur ton compte Apple. Les pièces sont créditées immédiatement
                  et ne sont ni remboursables ni transférables.{' '}
                  <Text
                    style={styles.legalLink}
                    onPress={() => setRulesVisible(true)}
                  >
                    Confidentialité
                  </Text>
                  {' · '}
                  <Text
                    style={styles.legalLink}
                    onPress={() => Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')}
                  >
                    Conditions
                  </Text>
                </Text>
              </>
            )
          ) : (
            <>
              <View style={[styles.rateBox, { borderColor: GREEN + '33' }]}>
                <View style={[styles.rateIcon, { backgroundColor: GREEN + '1A' }]}>
                  <Ionicons name="swap-horizontal" size={17} color={GREEN} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rateTitle}>{formatCoins(COINS_PER_DOLLAR)} pièces = 1 $</Text>
                  <Text style={styles.rateDesc}>
                    Gratuit : tes pièces gagnées en jouant se convertissent en dollars au même taux,
                    quel que soit le palier.
                  </Text>
                </View>
              </View>

              {DOLLAR_TIERS.map(tier => (
                <SwapRow
                  key={tier.dollars}
                  tier={tier}
                  coins={coins}
                  busy={exchangingDollars === tier.dollars}
                  locked={exchangingDollars !== null}
                  onSwap={() => handleSwap(tier)}
                />
              ))}

              <Text style={styles.legalText}>
                L'échange est définitif : les dollars ne peuvent pas être reconvertis en pièces.
              </Text>
            </>
          )}
        </ScrollView>
      </View>
      <RulesModal visible={rulesVisible} onClose={() => setRulesVisible(false)} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  // ── Header ──
  header: { paddingHorizontal: 16, paddingBottom: 16, gap: 14 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 21, fontWeight: '900', color: '#fff', letterSpacing: 0.3 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },

  walletRow: { flexDirection: 'row', gap: 10 },
  balanceTile: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14, borderWidth: 1,
    paddingVertical: 10, paddingHorizontal: 12,
  },
  balanceIcon: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  balanceValue: { fontSize: 18, fontWeight: '900' },
  balanceLabel: {
    fontSize: 10, color: '#7A7A88', fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 1,
  },

  // ── Onglets ──
  tabs: {
    flexDirection: 'row', gap: 6,
    marginHorizontal: 16, marginTop: 4, marginBottom: 16,
    backgroundColor: '#131319',
    borderRadius: BorderRadius.full,
    borderWidth: 1, borderColor: TILE_BORDER,
    padding: 4,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 9,
    borderRadius: BorderRadius.full,
  },
  tabText: { fontSize: 13, fontWeight: '800', color: '#8A8A99' },
  tabTextOnGold: { color: '#191400' },
  tabTextOnGreen: { color: '#04170D' },

  body: { paddingHorizontal: 16 },

  // ── Tas de pièces ──
  coin: {
    position: 'absolute',
    width: COIN_D, height: COIN_D,
    borderRadius: COIN_D / 2,
    borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  coinCore: {
    width: COIN_D * 0.42, height: COIN_D * 0.42,
    borderRadius: COIN_D * 0.21,
  },

  // ── Pack vedette ──
  featuredWrap: {
    borderRadius: 20, overflow: 'hidden',
    marginBottom: 12,
  },
  featured: { padding: 16, paddingTop: 34 },
  featuredBadge: {
    position: 'absolute', top: 0, left: 0,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 12, paddingVertical: 5,
    borderBottomRightRadius: 12,
  },
  featuredBadgeText: { color: '#FFE9A3', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  featuredRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  featuredCoins: { color: '#231A00', fontSize: 21, fontWeight: '900' },
  featuredSub: { color: 'rgba(35,26,0,0.72)', fontSize: 11, fontWeight: '700', marginTop: 1 },
  featuredPrice: {
    minWidth: 82, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#1A1400',
    borderRadius: BorderRadius.full,
    paddingVertical: 11, paddingHorizontal: 14,
  },
  featuredPriceText: { color: GOLD, fontSize: 14, fontWeight: '900' },

  // ── Grille des packs ──
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    // Deux colonnes : (100% - gap) / 2
    width: '48.3%',
    alignItems: 'center',
    backgroundColor: TILE,
    borderRadius: 18, borderWidth: 1.5, borderColor: TILE_BORDER,
    paddingTop: 20, paddingBottom: 12, paddingHorizontal: 12,
    overflow: 'hidden',
  },
  tileBadge: {
    position: 'absolute', top: 0, right: 0,
    paddingHorizontal: 9, paddingVertical: 3,
    borderBottomLeftRadius: 10,
  },
  tileBadgeText: { color: '#191400', fontSize: 8, fontWeight: '900', letterSpacing: 0.4 },
  // Hauteur figée : sans elle, les vignettes se décalent verticalement selon la
  // taille de leur pile et la grille perd son alignement.
  tileStack: { height: 58, justifyContent: 'flex-end', marginBottom: 10 },
  tileCoins: { color: '#fff', fontSize: 19, fontWeight: '900' },
  tileUnit: { color: '#7A7A88', fontSize: 11, fontWeight: '600', marginTop: -1 },
  tileBonus: {
    borderWidth: 1, borderRadius: BorderRadius.full,
    paddingHorizontal: 9, paddingVertical: 2,
    marginTop: 7,
  },
  tileBonusText: { fontSize: 10, fontWeight: '800' },
  // Réserve l'espace du chip de bonus sur le palier qui n'en a pas.
  tileBonusPlaceholder: { height: 21, marginTop: 7 },
  tilePrice: {
    alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#A50044',
    borderRadius: BorderRadius.full,
    paddingVertical: 10,
    marginTop: 12,
  },
  tilePriceOff: { backgroundColor: '#2A2A34' },
  tilePriceText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  // Un pack que le store ne renvoie pas n'affiche pas de prix : montrer un
  // montant qu'on ne peut pas facturer laisserait croire à un bouton cassé.
  priceTextOff: { color: '#7A7A88', fontSize: 12, fontWeight: '700' },

  // ── Échange ──
  rateBox: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: TILE,
    borderRadius: 16, borderWidth: 1,
    padding: 14, marginBottom: 14,
  },
  rateIcon: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  rateTitle: { color: '#fff', fontSize: 15, fontWeight: '900' },
  rateDesc: { color: '#7A7A88', fontSize: 12, marginTop: 3, lineHeight: 17 },

  swapRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: TILE,
    borderRadius: 14, borderWidth: 1.5, borderColor: TILE_BORDER,
    paddingVertical: 12, paddingLeft: 14, paddingRight: 10,
    marginBottom: 10,
  },
  // Un palier atteignable se distingue au liseré, avant même de lire le bouton.
  swapRowOn: { borderColor: GREEN + '4D' },
  swapLeft: { flexDirection: 'row', alignItems: 'center' },
  swapCoinsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swapCoins: { color: GOLD, fontSize: 16, fontWeight: '900' },
  swapDollarsRow: { flexDirection: 'row', alignItems: 'center' },
  swapDollars: { color: GREEN, fontSize: 16, fontWeight: '900' },
  swapBtn: {
    minWidth: 92, alignItems: 'center', justifyContent: 'center',
    backgroundColor: GREEN,
    borderRadius: BorderRadius.full,
    paddingVertical: 9, paddingHorizontal: 14,
  },
  swapBtnOff: { backgroundColor: '#22222C' },
  swapBtnText: { color: '#04170D', fontSize: 13, fontWeight: '900' },
  swapBtnTextOff: { color: '#6A6A78' },

  // ── Divers ──
  noticeBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: TILE,
    borderRadius: 12, borderWidth: 1, borderColor: TILE_BORDER,
    padding: 13, marginBottom: 12,
  },
  noticeText: { flex: 1, color: '#8A8A99', fontSize: 12, lineHeight: 17 },

  legalText: {
    color: '#5C5C69', fontSize: 11, textAlign: 'center',
    lineHeight: 16, marginTop: 18,
  },
  legalLink: { color: '#8A8A99', textDecorationLine: 'underline' },
});
