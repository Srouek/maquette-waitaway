# WaitAway : maquette de démo

Maquette cliquable à faire essayer à des coiffeurs et barbiers. Elle ne parle pas à QueueAPI : la file est simulée dans le navigateur, avec les règles du backlog (`queuAPI/queueapi/docs/09-BACKLOG.md`).

## Lancer

```bash
npm install
npm run dev        # affiche une URL « Network » à ouvrir sur le téléphone (même Wi-Fi)
npm run build      # site statique dans dist/, à héberger n'importe où
```

Sur le téléphone, « Ajouter à l'écran d'accueil » ouvre la démo en plein écran.

## Déployer

Le travail se fait sur la branche `dev`. `main` ne sert qu'au déploiement : à chaque push sur `main`, `.github/workflows/deploy.yml` lance `npm ci` et `npm run build`, puis publie `dist/` sur GitHub Pages. Pour publier, on merge `dev` dans `main`.

Mise en place, 1 fois :

1. Créer le dépôt public sur GitHub, puis `git remote add origin <url>`, `git push -u origin dev` et `git push -u origin main`.
2. Dans le dépôt : Settings > Pages > Source = « GitHub Actions ».
3. Relancer le workflow depuis l'onglet Actions si le 1er push est parti avant ce réglage.

Le site est servi à `https://<compte>.github.io/<dépôt>/`. Il marche dans n'importe quel sous-dossier, car `vite.config.ts` construit avec des chemins relatifs (`base: './'`).

## Utiliser pendant une présentation

- **Sur un téléphone** : la barre du haut bascule entre la vue **Client** et la vue **Coiffeur**. Un point doré signale une notification en attente dans l'autre vue.
- **Sur un ordinateur** (900 px et plus) : les 2 téléphones s'affichent côte à côte.
- **⋯** lance 1 des 3 scénarios, toujours depuis son début.
- **Le bandeau sous l'heure** guide le scénario, étape par étape. Il affiche soit une consigne à faire sur le téléphone (« Scanne le QR code de ton poste »), soit un bouton doré qui saute au moment suivant (« Aller à la pause du matin »). Sur un téléphone, il bascule seul sur la bonne vue.
- **« +5 min » et ▶** restent libres : +5 min avance d'un coup, ▶ fait passer 1 minute toutes les 2 secondes.
- **Le temps démarre seul** quand le coiffeur ouvre sa file. Il s'arrête quand le coiffeur doit agir (pause à démarrer, client en retard, walk-in à ajouter, demande après la fermeture) et repart ensuite.
- **« Reprendre ma file »** pendant une pause fait sauter l'heure à la fin prévue de la pause, pour que les heures de la file restent justes.

L'état est gardé dans le navigateur : recharger la page ne perd rien, l'étape en cours est conservée.

## Les 3 scénarios

### Coiffeur : ma journée

Le compte « The Best Barber » (bestbarber@barber.fr) se connecte, scanne le QR code de son poste et confirme sa journée en 3 pages. Garde les réglages proposés (pauses à 10h30, 12h30 et 16h00, fin à 19h00) pour retrouver ce déroulé :

| Heure | Ce qui se passe | Ce que ça montre |
|---|---|---|
| 9h15 | Yanis s'inscrit, puis scanne le QR du poste | 1re prestation, temps restant |
| 9h40 | 4 clients sont inscrits | La file, avec la pause placée dedans |
| 10h10 | Adam, en position 2, tombait sur 10h30 : la pause passe avant lui | Pause **plus tôt** que souhaité |
| 10h25 | Adam démarre : taper fade et barbe | Reprise après la pause |
| 12h40 | Léo, en position 1, tombait sur 12h30 : la pause glisse après lui | Pause **plus tard** que souhaité |
| 13h40 | Théo, 1er à la reprise pour 40 min, n'est pas venu. Un passant entre | Le walk-in passe à sa place. Théo garde la 1re place (S37) ou est retiré (S23). Les heures de la file sont recalculées |
| 16h00 | Le poste est libre | Pause à l'heure |
| 16h16 | Un homme entre sans avoir scanné : le coiffeur l'ajoute en fin de file | Walk-in qui attend son tour |
| 16h26 | Il scanne le QR code de son ticket | Le walk-in devient Ilyes, avec ses prestations (QA-27) |
| 17h30 | Kylian s'inscrit, il finira pile à 19h00 | La journée est pleine |
| 18h20 | Lucas demande 30 min, il finirait à 19h30 | Demande après la fermeture : le coiffeur accepte ou refuse |
| 18h20 | Le téléphone client (Samir) demande 40 min, il finirait à 20h10 | Refusé d'office : plus de 30 min après la fermeture |
| 19h00 ou 19h30 | Le dernier client est servi | Fermeture, refusée tant qu'un client attend |

