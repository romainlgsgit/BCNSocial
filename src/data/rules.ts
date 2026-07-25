// ─── Règlement de l'application (codé en dur, éditable en OTA) ─────────────────
//
// Le règlement vit dans le code (pas dans Firestore) → 0 lecture, et modifiable sans
// rebuild : édite ce fichier puis `npm run ota:prod`.
//
// L'utilisateur accepte ce règlement à la création de son compte (case à cocher) ou lors
// de la connexion avec Apple (le fait de continuer vaut acceptation). Voir AuthScreen.

import { SUPPORT_EMAIL } from './faq';

export { SUPPORT_EMAIL };

export interface RuleSection {
  /** Emoji d'en-tête (facultatif). */
  icon?: string;
  title: string;
  /** Corps : les paragraphes sont séparés par une ligne vide, les puces commencent par « • ». */
  body: string;
}

export const RULES_UPDATED = '25 juillet 2026';

export const RULES: RuleSection[] = [
  {
    icon: '👋',
    title: 'Bienvenue sur BCN Social',
    body:
      "BCN Social est une application communautaire NON officielle, dédiée aux supporters du FC Barcelone. Elle n'est ni affiliée, ni sponsorisée, ni approuvée par le FC Barcelona.\n\n" +
      "En créant un compte, en te connectant avec Apple ou en utilisant l'application, tu confirmes avoir lu, compris et accepté l'intégralité du présent règlement ainsi que la politique de confidentialité ci-dessous. Si tu n'es pas d'accord, n'utilise pas l'application.",
  },
  {
    icon: '🤝',
    title: 'Règles de bonne conduite',
    body:
      "La communauté doit rester un espace respectueux et convivial. Sont notamment interdits :\n\n" +
      "• Les insultes, le harcèlement et les menaces envers d'autres membres.\n" +
      "• Le spam, la publicité non sollicitée et les arnaques.\n" +
      "• L'usurpation d'identité (se faire passer pour une autre personne, un joueur, un club, un membre de l'équipe).\n" +
      "• La divulgation d'informations privées d'autrui.\n" +
      "• Le contenu illégal, violent, choquant, sexuel ou pornographique.\n" +
      "• La triche et l'exploitation de failles dans les jeux.",
  },
  {
    icon: '🚫',
    title: 'Tolérance zéro : discrimination',
    body:
      "Tout propos ou contenu à caractère raciste, homophobe, sexiste, ou constituant toute autre forme de discrimination — qu'il vise un autre utilisateur OU un joueur de football — entraîne le bannissement DÉFINITIF du compte.\n\n" +
      "Il n'y a aucune tolérance sur ce point.",
  },
  {
    icon: '⛔',
    title: 'Bannissements',
    body:
      "Tous les bannissements sont décidés et appliqués MANUELLEMENT par un administrateur, avec une durée déterminée au cas par cas en fonction de la gravité de la cause.\n\n" +
      "• Bannissement temporaire : tu peux faire une demande de levée de sanction par e-mail. Chaque demande est étudiée, sans garantie de suite favorable.\n" +
      "• Bannissement définitif : la décision de l'équipe BCN Social est irrévocable. L'équipe ne reviendra pas sur sa décision.",
  },
  {
    icon: '💳',
    title: 'Premium & monnaie virtuelle en cas de sanction',
    body:
      "Si un compte est banni, temporairement ou définitivement, alors qu'il dispose d'un abonnement Premium actif et/ou de monnaie virtuelle (pièces, dollars du jeu), l'application est en droit de NE PAS procéder à un remboursement, ce bannissement faisant suite à un non-respect du règlement.\n\n" +
      "La monnaie virtuelle (pièces, dollars du jeu) n'a aucune valeur monétaire réelle, n'est ni échangeable contre de l'argent, ni transférable, ni remboursable.",
  },
  {
    icon: '🔒',
    title: 'Données personnelles & confidentialité',
    body:
      "Pour fonctionner, l'application collecte et traite certaines données :\n\n" +
      "• Ton adresse e-mail et ton pseudo (identification du compte).\n" +
      "• Ta photo de profil, tes publications, tes commentaires et tes votes (contenus que tu choisis de partager).\n" +
      "• Un identifiant de notification (jeton push) pour t'envoyer des alertes, si tu les actives.\n" +
      "• Des données techniques et d'usage nécessaires au bon fonctionnement du service.\n\n" +
      "Ces données servent uniquement à faire fonctionner l'application et l'expérience communautaire. Elles ne sont pas vendues. En supprimant ton compte (Réglages › Compte › Supprimer mon compte), tes données associées sont effacées.",
  },
  {
    icon: '©️',
    title: 'Propriété intellectuelle',
    body:
      "Les noms, logos, marques et images liés au FC Barcelona et à ses joueurs appartiennent à leurs propriétaires respectifs. Ils sont utilisés ici uniquement dans le cadre d'une application de supporters non officielle, sans intention de leur porter atteinte.\n\n" +
      "Tu restes seul responsable des contenus que tu publies et tu garantis disposer de tous les droits nécessaires pour les partager. Tout contenu portant atteinte aux droits d'un tiers pourra être retiré sans préavis.",
  },
  {
    icon: '🛒',
    title: 'Achats',
    body:
      "Les abonnements Premium et achats éventuels sont gérés par l'App Store d'Apple. La facturation, les conditions de renouvellement et les demandes de remboursement relèvent des règles d'Apple, sous réserve des cas de non-remboursement prévus par le présent règlement (voir « Premium & monnaie virtuelle en cas de sanction »).",
  },
  {
    icon: '📝',
    title: 'Évolution du règlement',
    body:
      "Ce règlement peut être mis à jour à tout moment afin de suivre l'évolution de l'application. La poursuite de l'utilisation après une mise à jour vaut acceptation de la nouvelle version.",
  },
  {
    icon: '✉️',
    title: 'Contact',
    body:
      "Pour toute question, signalement ou demande de levée de sanction (bannissement temporaire), écris-nous à :\n\n" +
      `${SUPPORT_EMAIL}`,
  },
];
