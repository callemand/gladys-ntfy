# ntfy

## Présentation

Cette intégration permet à Gladys Assistant d'**envoyer des notifications push**
via [**ntfy**](https://ntfy.sh), un service de notifications très simple.
Lorsqu'une scène vous envoie un message, il est poussé sur votre téléphone via
l'application ntfy.

Elle fonctionne avec le serveur public gratuit **https://ntfy.sh** comme avec
votre propre serveur ntfy **auto-hébergé**.

C'est un canal **envoi uniquement** : Gladys envoie seulement des notifications,
elle ne reçoit pas de messages en retour. Chaque utilisateur Gladys configure
son **propre topic ntfy** dans son compte, pour recevoir ses notifications sur
son propre téléphone.

## Prérequis

- L'**application ntfy** installée sur votre téléphone
  ([Android](https://play.google.com/store/apps/details?id=io.heckel.ntfy) /
  [iOS](https://apps.apple.com/us/app/ntfy/id1625396347)), ou tout client ntfy.
- Un accès Internet depuis votre instance Gladys (pour joindre https://ntfy.sh),
  ou un serveur ntfy auto-hébergé joignable.
- Un **topic**. Un topic est un canal : choisissez un nom **long et difficile à
  deviner**, avec uniquement des lettres, des chiffres, `-` et `_`.
- Un **jeton d'accès** (`tk_…`) autorisé à publier sur ce topic, si votre
  serveur ou votre topic est protégé. Il est facultatif pour un topic ouvert à
  tous, comme un topic public sur ntfy.sh.

## Configuration

La configuration se fait en deux parties :

### 1. Réglages de l'intégration (communs, une seule fois)

- **URL du serveur ntfy** — `https://ntfy.sh` par défaut, ou votre serveur
  auto-hébergé ;
- **Priorité par défaut** — la priorité des notifications envoyées par Gladys ;
- **Titre par défaut** — le titre affiché sur ces notifications.

### 2. Mon compte (par utilisateur)

Chaque utilisateur Gladys ouvre l'intégration et remplit son bloc « Mon
compte » :

- **Votre topic ntfy** — le topic sur lequel vos notifications sont envoyées ;
- **Jeton d'accès** (facultatif) — un jeton d'accès ntfy (`tk_…`) autorisé à
  publier sur ce topic. Laissez vide si le topic est ouvert à tous.

Puis **abonnez-vous à ce topic dans l'application ntfy** sur votre téléphone
pour recevoir les notifications.

## Envoyer des notifications

Utilisez une scène Gladys avec une action **« Envoyer un message »**,
choisissez cette intégration et l'utilisateur à notifier : le message est publié
sur le topic ntfy de cet utilisateur et poussé sur son téléphone.

L'action **« Envoyer l'image d'une caméra »** fonctionne aussi : l'image arrive
en pièce jointe de la notification, affichée dans l'application ntfy. Si le
serveur ntfy n'accepte pas les pièces jointes (désactivées sur certains serveurs
auto-hébergés, ou image trop lourde), le texte est tout de même envoyé, sans
l'image.

## Dépannage

L'intégration vérifie au démarrage, et à chaque changement de réglages, que le
serveur ntfy répond. Si ce n'est pas le cas, ou si une notification est
refusée, l'écran de configuration l'affiche avec la raison et ce qu'il faut
corriger. Le statut redevient normal dès qu'une notification passe. Le même
message apparaît dans l'onglet **Journaux** de l'intégration.

- **Impossible de joindre le serveur ntfy** — l'URL du serveur est fausse, ou
  Gladys n'a pas accès au réseau ou au serveur.
- **Jeton refusé (401)** — le jeton est invalide, expiré ou supprimé. Un jeton
  ntfy commence par `tk_`.
- **Pas le droit de publier (403)** — le topic demande un jeton, ou le jeton
  n'a pas le droit d'écrire sur ce topic ; corrigez ses droits sur votre
  serveur ntfy.
- **Topic non valide** — un topic n'accepte que des lettres, des chiffres, `-`
  et `_` (64 caractères maximum), sans espaces ni accents.
- **Limite atteinte (429)** — le serveur limite le nombre de notifications ;
  patientez, ou utilisez votre propre serveur.
- **Un utilisateur ne reçoit rien, sans erreur** — vérifiez que l'application
  ntfy de son téléphone est abonnée au **même topic et au même serveur** que
  son bloc « Mon compte ».
- **Les notifications arrivent sans titre** — renseignez le **Titre par défaut**
  dans les réglages de l'intégration.
