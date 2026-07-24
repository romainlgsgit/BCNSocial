import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  doc, setDoc, deleteDoc, collection, query, where,
  onSnapshot, serverTimestamp, increment, updateDoc,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from './AuthContext';

interface FollowContextType {
  followingIds: string[];
  myFollowersCount: number;
  myFollowingCount: number;
  isFollowing: (userId: string) => boolean;
  followUser: (userId: string) => Promise<void>;
  unfollowUser: (userId: string) => Promise<void>;
}

const FollowContext = createContext<FollowContextType | null>(null);

export function FollowProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [followingIds, setFollowingIds] = useState<string[]>([]);

  // Qui je suis (temps réel)
  useEffect(() => {
    if (!user) { setFollowingIds([]); return; }
    const q = query(collection(db, 'follows'), where('followerId', '==', user.id));
    return onSnapshot(q, (snap) => {
      setFollowingIds(snap.docs.map((d) => d.data().followingId as string));
    });
  }, [user?.id]);

  // Compteurs repris du doc utilisateur déjà écouté par AuthContext — un second
  // onSnapshot sur `users/{uid}` doublait la facture pour exactement la même donnée.
  const myFollowersCount = user?.followersCount ?? 0;
  const myFollowingCount = user?.followingCount ?? 0;

  const isFollowing = (userId: string) => followingIds.includes(userId);

  const followUser = async (targetId: string) => {
    if (!user || targetId === user.id) return;
    await setDoc(doc(db, 'follows', `${user.id}_${targetId}`), {
      followerId: user.id,
      followingId: targetId,
      createdAt: serverTimestamp(),
    });
    await Promise.all([
      updateDoc(doc(db, 'users', targetId), { followersCount: increment(1) }),
      updateDoc(doc(db, 'users', user.id), { followingCount: increment(1) }),
    ]);
  };

  const unfollowUser = async (targetId: string) => {
    if (!user) return;
    await deleteDoc(doc(db, 'follows', `${user.id}_${targetId}`));
    await Promise.all([
      updateDoc(doc(db, 'users', targetId), { followersCount: increment(-1) }),
      updateDoc(doc(db, 'users', user.id), { followingCount: increment(-1) }),
    ]);
  };

  return (
    <FollowContext.Provider
      value={{ followingIds, myFollowersCount, myFollowingCount, isFollowing, followUser, unfollowUser }}
    >
      {children}
    </FollowContext.Provider>
  );
}

export function useFollow() {
  const ctx = useContext(FollowContext);
  if (!ctx) throw new Error('useFollow must be used within FollowProvider');
  return ctx;
}
