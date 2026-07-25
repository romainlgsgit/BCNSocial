import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import Purchases, { PurchasesPackage, CustomerInfo } from 'react-native-purchases';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, updateDoc, getDoc, collection, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../config/firebase';

const DEV_PREMIUM_DISABLED_KEY = '@dev_premium_disabled';

// ─── Clés RevenueCat ──────────────────────────────────────────────────────────
// À remplacer par tes vraies clés RevenueCat (app.revenuecat.com)
const RC_API_KEY_IOS     = 'appl_aFWtemtLPQhEkNHYvJZOUnhGJXv';
const RC_API_KEY_ANDROID = 'goog_YOUR_REVENUECAT_ANDROID_KEY';

// IDs des produits App Store Connect (à créer dans ASC)
export const PRODUCT_IDS = {
  monthly: 'bcnsocial_premium_monthly',  // 2,99€/mois
  annual:  'bcnsocial_premium_yearly',   // 19,99€/an
};

// Bonus au renouvellement (crédités ensemble, même déclencheur mensuel)
export const PREMIUM_MONTHLY_COINS = 500;
export const PREMIUM_MONTHLY_DOLLARS = 20;

// ─── Types ────────────────────────────────────────────────────────────────────

interface PremiumContextType {
  isPremium: boolean;
  isLoading: boolean;
  /** RevenueCat est configuré : les autres achats (boutique de pièces) peuvent démarrer. */
  revenueCatReady: boolean;
  packages: PurchasesPackage[];
  purchasePackage: (pkg: PurchasesPackage) => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  openPremiumScreen: () => void;
  closePremiumScreen: () => void;
  showPremiumScreen: boolean;
  canPost: (currentDailyCount: number) => boolean;
  FREE_DAILY_POST_LIMIT: number;
  devResetPremium: () => void;
}

const PremiumContext = createContext<PremiumContextType | null>(null);

export const FREE_DAILY_POST_LIMIT = 5;
// Au-delà des posts gratuits, un non-Premium peut continuer en payant ce montant
// (en dollars du jeu) pour CHAQUE post supplémentaire.
export const EXTRA_POST_COST = 5;

// ─── Provider ─────────────────────────────────────────────────────────────────

