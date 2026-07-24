import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  updateProfile,
  deleteUser,
  signInWithCredential,
  linkWithCredential,
  reauthenticateWithCredential,
  sendEmailVerification,
  reload,
  EmailAuthProvider,
  OAuthProvider,
  OAuthCredential,
} from 'firebase/auth';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import { doc, getDoc, setDoc, updateDoc, onSnapshot, collection, collectionGroup, query, where, getDocs, writeBatch, deleteDoc, arrayRemove, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { User } from '../types';
import { calibrateFromServer, resetServerTime, serverNow } from '../utils/serverTime';
import { BanState, BanVerdict, evaluateBan } from '../utils/ban';
import { isIdentityBanned } from '../utils/bannedIdentities';
import { needsVerification } from '../utils/emailVerification';
import { sendVerificationEmail } from '../utils/sendVerification';

export interface AuthResult {
  success: boolean;
  error?: string;
}

/**
 * Aligne les préférences de notification sur l'autorisation système.
 *
 * Accorder « Autoriser » à iOS n'activait rien côté app : les réglages du profil
 * restaient sur OFF, donc l'utilisateur ne recevait ni les buts ni les mentions
 * alors qu'il venait d'accepter. On active donc les préférences JAMAIS renseignées
 * (champ absent) dès que la permission est accordée.
 *
 * On ne touche PAS à une préférence déjà positionnée : un `false` explicite est un
 * choix de l'utilisateur, le réactiver serait un rétablissement non consenti.
 */
let notifDefaultsApplied = false;
async function applyNotifDefaults(
  userRef: ReturnType<typeof doc>,
  data: Record<string, any>,
): Promise<void> {
  if (notifDefaultsApplied) return;
  const missing: Record<string, boolean> = {};
  if (data.liveNotifEnabled === undefined) missing.liveNotifEnabled = true;
  if (data.mentionNotifEnabled === undefined) missing.mentionNotifEnabled = true;
  if (Object.keys(missing).length === 0) { notifDefaultsApplied = true; return; }

  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return; // pas encore autorisé : on retentera au prochain snapshot
    notifDefaultsApplied = true;
    await updateDoc(userRef, missing);
  } catch {
    // Permission illisible : on réessaiera, rien de bloquant.
  }
}

// Clé de réservation d'un pseudo : normalisée en minuscules → l'unicité est
// INSENSIBLE À LA CASSE (« Bob », « bob » et « BOB » sont le même pseudo). La casse
// d'origine reste affichée (elle vit dans users/{uid}.username), seule la clé du doc
// /usernames est normalisée.
function usernameKey(name: string): string {
  return name.trim().toLowerCase();
}

// Résout un identifiant de connexion (email ou pseudo) en email Firebase Auth.
// Le mapping pseudo → email vit dans /usernames (lecture publique, cf firestore.rules)
// car /users nécessite d'être authentifié — impossible avant la connexion.
async function resolveEmail(identifier: string): Promise<string> {
  const trimmed = identifier.trim();
  if (trimmed.includes('@')) return trimmed;
  const snap = await getDoc(doc(db, 'usernames', usernameKey(trimmed)));
  const email = snap.data()?.email;
  if (!email) throw new Error('Aucun compte avec ce pseudo.');
  return email;
}

// Décode le claim "email" du jeton Apple sans vérification de signature — utilisé
// uniquement pour préremplir l'UI (la vérification réelle vient de Firebase/Apple
// au moment du linkWithCredential). Nécessaire car Firebase ne renvoie plus
// customData.email sur auth/account-exists-with-different-credential
// (protection anti-énumération), et le champ appleCredential.email natif n'est
// fourni par Apple qu'à la toute première autorisation.
function decodeAppleEmail(identityToken: string): string | undefined {
  try {
    const payloadB64 = identityToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payloadB64 + '='.repeat((4 - (payloadB64.length % 4)) % 4);
    const json = decodeURIComponent(
      atob(padded)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    );
    return JSON.parse(json)?.email as string | undefined;
  } catch {
    return undefined;
  }
}

