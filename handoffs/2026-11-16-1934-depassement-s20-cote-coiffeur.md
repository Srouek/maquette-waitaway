# 2026-11-16 : Dépassement S20 côté coiffeur (lot 2) et test de « ma journée » dans le navigateur

## Prochaines étapes

> 1. Commiter le lot 2 de S20 sur `dev`. Il n'est pas commité, parce que ses fichiers sont mélangés avec le travail de la session « Scenario Client (user) » (scénario client à 8 coiffeurs, lot 1 de S20 dans `src/sim/engine.ts`). Le lot 2 appelle des fonctions du lot 1 (`serviceEnd`, `overrunTargets`, `durationSuggestions`, actions `announceOverrun` et `applySuggestion`) : un commit du lot 2 seul ne compile pas. Voir avec Gabi l'ordre des commits entre les 2 sessions.
> 2. Vérifier la mise en page à 360 px de large : le panneau « Annoncer un retard », la carte du client en cours avec « +N min de retard », la suggestion sur l'écran « Ta file est fermée » et à la 1re page de l'ouverture. Chrome a refusé de réduire la fenêtre à 375 px pendant le test.
> 3. Côté client (périmètre de l'autre session) : après le refus d'office de Romain avec une fin de journée à 19h00, l'écran de choix affiche « Durée 0 min » et « Ton tour vers 19:29 » sans prestation choisie. À signaler ou corriger.
> 4. Ne pas merger sur `main` sans l'accord explicite de Gabi pour ce merge.

---

## Ticket actif

- S20 : Dépassement d'une prestation, lot 2 (côté coiffeur), décrit dans `/Users/srouek/.claude/plans/typed-mixing-fiddle.md`.
- Le lot 1 (côté moteur et client) est fait par la session « Scenario Client (user) ».

## Objectif

- Permettre au coiffeur d'annoncer un retard en 1 geste depuis la carte du client en cours.
- Montrer la suggestion « Ton dégradé a dépassé 2 fois aujourd'hui. Passer de 30 à 35 min ? » après la fermeture et à l'ouverture suivante.
- Intégrer les 2 dépassements (Louis, Léo) au scénario « Coiffeur : ma journée ».
- Tester le scénario dans le navigateur, à la demande de Gabi.

## Tentatives échouées

- L'étape du guide « Léo veut un dégradé avec un motif… annonce un retard » n'existait qu'avant la pause de midi. Dans le navigateur, 4 min de retard au retour de la pause du matin, plus 6 min de temps qui tourne, ont suffi pour que la pause de midi passe avant Léo : l'étape sautait. Remplacé par une 2e occurrence de l'étape après la reprise de midi.
- 1re version du texte de cette 2e occurrence : « Léo te voit revenir : il scanne le QR du poste dans 2 min ». Faux avec 25 min de retard le matin : Léo n'est alors pas le 1er à la reprise, il démarre à 13h41 pour une reprise à 13h09. Texte remplacé par « Léo passe bientôt : sa prestation sera plus longue que prévu ».

## Tentatives réussies

- `src/agent/Queue.tsx` : bouton « Annoncer un retard » dans le panneau du client en cours, et panneau `OverrunSheet` (roue de minutes, 10 par défaut, fin estimée, nombre de clients prévenus).
- `src/agent/Queue.tsx` : la carte du client en cours affiche « +N min de retard, fin estimée vers HH:MM », et sa barre de progression compte le retard.
- `src/agent/Queue.tsx`, `src/agent/AgentApp.tsx`, `src/agent/OpenWizard.tsx` : composant `DurationSuggestions`, affiché sur l'écran « Ta file est fermée » et à la 1re page de l'ouverture.
- `src/sim/engine.ts` : `remainingRaw` compte le retard annoncé. Avant, la carte de Léo affichait « encore 21 min » alors que la fin annoncée était 31 min plus tard (14h17).
- `src/sim/types.ts` et `src/sim/engine.ts` : champ de simulation `extra` sur `Arrival` et `Ticket`, pour qu'un client du scénario dure plus longtemps que prévu.
- `src/sim/scenarios.ts` : Louis dure 7 min de plus (retard constaté seul à 9h50) et Léo 10 min de plus (le guide arrête le temps et demande d'annoncer le retard). Dernière étape : répondre à la suggestion.
- `src/sim/scenarios.ts` : 2 étapes après la reprise de midi (« Léo passe bientôt », puis l'annonce), qui sautent quand le retard de Léo est déjà annoncé ou constaté. Fonctions `leoHandled`, `announceLeo` et `startedAfterResume`.
- `src/sim/scenarios.ts` : « Noah te voit revenir » devient « Le client confirmé te voit revenir… », et saute quand personne de confirmé n'attend à la reprise de l'après-midi. Le guide passe de 35 à 37 étapes.
- `README.md` : tableau de « ma journée » recalé (pause du matin 10h17, Léo 12h14, pause de midi 12h54, Théo 13h49, ligne « Après la fermeture ») et ligne S20 dans le tableau des fonctions.
- Test dans Chrome (sur 127.0.0.1:5173) de toute la journée avec une fin à 19h00 : ralenti à 1 min toutes les 5 s, « Prévenir d'un retard », annonce du retard de Léo, walk-in, refus d'office de Romain, notification « Plus personne n'attend », fermeture, suggestion acceptée (dégradé 30 → 35 min).
- Rejeu hors navigateur, après la refonte du moteur par l'autre session : 7 cas (à l'heure, 10 min ou 25 min de retard le matin, fins de journée 19h00, 20h00, 23h00). Les 37 étapes se valident dans les 7 cas, le retard de Léo est annoncé à chaque fois, et `npm run build` passe.

## Enseignements

- Tester dans le navigateur sur `127.0.0.1:5173` au lieu de `localhost:5173` donne un `localStorage` séparé : le test n'écrase pas l'état de la démo ouverte par Gabi ou par une autre session.
- Une étape du guide qui dépend de l'ordre de la file casse dès que le coiffeur prend 10 à 15 min de retard, ce qui arrive en démo dès qu'on laisse filer une fin de pause. Il faut soit 2 occurrences de l'étape (avant et après la pause), soit une condition sur un état (« un client a démarré après la reprise ») plutôt que sur un prénom.
- Le script de rejeu `jour.ts` est dans le scratchpad de la session, il sera perdu. Il simule les gestes du coiffeur étape par étape avec `guideReducer` et prend un mode (A à l'heure, B 10 min de retard, C 25 min) et une heure de fin en arguments.
