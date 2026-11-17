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

- **1 seul téléphone par scénario** : celui du coiffeur dans les 2 scénarios coiffeur, car il pilote sa file avec son seul téléphone, et celui du client dans le scénario client. Sur un ordinateur (900 px et plus), il s'affiche dans un cadre de téléphone.
- **⋯** lance 1 des 3 scénarios, toujours depuis son début.
- **Le bandeau sous l'heure** guide le scénario, étape par étape. Il affiche soit une consigne à faire sur le téléphone (« Scanne le QR code de ton poste »), soit un bouton doré qui saute au moment suivant (« Aller à la pause du matin »).
- **« +5 min » et ▶** restent libres : +5 min avance d'un coup, ▶ fait passer 1 minute toutes les 2 secondes.
- **Le temps démarre seul** quand le coiffeur ouvre sa file. Il s'arrête quand le coiffeur doit agir (pause à démarrer, client en retard, walk-in à ajouter, demande après la fermeture) et repart ensuite.
- **La reprise après une pause se fait par le scan du QR code du poste** (QA-31). Tant que le coiffeur n'a pas scanné, aucun client ne peut démarrer sa prestation, même après l'heure prévue. Scanné avant la fin, le client confirmé en position 1 voit le coiffeur revenir et scanne le poste 2 min après : il gagne le reste de la pause.
- **Le saut « Aller à 5 min de la fin de la pause »** laisse le choix : scanner tout de suite, ou laisser filer. À la fin de la pause, le coiffeur reçoit « Ta pause est finie » et le temps passe au ralenti (1 minute toutes les 5 secondes) jusqu'à sa décision : reprendre, annoncer un retard (QA-32) ou fermer sa file sur imprévu (QA-33).

L'état est gardé dans le navigateur : recharger la page ne perd rien, l'étape en cours est conservée.

## Les 3 scénarios

### Coiffeur : ma journée

Le compte « The Best Barber » (bestbarber@barber.fr) se connecte, scanne le QR code de son poste et confirme sa journée en 3 pages. Garde les réglages proposés (pauses à 10h30, 12h30 et 16h00, fin à 19h00) et scanne dès chaque saut de fin de pause pour retrouver ce déroulé. Un retard du coiffeur décale toutes les heures qui suivent :

| Heure | Ce qui se passe | Ce que ça montre |
|---|---|---|
| 9h15 | Louis s'inscrit, puis scanne le QR du poste. Son dégradé dure 7 min de plus que prévu : à 9h50, 5 min de retard sont constatées | 1re prestation. Dépassement automatique : les clients pas encore au salon qui passent dans moins de 30 min sont prévenus, sans geste du coiffeur (S20) |
| 9h40 | 4 clients sont inscrits | La file, avec la pause placée dedans |
| 10h17 | Adam, en position 2, tombait sur 10h30 : la pause passe avant lui | Pause **plus tôt** que souhaité |
| 10h27 | 5 min avant la fin de la pause, le coiffeur scanne son poste. Adam, confirmé, démarre à 10h29 : taper fade et barbe | Reprise par scan, en avance |
| 12h14 | Léo démarre un dégradé avec un motif. Le coiffeur touche sa carte et annonce 10 min de retard | Retard annoncé en 1 geste (S20). 2e dépassement du dégradé dans la journée |
| 12h54 | Léo, en position 1, tombait sur 12h30 : la pause glisse après lui | Pause **plus tard** que souhaité |
| 13h50 | Théo, 1er à la reprise pour 40 min, n'est pas venu. Un passant entre | Le walk-in passe à sa place. Théo garde la 1re place (S37) ou est retiré (S23). Les heures de la file sont recalculées |
| 16h00 | Le poste est libre | Pause à l'heure. À 16h10, laisse filer la fin pour montrer le retard du coiffeur |
| 16h13 | Un homme entre sans avoir scanné : le coiffeur l'ajoute en fin de file | Walk-in qui attend son tour. Son tour est dans plus de 10 min : il est « En route », pas confirmé (QA-27, règle 1) |
| 16h23 | Il scanne le QR code de son ticket | Le walk-in devient Tom, avec ses prestations (QA-27). Il confirme lui-même sa présence 10 min avant son tour, comme les autres clients (règle 11) |
| 17h30 | Kylian s'inscrit, il finira vers 19h00 | La journée est pleine |
| 18h20 | Lucas demande 30 min, il finirait à 19h30 | Demande après la fermeture : le coiffeur accepte ou refuse |
| 18h20 | Romain demande 40 min, il finirait vers 20h10 | Refusé d'office : plus de 30 min après la fermeture. Le coiffeur ne voit rien. Avec une fin de journée plus tardive, voir sous le tableau |
| 19h00 ou 19h30 | Le saut s'arrête 5 min avant la fin de la dernière prestation. Le coiffeur ferme tout de suite, ou attend la notification « Plus personne n'attend » | Fermeture depuis l'application, sans scan, refusée tant qu'un client attend |
| Après la fermeture | « Ton dégradé / fade a dépassé 2 fois aujourd'hui. Passer de 30 à 35 min ? » | Suggestion jamais appliquée seule (S20). Sans réponse, elle revient à l'ouverture suivante |

