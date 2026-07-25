import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import Purchases, {
  PRODUCT_CATEGORY,
  PurchasesStoreProduct,
  PurchasesStoreTransaction,
} from 'react-native-purchases';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, increment, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { CoinPack, COIN_PRODUCT_IDS, DollarTier, findPack, packTotalCoins } from '../config/store';
import { usePremium } from './PremiumContext';

/** Transactions déjà créditées, mémorisées par compte : évite de relire Firestore au lancement. */
const creditedKey = (userId: string) => `@coins_credited_tx_${userId}`;

/** Fenêtre de rattrapage : on ne rejoue que les achats récents, pas tout l'historique. */
const RECONCILE_LIMIT = 10;

interface StoreContextType {
  /** Produits App Store résolus, indexés par identifiant produit. Vide = non configurés. */
  products: Record<string, PurchasesStoreProduct>;
  isLoading: boolean;
  /** Identifiant du pack dont l'achat est en cours, sinon null. */
  purchasingId: string | null;
  /** Pièces créditées, ou null si l'utilisateur a annulé. Lève en cas d'erreur réelle. */
  purchasePack: (pack: CoinPack) => Promise<number | null>;
  /** Convertit des pièces en dollars. Lève `INSUFFICIENT_COINS` si le solde est trop bas. */
  exchangeForDollars: (tier: DollarTier) => Promise<void>;
  /** Palier dont l'échange est en cours, sinon null. */
  exchangingDollars: number | null;
  /** Réinterroge le store — un pack fraîchement complété côté Apple met un temps à être servi. */
  reloadProducts: () => Promise<void>;
  showStore: boolean;
  /** Onglet sur lequel ouvrir la boutique : 'buy' (défaut) ou 'swap' (échanger). */
  openStore: (section?: 'buy' | 'swap') => void;
  closeStore: () => void;
  /** Onglet demandé au dernier openStore — lu par StoreScreen à l'ouverture. */
  initialTab: 'buy' | 'swap';
}

const StoreContext = createContext<StoreContextType | null>(null);

