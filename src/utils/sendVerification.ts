import type { User as FirebaseUser } from 'firebase/auth';
import { sendEmailVerification } from 'firebase/auth';

/**
 * Envoi du mail de confirmation d'adresse.
 *
 * Chemin normal : notre Worker Cloudflare génère le lien et envoie un mail HTML en
 * FRANÇAIS via Resend (les modèles Firebase sont verrouillés en anglais, cf.
 * docs/emails-deliverabilite.md).
 *
 * Repli : si le Worker est injoignable ou renvoie une erreur, on retombe sur
 * `sendEmailVerification` de Firebase (mail en anglais, mais fonctionnel). L'inscription
 * ne doit JAMAIS être bloquée par une panne d'envoi de mail.
 */

// URL publique du Worker (workers.dev). Le sous-domaine du compte est fixe.
const WORKER_URL = 'https://barca-live-sentinel.barca-app-rl.workers.dev';
const VERIFY_ENDPOINT = `${WORKER_URL}/verify-email`;

export async function sendVerificationEmail(fbUser: FirebaseUser): Promise<void> {
  try {
    const idToken = await fbUser.getIdToken();
    const res = await fetchWithTimeout(VERIFY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }, 8000);
    if (res.ok) return; // mail français envoyé
    throw new Error(`worker ${res.status}`);
  } catch {
    // Repli Firebase (anglais) — mieux qu'aucun mail.
    await sendEmailVerification(fbUser);
  }
}

function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(id));
}
