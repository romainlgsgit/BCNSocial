// ─── FAQ (codée en dur, éditable en OTA) ──────────────────────────────────────
//
// La FAQ vit dans le code (pas dans Firestore) → 0 lecture, et modifiable sans rebuild :
// édite ce fichier puis `npm run ota:prod`. Ajoute/retire des entrées librement ; la
// recherche de l'écran Aide est insensible à la casse et aux accents et cherche dans la
// question, la réponse ET les mots-clés.

export interface FaqItem {
  id: string;
  category: string;
  question: string;
  answer: string;
  /** Mots-clés supplémentaires pour la recherche (synonymes, fautes courantes…). */
  keywords?: string[];
}

export const SUPPORT_EMAIL = 'legrosromainpro@gmail.com';

export const FAQ: FaqItem[] = [
  // ── Compte ──
  {
    id: 'account-username',
    category: 'Compte',
    question: 'Comment changer mon pseudo ?',
    answer:
      "Va dans Réglages › Pseudo, saisis ton nouveau pseudo puis touche Sauvegarder. Un pseudo est modifiable une fois tous les 7 jours, et il doit être unique (au moins 3 caractères).",
    keywords: ['pseudo', 'nom', 'username', 'changer', 'modifier'],
  },
  {
    id: 'account-verify-email',
    category: 'Compte',
    question: "Je n'ai pas reçu l'e-mail de confirmation",
    answer:
      "Vérifie tes spams/courriers indésirables. Depuis l'écran de vérification, tu peux renvoyer un nouveau lien. L'e-mail peut mettre quelques minutes à arriver. Si rien n'arrive, contacte le support.",
    keywords: ['email', 'e-mail', 'confirmation', 'vérification', 'mail', 'validation', 'lien'],
  },
  {
    id: 'account-apple',
    category: 'Compte',
    question: 'Puis-je me connecter avec Apple ?',
    answer:
      "Oui. Depuis Réglages › Compte, touche « Lier mon compte Apple » pour associer ton identifiant Apple. Tu pourras ensuite te connecter directement avec Apple, sans mot de passe.",
    keywords: ['apple', 'connexion', 'login', 'se connecter'],
  },
  {
    id: 'account-delete',
    category: 'Compte',
    question: 'Comment supprimer mon compte ?',
    answer:
      "Réglages › Compte › Supprimer mon compte. La suppression est définitive et irréversible : ton compte, tes posts, tes commentaires, tes abonnements et ton pseudo sont effacés. Une confirmation par mot de passe (ou via Apple) est demandée.",
    keywords: ['supprimer', 'compte', 'effacer', 'désinscription', 'delete'],
  },
  {
    id: 'account-password',
    category: 'Compte',
    question: "J'ai oublié mon mot de passe",
    answer:
      "Sur l'écran de connexion, utilise l'option de réinitialisation par e-mail pour recevoir un lien et définir un nouveau mot de passe.",
    keywords: ['mot de passe', 'password', 'oublié', 'réinitialiser', 'reset'],
  },

  // ── Publications ──
  {
    id: 'post-create',
    category: 'Publications',
    question: 'Comment publier un post ?',
    answer:
      "Depuis l'accueil, touche la barre « Quoi de neuf sur le Barça ? », écris ton message, choisis une catégorie si tu veux, puis touche Publier.",
    keywords: ['publier', 'post', 'publication', 'écrire', 'message'],
  },
  {
    id: 'post-limit',
    category: 'Publications',
    question: 'Pourquoi je ne peux plus publier aujourd’hui ?',
    answer:
      "Les comptes gratuits ont un nombre de publications limité par jour. Passe Premium pour publier sans limite, ou utilise des dollars du jeu pour débloquer un post supplémentaire. Le compteur se remet à zéro chaque jour.",
    keywords: ['limite', 'quota', 'publier', 'plus', 'bloqué', 'jour', 'premium'],
  },
  {
    id: 'post-mention',
    category: 'Publications',
    question: 'Comment mentionner quelqu’un (@) ?',
    answer:
      "Dans ton post ou ton commentaire, tape « @ » suivi du début du pseudo, puis choisis la personne dans la liste. Son pseudo apparaît en bleu, devient cliquable, et la personne reçoit une notification.",
    keywords: ['mention', 'identifier', 'taguer', 'tag', 'arobase', '@', 'notifier'],
  },
  {
    id: 'post-link',
    category: 'Publications',
    question: 'Comment ajouter un lien cliquable (TikTok, YouTube…) ?',
    answer:
      "Colle simplement ton lien (https://… ou www…) dans le texte de ta publication : il devient automatiquement cliquable et ouvre la page. Idéal pour partager tes vidéos TikTok, YouTube, etc.",
    keywords: ['lien', 'url', 'tiktok', 'youtube', 'cliquable', 'vidéo', 'instagram', 'partager'],
  },
  {
    id: 'post-image',
    category: 'Publications',
    question: 'Comment ajouter une photo à un post ?',
    answer:
      "L'ajout de photo aux publications est réservé aux membres Premium. Dans l'écran de publication, touche l'icône image pour choisir une photo de ta galerie.",
    keywords: ['photo', 'image', 'galerie', 'premium', 'ajouter'],
  },
  {
    id: 'post-delete',
    category: 'Publications',
    question: 'Comment supprimer mon post ou mon commentaire ?',
    answer:
      "Sur ton propre post ou commentaire, touche l'icône corbeille pour le supprimer définitivement.",
    keywords: ['supprimer', 'effacer', 'post', 'commentaire', 'corbeille'],
  },

  // ── Modération & sécurité ──
  {
    id: 'mod-block',
    category: 'Modération & sécurité',
    question: 'Comment bloquer ou signaler un utilisateur ?',
    answer:
      "Ouvre le profil de la personne pour la bloquer : tu ne verras plus son contenu et elle ne pourra plus interagir avec toi. Tu retrouves tes utilisateurs bloqués dans Réglages › Utilisateurs bloqués. Pour signaler un contenu abusif, contacte le support.",
    keywords: ['bloquer', 'signaler', 'report', 'harcèlement', 'abus', 'débloquer'],
  },
  {
    id: 'mod-ban',
    category: 'Modération & sécurité',
    question: 'Mon compte est suspendu / banni, que faire ?',
    answer:
      "Un bannissement est décidé en cas de non-respect des règles de la communauté. S'il est temporaire, tu pourras de nouveau publier à la fin de la suspension. Si tu penses qu'il s'agit d'une erreur, écris au support.",
    keywords: ['banni', 'ban', 'suspendu', 'suspension', 'bloqué', 'sanction'],
  },

  // ── Notes des joueurs ──
  {
    id: 'ratings-vote',
    category: 'Notes des joueurs',
    question: 'Comment noter les joueurs après un match ?',
    answer:
      "Le vote s'ouvre à la fin de chaque match (une fois la compo validée) et reste ouvert 72h. Rends-toi dans l'onglet Notes pour attribuer une note à chaque joueur.",
    keywords: ['noter', 'notes', 'joueurs', 'vote', 'match', 'évaluer'],
  },
  {
    id: 'ratings-season',
    category: 'Notes des joueurs',
    question: 'Comment voir le profil et la note d’un joueur ?',
    answer:
      "Dans l'onglet Notes, touche un joueur pour ouvrir son profil : tu y trouves sa note de la saison (moyenne de la communauté), son palmarès et ses statistiques de carrière.",
    keywords: ['profil', 'joueur', 'note', 'saison', 'stats', 'palmarès', 'fiche'],
  },

  // ── Jeux, pièces & dollars ──
  {
    id: 'games-quiz',
    category: 'Jeux & pièces',
    question: 'Comment fonctionne le quiz quotidien et la série ?',
    answer:
      "Un nouveau quiz sort chaque jour à 9h (heure française). Réponds tous les jours pour faire grandir ta série (flamme) et débloquer des badges d'écusson affichés sur ta photo de profil.",
    keywords: ['quiz', 'série', 'streak', 'flamme', 'badge', 'quotidien', 'jour'],
  },
  {
    id: 'games-1v1',
    category: 'Jeux & pièces',
    question: 'Comment défier quelqu’un en 1v1 ?',
    answer:
      "Dans l'onglet Jeux, choisis Football 1v1 ou Tirs au But 1v1. Tu peux défier un ami ou un adversaire au hasard. Le vainqueur remporte des pièces.",
    keywords: ['1v1', 'défi', 'duel', 'football', 'tirs au but', 'penalty', 'jouer', 'multijoueur'],
  },
  {
    id: 'games-coins-dollars',
    category: 'Jeux & pièces',
    question: 'À quoi servent les pièces et les dollars du jeu ?',
    answer:
      "Les pièces se gagnent en jouant (pronostics, quiz, 1v1) et servent notamment à parier. Les dollars du jeu s'obtiennent en échangeant des pièces dans la Boutique et débloquent des options comme un post supplémentaire.",
    keywords: ['pièces', 'coins', 'dollars', 'monnaie', 'boutique', 'gagner', 'échanger', 'store'],
  },
  {
    id: 'games-coins-buy',
    category: 'Jeux & pièces',
    question: 'Comment obtenir plus de pièces ?',
    answer:
      "Joue aux mini-jeux, réponds au quiz du jour et gagne tes duels 1v1. Tu peux aussi en obtenir via la Boutique. En cas de problème d'achat, contacte le support.",
    keywords: ['pièces', 'coins', 'acheter', 'plus', 'boutique', 'gagner', 'achat'],
  },

  // ── Premium & Boutique ──
  {
    id: 'premium-what',
    category: 'Premium & Boutique',
    question: 'Que débloque l’abonnement Premium ?',
    answer:
      "Premium retire les publicités, permet d'ajouter des photos à tes posts, de publier sans limite quotidienne, et met en avant ton badge certifié si tu y as droit. Retrouve le détail sur l'écran Premium.",
    keywords: ['premium', 'abonnement', 'avantages', 'pub', 'publicité', 'sans limite'],
  },
  {
    id: 'premium-purchase',
    category: 'Premium & Boutique',
    question: 'Mon achat n’a pas été pris en compte',
    answer:
      "Les achats sont gérés par l'App Store. Vérifie ta connexion, puis utilise « Restaurer mes achats » sur l'écran concerné. Si le problème persiste, écris au support avec la date de l'achat.",
    keywords: ['achat', 'paiement', 'restaurer', 'app store', 'facturation', 'remboursement', 'iap'],
  },

  // ── Notifications ──
  {
    id: 'notif-enable',
    category: 'Notifications',
    question: 'Comment activer ou désactiver les notifications ?',
    answer:
      "Dans Réglages › Notifications, active « Buts & matchs en direct » et « Notifications d'identification » selon tes envies. Assure-toi aussi d'avoir autorisé les notifications de l'app dans les réglages de ton iPhone.",
    keywords: ['notifications', 'notif', 'activer', 'désactiver', 'push', 'alerte', 'mention', 'but'],
  },
];

export const FAQ_CATEGORIES = Array.from(new Set(FAQ.map((f) => f.category)));
