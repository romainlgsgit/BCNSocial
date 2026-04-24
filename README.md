# BCNSocial

Application mobile communautaire dédiée aux fans du FC Barcelona, développée avec React Native et Expo.

## Fonctionnalités

- **Feed social** — publie et commente les actualités du Barça
- **Matchs** — suis les matchs en temps réel avec scores et résultats
- **Pronostics** — fais tes prédictions avant chaque match
- **Notation des joueurs** — évalue les performances des joueurs après chaque rencontre
- **Joueurs** — consulte les profils et statistiques de l'effectif
- **Profil utilisateur** — gère ton compte, tes abonnements et ton activité
- **Système de follow** — abonne-toi aux autres fans et suis leur activité
- **Notifications push** — reçois des alertes pour les matchs et les interactions
- **Publicités intégrées** — bannières et publicités récompensées via Google Mobile Ads

## Stack technique

| Couche | Technologie |
|---|---|
| Framework mobile | React Native 0.83 + Expo 55 |
| Navigation | React Navigation (Stack + Bottom Tabs) |
| Backend & Auth | Firebase (Firestore, Auth, Functions) |
| Notifications | Expo Notifications |
| Publicités | React Native Google Mobile Ads |
| Langage | TypeScript |

## Installation

```bash
# Cloner le dépôt
git clone https://github.com/romainlgsgit/BCNSocial.git
cd BCNSocial

# Installer les dépendances
npm install

# Lancer l'application
npm start
```

## Lancer sur un appareil

```bash
npm run android   # Android
npm run ios       # iOS
npm run web       # Navigateur
```

## Structure du projet

```
src/
├── components/     # Composants réutilisables (PostCard, MatchCard, VotingWidget...)
├── context/        # Contextes React (Auth, Follow, Match, Prono, Ratings)
├── navigation/     # Configuration de la navigation
├── screens/        # Écrans de l'application
├── services/       # Services (Notifications)
├── config/         # Configuration Firebase
├── theme/          # Thème et couleurs
├── types/          # Types TypeScript
└── data/           # Données mock
functions/          # Firebase Cloud Functions (TypeScript)
```

## Configuration Firebase

Crée un projet Firebase et ajoute tes clés dans `src/config/firebase.ts`.

## Licence

Projet personnel — tous droits réservés.
