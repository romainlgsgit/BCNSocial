#!/usr/bin/env bash
# Installe l'app déjà compilée (par `npm run ios:sim`) sur un SECOND simulateur iOS et
# la lance, pour tester le multijoueur en local (2 comptes, 2 fenêtres) sans rebuild.
# Le 2e simulateur se connecte au même Metro que le premier.
set -euo pipefail

BUNDLE_ID="com.romainlgs.barca-app"
SIM2_UDID="${SIM2_UDID:-6C4D6C12-6CCB-4535-8E29-089EFFBB9D0B}" # iPhone 17 Pro Max par défaut

echo "▶︎ Démarrage du 2e simulateur ($SIM2_UDID)…"
xcrun simctl boot "$SIM2_UDID" 2>/dev/null || true
open -a Simulator

echo "▶︎ Recherche du build .app le plus récent…"
# `ls -dt` : trie par date de modif (le plus récent en premier). Glob scopé au projet
# et à la config simulateur → ne matche que le bundle produit, pas les frameworks internes.
APP_PATH="$(ls -dt "$HOME/Library/Developer/Xcode/DerivedData"/*/Build/Products/Debug-iphonesimulator/*.app 2>/dev/null | head -1)"

if [ -z "${APP_PATH:-}" ] || [ ! -d "$APP_PATH" ]; then
  echo "✗ Aucun build simulateur trouvé. Lance d'abord: npm run ios:sim" >&2
  exit 1
fi

echo "▶︎ Installation de: $APP_PATH"
xcrun simctl install "$SIM2_UDID" "$APP_PATH"
echo "▶︎ Lancement de $BUNDLE_ID sur le 2e simulateur…"
xcrun simctl launch "$SIM2_UDID" "$BUNDLE_ID" || true
echo "✓ Prêt. Connecte-toi avec un DEUXIÈME compte sur ce simulateur pour tester le 1v1."
