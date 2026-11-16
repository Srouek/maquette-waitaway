# 2026-11-16 : Les scénarios coiffeur ne montrent plus que le téléphone du coiffeur

## Prochaines étapes

> 1. Faire trancher par Gabi : la limite des 30 min après la fermeture (QA-30) doit-elle compter les demandes encore en attente ? Avec 25 min de retard le matin et une fin à 19h00, Kylian, Lucas et Romain demandent une place tous les 3 à 18h20. La demande de Romain est calculée sans Lucas, pas encore accepté, et arrive donc chez le coiffeur. Une fois Lucas accepté, Romain finit à 20h21, soit 51 min après la fermeture.
> 2. Vérifier l'affichage à 900 px et plus : 1 seul téléphone, celui du coiffeur, dans un cadre. Chrome n'a pas pu élargir la fenêtre pendant le test, seule la vue étroite (500 px) a été vue.
> 3. Pousser `dev` seulement quand Gabi le demande (`gp`). Ne pas merger sur `main` sans son accord explicite pour ce merge.

---

## Ticket actif

- Aucun ticket Notion : retour de Gabi sur le scénario « Coiffeur : ma journée ».
- Contexte : S20 (dépassement d'une prestation), lot 2 côté coiffeur, déjà commité.

## Objectif

- Retirer du scénario « ma journée » toute étape qui fait passer sur le téléphone du client. Le coiffeur pilote sa file avec son seul téléphone et n'a jamais accès à l'interface d'un client.
- Garder la demande de Romain (40 min après la fermeture) visible chez le coiffeur quand la fin de journée est à 20h00 ou plus tard.

## Tentatives échouées

- Aucune.

## Tentatives réussies

- `src/sim/scenarios.ts` : Romain n'est plus le téléphone client mais une arrivée simulée (mulet, 40 min, `beforeEnd: 40`, placée juste après Lucas). Fin à 19h00 : il est refusé d'office et le coiffeur ne voit rien. Fin à 20h00 ou plus tard : « Romain demande aussi une place, pour 40 min : accepte ou refuse ».
- `src/sim/scenarios.ts` : étapes « Côté client : Romain veut aussi passer » et « Côté client : c'est le tour de Romain, touche Scan » supprimées. Le guide passe de 37 à 34 étapes.
- `src/sim/scenarios.ts` et `src/sim/salon.ts` : champ `Step.view` supprimé, il ne servait plus qu'à basculer entre 2 téléphones.
- `src/App.tsx` : 1 seul téléphone par scénario, celui du client dans le scénario client et celui du coiffeur dans les autres. Les onglets Client/Coiffeur sur petit écran ont disparu.
- `README.md` et `CLAUDE.md` : mode d'emploi, ligne de Romain dans le tableau de « ma journée » et arborescence mis à jour.
- Rejeu hors navigateur de « ma journée » dans 15 configurations (0, 10 ou 25 min de retard après la pause du matin ; fins de journée 19h00 à 23h00), avec les seuils du dernier commit de l'autre session (scan du poste à 10 min, `customer.late` à 5 min) : 34/34 étapes dans les 15 cas. Gabi a aussi joué le scénario en entier dans le navigateur et le valide.

## Enseignements

- Décision de Gabi : dans un scénario coiffeur, aucune étape ne passe par le téléphone du client, parce que le coiffeur n'a que son téléphone pour piloter sa file. Un geste de client se simule par une arrivée du script. La règle est écrite dans les pièges de `CLAUDE.md`.
- La limite des 30 min après la fermeture est vérifiée au moment de la demande, sur la file telle qu'elle est (`arrive()` dans `src/sim/engine.ts`) : une demande encore en attente de décision n'y compte pas.
