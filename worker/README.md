# Sentinelle du score live

Petit service qui surveille le match du Barça sur ESPN et publie le score dans Firestore,
**même quand personne n'a l'app ouverte**. Sans lui, un but n'est détecté que si un
téléphone est éveillé : si tout le monde a fermé l'app, personne n'est notifié.

## Ce que ça coûte

| | |
|---|---|
| Cloudflare Workers | gratuit — 100 000 requêtes/jour, on en utilise ~1 500 |
| Workers KV | gratuit — sert d'état pour ne consommer **aucune** lecture Firestore |
| ESPN | gratuit, sans clé |
| Expo Push | gratuit |
| **Firestore** | **~10 écritures par match**, 0 lecture. Rien en dehors des matchs. |

Aucune carte bancaire, contrairement au plan Blaze de Firebase.

## Comment ça marche

Un cron tourne chaque minute et **sort immédiatement** s'il n'y a pas de match dans la
fenêtre — une simple lecture KV, aucun appel réseau. Le calendrier n'est rafraîchi que
toutes les 6 h.

Pendant un match, il interroge ESPN et **n'écrit dans Firestore que si le score, le statut
ou les buteurs ont réellement changé**. C'est essentiel : chaque écriture coûte une lecture
à *chaque* appareil abonné. La minute n'est délibérément pas réécrite chaque minute —
l'app l'extrapole depuis une ancre, et le worker ne la corrige que si elle dérive de plus
de 5 minutes.

Avant d'envoyer un push, il réserve la notification dans `liveMatch/lastGoalNotif`, avec le
même format de clé que l'app — worker et téléphones se dédupliquent mutuellement, donc
jamais de but notifié en double.

## Installation

Prérequis : un compte Cloudflare (gratuit) et `npm install` dans ce dossier.

**1. Créer l'espace KV**

```bash
npx wrangler kv namespace create STATE
```

Reporter l'`id` retourné dans `wrangler.toml`, à la place de `REMPLACER_PAR_ID_KV`.

**2. Créer le compte « bot »**

Les tokens push vivent dans `/users`, dont les règles exigent d'être authentifié. Dans la
console Firebase → Authentication → Ajouter un utilisateur, créer un compte dédié
(ex. `sentinel@barca-app.local`) avec un mot de passe long. Ce compte ne sert qu'au worker.

**3. Renseigner les secrets**

```bash
npx wrangler secret put FIREBASE_API_KEY   # clé web, déjà publique dans l'app
npx wrangler secret put BOT_EMAIL
npx wrangler secret put BOT_PASSWORD
```

**4. Déployer**

```bash
npx wrangler deploy
```

**5. Vérifier**

```bash
curl https://barca-live-sentinel.<ton-sous-domaine>.workers.dev/run
```

Hors match la réponse est `en veille, KO dans N min` — c'est le comportement attendu.
Les logs en direct : `npx wrangler tail`.

## Tester hors saison

Le Barça ne joue pas l'été. Pour viser une autre équipe sans toucher au code :

```bash
npx wrangler secret put TEST_TEAM_ID    # ex. 436 (Fenerbahce)
npx wrangler secret put TEST_LEAGUES    # ex. uefa.champions_qual
npx wrangler secret put TEST_MUTE_PUSH  # 1 → aucun push vers les vrais utilisateurs
```

**Garder `TEST_MUTE_PUSH=1` pendant tout test**, sinon un but du match de test partirait à
tous vos utilisateurs en « BUT DU BARÇA ». Supprimer ces trois secrets pour revenir en
production (`npx wrangler secret delete TEST_TEAM_ID`, etc.).

## Points à surveiller au premier vrai match

- **Attribution d'un CSC.** Le worker considère que `details[].team` désigne l'équipe du
  *joueur* et inverse donc le camp sur un but contre son camp. Non vérifié sur un cas réel :
  si un CSC est mal attribué, c'est ici (`extractGoals`).
- **Latence.** Le cron Cloudflare ne descend pas sous la minute. Si personne n'a l'app
  ouverte, un but peut donc mettre jusqu'à 60 s à être notifié. Dès qu'au moins une
  personne regarde le score dans l'app, la détection redevient quasi instantanée : c'est
  son téléphone qui publie en premier.
