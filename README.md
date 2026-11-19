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

- **La page d'accueil** s'affiche à chaque ouverture du site. Elle présente la démo en 1 phrase et les 4 scénarios, chacun avec l'écran qu'il montre (téléphone du coiffeur, téléphone du client, écran du gérant). Toucher un scénario le lance depuis son début. Si un scénario est commencé, « Reprendre » en tête le retrouve là où il en était.
- **1 seul téléphone par scénario** : celui du coiffeur dans les 2 scénarios coiffeur, car il pilote sa file avec son seul téléphone, et celui du client dans le scénario client. Sur un ordinateur (900 px et plus), il s'affiche dans un cadre de téléphone. Le scénario gérant n'a pas de cadre : sur ordinateur, sa page prend toute la largeur.
- **⋯** lance 1 des 4 scénarios, toujours depuis son début, ou ramène à l'accueil. À la fin d'un scénario, « Autre scénario » ramène aussi à l'accueil.
- **Le bandeau sous l'heure** guide le scénario, étape par étape. Il affiche soit une consigne à faire sur le téléphone (« Scanne le QR code de ton poste »), soit un bouton doré qui saute au moment suivant (« Aller à la pause du matin »).
- **« +5 min » et ▶** restent libres : +5 min avance d'un coup, ▶ fait passer 1 minute toutes les 2 secondes.
- **Le temps démarre seul** quand le coiffeur ouvre sa file. Il s'arrête quand le coiffeur doit agir (pause à démarrer, client en retard, walk-in à ajouter, demande après la fermeture) et repart ensuite.
- **La reprise après une pause se fait par le scan du QR code du poste** (QA-31). Tant que le coiffeur n'a pas scanné, aucun client ne peut démarrer sa prestation, même après l'heure prévue. Scanné avant la fin, le client confirmé en position 1 voit le coiffeur revenir et scanne le poste 2 min après : il gagne le reste de la pause.
- **Le saut « Aller à 5 min de la fin de la pause »** laisse le choix : scanner tout de suite, ou laisser filer. À la fin de la pause, le coiffeur reçoit « Ta pause est finie » et le temps passe au ralenti (1 minute toutes les 5 secondes) jusqu'à sa décision : reprendre, annoncer un retard (QA-32) ou fermer sa file sur imprévu (QA-33).

L'état est gardé dans le navigateur : recharger la page ramène à l'accueil, et « Reprendre » retrouve l'étape en cours.

## Les 4 scénarios

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

Mardi 9h40, dans le salon. Le client scanne le QR code de l'entrée et voit 7 coiffeurs. Chacun montre 1 cas, indiqué par une étiquette sous son nom. Choisir un coiffeur lance son cas. Le téléphone du coiffeur est caché : le scénario ne montre que ce que le client reçoit ou fait. Tant qu'il n'a pas de ticket, le client peut revenir au salon et essayer un autre coiffeur. Le cas va jusqu'à la fin de la prestation, sauf quand le ticket disparaît.

| Coiffeur | Cas | Ce que le client vit |
|---|---|---|
| Antoine | Parcours normal | Tour vers 10h20. Rappel « Mets-toi en route » au délai choisi, invitation à confirmer à 10h10, Scan pour confirmer, « C'est ton tour », Scan du poste, prestation |
| Mathis | Premier de la file | Tour dans moins de 10 min : confirmé dès l'inscription (S38). Il scanne le poste, ou quitte la file |
| Julien | Retard du coiffeur | 9h48 : « Julien annonce 10 min de retard », nouvelle heure. 10h15 : « Julien a 5 min de retard ». S'il a déjà confirmé, il ne reçoit rien (S20) |
| Nicolas | Client en retard | Il reçoit l'invitation à confirmer mais ne revient pas. 3 min après son tour : « Nicolas a retiré ton ticket », motif « Client absent » (S37, S23) |
| Damien | Après la fermeture | Damien ferme à 10h15 : « Demander une place », Damien accepte 2 min après, la place vaut confirmation. Au-delà de 30 min après la fermeture, refus d'office (QA-20, QA-30) |
| Bruno | Imprévu | 10h00 : « Bruno a dû fermer sa file », ticket retiré (QA-33) |
| Maxence | Walk-in | Le client est entré sans scanner, Maxence lui a créé un ticket. Il scanne le QR code du ticket, choisit ses prestations, crée son compte. Son tour est dans 10 min ou plus : il n'est plus confirmé et repasse par le rappel et l'invitation à confirmer (QA-27) |

