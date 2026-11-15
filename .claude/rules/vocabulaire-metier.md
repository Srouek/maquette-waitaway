# Vocabulaire métier : le glossaire fait foi

Pour parler d'un concept de l'application (acteur, état d'un ticket, moment du parcours, événement), utiliser le terme exact de `docs/02-GLOSSAIRE.md`. Vaut pour le chat, les tickets Notion et les docs.

## 1 concept = 1 mot

Ne pas varier les mots pour éviter une répétition. Un synonyme fait croire à un 2e concept.

- ✗ « exécutant » dans une phrase, « agent » dans la suivante. Le mot est **agent**.
- ✗ « présent » pour dire « confirmé ». **Présent** = physiquement sur place. **Confirmé** = état du ticket après le re-scan. Un client hors file peut être présent sans ticket.
- ✗ « passer devant », « doubler », « prendre quelqu'un d'autre ». Le terme est **prendre un client présent**.

## Scénario = personnes nommées

Dès qu'un scénario implique plusieurs clients, les nommer U0, U1, U2… selon la convention du glossaire, et donner l'état de chacun (en attente, confirmé, en service, hors file).

- ✗ « le 1er de la file n'est pas là, l'agent prend le suivant »
- ✓ « U1 n'a pas confirmé, l'agent prend U2, qui est présent et confirmé »

## Événement = nom + effet visible

Citer un événement avec ce qu'il produit pour la personne qui le reçoit : « `customer.late` (pop-up chez l'agent) », pas `customer.late` seul.

## Terme absent du glossaire

Le signaler, proposer une définition en 1 phrase, et ne l'ajouter au glossaire qu'après accord de l'utilisateur. Ne pas l'utiliser comme s'il était déjà défini.
