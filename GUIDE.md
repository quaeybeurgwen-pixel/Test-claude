# Guide d'installation de Gwennou App

Ce guide se suit dans l'ordre. Les étapes 1 et 2 suffisent pour utiliser l'application.
Les étapes 3 et 4 (Google Agenda, Microsoft To Do) sont facultatives et peuvent être faites plus tard.

---

## 1. Mettre l'application en ligne (GitHub Pages)

Le dépôt est **privé**. Or GitHub Pages n'est gratuit que pour les dépôts **publics**. Deux possibilités :

**Option A : rendre le dépôt public (la plus simple).** Le dépôt ne contient que le code de l'application, aucune donnée personnelle : vos tâches, élèves, finances… restent sur votre téléphone.

1. Sur GitHub, ouvrez le dépôt **Test-claude** → **Settings** → en bas, **Danger Zone** → **Change visibility** → **Public**.
2. **Settings** → **Pages** → *Source* : **Deploy from a branch** → branche `main` (ou la branche de travail), dossier `/ (root)` → **Save**.
3. Une à deux minutes plus tard, l'adresse s'affiche :
   `https://quaeybeurgwen-pixel.github.io/Test-claude/`

**Option B : garder le dépôt privé** et le publier gratuitement avec [Netlify](https://www.netlify.com) :
*Add new site* → *Import from GitHub* → choisir le dépôt → laisser la commande de build vide, dossier de publication `/` → *Deploy*.

> L'adresse de l'application sert aussi aux étapes 3 et 4 : notez-la.

## 2. Installer l'application sur l'iPhone

1. Ouvrez l'adresse dans **Safari**. C'est obligatoire : Chrome ne permet pas l'installation sur iPhone.
2. Touchez le bouton **Partager** (carré avec une flèche), puis **Sur l'écran d'accueil** → **Ajouter**.
3. Lancez **Gwennou App** depuis l'icône (feuille de sauge). Elle s'ouvre en plein écran comme une vraie application, et fonctionne même sans réseau.
4. Dans **Réglages** (icône en haut à droite), définissez votre **code PIN**.

**Sauvegarde :** les données sont enregistrées uniquement dans l'application, sur ce téléphone.
Pensez à faire **Réglages → Exporter** de temps en temps et à enregistrer le fichier dans iCloud Drive.

---

## 3. Relier Google Agenda (facultatif, ~15 min, une seule fois)

Google exige que chaque application déclare son identité. Vous allez créer un « identifiant client » gratuit.

1. Allez sur <https://console.cloud.google.com> avec votre compte Google, et créez un projet nommé **Gwennou App**.
2. Menu **API et services → Bibliothèque** : cherchez **Google Calendar API** → **Activer**.
3. Menu **API et services → Écran de consentement OAuth** (ou *Google Auth Platform*) :
   - type d'utilisateurs : **Externe** ; nom de l'application : *Gwennou App* ; votre e-mail ;
   - dans **Audience / Utilisateurs test**, ajoutez **votre adresse Gmail**.
4. Menu **Identifiants → Créer des identifiants → ID client OAuth** :
   - type : **Application Web** ;
   - **Origines JavaScript autorisées** : `https://quaeybeurgwen-pixel.github.io` ;
   - **URI de redirection autorisés** : l'adresse exacte de l'application, par exemple
     `https://quaeybeurgwen-pixel.github.io/Test-claude/`. L'écran Réglages de Gwennou App l'affiche aussi.
5. Copiez l'**ID client** (il se termine par `.apps.googleusercontent.com`).
6. Dans Gwennou App : **Réglages → Google Agenda → Saisir l'identifiant client**, collez-le, puis **Se connecter à Google**.
   Google affiche « Google n'a pas validé cette application » : c'est normal, c'est la vôtre. Touchez **Continuer**.

Tous vos agendas apparaissent avec leur couleur Google. Dans les Réglages, vous pouvez masquer un agenda
ou changer sa couleur.

**À savoir :** pour des raisons de sécurité, l'accès accordé par Google dure 1 heure.
Ensuite, les rendez-vous restent affichés et le bouton **Actualiser l'agenda** les remet à jour en un geste.

---

## 4. Relier Microsoft To Do (facultatif, ~15 min, une seule fois)

La synchronisation fonctionne dans les deux sens : les tâches créées dans Gwennou App apparaissent dans To Do, et inversement.
**Les rappels** (heure de rappel d'une tâche, actions ISP) sont envoyés sur l'iPhone par l'application **Microsoft To Do**.

1. Allez sur <https://entra.microsoft.com> (ou <https://portal.azure.com>) avec le compte Microsoft utilisé dans To Do.
   Avec un compte personnel (outlook.com, hotmail…), Microsoft peut demander de créer d'abord un
   **compte Azure gratuit**. Une carte bancaire est alors demandée pour vérifier votre identité, mais rien n'est facturé.
2. **Applications → Inscriptions d'applications → Nouvelle inscription** :
   - nom : *Gwennou App* ;
   - types de comptes : **Comptes dans un annuaire organisationnel et comptes Microsoft personnels** ;
   - URI de redirection : plateforme **Application monopage (SPA)**, adresse exacte de l'application
     (ex. `https://quaeybeurgwen-pixel.github.io/Test-claude/`) → **Inscrire**.
3. Copiez l'**ID d'application (client)**.
4. *(Recommandé)* **Autorisations d'API → Ajouter → Microsoft Graph → Autorisations déléguées → `Tasks.ReadWrite`**.
5. Dans Gwennou App : **Réglages → Microsoft To Do → Saisir l'identifiant d'application**, puis **Se connecter à Microsoft**.
6. **Choisir les listes To Do** : la liste « Tâches » pour le perso, et une liste « ISP »
   (le bouton **Créer une liste « ISP »** la crée pour vous).

**À savoir :** Microsoft limite à 24 heures la connexion d'une application web sans serveur. Si vous n'avez pas
ouvert Gwennou App depuis plus d'un jour, un bandeau **« Synchronisation To Do en pause — reconnecter »** apparaît
sur l'accueil. Un geste suffit, en général sans retaper le mot de passe.

---

## Ce qui n'est pas (encore) possible

| Souhait | Situation |
|---|---|
| Notifications envoyées par Gwennou App elle-même | Sur iPhone, une application web ne peut pas programmer de notifications sans serveur. Les rappels passent par **Microsoft To Do**, qui les gère parfaitement. |
| Pas comptés automatiquement | Une application web ne peut pas lire Apple Santé : saisie manuelle dans *Habitudes*. |
| Strava / Garmin | Prévu pour une prochaine version. Garmin envoie déjà vos activités dans Strava, et Strava nécessite un petit serveur intermédiaire (gratuit, par exemple Cloudflare Workers). Garmin n'ouvre son API qu'aux entreprises. |
| Utiliser Gwennou App sur plusieurs appareils | Les données restent sur le téléphone. Exportez / importez pour les transférer. |
