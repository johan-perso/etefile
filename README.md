# EteFile

EteFile est une alternative à l'API d'[HiberFile](https://github.com/HiberFile/HiberAPI) en utilisant un fonctionnement similaire pour une meilleure compatibilité. Comparé à l'API originale, Firebase est utilisé pour l'hébergement des fichiers et de la base de données.

[HiberCLI](https://github.com/johan-perso/hibercli) est compatible avec l'API d'EteFile, et un fork du site d'[HiberFile](https://github.com/HiberFile/hiberfile) pour supporter EteFile est prévu.


## Roadmap

**[API](https://api.hiberfile.com/documentation) :**

* [ ] /accounts/signup
* [ ] /accounts/change-password
* [ ] /accounts/reset-password
* [ ] /accounts/delete

**Feature :**

* [ ] Supporter les webhooks utilisateur
* [ ] Supporter les webhooks par fichier


## Prérequis (self-host)

* [nodejs v14+ et npm](https://nodejs.org) installé.
* Un compte Google ainsi qu'un projet Firebase (explications dans le wiki).


## Wiki

Le wiki est disponible [ici](https://github.com/johan-perso/etefile-api/wiki).


## Tester/déployer

> Assurez-vous de lire la page du [wiki](https://github.com/johan-perso/etefile-api/wiki/H%C3%A9berger) pour mieux comprendre comment héberger votre instance d'EteFile.

**Tester :**

[![Open in Stackblitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/johan-perso/etefile)

**Héberger :**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fjohan-perso%2Fetefile&env=FIREBASE_API_KEY,FIREBASE_AUTH_DOMAIN,FIREBASE_DATABASE_URL,FIREBASE_ID_PROJECT,FIREBASE_STORAGE_BUCKET,USER_EMAIL,USER_PASSWORD,ADMIN_EMAIL,ADMIN_PASSWORD,ETEFILE_CONNECTION_REQUIRED_TO_UPLOAD&envDescription=Vous%20pouvez%20d%C3%A9finir%20certaines%20variables%20pour%20modifier%20le%20comportement%20d'EteFile&envLink=https%3A%2F%2Fgithub.com%2Fjohan-perso%2Fetefile%2Fwiki%2FVariables&project-name=etefile&repo-name=etefile)


## Licence

MIT © [Johan](https://johanstickman.com)

Non affilié avec HiberFile.