Dans tous les cas, le scan donne la raison d'un refus. Le scan du salon pour confirmer sa présence est refusé plus de 10 min avant son tour. Une fois la présence confirmée, le bouton Scan vise le poste du coiffeur. Il est refusé s'il reste plus de 10 min à la prestation en cours (S14). Dès que la prestation est terminée, le client reçoit un questionnaire de satisfaction : il rappelle le salon, le coiffeur et la coupe, et demande une note de 1 à 5 étoiles, un commentaire et une photo facultatifs, ou « Plus tard ».

### Coiffeur : je crée mon compte

E-mail et code reçu par e-mail, profil, choix des prestations et de leur durée, semaine type avec ses pauses.

### Gérant : j'installe mon salon

Lundi 8h00. Samuelle Moreau vient d'acheter un abonnement sur le site de WaitAway : son compte et son salon sont créés au paiement (la page d'achat n'est pas maquettée). L'écran Bienvenue reprend les infos de l'achat : son compte, son salon (Salon Le Clos) et son abonnement (1 file). Le compte et le salon se modifient sur place, l'abonnement seulement sur le site. « Configurer mon salon » lance la 1re des 6 étapes de la configuration : heures d'ouverture, postes, prestations, équipe, planning, QR codes. Chaque étape enchaîne sur la suivante. Si la configuration est commencée et pas finie, la page de configuration propose « Reprendre la configuration », qui ouvre la 1re étape pas encore faite. Une fois tout fait, elle garde « Imprimer mes affiches » tant qu'une affiche n'est pas imprimée, puis propose « Ouvrir mon tableau de bord ». Sur ordinateur, les étapes sont dans une colonne à gauche.

Le scénario a 11 étapes. Après « Configurer mon salon », l'écran Heures d'ouverture s'ouvre, déjà rempli : du mardi au samedi de 09:00 à 19:00, dimanche et lundi fermés. Le crayon d'un jour l'ouvre ou le ferme, règle ses heures avec la même roulette que les horaires du coiffeur, ajoute ou retire une 2e plage (fermeture le midi) et copie ses heures sur les autres jours ouverts. Le guide demande de fermer le salon à 18:00 le samedi. « Enregistrer et continuer » refuse une plage qui finit avant de commencer et 2 plages qui se chevauchent, passe l'étape à « Fait » et Postes à « En cours », puis ouvre l'écran Postes. Une étape faite ou en cours se rouvre en la touchant dans la liste des étapes (colonne de gauche sur ordinateur, page de configuration sur téléphone) ; corrigée, elle enchaîne aussi sur l'étape suivante. « Retour » ramène à la page de configuration.

L'écran Postes liste 1 poste par file de l'abonnement, nommé « Poste 1 » au départ. Le guide demande de le renommer, par exemple « Fauteuil vitrine », avec le crayon, et de toucher « Ajouter un poste » pour en avoir un 2e. « Ajouter un poste » ouvre un panneau : l'abonnement compte 1 file, un 2e poste demande 1 file de plus, à acheter sur le site. Dans la démo, le bouton « Ajouter une file sur le site » simule cet achat : l'abonnement passe à 2 files (le bloc abonnement de la page Bienvenue suit), « Poste 2 » apparaît dans la liste, et un message dit que l'achat est simulé. Une fois la configuration finie, le panneau ne propose plus l'achat : il dit que, dans la démo, l'achat d'une file se fait pendant la configuration. « Enregistrer et continuer » refuse un nom vide et 2 postes du même nom (sans tenir compte des majuscules ni des espaces autour), passe Postes à « Fait » et Prestations à « En cours », puis ouvre l'écran Prestations.

