---
name: test-scenarios
description: Rejoue les 3 scénarios du guide hors navigateur avec npm run replay, puis explique chaque étape bloquée ou sautée et propose sa correction. Utiliser quand l'utilisateur veut vérifier les scénarios après un changement, par exemple "teste les scénarios", "rejoue la journée", "lance le replay", ou après un changement dans src/sim/.
---

## Entrée

- Les **scénarios concernés** par le changement, optionnel. Sans précision, les 3.
- Le **changement** qui motive le test, s'il est connu de la conversation.

## Sortie

- Le **résultat du rejeu en chiffres**, par scénario : cas terminés sur le total, étapes sautées prévues par `canSkip`.
- Pour chaque **étape bloquée ou sautée sans `canSkip`** :
  - l'étape (numéro et texte) et les cas touchés ;
  - l'origine, vérifiée dans le code : maquette, condition `until` ou script de rejeu ;
  - la correction proposée.
- Aucune correction sans l'accord de l'utilisateur, aucun commit.

---

## Comment faire

1. **Lancer `npm run build`.** Le rejeu passe par esbuild, qui ne vérifie pas les types : une erreur de type ne se voit qu'au build.

2. **Lancer `npm run replay`.** Code de sortie 0 : rendre les lignes du rapport par scénario et s'arrêter là.

3. **Pour chaque échec, lancer `npm run replay -- --detail`** et lire les cas touchés. Chercher ce qu'ils ont en commun (heure de fin, fin de pause du matin, Théo gardé ou retiré).

4. **Trouver l'origine dans le code**, parmi ces 3 :
   - **la maquette** : une règle de `engine.ts` qui produit un état que le guide n'attend pas ;
   - **la condition `until`** de l'étape, ou de celle d'avant : elle est déjà vraie quand l'étape arrive, ou ne le devient jamais ;
   - **le script** `scripts/replay.ts` : il reconnaît certaines étapes à leur texte. Un texte modifié, une nouvelle étape qui demande un geste ou un nouveau coiffeur du scénario client lui font perdre le geste à faire. L'étape reste alors bloquée « 12 h simulées sans finir ».

   Rejouer un seul cas à la main dans le script si la cause n'apparaît pas à la lecture.

5. **Proposer la correction** et attendre l'accord de l'utilisateur avant de l'appliquer.
   - Un saut voulu se marque `canSkip` sur l'étape, avec le cas où il se produit. C'est à l'utilisateur de décider qu'un saut est voulu : `canSkip` cache l'étape au rejeu.
   - Une correction du script (geste, configuration) se dit dans le rapport, avec le geste ajouté.

6. **Après une correction, relancer `npm run replay` et `npm run build`** et donner les nouveaux chiffres.

7. **Rappeler ce que le rejeu ne voit pas** : l'affichage. Proposer le skill `check-in-browser` pour les écrans touchés par le changement.

## Interdits

- Rendre une étape verte en élargissant sa condition `until` sans dire ce que ça change pour la personne devant l'écran.
- Ajouter un `canSkip` sans l'accord de l'utilisateur.
- Annoncer « tout passe » sans avoir lancé le build et le rejeu dans la même session.