// Lance le flow natif Apple et construit le credential Firebase correspondant —
// partagé entre la connexion (loginWithApple) et la liaison à chaud
// (linkAppleToCurrentAccount) pour éviter de dupliquer la logique de nonce.
async function requestAppleCredential(): Promise<
  { appleCredential: AppleAuthentication.AppleAuthenticationCredential; firebaseCredential: OAuthCredential } | null
> {
  const rawNonce = Array.from(await Crypto.getRandomBytesAsync(16))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

  const appleCredential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });

  if (!appleCredential.identityToken) return null;

  const provider = new OAuthProvider('apple.com');
  const firebaseCredential = provider.credential({
    idToken: appleCredential.identityToken,
    rawNonce,
  });

  return { appleCredential, firebaseCredential };
}

// Traduit les codes d'erreur Firebase Auth en messages compréhensibles.
function mapAuthError(e: any): string {
  const code = e?.code as string | undefined;
  switch (code) {
    case 'auth/email-already-in-use':
      return 'Cette adresse email est déjà utilisée par un autre compte.';
    case 'auth/invalid-email':
      return 'Adresse email invalide.';
    case 'auth/weak-password':
      return 'Mot de passe trop faible (6 caractères minimum).';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
      return 'Email/pseudo ou mot de passe incorrect.';
    case 'auth/too-many-requests':
      return 'Trop de tentatives. Réessaie dans quelques minutes.';
    case 'auth/network-request-failed':
      return 'Problème de connexion réseau.';
    case 'auth/account-exists-with-different-credential':
      return 'Un compte existe déjà avec cet email.';
    default:
      return e?.message || 'Une erreur est survenue.';
  }
}

const ADMIN_EMAIL = 'legrosromain27@gmail.com';

