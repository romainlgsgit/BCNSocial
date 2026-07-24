import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { emailBanKey, usernameBanKey } from './ban';

/**
 * Un email ou un pseudo est-il banni définitivement ?
 *
 * Vit dans `utils/` et non dans ModerationContext pour éviter un cycle d'imports :
 * AuthContext s'en sert à la connexion/inscription, or ModerationContext dépend
 * lui-même de AuthContext.
 *
 * La collection `bannedIdentities` est lisible sans être authentifié (comme
 * `usernames`) : la vérification a nécessairement lieu AVANT la connexion.
 */
export async function isIdentityBanned(identifier: string): Promise<boolean> {
  const trimmed = identifier.trim();
  if (!trimmed) return false;

  const keys = trimmed.includes('@')
    ? [emailBanKey(trimmed), usernameBanKey(trimmed)]
    : [usernameBanKey(trimmed)];

  for (const k of keys) {
    try {
      const snap = await getDoc(doc(db, 'bannedIdentities', k));
      if (snap.exists()) return true;
    } catch {
      // Hors-ligne ou lecture refusée : on ne bloque pas sur un doute réseau.
      // Les règles Firestore empêchent de toute façon un banni de publier.
    }
  }
  return false;
}