L'écran Prestations liste le catalogue WaitAway par bloc (coupe, barbe, soin), rien de coché au départ. Chaque prestation cochée a une durée indicative, réglable par pas de 5 min : c'est la durée proposée à chaque coiffeur, qui réglera ensuite la sienne. Les prestations du gérant sont validées d'office : elles forment le catalogue du salon, dans lequel les coiffeurs choisiront. « Créer une prestation » ouvre un panneau : nom, bloc, durée indicative à la roulette, description facultative. Elle est refusée avec un nom vide ou déjà dans la liste. La prestation créée est cochée et rangée dans son bloc. Le guide demande de créer « Contour au rasoir » de 15 min. Un compteur donne le nombre de prestations du salon. « Enregistrer et continuer » refuse un catalogue vide et 2 prestations du même nom, passe Prestations à « Fait » et Équipe à « En cours », puis ouvre l'écran Équipe. Prestations se rouvre et montre le catalogue enregistré. Pas de prix dans cette étape.

L'écran Équipe liste Samuelle avec le rôle Gérant et la mention « toi », sans croix pour se retirer. « Inviter un coiffeur » ouvre un panneau : prénom, e-mail, rôle (Coiffeur ou Gérant), statut (Salarié ou Indépendant) et, pour un salarié, son volume horaire par semaine, de 1 à 48 h (35 h au départ). L'invitation est refusée avec un prénom vide, un e-mail invalide ou un e-mail déjà dans l'équipe, celui de Samuelle compris. L'invité apparaît avec son rôle, son statut (« Salarié, 35 h » ou « Indépendant ») et la pastille « Invitation envoyée ». « Copier le lien » copie un lien d'inscription fictif ; la croix annule l'invitation. Le guide propose d'inviter Antoine, coiffeur salarié à 35 h, mais l'étape accepte n'importe quel coiffeur : elle finit quand l'équipe est enregistrée avec au moins 1 invitation. Le 1er invité devient le coiffeur invité du scénario, et les étapes suivantes reprennent son prénom. « Enregistrer et continuer » est toujours actif, puisque le gérant peut travailler seul : Équipe passe à « Fait », puis l'écran Ton planning s'ouvre. L'invitation reste en attente jusqu'au saut « 1 semaine plus tard » de la 8e étape, où le coiffeur invité l'accepte : elle n'est reliée à aucun autre scénario.

L'écran Ton planning commence par l'interrupteur « Je coiffe aussi », activé au départ. Désactivé, la semaine disparaît et « Enregistrer et continuer » suffit. Activé, la semaine est déjà remplie d'après les heures d'ouverture enregistrées : chaque jour ouvert est travaillé du début de sa 1re plage à la fin de sa dernière, avec les pauses par défaut du coiffeur, au 1er poste. Les jours où le salon est fermé sont grisés avec « Salon fermé » et ne s'ouvrent pas. Le crayon d'un jour ouvre le même éditeur que les horaires du coiffeur : début et fin restent dans les heures d'ouverture du jour, et avec 2 postes ou plus, le gérant choisit le poste du jour. Le total en bas compte les heures prévues sur la semaine, pauses retirées (« 41 h 30 prévues cette semaine » au départ, 33 h sans le mercredi). « Enregistrer et continuer » refuse un jour travaillé quand le salon est fermé, un horaire hors des heures d'ouverture du jour (pour un jour à 2 plages, le travail doit tenir entre l'ouverture de la 1re et la fermeture de la 2e) un poste inconnu et un chevauchement avec un autre coiffeur sur le même poste (même message que pour le planning d'un membre), puis passe Ton planning à « Fait » et ouvre l'écran QR codes. Le guide demande de retirer le mercredi.

L'écran QR codes montre les affiches à coller dans le salon : celle de l'entrée (QR Boutique), avec le nom du salon et « Scanne pour t'inscrire dans la file, puis à ton retour pour confirmer ta présence. », puis 1 affiche par poste (QR File/Station), avec le nom du poste et « Scanne en arrivant au fauteuil pour démarrer ta prestation ». Sous chaque affiche de poste, une ligne rappelle au gérant que ses coiffeurs la scannent pour ouvrir leur file. Les QR codes sont factices. Sur ordinateur, les affiches sont côte à côte ; sur téléphone, l'une sous l'autre. « Imprimer » (1 affiche) et « Tout imprimer » simulent l'impression : un panneau dit « Affiche prête à imprimer (simulation) », ou « Affiches prêtes à imprimer (simulation) » avec « Tout imprimer », et chaque affiche imprimée reçoit la pastille « Imprimée ». Aucune fenêtre d'impression ne s'ouvre. Renommer un poste ne change pas son QR code : rien à réimprimer. Un poste ajouté après coup, par l'achat d'une file, arrive avec une affiche pas encore imprimée. « Commander une affiche ou un kakemono » ouvre le panneau « Sur le site de WaitAway (simulation) » : la commande d'une affiche imprimée, autocollante ou non, ou d'un kakemono aux couleurs du salon se fait sur le site, et chaque commande est payante (E3-7). « Terminer la configuration » est toujours actif : QR codes passe à « Fait », toutes les étapes sont faites, et la page de configuration annonce « Ton salon est prêt. Tes clients pourront s'inscrire dès qu'un coiffeur ouvrira sa file. » Le guide demande de tout imprimer, puis de terminer la configuration.

