# 2026-11-16 : Déploiement de la maquette sur GitHub Pages

## Prochaines étapes

> 1. Ouvrir https://srouek.github.io/maquette-waitaway/ dans un navigateur, sur ordinateur puis sur téléphone, et dérouler les 3 scénarios : le site publié n'a été vérifié qu'en HTTP (page, JavaScript et manifeste en 200), jamais affiché.
> 2. Tester la roulette (`Wheel` dans `src/ui/kit.tsx`) au doigt sur le site publié : elle n'a été pilotée qu'au clic.
> 3. Reprendre les points ouverts du handoff précédent (`handoffs/2026-11-16-0057-scenarios-guides-maquette.md`) : les 3 questions du ticket Notion QA-30, l'alerte de Théo à 13h31 pendant la pause de midi, la note pour E6-7 sur la pause figée, les icônes trop proches à 40 px.
> 4. Pour publier un changement : commiter sur `dev`, puis merger `dev` dans `main` et pousser `main`, uniquement avec l'accord explicite de Gabi pour ce merge-là.

---

## Ticket actif

- Pas de ticket Notion : le déploiement de la maquette n'en a pas.
- Ticket lié créé plus tôt dans la session : QA-30, « Inscription après la fermeture : l'agent accepte ou refuse », statut `Idée`.

## Objectif

- Publier la maquette comme un site statique, depuis un dépôt GitHub public, pour la faire essayer sans être sur le même Wi-Fi que l'ordinateur.
- Travailler sur la branche `dev` et réserver `main` au déploiement.

## Tentatives échouées

- Le push en SSH (`git@github.com:Srouek/maquette-waitaway.git`) a échoué avec `Host key verification failed` : la clé de GitHub n'est pas dans le `known_hosts` du poste. Le remote est donc en HTTPS.
- Le 1er push en HTTPS a été refusé avec `refusing to allow an OAuth App to create or update workflow .github/workflows/deploy.yml without workflow scope` : le jeton `gh` n'avait pas le droit `workflow`. Gabi l'a ajouté avec `gh auth refresh -h github.com -s workflow`.
- Le 1er déploiement a échoué avec `Get Pages site failed` : Pages n'était pas activé. Gabi l'a activé (Settings > Pages > Source = « GitHub Actions »).
- Le 2e déploiement a échoué avec `Branch "main" is not allowed to deploy to github-pages due to environment protection rules` : en activant Pages, GitHub n'avait autorisé que la branche par défaut, `dev`. Gabi a remplacé `dev` par `main` dans Settings > Environments > `github-pages`.

## Tentatives réussies

- `.github/workflows/deploy.yml` ajouté : à chaque push sur `main`, il lance `npm ci` et `npm run build` avec Node 24, puis publie `dist/` sur GitHub Pages avec les actions officielles (`checkout@v7`, `setup-node@v7`, `configure-pages@v6`, `upload-pages-artifact@v5`, `deploy-pages@v5`).
- `README.md` reçoit une section « Déployer », et `CLAUDE.md` la règle des branches : on travaille sur `dev`, `main` ne sert qu'au déploiement, et le merge demande l'accord de Gabi.
- Branche `dev` créée ; le workflow y est commité, puis `dev` est mergée dans `main` en avance rapide.
- Dépôt public https://github.com/Srouek/maquette-waitaway créé par Gabi ; `dev` et `main` y sont poussées et suivent `origin`.
- Le 3e déploiement a réussi (jobs `build` et `deploy` verts) : la maquette est en ligne à https://srouek.github.io/maquette-waitaway/.
- `main` est maintenant la branche par défaut du dépôt.

## Enseignements

- Quand GitHub active Pages, il crée l'environnement `github-pages` et n'y autorise que la branche par défaut du dépôt. Comme `dev` avait été poussée en premier, elle était devenue la branche par défaut, et la règle de publication était à l'envers. Pour un nouveau dépôt : pousser `main` en premier, ou vérifier la règle de l'environnement avant le 1er déploiement.
- Publier un fichier de `.github/workflows/` en HTTPS avec le jeton `gh` demande le droit `workflow`, en plus de `repo`.
- Le build n'a besoin d'aucun réglage pour GitHub Pages : `vite.config.ts` construit déjà avec des chemins relatifs (`base: './'`), et la maquette n'a pas de routeur, donc ni sous-dossier à déclarer ni erreur 404 au rechargement.
- Seule `main` peut publier : c'est la seule branche autorisée sur l'environnement `github-pages` (vérifié par l'API GitHub le 16/11). Un push sur `dev` ne déclenche rien.
