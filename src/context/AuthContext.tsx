import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { User } from '../types';

const ADMIN_EMAIL = 'legrosromain27@gmail.com';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (username: string, email: string, password: string) => Promise<boolean>;
  logout: () => void;
  updateCoins: (amount: number) => void;
  updatePhoto: (photoURL: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Charger les données depuis Firestore (pièces persistées)
        const userRef = doc(db, 'users', firebaseUser.uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
          const data = snap.data();
          const username = firebaseUser.displayName || firebaseUser.email!.split('@')[0];
          // Persiste le username dans Firestore pour la recherche admin
          if (!data.username) updateDoc(userRef, { username }).catch(() => {});
          setUser({
            id: firebaseUser.uid,
            username,
            email: firebaseUser.email!,
            avatar: data.avatar ?? '🦁',
            photoBase64: data.photoBase64 ?? undefined,
            verified: data.verified ?? false,
            coins: data.coins ?? 200,
            points: data.points ?? 0,
            pronostics: [],
            joinedAt: firebaseUser.metadata.creationTime || new Date().toISOString(),
          });
        } else {
          // Nouveau compte — créer le document avec 200 pièces de départ
          const newUser = {
            coins: 200,
            points: 0,
            avatar: '🦁',
          };
          await setDoc(userRef, newUser);
          setUser({
            id: firebaseUser.uid,
            username: firebaseUser.displayName || firebaseUser.email!.split('@')[0],
            email: firebaseUser.email!,
            avatar: '🦁',
            coins: 200,
            points: 0,
            pronostics: [],
            joinedAt: firebaseUser.metadata.creationTime || new Date().toISOString(),
          });
        }
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      return true;
    } catch (e) {
      console.error('Login error:', e);
      return false;
    } finally {
      setIsLoading(false);
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

  const updateCoins = (amount: number) => {
    if (!user) return;
    const newCoins = Math.max(0, user.coins + amount);
    setUser({ ...user, coins: newCoins });
    updateDoc(doc(db, 'users', user.id), { coins: newCoins }).catch(() => {});
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
        logout,
        updateCoins,
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