Une fois la configuration finie, un menu remplace la liste des étapes : Tableau de bord, Équipe (l'écran Équipe), Plannings et Mon salon (la page de configuration, d'où se rouvrent les heures, les postes, les prestations et les QR codes). Sur ordinateur, il prend la colonne de gauche et les étapes passent dans la page Mon salon ; sur téléphone, il est en bas de l'écran. L'entrée affichée est mise en avant. Pendant la configuration, pas de menu. Un écran d'étape rouvert après la configuration n'affiche plus « Étape n/6 » sur téléphone, et son bouton dit « Enregistrer » : rien ne s'enchaîne, Équipe reste affichée et les autres écrans reviennent à Mon salon.

La 8e étape dit « 1 semaine a passé. Ouvre ton tableau de bord. » Si toutes les invitations ont été annulées depuis l'étape 5, elle dit « Invite d'abord un coiffeur depuis Équipe. » et n'a pas de bouton de saut tant qu'aucun coiffeur n'est invité. Le bouton disparaît aussi une fois le saut fait. Avant son saut, le tableau de bord dit seulement « Les chiffres arrivent après tes 1ers clients. » Le saut « 1 semaine plus tard » fait accepter son invitation au coiffeur invité (Antoine dans la suite) et remplit 7 jours d'historique, inventé pour la démo (la simulation ne fait pas tourner 7 jours). Le tableau de bord montre alors les 7 derniers jours, du lundi 16 au dimanche 22 novembre : l'attente moyenne du salon (18 min) et ses clients servis (142), l'attente moyenne de chaque jour en barres, avec « Fermé » pour les jours où le salon est fermé, puis l'attente moyenne et les clients servis de chaque coiffeur qui a des chiffres dans l'historique : Samuelle (si Samuelle coiffait pendant la semaine) et Antoine. Les totaux sont la somme des coiffeurs listés. Les chiffres passés ne changent pas quand un planning change : si Samuelle coupe « Je coiffe aussi » après le saut, ses chiffres restent. Aucune note d'avis : pendant le pilote, personne ne voit les notes. Une mention dit que « 6 tickets clôturés sur incident mardi ne sont pas comptés. » Le bloc « À traiter » liste « 2 prestations proposées par ton équipe », un lien qui ouvre l'écran Prestations, et « Planning d'Antoine à figer », un lien qui ouvre son planning. Chaque ligne disparaît une fois traitée, et le bloc aussi quand il n'y a plus rien. L'étape finit quand le saut est fait et le tableau de bord affiché.

Au même saut, Antoine envoie son planning : le mercredi de 09:00 à 19:00 et le samedi de 09:00 à 18:00, au 1er poste, avec les pauses par défaut. Son planning est « À figer ». L'écran Plannings montre 1 carte par coiffeur : celle de Samuelle (si Samuelle coiffe) renvoie vers Ton planning, où Retour ramène alors à Plannings ; celle d'Antoine donne l'état de son planning (« À figer », « Figé » ou « Ouvert à la modification »), ses heures prévues par rapport à son volume horaire (« 16 h sur 35 h », rien pour un indépendant) et ses alertes ; un coiffeur encore invité est « En attente d'inscription », sans planning. Toucher la carte d'Antoine ouvre son planning : sa semaine, que le gérant corrige avec le même éditeur que Ton planning (heures d'ouverture, poste avec 2 postes), « Enregistrer », et l'interrupteur « Planning figé », qui enregistre la semaine de l'écran et la fige, ou la rouvre. Une fois figé, « Rouvrir et prévenir Antoine » le passe à « Ouvert à la modification » et affiche « Lien envoyé à Antoine » (simulé). 2 coiffeurs sur le même poste, le même jour, à des horaires qui se chevauchent bloquent l'enregistrement et le figement : « Le samedi, Antoine et toi êtes sur Fauteuil vitrine de 09:00 à 18:00 : 1 seul coiffeur à la fois sur un poste. » Un relais sans chevauchement passe (09:00 à 13:00, puis 14:00 à 19:00) ; les pauses n'annulent pas un chevauchement. Ce chevauchement-là s'affiche dès l'ouverture, les autres erreurs après une 1re action. Un planning qui dépasse le volume horaire d'un salarié donne un avertissement, sans bloquer : « 37 h 30 prévues pour 35 h ».

