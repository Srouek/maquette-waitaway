# 2026-11-16 : Rappel personnel, confirmation à 10 min du tour, garde-fou à 10 min et avis avec photo

## Prochaines étapes

> 1. Demander à Gabi s'il veut que le site s'ouvre sur « Client : je m'inscris » au lieu de « Coiffeur : ma journée ». Aujourd'hui, seul le téléphone client de « ma journée » montre l'accueil du scénario client, et Romain n'apparaît qu'à la fin.
> 2. Retouche de mise en page possible : à 360 px, le bouton « Ajouter une photo de ta coupe » du questionnaire passe sur 2 lignes.
> 3. Les docs de QueueAPI (`../queuAPI/queueapi/docs/`) ont encore été modifiées, mais le `.gitignore` de QueueAPI ignore tout le dossier : rien n'y est versionné. La question à Gabi reste ouverte depuis la passation précédente.
> 4. Le code de QueueAPI applique encore l'ancien comportement : rappel `notify.presence` qui invite à confirmer, re-scan sans créneau, `customer.late` à 10 min, garde-fou S14b à 15 min. Le changement est décrit dans QA-35 et QA-1.
> 5. Merger `dev` dans `main` seulement avec l'accord de Gabi pour ce merge-là : chaque push sur `main` publie le site.

---

## Ticket actif

- QA-35 : Rappel personnel et invitation à confirmer 10 min avant le tour (Notion « QueueAPI Tickets », statut Idée, E2-3), créé dans cette session.
- QA-1 : `customer.late` passe de 10 à 5 min avant le tour.
- QA-34 : Questionnaire de satisfaction, complété (salon, coiffeur, coupe, photo).

## Objectif

- Corriger le guide du scénario client de Julien, qui restait bloqué à l'étape 7 quand on enchaînait les scans sans attendre.
- Faire du rappel un simple rappel personnel et n'accepter la confirmation de présence qu'à 10 min du tour.
- Faire viser le poste du coiffeur au bouton Scan une fois la présence confirmée.
- Remplacer la page de garde client de Romain par l'accueil du scénario client.
- Compléter le questionnaire de satisfaction (salon, coiffeur, coupe, commentaire, photo).
- Reporter ces décisions dans le backlog, les docs QueueAPI et Notion, puis tester dans le navigateur.

## Tentatives échouées

- Seuil du garde-fou S14b laissé à 15 min avec une confirmation à 10 min : un client confirmé pouvait toujours scanner le poste, ce qui clôturait la prestation du client précédent encore au fauteuil (vu chez Antoine, Hugo coupé à 10 min de la fin). Le message « pas encore ton tour » n'apparaissait jamais. Gabi a tranché pour 10 min.
- `resize_window` de Claude in Chrome n'a pas réduit la fenêtre (elle est restée à 1383 px). Le test à 360 px s'est fait en chargeant la maquette dans un `<iframe>` de 360 px injecté dans la page.

## Tentatives réussies

- `src/sim/engine.ts` : rappel personnel « Mets-toi en route » au délai du ticket (`Ticket.reminder`), invitation « Confirme ta présence » à 10 min du tour (`Ticket.invitedAt`, `CONFIRM_WINDOW`), re-scan refusé avant par `canConfirm`, avec l'heure d'ouverture.
- `src/sim/engine.ts` : `customer.late` à 5 min du tour (`LATE_AFTER`) et garde-fou du scan du poste à 10 min (`START_GUARD`, dans `canStart`).
- `src/sim/engine.ts` : `nextScan` vise le poste dès que la présence est confirmée. `setReminder` accepte `null` (pas de rappel) et ignore un délai déjà dépassé.
- `src/sim/engine.ts` : l'inscription et le rattachement du walk-in lancent le temps du scénario client (`s.playing = true`).
- `src/client/Account.tsx` : réglage du rappel par − et +, de 20 à 60 min par pas de 5, seulement les délais encore à venir. Panneaux « Mets-toi en route » et « Confirme ta présence ». Un scan refusé s'affiche sous les panneaux.
- `src/sim/salon.ts` : fin de parcours commune refaite (rappel, invitation, confirmation). Les étapes de Julien passent aussi quand le client a avancé seul. Thomas a sa propre étape pour le tour qui avance. Textes de Damien, Maxence et Nicolas ajustés.
- `src/sim/scenarios.ts` : dans « ma journée », le téléphone client ouvre sur l'accueil du scénario client. Le compte de Romain n'est posé qu'à l'étape de sa demande de place.
- `src/client/ClientApp.tsx` et `src/styles.css` : le questionnaire affiche le salon, le coiffeur et la coupe, et accepte une photo (appareil photo avant ou galerie), que l'on peut retirer. L'avis (`Rating` dans `src/sim/types.ts`) enregistre ces informations et `photo: true`, pas l'image.
- `src/sim/store.tsx` : clé de sauvegarde en `waitaway-demo-v7`. `README.md` mis à jour : heure de Théo à 13h50, tableau des coiffeurs, lignes « Ce que la démo montre » et « Écarts ».
- Docs QueueAPI : S16 réécrite, S16ter ajoutée, S14b et S37 modifiées (`03-SCENARIOS.md`). Dans `02-GLOSSAIRE.md`, le terme « Invitation à confirmer » est ajouté, et les termes Rappel, Re-scan, Garde-fou et Questionnaire sont mis à jour. Ajout d'une section « 5 quater » à `09-BACKLOG.md` et d'une décision à `08-ROADMAP.md`.
- Notion : QA-35 créé, QA-1 et QA-34 mis à jour.
- Rejeu en script : les 8 coiffeurs vont au bout dans 3 modes (avec rappel, sans rappel, scans enchaînés sans attendre). « Ma journée » passe 37/37 dans 12 configurations.
- Navigateur : les 8 coiffeurs vont au bout en grand écran et à 360 px, en cliquant dans l'interface.

## Enseignements

- Décisions de Gabi du 16/11/2026, sources `../queuAPI/queueapi/docs/03-SCENARIOS.md` (S14, S16, S16ter, S37) et QA-35 :
  - Le rappel est un simple rappel personnel, de 20 à 60 min.
  - La confirmation de présence se fait entre 10 et 5 min avant le tour.
  - Le scan du poste est refusé s'il reste plus de 10 min, parce que c'est ce scan qui clôt le ticket précédent.
- Gabi ne veut pas mettre en avant le refus du scan du poste dans les scénarios : en vrai, le QR code est sur le fauteuil ou le miroir du coiffeur, et personne ne le scanne trop tôt.
- Pour le questionnaire, la photo est postée par le client depuis son propre téléphone : la question du consentement à la publication ne se pose pas (décision de Gabi, retirée de QA-34).
- Le guide se bloque quand une étape attend un événement qu'un geste du client peut empêcher. Exemple : le démarrage du client clôt la prestation en cours, donc le dépassement attendu n'arrive plus. Chaque condition `until` doit aussi passer quand le client a avancé (confirmé, démarré).
- Les scripts de rejeu sont dans le scratchpad de la session (`salon2.ts` pour les 8 coiffeurs, `jour.ts` pour « ma journée »). On les compile avec esbuild depuis `node_modules` de la maquette.