### Client : je m'inscris

Mardi 14h10. Le client scanne le QR code du salon, choisit Karim, 1 ou plusieurs prestations, crée son compte (Google ou e-mail), règle son rappel, arrive sur son compte, confirme sa présence par le bouton Scan, puis démarre sa prestation. Dans ce scénario, Karim prend sa pause seul.

### Coiffeur : je crée mon compte

E-mail et code reçu par e-mail, profil, choix des prestations et de leur durée, semaine type avec ses pauses.

## Ce que la démo montre

| Côté | Écran | Règle |
|---|---|---|
| Client | Scan du QR Boutique, attente par coiffeur sans compte | E1-2, QA-12 |
| Client | Prestations par bloc (coupe, barbe, soin), durée fixée par le coiffeur | QA-18 |
| Client | Compte par Google ou par e-mail | E2-0 |
| Client et coiffeur | Inscription qui finirait jusqu'à 30 min après la fermeture : demande au coiffeur, qui accepte ou refuse. Au-delà, refus d'office | QA-20, modifié |
| Client | Ticket : position, temps d'attente estimé, heure de passage | E2-2 |
| Client | Rappel réglable (10, 20, 30 min), re-scan pour confirmer | E2-3 |
| Client | Scan du QR du poste, avec les garde-fous | E2-4, S14 |
| Client | Quitter la file, ticket retiré par le coiffeur, fin de prestation | E6-8 |
| Coiffeur | Ouverture par scan : durées, pauses, heure de fin | E6-6, S22 |
| Coiffeur | File en direct, client sur le fauteuil | E3-4 |
| Coiffeur | Pause placée dans la file, rappel, démarrage par scan, reprise | E6-7, S24 |
| Coiffeur | Alerte `customer.late` : attendre, walk-in, client présent, retirer | S37 |
| Coiffeur | Walk-in par ticket anonyme, à durée libre, avec QR code | S44, QA-27 |
| Coiffeur | Fermeture de file, refusée tant que des clients attendent | QA-28 |

## Écarts avec le backlog

La maquette s'écarte de QueueAPI sur ces points. Chacun a son commentaire dans le code.

| Sujet | Dans la maquette | Dans QueueAPI |
|---|---|---|
| Inscription après la fermeture | Jusqu'à 30 min après : envoyée au coiffeur, qui accepte ou refuse, sans délai de réponse. Acceptée, elle vaut confirmation de présence. Au-delà : refusée d'office | Refusée d'office (QA-20). Le client a scanné le QR code de l'entrée, il est donc au salon et peut parler au coiffeur. À reporter dans QA-20 |
| Place d'une pause | Décidée 1 fois, puis figée (`beforeTicketId`) | Recalculée à chaque requête : la pause peut sauter derrière un client qui arrive en position 1. À trancher dans E6-7 |
| Rappel de pause | Envoyé quand le créneau calculé arrive | Envoyé à l'heure souhaitée (S24) |
| Fin d'une prestation | Seule, quand sa durée est écoulée | Au démarrage du suivant, à la pause ou à la fermeture. Le dépassement (E6-4) n'est pas montré |
| Connexion du coiffeur | Code reçu par e-mail | Mot de passe (`06-CONTRAT-API.md`) |
| Prestations du coiffeur | Choisies dans un catalogue | Soumises par l'agent, validées par le gérant (S19) |
| Prestations favorites | Affichées sur le compte | Classées « hors démo » (QA-10) |
| Connexion Google | Simulée | Pas encore de token utilisable (QA-13) |

Les 13 coupes et leurs descriptions viennent de [barberconcept.ch](https://barberconcept.ch/blog/choisir-son-style-coiffure-homme), réécrites. Les durées sont choisies pour la démo. Les icônes sont dessinées pour la maquette (`src/ui/icons.tsx`) ; `icon_exemple/` garde les images qui ont servi de modèle de style.

## Arborescence

```
src/
├── sim/        # simulation : types, catalogue, moteur (règles), scénarios, store React
├── client/     # écrans du client
├── agent/      # écrans du coiffeur (agent)
├── ui/         # icônes, scan simulé, roulette, notifications, panneaux
├── App.tsx     # barre de démo, bandeau guide, 1 ou 2 téléphones selon la largeur
└── styles.css  # tokens (couleurs, typo, rayons) puis composants
```
