# Maquette_WaitAway

Maquette cliquable de WaitAway, à faire essayer à des coiffeurs et barbiers pendant une présentation, sur téléphone ou sur ordinateur.

## Pourquoi ce projet existe

Avant de coder la vraie PWA, il faut vérifier sur le terrain que le parcours tient debout pour un coiffeur et ses clients (étape 4 bis de `../queueFront/process-maquettage-dev-front.md`). Cette maquette montre les 2 côtés, client et coiffeur, sans dépendre de l'avancement de QueueAPI : la file est simulée dans le navigateur, avec les règles du backlog (`../queuAPI/queueapi/docs/09-BACKLOG.md`).

Ce n'est pas le futur front. Le code de simulation sera jeté, mais les écrans, les tokens de style et les textes pourront être repris.

## Ce qui va dans ce repo

Dépôt git, prévu pour un dépôt GitHub public. **On travaille sur `dev`.** `main` ne sert qu'au déploiement : chaque push sur `main` publie le site sur GitHub Pages (`.github/workflows/deploy.yml`). On passe de `dev` à `main` par un merge, seulement avec l'accord explicite de Gabi, donné pour ce merge-là.

**À versionner :**
- le code (`src/`) et les fichiers statiques (`public/`, `index.html`) ;
- la configuration : `package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig.json` ;
- `CLAUDE.md`, `README.md`, `.claude/`, `.github/` et `handoffs/`.

**Hors de git :**
- les fichiers générés : `node_modules/`, `dist/`, `*.tsbuildinfo` ;
- la configuration du poste : `.vscode/`, `.DS_Store` ;
- `icon_exemple/` : images d'un tiers qui ont servi de modèle de style, inutiles au build.

## Arborescence

```
.
├── .claude/
│   ├── rules/                 # règles d'écriture et de git, reprises de QueueAPI
│   └── skills/handoff/        # passation de contexte entre 2 sessions
├── .github/workflows/
│   └── deploy.yml             # build et publication sur GitHub Pages
├── handoffs/                  # fichiers de passation datés
├── public/
│   ├── icon.svg               # icône de l'écran d'accueil
│   └── manifest.webmanifest   # ouverture en plein écran sur téléphone
├── icon_exemple/              # images qui ont servi de modèle de style aux icônes
├── src/
│   ├── sim/
│   │   ├── types.ts           # ticket, pause, file, comptes, état de la simulation
│   │   ├── catalog.ts         # les 22 prestations proposées au coiffeur
│   │   ├── data.ts            # Store, semaine type, pauses par défaut
│   │   ├── engine.ts          # règles métier, sélecteurs, reducer
│   │   ├── scenarios.ts       # les 3 scénarios : état de départ, arrivées, étapes du guide
│   │   ├── salon.ts           # scénario client : 8 coiffeurs, 1 cas chacun, et leurs gestes prévus
│   │   └── store.tsx          # contexte React, lecture auto, sauvegarde locale
│   ├── client/
│   │   ├── ClientApp.tsx      # aiguillage, accueil, prestation en cours, fin
│   │   ├── Join.tsx           # salon, choix des prestations, création du compte
│   │   ├── Account.tsx        # inscription confirmée, compte, présence confirmée
│   │   └── parts.tsx          # ticket et liste de prestations
│   ├── agent/
│   │   ├── AgentApp.tsx       # aiguillage, connexion, file fermée
│   │   ├── Onboarding.tsx     # création du compte : profil, prestations, horaires
│   │   ├── OpenWizard.tsx     # ouverture de la file en 3 pages
│   │   └── Queue.tsx          # file, pauses, alerte de retard, walk-in, fermeture
│   ├── ui/
│   │   ├── icons.tsx          # icônes de prestation et d'interface, en SVG
│   │   └── kit.tsx            # scan simulé, roulette, notifications, panneaux, faux QR code
│   ├── App.tsx                # barre de démo, bandeau guide, le téléphone du scénario
│   ├── main.tsx
│   └── styles.css             # tokens dans :root, puis composants
├── index.html
├── vite.config.ts
├── README.md                  # mode d'emploi pour la présentation
└── CLAUDE.md
```

## Commandes

```bash
npm run dev       # serveur accessible depuis un téléphone sur le même Wi-Fi
npm run build     # vérifie les types et produit dist/
npm run preview   # sert dist/ en local
```

## Règles

- Le vocabulaire du code suit `../queuAPI/queueapi/docs/02-GLOSSAIRE.md` : agent, ticket, file, prestation, confirmé. Les textes affichés parlent comme un salon : « coiffeur », « Ajouter un client », « Retirer de la file ».
- Toute règle métier vit dans `src/sim/engine.ts`, jamais dans un écran. Les écrans lisent l'état par les sélecteurs et agissent par `dispatch`.
- Les temps d'attente viennent tous de `timeline()` : ne pas refaire le calcul ailleurs.
- Une règle de la simulation qui s'écarte du backlog doit le dire dans un commentaire.
- Les couleurs, typos et rayons sont des variables dans `:root` de `src/styles.css`. Pas de couleur en dur ailleurs.
- Mobile d'abord : cibles tactiles de 48 px minimum, tester à 360 px de large.

## Pièges

- L'état est sauvegardé dans le `localStorage` du navigateur. Après un changement dans `src/sim/`, relancer un scénario par le menu ⋯, sinon l'ancien état reste affiché. Si la forme de l'état change, changer la clé `KEY` de `store.tsx`.
- Chaque scénario montre 1 seul téléphone : celui du coiffeur dans les scénarios coiffeur (il pilote sa file avec son seul téléphone, décision de Gabi), celui du client dans le scénario client. Un geste d'un client dans un scénario coiffeur se simule par une arrivée du script, jamais par le téléphone client. À 900 px et plus, le téléphone s'affiche dans un cadre.
- Un scénario est une suite d'étapes dans `src/sim/scenarios.ts`. Chaque étape finit quand sa condition `until` devient vraie. Une condition déjà vraie fait sauter l'étape : écris-la assez précise (un prénom, une heure).
- Les heures du scénario « ma journée » tiennent aux durées du catalogue et aux pauses par défaut. Après un changement dans `catalog.ts` ou `data.ts`, rejoue le scénario en entier.
- Le dépôt est public : n'y mettre aucun secret, ni d'image d'un tiers.
- Les polices viennent de Google Fonts : hors connexion, le navigateur affiche une police système.