export function StoreProvider({
  children,
  userId,
}: {
  children: React.ReactNode;
  userId?: string;
}) {
  const { revenueCatReady, isLoading: premiumLoading } = usePremium();
  const [products, setProducts] = useState<Record<string, PurchasesStoreProduct>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [exchangingDollars, setExchangingDollars] = useState<number | null>(null);
  const [showStore, setShowStore] = useState(false);
  const [initialTab, setInitialTab] = useState<'buy' | 'swap'>('buy');
  const reconciledRef = useRef<string | null>(null);

  // ── Catalogue ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!revenueCatReady) {
      // Clés RevenueCat absentes (Android pas encore configuré) : une fois le
      // Premium résolu, on sait que le SDK ne démarrera pas. On sort du spinner
      // pour afficher les prix indicatifs plutôt que de charger indéfiniment.
      if (!premiumLoading) setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    loadCoinProducts()
      .then(found => {
        if (cancelled) return;
        setProducts(found);
        const missing = COIN_PRODUCT_IDS.filter(id => !found[id]);
        if (missing.length) {
          // Sans ce log, un pack absent est indiscernable d'un pack mal nommé.
          console.warn('[Boutique] packs introuvables côté store :', missing.join(', '));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [revenueCatReady, premiumLoading]);

  // ── Rattrapage ─────────────────────────────────────────────────────────────
  // Un achat validé par Apple peut ne jamais avoir été crédité : app tuée juste
  // après le paiement, ou Firestore injoignable. RevenueCat garde la trace de la
  // transaction, on rejoue donc les achats récents au lancement. Le crédit étant
  // idempotent (cf. creditCoins), rejouer un achat déjà crédité ne fait rien.
  useEffect(() => {
    if (!revenueCatReady || !userId) return;
    if (reconciledRef.current === userId) return;
    reconciledRef.current = userId;

    let cancelled = false;
    (async () => {
      try {
        const info = await Purchases.getCustomerInfo();
        if (cancelled) return;
        const credited = await loadCreditedIds(userId);
        const pending = (info.nonSubscriptionTransactions ?? [])
          .filter(tx => findPack(tx.productIdentifier) !== undefined)
          .slice(-RECONCILE_LIMIT)
          .filter(tx => !credited.has(tx.transactionIdentifier));

        for (const tx of pending) {
          if (cancelled) return;
          await creditCoins(userId, tx);
        }
      } catch {
        // Rattrapage best-effort : il repassera au prochain lancement.
      }
    })();

    return () => { cancelled = true; };
  }, [revenueCatReady, userId]);

  const purchasePack = useCallback(async (pack: CoinPack): Promise<number | null> => {
    if (!userId) throw new Error('Connecte-toi pour acheter des pièces.');
    const product = products[pack.id];
    if (!product) throw new Error('Ce pack n\'est pas disponible pour le moment.');

    setPurchasingId(pack.id);
    try {
      const { transaction } = await Purchases.purchaseStoreProduct(product);
      try {
        // Le solde affiché suit l'écouteur Firestore du profil (AuthContext) :
        // le crédit ci-dessous remonte tout seul dans l'UI, rien à propager ici.
        await creditCoins(userId, transaction);
      } catch {
        // Apple a bien encaissé : ne JAMAIS annoncer un échec d'achat ici. Le
        // rattrapage au prochain lancement recréditera depuis la transaction
        // conservée par RevenueCat.
        throw new Error(
          'Ton achat est validé, mais les pièces n\'ont pas pu être créditées. '
          + 'Relance l\'app dans un instant : elles arriveront automatiquement.'
        );
      }
      return packTotalCoins(pack);
    } catch (e: any) {
      if (e?.userCancelled) return null;
      throw e;
    } finally {
      setPurchasingId(null);
    }
  }, [products, userId]);

  // Les produits ne sont résolus qu'au démarrage : sans ça, un pack qui devient
  // disponible côté Apple n'apparaît qu'après avoir tué et relancé l'app.
  const reloadProducts = useCallback(async (): Promise<void> => {
    if (!revenueCatReady) return;
    try {
      setProducts(await loadCoinProducts());
    } catch {
      // Rien à signaler : l'écran garde ce qu'il avait déjà résolu.
    }
  }, [revenueCatReady]);

  const exchangeForDollars = useCallback(async (tier: DollarTier): Promise<void> => {
    if (!userId) throw new Error('Connecte-toi pour échanger tes pièces.');
    setExchangingDollars(tier.dollars);
    try {
      // Le débit et le crédit doivent être atomiques ET reposer sur le solde
      // SERVEUR : se fier au solde local laisserait passer deux échanges lancés
      // depuis deux appareils, chacun voyant assez de pièces avant l'autre.
      await runTransaction(db, async (t) => {
        const userRef = doc(db, 'users', userId);
        const snap = await t.get(userRef);
        const balance = snap.data()?.coins ?? 0;
        if (balance < tier.coins) throw new Error('INSUFFICIENT_COINS');
        t.update(userRef, {
          coins: increment(-tier.coins),
          dollars: increment(tier.dollars),
        });
      });
    } finally {
      setExchangingDollars(null);
    }
  }, [userId]);

  return (
    <StoreContext.Provider value={{
      products,
      isLoading,
      purchasingId,
      purchasePack,
      exchangeForDollars,
      exchangingDollars,
      reloadProducts,
      showStore,
      initialTab,
      // `section` peut arriver comme un event (les appels `onPress={openStore}`
      // passent le GestureResponderEvent) : seul 'swap' explicite ouvre l'échange.
      openStore: (section) => {
        setInitialTab(section === 'swap' ? 'swap' : 'buy');
        setShowStore(true);
      },
      closeStore: () => setShowStore(false),
    }}>
      {children}
    </StoreContext.Provider>
  );
}

// ─── Catalogue ────────────────────────────────────────────────────────────────

/**
 * Résout les packs de pièces auprès du store, indexés par identifiant produit.
 *
 * Deux chemins, dans cet ordre :
 *  1. les OFFERINGS RevenueCat — exactement ce qu'emprunte le Premium, qui lui
 *     fonctionne déjà ; un pack rattaché à une offering est donc trouvé dans les
 *     mêmes conditions que l'abonnement ;
 *  2. l'interrogation directe par identifiant, pour les packs créés dans App
 *     Store Connect mais pas encore placés dans une offering RevenueCat.
 *
 * Les consommables exigent `PRODUCT_CATEGORY.NON_SUBSCRIPTION` : par défaut le
 * SDK interroge le store en « abonnement » et ne renvoie rien.
 */
async function loadCoinProducts(): Promise<Record<string, PurchasesStoreProduct>> {
  const found: Record<string, PurchasesStoreProduct> = {};

  try {
    const offerings = await Purchases.getOfferings();
    for (const offering of Object.values(offerings.all ?? {})) {
      for (const pkg of offering.availablePackages) {
        if (COIN_PRODUCT_IDS.includes(pkg.product.identifier)) {
          found[pkg.product.identifier] = pkg.product;
        }
      }
    }
  } catch {
    // Offerings injoignables : l'interrogation directe ci-dessous reste possible.
  }

  const missing = COIN_PRODUCT_IDS.filter(id => !found[id]);
  if (missing.length > 0) {
    try {
      const list = await Purchases.getProducts(missing, PRODUCT_CATEGORY.NON_SUBSCRIPTION);
      for (const product of list) found[product.identifier] = product;
    } catch (e) {
      // Sans ce log, un fetch direct qui échoue en bloc est indiscernable de
      // fiches App Store Connect incomplètes : dans les deux cas la boutique
      // affiche « Indisponible », mais la correction n'est pas au même endroit.
      console.warn('[Boutique] interrogation directe du store en échec :', e);
    }
  }

  return found;
}

// ─── Crédit des pièces ────────────────────────────────────────────────────────

/**
 * Crédite les pièces d'un achat, une seule fois.
 *
 * L'idempotence repose sur `coinPurchases/{transactionId}` : la transaction
 * Firestore n'incrémente le solde que si ce document n'existe pas encore. C'est
 * ce qui rend le rattrapage au lancement sans danger, et ce qui protège des
 * doubles crédits si Apple rejoue la transaction sur un autre appareil.
 */
async function creditCoins(userId: string, tx: PurchasesStoreTransaction): Promise<void> {
  const pack = findPack(tx.productIdentifier);
  if (!pack) return;
  const amount = packTotalCoins(pack);

  await runTransaction(db, async (t) => {
    const purchaseRef = doc(db, 'coinPurchases', tx.transactionIdentifier);
    const snap = await t.get(purchaseRef);
    if (snap.exists()) return; // déjà crédité

    t.set(purchaseRef, {
      userId,
      productId: tx.productIdentifier,
      coins: amount,
      purchaseDate: tx.purchaseDate ?? null,
      creditedAt: serverTimestamp(),
    });
    t.update(doc(db, 'users', userId), { coins: increment(amount) });
  });

  await rememberCreditedId(userId, tx.transactionIdentifier);
}

async function loadCreditedIds(userId: string): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(creditedKey(userId));
    return new Set<string>(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set<string>();
  }
}

async function rememberCreditedId(userId: string, txId: string): Promise<void> {
  try {
    const ids = await loadCreditedIds(userId);
    ids.add(txId);
    // Même fenêtre que le rattrapage : au-delà, l'entrée ne sert plus à rien.
    const kept = Array.from(ids).slice(-RECONCILE_LIMIT * 2);
    await AsyncStorage.setItem(creditedKey(userId), JSON.stringify(kept));
  } catch {
    // Cache best-effort : sans lui on relit Firestore, le crédit reste correct.
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
