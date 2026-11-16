# 2026-11-16 : Reprise de pause par scan, retard du coiffeur, clients du soir, confirmation des walk-in et fermeture de fin de journée

## Prochaines étapes

> 1. Tester la démo dans le navigateur (`npm run dev`), scénario « Coiffeur : ma journée » relancé par le menu ⋯. Rien de cette session n'a été vu dans un navigateur : tout a été vérifié par des scripts Node hors navigateur et par `npm run build`.
> 2. Vérifier en particulier : le ralenti à 1 minute toutes les 5 secondes après la fin d'une pause non reprise, le panneau « Prévenir d'un retard », la fermeture « Fermer ma file : imprévu » et son message de fin de scénario, le bouton « Il est au salon : confirmer » sur un walk-in non confirmé, la fermeture de fin de journée depuis l'application (sans scan), le saut « Aller à 5 min de la fin de la dernière prestation » et la notification « Plus personne n'attend », et la mise en page à 360 px de large.
> 3. Montrer la démo à Gabi pour qu'il juge si la confirmation des walk-in par le coiffeur (QA-27, règle 12) lui demande trop d'actions. C'est la question laissée ouverte.
> 4. La notification « Plus personne n'attend » envoyée au coiffeur en fin de journée n'est pas dans QA-28 (« Fermer sa file »). Gabi ne sait pas encore s'il faut l'y ajouter : elle reste notée comme écart dans `src/sim/engine.ts` (`closeDue`) et dans le tableau « Écarts avec le backlog » du README. Ne pas l'ajouter sans son accord.
> 5. Plus tard, à la demande de Gabi : décider si une fermeture automatique à minuit (coiffeur qui a oublié ou n'a pas pu fermer) compte comme un incident. La question est notée dans QA-28 (Notion) et dans `09-BACKLOG.md`.
> 6. Le travail est commité sur `dev`, sans push. Ne pas merger sur `main` sans l'accord explicite de Gabi pour ce merge.
> 7. Questions ouvertes dans Notion, à trancher avec Gabi : nom de la notification de fin de pause (QA-31) ; événement envoyé aux clients et limite du retard annoncé (QA-32) ; motif affiché et jalon de l'incident (QA-33).

---

## Ticket actif

- QA-31 : Reprendre sa file après une pause en scannant le QR File/Station (E6-7, statut Idée, 3 h).
- QA-32 : Annoncer un retard au retour de pause (E6-7, statut Idée, 3 h).
- QA-33 : Clôturer sa file sur incident (E6-9, statut Idée, 4 h).
- QA-27 : Inscrire un walk-in par un ticket anonyme (E3-4, statut Backlog), règles 1, 11 et 12 modifiées ou ajoutées.
- Tous dans la base Notion « QueueAPI Tickets » (data source `collection://9369f4f2-31d5-445b-b54d-bd07a46c5cb1`).

## Objectif

- Obliger le coiffeur à scanner le QR code de son poste pour reprendre sa file après chacune des 3 pauses, et empêcher tout client de démarrer avant ce scan.
- Montrer le retard du coiffeur au retour de pause : notification « Ta pause est finie », temps ralenti, puis choix entre reprendre, annoncer un retard en minutes ou fermer sa file sur imprévu.
- Avoir des clients le soir pour que la demande du téléphone client arrive chez le coiffeur quelle que soit la fin de journée choisie (20h00, 21h00, 22h00, 23h00).
- Faire repasser les walk-in par la confirmation de présence au lieu d'être confirmés d'office.
- Reporter chaque nouvelle règle dans le backlog, les scénarios, le glossaire et Notion.

## Tentatives échouées

- 1re version : le temps s'arrêtait net à la fin de la pause. Abandonnée, parce qu'un temps arrêté empêche de montrer le retard du coiffeur, qui était justement le but. Remplacée par un ralenti (5 s par minute) jusqu'à la décision du coiffeur.
- Reprise avant l'heure qui faisait sauter l'heure simulée à la fin prévue de la pause : abandonnée à la demande de Gabi. Maintenant la pause s'arrête à l'heure du scan, et le client confirmé gagne le temps restant.
- Démarrage du client dans la même minute que le scan de reprise : remplacé par un délai de 2 min (`RESUME_DELAY` dans `src/sim/engine.ts`), plus crédible. C'est toujours le client qui démarre en scannant le poste (S5), jamais l'agent.
- L'étape du guide « Tu déjeunes. Théo est le 1er à la reprise » exigeait que Théo soit 1er à la reprise de midi. Après un retard annoncé le matin, la pause de midi passe avant Léo et le saut tournait en boucle (720 min, l'heure revenait à 00:22). Remplacée par une étape « Aller au tour de Théo » qui attend que Théo soit en position 1, poste libre.

