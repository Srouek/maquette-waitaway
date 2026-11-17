---
name: check-in-browser
description: Fait vérifier dans Chrome, par l'agent browser-checker en tâche de fond, l'affichage des écrans touchés par un changement, à 360 px et au-dessus de 900 px, et rend son tableau tel quel. Utiliser quand l'utilisateur veut voir un changement à l'écran, par exemple "vérifie dans Chrome", "teste dans le navigateur", "regarde à 360 px", ou après le skill test-scenarios.
---

## Entrée

- Les **points à vérifier**, optionnel. Sans précision, ceux qui découlent du changement en cours (diff non commité, ou dernier commit) et les points « à vérifier dans le navigateur » de la dernière passation de `handoffs/`.

## Sortie

- Le **résultat de l'agent `browser-checker`, rendu tel quel** : le titre de verdict, le tableau des points (OK, KO, non vérifié) par largeur, le chemin complet de chaque GIF.
- Le **détail d'un point** quand l'utilisateur en donne le numéro.
- Les **erreurs de la console**, s'il y en a.
- Aucune correction, aucun commit.

---

## Comment faire

1. **Écrire la liste des points**, numérotés. Pour chacun : le scénario, l'étape du guide où l'écran apparaît (lire `src/sim/scenarios.ts` ou `src/sim/salon.ts` pour la trouver), ce qui doit s'afficher, et les largeurs (360, 1024 ou les 2). Un point vague donne un « non vérifié » : écrire ce qu'on doit voir, pas « vérifier l'écran X ».

2. **Vérifier le serveur de dev** : `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5173/`. S'il ne répond pas 200, lancer `npm run dev` en tâche de fond.

3. **Lancer `browser-checker` une seule fois, en tâche de fond**, avec la liste des points et l'adresse du serveur. Il n'y a qu'un Chrome : 2 agents en même temps se gênent. Rendre la main à l'utilisateur pendant qu'il tourne.

4. **Rendre la partie « Résultat » de son rapport telle quelle**, en commençant par le titre de verdict. Garder les Détails pour l'étape suivante.

5. **Donner le détail à la demande**, et proposer une correction pour un point KO seulement si l'utilisateur la demande.

6. **Dire si le serveur de dev a été lancé par ce skill**, pour que l'utilisateur sache qu'il tourne encore.

## Règles

- **Ne pas reformuler le tableau** ni trier les points.
- **Le format appartient à l'agent.** Il est décrit une seule fois, dans `.claude/agents/browser-checker.md`.
- **Ce que l'agent marque OK reste à voir par l'utilisateur** : le rappeler s'il s'apprête à commiter sans avoir regardé les GIF ou l'écran.