Un walk-in que le coiffeur ajoute sans qu'il rattache son ticket reste « En route » s'il passe dans plus de 10 min. Quand son tour approche, la pop-up de retard s'ouvre chez le coiffeur, qui touche « Il est au salon : confirmer » (QA-27, règle 12).

**Fin de journée plus tardive.** Si la personne qui teste fixe la fin de journée à 20h00, 21h00, 22h00 ou 23h00 à l'ouverture de la file, Lucas arrive 40 min avant la fermeture et s'inscrit normalement. La demande de Romain (40 min) finit alors pile 30 min après la fermeture : elle arrive chez le coiffeur, qui accepte ou refuse. Pour que la soirée ne soit pas vide, 2 clients du soir arrivent par heure en plus : Victor et Baptiste si la fin est à 21h00 ou plus tard, Clément et Valentin à 22h00 ou plus tard, Martin et Alexandre à 23h00.

### Client : je m'inscris

Mardi 9h40, dans le salon. Le client scanne le QR code de l'entrée et voit 8 coiffeurs. Chacun montre 1 cas, indiqué par une étiquette sous son nom. Choisir un coiffeur lance son cas. Le téléphone du coiffeur est caché : le scénario ne montre que ce que le client reçoit ou fait. Tant qu'il n'a pas de ticket, le client peut revenir au salon et essayer un autre coiffeur. Le cas va jusqu'à la fin de la prestation, sauf quand le ticket disparaît.

| Coiffeur | Cas | Ce que le client vit |
|---|---|---|
| Antoine | Parcours normal | Tour vers 10h20. Rappel « Mets-toi en route » au délai choisi, invitation à confirmer à 10h10, Scan pour confirmer, « C'est ton tour », Scan du poste, prestation |
| Mathis | Premier de la file | Tour dans moins de 10 min : confirmé dès l'inscription (S38). Il scanne le poste, ou quitte la file |
| Julien | Retard du coiffeur | 9h48 : « Julien annonce 10 min de retard », nouvelle heure. 10h15 : « Julien a 5 min de retard ». S'il a déjà confirmé, il ne reçoit rien (S20) |
| Thomas | Le tour avance | 10h00 : un client devant lui quitte la file, « Ton tour avance de 30 min » |
| Nicolas | Client en retard | Il reçoit l'invitation à confirmer mais ne revient pas. 3 min après son tour : « Nicolas a retiré ton ticket », motif « Client absent » (S37, S23) |
| Damien | Après la fermeture | Damien ferme à 10h15 : « Demander une place », Damien accepte 2 min après, la place vaut confirmation. Au-delà de 30 min après la fermeture, refus d'office (QA-20, QA-30) |
| Bruno | Imprévu | 10h00 : « Bruno a dû fermer sa file », ticket retiré (QA-33) |
| Maxence | Walk-in | Le client est entré sans scanner, Maxence lui a créé un ticket. Il scanne le QR code du ticket, choisit ses prestations, crée son compte. Son tour est dans 10 min ou plus : il n'est plus confirmé et repasse par le rappel et l'invitation à confirmer (QA-27) |

Dans tous les cas, le scan donne la raison d'un refus. Le scan du salon pour confirmer sa présence est refusé plus de 10 min avant son tour. Une fois la présence confirmée, le bouton Scan vise le poste du coiffeur. Il est refusé s'il reste plus de 10 min à la prestation en cours (S14). Dès que la prestation est terminée, le client reçoit un questionnaire de satisfaction : il rappelle le salon, le coiffeur et la coupe, et demande une note de 1 à 5 étoiles, un commentaire et une photo facultatifs, ou « Plus tard ».

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
| Client | Rappel personnel réglable de 20 à 60 min, par pas de 5. Invitation à confirmer 10 min avant le tour, re-scan accepté à partir de là | E2-3, QA-35 |
| Client | Scan du QR du poste, avec les garde-fous | E2-4, S14 |
| Client | Quitter la file, ticket retiré par le coiffeur, fin de prestation | E6-8 |
| Coiffeur | Ouverture par scan : durées, pauses, heure de fin | E6-6, S22 |
| Coiffeur | File en direct, client sur le fauteuil | E3-4 |
| Coiffeur | Pause placée dans la file, rappel, démarrage et reprise par scan | E6-7, S24, QA-31 |
| Coiffeur | Retard au retour de pause, fermeture de file sur imprévu | QA-32, QA-33 |
| Coiffeur | Alerte `customer.late` : attendre, walk-in, client présent, retirer | S37 |
| Coiffeur | Walk-in par ticket anonyme, à durée libre, avec QR code | S44, QA-27 |
| Coiffeur | Fermeture de file depuis l'application, refusée tant que des clients attendent | QA-28 |
| Coiffeur | Dépassement : retard annoncé en 1 geste depuis la carte du client en cours, suggestion d'allonger une prestation qui a dépassé 2 fois (après la fermeture ou à l'ouverture) | S20 |
| Client | Questionnaire de satisfaction à la fin de la prestation : salon, coiffeur et coupe, note de 1 à 5, commentaire et photo facultatifs | QA-34, épic à cadrer |
| Client | Dépassement : notification de 5 min de retard, une fois constatées, aux clients non confirmés dont le tour est dans moins de 30 min | S20 |
| Client | Notification quand son tour avance d'au moins 5 min | Hors backlog |

