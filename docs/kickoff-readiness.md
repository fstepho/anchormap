# AnchorMap CLI — kickoff-readiness.md

**Statut**: readiness de kickoff v1  
**Date**: 2026-04-18  
**Portée**: ce document matérialise la vérification des gates de démarrage du projet avant l'exécution du premier task produit.

## 1. Objet

Ce document remplace toute lecture implicite non vérifiée pour le démarrage.

Il ne remplace pas :

- `docs/contract.md` pour le comportement observable ;
- `docs/evals.md` pour les gates de vérification ;
- `docs/tasks.md` pour le plan d'exécution ;
- `docs/operating-model.md` pour la définition normative des gates.

## 2. Gate review

| Gate | Statut | Preuves principales | Notes |
| --- | --- | --- | --- |
| Gate A — Brief prêt | Pass | `docs/brief.md` définit l'utilisateur primaire, le problème, la promesse limitée, le scope IN/OUT, les métriques et les kill criteria | Aucune ambiguïté bloquante relevée pour le démarrage de `T1.1` |
| Gate B — Contrat prêt | Pass | `docs/contract.md` fixe les commandes `init` / `map` / `scan`, les profils normatifs, les règles de mutation, les codes de sortie et la sérialisation canonique | Le contrat est suffisamment fermé pour démarrer par le harness |
| Gate C — Evals prêtes | Pass | `docs/evals.md` trace les comportements contractuels vers familles A-F, définit les fixtures B, les goldens, les budgets et les gates A-G de release | Les oracles de frontière requis pour `M1` sont nommés |
| Gate D — Tâches prêtes | Pass | `docs/tasks.md` découpe le plan par milestones, tasks, spikes, dépendances, refs contrat/design/evals et critères de sortie | Les dépendances de spikes et le statut de kickoff sont explicités |
| Gate E — Implémentation prête à démarrer | Pass | Première tâche produit bornée: `T1.1`; composants ciblés identifiés; vérifications minimales nommées; aucun blocking question ouvert pour cette tâche | Les process-doc gaps initiaux ont été refermés dans cette passe |

## 3. Additional kickoff closures recorded in this pass

- `ADR-0002` et `ADR-0003` sont `Accepted`.
- `docs/tasks.md` n'utilise plus de taxonomie dérivée dans ses templates agentiques.
- les références de sections process corrigées dans `docs/tasks.md` pointent vers les sections actuelles de `docs/operating-model.md`.
- `docs/tasks.md` explicite que le milestone graph n'est pas le DAG complet d'exécution.
- la fermeture normative `spike -> ADR -> tâches/design` est explicitée dans `docs/operating-model.md`.

## 4. Non-claims

Ce document ne déclare pas :

- qu'une release candidate existe ;
- que les gates de release de `docs/evals.md` passent ;
- que les spikes structurants `S1`, `S2` et `S4` sont clos ;
- qu'une implémentation produit autre que `T1.1` est prête à être lancée sans lecture ciblée des dépendances documentaires.

## 5. Kickoff decision

Décision de kickoff :

- le projet peut démarrer sur le chemin produit avec `T1.1`;
- les tasks de fermeture documentaire `T0.1`, `T0.2` et `T0.3` doivent être exécutées quand `S1`, `S2` et `S4` auront produit une décision exploitable.