## Tentatives réussies

- `src/sim/engine.ts` : une pause ne finit que par le scan de l'agent (`pauseOverdue`, action `resume`). `canStart` refuse un client tant que la pause n'est pas reprise, avec le message « … n'a pas encore repris sa file ».
- `src/sim/engine.ts` : notification « Ta pause est finie » à la fin de la pause, et sélecteur `agentLate` qui sert à ralentir le temps. Quand personne ne joue le coiffeur (scénario client), la pause finit seule à l'heure.
- `src/sim/engine.ts` : action `declareDelay`. La reprise passe à max(maintenant, fin prévue) + retard, stocké dans `Pause.delay`. Le téléphone client est prévenu, et la notification revient à la nouvelle heure si le coiffeur n'a toujours pas scanné.
- `src/sim/engine.ts` : action `incidentClose`. Tous les tickets en attente partent avec `abortReason: 'incident'`, la file se ferme et `QueueFile.incident` passe à vrai.
- `src/sim/store.tsx` : le temps avance d'1 minute toutes les 5 s au lieu de 2 s tant que `agentLate` est vrai. La clé de sauvegarde passe à `waitaway-demo-v3`.
- `src/agent/Queue.tsx` : la carte de pause affiche « X min de retard » et 3 boutons (« Scanner pour reprendre », « Prévenir d'un retard », « Fermer ma file : imprévu »). Nouveaux panneaux `DelaySheet` (roue de 5 à 120 min) et `IncidentSheet`.
- `src/client/ClientApp.tsx` : écran « … a dû fermer sa file » pour un ticket parti sur incident.
- `src/sim/scenarios.ts` et `src/App.tsx` : sauts « Aller à 5 min de la fin de la pause » pour les 3 pauses, étapes de reprise, étape « Noah te voit revenir », et fin propre du scénario après une fermeture sur imprévu, avec le message « Ta file est fermée sur imprévu… ».
- `src/sim/scenarios.ts` et `src/sim/types.ts` : clients du soir avec le champ `Arrival.minEnd`. Victor et Baptiste si la fin est à 21h00 ou plus tard, Clément et Valentin à 22h00 ou plus tard, Martin et Alexandre à 23h00.
- Prénoms à connotation maghrébine remplacés partout, à la demande de Gabi : Karim Benali → Antoine Lefèvre, Samir Haddad → Romain Girard, Yanis → Louis, Rayan → Jules, Malik → Arthur, Mehdi → Maxime, Sami → Paul, Ilyes → Tom. `AGENT_FILE_ID` passe de `'karim'` à `'agent'`, et les fonctions `karim()` et `karimFile()` deviennent `agentQueue()` et `agentQueueFile()`.
- `src/sim/engine.ts` et `src/agent/Queue.tsx` : un walk-in n'est confirmé d'office que si son tour est dans moins de 10 min. Sinon il est « En route », et le coiffeur le confirme par « Il est au salon : confirmer » (action `agentConfirm`), dans le panneau du ticket ou dans la pop-up de retard. Un walk-in qui rattache son ticket dans l'application perd sa confirmation si son tour est dans 10 min ou plus.
- `src/agent/Queue.tsx` : la fermeture de fin de journée se fait directement depuis le panneau « Fermer ma file », sans scan. Un scan a d'abord été ajouté, puis retiré sur décision de Gabi : en cas de problème, le coiffeur doit pouvoir fermer depuis son téléphone, même loin de son poste.
- QA-28 (Notion), `09-BACKLOG.md` et le scénario S43 de `03-SCENARIOS.md` : la fermeture se fait depuis l'application, sans scan. Question ajoutée pour plus tard : une fermeture automatique à minuit compte-t-elle comme un incident ?
- `src/sim/engine.ts` et `src/sim/scenarios.ts` : nouveau saut « Aller à 5 min de la fin de la dernière prestation », après lequel le temps repart. Quand la fin de journée est passée et que plus personne n'est en service ni en attente, le coiffeur reçoit « Plus personne n'attend » et le temps s'arrête (`closeDue`, `QueueFile.closeHintAt`). Gabi avait signalé qu'après sa décision sur le dernier client accepté il ne pouvait pas fermer sa file lui-même.
- `README.md` : mode d'emploi mis à jour (reprise par scan, ralenti, heures du tableau, fins de journée tardives, walk-in).
- Notion : tickets QA-31, QA-32 et QA-33 créés ; 2 options ajoutées à la propriété `US` (« E6-7 · Agent prend sa pause », « E6-9 · Clôture sur incident ») ; QA-27 modifié (règle 1 réécrite, règles 11 et 12 ajoutées).
- `../queuAPI/queueapi/docs/` : section « 5 ter » ajoutée à `09-BACKLOG.md` avec la règle 11 et 12 de QA-27, scénario S44 complété dans `03-SCENARIOS.md`, terme « Retard de l'agent » ajouté dans `02-GLOSSAIRE.md`, section 9.
- Vérifications : `npm run build` passe. Scripts Node hors navigateur, rangés dans le scratchpad de la session (perdus) : la journée a été rejouée avec 3 parcours (reprise immédiate, retard de 10 min annoncé, fermeture sur imprévu) et 5 fins de journée (19h00 à 23h00). Dans les 5 cas, la demande de 40 min du téléphone client est refusée d'office à 19h00 et arrive chez le coiffeur à 20h00 et plus tard. La fin de journée a aussi été rejouée dans 4 cas (fin à 19h00 ou 20h00, accepter ou refuser le dernier client) : le saut s'arrête 5 min avant la fin, la notification arrive, puis la fermeture termine le scénario. Gabi a testé dans le navigateur la journée avec 2 clients acceptés après 19h00 (fin à 19h41) : les 2 notifications sont bien arrivées. Le reste n'a pas été vu dans un navigateur.

## Enseignements

- Les fichiers de `../queuAPI/queueapi/docs/` (backlog, scénarios, glossaire) sont exclus de git par le `.gitignore` de QueueAPI (ligne 3, motif `*`). Les modifier ne laisse aucune trace dans un diff : seule la copie locale change. Vérifié avec `git check-ignore -v`.
- Une arrivée du scénario réglée par `beforeEnd` dépend de la fin de journée choisie à l'ouverture. Lucas (`beforeEnd: 40`) arrive à 18h20 si la fin est à 19h00, et à 19h20 si elle est à 20h00 : il s'inscrit alors normalement et son étape du guide saute. Les clients du soir utilisent donc une heure fixe et `minEnd`.
- Le scan du QR code du poste sert à prouver que le coiffeur est à son poste : il est obligatoire pour ouvrir sa file et pour reprendre après une pause, mais pas pour fermer. Décision de Gabi du 16/11, écrite dans QA-28 et S43.
- La règle de l'inscription après la fermeture regarde l'heure de fin de la prestation, pas son début : jusqu'à fin de journée + 30 min, le coiffeur choisit, au-delà c'est un refus d'office (QA-30). Gabi a confirmé qu'on garde cette règle.
- La limite des 10 min de S38 (confirmation à l'inscription) s'applique aussi aux walk-in, au moment de la création comme au moment du rattachement. Sans elle, retirer la confirmation d'un walk-in dont le tour est imminent ouvrirait aussitôt la pop-up de retard chez le coiffeur pour quelqu'un qui est devant lui.
- Le scénario « ma journée » est sensible à l'ordre de la file : un retard du coiffeur décale les pauses suivantes, et la place d'une pause est figée une fois choisie (`beforeTicketId`). Une condition `until` qui suppose un ordre précis (« Théo est le 1er ») casse dès que le coiffeur prend du retard. Il faut écrire des conditions qui attendent un état (position 1, poste libre), pas un ordre supposé.
