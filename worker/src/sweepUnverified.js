/**
 * Purge automatique des comptes dont l'adresse n'a jamais été vérifiée.
 *
 * But : éviter que la base se remplisse de comptes fantômes (inscription entamée,
 * mail jamais confirmé). Au-delà de 48 h sans vérification, le compte est supprimé
 * définitivement — l'utilisateur devra recommencer l'inscription.
 *
 * Tourne dans le cron du Worker (toutes les minutes), mais ne s'exécute réellement
 * qu'une fois par heure (verrou KV) : inutile de scanner les comptes en continu.
 *
 * GARDE-FOUS (ne JAMAIS supprimer par erreur) :
 *  - uniquement les comptes email/mot de passe (`password`) ;
 *  - jamais un compte Apple (vérifié par Apple, `emailVerified` peut être faux) ;
 *  - jamais un compte déjà vérifié ;
 *  - jamais un compte créé AVANT la bascule (2026-07-23) : tous les comptes
 *    historiques sont « non vérifiés » et doivent être épargnés ;
 *  - uniquement au-delà de 48 h d'ancienneté.
 */

import { serviceAccountToken } from './verifyEmail.js';

// Doit rester aligné sur VERIFICATION_REQUIRED_FROM côté app (emailVerification.ts).
const CUTOFF_MS = Date.parse('2026-07-23T00:00:00Z');
const GRACE_MS = 48 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // au plus une fois par heure

async function firestoreDelete(env, token, path) {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${env.PROJECT_ID}/databases/(default)/documents/${path}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
  );
  // 404 = déjà absent : pas une erreur.
  return res.ok || res.status === 404;
}

async function deleteAuthUser(env, token, uid) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${env.PROJECT_ID}/accounts:delete`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ localId: uid }),
    },
  );
  return res.ok;
}

function shouldDelete(u, now) {
  if (u.emailVerified) return false;
  const providers = (u.providerUserInfo ?? []).map((p) => p.providerId);
  // Apple : jamais. Tout fournisseur autre que password : on ne touche pas.
  if (providers.includes('apple.com')) return false;
  if (providers.length > 0 && !providers.includes('password')) return false;

  const created = Number(u.createdAt); // ms epoch, en string
  if (!Number.isFinite(created)) return false;
  if (created < CUTOFF_MS) return false;        // compte historique : épargné
  if (now - created < GRACE_MS) return false;   // encore dans les 48 h
  return true;
}

/**
 * Un passage de purge. Renvoie un court résumé pour les logs.
 * Idempotent et sûr à relancer.
 */
export async function sweepUnverified(env) {
  if (!env.SA_CLIENT_EMAIL || !env.SA_PRIVATE_KEY) return 'sweep: SA absent';

  // Verrou horaire (KV).
  if (env.STATE) {
    const last = Number(await env.STATE.get('lastSweepAt'));
    if (Number.isFinite(last) && Date.now() - last < SWEEP_INTERVAL_MS) {
      return 'sweep: pas encore l\'heure';
    }
    // Pose le verrou tout de suite pour éviter deux passes concurrentes.
    await env.STATE.put('lastSweepAt', String(Date.now()));
  }

  const token = await serviceAccountToken(env);
  const now = Date.now();
  let scanned = 0;
  let deleted = 0;
  let pageToken = undefined;

  do {
    const url = new URL(
      `https://identitytoolkit.googleapis.com/v1/projects/${env.PROJECT_ID}/accounts:batchGet`,
    );
    url.searchParams.set('maxResults', '500');
    if (pageToken) url.searchParams.set('nextPageToken', pageToken);

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`batchGet ${res.status}`);
    const data = await res.json();
    const users = data.users ?? [];
    scanned += users.length;

    for (const u of users) {
      if (!shouldDelete(u, now)) continue;
      // Le pseudo = displayName (fixé à l'inscription). On nettoie Firestore AVANT
      // de supprimer le compte Auth : après, les règles interdiraient tout écrit.
      if (u.displayName) {
        // Réservation keyée en minuscules (unicité insensible à la casse, cf. app).
        const key = u.displayName.trim().toLowerCase();
        await firestoreDelete(env, token, `usernames/${encodeURIComponent(key)}`).catch(() => {});
      }
      await firestoreDelete(env, token, `users/${u.localId}`).catch(() => {});
      if (await deleteAuthUser(env, token, u.localId)) deleted++;
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return `sweep: ${scanned} scannés, ${deleted} supprimés`;
}
