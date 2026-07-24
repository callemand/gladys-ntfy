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
- Un **topic** et un **jeton d'accès** pour ce topic. Un topic est un canal :
  choisissez un nom **long et difficile à deviner** et protégez-le avec un jeton
  (`tk_…`) autorisé à y publier.

## Configuration

La configuration se fait en deux parties :

### 1. Réglages de l'intégration (communs, une seule fois)

- **Mode serveur** — où les notifications sont publiées :
  - **Cloud** — le service public `https://ntfy.sh` ou un autre serveur distant
    renseigné dans l'URL ci-dessous ;
  - **Serveur local géré par Gladys** — Gladys fait tourner son propre serveur
    ntfy (voir la section dédiée plus bas) ;
- **URL du serveur ntfy (mode cloud)** — le serveur utilisé en mode cloud
  (ignoré en mode local) ;
- **Priorité par défaut** — la priorité des notifications envoyées par Gladys ;
- **Titre par défaut** — le titre affiché sur ces notifications.

### 2. Mon compte (par utilisateur)

Chaque utilisateur Gladys ouvre l'intégration et remplit son bloc « Mon
compte » :

- **Votre topic ntfy** — le topic sur lequel vos notifications sont envoyées ;
- **Jeton d'accès** — un jeton d'accès ntfy (`tk_…`) autorisé à publier sur ce
  topic.

Puis **abonnez-vous à ce topic dans l'application ntfy** sur votre téléphone
pour recevoir les notifications.

## Serveur local géré par Gladys

Réglez **Mode serveur** sur **Local** : Gladys démarre et gère son propre
serveur ntfy dans un conteneur — aucun service externe, vos notifications ne
quittent jamais votre réseau.

- **Docker est requis** (le serveur tourne comme conteneur compagnon).
- Gladys publie automatiquement sur ce serveur local ; vous n'avez qu'à choisir
  votre **topic** dans votre compte (le jeton d'accès est optionnel pour un
  serveur local).
- **Votre téléphone doit pouvoir joindre le serveur.** Le serveur local est
  exposé sur votre réseau local sur un port choisi par Gladys (affiché via un
  lien « Ouvrir » sur la page de l'intégration). Dans l'application ntfy,
  ajoutez un serveur avec cette adresse (`http://<ip-gladys>:<port>`) et
  abonnez-vous à votre topic dessus.
- Comme il est sur votre réseau local, le push en arrière-plan fonctionne quand
  le téléphone est sur le réseau de la maison. Pour une réception fiable depuis
  n'importe où, exposez le serveur derrière un reverse-proxy HTTPS public
  (avancé).

## Envoyer des notifications

Utilisez une scène Gladys avec une action **« Envoyer un message »**,
choisissez cette intégration et l'utilisateur à notifier : le message est publié
sur le topic ntfy de cet utilisateur et poussé sur son téléphone.

## Dépannage

- **Un utilisateur ne reçoit rien** — vérifiez que son **topic** et son **jeton
  d'accès** sont renseignés dans son bloc « Mon compte », et que l'application
  ntfy de son téléphone est abonnée au **même topic et au même serveur**.
- **La publication échoue (403)** — le jeton d'accès est absent ou non autorisé
  à publier sur le topic ; créez-le ou renouvelez-le sur votre serveur ntfy.
- **Les notifications arrivent sans titre** — renseignez le **Titre par défaut**
  dans les réglages de l'intégration.
