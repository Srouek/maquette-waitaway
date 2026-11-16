# 2026-11-16 : Scénario client refait en 8 coiffeurs, dépassement S20 et questionnaire de satisfaction

## Prochaines étapes

> 1. Tester le scénario client dans le navigateur (`npm run dev`), à 360 px et au-dessus de 900 px. Pour chacun des 8 coiffeurs, suivre le guide jusqu'au bout. Seul le rejeu en script a été fait.
> 2. Vérifier à l'œil l'étiquette sous chaque coiffeur (`.demo-tag`), l'écran d'accueil du walk-in (« Scanner le QR code de mon ticket ») et le questionnaire de fin (5 étoiles, commentaire, « Plus tard »).
> 3. Commiter le travail de la session pro (lot 2 du dépassement), resté non commité : `src/agent/Queue.tsx`, `AgentApp.tsx`, `OpenWizard.tsx`, et ses retouches de `src/sim/engine.ts` (`remainingRaw` compte le retard annoncé, `Arrival.extra` dans `arrive()`), `src/sim/types.ts` (`Arrival.extra`), `src/sim/scenarios.ts` (journée pro) et `README.md` (tableau de « ma journée »). Elle est passée par la passation `2026-11-16-1934-depassement-s20-cote-coiffeur.md`.
> 4. Les docs de QueueAPI (`../queuAPI/queueapi/docs/`) ont été modifiées, mais le `.gitignore` de QueueAPI ignore tout le dossier : rien n'y est versionné. Demander à Gabi si c'est voulu.
> 5. Merger `dev` dans `main` seulement avec l'accord de Gabi pour ce merge-là : chaque push sur `main` publie le site.

---

## Ticket actif

- QA-34 : Questionnaire de satisfaction à la fin de la prestation (Notion « QueueAPI Tickets », statut Backlog, épic à cadrer par Gabi).
- S20 : dépassement et durées (E6-2, E6-4), règle revue le 16/11/2026.

## Objectif

- Remplacer le scénario client unique par 1 cas par coiffeur du salon, vu seulement du point de vue du client.
- Revoir la règle du dépassement (S20) et la noter dans les docs de QueueAPI.
- Ajouter le questionnaire de satisfaction en fin de prestation, et le porter au backlog.

## Tentatives échouées

- Un seul scénario client qui enchaîne désistement, rappel et dépassement chez 1 coiffeur. Gabi l'a refusé : il mélange les cas et raconte la vie des autres clients de la file.
- 1re règle de dépassement : notifier 5 min de retard dès que la fin estimée est atteinte, à tous les clients en attente. Rejetée : fausse alerte si le coiffeur finit 1 min après, notifications inutiles pour les clients lointains ou déjà au salon.

## Tentatives réussies

- `src/sim/salon.ts` (nouveau) : les 8 coiffeurs du scénario client, Antoine (parcours normal), Mathis (premier de la file), Julien (retard du coiffeur), Thomas (le tour avance), Nicolas (client en retard), Damien (après la fermeture), Bruno (imprévu) et Maxence (walk-in), avec leurs files de départ à 9h40, leurs gestes prévus et les étapes du guide.
- Choisir un coiffeur dans l'écran du salon lance son cas (`scenario.branch`). Revenir au salon sans ticket remet le salon à 9h40 : on peut essayer un autre coiffeur sans relancer le scénario.
- Chaque cas va jusqu'à la fin de la prestation, sauf Nicolas et Bruno (ticket retiré) et Mathis s'il quitte la file. Les étapes communes de fin sont écrites 1 fois (`tailSteps()`).
- `src/sim/engine.ts` : gestes des coiffeurs simulés en données (`SimState.agentEvents` : `leave`, `announce`, `incident`, `replaceMine`), déclenchés à une heure ou N min après le tour du client.
- `src/sim/engine.ts` : `closeOnIncident`, `announceOverrun`, `takePresentClient` et `claimTicket` sortis du reducer pour servir à toutes les files. La session pro a rejoué « ma journée » ensuite, 37/37 étapes dans 7 configurations.
- `src/sim/engine.ts` : dépassement selon S20 revue (`watchOverrun`, `overrunTargets`), annonce du coiffeur (`announceOverrun`), décompte par prestation et suggestion (`overruns`, `durationSuggestions`, `applySuggestion`), notification « Ton tour avance » dès 5 min de gain (`watchGain`).
- Walk-in côté client : `me.walkIn`, action `claim`, écran `WalkInHome` dans `src/client/ClientApp.tsx`, mode rattachement de `Choose` et `Signup` dans `src/client/Join.tsx`.
- Questionnaire de satisfaction : `Ticket.rating`, action `rate`, composant `Survey` dans l'écran de fin, dernière étape du guide (`rateStep`).
- `src/App.tsx` : le scénario client n'affiche que le téléphone du client, même au-dessus de 900 px.
- Julie remplacée par Mathis, barbier, avec 6 prestations (`MATHIS_PRESTATIONS` dans `src/sim/data.ts`), aussi dans la journée pro. Le compte Google d'exemple devient Gabriel Rousseau.
- `src/sim/store.tsx` : clé de sauvegarde en `waitaway-demo-v6`.
- `README.md` (tableau des 8 coiffeurs, écarts) et `CLAUDE.md` (arborescence) mis à jour.
- Docs QueueAPI : S20 réécrite (`03-SCENARIOS.md`), `service.overrun` en push vers les clients concernés (`05-CONTRAT-EVENEMENTS.md`), E6-2 et E6-4 renommées et ligne « Épic à cadrer » liée à QA-34 (`09-BACKLOG.md`), décision du 16/11 (`08-ROADMAP.md`), terme « Questionnaire de satisfaction » (`02-GLOSSAIRE.md`).
- Ticket Notion QA-34 créé : objectif, 7 règles, questions ouvertes (qui voit les notes, délai après « Plus tard », RGPD du commentaire).

## Enseignements

- Règle S20 décidée par Gabi le 16/11/2026 : la notification part une fois 5 min de retard constatées, jamais avant, puis toutes les 5 min. Elle ne vise que les clients pas encore confirmés dont le tour est dans moins de 30 min, en push. Le coiffeur peut aussi annoncer un retard en 1 geste. La source de vérité est `../queuAPI/queueapi/docs/03-SCENARIOS.md`, S20.
- Un scénario client ne montre que ce que le client reçoit ou fait dans l'application. Un cas sans parcours dans l'application (ex. file fermée, QA-19) ne se démontre pas avec la maquette (décision de Gabi).
- L'état est sauvegardé en JSON dans le `localStorage` : il ne peut pas contenir de fonctions. C'est pourquoi les gestes des coiffeurs simulés sont des données (`AgentEvent`) et non des callbacks.
- Une étape du guide dont le saut déclenche aussi le rappel peut faire sauter l'étape suivante, si celle-ci attend le rappel. Mettre le texte important sur une étape dont la condition n'est pas encore vraie (cas de Julien, corrigé par le 2e paramètre de `tailSteps()`).
- Avec `autoAgent`, une pause qui arrive pendant un dépassement coupait la prestation en cours (`beginPause` clôt le client en service). Le coiffeur simulé attend maintenant la vraie fin (`busy` dans `observe`).
- `git add -p` n'est pas disponible dans cet environnement. Pour commiter une partie des modifications d'un fichier partagé avec une autre session, écrire la version voulue avec `git hash-object -w`, puis la poser dans l'index avec `git update-index --cacheinfo`. Le fichier de travail reste intact.
