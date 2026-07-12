import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  updateProfile,
  deleteUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, onSnapshot, collection, query, where, getDocs, writeBatch, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { User } from '../types';

// Résout un identifiant de connexion (email ou pseudo) en email Firebase Auth.
// Le mapping pseudo → email vit dans /usernames (lecture publique, cf firestore.rules)
// car /users nécessite d'être authentifié — impossible avant la connexion.
async function resolveEmail(identifier: string): Promise<string> {
  const trimmed = identifier.trim();
  if (trimmed.includes('@')) return trimmed;
  const snap = await getDoc(doc(db, 'usernames', trimmed));
  const email = snap.data()?.email;
  if (!email) throw new Error('Aucun compte avec ce pseudo.');
  return email;
}

const ADMIN_EMAIL = 'legrosromain27@gmail.com';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  login: (identifier: string, password: string) => Promise<boolean>;
  register: (username: string, email: string, password: string) => Promise<boolean>;
  resetPassword: (identifier: string) => Promise<boolean>;
  logout: () => void;
  deleteAccount: () => Promise<void>;
  changeUsername: (newUsername: string) => Promise<void>;
  updateCoins: (amount: number) => void;
  addPoints: (amount: number) => void;
  updatePhoto: (photoURL: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Écoute temps réel du document utilisateur : pièces, points et grade reflètent
    // la base en direct (et se synchronisent entre appareils).
    let profileUnsub: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (profileUnsub) { profileUnsub(); profileUnsub = null; }

      if (!firebaseUser) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      const userRef = doc(db, 'users', firebaseUser.uid);
      const fallbackUsername = firebaseUser.displayName || firebaseUser.email!.split('@')[0];

      profileUnsub = onSnapshot(userRef, (snap) => {
        if (!snap.exists()) {
          setDoc(userRef, { coins: 200, points: 0, avatar: '🦁', username: fallbackUsername }).catch(() => {});
          return;
        }

        const data = snap.data();
        if (!data.username) updateDoc(userRef, { username: fallbackUsername }).catch(() => {});

        // Firestore est la source de vérité pour le pseudo
        const username = data.username || fallbackUsername;

        setUser({
          id: firebaseUser.uid,
          username,
          email: firebaseUser.email!,
          avatar: data.avatar ?? '🦁',
          photoBase64: data.photoBase64 ?? undefined,
          verified: data.verified ?? false,
          liveNotifEnabled: data.liveNotifEnabled ?? false,
          mentionNotifEnabled: data.mentionNotifEnabled ?? false,
          lastUsernameChange: data.lastUsernameChange ?? undefined,
          coins: data.coins ?? 200,
          points: data.points ?? 0,
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

  const login = async (identifier: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const email = await resolveEmail(identifier);
      await signInWithEmailAndPassword(auth, email, password);
      return true;
    } catch (e) {
      console.error('Login error:', e);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const resetPassword = async (identifier: string): Promise<boolean> => {
    try {
      const email = await resolveEmail(identifier);
      await sendPasswordResetEmail(auth, email);
      return true;
    } catch (e) {
      console.error('Reset password error:', e);
      return false;
    }
  };

  const register = async (
    username: string,
    email: string,
    password: string
  ): Promise<boolean> => {
    setIsLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: username });
      // Réserve le pseudo pour la connexion par pseudo (best-effort : si déjà pris,
      // le compte est quand même créé, juste utilisable seulement via email).
      setDoc(doc(db, 'usernames', username), { email, uid: cred.user.uid }).catch(() => {});
      // Met à jour l'objet user local avec le username
      setUser((prev) =>
        prev ? { ...prev, username, coins: 200 } : prev
      );
      return true;
    } catch (e) {
      console.error('Register error:', e);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const changeUsername = async (newUsername: string) => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser || !user) return;
    await updateProfile(firebaseUser, { displayName: newUsername });
    await updateDoc(doc(db, 'users', user.id), {
      username: newUsername,
      lastUsernameChange: new Date().toISOString(),
    });
    // Mettre à jour tous les posts existants
    const postsSnap = await getDocs(query(collection(db, 'posts'), where('userId', '==', user.id)));
    if (!postsSnap.empty) {
      const batch = writeBatch(db);
      postsSnap.docs.forEach(d => batch.update(d.ref, { username: newUsername }));
      await batch.commit();
    }
  };

  const deleteAccount = async () => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser || !user) return;
    try {
      // Supprimer tous les posts
      const postsSnap = await getDocs(query(collection(db, 'posts'), where('userId', '==', user.id)));
      if (!postsSnap.empty) {
        const batch = writeBatch(db);
        postsSnap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      // Supprimer le doc utilisateur
      await deleteDoc(doc(db, 'users', user.id));
      // Supprimer le compte Firebase Auth
      await deleteUser(firebaseUser);
    } catch (e) {
      throw e;
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
        isLoading,
        login,
        register,
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
