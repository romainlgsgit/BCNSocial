import React, { createContext, useContext, useCallback } from 'react';
import {
  doc, setDoc, updateDoc, deleteDoc, getDocs, collection,
  writeBatch, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from './AuthContext';
import { serverNow } from '../utils/serverTime';
import { emailBanKey, usernameBanKey, banExpiryFrom } from '../utils/ban';

interface ModerationContextType {
  /** Bannit temporairement (`hours`) ou définitivement (`hours = null`). */
  banUser: (target: {
    uid: string; username: string; email?: string;
  }, hours: number | null, reason?: string) => Promise<void>;
  liftBan: (target: { uid: string; username: string; email?: string }) => Promise<void>;
  /** Supprime un post et tous ses commentaires (modération). */
  deletePostAsAdmin: (postId: string) => Promise<void>;
  deleteCommentAsAdmin: (postId: string, commentId: string) => Promise<void>;
}

const ModerationContext = createContext<ModerationContextType | null>(null);

export function ModerationProvider({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();

  const banUser = useCallback(async (
    target: { uid: string; username: string; email?: string },
    hours: number | null,
    reason?: string,
  ) => {
    if (!isAdmin) throw new Error('not-admin');
    const permanent = hours === null;

    await updateDoc(doc(db, 'users', target.uid), {
      banPermanent: permanent,
      // L'échéance est calculée sur l'heure SERVEUR : un admin dont le téléphone
      // retarde ne doit pas raccourcir le bannissement qu'il inflige.
      bannedUntil: permanent ? null : Timestamp.fromMillis(banExpiryFrom(serverNow(), hours!)),
      banReason: reason ?? null,
      bannedAt: serverTimestamp(),
    });

    // Un ban DÉFINITIF doit aussi interdire la recréation d'un compte avec le même
    // email ou le même pseudo. Ces documents sont lisibles sans être connecté (comme
    // /usernames), car la vérification a lieu AVANT l'authentification.
    if (permanent) {
      const payload = { uid: target.uid, username: target.username, bannedAt: serverTimestamp() };
      await setDoc(doc(db, 'bannedIdentities', usernameBanKey(target.username)), payload);
      if (target.email) {
        await setDoc(doc(db, 'bannedIdentities', emailBanKey(target.email)), payload);
      }
    }
  }, [isAdmin]);

  const liftBan = useCallback(async (target: { uid: string; username: string; email?: string }) => {
    if (!isAdmin) throw new Error('not-admin');
    await updateDoc(doc(db, 'users', target.uid), {
      banPermanent: false,
      bannedUntil: null,
      banReason: null,
    });
    await deleteDoc(doc(db, 'bannedIdentities', usernameBanKey(target.username))).catch(() => {});
    if (target.email) {
      await deleteDoc(doc(db, 'bannedIdentities', emailBanKey(target.email))).catch(() => {});
    }
  }, [isAdmin]);

  const deletePostAsAdmin = useCallback(async (postId: string) => {
    if (!isAdmin) throw new Error('not-admin');
    // Les commentaires sont une sous-collection : supprimer le post seul les
    // laisserait orphelins et inaccessibles.
    const commentsSnap = await getDocs(collection(db, 'posts', postId, 'comments'));
    if (!commentsSnap.empty) {
      const batch = writeBatch(db);
      commentsSnap.docs.forEach(c => batch.delete(c.ref));
      await batch.commit();
    }
    await deleteDoc(doc(db, 'posts', postId));
  }, [isAdmin]);

  const deleteCommentAsAdmin = useCallback(async (postId: string, commentId: string) => {
    if (!isAdmin) throw new Error('not-admin');
    await deleteDoc(doc(db, 'posts', postId, 'comments', commentId));
  }, [isAdmin]);

  return (
    <ModerationContext.Provider value={{ banUser, liftBan, deletePostAsAdmin, deleteCommentAsAdmin }}>
      {children}
    </ModerationContext.Provider>
  );
}

export function useModeration() {
  const ctx = useContext(ModerationContext);
  if (!ctx) throw new Error('useModeration must be used inside ModerationProvider');
  return ctx;
}
