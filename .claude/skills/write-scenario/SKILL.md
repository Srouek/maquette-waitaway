---
name: write-scenario
description: Écrit avec Gabi les étapes d'un scénario du guide (nouveau scénario, nouveau cas client ou étapes ajoutées), les lui fait valider, puis fait coder le tout par l'agent code-writer sans toucher aux étapes validées. Utiliser quand l'utilisateur veut créer ou changer un scénario de démo, par exemple "ajoute un scénario", "nouveau cas client", "ajoute une étape au guide", "montre X dans la journée du coiffeur".
---

## Entrée

- L'**idée de Gabi** : ce que le scénario doit montrer, à qui (coiffeur ou client), et dans quel scénario existant ou nouveau.

## Sortie

- Les **étapes validées par Gabi**, dans un tableau : consigne, saut ou geste, condition de fin, sauts autorisés.
- Le **code** qui les fait tourner, par l'agent `code-writer`, sans commit.
- Les **chiffres de vérification** (`npm run build`, `npm run replay`), la **revue** de `code-reviewer` et le **résultat** de `browser-checker`, rendus tels quels.

---

## Comment faire

1. **Situer le scénario.** Lire `src/sim/scenarios.ts`, `src/sim/salon.ts` et la section « Les 3 scénarios » du `README.md`. Il y a 3 cas :
   - **étapes ajoutées** à « ma journée » ou à « je crée mon compte » : `SCENARIOS` dans `scenarios.ts`, et les arrivées de `JOURNEE` ;
   - **nouveau cas client** : un coiffeur de plus dans `BARBERS` de `salon.ts`, avec ses clients déjà là et ses gestes prévus (`events`) ;
   - **nouveau scénario** : `ScenarioId` dans `types.ts`, `SCENARIOS`, `SCENARIO_LIST` et `buildScenario` dans `scenarios.ts`.

2. **Repérer ce que le moteur ne sait pas encore faire.** Chaque geste ou notification que le scénario montre doit exister dans `src/sim/engine.ts`. Ce qui manque est du code à prévoir dans le plan, avec son passage du backlog.

3. **Écrire les étapes dans un tableau** et le montrer à Gabi :

   | # | Consigne affichée | Saut ou geste | Fin de l'étape | Saut autorisé |
   |---|---|---|---|---|
   | 1 | Louis est inscrit, déjà au salon. | Saut « Louis scanne le QR du poste » | Louis a démarré | non |

   Pour chaque étape :
   - **La fin de l'étape se lit en français** (« Louis a démarré »), pas en code. Elle porte sur un fait précis : un prénom, une heure, un état de ticket.
   - **Elle porte sur un état, pas sur l'ordre de la file.** Une étape qui attend « Théo est le prochain » casse dès que le coiffeur prend 10 min de retard. Si l'ordre compte, prévoir l'étape avant et après la pause concernée.
   - **Elle ne doit pas être déjà vraie quand l'étape arrive**, sinon l'étape ne s'affiche jamais. Chercher les cas où ça arrive : retard du coiffeur le matin, fin de journée de 19h00 à 23h00, choix du coiffeur à une alerte.
   - **Un saut voulu se décide avec Gabi** et s'écrit dans la colonne « Saut autorisé », avec le cas où il se produit. Il deviendra un `canSkip`.
   - **Les clients sont nommés**, avec leur état (en attente, confirmé, en service, hors file).

   Sous le tableau, ajouter les **données du script** : arrivées (prénom, heure, prestations, comportement) et gestes prévus des coiffeurs simulés. Puis le **plan de code** : fichiers touchés, ce que le moteur doit apprendre, écarts au backlog, mise à jour du `README.md` (section du scénario, tableau des heures de « ma journée »).

4. **Attendre la validation de Gabi** sur le tableau, les données et le plan. Ce qu'il valide ne change plus sans lui : c'est ce que le rejeu doit faire passer.

5. **Enchaîner sur le skill `write-code` à partir de son étape 3**, en passant à `code-writer` les étapes validées telles quelles, les données du script et le plan. `write-code` vérifie, lance la revue et Chrome, et s'arrête avant le commit.

6. **Si `code-writer` remonte une étape qui ne passe pas**, la montrer à Gabi avec la cause et une proposition : changer l'étape, la doubler (avant et après une pause), ou autoriser son saut. Ne pas trancher à sa place.

## Règles

- **Pas de code avant la validation du tableau.**
- **Les textes des consignes suivent les règles d'écriture** : nombres en chiffres, pas de tiret cadratin, vocabulaire de salon.
- **Les heures de « ma journée » tiennent aux durées du catalogue et aux pauses par défaut** : une arrivée ajoutée peut décaler toute la journée. Le rejeu le montre, le tableau du `README.md` doit suivre.
