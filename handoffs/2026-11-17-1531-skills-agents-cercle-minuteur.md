# 2026-11-17 : Skills et agents du projet, rejeu des scénarios et cercle minuteur du ticket client

## Prochaines étapes

> 1. Pousser `dev` seulement si Gabi le demande (`gp`). Le merge vers `main` publie le site et demande son accord explicite, donné pour ce merge-là.
> 2. Si Gabi veut reprendre les points laissés ouverts sur le ticket client, ils sont listés dans « Enseignements » (rappel de 40 min ou plus, talon sur 2 lignes, panneau « C'est bientôt à toi » dès 10 min). Gabi les a jugés non capitaux : ne rien corriger sans sa demande.
> 3. Le futur scénario « le coiffeur propose au client de venir plus tôt » doit remplacer le cas Thomas « Le tour avance », mis en commentaire dans `src/sim/salon.ts`. À écrire avec le skill `write-scenario` quand Gabi le demande.
> 4. Pour tout nouveau changement, passer par les skills du projet : `write-scenario` ou `write-code`, puis `review-code` et `check-in-browser`, qui rendent les rapports des agents tels quels.

---

## Ticket actif

- Pas de ticket Notion pour cette session.
- Travail fait directement sur la branche `dev`.

## Objectif

- Créer les skills et agents de la maquette sur le modèle de QueueAPI, pour 4 tâches : développer, tester les scénarios, vérifier dans Chrome, écrire des scénarios du guide.
- Permettre à Gabi de valider un scénario, de laisser `code-writer` le coder sans surveillance, puis de ne faire sa revue qu'après `code-reviewer`.
- Intégrer le cercle minuteur du ticket client, d'après `exemple/maquette-cercle-minuteur.png` (image hors git).

## Tentatives échouées

- Un canSkip ajouté sur l'étape 19 de « ma journée » pour le cas « Théo retiré sans walk-in » a été retiré : Gabi a expliqué que, dans un salon, un Théo non remplacé par un walk-in sera presque toujours atteint par le coiffeur. La bonne correction était la condition `until` de l'étape 19 (`takenForTheo` dans `src/sim/scenarios.ts`).
- Les GIF de `browser-checker` restent introuvables sur le disque, 2 fois de suite : l'outil dit les avoir exportés, mais ni `~/Downloads`, ni `mdfind`, ni une recherche dans tout le dossier personnel ne les trouvent. Chrome bloque probablement le téléchargement. Ne pas compter sur ces GIF tant que le réglage de Chrome n'est pas vérifié.

## Tentatives réussies

- Ajout du rejeu hors navigateur des 3 scénarios (`scripts/replay.ts`, `npm run replay`) : il signale les étapes bloquées et les étapes sautées sans `canSkip`. Il couvre 208 cas depuis le retrait de Thomas : 200 configurations de « ma journée », les 7 coiffeurs du scénario client et 1 création de compte (209 avant ce retrait, et non 208 comme annoncé jusque-là).
- Ajout de `scripts/viewport.html`, qui affiche la maquette dans une iframe de largeur fixe (`?w=360` ou `?w=1024`), et de `tsconfig.scripts.json`, pour que `npm run build` vérifie les types de `scripts/`.
- Ajout du champ `canSkip` aux étapes du guide et marquage des sauts voulus (Léo, 2e alerte de Théo, Lucas, Romain, fin des cas Julien, Thomas, Nicolas, Damien).
- Correction de l'étape 19 « Regarde les heures de la file » : elle s'affiche maintenant quand le coiffeur retire Théo avec le walk-in.
- Passage des boutons de la barre de démo et du guide à 48 px dans `src/styles.css`.
- Création des skills `test-scenarios`, `check-in-browser`, `review-code`, `write-code`, `write-scenario` et des agents `browser-checker`, `code-reviewer`, `code-writer` dans `.claude/`.
- Renommage du dossier `icon_exemple/` en `exemple/` dans `.gitignore`, `README.md` et `src/ui/icons.tsx`.
- Ticket client refait en cercle minuteur : `CountdownRing` dans `src/ui/kit.tsx`, `TicketCard` dans `src/client/parts.tsx`, et la page du compte (`Waiting`, `src/client/Account.tsx`) qui affiche ce ticket à la place de l'ancienne carte.
- Ajout du champ `Ticket.joinWait` (attente à l'inscription, qui donne le cercle plein), des fonctions `waitPhase` et `waitRatio` dans `src/sim/engine.ts`, et passage de la clé de sauvegarde à `waitaway-demo-v8` dans `src/sim/store.tsx`.
- Phases du ticket décidées par Gabi : plus de 35 min « Tu as le temps » (corail, `--oxblood-light`), de 35 à 11 min « Mets-toi en route » (laiton), de 10 à 6 min « Ton tour arrive » (laiton), 5 min et moins « Tu es le prochain » (vert, `--mint-light`). Un client confirmé avec plus de 10 min d'attente lit « Patiente au salon ».
- Mise en commentaire du cas client Thomas « Le tour avance » dans `src/sim/salon.ts`, et passage de 8 à 7 coiffeurs dans `scenarios.ts`, `README.md` et `CLAUDE.md`.
- État final : `npm run build` passe, `npm run replay` affiche « Tout passe. ».

## Enseignements

- Sur le terrain, Gabi a raison contre une hypothèse de « vrai salon » faite par Claude : ne pas opposer un fonctionnement supposé d'un salon à son expérience. Exemple : un client retiré sans walk-in sera atteint par le coiffeur.
- Le cas « Le tour avance » est retiré parce qu'une attente qui tombe d'un coup de 60 à 30 min ne sert pas le client : il ne peut pas en profiter s'il n'est pas déjà dans le coin (décision de Gabi). La notification « ton tour avance » reste dans le moteur.
- Revue de `code-reviewer`, défauts laissés ouverts parce que Gabi les a jugés non capitaux :
  - un rappel réglé à 40 min ou plus fait afficher le panneau « Mets-toi en route » sous un ticket « Tu as le temps » (`src/client/Account.tsx:247`) ;
  - « Patiente au salon » est décidé dans l'écran (`src/client/parts.tsx:59`) au lieu de `waitPhase` ;
  - `waitFor` est calculé 2 fois dans `claim` (`src/sim/engine.ts:849`).
- Vérification dans Chrome, points laissés ouverts :
  - le talon du ticket passe sur 2 lignes avec des noms de prestation longs (« Dégradé / fade + Taille de barbe express »), parce que `ticketLabel()` joint les noms complets ;
  - le panneau « C'est bientôt à toi » apparaît dès 10 min, alors que le ticket dit encore « Ton tour arrive » : sa condition `soon` dépend de `START_GUARD`, pas de la phase.
- Dans le scénario client, « Patiente au salon » ne s'atteint qu'avec Damien (place acceptée après la fermeture, 28 min d'attente) : un scan normal n'est accepté qu'à 10 min (vérifié par `browser-checker`).
- Dans Chrome, tester sur `127.0.0.1:5173` et pas sur `localhost` : les 2 adresses ont des `localStorage` séparés. `resize_window` ne réduit pas la fenêtre, d'où `scripts/viewport.html`.