La 9e étape demande d'ouvrir le planning d'Antoine, depuis Plannings ou « À traiter ». La 10e demande de retirer son samedi, qui chevauche celui de Samuelle sur le même poste, et tout autre jour signalé, puis de figer son planning : elle finit quand il est figé, sans le samedi.

Au même saut, Antoine propose 2 prestations absentes du catalogue WaitAway : « Contour de barbe au fil » (barbe, 20 min) et « Coloration de barbe » (barbe, 30 min). L'écran Prestations les montre en tête, dans « Proposées par ton équipe » : 1 carte par proposition, avec son icône, son nom, sa durée, « Proposée par Antoine » et les boutons « Refuser » et « Valider ». « Valider » fait entrer la prestation dans le catalogue du salon, comme une prestation créée par le gérant : cochée dans son bloc, avec la durée proposée, réglable ensuite comme les autres. « Refuser » ouvre un panneau avec « Dis à Antoine pourquoi (facultatif) » et « Refuser la proposition ». Valider est grisé si le nom est déjà dans la liste de l'écran, avec « Déjà dans ton catalogue : refuse-la. ». Une carte traitée est remplacée sur place par une ligne de confirmation, sans bouton (« « Contour de barbe au fil » ajoutée à ton catalogue. » ou « « Coloration de barbe » refusée. »), jusqu'à la sortie de l'écran. La section disparaît en revenant sur l'écran quand tout est traité. Ouvert depuis « À traiter », l'écran Prestations met Tableau de bord en avant dans le menu, et Retour comme « Enregistrer » ramènent au tableau de bord. Le planning d'Antoine ouvert depuis « À traiter » fait pareil : Tableau de bord en avant, Retour vers le tableau de bord. La 11e étape suggère de valider « Contour de barbe au fil » et de refuser « Coloration de barbe » : elle finit quand plus aucune proposition n'est en attente, quel que soit le choix. Elle saute si les 2 ont déjà été traitées pendant les étapes 8 à 10.

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
| Gérant | Bienvenue après l'achat : compte, salon et abonnement repris du site, 6 étapes de la configuration | E3-0, E3-1 |
| Gérant | Heures d'ouverture du salon : jours ouverts ou fermés, 1 ou 2 plages par jour, copie sur les jours ouverts | E3-1 |
| Gérant | Postes du salon : 1 par file de l'abonnement, à nommer. Un poste de plus demande 1 file de plus | E3-1 |
| Gérant | Prestations du salon : catalogue WaitAway à cocher, prestations créées, durée indicative, validées d'office | E6-1 |
| Gérant | Prestations proposées par l'équipe : validées dans le catalogue du salon, ou refusées avec un message facultatif | E6-1 |
| Gérant | Équipe du salon : invitation par lien d'inscription, rôle, statut salarié avec volume horaire ou indépendant | E3-2, E6-13 |
| Gérant | Planning du gérant qui coiffe aussi : jours, horaires et pauses dans les heures d'ouverture, poste du jour, total d'heures de la semaine | E6-5 |
| Gérant | QR codes : affiche de l'entrée (QR Boutique) et 1 affiche par poste (QR File/Station), impression simulée, fin de la configuration | E3-3 |
| Gérant | Commande payante d'une affiche imprimée ou d'un kakemono, renvoyée vers le site de WaitAway (simulation) | E3-7 |
| Gérant | Tableau de bord : attente moyenne et clients servis du salon et de chaque coiffeur sur les 7 derniers jours, attente par jour, tickets d'incident exclus. Menu Tableau de bord, Équipe, Mon salon, Plannings après la configuration | E3-5 |
| Gérant | Plannings de l'équipe : état, heures par rapport au volume horaire, planning d'un coiffeur corrigé, figé ou rouvert, chevauchement sur 1 poste refusé | E6-13, E6-14, E6-15 |

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
| Configuration du salon par le gérant | Compte et salon créés à l'achat sur le site, puis 6 étapes : heures d'ouverture, postes, prestations, équipe, planning, QR codes | Stories E3-0 (achat), E3-1 (configuration du Store), E3-6 (fermetures exceptionnelles), E6-13 à E6-15 (volume horaire, planning, relais sur 1 file), ajoutées le 18/11. Aucun ticket Notion encore |
| Heures d'ouverture du salon | Enregistrées par le gérant. Elles limitent son propre planning, pas celui du coiffeur des autres scénarios. Un planning déjà enregistré n'est pas revérifié si les heures changent | Le planning de chaque agent tient dans les heures d'ouverture du Store (E6-5) |
| Catalogue du salon | Enregistré par le gérant, sans effet sur les scénarios coiffeur et client, où le coiffeur choisit toujours dans le catalogue WaitAway | Les agents choisissent dans le catalogue du Store (E6-1) |
| Prestations proposées par l'équipe | Seul le 1er coiffeur invité en propose, 2 figées dans `src/sim/data.ts`, au saut « 1 semaine plus tard ». Le côté coiffeur (proposer une prestation) n'est relié à aucun scénario coiffeur. Le message de refus n'est transmis à personne | L'agent propose une prestation, le gérant la valide ou la refuse (E6-1) |
| Équipe du salon | Invitation en attente (celle d’Antoine est acceptée au saut « 1 semaine plus tard »), lien fictif réutilisable. Le rôle ne change aucun droit | Lien d'inscription à usage unique (E3-2), droits par rôle (E5-2) |
| Plannings de l'équipe | Seul le 1er coiffeur invité envoie un planning, figé dans `src/sim/data.ts`. Le lien envoyé à la réouverture est simulé. Le côté coiffeur (planning figé qu'il ne peut plus modifier) n'est relié à aucun scénario coiffeur. Pas d'avertissement d'heures pour le gérant | Le gérant fige, corrige et rouvre le planning d'un agent (E6-14). Avertissement quand le planning dépasse le volume horaire (E6-13). 1 seul agent à la fois sur une file (E6-15) |
| QR codes du salon | QR codes factices, impression simulée : un panneau la confirme, aucune fenêtre d'impression ne s'ouvre | Le gérant génère et imprime lui-même le QR Boutique et les QR File/Station, gratuitement (E3-3) |
| Tableau de bord du gérant | Historique de 7 jours inventé (`WEEK_HISTORY` dans `src/sim/data.ts`), qui ne vient pas de la simulation. Clients servis en plus de l'attente. Les prestations proposées dans « À traiter » viennent du saut « 1 semaine plus tard » | Attente moyenne du Store et de chaque agent sur 7 jours, sans les tickets d'un incident (E3-5) |
| Achat d'une file de plus | Simulé dans l'application, depuis l'écran Postes : 1 toucher ajoute la file et le poste. Possible seulement pendant la configuration | Sur le site de WaitAway, pas dans l'application (E3-0) |

Les 13 coupes et leurs descriptions viennent de [barberconcept.ch](https://barberconcept.ch/blog/choisir-son-style-coiffure-homme), réécrites. Les durées sont choisies pour la démo. Les icônes sont dessinées pour la maquette (`src/ui/icons.tsx`) ; `exemple/` (hors git) garde les images qui ont servi de modèle de style.

## Arborescence

```
src/
├── sim/        # simulation : types, catalogue, moteur (règles), scénarios, store React
├── client/     # écrans du client
├── agent/      # écrans du coiffeur (agent)
├── manager/    # écrans du gérant
├── ui/         # icônes, scan simulé, roulette, notifications, panneaux
├── App.tsx     # page d'accueil, barre de démo, bandeau guide, le téléphone du scénario
└── styles.css  # tokens (couleurs, typo, rayons) puis composants
```
