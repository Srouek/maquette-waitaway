# 2026-11-16 : Scénarios guidés de la maquette WaitAway

## Prochaines étapes

> 1. Faire essayer les 3 scénarios à Gabi dans le navigateur (`npm run dev`, menu ⋯) : la dernière série de changements (temps à 2 s par minute, arrêts du temps, walk-in d'Ilyes, demandes après la fermeture, limite de 30 min) n'a été rejouée que par script, jamais à l'écran.
> 2. Tester la roulette (`Wheel` dans `src/ui/kit.tsx`) au doigt sur un vrai téléphone : elle n'a été pilotée qu'au clic.
> 3. Faire trancher les 3 questions ouvertes du ticket Notion QA-30 : le jalon (2 ou 3), les noms des événements, l'écran du client qui rouvre l'application pendant sa demande.
> 4. Faire trancher l'alerte `customer.late` de Théo à 13h31, pendant la pause de midi : avec ▶, le temps s'arrête en pleine pause. La supprimer pendant une pause serait un écart de plus avec S37.
> 5. Proposer à Gabi la note pour E6-7 sur la place figée d'une pause (`beforeTicketId`), qui contredit le backend.
> 6. Améliorer les icônes qui se ressemblent à 40 px : dégradé, taper fade, coupe classique, slick back (`src/ui/icons.tsx`).

---

## Ticket actif

- Pas de ticket Notion pour la maquette : le travail suivait la description des scénarios donnée par Gabi.
- Ticket créé pendant la session : QA-30, « Inscription après la fermeture : l'agent accepte ou refuse », statut `Idée`, estimation 4 h, US E2-1.

## Objectif

- Remplacer les 2 situations libres de la maquette par 3 scénarios guidés : « Coiffeur : ma journée », « Client : je m'inscris », « Coiffeur : je crée mon compte ».
- Montrer au coiffeur les pauses qui glissent ou avancent, le retard d'un client (S37 et S23), les walk-in et la fin de journée.
- Mettre la maquette sous git.

## Tentatives échouées

- Les arrivées aléatoires de clients (`arrivals()`) rendaient les heures du scénario imprévisibles : elles sont remplacées par des arrivées scriptées (`s.script`).
- Une pause recalculée à chaque minute, comme dans QueueAPI, sautait derrière le client dès qu'il passait en position 1 : il a fallu figer le choix (`beforeTicketId` dans `src/sim/engine.ts`).
- Avec Théo en `retard` qui confirmait seul après 8 min, le scénario ne montrait pas un client absent : il est passé en `absent`, qui ne vient jamais.
- Le walk-in pris à l'alerte de 13h31 écourtait la pause de midi de 9 min : la décision est maintenant présentée à la reprise, 13h40.
- Le refus d'office de QA-20 en fin de journée ne correspondait pas au besoin de Gabi : il est remplacé, pour la file du coiffeur, par une demande qu'il accepte ou refuse.

## Tentatives réussies

- `src/sim/` réécrit : `types.ts` (pauses, comptes, scénarios), `catalog.ts` (22 prestations en 3 blocs), `data.ts` (semaine type, pauses par défaut), `engine.ts` (programme de la file par `timeline()`, pauses, walk-in, demandes après la fermeture), `scenarios.ts` (états de départ, arrivées, étapes du guide), `store.tsx` (clé `waitaway-demo-v2`, 1 minute toutes les 2 s).
- Écrans du coiffeur découpés en `src/agent/AgentApp.tsx`, `Onboarding.tsx`, `OpenWizard.tsx` et `Queue.tsx` : connexion par code, création du compte, ouverture en 3 pages, file avec pauses, alerte de retard, walk-in à la roulette, demandes après la fermeture.
- Écrans du client découpés en `src/client/ClientApp.tsx`, `Join.tsx`, `Account.tsx` et `parts.tsx` : prestations par bloc avec favoris, compte Google ou e-mail, page du compte avec bouton Scan, demande en attente.
- `src/ui/icons.tsx` ajouté : 22 icônes de prestation en SVG et les icônes d'interface ; `src/ui/kit.tsx` reçoit la roulette (`Wheel`, `TimeWheel`, `DurationWheel`) et `Stepper`.
- `src/App.tsx` reçoit le bandeau guide sous la barre de démo ; `src/styles.css` passe toutes les couleurs en tokens dans `:root`.
- Le temps démarre à l'ouverture de la file, s'arrête quand le coiffeur doit agir et repart ensuite (`syncClock` dans `engine.ts`) ; « Reprendre ma file » saute à la fin prévue de la pause.
- Scénario « ma journée » : agent « The Best Barber » (bestbarber@barber.fr), Théo absent à 13h40 remplacé par un walk-in, walk-in de 16h15 qui devient Ilyes, Lucas qui demande une place jusqu'à 19h30, Samir refusé d'office à 20h10.
- `README.md` et `CLAUDE.md` réécrits : mode d'emploi des 3 scénarios, tableau des règles, tableau des écarts avec le backlog, arborescence.
- Ticket QA-30 créé dans la base Notion « QueueAPI Tickets ».
- Décision du 16/11 reportée dans `queuAPI/queueapi/docs/` : `09-BACKLOG.md` (suite de QA-20 et §5 bis), `03-SCENARIOS.md` (S43) et `08-ROADMAP.md` (historique).
- `.gitignore` complété (`*.tsbuildinfo`, `.vscode/`, `icon_exemple/`), dépôt initialisé sur `main`, sans remote.

## Enseignements

- Les docs de QueueAPI ne sont pas versionnées : son `.gitignore` fonctionne en liste blanche et exclut `docs/`. Une mise à jour des docs n'a donc rien à commiter.
- La source de vérité de la place d'une pause est `adjustTimeForBreaks` dans `queuAPI/queueapi/src/queue/services/queue.service.ts` : client en position 1, la pause glisse après lui ; plus loin dans la file, elle passe avant lui. S24 ne décrit que le 1er cas.
- Une étape du guide finit dès que sa condition `until` est vraie, et une condition déjà vraie fait sauter l'étape : c'est voulu pour absorber les choix du coiffeur (Théo gardé ou retiré, Lucas accepté ou refusé). C'est aussi écrit dans `CLAUDE.md`, section Pièges.
- Le script de rejeu des scénarios (bundle esbuild de `src/sim/scenarios.ts`, lancé avec node) n'est pas dans le dépôt : il était dans le dossier temporaire de la session et sera à réécrire pour vérifier un changement du moteur.
- Les 2 images de `icon_exemple/` ne viennent pas de la page barberconcept.ch citée par Gabi : leur origine est inconnue, d'où leur exclusion de git.
