---
name: review-code
description: Fait relire un changement de la maquette par l'agent code-reviewer et rend sa revue telle quelle, sans rien corriger. Utiliser quand l'utilisateur veut une revue, par exemple "relis mon code", "review", "fais la revue", "lance le code reviewer".
---

## Entrée

- Le **périmètre à relire**, optionnel. Sans précision, les changements non commités, fichiers non suivis compris. S'il n'y en a pas, le dernier commit.
- La **demande** à laquelle le changement répond, si elle est connue de la conversation.

## Sortie

- La **revue de l'agent `code-reviewer`, rendue telle quelle** : le titre de verdict, le tableau des défauts numérotés, l'invitation à demander un numéro.
- Le **détail d'un défaut** quand l'utilisateur en donne le numéro : emplacement, mécanisme, correction proposée.
- Aucune correction, aucun commit.

---

## Comment faire

1. **Rassembler le contexte** que l'agent ne peut pas deviner, et le mettre dans son prompt :
   - le périmètre : par défaut `git diff HEAD` plus les fichiers non suivis de `src/`, `scripts/`, `public/` et `.claude/`, sinon les fichiers ou les commits donnés ;
   - la demande : ce que Gabi a demandé, ou les étapes de scénario qu'il a validées ;
   - les **fichiers les plus risqués**, nommés, avec ce qu'ils font (moteur, forme de l'état, conditions du guide) ;
   - l'**état des vérifications** : `npm run build`, `npm run replay`, et la vérification dans Chrome faite ou non ;
   - les **points déjà connus**, en demandant à l'agent s'il les juge plus graves que nous, plutôt que de les redécouvrir.

2. **Lancer `code-reviewer` une seule fois.** Sa revue est classée par gravité : 2 lancements donnent 2 classements qui ne se recollent pas. Il peut tourner en même temps que `browser-checker` : aucun des 2 ne modifie de fichier.

3. **Rendre la partie « Revue » de son rapport telle quelle**, en commençant par le titre de verdict, sans rien écrire au-dessus. Garder la partie « Détails » pour l'étape suivante.

4. **Donner le détail à la demande.** L'utilisateur donne un numéro, on recopie le détail de ce défaut-là.

5. **Ne corriger que ce que l'utilisateur demande**, défaut par défaut. Après une correction, relancer `npm run build` et `npm run replay`.

## Règles

- **Ne pas reformuler la revue.** Ni résumé, ni tri des défauts qu'on juge importants.
- **Ne pas gonfler une cellule du tableau.** Un paragraphe dans la colonne « Problème » casse l'affichage dans le terminal.
- **Le format appartient à l'agent.** Il est décrit une seule fois, dans `.claude/agents/code-reviewer.md`. Ne pas le redécrire ici.
- **Ne pas défendre son propre code.** Si un défaut semble faux, le dire une fois avec l'argument, sans retirer la ligne du tableau.
- **Ne pas inventer de contexte.** Ce qu'on ne sait pas de la demande ne va pas dans le prompt.
