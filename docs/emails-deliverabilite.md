# Mails Firebase : sortir des spams (legrosromain.fr / IONOS)

**Problème.** Les mails de vérification d'adresse et de mot de passe oublié partent de
`noreply@barca-app-b0795.firebaseapp.com`. Ce domaine générique est partagé par des
milliers de projets Firebase, donc massivement abusé et lourdement filtré par Gmail.
Aucun réglage ne corrige ça : Gmail vérifie que l'expéditeur est **authentifié pour le
domaine d'envoi** (SPF/DKIM/DMARC), et ce domaine ne nous appartient pas.

**Correctif.** Brancher un service d'envoi transactionnel sur notre propre domaine, puis
le déclarer comme serveur SMTP dans Firebase. Les deux types de mails sont réglés d'un
coup, **sans aucune modification de l'app**.

**État : configuré et opérationnel le 23/07/2026.** Ce document sert désormais de
référence (que refaire en cas de changement de domaine, de clé, ou de projet).

---

## Configuration en place

| Élément | Valeur |
|---|---|
| Domaine vérifié (Resend) | `legrosromain.fr` — statut `verified`, région `eu-west-1` |
| Expéditeur | `noreply@legrosromain.fr` |
| SMTP Firebase | `smtp.resend.com:587`, START_TLS, utilisateur `resend` |
| Méthode Firebase Auth | `CUSTOM_SMTP` (au lieu de `DEFAULT`) |

### Enregistrements DNS chez IONOS

| Type | Nom d'hôte | Valeur |
|------|-----------|--------|
| `TXT` | `resend._domainkey` | clé DKIM (218 car., finit par `QIDAQAB`) |
| `MX` | `send` | `feedback-smtp.eu-west-1.amazonses.com`, priorité 10 |
| `TXT` | `send` | `v=spf1 include:amazonses.com ~all` |

**La messagerie IONOS du domaine racine n'est pas touchée** : Resend place son MX et son
SPF sur le sous-domaine `send`, tandis que `legrosromain.fr` garde ses MX
`mx00/mx01.ionos.fr` et son SPF IONOS. Ne jamais ajouter le MX de Resend sur la racine —
cela couperait la réception du courrier personnel.

**DMARC** : déjà présent (`v=DMARC1; p=none;`), couvre le sous-domaine. Ne pas en créer
un second — deux enregistrements DMARC sur le même nom invalident la politique.

### Pièges rencontrés

- **Valeur DKIM tronquée.** Resend affiche `p=MIGfMA[…]QIDAQAB` à l'écran. Recopier ce
  texte donne une clé invalide (IONOS refuse : « caractères non valides »). Il faut
  utiliser le bouton de copie de Resend pour obtenir les 218 caractères complets.
- **Nom d'hôte chez IONOS.** Ne saisir que la partie gauche (`send`,
  `resend._domainkey`) : IONOS ajoute `.legrosromain.fr` automatiquement.
- **Modèles d'e-mail non modifiables par API.** Le `PATCH` sur
  `notification.sendEmail.*Template` renvoie `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED`.
  Ils doivent être édités dans la console (Authentication → Templates → crayon).
  Toujours conserver la variable `%LINK%` dans le corps, sinon le mail part sans lien.

### Reconfigurer par API

La console n'est pas obligatoire pour le SMTP : un jeton OAuth issu des identifiants
`firebase-tools` (`~/.config/configstore/firebase-tools.json`) permet de piloter
l'Identity Toolkit Admin API.

```
PATCH https://identitytoolkit.googleapis.com/admin/v2/projects/barca-app-b0795/config
      ?updateMask=notification.sendEmail.method,notification.sendEmail.smtp
{"notification":{"sendEmail":{"method":"CUSTOM_SMTP","smtp":{
  "senderEmail":"noreply@legrosromain.fr","host":"smtp.resend.com","port":587,
  "username":"resend","password":"<cle re_...>","securityMode":"START_TLS"}}}}
```

Pour revenir en arrière : `"method":"DEFAULT"`.

---

## Reste à faire

- **Traduire les deux modèles** (vérification + mot de passe oublié), encore en anglais.
  Console uniquement. Un mail anglais pour une app française augmente les signalements
  en spam, ce qui dégrade la réputation d'envoi à la longue.
- **Régénérer la clé API Resend** : celle utilisée à la mise en place a transité en
  clair dans une conversation.

---

## Aucun changement côté app

Le code de l'app ne bouge pas : Firebase envoyait déjà les mails, seul l'acheminement
change. Rien à republier en OTA.
