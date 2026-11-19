# 2026-11-19 : Scénario gérant (configuration, tableau de bord, plannings, prestations) et page d'accueil

## Prochaines étapes

> 1. Faire vérifier dans Chrome (skill `check-in-browser`) les dernières corrections de l'étape 11, qui n'ont pas été vues dans un navigateur : ligne de confirmation à la place d'une carte traitée, icône du bloc pour une prestation créée ou proposée, Retour du planning ouvert depuis « À traiter » vers le tableau de bord, choix inverses (refuser « Contour de barbe au fil », valider « Coloration de barbe »).
> 2. Cadrer avec Gabi puis coder (skills `write-scenario` et `write-code`) les 2 écrans gérant restants : le bannissement (E6-10 : motif choisi dans une liste, durée 1 mois, 3 mois ou définitive) et la clôture d'une file sur incident (E6-9).
> 3. Plus tard : partager le questionnaire d'avis de la maquette en 2 (coiffeur, puis salon, E7-1) ; mettre à jour les questions « Ouvert » de `../queuAPI/queueapi/docs/03-SCENARIOS.md` (S25, S26, S29, S36). Aucune mise à jour de Notion n'a été demandée.
> 4. Si les GIF de browser-checker n'arrivent pas dans `~/Downloads` : Chrome attend une confirmation de téléchargement ; Gabi peut l'éviter dans `chrome://settings/downloads` et `chrome://settings/content/automaticDownloads`.

---

## Ticket actif

- Pas de ticket Notion : scénario de démo « Gérant : j'installe mon salon », pour avoir les visuels du gérant avant de coder le front et repérer les épics du back.
- Stories du backlog concernées : E3-0, E3-1, E3-2, E3-3, E3-5, E3-7, E5-2, E6-1, E6-5, E6-13, E6-14, E6-15 (`../queuAPI/queueapi/docs/09-BACKLOG.md`).

## Objectif

- Construire écran par écran le 4e scénario, côté gérant, sur ordinateur (2 colonnes sans cadre à partir de 900 px) et sur mobile.
- Faire de la liste des scénarios la page d'accueil du site.
- Tenir à jour le backlog, le glossaire et la roadmap au fil des décisions de Gabi.

## Tentatives échouées

- Recalculer le tableau de bord sur les coiffeurs « qui coiffent aujourd'hui » (`m.cuts`) : décocher « Je coiffe aussi » effaçait les chiffres passés du gérant. Un coiffeur compte dès qu'il a des chiffres dans l'historique.
- Lier le scénario à Antoine par son e-mail : inviter un autre coiffeur bloquait la suite à « 1 semaine plus tard ». Le scénario suit maintenant le 1er coiffeur invité (`featuredMember`).
- Ramener le gérant à la page de configuration après chaque « Enregistrer » : Gabi voulait enchaîner directement sur l'étape suivante.
- Un `useEffect(() => ref.current?.scrollTo(0, 0))` sans accolades a planté l'écran gérant : dans ce Chrome, `scrollTo()` renvoie une Promise, que React prend pour une fonction de nettoyage (`TypeError: destroy is not a function`).

## Tentatives réussies

- Le scénario gérant compte 11 étapes : bienvenue après l'achat, heures d'ouverture, postes (achat simulé d'une 2e file), prestations du salon, équipe (invitation par lien, rôle Coiffeur ou Gérant, salarié avec volume horaire ou indépendant), Ton planning, QR codes (impression simulée, commande d'affiche ou de kakemono simulée), tableau de bord, planning du coiffeur invité à figer, prestations proposées à valider ou refuser (`src/manager/ManagerApp.tsx`, `src/sim/engine.ts`, `src/sim/scenarios.ts`).
- Chaque « Enregistrer et continuer » ouvre l'étape suivante ; après la configuration, un menu (Tableau de bord, Équipe, Plannings, Mon salon) remplace les étapes, à gauche sur ordinateur et en bas sur mobile.
- Le tableau de bord montre 7 jours d'historique figé (142 clients servis, 18 min d'attente, incidents exclus), arrivé par le saut « 1 semaine plus tard » (`WEEK_HISTORY` dans `src/sim/data.ts`).
- Les plannings refusent un chevauchement sur un même poste (E6-15), avertissent d'un dépassement de volume horaire sans bloquer (E6-13), et se figent ou se rouvrent (E6-14).
- La page d'accueil (`src/App.tsx`) liste les 4 scénarios, propose « Reprendre » quand une étape a été jouée, et arrête le temps au retour.
- Les étapes peuvent avoir un texte et un saut qui dépendent de l'état (`stepText`, `stepJump`, `jumpHidden` dans `src/sim/scenarios.ts`).
- `DayEditor` (`src/agent/Onboarding.tsx`) est partagé avec le gérant : bornes des heures d'ouverture, choix du poste, texte au nom du coiffeur corrigé, ligne entière cliquable.
- Le rejeu (`scripts/replay.ts`) couvre 212 cas, dont 4 cas gérant (1 poste, 2 postes, Yanis indépendant, choix inverses à l'étape 11) ; `npm run build` et `npm run replay` passent (« Tout passe »). Clé de sauvegarde : `waitaway-demo-v20`.
- Backlog, glossaire et roadmap de QueueAPI mis à jour (gitignorés) : stories E3-0, E3-6, E3-7 (affiche ou kakemono payant), E6-13 à E6-16, épic E7 Avis ; termes Abonnement, Planning, Volume horaire.

## Enseignements

- Un `useEffect` ne doit jamais renvoyer la valeur d'un appel : toujours des accolades. Dans le Chrome de Gabi, `Element.scrollTo()` renvoie une Promise (vérifié par browser-checker), ce qui fait planter React.
- Modifier un fichier pendant un test de browser-checker recharge la page et fausse le test : attendre la fin de Chrome avant de lancer code-writer sur le même écran.
- Les GIF de browser-checker « introuvables » étaient dans `~/Downloads`, en attente d'une confirmation de téléchargement dans Chrome (constat de Gabi).
- Le texte d'une étape ne doit pas dépendre d'un prénom saisi par le présentateur : les conditions de fin portent sur un état (1er invité, plus de proposition en attente), la consigne n'est qu'une suggestion.
