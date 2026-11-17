---
name: write-code
description: Développe un changement de la maquette demandé par Gabi. Explique le plan, le fait coder par l'agent code-writer après accord, vérifie build et rejeu, puis lance la revue et la vérification dans Chrome en parallèle. Utiliser quand l'utilisateur demande une fonction, une correction ou un changement d'écran, par exemple "ajoute ça", "corrige ça", "développe ça", "change l'écran X".
---

## Entrée

- La **demande** de Gabi : une fonction, une correction ou un changement d'écran.
- Les **étapes de scénario validées**, quand le skill `write-scenario` l'appelle.

## Sortie

- Le **code** du changement, sans commit.
- Les **chiffres de vérification** : `npm run build` et `npm run replay`, relancés par le skill lui-même.
- La **revue** de `code-reviewer` et le **résultat** de `browser-checker`, rendus tels quels.
- Les **points à voir par Gabi** : ce que les agents n'ont pas pu trancher, et ce qui reste à regarder à l'écran.

---

## Comment faire

1. **Lire le code concerné** : le moteur (`src/sim/engine.ts`), les écrans touchés, les scénarios si le guide change. Pour une règle métier, lire le passage du backlog. Si la demande contredit le code ou le backlog, s'arrêter et demander à Gabi.

2. **Expliquer avant de coder.** Décrire en prose les fichiers touchés, le changement de comportement pour le coiffeur ou le client, et les écarts au backlog. Attendre l'accord de Gabi.

3. **Choisir qui code.**
   - **Par défaut, l'agent `code-writer`, en tâche de fond**, avec la demande, le plan validé et les étapes validées s'il y en a. Rendre la main à Gabi pendant qu'il tourne.
   - **Directement dans la session** pour un changement de quelques lignes dans 1 seul fichier (un texte, une valeur de style) : l'agent repart de zéro et coûte plus cher que le changement.

   Si le rapport de l'agent remonte un point (plan insuffisant, étape qui ne passe pas, saut qui semble voulu), le transmettre à Gabi sans le trancher.

4. **Vérifier soi-même**, sans se fier au rapport de l'agent : `npm run build`, `npm run replay`, et `git diff` pour voir qu'aucune étape validée n'a changé et qu'aucun `canSkip` n'a été ajouté.

5. **Lancer la revue et la vérification dans Chrome en parallèle**, en tâche de fond : le skill `review-code` (agent `code-reviewer`) et le skill `check-in-browser` (agent `browser-checker`) sur les écrans touchés. Aucun des 2 ne modifie de fichier.

6. **Rendre le résultat** : les fichiers modifiés, les chiffres de vérification, la revue et le tableau de Chrome tels quels, puis les points à voir par Gabi. Ne corriger un défaut de la revue que s'il le demande.

7. **S'arrêter avant le commit.** Gabi regarde le changement à l'écran et décide du commit.

## Règles

- **Pas de code avant l'accord sur le plan**, même pour un changement qui semble évident.
- **Ne pas résumer la revue ni le tableau de Chrome** : leur format appartient aux agents.
- **Ne pas annoncer « ça marche »** sur la foi du rapport d'un agent : seuls les chiffres relancés par le skill comptent.