const BANNED_MESSAGE =
  'Ce compte a été banni définitivement. La connexion et la création d\'un nouveau compte avec cette adresse ou ce pseudo sont bloquées.';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  /** Statut de bannissement, calculé sur l'heure serveur. */
  banVerdict: BanVerdict;
  /** L'adresse email doit-elle être confirmée avant d'utiliser l'app ? */
  needsEmailVerification: boolean;
  /** Renvoie le lien de vérification. */
  resendVerificationEmail: () => Promise<AuthResult>;
  /** Recharge le compte depuis Firebase ; true si l'adresse est désormais vérifiée. */
  refreshEmailVerified: () => Promise<boolean>;
  isLoading: boolean;
  login: (identifier: string, password: string) => Promise<AuthResult>;
  register: (username: string, email: string, password: string) => Promise<AuthResult>;
  loginWithApple: () => Promise<AuthResult>;
  pendingAppleLinkEmail: string | null;
  completeAppleLink: (password: string) => Promise<AuthResult>;
  cancelAppleLink: () => void;
  isAppleLinked: boolean;
  linkAppleToCurrentAccount: () => Promise<AuthResult>;
  resetPassword: (identifier: string) => Promise<AuthResult>;
  logout: () => void;
  /** @param password requis pour un compte email/mot de passe (ré-authentification). */
  deleteAccount: (password?: string) => Promise<void>;
  changeUsername: (newUsername: string) => Promise<void>;
  updateCoins: (amount: number) => void;
  addPoints: (amount: number) => void;
  updatePhoto: (photoURL: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [banState, setBanState] = useState<BanState | null>(null);
  // Vérification de l'adresse email (comptes créés après la bascule uniquement).
  const [emailVerified, setEmailVerified] = useState(true);
  const [verifCreationTime, setVerifCreationTime] = useState<string | null>(null);
  const [verifProviders, setVerifProviders] = useState<string[]>([]);
  // Identifiants Apple en attente d'être liés à un compte email/mot de passe existant
  // (collision détectée par Firebase : même email, provider différent).
  const pendingAppleCredentialRef = useRef<OAuthCredential | null>(null);
  const [pendingAppleLinkEmail, setPendingAppleLinkEmail] = useState<string | null>(null);
  const [isAppleLinked, setIsAppleLinked] = useState(false);

  const refreshAppleLinked = () => {
    setIsAppleLinked(auth.currentUser?.providerData.some((p) => p.providerId === 'apple.com') ?? false);
  };

  useEffect(() => {
    // Écoute temps réel du document utilisateur : pièces, points et grade reflètent
    // la base en direct (et se synchronisent entre appareils).
    let profileUnsub: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (profileUnsub) { profileUnsub(); profileUnsub = null; }
      refreshAppleLinked();

      if (!firebaseUser) {
        setUser(null);
        setBanState(null);
        setEmailVerified(true);
        setVerifCreationTime(null);
        setVerifProviders([]);
        resetServerTime();
        setIsLoading(false);
        return;
      }

      setEmailVerified(firebaseUser.emailVerified);
      setVerifCreationTime(firebaseUser.metadata.creationTime ?? null);
      setVerifProviders(firebaseUser.providerData.map((p: { providerId: string }) => p.providerId));

      const userRef = doc(db, 'users', firebaseUser.uid);
      // Pseudo à ÉCRIRE : uniquement le displayName Firebase (posé par register /
      // Apple / changement de pseudo). JAMAIS l'email : au moment où cet écouteur
      // se déclenche à l'inscription, displayName n'est pas encore propagé, et écrire
      // l'email ici écrasait le pseudo choisi (bug « mon pseudo = mon email »).
      const displayName = firebaseUser.displayName || null;
      // Pseudo à AFFICHER en dernier recours si le doc n'en a pas encore (jamais stocké).
      const displayFallback = displayName || firebaseUser.email!.split('@')[0];

      profileUnsub = onSnapshot(userRef, (snap) => {
        if (!snap.exists()) {
          // Merge : register écrit le pseudo choisi en parallèle, on ne l'écrase pas.
          const base: Record<string, unknown> = { coins: 200, points: 0, avatar: '🦁' };
          if (displayName) base.username = displayName;
          setDoc(userRef, base, { merge: true }).catch(() => {});
          return;
        }

        const data = snap.data();
        if (!data.username && displayName) updateDoc(userRef, { username: displayName }).catch(() => {});
        applyNotifDefaults(userRef, data);

        // ── Horloge serveur (bannissements) ──
        // `clockPing` est un serverTimestamp écrit par nos soins : quand il revient
        // résolu par cet écouteur, il donne l'heure du SERVEUR, donc l'écart avec
        // l'horloge (falsifiable) de l'appareil. On ne le demande que si un
        // bannissement est en cours — inutile de faire écrire tout le monde.
        const hasBan = !!data.banPermanent || !!data.bannedUntil;
        const ping = data.clockPing;
        if (hasBan) {
          if (ping?.toMillis) calibrateFromServer(ping.toMillis());
          if (!ping || Date.now() - (ping.toMillis?.() ?? 0) > 60_000) {
            updateDoc(userRef, { clockPing: serverTimestamp() }).catch(() => {});
          }
        }

        setBanState({
          bannedUntil: data.bannedUntil?.toMillis?.() ?? null,
          banPermanent: !!data.banPermanent,
          banReason: data.banReason ?? null,
        });

        // Firestore est la source de vérité pour le pseudo
        const username = data.username || displayFallback;

        setUser({
          id: firebaseUser.uid,
          username,
          email: firebaseUser.email!,
          avatar: data.avatar ?? '🦁',
          photoBase64: data.photoBase64 ?? undefined,
          verified: data.verified ?? false,
          goldVerified: data.goldVerified ?? false,
          liveNotifEnabled: data.liveNotifEnabled ?? false,
          mentionNotifEnabled: data.mentionNotifEnabled ?? false,
          lastUsernameChange: data.lastUsernameChange ?? undefined,
          coins: data.coins ?? 200,
          points: data.points ?? 0,
          // Série du quiz + visibilité du badge (absent = badge affiché)
          quizStreak: data.quizStreak ?? 0,
          quizLastPlayed: data.quizLastPlayed ?? undefined,
          badgeVisible: data.badgeVisible,
          // Exposés ici pour que FollowContext n'ait pas besoin d'un second écouteur
          // sur le même document (une lecture de moins par lancement et par mise à jour).
          followersCount: data.followersCount ?? 0,
          followingCount: data.followingCount ?? 0,
          pronostics: [],
          joinedAt: firebaseUser.metadata.creationTime || new Date().toISOString(),
        });
        setIsLoading(false);
      }, () => {
        setIsLoading(false);
      });
    });

    return () => {
      if (profileUnsub) profileUnsub();
      unsubscribe();
    };
  }, []);

  // isLoading (contexte) ne reflète QUE la résolution de session initiale
  // (onAuthStateChanged au démarrage) — piloter le splash de AppNavigator. Le
  // suivre aussi pendant login/register/Apple ferait clignoter tout le
  // navigateur (démonte AuthScreen) pendant l'appel, ce qui : efface le message
  // d'erreur avant qu'il s'affiche, et pour Apple, réaffiche brièvement l'écran
  // de connexion avant que la session soit reconnue. L'état "en cours" propre à
  // chaque action vit localement dans les écrans (submitting/loading locaux).
  const login = async (identifier: string, password: string): Promise<AuthResult> => {
    try {
      const email = await resolveEmail(identifier);
      // Bannissement définitif : on vérifie AVANT de connecter, pour que l'app
      // n'ouvre jamais une session sur un compte définitivement exclu.
      if (await isIdentityBanned(identifier) || await isIdentityBanned(email)) {
        return { success: false, error: BANNED_MESSAGE };
      }
      await signInWithEmailAndPassword(auth, email, password);
      return { success: true };
    } catch (e) {
      console.error('Login error:', e);
      return { success: false, error: mapAuthError(e) };
    }
  };

  const resetPassword = async (identifier: string): Promise<AuthResult> => {
    try {
      const email = await resolveEmail(identifier);
      await sendPasswordResetEmail(auth, email);
      return { success: true };
    } catch (e) {
      console.error('Reset password error:', e);
      return { success: false, error: mapAuthError(e) };
    }
  };

  const register = async (
    username: string,
    email: string,
    password: string
  ): Promise<AuthResult> => {
    try {
      const trimmedUsername = username.trim();
      // Recréation d'un compte banni définitivement : bloquée sur l'email ET sur
      // le pseudo, avant toute création côté Firebase Auth.
      if (await isIdentityBanned(email) || await isIdentityBanned(trimmedUsername)) {
        return { success: false, error: BANNED_MESSAGE };
      }
      const existingUsername = await getDoc(doc(db, 'usernames', usernameKey(trimmedUsername)));
      if (existingUsername.exists()) {
        return { success: false, error: 'Ce pseudo est déjà utilisé.' };
      }

      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: trimmedUsername });

      // Écriture AUTORITAIRE du pseudo dans le doc `users` (merge) : on tient la valeur
      // en main, sans dépendre de la propagation du displayName. Sans ça, l'écouteur
      // onAuthStateChanged, déclenché avant, y avait déjà mis la partie email.
      await setDoc(
        doc(db, 'users', cred.user.uid),
        { username: trimmedUsername, coins: 200, points: 0, avatar: '🦁' },
        { merge: true },
      ).catch(() => {});

      try {
        // "create" uniquement (cf firestore.rules) : échoue si le pseudo vient d'être
        // pris (course entre deux inscriptions). Clé en minuscules = unicité
        // insensible à la casse ; on garde la casse tapée dans le champ `username`.
        await setDoc(doc(db, 'usernames', usernameKey(trimmedUsername)), {
          email, uid: cred.user.uid, username: trimmedUsername,
        });
      } catch {
        // Annule la création du compte plutôt que de laisser un compte orphelin.
        await deleteUser(cred.user).catch(() => {});
        return { success: false, error: 'Ce pseudo vient d\'être pris, choisis-en un autre.' };
      }

      // Envoi du lien de vérification (mail français via le Worker, repli Firebase).
      // Un échec ici ne doit pas annuler l'inscription : l'écran de vérification
      // propose de le renvoyer.
      await sendVerificationEmail(cred.user).catch(() => {});

      setUser((prev) => (prev ? { ...prev, username: trimmedUsername, coins: 200 } : prev));
      return { success: true };
    } catch (e) {
      console.error('Register error:', e);
      return { success: false, error: mapAuthError(e) };
    }
  };

  // ── Connexion Apple ──
  // Si l'email Apple correspond déjà à un compte créé par email/mot de passe,
  // Firebase refuse la connexion directe (auth/account-exists-with-different-credential).
  // On garde alors le credential Apple de côté et on demande le mot de passe existant
  // pour lier les deux (linkWithCredential) — même compte, pas de doublon.
  const loginWithApple = async (): Promise<AuthResult> => {
    try {
      const result = await requestAppleCredential();
      if (!result) return { success: false, error: 'Connexion Apple annulée.' };
      const { appleCredential, firebaseCredential } = result;

      try {
        const cred = await signInWithCredential(auth, firebaseCredential);
        // Premier login Apple : initialise un pseudo comme pour une inscription classique.
        if (cred.user.metadata.creationTime === cred.user.metadata.lastSignInTime) {
          const fallback =
            appleCredential.fullName?.givenName ||
            cred.user.email?.split('@')[0] ||
            `culer_${cred.user.uid.slice(0, 6)}`;
          await updateProfile(cred.user, { displayName: fallback });
          // Écriture autoritaire du pseudo (même raison qu'à l'inscription classique).
          await setDoc(
            doc(db, 'users', cred.user.uid),
            { username: fallback, coins: 200, points: 0, avatar: '🦁' },
            { merge: true },
          ).catch(() => {});
          if (cred.user.email) {
            setDoc(doc(db, 'usernames', usernameKey(fallback)), {
              email: cred.user.email, uid: cred.user.uid, username: fallback,
            }).catch(() => {});
          }
        }
        refreshAppleLinked();
        return { success: true };
      } catch (e: any) {
        if (e?.code === 'auth/account-exists-with-different-credential') {
          pendingAppleCredentialRef.current = firebaseCredential;
          const email =
            (e?.customData?.email as string | undefined) ??
            decodeAppleEmail(appleCredential.identityToken!);
          setPendingAppleLinkEmail(email ?? null);
          return {
            success: false,
            error: 'Un compte existe déjà avec cet email — entre son mot de passe pour lier Apple à ce même compte.',
          };
        }
        throw e;
      }
    } catch (e: any) {
      if (e?.code === 'ERR_REQUEST_CANCELED') return { success: false };
      console.error('Apple login error:', e);
      return { success: false, error: mapAuthError(e) };
    }
  };

  // Lie Apple à un compte DÉJÀ authentifié (depuis les Réglages) — aucun mot de
  // passe requis puisque la session en cours prouve déjà l'identité. Empêche de
  // retomber plus tard sur le flow "compte existant" en se déconnectant/reconnectant.
  const linkAppleToCurrentAccount = async (): Promise<AuthResult> => {
    if (!auth.currentUser) return { success: false, error: 'Tu dois être connecté.' };
    try {
      const result = await requestAppleCredential();
      if (!result) return { success: false, error: 'Connexion Apple annulée.' };
      await linkWithCredential(auth.currentUser, result.firebaseCredential);
      refreshAppleLinked();
      return { success: true };
    } catch (e: any) {
      console.error('Apple link error:', e);
      if (e?.code === 'ERR_REQUEST_CANCELED') return { success: false };
      if (e?.code === 'auth/credential-already-in-use') {
        return { success: false, error: 'Ce compte Apple est déjà lié à un autre compte BCN Social.' };
      }
      if (e?.code === 'auth/invalid-credential') {
        return { success: false, error: 'Le jeton Apple est invalide ou a expiré — réessaie.' };
      }
      if (e?.code === 'auth/requires-recent-login') {
        return { success: false, error: 'Reconnecte-toi (déconnexion puis reconnexion) avant de lier Apple.' };
      }
      return { success: false, error: mapAuthError(e) };
    }
  };

  const completeAppleLink = async (password: string): Promise<AuthResult> => {
    const email = pendingAppleLinkEmail;
    const credential = pendingAppleCredentialRef.current;
    if (!email || !credential) return { success: false, error: 'Aucune liaison Apple en attente.' };

    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      await linkWithCredential(cred.user, credential);
      pendingAppleCredentialRef.current = null;
      setPendingAppleLinkEmail(null);
      refreshAppleLinked();
      return { success: true };
    } catch (e) {
      return { success: false, error: mapAuthError(e) };
    }
  };

  const cancelAppleLink = () => {
    pendingAppleCredentialRef.current = null;
    setPendingAppleLinkEmail(null);
  };

  const logout = async () => {
    await signOut(auth);
  };

  const changeUsername = async (newUsername: string) => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser || !user) return;

    const trimmed = newUsername.trim();
    const newKey = usernameKey(trimmed);
    const oldKey = usernameKey(user.username);

    // Réservation du nouveau pseudo (sauf simple changement de casse du sien).
    // Avant, changeUsername ne touchait pas /usernames : le pseudo n'était ni vérifié
    // ni réservé, et l'ancien restait pris à vie.
    if (newKey !== oldKey) {
      const taken = await getDoc(doc(db, 'usernames', newKey));
      if (taken.exists()) throw new Error('Ce pseudo est déjà utilisé.');
      // "create" uniquement : si un autre l'a réservé entre-temps, ça échoue → on
      // remonte l'erreur sans avoir rien modifié d'autre.
      await setDoc(doc(db, 'usernames', newKey), {
        email: user.email, uid: user.id, username: trimmed,
      });
    }

    await updateProfile(firebaseUser, { displayName: trimmed });
    await updateDoc(doc(db, 'users', user.id), {
      username: trimmed,
      lastUsernameChange: new Date().toISOString(),
    });

    // Libère l'ancienne réservation (après avoir sécurisé la nouvelle).
    if (newKey !== oldKey) {
      await deleteDoc(doc(db, 'usernames', oldKey)).catch(() => {});
    }

    // Met à jour le pseudo affiché sur tous les posts existants.
    const postsSnap = await getDocs(query(collection(db, 'posts'), where('userId', '==', user.id)));
    if (!postsSnap.empty) {
      const batch = writeBatch(db);
      postsSnap.docs.forEach(d => batch.update(d.ref, { username: trimmed }));
      await batch.commit();
    }
  };

  /**
   * Supprime définitivement le compte.
   *
   * ORDRE CRITIQUE — la version précédente effaçait les données AVANT d'appeler
   * `deleteUser`, qui échoue avec `auth/requires-recent-login` dès que la session
   * date d'un peu : l'utilisateur perdait ses posts et sa photo mais son compte
   * Auth survivait, donc il pouvait se reconnecter (et l'app lui recréait un profil
   * vierge). On ré-authentifie donc D'ABORD : tant que ça n'a pas abouti, rien n'est
   * touché. Les données ne peuvent pas non plus être supprimées après `deleteUser`,
   * car les règles Firestore rejettent tout écrit une fois `request.auth` nul.
   *
   * @param password mot de passe, requis pour un compte email/mot de passe dont la
   *                 connexion n'est plus récente. Les comptes Apple se ré-authentifient
   *                 via Apple, sans saisie.
   */
  const deleteAccount = async (password?: string) => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser || !user) return;

    // ── 1. Ré-authentification (avant toute suppression) ──
    const appleLinked = firebaseUser.providerData.some(
      (p: { providerId: string }) => p.providerId === 'apple.com',
    );
    if (password && firebaseUser.email) {
      await reauthenticateWithCredential(
        firebaseUser,
        EmailAuthProvider.credential(firebaseUser.email, password),
      );
    } else if (appleLinked) {
      const nonce = Math.random().toString(36).slice(2);
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        nonce,
      );
      const appleCred = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
        nonce: hashedNonce,
      });
      if (!appleCred.identityToken) throw new Error('apple-reauth-failed');
      const provider = new OAuthProvider('apple.com');
      await reauthenticateWithCredential(
        firebaseUser,
        provider.credential({ idToken: appleCred.identityToken, rawNonce: nonce }),
      );
    }
    // Sinon : connexion supposée récente. `deleteUser` tranchera (et ne laissera
    // aucune donnée derrière lui puisqu'on n'a encore rien supprimé).

    const uid = user.id;

    // ── 2. Vérifie que le compte peut réellement être supprimé ──
    // On sonde le droit de suppression AVANT d'effacer quoi que ce soit : si le
    // jeton n'est pas assez frais, on remonte l'erreur avec toutes les données
    // encore intactes.
    await firebaseUser.getIdToken(true);

    // ── 3. Suppression des données ──
    const deleteQuery = async (col: string, field: string) => {
      const snap = await getDocs(query(collection(db, col), where(field, '==', uid)));
      if (snap.empty) return;
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    };

    // Posts (et leurs commentaires, qui sont une sous-collection)
    const postsSnap = await getDocs(query(collection(db, 'posts'), where('userId', '==', uid)));
    for (const p of postsSnap.docs) {
      const commentsSnap = await getDocs(collection(db, 'posts', p.id, 'comments'));
      if (!commentsSnap.empty) {
        const cb = writeBatch(db);
        commentsSnap.docs.forEach(c => cb.delete(c.ref));
        await cb.commit();
      }
    }
    if (!postsSnap.empty) {
      const batch = writeBatch(db);
      postsSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }

    // Commentaires laissés sur les posts des AUTRES (les commentaires sous ses
    // propres posts sont déjà partis avec eux). Sans ça, son pseudo resterait
    // visible un peu partout dans les fils de discussion.
    try {
      const myComments = await getDocs(
        query(collectionGroup(db, 'comments'), where('userId', '==', uid))
      );
      for (let i = 0; i < myComments.docs.length; i += 400) {
        const batch = writeBatch(db);
        myComments.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
    } catch { /* index absent ou hors-ligne : on ne bloque pas la suppression */ }

    // Likes posés sur les posts des autres → on retire l'uid des tableaux likedBy.
    try {
      const liked = await getDocs(
        query(collection(db, 'posts'), where('likedBy', 'array-contains', uid))
      );
      for (let i = 0; i < liked.docs.length; i += 400) {
        const batch = writeBatch(db);
        liked.docs.slice(i, i + 400).forEach(d => batch.update(d.ref, { likedBy: arrayRemove(uid) }));
        await batch.commit();
      }
    } catch { /* rien à retirer / hors-ligne */ }

    // Relations et contenus liés
    await deleteQuery('follows', 'followerId').catch(() => {});
    await deleteQuery('follows', 'followingId').catch(() => {});
    await deleteQuery('blocks', 'blockerId').catch(() => {});
    await deleteQuery('blocks', 'blockedId').catch(() => {});
    await deleteQuery('gameInvites', 'fromId').catch(() => {});
    await deleteQuery('gameInvites', 'toId').catch(() => {});

    // Documents dont l'identifiant EST l'uid
    for (const col of ['bets', 'userVotes', 'quizResults', 'notifSubscriptions']) {
      await deleteDoc(doc(db, col, uid)).catch(() => {});
    }

    // Réservation du pseudo — sans ça le pseudo reste pris à vie et, pire, il
    // continue de résoudre vers l'email d'un compte supprimé.
    if (user.username) {
      await deleteDoc(doc(db, 'usernames', usernameKey(user.username))).catch(() => {});
    }

    // Profil
    await deleteDoc(doc(db, 'users', uid)).catch(() => {});

    // ── 4. Compte Firebase Auth (en dernier : après, plus aucun écrit possible) ──
    await deleteUser(firebaseUser);
  };

  const resendVerificationEmail = async (): Promise<AuthResult> => {
    const fbUser = auth.currentUser;
    if (!fbUser) return { success: false, error: 'Aucun compte connecté.' };
    try {
      await sendVerificationEmail(fbUser);
      return { success: true };
    } catch (e) {
      return { success: false, error: mapAuthError(e) };
    }
  };

  // `emailVerified` est figé dans le jeton local : cliquer le lien sur un autre
  // appareil ne le met pas à jour tout seul. Il faut recharger le compte.
  const refreshEmailVerified = async (): Promise<boolean> => {
    const fbUser = auth.currentUser;
    if (!fbUser) return false;
    try {
      await reload(fbUser);
      setEmailVerified(fbUser.emailVerified);
      return fbUser.emailVerified;
    } catch {
      return false;
    }
  };

  const updateCoins = (amount: number) => {
    if (!user) return;
    const newCoins = Math.max(0, user.coins + amount);
    setUser({ ...user, coins: newCoins });
    updateDoc(doc(db, 'users', user.id), { coins: newCoins }).catch(() => {});
  };

  const addPoints = (amount: number) => {
    if (!user || amount === 0) return;
    const newPoints = Math.max(0, user.points + amount);
    setUser({ ...user, points: newPoints });
    updateDoc(doc(db, 'users', user.id), { points: newPoints }).catch(() => {});
  };

  const updatePhoto = async (photoBase64: string) => {
    if (!user) return;
    setUser({ ...user, photoBase64 });
    await updateDoc(doc(db, 'users', user.id), { photoBase64 });

    // Mettre à jour tous les posts existants de l'utilisateur
    const postsSnap = await getDocs(
      query(collection(db, 'posts'), where('userId', '==', user.id))
    );
    if (!postsSnap.empty) {
      const batch = writeBatch(db);
      postsSnap.docs.forEach(d => batch.update(d.ref, { avatarPhoto: photoBase64 }));
      await batch.commit();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isAdmin: user?.email === ADMIN_EMAIL,
        // Évalué sur l'heure SERVEUR : avancer l'horloge du téléphone ne libère pas.
        // Un admin n'est jamais bloqué (sinon il ne pourrait plus lever le ban).
        banVerdict: user?.email === ADMIN_EMAIL
          ? { banned: false }
          : evaluateBan(banState, serverNow()),
        needsEmailVerification: needsVerification({
          emailVerified,
          creationTime: verifCreationTime,
          providerIds: verifProviders,
        }),
        resendVerificationEmail,
        refreshEmailVerified,
        isLoading,
        login,
        register,
        loginWithApple,
        pendingAppleLinkEmail,
        completeAppleLink,
        cancelAppleLink,
        isAppleLinked,
        linkAppleToCurrentAccount,
        resetPassword,
        logout,
        deleteAccount,
        changeUsername,
        updateCoins,
        addPoints,
        updatePhoto,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
