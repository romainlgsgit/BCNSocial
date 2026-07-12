import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { collection, doc, setDoc, deleteDoc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';

interface BlockContextType {
  blockedByMe: string[];     // IDs que j'ai bloqués
  blockedMe: string[];       // IDs qui m'ont bloqué
  isBlockedByMe: (userId: string) => boolean;
  isBlockedByThem: (userId: string) => boolean;
  isAnyBlock: (userId: string) => boolean;
  blockUser: (userId: string) => Promise<void>;
  unblockUser: (userId: string) => Promise<void>;
}

const BlockContext = createContext<BlockContextType | null>(null);

export function BlockProvider({ children, currentUserId }: { children: React.ReactNode; currentUserId?: string }) {
  const [blockedByMe, setBlockedByMe] = useState<string[]>([]);
  const [blockedMe, setBlockedMe] = useState<string[]>([]);

  useEffect(() => {
    if (!currentUserId) {
      setBlockedByMe([]);
      setBlockedMe([]);
      return;
    }

    const unsubMe = onSnapshot(
      query(collection(db, 'blocks'), where('blockerId', '==', currentUserId)),
      snap => setBlockedByMe(snap.docs.map(d => d.data().blockedId as string))
    );

    const unsubThem = onSnapshot(
      query(collection(db, 'blocks'), where('blockedId', '==', currentUserId)),
      snap => setBlockedMe(snap.docs.map(d => d.data().blockerId as string))
    );

    return () => { unsubMe(); unsubThem(); };
  }, [currentUserId]);

  const isBlockedByMe = useCallback((userId: string) => blockedByMe.includes(userId), [blockedByMe]);
  const isBlockedByThem = useCallback((userId: string) => blockedMe.includes(userId), [blockedMe]);
  const isAnyBlock = useCallback((userId: string) => blockedByMe.includes(userId) || blockedMe.includes(userId), [blockedByMe, blockedMe]);

  const blockUser = useCallback(async (userId: string) => {
    if (!currentUserId) return;
    const id = `${currentUserId}_${userId}`;
    await setDoc(doc(db, 'blocks', id), {
      blockerId: currentUserId,
      blockedId: userId,
      createdAt: new Date().toISOString(),
    });
  }, [currentUserId]);

  const unblockUser = useCallback(async (userId: string) => {
    if (!currentUserId) return;
    await deleteDoc(doc(db, 'blocks', `${currentUserId}_${userId}`));
  }, [currentUserId]);

  return (
    <BlockContext.Provider value={{ blockedByMe, blockedMe, isBlockedByMe, isBlockedByThem, isAnyBlock, blockUser, unblockUser }}>
      {children}
    </BlockContext.Provider>
  );
}

export function useBlock() {
  const ctx = useContext(BlockContext);
  if (!ctx) throw new Error('useBlock must be used inside BlockProvider');
  return ctx;
}