## Écarts avec le backlog

La maquette s'écarte de QueueAPI sur ces points. Chacun a son commentaire dans le code.

| Sujet | Dans la maquette | Dans QueueAPI |
|---|---|---|
| Inscription après la fermeture | Jusqu'à 30 min après : envoyée au coiffeur, qui accepte ou refuse, sans délai de réponse. Acceptée, elle vaut confirmation de présence. Au-delà : refusée d'office | Refusée d'office (QA-20). Le client a scanné le QR code de l'entrée, il est donc au salon et peut parler au coiffeur. À reporter dans QA-20 |
| Place d'une pause | Décidée 1 fois, puis figée (`beforeTicketId`) | Recalculée à chaque requête : la pause peut sauter derrière un client qui arrive en position 1. À trancher dans E6-7 |
| Rappel du client | Un simple « Mets-toi en route », au délai choisi (20 à 60 min). Une invitation à confirmer part 10 min avant le tour, et le re-scan n'est accepté qu'à partir d'elle. `customer.late` part à 5 min du tour | Le rappel (10, 20 ou 30 min) invite à revenir confirmer, sans limite d'heure. `customer.late` part à 10 min (S16, S37). Décision du 16/11 reportée dans QA-35 et QA-1 |
| Rappel de pause | Envoyé quand le créneau calculé arrive | Envoyé à l'heure souhaitée (S24) |
| Fin de journée | Fin de journée passée et plus personne en service ni en attente : notification « Plus personne n'attend » au coiffeur, et le temps s'arrête | Pas de notification (QA-28). La file se ferme d'office à minuit |
| Fin d'une prestation | Seule, quand sa durée est écoulée, ou plus tard si le scénario la fait dépasser | Au démarrage du suivant, à la pause ou à la fermeture |
| Dépassement | Notification dans l'application seulement, et seul le téléphone client la reçoit | Aussi en push, à tous les clients concernés (S20) |
| Tour qui avance | Le client est prévenu dès que son tour avance d'au moins 5 min | Rien de prévu. À ajouter au backlog |
| Questionnaire de satisfaction | Envoyé dès que la prestation est close : démarrage du client suivant, pause ou fermeture de file, ou fin de sa durée (la maquette ferme seule une prestation finie). La photo reste dans le navigateur : l'avis garde seulement qu'il y en a une | QA-34, épic à cadrer : qui voit les notes n'est pas décidé, la maquette ne les montre à personne |
| Coiffeurs du scénario client | Personne ne les joue : leurs gestes sont prévus (`agentEvents` dans `src/sim/salon.ts`). Une demande après la fermeture est acceptée 2 min après | Le coiffeur décide |
| Connexion du coiffeur | Code reçu par e-mail | Mot de passe (`06-CONTRAT-API.md`) |
| Prestations du coiffeur | Choisies dans un catalogue | Soumises par l'agent, validées par le gérant (S19) |
| Prestations favorites | Affichées sur le compte | Classées « hors démo » (QA-10) |
| Connexion Google | Simulée | Pas encore de token utilisable (QA-13) |

Les 13 coupes et leurs descriptions viennent de [barberconcept.ch](https://barberconcept.ch/blog/choisir-son-style-coiffure-homme), réécrites. Les durées sont choisies pour la démo. Les icônes sont dessinées pour la maquette (`src/ui/icons.tsx`) ; `exemple/` (hors git) garde les images qui ont servi de modèle de style.

## Arborescence

```
src/
├── sim/        # simulation : types, catalogue, moteur (règles), scénarios, store React
├── client/     # écrans du client
├── agent/      # écrans du coiffeur (agent)
├── ui/         # icônes, scan simulé, roulette, notifications, panneaux
├── App.tsx     # barre de démo, bandeau guide, le téléphone du scénario
└── styles.css  # tokens (couleurs, typo, rayons) puis composants
```
