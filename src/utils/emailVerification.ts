/**
 * Vérification de l'adresse email à l'inscription — règles pures.
 *
 * La vérification passe par Firebase Auth (lien cliquable envoyé depuis
 * l'infrastructure Google), et non par un code maison : sans domaine authentifié
 * (SPF/DKIM/DMARC), un mail envoyé par nos soins finirait en spam chez Gmail.
 */

/**
 * Comptes créés AVANT cette date : dispensés de vérification.
 *
 * Aucune vérification n'avait jamais été envoyée jusqu'ici, donc tous les comptes
 * existants ont `emailVerified = false`. Sans cette date de bascule, activer le
 * blocage mettrait TOUTE la base d'utilisateurs à la porte du jour au lendemain.
 */
export const VERIFICATION_REQUIRED_FROM = Date.parse('2026-07-23T00:00:00Z');

/** Délai minimal entre deux envois, pour éviter `auth/too-many-requests`. */
export const RESEND_COOLDOWN_MS = 60_000;

export interface VerificationInput {
  /** L'adresse est-elle confirmée côté Firebase ? */
  emailVerified: boolean;
  /** Date de création du compte (ISO ou epoch ms). */
  creationTime?: string | number | null;
  /** Identifiants des fournisseurs liés (`password`, `apple.com`…). */
  providerIds?: string[];
}

/**
 * Faut-il bloquer l'app en attendant la vérification ?
 *
 * Non si :
 *  - l'adresse est déjà vérifiée ;
 *  - le compte est antérieur à la bascule (comptes historiques) ;
 *  - la connexion passe par Apple — Apple a déjà validé l'adresse, et exiger une
 *    vérification Firebase enfermerait ces comptes dans un écran insortable
 *    (ils n'ont pas de mot de passe et l'adresse relais peut être masquée).
 */
export function needsVerification(input: VerificationInput): boolean {
  if (input.emailVerified) return false;

  const providers = input.providerIds ?? [];
  if (providers.includes('apple.com')) return false;
  // Un compte sans fournisseur mot de passe ne peut pas recevoir de lien utile.
  if (providers.length > 0 && !providers.includes('password')) return false;

  const created = toMillis(input.creationTime);
  if (created !== null && created < VERIFICATION_REQUIRED_FROM) return false;

  return true;
}

function toMillis(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const parsed = Date.parse(v);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Millisecondes restantes avant de pouvoir renvoyer le lien. */
export function resendCooldownLeft(lastSentAt: number | null, now: number): number {
  if (!lastSentAt) return 0;
  return Math.max(0, RESEND_COOLDOWN_MS - (now - lastSentAt));
}

/** Masque une adresse pour l'affichage : `ro****n@gmail.com`. */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return `${local[0]}*${domain}`;
  return `${local[0]}${'*'.repeat(Math.min(4, local.length - 2))}${local[local.length - 1]}${domain}`;
}
