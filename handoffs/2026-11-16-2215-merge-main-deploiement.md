# 2026-11-16 : Merge de dev sur main et publication de la maquette sur GitHub Pages

## Prochaines étapes

> 1. Faire trancher par Gabi : la limite des 30 min après la fermeture (QA-30) doit-elle compter les demandes encore en attente ? Avec 25 min de retard le matin et une fin à 19h00, Kylian, Lucas et Romain demandent une place tous les 3 à 18h20. La demande de Romain est calculée sans Lucas, pas encore accepté, et arrive chez le coiffeur. Une fois Lucas accepté, Romain finit à 20h21, soit 51 min après la fermeture.
> 2. Vérifier sur le site publié l'affichage à 900 px et plus : 1 seul téléphone, dans un cadre. Seule la vue étroite (500 px) a été vue dans Chrome.
> 3. Continuer à travailler sur `dev`. Tout futur merge sur `main` demande un nouvel accord explicite de Gabi, donné pour ce merge-là.

---

## Ticket actif

- Aucun ticket Notion : publication de la maquette après les travaux du 16/11 (QA-27, QA-28, QA-31, QA-32, QA-33, S20, scénario client).

## Objectif

- Pousser `dev`, ouvrir la PR vers `main`, la merger avec l'accord de Gabi et vérifier que le site est publié.

## Tentatives échouées

- Aucune.

## Tentatives réussies

- `dev` poussé sur `origin` (https://github.com/Srouek/maquette-waitaway).
- PR #1 `dev` → `main` ouverte (https://github.com/Srouek/maquette-waitaway/pull/1), avec 9 commits, dont ceux de la session « Scenario Client (user) ».
- PR #1 mergée sur `main` avec l'accord de Gabi, par un commit de merge.
- Le workflow « Déployer sur GitHub Pages » (`.github/workflows/deploy.yml`) s'est terminé en succès : la maquette publiée contient la reprise de pause par scan, le retard du coiffeur, la fermeture sans scan, le dépassement S20, le scénario client à 8 coiffeurs et la vue coiffeur seule.

## Enseignements

- Aucun.