export function PremiumProvider({
  children,
  userId,
  authReady = true,
}: {
  children: React.ReactNode;
  userId?: string;
  authReady?: boolean;
}) {
  const [isPremium, setIsPremium] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [showPremiumScreen, setShowPremiumScreen] = useState(false);
  const [revenueCatReady, setRevenueCatReady] = useState(false);
  // RevenueCat ne doit être configuré qu'une seule fois par lancement d'app —
  // le rappeler à chaque changement de compte (login/logout) perturbe le SDK.
  const configuredRef = useRef(false);

  // Init RevenueCat
  useEffect(() => {
    // Tant que la session Firebase n'est pas résolue, userId oscille entre
    // undefined et sa vraie valeur au lancement de l'app. Démarrer RevenueCat
    // sur cet état transitoire déclenche un logOut() (userId undefined) suivi
    // de peu par un logIn() (vrai userId) — deux appels concurrents au SDK dont
    // l'ordre de résolution n'est pas garanti, d'où le premium qui disparaît
    // au hasard selon lequel des deux répond en dernier. On attend que la
    // session soit définitivement connue avant de toucher RevenueCat.
    if (!authReady) return;

    // Réinitialise immédiatement à chaque changement de compte
    setIsPremium(false);
    setIsLoading(true);

    const key = Platform.OS === 'ios' ? RC_API_KEY_IOS : RC_API_KEY_ANDROID;
    if (key.includes('YOUR_')) {
      setIsLoading(false);
      return;
    }

    if (!configuredRef.current) {
      Purchases.configure({ apiKey: key });
      configuredRef.current = true;
    }
    setRevenueCatReady(true);

    let cancelled = false;
    Purchases.addCustomerInfoUpdateListener(handleCustomerInfo);

    (async () => {
      try {
        // logIn/logOut renvoient déjà le customerInfo à jour pour la nouvelle
        // identité — on l'utilise directement plutôt que de refaire un appel
        // getCustomerInfo() séparé, qui pourrait repartir sur l'ancienne identité.
        const info = userId
          ? (await Purchases.logIn(userId)).customerInfo
          : await Purchases.logOut();
        if (cancelled) return;
        await applyCustomerInfo(info);
      } catch {}
      if (cancelled) return;
      loadOfferings();
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
      Purchases.removeCustomerInfoUpdateListener(handleCustomerInfo);
    };
  }, [userId, authReady]);

  const applyCustomerInfo = useCallback(async (info: CustomerInfo) => {
    const devDisabled = await AsyncStorage.getItem(DEV_PREMIUM_DISABLED_KEY);
    if (devDisabled === 'true') return;
    const active = info.entitlements.active['premium'] !== undefined;
    setIsPremium(active);
    if (userId) syncPremiumToFirestore(userId, active, info);
  }, [userId]);

  const handleCustomerInfo = useCallback((info: CustomerInfo) => {
    applyCustomerInfo(info);
  }, [applyCustomerInfo]);

  async function loadOfferings() {
    try {
      const offerings = await Purchases.getOfferings();
      const pkgs = offerings.current?.availablePackages ?? [];
      setPackages(pkgs);
    } catch {}
  }

  const purchasePackage = useCallback(async (pkg: PurchasesPackage): Promise<boolean> => {
    try {
      await AsyncStorage.removeItem(DEV_PREMIUM_DISABLED_KEY);
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      const active = customerInfo.entitlements.active['premium'] !== undefined;
      setIsPremium(active);
      if (userId && active) await syncPremiumToFirestore(userId, true, customerInfo, true);
      return active;
    } catch (e: any) {
      if (e.userCancelled) return false;
      throw e;
    }
  }, [userId]);

  const restorePurchases = useCallback(async (): Promise<boolean> => {
    try {
      await AsyncStorage.removeItem(DEV_PREMIUM_DISABLED_KEY);
      const info = await Purchases.restorePurchases();
      const active = info.entitlements.active['premium'] !== undefined;
      setIsPremium(active);
      if (userId) await syncPremiumToFirestore(userId, active, info);
      return active;
    } catch {
      return false;
    }
  }, [userId]);

  const canPost = useCallback((dailyCount: number) => {
    if (isPremium) return true;
    return dailyCount < FREE_DAILY_POST_LIMIT;
  }, [isPremium]);

  const devResetPremium = async () => {
    await AsyncStorage.setItem(DEV_PREMIUM_DISABLED_KEY, 'true');
    setIsPremium(false);
    if (userId) {
      try {
        await updateDoc(doc(db, 'users', userId), {
          isPremium: false,
          verified: false,
          premiumUpdatedAt: new Date().toISOString(),
        });
      } catch {}
    }
  };

  return (
    <PremiumContext.Provider value={{
      isPremium,
      isLoading,
      revenueCatReady,
      packages,
      purchasePackage,
      restorePurchases,
      openPremiumScreen: () => setShowPremiumScreen(true),
      closePremiumScreen: () => setShowPremiumScreen(false),
      showPremiumScreen,
      canPost,
      FREE_DAILY_POST_LIMIT,
      devResetPremium,
    }}>
      {children}
    </PremiumContext.Provider>
  );
}

// ─── Firestore sync ───────────────────────────────────────────────────────────

async function syncPremiumToFirestore(userId: string, isPremium: boolean, info: CustomerInfo, isNewPurchase = false) {
  try {
    const userRef = doc(db, 'users', userId);
    const updates: Record<string, any> = {
      isPremium,
      premiumUpdatedAt: new Date().toISOString(),
    };

    if (isPremium) {
      updates.verified = true;

      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const data = snap.data();
        const lastBonus = data.lastPremiumBonusDate ?? '';
        const now = new Date();
        const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        // Jour de renouvellement = jour d'achat original
        const originalDateStr = info.entitlements.active['premium']?.originalPurchaseDate;
        let renewalDay = now.getDate(); // fallback = aujourd'hui (1er achat)
        if (originalDateStr) {
          const parsed = new Date(originalDateStr);
          if (!isNaN(parsed.getTime())) renewalDay = parsed.getDate();
        }

        // Mois courts : souscrit le 31 → dernier jour du mois
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const effectiveRenewalDay = Math.min(renewalDay, daysInMonth);
        const bonusUnlocked = now.getDate() >= effectiveRenewalDay;

        if (isNewPurchase || (lastBonus !== thisMonth && bonusUnlocked)) {
          updates.coins = (data.coins ?? 0) + PREMIUM_MONTHLY_COINS;
          updates.dollars = (data.dollars ?? 0) + PREMIUM_MONTHLY_DOLLARS;
          updates.lastPremiumBonusDate = thisMonth;
        }
      }
    } else {
      updates.verified = false;
    }

    await updateDoc(userRef, updates);

    // Mettre à jour verified sur tous les posts
    const postsSnap = await getDocs(
      query(collection(db, 'posts'), where('userId', '==', userId))
    );
    if (!postsSnap.empty) {
      const batch = writeBatch(db);
      postsSnap.docs.forEach(d => batch.update(d.ref, { verified: isPremium }));
      await batch.commit();
    }
  } catch {}
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePremium() {
  const ctx = useContext(PremiumContext);
  if (!ctx) throw new Error('usePremium must be used inside PremiumProvider');
  return ctx;
}
