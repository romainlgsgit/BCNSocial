import { Platform } from 'react-native';

// ─── AppLovin MAX ────────────────────────────────────────────────────────────
// À renseigner depuis ton dashboard AppLovin (https://dash.applovin.com).
//
// 1) SDK Key  : Account → Keys → "SDK Key"
// 2) Ad Units : MAX → Ad Units → créer un ad unit PAR FORMAT et PAR PLATEFORME
//               (Banner, MREC, Rewarded), puis coller les IDs ci-dessous.
//
// Tant que les valeurs commencent par "YOUR_", aucune pub n'est affichée
// (ADS_CONFIGURED = false) — l'app fonctionne normalement sans erreur.

export const APPLOVIN_SDK_KEY = 'YOUR_APPLOVIN_SDK_KEY';

export const AD_UNITS = {
  banner:
    Platform.select({
      ios: 'YOUR_IOS_BANNER_AD_UNIT_ID',
      android: 'YOUR_ANDROID_BANNER_AD_UNIT_ID',
    }) ?? '',
  mrec:
    Platform.select({
      ios: 'YOUR_IOS_MREC_AD_UNIT_ID',
      android: 'YOUR_ANDROID_MREC_AD_UNIT_ID',
    }) ?? '',
  rewarded:
    Platform.select({
      ios: 'YOUR_IOS_REWARDED_AD_UNIT_ID',
      android: 'YOUR_ANDROID_REWARDED_AD_UNIT_ID',
    }) ?? '',
};

// Vrai uniquement quand la clé SDK et l'ID bannière ont bien été renseignés.
export const ADS_CONFIGURED =
  !APPLOVIN_SDK_KEY.startsWith('YOUR_') && !AD_UNITS.banner.startsWith('YOUR_');
